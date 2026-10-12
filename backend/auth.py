"""Password hashing, private sessions and CSRF; no browser credential is stored in plaintext."""
import hashlib
import hmac
import json
import os
import re
import secrets
import threading
from http.cookies import SimpleCookie
from pathlib import Path

from legacy import Rejected

COOKIE = 'neonnexus_owner'


class OwnerAuth:
    def __init__(self, store, path):
        self.store, self.path = store, Path(path)
        self.hash_slots=threading.BoundedSemaphore(2)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.write({'key':secrets.token_hex(32),'password':None})

    def write(self, data):
        temporary = self.path.with_suffix('.next')
        with temporary.open('w', encoding='utf-8') as output:
            output.write(json.dumps(data))
        temporary.chmod(0o600)
        os.replace(temporary, self.path)

    def data(self):
        return json.loads(self.path.read_text(encoding='utf-8'))

    @staticmethod
    def password_record(password):
        if not isinstance(password,str) or not 12 <= len(password) <= 256:
            raise Rejected(400,'invalid_password','密码需要 12 到 256 个字符。')
        salt = secrets.token_bytes(16)
        digest = hashlib.scrypt(password.encode(),salt=salt,n=32768,r=8,p=3,maxmem=67108864).hex()
        return {'salt':salt.hex(),'digest':digest,'n':32768,'r':8,'p':3}

    def check(self, password):
        record = self.data()['password']
        if not record or not isinstance(password,str) or len(password)>256:
            return False
        if not self.hash_slots.acquire(timeout=2):
            raise Rejected(429,'busy','请稍后再试。')
        try:
            result = hashlib.scrypt(password.encode(),salt=bytes.fromhex(record['salt']),n=record.get('n',16384),r=record.get('r',8),p=record.get('p',1),maxmem=67108864).hex()
        finally:
            self.hash_slots.release()
        return hmac.compare_digest(result,record['digest'])

    def set_password(self, password):
        data = self.data()
        data['password'] = self.password_record(password)
        self.write(data)
        with self.store.connection() as db:
            db.execute('DELETE FROM sessions')

    def login(self, password):
        credential=self.data()['password']
        if not credential:
            raise Rejected(503,'owner_unconfigured','管理员入口尚未完成配置。')
        if not self.check(password):
            raise Rejected(401,'unauthorized','密码不正确。')
        token = secrets.token_hex(32)
        now = self.store.clock()
        with self.store.connection() as db:
            db.execute('DELETE FROM sessions WHERE expires<=?',(now,))
            db.execute('INSERT INTO sessions(token_hash,created,expires,credential_version) VALUES (?,?,?,?)',(self.hash(token),now,now+43200,credential['digest']))
        return token

    @staticmethod
    def hash(value):
        return hashlib.sha256(value.encode()).hexdigest()

    def token(self, cookie):
        parsed = SimpleCookie()
        try:
            parsed.load(cookie or '')
            token = parsed[COOKIE].value if COOKIE in parsed else ''
        except Exception:
            token = ''
        if not re.fullmatch('[0-9a-f]{64}',token):
            raise Rejected(401,'unauthorized','请先登录。')
        with self.store.connection() as db:
            row = db.execute('SELECT expires,credential_version FROM sessions WHERE token_hash=?',(self.hash(token),)).fetchone()
        current=self.data()['password']
        if not row or row['expires'] <= self.store.clock() or not current or row['credential_version']!=current['digest']:
            raise Rejected(401,'unauthorized','请先登录。')
        return token

    def csrf(self, token):
        return hmac.new(bytes.fromhex(self.data()['key']),('csrf:'+token).encode(),hashlib.sha256).hexdigest()

    def require_csrf(self, token, supplied):
        if not isinstance(supplied,str) or not hmac.compare_digest(self.csrf(token), supplied):
            raise Rejected(403,'csrf_rejected','页面已过期，请刷新后再试。')

    def logout(self, token):
        with self.store.connection() as db:
            db.execute('DELETE FROM sessions WHERE token_hash=?',(self.hash(token),))

    @staticmethod
    def cookie(token='', expire=False):
        return f'{COOKIE}={token}; Path=/neonnexus/; Max-Age={0 if expire else 43200}; HttpOnly; Secure; SameSite=Strict'
