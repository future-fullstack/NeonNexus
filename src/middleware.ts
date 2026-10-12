import {defineMiddleware} from 'astro:middleware';
export const onRequest=defineMiddleware(async (_context,next)=>{
  const response=await next();
  response.headers.set('Cache-Control','no-store');
  response.headers.set('X-Content-Type-Options','nosniff');
  response.headers.set('Referrer-Policy','no-referrer');
  response.headers.set('X-Frame-Options','DENY');
  return response;
});
