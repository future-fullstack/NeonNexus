"""Independent durable SMTP notifications; never stores visitor retrieval secrets."""
import os, re, smtplib, ssl, threading
from dataclasses import dataclass
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import parseaddr

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
    mail.set_content(f"有人向你的私人留言箱投递了文字。\n\n时间（北京）：{moment}\n回执：{row['id']}\n\n{row['body']}\n\n后台留言箱：https://39.96.71.56/neonnexus/admin/\n")
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
