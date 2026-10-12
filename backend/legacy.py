"""Original message validation, ephemeral limiter and legacy SQLite schema compatibility."""
import hashlib, hmac, json, re, secrets, sqlite3, threading, time, uuid
from contextlib import contextmanager
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
            db.execute("INSERT INTO messages(id,key_hash,body_hash,body,created) VALUES (?,?,?,?,?)", (receipt, key_hash, body_hash, message, now))
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



from mailer import MailConfig, Outbox, build_mail, send_mail, smtplib
