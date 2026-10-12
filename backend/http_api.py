"""Explicit public, owner, and capability-authorized routes; secrets never enter logs."""
import json
import re
import sqlite3
import uuid
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from articles import Articles
from auth import OwnerAuth
from legacy import Limiter, Rejected, parse_submission
from media import MAX_IMAGE, Media
from threads import Threads, digest

PREFIX='/neonnexus/api/v1'


class Application:
    def __init__(self,store,origins,limiter=None,require_tls=True):
        self.store,self.origins,self.require_tls=store,set(origins),require_tls
        self.limiter=limiter or Limiter(clock=store.clock)
        self.logins=Limiter(clock=store.clock,limit=5)
        self.global_logins=Limiter(clock=store.clock,limit=30)
        base=Path(store.path).parent
        self.auth=OwnerAuth(store,str(base/'owner-auth.json'))
        self.articles=Articles(store)
        self.threads=Threads(store)
        self.media=Media(store,self.articles,str(base/'media'))

    def handler(self):
        app=self
        class Handler(BaseHTTPRequestHandler):
            protocol_version='HTTP/1.1'
            def log_message(self,*_args):
                pass

            def reply(self,status,payload=None,headers=None,body=None,mime='application/json; charset=utf-8'):
                if body is None:
                    body=json.dumps(payload,ensure_ascii=False).encode()
                self.send_response(status)
                for key,value in {'Content-Type':mime,'Content-Length':str(len(body)),
                                  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
                                  'Connection':'close',**(headers or {})}.items():
                    self.send_header(key,value)
                if status==429:
                    self.send_header('Retry-After','600')
                self.end_headers()
                if self.command!='HEAD':
                    self.wfile.write(body)
                self.close_connection=True

            def origin(self):
                if self.headers.get('Origin') not in app.origins:
                    raise Rejected(403,'origin_rejected','请从本站页面提交。')

            def secure(self):
                if app.require_tls and self.headers.get('X-Forwarded-Proto')!='https':
                    raise Rejected(403,'https_required','请使用 HTTPS 打开本站。')

            def owner(self,mutation=False):
                self.secure()
                token=app.auth.token(self.headers.get('Cookie'))
                if mutation:
                    self.origin()
                    app.auth.require_csrf(token,self.headers.get('X-CSRF-Token'))
                return token

            def visitor(self,thread_id):
                self.secure()
                authorization=self.headers.get('Authorization','')
                secret=authorization[7:] if authorization.startswith('Bearer ') else ''
                app.threads.require(thread_id,secret)

            def raw(self,maximum=1048576):
                length=self.headers.get('Content-Length','')
                if self.headers.get('Transfer-Encoding') or not re.fullmatch(r'[0-9]{1,7}',length) or int(length)>maximum:
                    raise Rejected(413,'too_large','提交内容太长了。')
                self.connection.settimeout(10)
                body=self.rfile.read(int(length))
                if len(body)!=int(length):
                    raise Rejected(400,'invalid_body','提交内容不完整，请重试。')
                return body

            def json(self,maximum=1048576):
                if self.headers.get('Content-Type','').split(';',1)[0].strip().lower()!='application/json':
                    raise Rejected(415,'invalid_type','提交格式无效。')
                try:
                    payload=json.loads(self.raw(maximum).decode('utf-8'))
                except (ValueError,UnicodeError):
                    raise Rejected(400,'invalid_json','提交格式无效。') from None
                if not isinstance(payload,dict):
                    raise Rejected(400,'invalid_json','提交格式无效。')
                return payload

            def message(self,payload):
                key=self.headers.get('Idempotency-Key','')
                body,bot=parse_submission(json.dumps(payload).encode(),key)
                return key,body,bot

            def rate(self,key,body,thread_id=None,author='visitor'):
                with app.store.connection() as db:
                    row=db.execute('SELECT body_hash,thread_id,author FROM messages WHERE key_hash=?',(digest(key),)).fetchone()
                if row and row['body_hash']==digest(body) and (thread_id is None or row['thread_id']==thread_id) and row['author']==author:
                    return
                address=self.headers.get('X-Real-IP',self.client_address[0])
                if not app.limiter.allow(address):
                    raise Rejected(429,'rate_limited','请稍等一会儿再投递。')

            def route(self):
                path=urlsplit(self.path).path
                method='GET' if self.command=='HEAD' else self.command
                if path.startswith('/neonnexus/media/') and method=='GET':
                    owner=False
                    try:
                        self.owner()
                        owner=True
                    except Rejected:
                        pass
                    body,mime=app.media.get(path[len('/neonnexus/media/'):],owner)
                    self.reply(200,body=body,mime=mime)
                    return
                if path=='/neonnexus/api/messages' and method=='POST':
                    self.origin()
                    payload=self.json(12288)
                    key,body,bot=self.message(payload)
                    secret=payload.get('threadSecret')
                    if secret is not None:
                        self.secure()
                        if not isinstance(secret,str) or not re.fullmatch('[0-9a-f]{64}',secret):
                            raise Rejected(400,'invalid_secret','取信凭证无效，请重新打开页面。')
                    if bot:
                        identifier=str(uuid.uuid4())
                        self.reply(201,{'ok':True,'receipt':identifier,'threadId':identifier})
                        return
                    self.rate(key,body)
                    response,created=app.threads.initial(key,body,secret)
                    self.reply(201 if created else 200,response)
                    return
                if path==PREFIX+'/posts' and method=='GET':
                    self.reply(200,{'posts':app.articles.list()})
                    return
                if path.startswith(PREFIX+'/posts/') and method=='GET':
                    self.reply(200,{'post':app.articles.get(path[len(PREFIX+'/posts/'):])})
                    return
                if path.startswith(PREFIX+'/threads/'):
                    thread_id=path[len(PREFIX+'/threads/'):]
                    self.visitor(thread_id)
                    if method=='GET':
                        self.reply(200,{'thread':app.threads.get(thread_id)})
                        return
                    if method=='POST':
                        self.origin()
                        key,body,bot=self.message(self.json(12288))
                        if bot:
                            self.reply(201,{'ok':True,'receipt':str(uuid.uuid4()),'threadId':thread_id})
                            return
                        self.rate(key,body,thread_id)
                        response,created=app.threads.reply(thread_id,key,body,'visitor')
                        self.reply(201 if created else 200,response)
                        return
                if path==PREFIX+'/owner/login' and method=='POST':
                    self.secure()
                    self.origin()
                    address=self.headers.get('X-Real-IP',self.client_address[0])
                    if not app.logins.allow(address) or not app.global_logins.allow('login'):
                        raise Rejected(429,'rate_limited','尝试次数太多，请稍后再试。')
                    token=app.auth.login(self.json(4096).get('password'))
                    self.reply(200,{'ok':True,'csrfToken':app.auth.csrf(token)},headers={'Set-Cookie':app.auth.cookie(token)})
                    return
                if path.startswith(PREFIX+'/owner/'):
                    token=self.owner(method not in ('GET','HEAD'))
                    suffix=path[len(PREFIX+'/owner/'):]
                    parts=suffix.split('/')
                    if suffix=='session' and method=='GET':
                        self.reply(200,{'ok':True,'csrfToken':app.auth.csrf(token)})
                        return
                    if suffix=='logout' and method=='POST':
                        app.auth.logout(token)
                        self.reply(200,{'ok':True},headers={'Set-Cookie':app.auth.cookie(expire=True)})
                        return
                    if suffix=='password' and method=='POST':
                        payload=self.json(4096)
                        if not app.auth.check(payload.get('currentPassword')):
                            raise Rejected(401,'unauthorized','当前密码不正确。')
                        app.auth.set_password(payload.get('password'))
                        self.reply(200,{'ok':True},headers={'Set-Cookie':app.auth.cookie(expire=True)})
                        return
                    if suffix=='posts' and method=='GET':
                        self.reply(200,{'posts':app.articles.list(True)})
                        return
                    if suffix=='posts' and method=='POST':
                        self.reply(201,{'post':app.articles.create(self.json())})
                        return
                    if len(parts)==2 and parts[0]=='posts':
                        if method=='GET':
                            self.reply(200,{'post':app.articles.get(parts[1],True)})
                            return
                        if method=='PUT':
                            self.reply(200,{'post':app.articles.update(parts[1],self.json())})
                            return
                        if method=='DELETE':
                            app.articles.delete(parts[1])
                            self.reply(200,{'ok':True})
                            return
                    if len(parts)==3 and parts[0]=='posts' and parts[2] in ('publish','unpublish') and method=='POST':
                        self.reply(200,{'post':app.articles.visibility(parts[1],parts[2]=='publish')})
                        return
                    if suffix=='media' and method=='POST':
                        mime=self.headers.get('Content-Type','').split(';',1)[0].strip().lower()
                        self.reply(201,{'url':app.media.upload(self.headers.get('X-Post-Id',''),mime,self.raw(MAX_IMAGE))})
                        return
                    if suffix=='threads' and method=='GET':
                        self.reply(200,{'threads':app.threads.list()})
                        return
                    if len(parts)==2 and parts[0]=='threads':
                        if method=='GET':
                            self.reply(200,{'thread':app.threads.get(parts[1])})
                            return
                        if method=='POST':
                            key,body,_=self.message(self.json(12288))
                            response,created=app.threads.reply(parts[1],key,body,'owner')
                            self.reply(201 if created else 200,response)
                            return
                raise Rejected(404,'not_found','这个入口不存在。')

            def dispatch(self):
                try:
                    self.route()
                except Rejected as error:
                    self.reply(error.status,{'ok':False,'code':error.code,'message':error.message})
                except (OSError,sqlite3.Error,ValueError,UnicodeError):
                    self.reply(503,{'ok':False,'code':'unavailable','message':'暂时没能完成，请稍后再试。'})

            do_GET=dispatch
            do_HEAD=dispatch
            do_POST=dispatch
            do_PUT=dispatch
            do_DELETE=dispatch
            do_OPTIONS=dispatch
        return Handler


class PrivateHTTPServer(ThreadingHTTPServer):
    daemon_threads=True
    def __init__(self,*args,**kwargs):
        self.slots=threading.BoundedSemaphore(32)
        super().__init__(*args,**kwargs)

    def process_request(self,request,address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request,address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self,request,address):
        try:
            super().process_request_thread(request,address)
        finally:
            self.slots.release()

    def handle_error(self,_request,_address):
        print('request_failed',flush=True)
