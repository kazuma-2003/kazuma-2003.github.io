// 表の列幅を、列の境目をドラッグして変えられるようにする。
// 幅（%）は見出し行のセルの colwidth に持たせ、Markdown には表の直前の注記 <!-- 列幅 30 70 --> として保存する
// （Markdown の表には列幅を書く場所が無いため）。ブログ側は src/plugins/rehype-colwidth.mjs がこの注記を読む。
// 境目をダブルクリックすると列幅の指定を外して自動に戻す。
import { $prose } from '@milkdown/kit/utils';
import { Plugin } from '@milkdown/kit/prose/state';

const NOTE = /^(\s*(?:>\s*)*)<!--\s*列幅\s+([\d.\s]+?)\s*-->\s*$/;
const ROW = /^\s*(?:>\s*)*\|/;
const DELIM = /^\s*(?:>\s*)*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const FENCE = /^\s*(?:>\s*)*(```|~~~)/;
const EDGE = 6; // 境目とみなす幅（px）
const MIN = 8; // 1列の最小幅（%）

// Markdown の中の表の開始行の位置（コードブロックの中は数えない）
function tableStarts(lines) {
  const starts = [];
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const f = lines[i].match(FENCE);
    if (f) { fence = fence === null ? f[1] : fence === f[1] ? null : fence; continue; }
    if (fence) continue;
    if (ROW.test(lines[i]) && DELIM.test(lines[i + 1] ?? '') && !ROW.test(lines[i - 1] ?? '')) starts.push(i);
  }
  return starts;
}

// 読み込み：注記を取り除き、表ごとの列幅（無ければ null）を返す
export function extractWidths(markdown) {
  const lines = markdown.split('\n');
  const widths = [];
  const drop = new Set();
  for (const i of tableStarts(lines)) {
    const m = (lines[i - 1] ?? '').match(NOTE);
    widths.push(m ? m[2].split(/\s+/).map(Number) : null);
    if (m) drop.add(i - 1);
  }
  return { markdown: lines.filter((_, i) => !drop.has(i)).join('\n'), widths };
}

// 保存：表ごとの列幅を注記として表の直前に書き込む
export function injectWidths(markdown, widths) {
  const lines = markdown.split('\n');
  const starts = tableStarts(lines);
  for (let k = starts.length - 1; k >= 0; k--) {
    const w = widths[k];
    if (!w) continue;
    const quote = lines[starts[k]].match(/^\s*(?:>\s*)*/)[0];
    lines.splice(starts[k], 0, `${quote}<!-- 列幅 ${w.join(' ')} -->`);
  }
  return lines.join('\n');
}

// 文書の中の表を順に（列幅は見出し行のセルの colwidth から。そろっていなければ null）
function tablesOf(doc) {
  const out = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'table') return true;
    const head = node.firstChild;
    const w = [];
    head.forEach((cell) => w.push(cell.attrs.colwidth?.[0] ?? null));
    out.push({ node, pos, widths: w.every((x) => typeof x === 'number') ? w : null });
    return false;
  });
  return out;
}

// 列幅は全部の行のセルに入れる（表の補正機能が、列の中のどれか1つのセルの値を他のセルにも写すため）
function applyWidths(tr, table, pos, widths) {
  table.forEach((row, rowOffset) => {
    let i = 0;
    row.forEach((cell, offset) => {
      tr.setNodeMarkup(pos + 1 + rowOffset + 1 + offset, null, { ...cell.attrs, colwidth: widths ? [widths[i]] : null });
      i++;
    });
  });
  return tr;
}

const round = (x) => Math.round(x * 10) / 10;

// 表の DOM に列幅を反映する。セル（ProseMirror が見張っている）には触らず、
// 表の要素に <colgroup> を差し込む（ここへの変更はエディタが無視する）。
function setCols(table, widths) {
  let cg = table.querySelector(':scope > colgroup.cw');
  if (!widths) { cg?.remove(); table.classList.remove('cw-fixed'); return; }
  if (!cg || cg.children.length !== widths.length) {
    cg?.remove();
    cg = document.createElement('colgroup');
    cg.className = 'cw';
    widths.forEach(() => cg.appendChild(document.createElement('col')));
    table.insertBefore(cg, table.firstChild);
  }
  widths.forEach((w, i) => { const s = `${w}%`; if (cg.children[i].style.width !== s) cg.children[i].style.width = s; });
  table.classList.add('cw-fixed');
}

function paint(view) {
  for (const t of tablesOf(view.state.doc)) {
    const dom = view.nodeDOM(t.pos);
    const table = dom?.querySelector?.('table.children');
    if (table) setCols(table, t.widths);
  }
}

export const tableWidthsPlugin = $prose(() => new Plugin({
  view(view) {
    queueMicrotask(() => paint(view));
    return { update: (v) => paint(v) };
  },
}));

// ドラッグ操作。root はエディタを入れている要素
export function attachResizer(root, getView, onChange) {
  let drag = null;

  const edgeOf = (e) => {
    const cell = e.target instanceof Element && e.target.closest('th, td');
    if (!cell || !root.contains(cell)) return null;
    const row = cell.parentElement;
    const cells = [...row.children];
    const idx = cells.indexOf(cell);
    const r = cell.getBoundingClientRect();
    if (e.clientX > r.right - EDGE && idx < cells.length - 1) return { cell, i: idx };
    if (e.clientX < r.left + EDGE && idx > 0) return { cell, i: idx - 1 };
    return null;
  };

  const locate = (view, cell) => {
    const $pos = view.state.doc.resolve(view.posAtDOM(cell, 0));
    for (let d = $pos.depth; d > 0; d--) {
      if ($pos.node(d).type.name === 'table') return { node: $pos.node(d), pos: $pos.before(d) };
    }
    return null;
  };

  root.addEventListener('pointermove', (e) => {
    if (drag) return;
    const hit = edgeOf(e);
    root.classList.toggle('cw-edge', !!hit);
  });

  root.addEventListener('pointerdown', (e) => {
    const hit = edgeOf(e);
    if (!hit || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const view = getView();
    const found = locate(view, hit.cell);
    if (!found) return;
    const table = hit.cell.closest('table');
    const ths = [...table.querySelector('tr').children];
    const total = table.getBoundingClientRect().width;
    const start = ths.map((th) => (th.getBoundingClientRect().width / total) * 100);
    const sum = start.reduce((a, b) => a + b, 0);
    drag = { ...found, i: hit.i, x: e.clientX, total, start: start.map((w) => (w / sum) * 100), table };
    drag.cur = [...drag.start];
    setCols(table, drag.cur);
    root.classList.add('cw-dragging');
    root.setPointerCapture?.(e.pointerId);
  }, true);

  root.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const { i, start } = drag;
    const pair = start[i] + start[i + 1];
    const a = Math.min(Math.max(start[i] + ((e.clientX - drag.x) / drag.total) * 100, MIN), pair - MIN);
    drag.cur = [...start];
    drag.cur[i] = a; drag.cur[i + 1] = pair - a;
    setCols(drag.table, drag.cur);
  }, true);

  const finish = () => {
    if (!drag) return;
    const view = getView();
    const widths = drag.cur.map(round);
    const fix = round(100 - widths.reduce((a, b) => a + b, 0));
    widths[drag.i + 1] = round(widths[drag.i + 1] + fix); // 端数は動かした2列の側で吸収する
    const node = view.state.doc.nodeAt(drag.pos);
    if (node?.type.name === 'table') view.dispatch(applyWidths(view.state.tr, node, drag.pos, widths));
    drag = null;
    root.classList.remove('cw-dragging');
    onChange?.();
  };
  root.addEventListener('pointerup', finish, true);
  root.addEventListener('pointercancel', finish, true);

  root.addEventListener('dblclick', (e) => {
    const hit = edgeOf(e);
    if (!hit) return;
    e.preventDefault(); e.stopPropagation();
    const view = getView();
    const found = locate(view, hit.cell);
    if (!found) return;
    view.dispatch(applyWidths(view.state.tr, found.node, found.pos, null));
    onChange?.();
  }, true);
}

// 読み込み直後に、注記から取り出した列幅を表に入れる（履歴には残さない）
export function restoreWidths(view, widths) {
  const tables = tablesOf(view.state.doc);
  const tr = view.state.tr;
  tables.forEach((t, k) => {
    const w = widths[k];
    if (w && w.length === t.node.firstChild.childCount) applyWidths(tr, t.node, t.pos, w);
  });
  if (tr.docChanged) view.dispatch(tr.setMeta('addToHistory', false));
}

export function currentWidths(view) {
  return tablesOf(view.state.doc).map((t) => t.widths);
}
