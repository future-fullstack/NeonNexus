"""Server-only credential initialization/reset and idempotent import of the public first article."""
import argparse
import json
import os
import secrets
from pathlib import Path

from articles import Articles
from auth import OwnerAuth
from storage import Store


def main():
    os.umask(0o077)
    parser=argparse.ArgumentParser()
    parser.add_argument('action',choices=['init','reset','seed'])
    args=parser.parse_args()
    store=Store(os.getenv('MESSAGE_DB','/data/messages.sqlite3'))
    if args.action=='seed':
        import sys
        payload=json.loads(sys.stdin.buffer.read().decode('utf-8-sig'))
        articles=Articles(store)
        with store.connection() as db:
            exists=db.execute('SELECT id FROM articles WHERE slug=?',(payload['slug'],)).fetchone()
        if not exists:
            post=articles.create(payload)
            articles.visibility(post['id'],True)
            print('Public first article seeded')
        else:
            print('Existing first article retained')
        return
    auth=OwnerAuth(store,str(Path(store.path).parent/'owner-auth.json'))
    if args.action=='init' and auth.data()['password']:
        raise SystemExit('Owner already initialized; existing credentials retained')
    password=secrets.token_urlsafe(32)
    auth.set_password(password)
    # Redirect this output directly to a private handoff file; never emit it in tool output.
    print(json.dumps({'url':'https://39.96.71.56/neonnexus/admin/','password':password},ensure_ascii=False))


if __name__=='__main__':
    main()
