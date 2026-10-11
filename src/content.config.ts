import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";

// Only public entries enter Astro's content store. This also keeps draft bodies
// out of a future server bundle; page-level filtering alone is insufficient.
const files = glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}", deferRender: true });
const publishedFiles = {
	name: "public-blog-files",
	async load(context: Parameters<typeof files.load>[0]) {
		await files.load({
			...context,
			store: {
				...context.store,
				set(entry) {
					if (entry.data.visibility === "public") return context.store.set(entry);
					context.store.delete(entry.id);
					return false;
				},
			},
		});
	},
};

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: publishedFiles,
	// Type-check frontmatter using a schema
	schema: z.object({
		title: z.string(),
		description: z.string(),
		// Transform string to Date object
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		heroImage: z.string().optional(),
		tags: z.array(z.string()).default([]),
		visibility: z.enum(["public", "draft"]).default("draft"),
		example: z.boolean().default(false),
	}),
});

export const collections = { blog };
