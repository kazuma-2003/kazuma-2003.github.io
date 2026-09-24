import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { CATEGORIES } from './consts';

// 公開記事は posts/、下書き・一時非公開の記事は private/（Git に載せない）に置く。
// どちらもファイル名がそのまま URL（/posts/<ファイル名>/）になる。
const posts = defineCollection({
  loader: glob({
    base: './src/content',
    pattern: ['posts/*.md', 'private/*.md'],
    generateId: ({ entry }) => entry.replace(/^.*\//, '').replace(/\.md$/, ''),
  }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    category: z.enum(CATEGORIES),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    // 一度公開してから非公開にした記事
    hidden: z.boolean().default(false),
  }),
});

export const collections = { posts };
