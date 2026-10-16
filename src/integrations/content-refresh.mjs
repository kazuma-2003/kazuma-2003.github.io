// 開発サーバー（管理画面のプレビュー用）に「記事を読み込み直す」入口を付ける。
// Windows ではファイルの変更の見張りが止まることがあり、保存した内容がプレビューに出なくなる。
// 管理画面はプレビューと公開前の確認の直前に POST /__refresh-content を呼び、記事を必ず読み込み直させる。
// 開発サーバーだけで動き、公開サイトには含まれない。
export default function contentRefresh() {
  return {
    name: 'content-refresh',
    hooks: {
      'astro:server:setup': ({ server, refreshContent, logger }) => {
        server.middlewares.use('/__refresh-content', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end();
            return;
          }
          try {
            await refreshContent?.({});
            res.statusCode = 200;
            res.end('ok');
          } catch (e) {
            logger.warn(`記事の読み込み直しに失敗：${e.message}`);
            res.statusCode = 500;
            res.end(String(e.message));
          }
        });
      },
    },
  };
}
