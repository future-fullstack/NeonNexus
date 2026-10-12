"""Private message storage and an independent, durable SMTP outbox. No third-party modules."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import smtplib
import sqlite3
import ssl
import threading
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import parseaddr
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_MESSAGE = 2000
MAX_BODY = 12288
KEY_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,128}$")


class Rejected(Exception):
    def __init__(self, status, code, message):
        super().__init__(code)
        self.status, self.code, self.message = status, code, message


def parse_submission(raw: bytes, key: str):
    if len(raw) > MAX_BODY:
        raise Rejected(413, "too_large", "留言太长了，请缩短后再试。")
    if not KEY_PATTERN.fullmatch(key):
        raise Rejected(400, "invalid_key", "提交标识无效，请刷新页面再试。")
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeError):
        raise Rejected(400, "invalid_json", "留言格式无效，请重新提交。") from None
    if not isinstance(payload, dict) or not isinstance(payload.get("message"), str):
        raise Rejected(400, "invalid_message", "请写下留言。")
    message = payload["message"].strip()
    if not message or len(message) > MAX_MESSAGE:
        raise Rejected(400, "invalid_message", "留言需要 1 到 2000 个字。")
    try:
        message.encode("utf-8")
    except UnicodeError:
        raise Rejected(400, "invalid_message", "留言包含无法读取的字符。") from None
    if any(ord(char) < 32 and char not in "\n\r\t" for char in message):
        raise Rejected(400, "invalid_message", "留言包含无法读取的字符。")
    website = payload.get("website", "")
    if not isinstance(website, str):
        raise Rejected(400, "invalid_message", "留言格式无效。")
    return message, bool(website.strip())


class Store:
    def __init__(self, path: str, clock=time.time):
        self.path, self.clock = path, clock
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY, key_hash TEXT UNIQUE NOT NULL,
                    body_hash TEXT NOT NULL, body TEXT NOT NULL, created REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS outbox (
                    message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
                    attempts INTEGER NOT NULL DEFAULT 0, due REAL NOT NULL,
                    sent REAL, last_error TEXT
                );
            """)

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                yield db
        finally:
            db.close()

    def previous(self, key, message):
        key_hash = hashlib.sha256(key.encode()).hexdigest()
        body_hash = hashlib.sha256(message.encode()).hexdigest()
        with self.connection() as db:
            row = db.execute("SELECT id,body_hash FROM messages WHERE key_hash=?", (key_hash,)).fetchone()
        if not row:
            return None
        if not hmac.compare_digest(row["body_hash"], body_hash):
            raise Rejected(409, "key_conflict", "内容已经改变，请重新提交。")
        return row["id"]

    def save(self, key, message):
        key_hash = hashlib.sha256(key.encode()).hexdigest()
        body_hash = hashlib.sha256(message.encode()).hexdigest()
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT id,body_hash FROM messages WHERE key_hash=?", (key_hash,)).fetchone()
            if row:
                if not hmac.compare_digest(row["body_hash"], body_hash):
                    raise Rejected(409, "key_conflict", "内容已经改变，请重新提交。")
                return row["id"], False
            recent = db.execute("SELECT COUNT(*) FROM messages WHERE created>?", (self.clock()-3600,)).fetchone()[0]
            if recent >= 100:
                raise Rejected(429, "busy", "留言箱暂时有点忙，请稍后再试。")
            receipt = str(uuid.uuid4())
            now = self.clock()
            db.execute("INSERT INTO messages VALUES (?,?,?,?,?)", (receipt, key_hash, body_hash, message, now))
            db.execute("INSERT INTO outbox(message_id,due) VALUES (?,?)", (receipt, now))
            return receipt, True


class Limiter:
    """Ephemeral salted client hashes only: no IP or visitor identity is persisted."""
    def __init__(self, clock=time.time, limit=5, window=600):
        self.clock, self.limit, self.window = clock, limit, window
        self.salt, self.entries, self.lock = secrets.token_bytes(32), {}, threading.Lock()

    def allow(self, address):
        token = hmac.new(self.salt, address.encode(), hashlib.sha256).digest()
        now = self.clock()
        with self.lock:
            self.entries = {key: [t for t in times if t > now-self.window]
                            for key, times in self.entries.items() if times and times[-1] > now-self.window}
            times = self.entries.get(token, [])
            if len(times) >= self.limit or (token not in self.entries and len(self.entries) >= 4096):
                return False
            self.entries[token] = times + [now]
        return True


@dataclass
class MailConfig:
    host: str = ""
    port: int = 465
    username: str = ""
    password: str = ""
    sender: str = ""
    recipient: str = ""
    mode: str = "ssl"

    @classmethod
    def from_env(cls):
        raw_sender = os.getenv("SMTP_FROM", "")
        sender = parseaddr(raw_sender)[1] if not any(char in raw_sender for char in "\r\n") else ""
        return cls(os.getenv("SMTP_HOST", ""), int(os.getenv("SMTP_PORT", "465")),
                   os.getenv("SMTP_USERNAME", ""), os.getenv("SMTP_PASSWORD", ""),
                   sender, os.getenv("MESSAGE_RECIPIENT", ""),
                   os.getenv("SMTP_MODE", "ssl"))

    def configured(self):
        addresses = (self.sender, self.recipient)
        return (bool(self.host and self.username and self.password)
                and self.mode in ("ssl", "starttls")
                and all(re.fullmatch(r"[^\s<>,;@]+@[^\s<>,;@]+", value) for value in addresses))


