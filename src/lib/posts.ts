import {withBase} from './paths';
import {loadPublicPosts} from './content-api';
import type {Post} from './contracts';

/** Shared publication rule: use this for every public surface. */
export const getPublicPosts=loadPublicPosts;

export function postHref(post:Pick<Post,'slug'>) {
	return withBase(`/blog/${encodeURIComponent(post.slug)}/`);
}

export function postDate(date:string){return new Date(`${date.slice(0,10)}T00:00:00+08:00`);}
export function formatDate(date:string|Date) {
	return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' }).format(typeof date==='string'?postDate(date):date);
}
