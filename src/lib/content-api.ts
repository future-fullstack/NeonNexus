import {withBase} from './paths';
import type {Post,PostSummary} from './contracts';

export class ContentUnavailable extends Error {}
/** Runtime environment belongs to this frontend process, never to browser bundles. */
export function backendURL(path:string) {
  const origin=process.env.NEONNEXUS_API_ORIGIN || 'http://127.0.0.1:8091';
  return new URL(withBase(`/api/v1${path}`),origin);
}
export async function publicJSON<T>(path:string):Promise<T|null> {
  try {
    const response=await fetch(backendURL(path),{signal:AbortSignal.timeout(5000),headers:{Accept:'application/json'},cache:'no-store'});
    if(response.status===404)return null;
    if(!response.ok)throw new Error('content service unavailable');
    const result:unknown=await response.json();
    if(!result||typeof result!=='object'||Array.isArray(result))throw new Error('invalid content response');
    return result as T;
  }catch {throw new ContentUnavailable('暂时没有连上文章架，请稍后再来。');}
}
function isPublicSummary(value:unknown):value is PostSummary {
  if(!value||typeof value!=='object')return false;
  const post=value as Record<string,unknown>;
  return typeof post.id==='string'&&typeof post.slug==='string'&&/^[a-z0-9-]{1,100}$/.test(post.slug)
    &&typeof post.title==='string'&&typeof post.description==='string'
    &&typeof post.pubDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(post.pubDate)
    &&Number.isFinite(new Date(`${post.pubDate}T00:00:00+08:00`).valueOf())
    &&Array.isArray(post.tags)&&post.tags.every(tag=>typeof tag==='string')&&post.visibility==='public';
}
export async function loadPublicPosts():Promise<PostSummary[]> {
  const result=await publicJSON<{posts?:unknown}>('/posts');
  if(!result||!Array.isArray(result.posts)||!result.posts.every(isPublicSummary))throw new ContentUnavailable('暂时没有连上文章架，请稍后再来。');
  return result.posts;
}
export async function loadPublicPost(slug:string):Promise<Post|null> {
  const result=await publicJSON<{post?:unknown}>(`/posts/${encodeURIComponent(slug)}`);
  if(result===null)return null;
  if(!isPublicSummary(result.post)||typeof (result.post as Post).body!=='string')throw new ContentUnavailable('暂时没有连上文章架，请稍后再来。');
  return result.post as Post;
}
