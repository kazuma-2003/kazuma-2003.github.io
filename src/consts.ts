// サイト全体の設定。ブログ名・著者名が決まったらここだけ直せば全ページに反映される。
export const SITE_TITLE = '世界経済論考';
export const SITE_ROMAJI = 'SEKAI KEIZAI RONKO';
export const SITE_DESCRIPTION = '経済の分析と、思想についての文章。';
export const AUTHOR = 'M.K.';
export const FOUNDED = 2026;

// トップページの大見出し。[ ] で囲んだ部分にサフランの帯が付く。/ で改行。
export const HEADLINE = '経済の/[秘密を]/解き明かす。';
export const HEADLINE_SUB = '産業連関表から金利と投資まで。一つの式に押し込めず、隣り合う概念を一つずつつないで、経済の因果をたどる論考集。';

// メールで購読（follow.it）。follow.it の「購読フォーム」のコードにある送信先 URL（form の action）と
// メールアドレス欄の name を入れると、サイトに登録欄が現れる。空のあいだは登録欄を出さない。
export const NEWSLETTER = {
  action: '',
  emailField: 'email',
};

// 記事の分類。frontmatter の category はこのどれか。
export const CATEGORIES = ['経済分析', '思想', '雑記'] as const;
export type Category = (typeof CATEGORIES)[number];

// 分類ごとの色（CSS のクラス名）と説明
export const CATEGORY_INFO: Record<Category, { cls: string; text: string }> = {
  経済分析: { cls: 'econ', text: '産業連関表・国民経済計算などの一次統計から、経済の構造と動きを読む。' },
  思想: { cls: 'thought', text: '経済の見方そのもの ── 因果、分類、測ることの意味を考える。' },
  雑記: { cls: 'misc', text: 'ことわざから統計の話まで、肩の力を抜いた覚え書き。' },
};
