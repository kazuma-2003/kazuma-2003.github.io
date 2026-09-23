import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

// 下書き（draft: true）は本番ビルドでは除外し、開発中だけ表示する。
export async function getPosts(): Promise<Post[]> {
  const all = await getCollection('posts', (p) => import.meta.env.DEV || !p.data.draft);
  return all.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function formatDate(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// 日本語本文の読了目安（1分あたり約500字）。
export function readingMinutes(body: string | undefined): number {
  const chars = (body ?? '').replace(/\s+/g, '').length;
  return Math.max(1, Math.round(chars / 500));
}
