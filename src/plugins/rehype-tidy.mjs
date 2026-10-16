// 本文の表示を整える（記事のファイルは書き換えない）。
// - 段落の外にある改行だけの行（<br>）を取り除く。管理画面のエディタで Enter を続けて押すと
//   空の段落が <br /> として保存され、段落の間や記事の末尾に大きな空きができるため。
// - 中身が空の見出しを取り除く。
export default function rehypeTidy() {
  return (tree) => {
    const isBlank = (n) => n.type === 'text' && !n.value.trim();
    // Markdown に直接書かれた <br /> は raw（生の HTML）として来る
    const isBr = (n) => (n.type === 'element' && n.tagName === 'br') || (n.type === 'raw' && /^\s*<br\s*\/?>\s*$/i.test(n.value));
    const isEmptyHeading = (n) =>
      n.type === 'element' && /^h[1-6]$/.test(n.tagName) &&
      !n.children.some((c) => !(isBlank(c) || isBr(c)));
    tree.children = tree.children.filter((n) => !isBr(n) && !isEmptyHeading(n));
    // 取り除いた後に連続した空白の文字ノードを1つにまとめる
    tree.children = tree.children.filter((n, i, arr) => !(isBlank(n) && i > 0 && isBlank(arr[i - 1])));
  };
}
