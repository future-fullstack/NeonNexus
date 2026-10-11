// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

import cloudflare from "@astrojs/cloudflare";
import {satteri} from '@astrojs/markdown-satteri';

const base=process.env.SITE_BASE || '/';
const normalizedBase=`${base.replace(/\/$/,'')}/`;
// Markdown authors can keep root-relative internal links when the site moves.
/** @type {import('satteri').HastPluginDefinition} */
const prefixMarkdownLinks={name:'deployment-base-links',element:{filter:['a','img','source','video','audio'],visit(node,context){
	for(const attribute of ['href','src','poster']){
		const value=node.properties?.[attribute];
		if(typeof value==='string'&&value.startsWith('/')&&!value.startsWith('//')&&normalizedBase!=='/'&&!value.startsWith(normalizedBase))context.setProperty(node,attribute,normalizedBase+value.slice(1));
	}
}}};

// https://astro.build/config
export default defineConfig({
	// Set SITE_URL only when a real domain is chosen. No pretend production URL.
	site: process.env.SITE_URL || undefined,
	base,
	markdown: {processor:satteri({hastPlugins:[prefixMarkdownLinks]})},
	compressHTML: true,
	integrations: [mdx(), ...(process.env.SITE_URL ? [sitemap()] : [])],
	adapter: cloudflare(),
});
