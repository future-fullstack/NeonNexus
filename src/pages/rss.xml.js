import rss from "@astrojs/rss";
import { getPublicPosts, postHref,postDate } from "../lib/posts";
import { SITE_TITLE, SITE_DESCRIPTION } from "../consts";
import {withBase} from '../lib/paths';

export async function GET(context) {
	let posts;try{posts=await getPublicPosts();}catch{return new Response('文章架暂时没连上',{status:503,headers:{'Cache-Control':'no-store'}});}
	const response=await rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		// Local feed remains usable; production builds should set SITE_URL.
		site: new URL(withBase('/'), context.site || context.url.origin),
		items: posts.map((post) => ({
			title:post.title,description:post.description,pubDate:postDate(post.pubDate),
			link: postHref(post),
		})),
	});
	response.headers.set('Cache-Control','no-store');return response;
}
