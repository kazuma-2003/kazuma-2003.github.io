// 段落に画像が1枚だけあるとき、<figure> にして画像のタイトル（管理画面の「図の説明」）をキャプションにする。
// 管理画面のエディタは画像の縦横比を alt に数値で入れるので、その場合は alt もキャプションで置き換える。
export default function rehypeFigure() {
  return (tree) => walk(tree);
}

function walk(node) {
  if (!node.children) return;
  node.children = node.children.map((child) => {
    if (child.type === 'element' && child.tagName === 'p') {
      const content = child.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
      if (content.length === 1 && content[0].type === 'element' && content[0].tagName === 'img') {
        const img = content[0];
        const caption = img.properties.title ?? '';
        delete img.properties.title;
        const alt = String(img.properties.alt ?? '');
        if (!alt || /^\d+(\.\d+)?$/.test(alt)) img.properties.alt = caption;
        img.properties.loading = 'lazy';
        const children = [img];
        if (caption) children.push({ type: 'element', tagName: 'figcaption', properties: {}, children: [{ type: 'text', value: caption }] });
        return { type: 'element', tagName: 'figure', properties: {}, children };
      }
    }
    walk(child);
    return child;
  });
}
