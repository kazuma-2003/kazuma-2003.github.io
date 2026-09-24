// ブログの管理画面。`ブログを書く.bat` から起動する。
// http://localhost:4400 に管理画面を出し、プレビュー用にブログの開発サーバー（:4321）も立ち上げる。
//
// 記事の置き場所と状態
//   src/content/posts/<slug>.md    公開中（Git に載せる）
//   src/content/private/<slug>.md  下書き・一時非公開（Git に載せない。hidden: true なら一時非公開）
//   public/images/<slug>/           記事の画像（公開中の記事のものだけ Git に載せる）
//   trash/<日時>-<slug>/            削除した記事（Git に載せない。手で戻せる）
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync, copyFileSync,
  renameSync, statSync, cpSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { convertDocx, MEDIA } from './convert.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const POSTS = join(ROOT, 'src', 'content', 'posts');
const PRIVATE = join(ROOT, 'src', 'content', 'private');
const IMAGES = join(ROOT, 'public', 'images');
const TRASH = join(ROOT, 'trash');
const STAGING = mkdtempSync(join(tmpdir(), 'blog-admin-'));
const PORT = Number(process.env.ADMIN_PORT ?? 4400);
const BLOG_PORT = Number(process.env.BLOG_PORT ?? 4321);
const BLOG = `http://localhost:${BLOG_PORT}`;
const SITE = 'https://kazuma-2003.github.io';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const execGit = promisify(execFile);
const git = (...args) => execGit('git', args, { cwd: ROOT });

mkdirSync(PRIVATE, { recursive: true });

// ---- frontmatter ----

function parse(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const data = {};
  if (!m) return { data, body: md };
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
  return { data, body: md.slice(m[0].length) };
}

function serialize(d, body) {
  const q = (s) => JSON.stringify(String(s));
  const lines = [
    '---',
    `title: ${q(d.title)}`,
    `description: ${q(d.description)}`,
    `date: ${d.date}`,
    ...(d.updated ? [`updated: ${d.updated}`] : []),
    `category: ${d.category}`,
    `tags: ${JSON.stringify(d.tags ?? [])}`,
    `draft: ${!!d.draft}`,
    ...(d.hidden ? ['hidden: true'] : []),
    ...(d.source ? [`source: ${q(d.source)}`] : []),
    '---',
    '',
  ];
  return lines.join('\n') + body.replace(/^\n+/, '');
}

const today = () => new Date().toLocaleDateString('sv-SE');

function locate(slug) {
  if (existsSync(join(POSTS, `${slug}.md`))) return { file: join(POSTS, `${slug}.md`), published: true };
  if (existsSync(join(PRIVATE, `${slug}.md`))) return { file: join(PRIVATE, `${slug}.md`), published: false };
  return null;
}

function categories() {
  const src = readFileSync(join(ROOT, 'src', 'consts.ts'), 'utf8');
  const m = src.match(/CATEGORIES\s*=\s*\[([^\]]*)\]/);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
}

