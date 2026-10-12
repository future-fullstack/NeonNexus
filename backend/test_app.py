import http.client
import json
import smtplib
import tempfile
import threading
import unittest
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer
from pathlib import Path

from app import Limiter, MailConfig, Outbox, Rejected, Store, build_mail, handler_for, parse_submission, send_mail

KEY = "test-request-key-123"


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = str(Path(self.temp.name)/"messages.sqlite3")
        self.now = 100000.0
        self.store = Store(self.path, clock=lambda: self.now)

    def tearDown(self):
        self.temp.cleanup()

    def test_validation(self):
        for raw in [b"{", b"[]", b'{"message":1}', b'{"message":"   "}',
                    json.dumps({"message": "字"*2001}).encode(), b'{"message":"\\u0000"}',
                    b'{"message":"\\ud800"}', b'x'*12289]:
            with self.subTest(raw=raw[:20]), self.assertRaises(Rejected):
                parse_submission(raw, KEY)
        self.assertEqual(parse_submission(b'{"message":" hello ","website":""}', KEY), ("hello", False))

    def test_idempotency_persists_after_restart_and_conflicts(self):
        first, created = self.store.save(KEY, "一封信")
        self.assertTrue(created)
        restarted = Store(self.path)
        self.assertEqual(restarted.save(KEY, "一封信"), (first, False))
        with self.assertRaises(Rejected) as error:
            restarted.save(KEY, "不同内容")
        self.assertEqual(error.exception.status, 409)
        with restarted.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM messages").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0], 1)

    def test_concurrent_retries_only_create_one_row(self):
        with ThreadPoolExecutor(max_workers=5) as pool:
            results = list(pool.map(lambda _: self.store.save(KEY, "hello"), range(10)))
        self.assertEqual(len({receipt for receipt, _ in results}), 1)
        self.assertEqual(sum(created for _, created in results), 1)

    def test_smtp_failure_saved_retry_and_no_resend_after_success(self):
        receipt, _ = self.store.save(KEY, "<script>alert('x')</script>")
        config = MailConfig("smtp.example.invalid", 465, "user", "not-a-real-password",
                            "sender@example.invalid", "owner@example.invalid")
        calls = []
        def sender(_config, row):
            calls.append(row["id"])
            if len(calls) == 1:
                raise smtplib.SMTPAuthenticationError(535, b"untrusted provider text")
        box = Outbox(self.store, config, sender)
        self.assertTrue(box.once())
        with self.store.connection() as db:
            row = db.execute("SELECT * FROM outbox").fetchone()
            self.assertIsNone(row["sent"])
            self.assertEqual(row["last_error"], "SMTPAuthenticationError")
            self.assertEqual(db.execute("SELECT body FROM messages").fetchone()[0], "<script>alert('x')</script>")
        self.assertFalse(box.once())
        self.now += 31
        # A new worker after service restart picks up the durable queue.
        self.assertTrue(Outbox(Store(self.path, clock=lambda: self.now), config, sender).once())
        self.assertFalse(box.once())
        self.assertEqual(calls, [receipt, receipt])
        with self.store.connection() as db:
            row = db.execute("SELECT * FROM messages").fetchone()
            email = build_mail(config, row)
        self.assertEqual(email.get_content_type(), "text/plain")
        self.assertIn("<script>", email.get_content())
        self.assertEqual(email["To"], "owner@example.invalid")
        self.assertEqual(email["Message-ID"], f"<{receipt}@example.invalid>")

    def test_unconfigured_mail_still_keeps_message(self):
        self.store.save(KEY, "not lost")
        self.assertTrue(Outbox(self.store, MailConfig()).once())
        with self.store.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM messages").fetchone()[0], 1)
            self.assertIsNone(db.execute("SELECT sent FROM outbox").fetchone()[0])

    def test_from_display_name_and_smtp_quit_after_accepted_data(self):
        with patch.dict("os.environ", {"SMTP_HOST":"smtp.example.invalid", "SMTP_USERNAME":"user",
                "SMTP_PASSWORD":"fake", "SMTP_FROM":"Example <sender@example.invalid>",
                "MESSAGE_RECIPIENT":"owner@example.invalid"}):
            config = MailConfig.from_env()
        self.assertTrue(config.configured())
        self.assertEqual(config.sender, "sender@example.invalid")
        self.store.save(KEY, "验收")
        with self.store.connection() as db:
            row = db.execute("SELECT * FROM messages").fetchone()
        with patch("app.smtplib.SMTP_SSL") as factory:
            factory.return_value.send_message.return_value = {}
            factory.return_value.quit.side_effect = smtplib.SMTPServerDisconnected()
            send_mail(config, row)
            factory.return_value.send_message.assert_called_once()
            factory.return_value.close.assert_called_once()

    def test_limit_does_not_persist_ip_and_expires(self):
        limiter = Limiter(clock=lambda: self.now, limit=1)
        self.assertTrue(limiter.allow("192.0.2.1"))
        self.assertFalse(limiter.allow("192.0.2.1"))
        self.assertNotIn("192.0.2.1", repr(limiter.entries))
        self.now += 601
        self.assertTrue(limiter.allow("192.0.2.1"))


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(str(Path(self.temp.name)/"messages.sqlite3"))
        self.server = ThreadingHTTPServer(("127.0.0.1", 0),
            handler_for(self.store, {"http://example.invalid"}, Limiter(limit=2)))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, method="POST", data=None, origin="http://example.invalid", key=KEY, path="/neonnexus/api/messages"):
        client = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=2)
        body = None if method in ("GET", "HEAD") else json.dumps(data or {"message": "hello", "website": ""}).encode()
        headers = {"Content-Type": "application/json", "Idempotency-Key": key}
        if origin is not None:
            headers["Origin"] = origin
        client.request(method, path, body=body, headers=headers)
        response = client.getresponse()
        raw = response.read()
        result = response.status, json.loads(raw) if raw else None
        client.close()
        return result

    def test_no_public_read_or_admin(self):
        for path in ["/neonnexus/api/messages", "/messages", "/admin", "/messages.sqlite3"]:
            self.assertEqual(self.request("GET", path=path)[0], 404)
            self.assertEqual(self.request("HEAD", path=path), (404, None))

    def test_http_validation_rejects_without_storage(self):
        for body, content_type, expected in [(b"{", "application/json", 400),
                (b'{"message":" "}', "application/json", 400),
                (json.dumps({"message":"x"*2001}).encode(), "application/json", 400),
                (b'{"message":"hello"}', "text/plain", 415)]:
            client = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=2)
            client.request("POST", "/neonnexus/api/messages", body=body, headers={
                "Origin":"http://example.invalid", "Content-Type":content_type,
                "Idempotency-Key":KEY})
            response = client.getresponse()
            self.assertEqual(response.status, expected)
            self.assertFalse(json.loads(response.read())["ok"])
            client.close()
        with self.store.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM messages").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0], 0)

    def test_same_origin_and_saved_receipt(self):
        for origin in ["http://evil.invalid", None]:
            self.assertEqual(self.request(origin=origin)[0], 403)
        status, result = self.request()
        self.assertEqual(status, 201)
        self.assertTrue(result["ok"])
        self.assertNotIn("hello", json.dumps(result))
        again = self.request()
        self.assertEqual(again[0], 200)
        self.assertEqual(again[1]["receipt"], result["receipt"])

    def test_honeypot_not_saved_and_rate_limits_new_submissions(self):
        self.assertEqual(self.request(data={"message":"bot", "website":"spam.invalid"})[0], 201)
        with self.store.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM messages").fetchone()[0], 0)
        self.assertEqual(self.request(key="request-1")[0], 201)
        self.assertEqual(self.request(key="request-2")[0], 201)
        self.assertEqual(self.request(key="request-3")[0], 429)
        # Successful retry remains usable even when the new-message rate limit is reached.
        self.assertEqual(self.request(key="request-1")[0], 200)

    def test_excessive_content_length_does_not_crash_request(self):
        client = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=2)
        client.request("POST", "/neonnexus/api/messages", body=b"{}", headers={
            "Origin":"http://example.invalid", "Content-Type":"application/json",
            "Idempotency-Key":KEY, "Content-Length":"9"*5000})
        response = client.getresponse()
        self.assertEqual(response.status, 413)
        self.assertEqual(json.loads(response.read())["code"], "too_large")
        client.close()


if __name__ == "__main__":
    unittest.main()
