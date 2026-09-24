// 管理画面のエディタ（Milkdown Crepe）。`npm run build:editor` で editor.js / editor.css に束ねる。
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/classic.css';

const JA = {
  [Crepe.Feature.Placeholder]: { text: '本文を書く（「/」で見出し・表・数式などを挿入）', mode: 'doc' },
  [Crepe.Feature.BlockEdit]: {
    textGroup: {
      label: '文章',
      text: { label: '本文' },
      h1: null,
      h2: { label: '大見出し' },
      h3: { label: '小見出し' },
      h4: { label: '見出し（小）' },
      h5: null,
      h6: null,
      quote: { label: '引用' },
      divider: { label: '区切り（＊＊＊）' },
    },
    listGroup: {
      label: '箇条書き',
      bulletList: { label: '箇条書き' },
      orderedList: { label: '番号付き' },
      taskList: null,
    },
    advancedGroup: {
      label: 'その他',
      image: { label: '画像' },
      codeBlock: { label: 'コード' },
      table: { label: '表' },
      math: { label: '数式（独立）' },
    },
  },
  [Crepe.Feature.ImageBlock]: {
    inlineUploadButton: '画像を選ぶ',
    inlineUploadPlaceholderText: 'または画像の URL を貼り付け',
    blockUploadButton: '画像を選ぶ',
    blockUploadPlaceholderText: 'または画像の URL を貼り付け',
    blockCaptionPlaceholderText: '図の説明',
    blockConfirmButton: '確定',
  },
  [Crepe.Feature.LinkTooltip]: { inputPlaceholder: 'リンク先の URL を貼り付け' },
};

/**
 * @param {HTMLElement} root
 * @param {string} markdown
 * @param {{ upload: (file: File) => Promise<string>, onChange?: () => void }} opts
 */
window.createEditor = async function createEditor(root, markdown, opts) {
  const upload = opts.upload;
  const crepe = new Crepe({
    root,
    defaultValue: markdown,
    features: {
      [Crepe.Feature.AI]: false,
      [Crepe.Feature.TopBar]: false,
    },
    featureConfigs: {
      ...JA,
      [Crepe.Feature.ImageBlock]: {
        ...JA[Crepe.Feature.ImageBlock],
        onUpload: upload,
        inlineOnUpload: upload,
        blockOnUpload: upload,
      },
    },
  });
  if (opts.onChange) {
    crepe.on((l) => l.markdownUpdated((_ctx, md, prev) => { if (md !== prev) opts.onChange(); }));
  }
  await crepe.create();
  return {
    getMarkdown: () => crepe.getMarkdown(),
    destroy: () => crepe.destroy(),
  };
};
