import base64
import http.client
import json
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path

from articles import Articles
from auth import OwnerAuth
from http_api import Application, PrivateHTTPServer, PREFIX
from legacy import Store as LegacyStore, Rejected
from media import Media
from storage import Store
from threads import Threads

PASSWORD='fixture-password-only-very-long'
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6+8kAAAAASUVORK5CYII=')
POST={'slug':'fixture-post','title':'标题','description':'简介','pubDate':'2026-10-11','tags':['生活'],'body':'private draft text'}


class MigrationTests(unittest.TestCase):
    def test_legacy_message_and_pending_outbox_survive_migration_and_restart(self):
        with tempfile.TemporaryDirectory() as folder:
            path=str(Path(folder)/'messages.sqlite3')
            old=LegacyStore(path)
            receipt,_=old.save('old-request-key','legacy body')
            migrated=Store(path)
            restarted=Store(path)
            with restarted.connection() as db:
                self.assertEqual(db.execute('SELECT body FROM messages WHERE id=?',(receipt,)).fetchone()[0],'legacy body')
                self.assertEqual(db.execute('SELECT COUNT(*) FROM outbox WHERE sent IS NULL').fetchone()[0],1)
                self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0],3)
            self.assertEqual(Threads(restarted).list()[0]['canReply'],False)
            with self.assertRaises(Rejected):
                Threads(migrated).require(receipt,'a'*64)


class CmsHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password_record=OwnerAuth.password_record(PASSWORD)

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.now=100000.0
        self.store=Store(str(Path(self.temp.name)/'messages.sqlite3'),clock=lambda:self.now)
        self.app=Application(self.store,{'https://example.invalid'})
        data=self.app.auth.data(); data['password']=self.password_record; self.app.auth.write(data)
        self.server=PrivateHTTPServer(('127.0.0.1',0),self.app.handler())
        self.worker=threading.Thread(target=self.server.serve_forever,daemon=True); self.worker.start()
        self.cookie=''; self.csrf=''

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.worker.join(); self.temp.cleanup()

    def request(self,path,method='GET',payload=None,owner=False,extra=None,https=True,raw=None):
        headers={'X-Forwarded-Proto':'https' if https else 'http'}
        if method not in ('GET','HEAD'):
            headers.update({'Origin':'https://example.invalid','Content-Type':'application/json'})
        if owner:
            headers.update({'Cookie':self.cookie,'X-CSRF-Token':self.csrf})
        headers.update(extra or {})
        body=raw if raw is not None else (json.dumps(payload,ensure_ascii=False).encode() if payload is not None else None)
        client=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=5)
        client.request(method,path,body=body,headers=headers)
        response=client.getresponse(); result=response.read(); response_headers=dict(response.getheaders())
        client.close()
        if response_headers.get('Content-Type','').startswith('application/json') and result:
            result=json.loads(result)
        return response.status,result,response_headers

    def login(self):
        status,body,headers=self.request(PREFIX+'/owner/login','POST',{'password':PASSWORD})
        self.assertEqual(status,200)
        self.cookie=headers['Set-Cookie'].split(';',1)[0]; self.csrf=body['csrfToken']
        return headers

    def test_tls_cookie_csrf_logout_and_expiry(self):
        self.assertEqual(self.request(PREFIX+'/owner/login','POST',{'password':PASSWORD},https=False)[0],403)
        self.assertEqual(self.request(PREFIX+'/owner/login','POST',{'password':PASSWORD},extra={'Origin':'https://evil.invalid'})[0],403)
        headers=self.login()
        for flag in ('HttpOnly','Secure','SameSite=Strict'):
            self.assertIn(flag,headers['Set-Cookie'])
        self.assertEqual(self.request(PREFIX+'/owner/posts','POST',POST,owner=True,extra={'X-CSRF-Token':'wrong'})[0],403)
        self.assertEqual(self.request(PREFIX+'/owner/session',owner=True)[0],200)
        self.now+=43201
        self.assertEqual(self.request(PREFIX+'/owner/session',owner=True)[0],401)
        self.now-=43201; self.login()
        self.assertEqual(self.request(PREFIX+'/owner/logout','POST',owner=True)[0],200)
        self.assertEqual(self.request(PREFIX+'/owner/session',owner=True)[0],401)

    def test_password_change_revokes_sessions(self):
        self.login()
        status=self.request(PREFIX+'/owner/password','POST',{'currentPassword':PASSWORD,'password':'new-fixture-password-at-least-12'},owner=True)[0]
        self.assertEqual(status,200)
        self.assertEqual(self.request(PREFIX+'/owner/session',owner=True)[0],401)
        self.assertFalse(self.app.auth.check(PASSWORD))
        self.assertTrue(self.app.auth.check('new-fixture-password-at-least-12'))

    def test_draft_publish_edit_unpublish_delete_immediate(self):
        self.login()
        status,result,_=self.request(PREFIX+'/owner/posts','POST',POST,owner=True)
        self.assertEqual(status,201); identifier=result['post']['id']
        self.assertEqual(self.request(PREFIX+'/posts')[1],{'posts':[]})
        self.assertEqual(self.request(PREFIX+'/posts/fixture-post')[0],404)
        self.assertEqual(self.request(PREFIX+'/owner/posts/'+identifier+'/publish','POST',owner=True)[0],200)
        self.assertEqual(self.request(PREFIX+'/posts/fixture-post')[1]['post']['body'],POST['body'])
        self.assertNotIn('body',self.request(PREFIX+'/posts')[1]['posts'][0])
        self.assertEqual(self.request(PREFIX+'/owner/posts/'+identifier,'PUT',{'body':'updated public body'},owner=True)[0],200)
        self.assertEqual(self.request(PREFIX+'/posts/fixture-post')[1]['post']['body'],POST['body'])
        self.assertTrue(self.request(PREFIX+'/owner/posts/'+identifier,owner=True)[1]['post']['pendingChanges'])
        self.assertEqual(self.request(PREFIX+'/owner/posts/'+identifier+'/publish','POST',owner=True)[0],200)
        self.assertEqual(self.request(PREFIX+'/posts/fixture-post')[1]['post']['body'],'updated public body')
        self.assertEqual(self.request(PREFIX+'/owner/posts/'+identifier+'/unpublish','POST',owner=True)[0],200)
        self.assertEqual(self.request(PREFIX+'/posts/fixture-post')[0],404)
        self.assertEqual(self.request(PREFIX+'/owner/posts/'+identifier,'DELETE',owner=True)[0],200)
        self.assertEqual(self.request(PREFIX+'/owner/posts/'+identifier,owner=True)[0],404)

    def test_images_are_private_until_their_post_is_public(self):
        self.login()
        post=self.request(PREFIX+'/owner/posts','POST',POST,owner=True)[1]['post']
        # Build a known valid PNG instead of accepting truncated headers as images.
        import struct,zlib
        def chunk(kind,data):
            return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
        png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\x00\x00\x00\x00'))+chunk(b'IEND',b'')
        headers={'Content-Type':'image/png','X-Post-Id':post['id']}
        status,result,_=self.request(PREFIX+'/owner/media','POST',owner=True,extra=headers,raw=png)
        self.assertEqual(status,201); url=result['url']
        self.assertEqual(self.request(url)[0],404)
        self.assertEqual(self.request(url,owner=True)[0],200)
        self.request(PREFIX+'/owner/posts/'+post['id'],'PUT',{'body':POST['body']+'\n\n![image]('+url+')'},owner=True)
        self.assertEqual(self.request(PREFIX+'/owner/posts/'+post['id']+'/publish','POST',owner=True)[0],200)
        self.assertEqual(self.request(url)[0],200)
        new_url=self.request(PREFIX+'/owner/media','POST',owner=True,extra=headers,raw=png)[1]['url']
        self.assertEqual(self.request(new_url)[0],404)
        self.assertEqual(self.request(new_url,owner=True)[0],200)
        self.assertEqual(self.request(url)[0],200)
        self.assertTrue(self.request(PREFIX+'/owner/posts/'+post['id'],owner=True)[1]['post']['pendingChanges'])
        self.request(PREFIX+'/owner/posts/'+post['id'],'PUT',{'body':POST['body']+'\n\n![old]('+url+')\n\n![new]('+new_url+')'},owner=True)
        self.request(PREFIX+'/owner/posts/'+post['id']+'/publish','POST',owner=True)
        self.assertEqual(self.request(new_url)[0],200)
        self.request(PREFIX+'/owner/posts/'+post['id']+'/unpublish','POST',owner=True)
        self.assertEqual(self.request(url)[0],404)
        self.assertEqual(self.request(PREFIX+'/owner/media','POST',owner=True,extra={'Content-Type':'image/svg+xml','X-Post-Id':post['id']},raw=b'<svg/>')[0],400)
        self.assertEqual(self.request(PREFIX+'/owner/media','POST',owner=True,extra=headers,raw=png[:33])[0],400)
        self.assertEqual(self.request('/neonnexus/media/../../owner-auth.json',owner=True)[0],404)

    def test_unreferenced_media_stays_private_after_publish(self):
        self.login()
        post=self.request(PREFIX+'/owner/posts','POST',POST,owner=True)[1]['post']
        import struct,zlib
        def chunk(kind,data):
            return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
        png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\x00\x00\x00\x00'))+chunk(b'IEND',b'')
        url=self.request(PREFIX+'/owner/media','POST',owner=True,extra={'Content-Type':'image/png','X-Post-Id':post['id']},raw=png)[1]['url']
        self.request(PREFIX+'/owner/posts/'+post['id']+'/publish','POST',owner=True)
        self.assertEqual(self.request(url)[0],404)
        self.assertEqual(self.request(url,owner=True)[0],200)

    def test_slug_date_and_title_remain_published_snapshot_until_publish(self):
        self.login()
        post=self.request(PREFIX+'/owner/posts','POST',POST,owner=True)[1]['post']
        ownerpath=PREFIX+'/owner/posts/'+post['id']
        self.request(ownerpath+'/publish','POST',owner=True)
        self.request(ownerpath,'PUT',{'slug':'new-working-slug','pubDate':'2026-10-12','title':'private working title'},owner=True)
        old=self.request(PREFIX+'/posts/fixture-post')
        self.assertEqual(old[0],200)
        self.assertEqual(old[1]['post']['pubDate'],'2026-10-11')
        self.assertEqual(old[1]['post']['title'],POST['title'])
        self.assertEqual(self.request(PREFIX+'/posts/new-working-slug')[0],404)
        self.assertEqual(self.request(PREFIX+'/posts')[1]['posts'][0]['slug'],'fixture-post')
        self.assertFalse(self.request(ownerpath+'/publish','POST',owner=True)[1]['post']['pendingChanges'])
        self.assertEqual(self.request(PREFIX+'/posts/fixture-post')[0],404)
        new=self.request(PREFIX+'/posts/new-working-slug')[1]['post']
        self.assertEqual(new['title'],'private working title')
        self.assertEqual(new['pubDate'],'2026-10-12')

    def test_secret_only_thread_retries_and_reply_notifications(self):
        secret='a'*64; key='initial-request-123'
        status,result,_=self.request('/neonnexus/api/messages','POST',{'message':'initial','threadSecret':secret},extra={'Idempotency-Key':key})
        self.assertEqual(status,201); identifier=result['threadId']; receipt=result['receipt']
        again=self.request('/neonnexus/api/messages','POST',{'message':'initial','threadSecret':secret},extra={'Idempotency-Key':key})
        self.assertEqual(again[0],200); self.assertEqual(again[1]['receipt'],receipt)
        path=PREFIX+'/threads/'+identifier
        self.assertEqual(self.request(path)[0],404)
        self.assertEqual(self.request(path,extra={'Authorization':'Bearer '+'b'*64})[0],404)
        self.assertEqual(self.request(path,extra={'Authorization':'Bearer '+secret},https=False)[0],403)
        self.assertEqual(self.request(path,extra={'Authorization':'Bearer '+secret})[1]['thread']['messages'][0]['body'],'initial')
        self.login()
        ownerpath=PREFIX+'/owner/threads/'+identifier
        self.assertEqual(self.request(ownerpath,'POST',{'message':'owner reply'},owner=True,extra={'Idempotency-Key':'owner-reply-123'})[0],201)
        self.assertEqual(self.request(ownerpath,'POST',{'message':'owner reply'},owner=True,extra={'Idempotency-Key':'owner-reply-123'})[0],200)
        self.assertEqual(self.request(path,'POST',{'message':'visitor reply'},extra={'Authorization':'Bearer '+secret,'Idempotency-Key':'visitor-reply-123'})[0],201)
        with self.store.connection() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM messages').fetchone()[0],3)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM outbox').fetchone()[0],2)
            self.assertEqual(db.execute('SELECT secret_hash FROM threads').fetchone()[0],__import__('hashlib').sha256(secret.encode()).hexdigest())
        self.assertEqual(self.request(path,extra={'Authorization':'Bearer '+secret})[1]['thread']['messages'][1]['author'],'owner')

    def test_login_rate_limit_and_unknown_private_paths(self):
        for _ in range(5):
            self.assertEqual(self.request(PREFIX+'/owner/login','POST',{'password':'wrong'})[0],401)
        self.assertEqual(self.request(PREFIX+'/owner/login','POST',{'password':'wrong'})[0],429)
        for path in ('/admin','/.env','/messages.sqlite3','/neonnexus/api/v1/threads','/neonnexus/api/v1/owner-auth.json'):
            self.assertIn(self.request(path)[0],(401,404))


if __name__=='__main__':
    unittest.main()
