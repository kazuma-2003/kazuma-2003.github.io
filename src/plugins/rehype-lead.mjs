// 本文の最初の段落に class="lead-para" を付ける（1文字目を大きな飾り文字にするため）。
// Word 由来の段落頭の全角スペース（字下げ）は、飾り文字と重なるので最初の段落だけ外す。
// 段落が数式や画像で始まる場合は飾らない。
export default function rehypeLead() {
  return (tree) => {
    const p = tree.children.find((n) => n.type === 'element' && n.tagName === 'p');
    if (!p) return;
    const first = p.children[0];
    if (!first || first.type !== 'text') return;
    first.value = first.value.replace(/^[\s　]+/, '');
    if (!first.value) return;
    const cls = p.properties.className ?? [];
    p.properties.className = [...(Array.isArray(cls) ? cls : [cls]), 'lead-para'];
  };
}
