// GDP の控え（src/data/gdp.json）を世界銀行の最新値で更新する：npm run update:gdp
// ふだんはビルド時に最新値を取るので、控えは API に繋がらないときの予備。
import { mkdirSync, writeFileSync } from 'node:fs';

const COUNTRIES = {
  WLD: '世界', USA: '米国', CHN: '中国', DEU: 'ドイツ', JPN: '日本', IND: 'インド', GBR: '英国', FRA: 'フランス',
  ITA: 'イタリア', CAN: 'カナダ', BRA: 'ブラジル', RUS: 'ロシア', KOR: '韓国', AUS: '豪州', ESP: 'スペイン',
  MEX: 'メキシコ', IDN: 'インドネシア',
};
const API = 'https://api.worldbank.org/v2/country';

async function indicator(id) {
  const res = await fetch(`${API}/${Object.keys(COUNTRIES).join(';')}/indicator/${id}?format=json&mrv=1&per_page=100`);
  const [, rows] = await res.json();
  return new Map(rows.map((r) => [r.countryiso3code, { year: r.date, value: r.value }]));
}

const [gdp, growth] = await Promise.all([indicator('NY.GDP.MKTP.CD'), indicator('NY.GDP.MKTP.KD.ZG')]);
const rows = Object.entries(COUNTRIES).flatMap(([code, name]) => {
  const g = gdp.get(code);
  if (!g?.value) return [];
  const gr = growth.get(code);
  return [{ code, name, year: g.year, gdp: g.value, growth: gr && gr.year === g.year ? gr.value : null }];
});
rows.sort((a, b) => (a.code === 'WLD' ? -1 : b.code === 'WLD' ? 1 : b.gdp - a.gdp));
mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/gdp.json', JSON.stringify({ source: '世界銀行 World Development Indicators', fetched: new Date().toISOString().slice(0, 10), rows }, null, 2) + '\n');
console.log(`更新しました：${rows.length} か国・地域（${rows[0]?.year} 年）`);
