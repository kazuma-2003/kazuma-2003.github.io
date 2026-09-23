// 新しい記事の雛形を作る: npm run new -- <ファイル名> [分類]
// 例: npm run new -- inflation-2026 経済分析
import { existsSync, writeFileSync } from 'node:fs';

const [slug, category = '思想'] = process.argv.slice(2);
if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('使い方: npm run new -- <半角英数とハイフンのファイル名> [経済分析|思想|雑記]');
  process.exit(1);
}
const path = `src/content/posts/${slug}.md`;
if (existsSync(path)) {
  console.error(`${path} は既にあります`);
  process.exit(1);
}
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
console.log(`作成しました: ${path}（draft: true。公開するときは false にする）`);
