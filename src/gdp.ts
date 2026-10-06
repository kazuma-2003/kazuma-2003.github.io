// 流れる帯（ティッカー）に出す各国の GDP。
// ビルドのたびに世界銀行の公開 API から最新値を取り、取れなければ控え（src/data/gdp.json）を使う。
// 控えの更新：npm run update:gdp
import snapshot from './data/gdp.json';

export interface GdpRow { code: string; name: string; year: string; gdp: number; growth: number | null }
export interface GdpData { source: string; fetched: string; rows: GdpRow[] }

// 表示する国・地域（日本語名）。世界合計を先頭に、残りは GDP の大きい順に並べ替える。
export const GDP_COUNTRIES: Record<string, string> = {
  WLD: '世界', USA: '米国', CHN: '中国', DEU: 'ドイツ', JPN: '日本', IND: 'インド', GBR: '英国', FRA: 'フランス',
  ITA: 'イタリア', CAN: 'カナダ', BRA: 'ブラジル', RUS: 'ロシア', KOR: '韓国', AUS: '豪州', ESP: 'スペイン',
  MEX: 'メキシコ', IDN: 'インドネシア',
};

const API = 'https://api.worldbank.org/v2/country';

async function fetchIndicator(indicator: string): Promise<Map<string, { year: string; value: number | null }>> {
  const codes = Object.keys(GDP_COUNTRIES).join(';');
  const res = await fetch(`${API}/${codes}/indicator/${indicator}?format=json&mrv=1&per_page=100`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`World Bank API ${res.status}`);
  const [, rows] = (await res.json()) as [unknown, { countryiso3code: string; date: string; value: number | null }[]];
  return new Map(rows.map((r) => [r.countryiso3code, { year: r.date, value: r.value }]));
}

export async function fetchGdp(): Promise<GdpData> {
  const [gdp, growth] = await Promise.all([fetchIndicator('NY.GDP.MKTP.CD'), fetchIndicator('NY.GDP.MKTP.KD.ZG')]);
  const rows: GdpRow[] = [];
  for (const [code, name] of Object.entries(GDP_COUNTRIES)) {
    const g = gdp.get(code);
    if (!g?.value) continue;
    const gr = growth.get(code);
    rows.push({ code, name, year: g.year, gdp: g.value, growth: gr && gr.year === g.year ? gr.value : null });
  }
  if (rows.length < 5) throw new Error('GDP データが足りません');
  rows.sort((a, b) => (a.code === 'WLD' ? -1 : b.code === 'WLD' ? 1 : b.gdp - a.gdp));
  return { source: '世界銀行 World Development Indicators', fetched: new Date().toISOString().slice(0, 10), rows };
}

let cached: Promise<GdpData> | null = null;

// 全ページで1回だけ取得する。失敗したら控えを使う（ビルドは止めない）。
export function getGdp(): Promise<GdpData> {
  cached ??= fetchGdp().catch((e) => {
    console.warn(`[gdp] 世界銀行から取得できなかったため控えを使います：${e.message}`);
    return snapshot as GdpData;
  });
  return cached;
}

// 30,769,700,000,000 → 「30.77兆ドル」
export function formatUsd(v: number): string {
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}兆ドル`;
  return `${Math.round(v / 1e8).toLocaleString('ja-JP')}億ドル`;
}
