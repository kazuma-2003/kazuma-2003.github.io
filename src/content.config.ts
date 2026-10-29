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
    // 初めて公開した日時（号数の順番に使う。管理画面が書く）
    published: z.coerce.date().optional(),
    // 号数（初めて公開したときに管理画面が振る。以後は変わらない）
    no: z.coerce.number().int().positive().optional(),
    category: z.enum(CATEGORIES),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    // 一度公開してから非公開にした記事
    hidden: z.boolean().default(false),
    // 記事に添えるデータ（Zenodo の DOI）
    datasets: z.array(z.string()).default([]),
  }),
});

export const collections = { posts };
