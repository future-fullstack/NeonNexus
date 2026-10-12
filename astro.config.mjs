// @ts-check
import { defineConfig } from "astro/config";
import node from '@astrojs/node';

const base=process.env.SITE_BASE || '/';
const apiOrigin=process.env.NEONNEXUS_API_ORIGIN || 'http://127.0.0.1:8091';

// https://astro.build/config
export default defineConfig({
	// Set SITE_URL only when a real domain is chosen. No pretend production URL.
	site: process.env.SITE_URL || undefined,
	base,
	output:'server',
	session:false,
	compressHTML: true,
	adapter:node({mode:'standalone',bodySizeLimit:6*1024*1024}),
	vite:{server:{proxy:{
		[`${base.replace(/\/$/,'')}/api/`]:{target:apiOrigin,changeOrigin:false},
		[`${base.replace(/\/$/,'')}/media/`]:{target:apiOrigin,changeOrigin:false},
		// Astro removes its base before passing development requests to Vite.
		'/api/':{target:apiOrigin,changeOrigin:false,rewrite:path=>`${base.replace(/\/$/,'')}${path}`},
		'/media/':{target:apiOrigin,changeOrigin:false,rewrite:path=>`${base.replace(/\/$/,'')}${path}`},
	}}},
});
