// 新しい記事の雛形を作る: npm run new -- <ファイル名> [分類]
// 例: npm run new -- inflation-2026 経済分析
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const [slug, category = '思想'] = process.argv.slice(2);
if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('使い方: npm run new -- <半角英数とハイフンのファイル名> [経済分析|思想|雑記]');
  process.exit(1);
}
const path = `src/content/private/${slug}.md`;
if (existsSync(`src/content/posts/${slug}.md`)) {
  console.error(`src/content/posts/${slug}.md は既にあります`);
  process.exit(1);
}
if (existsSync(path)) {
  console.error(`${path} は既にあります`);
  process.exit(1);
}
mkdirSync('src/content/private', { recursive: true });
const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
writeFileSync(path, `---
title:
description:
date: ${today}
category: ${category}
tags: []
draft: true
---

`);
console.log(`作成しました: ${path}（下書き。公開は管理画面から）`);
