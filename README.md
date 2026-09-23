# ブログ

経済の分析と思想的な文章を発信するための個人ブログ。Astro で静的サイトを生成し、GitHub Pages で公開する。

## 記事を書く

```
npm run new -- ファイル名 経済分析   # 分類は 経済分析 / 思想 / 雑記
```

`src/content/posts/ファイル名.md` ができる（`draft: true` の下書き）。書き終えたら `draft: false` にして push すると公開される。ファイル名がそのまま URL（`/posts/ファイル名/`）になる。

- 数式: 文中 `$...$`、独立 `$$...$$`（KaTeX）
- 脚注: `本文[^1]` と `[^1]: 注`
- 画像: `public/images/` に置いて `![説明](/images/名前.png)`

## 手元で確認

```
npm run dev      # http://localhost:4321（下書きも表示）
npm run build    # dist/ に本番用を生成（下書きは除外）
```

## 設定

- ブログ名・説明・著者: `src/consts.ts`
- 公開 URL: `astro.config.mjs` の `site`
- デザイン: `src/styles/global.css`
- 公開: `main` への push で `.github/workflows/deploy.yml` が自動デプロイ
