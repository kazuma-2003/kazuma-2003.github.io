import { getCollection, type CollectionEntry } from 'astro:content';
import { plainText } from './plain-text.mjs';
export { plainText };

export type Post = CollectionEntry<'posts'>;

// 公表した日時（初めて公開したとき管理画面が published に書く。無い記事は日付で代用）
const publishedAt = (p: Post) => (p.data.published ?? p.data.date).valueOf();

// 下書き（draft: true）は本番ビルドでは除外し、開発中だけ表示する。並びは公表の新しい順。
export async function getPosts(): Promise<Post[]> {
  const all = await getCollection('posts', (p) => import.meta.env.DEV || !p.data.draft);
  return all.sort((a, b) => publishedAt(b) - publishedAt(a));
}

// 記事の号数：公表した順に 1, 2, 3…。下書きには振らない（プレビューで公開中の記事の番号がずれないように）。
export function issueNumbers(posts: Post[]): Map<string, number> {
  const out = posts.filter((p) => !p.data.draft).sort((a, b) => publishedAt(a) - publishedAt(b));
  return new Map(out.map((p, i) => [p.id, i + 1]));
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function formatDate(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// 号外のスタンプ用：2026.10.02
export function dotDate(d: Date): string {
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// 本文の文字数（読者に見える文字だけ。空白・改行・Markdown の記号・画像・URL は数えない。数式は読める文字に直して数える）
export function charCount(md: string): number {
  const text = plainText(
    md
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^(```|~~~).*$/gm, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[\^[^\]]*\]:?/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, '')
      .replace(/^\s*(#{1,6}|>+|[-*+]|\d+[.)])\s+/gm, '')
      .replace(/^\s*([-*_]\s*){3,}$/gm, '')
      .replace(/[|*_~`]/g, ''),
  );
  return [...text.replace(/\s/g, '')].length;
}
