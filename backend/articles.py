"""Private article drafts and publication are data changes, independent of frontend releases."""
import json
import re
import sqlite3
import uuid
from datetime import date

from legacy import Rejected
from storage import iso

SLUG = re.compile(r'^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$')


def fields(payload, previous=None):
    if not isinstance(payload,dict):
        raise Rejected(400,'invalid_post','文章格式无效。')
    result=dict(previous or {})
    allowed={'slug','title','description','pubDate','updatedDate','tags','body','heroImage'}
    for key in allowed:
        if key in payload:
            result[key]=payload[key]
    for key in ('slug','title','description','pubDate'):
        if key not in result or not isinstance(result[key],str):
            raise Rejected(400,'invalid_post','请填写标题、简介、日期和文章地址。')
    if not SLUG.fullmatch(result['slug']) or not 1<=len(result['title'].strip())<=200 or len(result['description'])>500:
        raise Rejected(400,'invalid_post','标题、简介或文章地址不符合要求。')
    for key in ('pubDate','updatedDate'):
        value=result.get(key)
        if value is not None:
            try:
                if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',value):
                    raise ValueError()
                date.fromisoformat(value)
            except (TypeError,ValueError):
                raise Rejected(400,'invalid_post','日期需要有效的 YYYY-MM-DD。') from None
    body=result.setdefault('body','')
    if not isinstance(body,str) or len(body)>200000 or '\x00' in body:
        raise Rejected(400,'invalid_post','正文过长或格式无效。')
    try:
        body.encode('utf-8')
    except UnicodeError:
        raise Rejected(400,'invalid_post','正文包含无法读取的字符。') from None
    tags=result.setdefault('tags',[])
    if not isinstance(tags,list) or len(tags)>20 or any(not isinstance(tag,str) or not 1<=len(tag)<=40 for tag in tags):
        raise Rejected(400,'invalid_post','标签格式无效。')
    hero=result.get('heroImage')
    if hero is not None and (not isinstance(hero,str) or not hero.startswith('/neonnexus/') or '..' in hero or len(hero)>300):
        raise Rejected(400,'invalid_post','封面必须使用本站图片地址。')
    return result


def model(row,include_body=True):
    result={'id':row['id'],'slug':row['slug'],'title':row['title'],'description':row['description'],
            'pubDate':row['pub_date'],'tags':json.loads(row['tags']),'visibility':row['visibility'],
            'createdAt':iso(row['created']),'updatedAt':iso(row['updated']),
            'pendingChanges':row['published_revision']!=row['revision']}
    if include_body:
        result['body']=row['body']
    if row['updated_date']:
        result['updatedDate']=row['updated_date']
    if row['hero_image']:
        result['heroImage']=row['hero_image']
    return result


class Articles:
    def __init__(self,store):
        self.store=store

    def list(self,owner=False):
        with self.store.connection() as db:
            if owner:
                rows=db.execute('SELECT * FROM articles WHERE deleted IS NULL ORDER BY pub_date DESC,created DESC').fetchall()
            else:
                rows=db.execute("SELECT json_remove(published_json,'$.body') AS metadata FROM articles WHERE deleted IS NULL AND visibility='public' AND published_json IS NOT NULL").fetchall()
        if owner:
            return [model(row) for row in rows]
        posts=[json.loads(row['metadata']) for row in rows]
        return sorted(posts,key=lambda post:(post['pubDate'],post['createdAt']),reverse=True)

    def get(self,identifier,owner=False):
        with self.store.connection() as db:
            if owner:
                row=db.execute('SELECT * FROM articles WHERE id=? AND deleted IS NULL',(identifier,)).fetchone()
            else:
                candidate=db.execute("SELECT published_json FROM articles WHERE visibility='public' AND deleted IS NULL AND json_extract(published_json,'$.slug')=?",(identifier,)).fetchone()
                if candidate:
                    return json.loads(candidate['published_json'])
                row=None
        if not row:
            raise Rejected(404,'not_found','没有找到这篇文章。')
        return model(row)

    def create(self,payload):
        post=fields(payload)
        identifier=str(uuid.uuid4())
        now=self.store.clock()
        try:
            with self.store.connection() as db:
                db.execute('INSERT INTO articles(id,slug,title,description,pub_date,updated_date,tags,body,hero_image,visibility,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                    (identifier,post['slug'],post['title'],post['description'],post['pubDate'],post.get('updatedDate'),json.dumps(post['tags'],ensure_ascii=False),post['body'],post.get('heroImage'),'draft',now,now))
        except sqlite3.IntegrityError:
            raise Rejected(409,'slug_conflict','这个文章地址已经用过了，请换一个。') from None
        return self.get(identifier,True)

    def update(self,identifier,payload):
        post=fields(payload,self.get(identifier,True))
        try:
            with self.store.connection() as db:
                db.execute('UPDATE articles SET slug=?,title=?,description=?,pub_date=?,updated_date=?,tags=?,body=?,hero_image=?,updated=?,revision=revision+1 WHERE id=? AND deleted IS NULL',
                           (post['slug'],post['title'],post['description'],post['pubDate'],post.get('updatedDate'),json.dumps(post['tags'],ensure_ascii=False),post['body'],post.get('heroImage'),self.store.clock(),identifier))
        except sqlite3.IntegrityError:
            raise Rejected(409,'slug_conflict','这个文章地址已经用过了，请换一个。') from None
        return self.get(identifier,True)

    def visibility(self,identifier,public):
        with self.store.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            current=db.execute('SELECT * FROM articles WHERE id=? AND deleted IS NULL',(identifier,)).fetchone()
            if not current:
                raise Rejected(404,'not_found','没有找到这篇文章。')
            post=model(current)
            if public and not post['body'].strip():
                raise Rejected(400,'empty_post','先写一些正文再发布吧。')
            if public:
                if db.execute("SELECT id FROM articles WHERE visibility='public' AND deleted IS NULL AND id<>? AND json_extract(published_json,'$.slug')=?",(identifier,post['slug'])).fetchone():
                    raise Rejected(409,'slug_conflict','这个地址仍属于另一篇公开文章，请换一个。')
                post.pop('pendingChanges',None)
                post['visibility']='public'
                post['updatedAt']=iso(self.store.clock())
                db.execute("UPDATE articles SET visibility='public',updated=?,published_json=?,published_revision=revision WHERE id=? AND deleted IS NULL",(self.store.clock(),json.dumps(post,ensure_ascii=False),identifier))
                db.execute('DELETE FROM published_media WHERE post_id=?',(identifier,))
                references=set(re.findall(r'/neonnexus/media/([0-9a-f-]{36}\.(?:png|jpg|gif|webp))(?=$|[^A-Za-z0-9._-])',post['body']+' '+(post.get('heroImage') or '')))
                for image in db.execute('SELECT id,filename FROM media WHERE post_id=?',(identifier,)):
                    if image['filename'] in references:
                        db.execute('INSERT INTO published_media VALUES (?,?)',(image['id'],identifier))
            else:
                db.execute("UPDATE articles SET visibility='draft',updated=? WHERE id=? AND deleted IS NULL",(self.store.clock(),identifier))
        return self.get(identifier,True)

    def delete(self,identifier):
        self.get(identifier,True)
        with self.store.connection() as db:
            db.execute("UPDATE articles SET deleted=?,visibility='draft',updated=? WHERE id=?",(self.store.clock(),self.store.clock(),identifier))
