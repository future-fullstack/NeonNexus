import {defineMiddleware} from 'astro:middleware';
import {readOwnerSession} from './lib/owner-session';
import {withBase} from './lib/paths';

export const onRequest=defineMiddleware(async (context,next)=>{
  const base=import.meta.env.BASE_URL.replace(/\/$/,'');
  let pathname=context.url.pathname;
  try{pathname=decodeURIComponent(pathname);}catch{}
  const path=base&&(pathname===base||pathname.startsWith(`${base}/`))?pathname.slice(base.length):pathname;
  const login=path==='/login'||path==='/login/';
  const admin=path==='/admin'||path.startsWith('/admin/');
  const preview=path==='/admin/preview'||path==='/admin/preview/';
  let response:Response;
  const lower=path.toLowerCase();
  if(lower!==path&&(lower==='/login'||lower==='/login/'||lower==='/admin'||lower.startsWith('/admin/'))){
    response=new Response('这一页暂时找不到',{status:404});
  }else if(login||admin){
    const session=await readOwnerSession(context.request);
    context.locals.ownerSession=session;
    if(admin&&session.state==='anonymous'){
      response=preview?Response.json({message:'请重新输入密码，正文还在。'},{status:401}):context.redirect(withBase('/login/'),303);
    }else if(preview&&session.state!=='authenticated'){
      response=Response.json({message:session.state==='insecure'?'请使用安全的地址。':'书桌暂时没连上，正文还在。'},{status:session.state==='insecure'?403:503});
    }else if(login&&session.state==='authenticated'){
      response=context.redirect(withBase('/admin/'),303);
    }else response=await next();
    response.headers.set('X-Robots-Tag','noindex, nofollow');
  }else response=await next();
  response.headers.set('Cache-Control','no-store');
  response.headers.set('X-Content-Type-Options','nosniff');
  response.headers.set('Referrer-Policy','no-referrer');
  response.headers.set('X-Frame-Options','DENY');
  return response;
});
