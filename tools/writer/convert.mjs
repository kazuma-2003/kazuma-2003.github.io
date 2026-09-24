// Word（.docx）→ ブログ用 Markdown の変換。Pandoc で JSON の構文木にしてから、
// ブログの約束（見出しは ## から・数字の列は右揃え・画像は /images/<記事名>/ 等）に整えて Markdown に戻す。
import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const MEDIA = '__MEDIA__';

function findPandoc() {
  const local = join(process.env.LOCALAPPDATA ?? '', 'Pandoc', 'pandoc.exe');
  return existsSync(local) ? local : 'pandoc';
}
const PANDOC = findPandoc();

async function pandoc(args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(PANDOC, args, { maxBuffer: 256 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve({ stdout, stderr });
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

// ---- 構文木ユーティリティ ----

// インライン要素列を素の文字列にする（タイトル・説明文の抽出用）
export function text(inlines) {
  let s = '';
  for (const n of inlines ?? []) {
    switch (n.t) {
      case 'Str': s += n.c; break;
      case 'Space': case 'SoftBreak': case 'LineBreak': s += ' '; break;
      case 'Emph': case 'Strong': case 'Underline': case 'Strikeout':
      case 'SmallCaps': case 'Superscript': case 'Subscript':
        s += text(n.c); break;
      case 'Span': case 'Link': case 'Quoted': case 'Cite':
        s += text(n.c[1]); break;
      case 'Math': s += n.c[1]; break;
      case 'Code': s += n.c[1]; break;
      default: break; // Note・Image などは除く
    }
  }
  return s;
}

function blockText(b) {
  if (b.t === 'Para' || b.t === 'Plain') return text(b.c);
  return '';
}

// 全ブロックを再帰的に訪問して fn(block) を呼ぶ
function walkBlocks(blocks, fn) {
  for (const b of blocks) {
    fn(b);
    switch (b.t) {
      case 'BlockQuote': walkBlocks(b.c, fn); break;
      case 'Div': walkBlocks(b.c[1], fn); break;
      case 'BulletList': b.c.forEach((item) => walkBlocks(item, fn)); break;
      case 'OrderedList': b.c[1].forEach((item) => walkBlocks(item, fn)); break;
      case 'Figure': walkBlocks(b.c[2], fn); break;
      default: break;
    }
  }
}

// 全インラインを再帰的に訪問（画像の差し替え用）。脚注の中身も辿る。
function walkInlines(node, fn) {
  if (Array.isArray(node)) { node.forEach((n) => walkInlines(n, fn)); return; }
  if (!node || typeof node !== 'object') return;
  if (node.t) fn(node);
  if (node.c !== undefined) walkInlines(node.c, fn);
}

// ---- 表：数字の列を右揃えにし、見出し行が無ければ1行目を見出しにする ----

const NUMERIC = /^[\s　]*[(（]?[−\-+△▲]?[¥￥$]?[\d,，]+([.．]\d+)?[%％]?[)）]?[\s　]*$/;

function cellText(cell) {
  return cell[4].map(blockText).join(' ').trim();
}

function fixTable(tbl) {
  const [, , colspecs, thead, tbodies] = tbl.c;
  const bodyRows = tbodies.flatMap((tb) => tb[3]);
  if (thead[1].length === 0 && bodyRows.length > 1) {
    const first = tbodies.find((tb) => tb[3].length > 0);
    thead[1].push(first[3].shift());
  }
  const rows = tbodies.flatMap((tb) => tb[3]);
  colspecs.forEach((spec, i) => {
    spec[1] = { t: 'ColWidthDefault' };
    const vals = rows.map((r) => (r[1][i] ? cellText(r[1][i]) : '')).filter((v) => v !== '');
    if (vals.length > 0 && vals.every((v) => NUMERIC.test(v))) spec[0] = { t: 'AlignRight' };
  });
}

// ---- 本体 ----

const HR_PARA = /^(?:([＊*◇◆※☆★])(?:[\s　]*\1)*|[―－\-─]{3,})$/;

/**
 * @param {string} docxPath 変換する Word ファイル
 * @param {string} mediaDir 画像の書き出し先（一時フォルダ）
 */
export async function convertDocx(docxPath, mediaDir) {
  const { stdout } = await pandoc(['-f', 'docx', '-t', 'json', `--extract-media=${mediaDir}`, docxPath]);
  const doc = JSON.parse(stdout);
  const warnings = [];
  let blocks = doc.blocks;

  // タイトル：Word の「表題」スタイル（Pandoc がメタデータに入れる）→ 無ければ先頭の見出し
  let title = '';
  const mt = doc.meta?.title;
  if (mt?.t === 'MetaInlines') title = text(mt.c).trim();
  else if (mt?.t === 'MetaString') title = mt.c.trim();
  if (!title && blocks[0]?.t === 'Header') {
    title = text(blocks[0].c[2]).trim();
    blocks = blocks.slice(1);
  }
  if (!title) warnings.push('タイトルが見つかりませんでした。Word で1行目を「表題」スタイルにすると自動で読み取れます。');

  // 見出し：いちばん大きい見出しを ##（大見出し）に揃える
  const headers = [];
  walkBlocks(blocks, (b) => { if (b.t === 'Header') headers.push(b); });
  if (headers.length) {
    const shift = 2 - Math.min(...headers.map((h) => h.c[0]));
    for (const h of headers) {
      h.c[0] = Math.min(6, h.c[0] + shift);
      h.c[1] = ['', [], []]; // Word 由来の見出し ID は捨てる
    }
  }

  // 「＊＊＊」「◇」などだけの段落は区切り線に
  blocks = blocks.map((b) => {
    if ((b.t === 'Para' || b.t === 'Plain') && HR_PARA.test(blockText(b).replace(/[\s　]/g, ''))) {
      return { t: 'HorizontalRule' };
    }
    return b;
  });

  // 図（画像＋キャプション）：管理画面のエディタと同じく、キャプションを画像のタイトルに入れた1段落にする
  blocks = unwrapFigures(blocks);

  // 表
  walkBlocks(blocks, (b) => { if (b.t === 'Table') fixTable(b); });

  // 画像：保存先が決まるまで __MEDIA__/ファイル名 にしておく。サイズ指定は捨てる。
  const images = [];
  walkInlines(blocks, (n) => {
    if (n.t !== 'Image') return;
    const src = n.c[2][0].replace(/\\/g, '/');
    const name = src.split('/').pop();
    n.c[0] = ['', [], []];
    n.c[2][0] = `${MEDIA}/${name}`;
    images.push(name);
  });
  const extracted = existsSync(join(mediaDir, 'media')) ? readdirSync(join(mediaDir, 'media')) : [];
  const unsupported = extracted.filter((f) => /\.(emf|wmf|tiff?)$/i.test(f));
  if (unsupported.length) {
    warnings.push(`ブラウザで表示できない形式の画像があります（${unsupported.join(', ')}）。Word 上で図を右クリック →「図として保存」で PNG にして貼り直してください。`);
  }

  // 説明文の候補：最初の段落の冒頭
  let description = '';
  for (const b of blocks) {
    const t = blockText(b).trim();
    if (t) { description = summarize(t); break; }
  }

  doc.blocks = blocks;
  doc.meta = {};
  const out = await pandoc(
    ['-f', 'json', '-t', 'gfm-tex_math_gfm+tex_math_dollars', '--wrap=none'],
    JSON.stringify(doc),
  );
  let markdown = out.stdout;
  // 独立した数式（$$…$$ だけの行）は前後で改行して別行立ての数式にする
  markdown = markdown.replace(/^\$\$(.+?)\$\$$/gm, '$$$$\n$1\n$$$$');

  const hasMath = /\$/.test(markdown);
  return { title, description, markdown, images: [...new Set(images)], warnings, hasMath };
}

function unwrapFigures(blocks) {
  return blocks.flatMap((b) => {
    if (b.t === 'BlockQuote') return [{ ...b, c: unwrapFigures(b.c) }];
    if (b.t === 'Div') return [{ ...b, c: [b.c[0], unwrapFigures(b.c[1])] }];
    if (b.t !== 'Figure') return [b];
    const caption = b.c[1][1].map(blockText).join(' ').trim();
    const inner = unwrapFigures(b.c[2]);
    walkInlines(inner, (n) => {
      if (n.t === 'Image') {
        if (caption) n.c[2][1] = caption;
        n.c[1] = caption ? [{ t: 'Str', c: caption }] : n.c[1];
      }
    });
    return inner;
  });
}

function summarize(t) {
  const max = 120;
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = cut.lastIndexOf('。');
  return end > 40 ? cut.slice(0, end + 1) : cut + '…';
}