// 公開中の記事のうち、手元で変更してまだ公開に反映していないもの
async function pendingChanges() {
  const { stdout } = await git('status', '--porcelain', '--untracked-files=all', '--', 'src/content/posts', 'public/images');
  const set = new Set();
  for (const line of stdout.split('\n')) {
    const p = line.slice(3).trim().replace(/^"|"$/g, '');
    const m = p.match(/^src\/content\/posts\/([^/]+)\.md$/) || p.match(/^public\/images\/([^/]+)\//);
    if (m) set.add(m[1]);
  }
  return set;
}

async function listPosts() {
  const pending = await pendingChanges();
  const out = [];
  for (const [dir, published] of [[POSTS, true], [PRIVATE, false]]) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
      const slug = f.slice(0, -3);
      const { data } = parse(readFileSync(join(dir, f), 'utf8'));
      const status = published ? 'published' : data.hidden ? 'hidden' : 'draft';
      out.push({
        slug, status, title: data.title ?? '', description: data.description ?? '', date: String(data.date ?? ''),
        updated: data.updated ? String(data.updated) : '', category: data.category ?? '', tags: Array.isArray(data.tags) ? data.tags : [],
        source: data.source ?? '', pending: published && pending.has(slug), mtime: statSync(join(dir, f)).mtimeMs,
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.mtime - a.mtime);
}

// ---- 画像 ----

// 本文中の /media/<id>/<名前>（取り込み・アップロード直後の画像）を /images/<slug>/ に移し、
// 本文から参照されなくなった画像を消す
function settleImages(slug, body) {
  const dir = join(IMAGES, slug);
  body = body.replace(/\/media\/([0-9a-f-]{36})\/([^\s)"']+)/g, (all, id, name) => {
    const src = join(STAGING, id, decodeURIComponent(name));
    if (!existsSync(src)) return all;
    mkdirSync(dir, { recursive: true });
    let out = decodeURIComponent(name).replace(/[^\w.-]/g, '_');
    const stem = out.replace(/\.[^.]+$/, ''), ext = extname(out);
    for (let n = 2; existsSync(join(dir, out)) && readFileSync(join(dir, out)).compare(readFileSync(src)) !== 0; n++) out = `${stem}-${n}${ext}`;
    copyFileSync(src, join(dir, out));
    return `/images/${slug}/${out}`;
  });
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) if (!body.includes(`/images/${slug}/${f}`)) rmSync(join(dir, f));
    if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
  }
  return body;
}

// ---- Git ----

// 記事ファイルと画像フォルダのうち、存在するか Git が追跡しているもの（削除を記録するため）
async function articlePaths(slug) {
  const out = [];
  for (const p of [`src/content/posts/${slug}.md`, `public/images/${slug}`]) {
    const tracked = (await git('ls-files', '--', p)).stdout.trim() !== '';
    if (tracked || existsSync(join(ROOT, p))) out.push(p);
  }
  return out;
}

async function commitAndPush(message, paths) {
  if (paths.length) await git('add', '-A', '-f', '--', ...paths);
  const staged = (await git('diff', '--cached', '--name-only')).stdout.trim();
  if (staged) await git('commit', '-q', '-m', message);
  try {
    await git('push', '-q');
  } catch (e) {
    // 送信できなかった記録は取り消す（手元のファイルは各操作の側で元に戻す）
    if (staged) await git('reset', '-q', 'HEAD~1');
    throw new Error(`GitHub に送信できませんでした。インターネット接続を確認して、もう一度お試しください。\n（${(e.stderr || e.message).trim().split('\n')[0]}）`);
  }
}

// 追跡中のファイルだけを Git から外す（手元のファイルは残す）
async function untrack(paths) {
  for (const p of paths) {
    const tracked = (await git('ls-files', '--', p)).stdout.trim();
    if (tracked) await git('rm', '-r', '-q', '--cached', '--', p);
  }
}

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// posts/ と private/ の間で記事を移す。開発サーバーが「削除」を後から受け取って記事を
// 見失わないよう、先に元を消してから新しい場所に書く。
async function moveArticle(from, to, content) {
  rmSync(from);
  await sleep(400);
  writeFileSync(to, content);
}

