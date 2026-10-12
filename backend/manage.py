"""Server-only inspection and consistent SQLite backups; never an HTTP admin interface."""
import argparse
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["list", "read", "backup", "status"])
    parser.add_argument("argument", nargs="?")
    args = parser.parse_args()
    path = os.getenv("MESSAGE_DB", "/data/messages.sqlite3")
    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    if args.action == "list":
        for row in db.execute("SELECT id,created FROM messages ORDER BY created DESC LIMIT 20"):
            print(row["id"], datetime.fromtimestamp(row["created"], timezone.utc).isoformat())
    elif args.action == "read":
        row = db.execute("SELECT body FROM messages WHERE id=?", (args.argument,)).fetchone()
        if row:
            print(row["body"])
    elif args.action == "status":
        print("saved", db.execute("SELECT COUNT(*) FROM messages").fetchone()[0])
        print("pending", db.execute("SELECT COUNT(*) FROM outbox WHERE sent IS NULL").fetchone()[0])
        print("smtp_accepted", db.execute("SELECT COUNT(*) FROM outbox WHERE sent IS NOT NULL").fetchone()[0])
        for row in db.execute("SELECT attempts,last_error FROM outbox WHERE sent IS NULL"):
            print("retry", row["attempts"], row["last_error"] or "waiting")
    elif args.action == "backup":
        if not args.argument:
            parser.error("backup needs an absolute destination on the private data mount")
        target = Path(args.argument)
        if not target.is_absolute() or target.exists():
            parser.error("backup destination must be absolute and new")
        target.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(target) as backup:
            db.backup(backup)
        target.chmod(0o600)
        print("Backup created")
    db.close()


if __name__ == "__main__":
    main()
