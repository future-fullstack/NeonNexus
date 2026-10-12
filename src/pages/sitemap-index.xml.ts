import type {APIRoute} from 'astro';
import {withBase} from '../lib/paths';
export const GET:APIRoute=({site,url})=>new Response(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${new URL(withBase('/sitemap.xml'),site||url.origin).href}</loc></sitemap></sitemapindex>`,{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'no-store'}});