// 手元の開発サーバーで記事が表示できることを確かめる（壊れた記事を公開しないため）
async function checkRenders(slug, file) {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${BLOG}/posts/${slug}/`).catch(() => null);
    if (r?.ok) return;
    if (i === 6 && file) writeFileSync(file, readFileSync(file)); // 読み込み直しを促す
    await sleep(500);
  }
  throw new Error('プレビューで記事を表示できませんでした。記事の内容を確認してください。');
}

// ---- API ----

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}
const json = async (req) => JSON.parse((await readBody(req)).toString('utf8') || '{}');

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
class UserError extends Error {}

const api = {
  async 'GET /api/meta'() {
    const posts = await listPosts();
    return { categories: categories(), tags: [...new Set(posts.flatMap((p) => p.tags))], today: today(), site: SITE, blog: BLOG };
  },

  async 'GET /api/posts'() {
    return { posts: await listPosts() };
  },

  async 'GET /api/post'(req, url) {
    const slug = url.searchParams.get('slug');
    const loc = SLUG.test(slug ?? '') && locate(slug);
    if (!loc) throw new UserError('記事が見つかりません。');
    const { data, body } = parse(readFileSync(loc.file, 'utf8'));
    return { slug, data, body, status: loc.published ? 'published' : data.hidden ? 'hidden' : 'draft' };
  },

  async 'POST /api/convert'(req) {
    const buf = await readBody(req);
    const filename = decodeURIComponent(req.headers['x-filename'] ?? 'document.docx');
    if (!/\.docx$/i.test(filename)) throw new UserError('Word ファイル（.docx）を選んでください。古い .doc 形式の場合は、Word で「名前を付けて保存」→「Word 文書 (*.docx)」で保存し直してください。');
    const dir = mkdtempSync(join(tmpdir(), 'blog-docx-'));
    writeFileSync(join(dir, 'input.docx'), buf);
    const r = await convertDocx(join(dir, 'input.docx'), dir);
    // 画像を配信用の置き場へ
    const id = randomUUID();
    mkdirSync(join(STAGING, id));
    for (const name of r.images) {
      const src = join(dir, 'media', name);
      if (existsSync(src)) copyFileSync(src, join(STAGING, id, name));
    }
    rmSync(dir, { recursive: true, force: true });
    return { ...r, markdown: r.markdown.split(`${MEDIA}/`).join(`/media/${id}/`), filename };
  },

  async 'POST /api/upload'(req) {
    const buf = await readBody(req);
    const name = basename(decodeURIComponent(req.headers['x-filename'] ?? 'image.png')).replace(/[^\w.-]/g, '_') || 'image.png';
    if (!/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(name)) throw new UserError('画像ファイル（PNG・JPEG・GIF・WebP・SVG）を選んでください。');
    const id = randomUUID();
    mkdirSync(join(STAGING, id));
    writeFileSync(join(STAGING, id, name), buf);
    return { url: `/media/${id}/${encodeURIComponent(name)}` };
  },

  // 保存（公開状態は変えない）。新規・下書きは private/、公開中の記事は posts/ のまま。
  async 'POST /api/save'(req) {
    const p = await json(req);
    if (!SLUG.test(p.slug ?? '')) throw new UserError('URL名は半角の英小文字・数字・ハイフンで入力してください。');
    if (!p.title?.trim()) throw new UserError('タイトルを入力してください。');
    if (!categories().includes(p.category)) throw new UserError('分類を選んでください。');
    const original = p.originalSlug || null;
    const orig = original ? locate(original) : null;
    if (original && !orig) throw new UserError('元の記事が見つかりません。');
    if (p.slug !== original && locate(p.slug)) throw new UserError(`URL名「${p.slug}」は別の記事で使われています。`);
    if (orig?.published && p.slug !== original) throw new UserError('公開中の記事の URL名は変えられません（リンクが切れるため）。');

    const prev = orig ? parse(readFileSync(orig.file, 'utf8')).data : {};
    // URL名の変更（下書き・非公開のみ）：画像フォルダも移す
    let body = String(p.body ?? '');
    if (orig && p.slug !== original) {
      const oldDir = join(IMAGES, original);
      if (existsSync(oldDir)) renameSync(oldDir, join(IMAGES, p.slug));
      body = body.split(`/images/${original}/`).join(`/images/${p.slug}/`);
      rmSync(orig.file);
      await sleep(400);
    }
    body = settleImages(p.slug, body);
    const published = !!orig?.published;
    const data = {
      title: p.title.trim(),
      description: (p.description ?? '').trim() || firstSentence(body),
      date: prev.date ? String(prev.date) : today(),
      updated: prev.updated ? String(prev.updated) : undefined,
      category: p.category,
      tags: (p.tags ?? []).map((t) => String(t).trim()).filter(Boolean),
      draft: !published,
      hidden: !published && !!prev.hidden,
      source: p.source || prev.source,
    };
    writeFileSync(join(published ? POSTS : PRIVATE, `${p.slug}.md`), serialize(data, body));
    return { slug: p.slug, body, preview: `${BLOG}/posts/${p.slug}/`, status: published ? 'published' : data.hidden ? 'hidden' : 'draft' };
  },

  // 公開（下書き・非公開 → 公開）または、公開中の記事の変更を反映
  async 'POST /api/publish'(req) {
    const { slug } = await json(req);
    const loc = SLUG.test(slug ?? '') && locate(slug);
    if (!loc) throw new UserError('記事が見つかりません。');
    const { data, body } = parse(readFileSync(loc.file, 'utf8'));
    const target = join(POSTS, `${slug}.md`);
    let message;
    if (loc.published) {
      data.updated = today();
      message = `記事を更新: ${data.title}`;
    } else {
      if (!data.hidden) data.date = today(); // 初めての公開は公開日を今日に
      message = data.hidden ? `記事を再公開: ${data.title}` : `記事を公開: ${data.title}`;
    }
    data.draft = false;
    data.hidden = false;
    const before = readFileSync(loc.file);
    if (loc.published) writeFileSync(target, serialize(data, body));
    else await moveArticle(loc.file, target, serialize(data, body));
    try {
      await checkRenders(slug, target);
      await commitAndPush(message, await articlePaths(slug));
    } catch (e) {
      // 公開できなかったら元の状態に戻す
      if (loc.published) writeFileSync(target, before);
      else await moveArticle(target, loc.file, before);
      await git('reset', '-q', '--', ...(await articlePaths(slug))).catch(() => {});
      throw new UserError(`公開できませんでした：${e.stderr || e.message}`);
    }
    return { url: `${SITE}/posts/${slug}/` };
  },

  // 一時非公開（公開中 → 非公開）。記事と画像は手元に残る。
  async 'POST /api/unpublish'(req) {
    const { slug } = await json(req);
    const loc = SLUG.test(slug ?? '') && locate(slug);
    if (!loc?.published) throw new UserError('公開中の記事ではありません。');
    const { data, body } = parse(readFileSync(loc.file, 'utf8'));
    data.draft = true;
    data.hidden = true;
    const before = readFileSync(loc.file);
    const target = join(PRIVATE, `${slug}.md`);
    await moveArticle(loc.file, target, serialize(data, body));
    try {
      await untrack([`src/content/posts/${slug}.md`, `public/images/${slug}`]);
      await commitAndPush(`記事を非公開に: ${data.title}`, []);
    } catch (e) {
      await moveArticle(target, loc.file, before);
      await git('reset', '-q', '--', `src/content/posts/${slug}.md`, `public/images/${slug}`).catch(() => {});
      throw new UserError(`非公開にできませんでした：${e.stderr || e.message}`);
    }
    return { ok: true };
  },

  // 削除：ゴミ箱（trash/）へ移す。公開中ならサイトからも消す。
  async 'POST /api/delete'(req) {
    const { slug } = await json(req);
    const loc = SLUG.test(slug ?? '') && locate(slug);
    if (!loc) throw new UserError('記事が見つかりません。');
    const { data } = parse(readFileSync(loc.file, 'utf8'));
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const bin = join(TRASH, `${stamp}-${slug}`);
    mkdirSync(bin, { recursive: true });
    copyFileSync(loc.file, join(bin, `${slug}.md`));
    const imgDir = join(IMAGES, slug);
    if (existsSync(imgDir)) cpSync(imgDir, join(bin, 'images'), { recursive: true });
    if (loc.published) {
      try {
        await untrack([`src/content/posts/${slug}.md`, `public/images/${slug}`]);
        await commitAndPush(`記事を削除: ${data.title}`, []);
      } catch (e) {
        await git('reset', '-q', '--', `src/content/posts/${slug}.md`, `public/images/${slug}`).catch(() => {});
        rmSync(bin, { recursive: true, force: true });
        throw new UserError(`削除できませんでした：${e.stderr || e.message}`);
      }
    }
    rmSync(loc.file);
    rmSync(imgDir, { recursive: true, force: true });
    return { ok: true, trash: bin };
  },
};

function firstSentence(body) {
  const para = body.split(/\n\s*\n/).map((s) => s.trim()).find((s) => s && !/^(#|!\[|\$\$|>|\||-|\*|\d+\.)/.test(s)) ?? '';
  const t = para.replace(/\[\^[^\]]+\]/g, '').replace(/[*_`]/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  if (t.length <= 120) return t;
  const cut = t.slice(0, 120), end = cut.lastIndexOf('。');
  return end > 40 ? cut.slice(0, end + 1) : `${cut}…`;
}

