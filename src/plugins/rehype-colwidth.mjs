// 表の直前の注記 <!-- 列幅 30 70 --> を読んで、その表の列幅（%）にする（管理画面で列の境目をドラッグすると書かれる）。
// 注記そのものは取り除く。
const NOTE = /^\s*<!--\s*列幅\s+([\d.\s]+?)\s*-->\s*$/;

function noteWidths(n) {
  const v = n.type === 'raw' ? n.value : n.type === 'comment' ? `<!--${n.value}-->` : null;
  const m = v?.match(NOTE);
  return m ? m[1].split(/\s+/).map(Number).filter((x) => x > 0) : null;
}

function walk(node) {
  if (!node.children) return;
  const out = [];
  for (let i = 0; i < node.children.length; i++) {
    const n = node.children[i];
    const widths = noteWidths(n);
    if (!widths) { out.push(n); walk(n); continue; }
    let j = i + 1;
    while (node.children[j]?.type === 'text' && !node.children[j].value.trim()) j++;
    const table = node.children[j];
    if (table?.type === 'element' && table.tagName === 'table') {
      const sum = widths.reduce((a, b) => a + b, 0);
      table.properties.className = [...(table.properties.className ?? []), 'cw'];
      table.children.unshift({
        type: 'element', tagName: 'colgroup', properties: {},
        children: widths.map((w) => ({ type: 'element', tagName: 'col', properties: { style: `width:${Math.round((w / sum) * 1000) / 10}%` }, children: [] })),
      });
    }
  }
  node.children = out;
}

export default function rehypeColwidth() {
  return (tree) => walk(tree);
}
