import { getCollection, type CollectionEntry } from 'astro:content';
import {withBase} from './paths';

/** Shared publication rule: use this for every public surface. */
export async function getPublicPosts() {
	const posts = await getCollection('blog', ({ data }) => data.visibility === 'public');
	return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function postHref(post: CollectionEntry<'blog'>) {
	return withBase(`/blog/${post.id.split('/').map(encodeURIComponent).join('/')}/`);
}

export function formatDate(date: Date) {
	return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' }).format(date);
}
