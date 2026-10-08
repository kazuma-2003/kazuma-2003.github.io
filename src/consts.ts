// サイト全体の設定。ブログ名・著者名が決まったらここだけ直せば全ページに反映される。
export const SITE_TITLE = '世界経済論考';
export const SITE_ROMAJI = 'SEKAI KEIZAI RONKO';
export const SITE_DESCRIPTION = '経済の分析と、思想についての文章。';
export const AUTHOR = 'M.K.';
export const FOUNDED = 2026;

// メールで購読（follow.it）。follow.it の「購読フォーム」のコードにある送信先 URL（form の action）と
// メールアドレス欄の name を入れると、サイトに登録欄が現れる。空のあいだは登録欄を出さない。
export const NEWSLETTER = {
  action: 'https://api.follow.it/subscription-form/Rit4Z29DTzhqZGFkQ2NTUnJ1cjhieGVUWnhhMElGVFdVZ1VCK2ZpdVpJMExPZ1hzMmdwWnhWN01lUmFoKzk4cXBjK1dhOEJIWDBMQUNkVTVjTlQrNE4yMEl6ay9aWEd6TW1FSXpOR0dJaEl3MFo2TGxWZ2FBajMrZEJ3Rk5MQzd8ZzFMdnBwb0VhUnQzUCt0NlFLRXRVa2lzaU1NZ2dPMWwwWTR6ZEErY2RGcz0=/8',
  emailField: 'email',
};

// 記事の分類。frontmatter の category はこのどれか。
export const CATEGORIES = ['経済分析', '思想', '雑記'] as const;
export type Category = (typeof CATEGORIES)[number];

// 分類ごとの色（CSS のクラス名）
export const CATEGORY_INFO: Record<Category, { cls: string }> = {
  経済分析: { cls: 'econ' },
  思想: { cls: 'thought' },
  雑記: { cls: 'misc' },
};
