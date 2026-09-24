// ブログ投稿ツール。`ブログを書く.bat` から起動する。
// http://localhost:4400 に投稿画面を出し、プレビュー用にブログの開発サーバー（:4321）も立ち上げる。
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync, copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { convertDocx, MEDIA } from './convert.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const POSTS = join(ROOT, 'src', 'content', 'posts');
const IMAGES = join(ROOT, 'public', 'images');
const PORT = 4400;
const BLOG = 'http://localhost:4321';
const SITE = 'https://kazuma-2003.github.io';
const git = (...args) => promisify(execFile)('git', args, { cwd: ROOT });

// ---- 既存記事の読み取り ----

function frontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const data = {};
  if (!m) return data;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('[')) {
      try { v = JSON.parse(v); } catch { v = v.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean); }
    } else if (v.startsWith('"')) {
      try { v = JSON.parse(v); } catch { /* そのまま */ }
    } else if (v === 'true' || v === 'false') v = v === 'true';
    data[kv[1]] = v;
  }
  return data;
}

function listPosts() {
  return readdirSync(POSTS).filter((f) => f.endsWith('.md')).map((f) => {
    const d = frontmatter(readFileSync(join(POSTS, f), 'utf8'));
    return { slug: f.slice(0, -3), title: d.title ?? '', date: String(d.date ?? ''), draft: d.draft === true, tags: Array.isArray(d.tags) ? d.tags : [], category: d.category ?? '', description: d.description ?? '', source: d.source ?? '' };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

function categories() {
  const src = readFileSync(join(ROOT, 'src', 'consts.ts'), 'utf8');
  const m = src.match(/CATEGORIES\s*=\s*\[([^\]]*)\]/);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
}

const today = () => new Date().toLocaleDateString('sv-SE');

// ---- 変換結果の一時保管 ----
const drafts = new Map(); // id -> { markdown, mediaDir, images, filename }

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

async function handleConvert(req, res) {
  const buf = await readBody(req);
  const filename = decodeURIComponent(req.headers['x-filename'] ?? 'document.docx');
  if (!/\.docx$/i.test(filename)) return send(res, 400, { error: 'Word ファイル（.docx）を選んでください。古い .doc 形式の場合は、Word で「名前を付けて保存」→「Word 文書 (*.docx)」で保存し直してください。' });
  const dir = mkdtempSync(join(tmpdir(), 'blog-writer-'));
  const path = join(dir, 'input.docx');
  writeFileSync(path, buf);
  try {
    const r = await convertDocx(path, dir);
    const id = randomUUID();
    drafts.set(id, { markdown: r.markdown, mediaDir: join(dir, 'media'), images: r.images, filename });
    send(res, 200, { id, title: r.title, description: r.description, markdown: r.markdown, images: r.images, warnings: r.warnings, filename });
  } catch (e) {
    send(res, 500, { error: `変換に失敗しました：${e.message}` });
  }
}

function yamlStr(s) { return JSON.stringify(String(s)); }

async function handleSave(req, res) {
  const p = JSON.parse((await readBody(req)).toString('utf8'));
  const d = drafts.get(p.id);
  if (!d) return send(res, 400, { error: '変換結果が見つかりません。Word ファイルをもう一度読み込んでください。' });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug ?? '')) return send(res, 400, { error: 'URL名は半角の英小文字・数字・ハイフンで入力してください。' });
  if (!p.title?.trim()) return send(res, 400, { error: 'タイトルを入力してください。' });
  if (!p.description?.trim()) return send(res, 400, { error: '説明文を入力してください。' });
  if (!categories().includes(p.category)) return send(res, 400, { error: '分類を選んでください。' });

  const file = join(POSTS, `${p.slug}.md`);
  const prev = existsSync(file) ? frontmatter(readFileSync(file, 'utf8')) : null;
  const publish = p.mode === 'publish';
  // 公開済みの記事を読み込み直した場合は、最初の公開日を保ち更新日を付ける
  const wasPublished = prev && prev.draft !== true;
  const date = wasPublished ? String(prev.date) : today();
  const updated = wasPublished ? today() : null;

  // 画像
  const imgDir = join(IMAGES, p.slug);
  rmSync(imgDir, { recursive: true, force: true });
  if (d.images.length) {
    mkdirSync(imgDir, { recursive: true });
    for (const name of d.images) {
      const src = join(d.mediaDir, name);
      if (existsSync(src)) copyFileSync(src, join(imgDir, name));
    }
  }
  const body = d.markdown.split(`${MEDIA}/`).join(`/images/${p.slug}/`);
  const tags = (p.tags ?? []).map((t) => String(t).trim()).filter(Boolean);
  const fm = [
    '---',
    `title: ${yamlStr(p.title.trim())}`,
    `description: ${yamlStr(p.description.trim())}`,
    `date: ${date}`,
    ...(updated ? [`updated: ${updated}`] : []),
    `category: ${p.category}`,
    `tags: ${JSON.stringify(tags)}`,
    `draft: ${!publish}`,
    `source: ${yamlStr(d.filename)}`,
    '---',
    '',
  ].join('\n');
  writeFileSync(file, fm + body);

  if (!publish) return send(res, 200, { ok: true, preview: `${BLOG}/posts/${p.slug}/`, overwrote: !!prev });

  // 公開：手元で正しく表示できることを確かめてから push する
  try {
    await new Promise((r) => setTimeout(r, 800));
    const check = await fetch(`${BLOG}/posts/${p.slug}/`);
    if (!check.ok) throw new Error(`プレビューで記事を表示できませんでした（${check.status}）。下書きのプレビューを確認してください。`);
    // この記事のファイルだけを commit する（他の下書きは公開リポジトリに載せない）
    const imgPath = `public/images/${p.slug}`;
    const imgTracked = (await git('ls-files', '--', imgPath)).stdout.trim() !== '';
    const paths = [`src/content/posts/${p.slug}.md`, ...(existsSync(imgDir) || imgTracked ? [imgPath] : [])];
    await git('add', '-A', '--', ...paths);
    const staged = (await git('diff', '--cached', '--name-only')).stdout.trim() !== '';
    if (staged) await git('commit', '-m', `${wasPublished ? '記事を更新' : '記事を公開'}: ${p.title.trim()}`, '--', ...paths);
    await git('push');
    send(res, 200, { ok: true, url: `${SITE}/posts/${p.slug}/` });
  } catch (e) {
    // push できなかった場合は下書きに戻しておく（公開されていない状態と手元を一致させる）
    if (!wasPublished) writeFileSync(file, fm.replace('draft: false', 'draft: true') + body);
    send(res, 500, { error: `公開できませんでした：${e.stderr || e.message}` });
  }
}

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.html'), 'utf8');

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, html, 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/api/meta') {
      const posts = listPosts();
      const tags = [...new Set(posts.flatMap((x) => x.tags))];
      return send(res, 200, { categories: categories(), tags, posts, today: today() });
    }
    if (req.method === 'POST' && url.pathname === '/api/convert') return await handleConvert(req, res);
    if (req.method === 'POST' && url.pathname === '/api/save') return await handleSave(req, res);
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

// ---- 起動 ----

async function blogRunning() {
  try { return (await fetch(BLOG)).ok; } catch { return false; }
}

let dev = null;
if (!(await blogRunning())) {
  dev = spawn('npm', ['run', 'dev'], { cwd: ROOT, shell: true, stdio: 'ignore' });
}
const stopDev = () => {
  if (dev?.pid) { try { execFile('taskkill', ['/pid', String(dev.pid), '/T', '/F']); } catch { /* 終了済み */ } }
};
process.on('SIGINT', () => { stopDev(); process.exit(0); });
process.on('exit', stopDev);

server.listen(PORT, '127.0.0.1', async () => {
  for (let i = 0; i < 60 && !(await blogRunning()); i++) await new Promise((r) => setTimeout(r, 500));
  console.log('');
  console.log('  ブログ投稿ツールを開きました： http://localhost:4400');
  console.log('  使い終わったら、この黒い画面を閉じてください。');
  console.log('');
  if (!process.argv.includes('--no-open')) execFile('cmd', ['/c', 'start', '', `http://localhost:${PORT}`]);
});