// ---- 静的ファイル ----

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.avif': 'image/avif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
};
function sendFile(res, file) {
  if (!existsSync(file) || !statSync(file).isFile()) return send(res, 404, { error: 'not found' });
  res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(file));
}
const safe = (p) => !p.split('/').some((s) => s === '..' || s.includes('\\'));

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = decodeURIComponent(url.pathname);
  try {
    const handler = api[`${req.method} ${url.pathname}`];
    if (handler) return send(res, 200, await handler(req, url));
    if (req.method !== 'GET' || !safe(path)) return send(res, 404, { error: 'not found' });
    if (path === '/') return sendFile(res, join(HERE, 'index.html'));
    if (path.startsWith('/dist/')) return sendFile(res, join(HERE, path));
    if (path.startsWith('/media/')) return sendFile(res, join(STAGING, path.slice(7)));
    if (path.startsWith('/images/')) return sendFile(res, join(IMAGES, path.slice(8)));
    if (path === '/favicon.ico') return sendFile(res, join(ROOT, 'public', 'favicon.ico'));
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, e instanceof UserError ? 400 : 500, { error: e instanceof UserError ? e.message : `エラーが起きました：${e.message}` });
  }
});

// ---- 起動 ----

async function blogRunning() {
  try { return (await fetch(BLOG)).ok; } catch { return false; }
}

