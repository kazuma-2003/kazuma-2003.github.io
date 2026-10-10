// 記事に添えるデータセット（Zenodo）。frontmatter の datasets に DOI を書くと、
// ビルド時に Zenodo の公開 API から題名・作成者・版・使用条件・ファイル一覧を取ってくる。
// 書き方の例：10.5281/zenodo.1234567 ／ https://doi.org/10.5281/zenodo.1234567 ／ https://zenodo.org/records/1234567
// 「すべての版」をまとめた DOI（コンセプト DOI）を書くと、常に最新版が表示される。

export interface DatasetFile { name: string; size: number; url: string }
export interface Dataset {
  input: string;
  ok: boolean;
  doi: string;
  doiUrl: string;
  html: string;
  title?: string;
  creators?: string[];
  date?: string;
  version?: string;
  license?: { label: string; url?: string };
  files?: DatasetFile[];
}

// 入力から Zenodo のレコード番号を取り出す
export function zenodoRecordId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/zenodo\.(\d+)/i) ?? s.match(/zenodo\.org\/(?:records|record|deposit)\/(\d+)/i) ?? s.match(/^(\d{5,})$/);
  return m ? m[1] : null;
}

const LICENSES: Record<string, { label: string; url: string }> = {
  'cc-by-4.0': { label: 'CC BY 4.0（出典を示せば自由に利用可）', url: 'https://creativecommons.org/licenses/by/4.0/deed.ja' },
  'cc-by-sa-4.0': { label: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.ja' },
  'cc-by-nc-4.0': { label: 'CC BY-NC 4.0（非営利に限る）', url: 'https://creativecommons.org/licenses/by-nc/4.0/deed.ja' },
  'cc-by-nd-4.0': { label: 'CC BY-ND 4.0', url: 'https://creativecommons.org/licenses/by-nd/4.0/deed.ja' },
  'cc0-1.0': { label: 'CC0 1.0（権利放棄・自由に利用可）', url: 'https://creativecommons.org/publicdomain/zero/1.0/deed.ja' },
};

// Zenodo は名乗り（User-Agent）が無い・"node" のままの問い合わせを 403 で断るので、ブログ名を名乗る
export const ZENODO_HEADERS = { 'User-Agent': 'sekai-keizai-ronko/1.0 (+https://kazuma-2003.github.io)', Accept: 'application/json' };

const cache = new Map<string, Promise<Dataset>>();

async function fetchDataset(input: string): Promise<Dataset> {
  const id = zenodoRecordId(input);
  const fallbackDoi = id ? `10.5281/zenodo.${id}` : input.trim();
  const base: Dataset = {
    input, ok: false, doi: fallbackDoi, doiUrl: `https://doi.org/${fallbackDoi}`,
    html: id ? `https://zenodo.org/records/${id}` : `https://doi.org/${fallbackDoi}`,
  };
  if (!id) return base;
  try {
    // コンセプト番号なら最新版に転送される
    const res = await fetch(`https://zenodo.org/api/records/${id}`, { headers: ZENODO_HEADERS, signal: AbortSignal.timeout(45000), redirect: 'follow' });
    if (!res.ok) throw new Error(`Zenodo API ${res.status}`);
    const r = await res.json();
    const m = r.metadata ?? {};
    const lic = m.license?.id ? LICENSES[m.license.id] ?? { label: String(m.license.id).toUpperCase() } : undefined;
    return {
      ...base,
      ok: true,
      doi: r.doi ?? base.doi,
      doiUrl: `https://doi.org/${r.doi ?? base.doi}`,
      html: r.links?.self_html ?? base.html,
      title: m.title,
      creators: (m.creators ?? []).map((c: { name: string }) => c.name),
      date: m.publication_date,
      version: m.version ?? undefined,
      license: lic,
      files: (r.files ?? []).map((f: { key: string; size: number }) => ({
        name: f.key,
        size: f.size,
        url: `https://zenodo.org/records/${r.id}/files/${encodeURIComponent(f.key)}?download=1`,
      })),
    };
  } catch (e) {
    console.warn(`[zenodo] ${input} の情報を取得できませんでした：${(e as Error).message}`);
    return base;
  }
}

export function getDataset(input: string): Promise<Dataset> {
  if (!cache.has(input)) cache.set(input, fetchDataset(input));
  return cache.get(input)!;
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

// 引用の書き方（APA 形式に近い形）
export function citation(d: Dataset, fallbackAuthor: string): string {
  const who = d.creators?.length ? d.creators.join(', ') : fallbackAuthor;
  const year = d.date ? d.date.slice(0, 4) : '';
  const ver = d.version ? ` (Version ${d.version})` : '';
  const head = year ? `${who} (${year}).` : who.endsWith('.') ? who : `${who}.`;
  return `${head} ${d.title ?? 'Dataset'}${ver} [Data set]. Zenodo. ${d.doiUrl}`;
}
