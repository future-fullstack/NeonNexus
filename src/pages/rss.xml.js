import rss from "@astrojs/rss";
import { getPublicPosts, postHref } from "../lib/posts";
import { SITE_TITLE, SITE_DESCRIPTION } from "../consts";
import {withBase} from '../lib/paths';

export async function GET(context) {
	const posts = await getPublicPosts();
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		// Local feed remains usable; production builds should set SITE_URL.
		site: new URL(withBase('/'), context.site || context.url.origin),
		items: posts.map((post) => ({
			...post.data,
			link: postHref(post),
		})),
	});
}