if (!existsSync(join(HERE, 'dist', 'editor.js'))) {
  console.log('  エディタを準備しています…');
  await promisify(execFile)('npm', ['run', 'build:editor'], { cwd: ROOT, shell: true });
}

let dev = null;
if (!(await blogRunning())) {
  dev = spawn('npm', ['run', 'dev', '--', '--port', String(BLOG_PORT)], { cwd: ROOT, shell: true, stdio: 'ignore' });
}
const stopDev = () => {
  if (dev?.pid) { try { execFile('taskkill', ['/pid', String(dev.pid), '/T', '/F']); } catch { /* 終了済み */ } }
  rmSync(STAGING, { recursive: true, force: true });
};
process.on('SIGINT', () => { stopDev(); process.exit(0); });
process.on('exit', stopDev);

server.listen(PORT, '127.0.0.1', async () => {
  for (let i = 0; i < 60 && !(await blogRunning()); i++) await new Promise((r) => setTimeout(r, 500));
  console.log('');
  console.log(`  ブログの管理画面を開きました： http://localhost:${PORT}`);
  console.log('  使い終わったら、この黒い画面を閉じてください。');
  console.log('');
  if (!process.argv.includes('--no-open')) execFile('cmd', ['/c', 'start', '', `http://localhost:${PORT}`]);
});
