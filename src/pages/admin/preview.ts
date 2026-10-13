import type {APIRoute} from 'astro';
import {readOwnerSession} from '../../lib/owner-session';
import {renderMarkdown} from '../../lib/markdown';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};
export const POST:APIRoute=async ({request,site,locals})=>{
  try{
    const origin=request.headers.get('origin');
    const expected=process.env.SITE_URL || site?.origin || new URL(request.url).origin;
    if(!origin||origin!==new URL(expected).origin)return new Response(JSON.stringify({message:'请从自己的书桌打开预览。'}),{status:403,headers});
    const session=locals.ownerSession || await readOwnerSession(request);
    if(session.state==='anonymous')return new Response(JSON.stringify({message:'请重新输入密码，正文还在。'}),{status:401,headers});
    if(session.state!=='authenticated')return new Response(JSON.stringify({message:'书桌暂时没连上，正文还在。'}),{status:session.state==='insecure'?403:503,headers});
    if(!session.csrfToken||request.headers.get('x-csrf-token')!==session.csrfToken)return new Response(JSON.stringify({message:'请刷新书桌后再试。'}),{status:403,headers});
    const raw=await request.text();if(raw.length>1300000)return new Response(JSON.stringify({message:'正文太长了。'}),{status:413,headers});
    const input=JSON.parse(raw) as {body?:unknown};
    if(typeof input.body!=='string'||input.body.length>200000)return new Response(JSON.stringify({message:'正文格式不完整。'}),{status:400,headers});
    return new Response(JSON.stringify(renderMarkdown(input.body)),{headers});
  }catch{return new Response(JSON.stringify({message:'暂时无法预览，正文没有丢。'}),{status:503,headers});}
};
