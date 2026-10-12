import type {APIRoute} from 'astro';
import {getPublicPosts,postHref} from '../lib/posts';
import {withBase} from '../lib/paths';
function escape(text:string){return text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
export const GET:APIRoute=async ({site,url})=>{
  try{
    const posts=await getPublicPosts();
    const paths=[withBase('/'),withBase('/blog/'),withBase('/about/'),...posts.map(postHref)];
    const body=`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path=>`<url><loc>${escape(new URL(path,site||url.origin).href)}</loc></url>`).join('')}</urlset>`;
    return new Response(body,{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'no-store'}});
  }catch{return new Response('文章架暂时没连上',{status:503,headers:{'Cache-Control':'no-store'}});}
};
