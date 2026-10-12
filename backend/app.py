"""Service entrypoint, keeping backwards-compatible test imports."""
import os
import threading
from legacy import Limiter, MailConfig, Outbox, Rejected, build_mail, parse_submission, send_mail, smtplib
from storage import Store
from http_api import Application, PrivateHTTPServer


def handler_for(store,origins,limiter):
    return Application(store,origins,limiter).handler()


def main():
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--local-dev',action='store_true',help='Loopback-only development fixture, never production')
    args=parser.parse_args()
    os.umask(0o077)
    store=Store(os.getenv('MESSAGE_DB','/data/messages.sqlite3'))
    origins=set(filter(None,os.getenv('ALLOWED_ORIGINS','').split(',')))
    if not origins:
        raise RuntimeError('ALLOWED_ORIGINS must be configured')
    stop=threading.Event()
    threading.Thread(target=Outbox(store,MailConfig.from_env()).run,args=(stop,),daemon=True).start()
    server=PrivateHTTPServer(('127.0.0.1' if args.local_dev else '0.0.0.0',8091),Application(store,origins,require_tls=not args.local_dev).handler())
    try:
        server.serve_forever()
    finally:
        stop.set()
        server.server_close()


if __name__=='__main__':
    main()
