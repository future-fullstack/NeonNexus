"""Capability-authorized private conversations; receipts never confer read access."""
import hashlib
import hmac
import re
import uuid

from legacy import Rejected, parse_submission
from storage import iso


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


class Threads:
    def __init__(self, store):
        self.store = store

    def initial(self,key,message,secret):
        if secret is not None and not re.fullmatch('[0-9a-f]{64}',secret):
            raise Rejected(400,'invalid_secret','取信凭证无效，请刷新后再试。')
        with self.store.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT m.id,m.body_hash,m.thread_id,t.secret_hash FROM messages m JOIN threads t ON t.id=m.thread_id WHERE m.key_hash=?',(digest(key),)).fetchone()
            if row:
                expected=digest(secret) if secret is not None else None
                if row['body_hash']!=digest(message) or row['secret_hash']!=expected or row['id']!=row['thread_id']:
                    raise Rejected(409,'key_conflict','提交内容或取信凭证已改变，请重新提交。')
                return {'ok':True,'receipt':row['id'],'threadId':row['thread_id']},False
            now=self.store.clock()
            if db.execute('SELECT COUNT(*) FROM messages WHERE created>?',(now-3600,)).fetchone()[0]>=100:
                raise Rejected(429,'busy','留言箱暂时有点忙，请稍后再试。')
            receipt=str(uuid.uuid4())
            db.execute('INSERT INTO threads VALUES (?,?,?,?)',(receipt,digest(secret) if secret else None,now,now))
            db.execute('INSERT INTO messages(id,key_hash,body_hash,body,created,thread_id,author) VALUES (?,?,?,?,?,?,?)',
                       (receipt,digest(key),digest(message),message,now,receipt,'visitor'))
            db.execute('INSERT INTO outbox(message_id,due) VALUES (?,?)',(receipt,now))
            return {'ok':True,'receipt':receipt,'threadId':receipt},True

    def require(self,thread_id,secret):
        with self.store.connection() as db:
            row=db.execute('SELECT secret_hash FROM threads WHERE id=?',(thread_id,)).fetchone()
        if (not re.fullmatch('[0-9a-f]{64}',secret or '') or not row or not row['secret_hash']
                or not hmac.compare_digest(row['secret_hash'],digest(secret))):
            raise Rejected(404,'not_found','没有找到这段对话。')

    def get(self,thread_id):
        with self.store.connection() as db:
            thread=db.execute('SELECT * FROM threads WHERE id=?',(thread_id,)).fetchone()
            if not thread:
                raise Rejected(404,'not_found','没有找到这段对话。')
            messages=db.execute('SELECT id,author,body,created FROM messages WHERE thread_id=? ORDER BY created,rowid',(thread_id,)).fetchall()
        return {'id':thread['id'],'createdAt':iso(thread['created']),
                'messages':[{'id':m['id'],'author':m['author'],'body':m['body'],'createdAt':iso(m['created'])} for m in messages]}

    def list(self):
        with self.store.connection() as db:
            rows=db.execute('''SELECT t.*,COUNT(m.id) AS message_count,
                (SELECT body FROM messages last WHERE last.thread_id=t.id ORDER BY created DESC,rowid DESC LIMIT 1) AS preview
                FROM threads t LEFT JOIN messages m ON m.thread_id=t.id GROUP BY t.id ORDER BY t.updated DESC''').fetchall()
        return [{'id':r['id'],'createdAt':iso(r['created']),'updatedAt':iso(r['updated']),
                 'messageCount':r['message_count'],'preview':(r['preview'] or '')[:200],'canReply':bool(r['secret_hash'])} for r in rows]

    def reply(self,thread_id,key,message,author):
        with self.store.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            thread=db.execute('SELECT secret_hash FROM threads WHERE id=?',(thread_id,)).fetchone()
            if not thread or not thread['secret_hash']:
                raise Rejected(404,'not_found','没有找到可回复的对话。')
            row=db.execute('SELECT id,body_hash,thread_id,author FROM messages WHERE key_hash=?',(digest(key),)).fetchone()
            if row:
                if row['body_hash']!=digest(message) or row['thread_id']!=thread_id or row['author']!=author:
                    raise Rejected(409,'key_conflict','提交内容已改变，请重新提交。')
                return {'ok':True,'receipt':row['id'],'threadId':thread_id},False
            now=self.store.clock()
            if author=='visitor' and db.execute("SELECT COUNT(*) FROM messages WHERE created>? AND author='visitor'",(now-3600,)).fetchone()[0]>=100:
                raise Rejected(429,'busy','留言箱暂时有点忙，请稍后再试。')
            receipt=str(uuid.uuid4())
            db.execute('INSERT INTO messages(id,key_hash,body_hash,body,created,thread_id,author) VALUES (?,?,?,?,?,?,?)',
                       (receipt,digest(key),digest(message),message,now,thread_id,author))
            db.execute('UPDATE threads SET updated=? WHERE id=?',(now,thread_id))
            if author=='visitor':
                db.execute('INSERT INTO outbox(message_id,due) VALUES (?,?)',(receipt,now))
            return {'ok':True,'receipt':receipt,'threadId':thread_id},True
