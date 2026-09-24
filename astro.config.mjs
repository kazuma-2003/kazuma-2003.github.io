import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeFigure from './src/plugins/rehype-figure.mjs';

// 公開先。GitHub のユーザーサイト（リポジトリ名 kazuma-2003.github.io）を想定。
// 独自ドメインを取ったらここを書き換える。
export default defineConfig({
  site: 'https://kazuma-2003.github.io',
  integrations: [sitemap()],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeKatex, rehypeFigure],
      remarkRehype: { footnoteLabel: '脚注', footnoteBackLabel: '本文に戻る' },
      // 日本語の文章で -- や引用符が勝手に置き換わらないようにする
      smartypants: false,
    }),
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
});
