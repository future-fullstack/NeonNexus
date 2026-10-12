"""SQLite migrations and common transactions, preserving the original message/outbox tables."""
import json
from datetime import datetime, timezone

from legacy import Store as LegacyStore


def iso(moment):
    return datetime.fromtimestamp(moment, timezone.utc).isoformat().replace('+00:00', 'Z')


class Store(LegacyStore):
    def __init__(self, path, clock=None):
        if clock is None:
            super().__init__(path)
        else:
            super().__init__(path, clock)
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            columns = {row['name'] for row in db.execute('PRAGMA table_info(messages)')}
            if 'thread_id' not in columns:
                db.execute('ALTER TABLE messages ADD COLUMN thread_id TEXT')
            if 'author' not in columns:
                db.execute("ALTER TABLE messages ADD COLUMN author TEXT NOT NULL DEFAULT 'visitor'")
            schema='''
                CREATE TABLE IF NOT EXISTS threads (
                    id TEXT PRIMARY KEY,secret_hash TEXT,created REAL NOT NULL,updated REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,created REAL NOT NULL,expires REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS articles (
                    id TEXT PRIMARY KEY,slug TEXT UNIQUE NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,
                    pub_date TEXT NOT NULL,updated_date TEXT,tags TEXT NOT NULL,body TEXT NOT NULL,
                    hero_image TEXT,visibility TEXT NOT NULL DEFAULT 'draft',created REAL NOT NULL,
                    updated REAL NOT NULL,deleted REAL);
                CREATE TABLE IF NOT EXISTS media (
                    id TEXT PRIMARY KEY,post_id TEXT NOT NULL REFERENCES articles(id),mime TEXT NOT NULL,
                    filename TEXT UNIQUE NOT NULL,size INTEGER NOT NULL,created REAL NOT NULL);
                CREATE INDEX IF NOT EXISTS messages_thread_created ON messages(thread_id,created);
                CREATE INDEX IF NOT EXISTS articles_public ON articles(visibility,deleted,pub_date);
            '''
            for statement in schema.split(';'):
                if statement.strip():
                    db.execute(statement)
            if 'credential_version' not in {row['name'] for row in db.execute('PRAGMA table_info(sessions)')}:
                db.execute('ALTER TABLE sessions ADD COLUMN credential_version TEXT')
            article_columns={row['name'] for row in db.execute('PRAGMA table_info(articles)')}
            for name,definition in [('published_json','TEXT'),('revision','INTEGER NOT NULL DEFAULT 0'),('published_revision','INTEGER NOT NULL DEFAULT -1')]:
                if name not in article_columns:
                    db.execute(f'ALTER TABLE articles ADD COLUMN {name} {definition}')
            db.execute('CREATE TABLE IF NOT EXISTS published_media (media_id TEXT PRIMARY KEY REFERENCES media(id),post_id TEXT NOT NULL REFERENCES articles(id))')
            db.execute("SELECT json_extract('{\"supported\":true}','$.supported')")
            db.execute("CREATE INDEX IF NOT EXISTS articles_published_slug ON articles(json_extract(published_json,'$.slug')) WHERE visibility='public' AND deleted IS NULL")
            # Existing public rows receive a snapshot exactly once. Working drafts never enter it.
            for row in db.execute("SELECT * FROM articles WHERE visibility='public' AND published_json IS NULL AND deleted IS NULL").fetchall():
                post={'id':row['id'],'slug':row['slug'],'title':row['title'],'description':row['description'],
                      'pubDate':row['pub_date'],'tags':json.loads(row['tags']),'body':row['body'],'visibility':'public',
                      'createdAt':iso(row['created']),'updatedAt':iso(row['updated'])}
                if row['updated_date']:
                    post['updatedDate']=row['updated_date']
                if row['hero_image']:
                    post['heroImage']=row['hero_image']
                db.execute('UPDATE articles SET published_json=?,published_revision=revision WHERE id=?',(json.dumps(post,ensure_ascii=False),row['id']))
                references=set(__import__('re').findall(r'/neonnexus/media/([0-9a-f-]{36}\.(?:png|jpg|gif|webp))(?=$|[^A-Za-z0-9._-])',row['body']+' '+(row['hero_image'] or '')))
                for item in db.execute('SELECT id,filename FROM media WHERE post_id=?',(row['id'],)):
                    if item['filename'] in references:
                        db.execute('INSERT OR IGNORE INTO published_media VALUES (?,?)',(item['id'],row['id']))
            # Legacy UUIDs remain owner-only: no retrieval secret is manufactured.
            db.execute('INSERT OR IGNORE INTO threads(id,secret_hash,created,updated) SELECT id,NULL,created,created FROM messages WHERE thread_id IS NULL')
            db.execute('UPDATE messages SET thread_id=id WHERE thread_id IS NULL')
            db.execute('PRAGMA user_version=3')

    def save(self, key, message):
        from threads import Threads
        result, created = Threads(self).initial(key, message, None)
        return result['receipt'], created
