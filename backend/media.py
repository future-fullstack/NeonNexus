"""Owner-only binary uploads; random filenames, image MIME allowlist and publication gates."""
import re
import struct
import uuid
import zlib
from pathlib import Path

from legacy import Rejected

MAX_IMAGE=4*1024*1024
TYPES={'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp'}


def image_dimensions(body,mime):
    if mime=='image/png' and len(body)>=57 and body.startswith(b'\x89PNG\r\n\x1a\n') and body[8:16]==b'\x00\x00\x00\x0dIHDR':
        index=8
        has_data=False
        while index+12<=len(body):
            size=int.from_bytes(body[index:index+4],'big')
            end=index+12+size
            if end>len(body) or zlib.crc32(body[index+4:end-4])!=int.from_bytes(body[end-4:end],'big'):
                break
            kind=body[index+4:index+8]
            has_data=has_data or kind==b'IDAT'
            if kind==b'IEND':
                if size==0 and end==len(body) and has_data:
                    return struct.unpack('>II',body[16:24])
                break
            index=end
    if mime=='image/gif' and len(body)>=20 and body[:6] in (b'GIF87a',b'GIF89a') and body.endswith(b';') and b',' in body[13:]:
        return struct.unpack('<HH',body[6:10])
    if mime=='image/webp' and len(body)>=30 and body[:4]==b'RIFF' and body[8:12]==b'WEBP' and struct.unpack('<I',body[4:8])[0]+8==len(body):
        if body[12:16]==b'VP8X':
            return int.from_bytes(body[24:27],'little')+1,int.from_bytes(body[27:30],'little')+1
        if body[12:16]==b'VP8 ' and body[23:26]==b'\x9d\x01\x2a':
            w,h=struct.unpack('<HH',body[26:30]); return w&0x3fff,h&0x3fff
        if body[12:16]==b'VP8L' and body[20]==0x2f:
            bits=int.from_bytes(body[21:25],'little'); return (bits&0x3fff)+1,((bits>>14)&0x3fff)+1
    if mime=='image/jpeg' and body.startswith(b'\xff\xd8') and body.endswith(b'\xff\xd9'):
        index=2
        while index+4<len(body):
            if body[index]!=255:
                break
            marker=body[index+1]
            index+=2
            if marker in (0xd8,0xd9):
                continue
            size=int.from_bytes(body[index:index+2],'big')
            if size<2 or index+size>len(body):
                break
            if marker in (0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf) and size>=8:
                h,w=struct.unpack('>HH',body[index+3:index+7]); return w,h
            index+=size
    raise Rejected(400,'invalid_image','图片格式无法识别，请使用 PNG、JPEG、GIF 或 WebP。')


class Media:
    def __init__(self,store,articles,path):
        self.store,self.articles,self.path=store,articles,Path(path)
        self.path.mkdir(parents=True,exist_ok=True)

    def upload(self,post_id,mime,body):
        self.articles.get(post_id,True)
        if mime not in TYPES or not body or len(body)>MAX_IMAGE:
            raise Rejected(400,'invalid_image','图片需要小于 4 MiB，格式为 PNG、JPEG、GIF 或 WebP。')
        width,height=image_dimensions(body,mime)
        if not 1<=width<=12000 or not 1<=height<=12000 or width*height>40000000:
            raise Rejected(400,'invalid_image','图片尺寸过大，请先缩小。')
        identifier=str(uuid.uuid4())
        filename=identifier+'.'+TYPES[mime]
        target=self.path/filename
        try:
            with target.open('xb') as output:
                output.write(body)
            target.chmod(0o600)
            with self.store.connection() as db:
                db.execute('INSERT INTO media VALUES (?,?,?,?,?,?)',(identifier,post_id,mime,filename,len(body),self.store.clock()))
                db.execute('UPDATE articles SET revision=revision+1,updated=? WHERE id=?',(self.store.clock(),post_id))
        except Exception:
            target.unlink(missing_ok=True)
            raise
        return '/neonnexus/media/'+filename

    def get(self,filename,owner=False):
        if not re.fullmatch(r'[0-9a-f-]{36}\.(png|jpg|gif|webp)',filename):
            raise Rejected(404,'not_found','没有找到这张图片。')
        with self.store.connection() as db:
            row=db.execute('SELECT m.*,a.visibility,a.deleted,p.media_id AS published FROM media m JOIN articles a ON a.id=m.post_id LEFT JOIN published_media p ON p.media_id=m.id WHERE filename=?',(filename,)).fetchone()
        if not row or (not owner and (row['visibility']!='public' or row['deleted'] is not None or not row['published'])):
            raise Rejected(404,'not_found','没有找到这张图片。')
        target=self.path/row['filename']
        if not target.is_file():
            raise Rejected(404,'not_found','没有找到这张图片。')
        return target.read_bytes(),row['mime']