def build_mail(config, row):
    mail = EmailMessage()
    mail["Subject"] = "NeonNexus · 收到一封新留言"
    mail["From"], mail["To"] = config.sender, config.recipient
    mail["Message-ID"] = f"<{row['id']}@{config.sender.rsplit('@', 1)[-1]}>"
    from datetime import timedelta
    moment = datetime.fromtimestamp(row["created"], timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M:%S")
    mail.set_content(f"有人向你的私人留言箱投递了文字。\n\n时间（北京）：{moment}\n回执：{row['id']}\n\n{row['body']}\n")
    return mail


def send_mail(config, row):
    context = ssl.create_default_context()
    if config.mode == "ssl":
        smtp = smtplib.SMTP_SSL(config.host, config.port, timeout=20, context=context)
    else:
        smtp = smtplib.SMTP(config.host, config.port, timeout=20)
        smtp.ehlo()
        smtp.starttls(context=context)
        smtp.ehlo()
    try:
        smtp.login(config.username, config.password)
        refused = smtp.send_message(build_mail(config, row), from_addr=config.sender, to_addrs=[config.recipient])
        if refused:
            raise smtplib.SMTPException("recipient_refused")
    finally:
        # QUIT failures after accepted DATA must not turn a successful send into a retry.
        try:
            smtp.quit()
        except (OSError, smtplib.SMTPException):
            smtp.close()


class Outbox:
    def __init__(self, store, config, sender=send_mail):
        self.store, self.config, self.sender = store, config, sender
        self.lock = threading.Lock()

    def once(self):
        with self.lock:
            with self.store.connection() as db:
                row = db.execute("""SELECT m.*,o.attempts FROM messages m JOIN outbox o ON m.id=o.message_id
                                    WHERE o.sent IS NULL AND o.due<=? ORDER BY o.due LIMIT 1""",
                                 (self.store.clock(),)).fetchone()
            if row is None:
                return False
            try:
                if not self.config.configured():
                    raise RuntimeError("mail_unconfigured")
                self.sender(self.config, row)
            except Exception as error:
                attempts = row["attempts"] + 1
                delay = min(3600, 30 * 2 ** min(attempts-1, 7))
                # Only a class name, never the SMTP error response, body, recipient or credentials.
                with self.store.connection() as db:
                    db.execute("UPDATE outbox SET attempts=?,due=?,last_error=? WHERE message_id=?",
                               (attempts, self.store.clock()+delay, type(error).__name__, row["id"]))
            else:
                with self.store.connection() as db:
                    db.execute("UPDATE outbox SET sent=?,last_error=NULL WHERE message_id=?",
                               (self.store.clock(), row["id"]))
            return True

    def run(self, stop):
        while not stop.is_set():
            try:
                active = self.once()
            except sqlite3.Error:
                active = False
            stop.wait(1 if active else 5)


def handler_for(store, origins, limiter):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *_args):
            pass

        def reply(self, status, payload):
            content = json.dumps(payload, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Connection", "close")
            if status == 429:
                self.send_header("Retry-After", "600")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(content)
            self.close_connection = True

        def do_GET(self):
            self.reply(404, {"ok": False, "code": "not_found"})

        do_HEAD = do_GET
        do_OPTIONS = do_GET
        do_PUT = do_GET
        do_DELETE = do_GET

        def do_POST(self):
            try:
                if self.path != "/neonnexus/api/messages":
                    raise Rejected(404, "not_found", "这个入口不存在。")
                if self.headers.get("Origin") not in origins:
                    raise Rejected(403, "origin_rejected", "请从本站留言页面提交。")
                if self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/json":
                    raise Rejected(415, "invalid_type", "留言格式无效。")
                length = self.headers.get("Content-Length", "")
                if len(length) > 5 or not length.isdigit() or int(length) > MAX_BODY:
                    raise Rejected(413, "too_large", "留言太长了，请缩短后再试。")
                self.connection.settimeout(10)
                message, bot = parse_submission(self.rfile.read(int(length)), self.headers.get("Idempotency-Key", ""))
                if bot:
                    self.reply(201, {"ok": True, "receipt": str(uuid.uuid4())})
                    return
                key = self.headers["Idempotency-Key"]
                previous = store.previous(key, message)
                if previous:
                    self.reply(200, {"ok": True, "receipt": previous})
                    return
                address = self.headers.get("X-Real-IP", self.client_address[0])
                if not limiter.allow(address):
                    raise Rejected(429, "rate_limited", "请稍等一会儿再投递。")
                receipt, created = store.save(key, message)
                self.reply(201 if created else 200, {"ok": True, "receipt": receipt})
            except Rejected as error:
                self.reply(error.status, {"ok": False, "code": error.code, "message": error.message})
            except (OSError, sqlite3.Error):
                self.reply(503, {"ok": False, "code": "unavailable", "message": "暂时没能保存，请稍后再试。"})
    return Handler


class PrivateHTTPServer(ThreadingHTTPServer):
    def handle_error(self, _request, _address):
        # BaseServer's default traceback includes a client address. Keep logs anonymous.
        print("request_failed", flush=True)


def main():
    os.umask(0o077)
    store = Store(os.getenv("MESSAGE_DB", "/data/messages.sqlite3"))
    origins = set(filter(None, os.getenv("ALLOWED_ORIGINS", "").split(",")))
    if not origins:
        raise RuntimeError("ALLOWED_ORIGINS must be configured")
    stop = threading.Event()
    worker = threading.Thread(target=Outbox(store, MailConfig.from_env()).run, args=(stop,), daemon=True)
    worker.start()
    server = PrivateHTTPServer(("0.0.0.0", 8091), handler_for(store, origins, Limiter()))
    server.daemon_threads = True
    try:
        server.serve_forever()
    finally:
        stop.set()
        server.server_close()


if __name__ == "__main__":
    main()
