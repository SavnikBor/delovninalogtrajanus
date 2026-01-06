import React, { useMemo, useState } from 'react';

type Nalog = {
  stevilkaNaloga: number;
  podatki?: any;
};

type CategoryKey =
  | 'graficnaPriprava'
  | 'cenaKlišeja'
  | 'cenaIzsekovalnegaOrodja'
  | 'cenaVzorca'
  | 'cenaBrezDDV';

type Category = {
  key: CategoryKey;
  label: string;
  color: string;
};

const CATEGORIES: Category[] = [
  { key: 'graficnaPriprava', label: 'Grafična priprava', color: '#2563eb' }, // blue-600
  { key: 'cenaKlišeja', label: 'Kliše', color: '#9333ea' }, // purple-600
  { key: 'cenaIzsekovalnegaOrodja', label: 'Izsekovalno orodje', color: '#16a34a' }, // green-600
  { key: 'cenaVzorca', label: 'Vzorec', color: '#f59e0b' }, // amber-500
  { key: 'cenaBrezDDV', label: 'Cena brez DDV', color: '#dc2626' }, // red-600
];

function parseMoney(input?: string): number {
  if (input == null) return 0;
  let s = String(input).trim();
  if (s === '') return 0;
  // remove spaces
  s = s.replace(/\s/g, '');
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function monthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// ISO week helpers
function getISOWeekParts(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function weekKey(date: Date): string {
  const { year, week } = getISOWeekParts(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function enumerateBusinessDays(fromDate: string, toDate: string): string[] {
  const start = new Date(fromDate);
  const end = new Date(toDate);
  const out: string[] = [];
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return out;
  let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cur <= end) {
    const dow = cur.getDay(); // 0=Sun,6=Sat
    if (dow !== 0 && dow !== 6) {
      out.push(dateKey(cur));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function parseWeekKey(input: string): { year: number; week: number } | null {
  const m = input && input.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  return { year: parseInt(m[1], 10), week: parseInt(m[2], 10) };
}

function weekKeyToDate(yk: { year: number; week: number }): Date {
  const simple = new Date(Date.UTC(yk.year, 0, 1 + (yk.week - 1) * 7));
  const dayOfWeek = simple.getUTCDay();
  const ISOweekStart = simple;
  if (dayOfWeek <= 4 && dayOfWeek > 0) ISOweekStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  else ISOweekStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  return new Date(ISOweekStart.getFullYear(), ISOweekStart.getMonth(), ISOweekStart.getDate());
}

function enumerateWeeks(fromWeek: string, toWeek: string): string[] {
  const pFrom = parseWeekKey(fromWeek);
  const pTo = parseWeekKey(toWeek);
  if (!pFrom || !pTo) return [];
  const start = weekKeyToDate(pFrom);
  const end = weekKeyToDate(pTo);
  const weeks: string[] = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cur <= end) {
    weeks.push(weekKey(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

function parseDateOrNull(v?: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getNalogDate(nalog: Nalog): Date | null {
  const p = (nalog as any)?.podatki || {};
  const d =
    parseDateOrNull(p.datumNarocila) ||
    parseDateOrNull(p.rokIzdelave) ||
    parseDateOrNull((nalog as any)?.datumNarocila) ||
    parseDateOrNull((nalog as any)?.rokIzdelave);
  return d;
}

function enumerateMonths(from: string, to: string): string[] {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  let y = fy;
  let m = fm;
  const out: string[] = [];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

const Analiza: React.FC<{ nalogi: Nalog[] }> = ({ nalogi }) => {
  // Build list of all months present in data
  const allMonths = useMemo(() => {
    const set = new Set<string>();
    (nalogi || []).forEach(n => {
      const d = getNalogDate(n);
      if (d) set.add(monthKey(d));
    });
    const arr = Array.from(set).sort();
    return arr;
  }, [nalogi]);

  const defaultFrom = allMonths[0] || `${new Date().getFullYear()}-01`;
  const defaultTo = allMonths[allMonths.length - 1] || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const [fromMonth, setFromMonth] = useState<string>(defaultFrom);
  const [toMonth, setToMonth] = useState<string>(defaultTo);
  const [visible, setVisible] = useState<Record<CategoryKey, boolean>>(() => {
    const map: Record<CategoryKey, boolean> = {
      graficnaPriprava: true,
      cenaKlišeja: true,
      cenaIzsekovalnegaOrodja: true,
      cenaVzorca: true,
      cenaBrezDDV: true,
    };
    return map;
  });

  // Aggregate revenue per month per category
  const { months, dataByMonth, maxStack } = useMemo(() => {
    const months = enumerateMonths(fromMonth, toMonth);
    const initRow = () => ({
      graficnaPriprava: 0,
      cenaKlišeja: 0,
      cenaIzsekovalnegaOrodja: 0,
      cenaVzorca: 0,
      cenaBrezDDV: 0,
      total: 0,
    });
    const rows: Record<string, ReturnType<typeof initRow>> = {};
    months.forEach(m => (rows[m] = initRow()));

    (nalogi || []).forEach(n => {
      const d = getNalogDate(n);
      if (!d) return;
      const key = monthKey(d);
      if (!rows[key]) return; // outside selected range
      const p = (n as any)?.podatki || {};
      const s1 = p?.stroski1 || p?.stroski?.stroski1 || {};
      const s2 = p?.stroski2 || p?.stroski?.stroski2 || {};
      const add = (cat: CategoryKey, val: number) => {
        rows[key][cat] += val;
        rows[key].total += val;
      };
      // Sum both stroski1 and stroski2
      add('graficnaPriprava', parseMoney(s1.graficnaPriprava) + parseMoney(s2.graficnaPriprava));
      add('cenaKlišeja', parseMoney(s1.cenaKlišeja) + parseMoney(s2.cenaKlišeja));
      add('cenaIzsekovalnegaOrodja', parseMoney(s1.cenaIzsekovalnegaOrodja) + parseMoney(s2.cenaIzsekovalnegaOrodja));
      add('cenaVzorca', parseMoney(s1.cenaVzorca) + parseMoney(s2.cenaVzorca));
      add('cenaBrezDDV', parseMoney(s1.cenaBrezDDV) + parseMoney(s2.cenaBrezDDV));
    });

    let max = 0;
    months.forEach(m => {
      if (rows[m].total > max) max = rows[m].total;
    });

    return { months, dataByMonth: rows, maxStack: max };
  }, [nalogi, fromMonth, toMonth]);

  const formatEUR = (n: number) =>
    new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n);

  // Simple stacked bar chart via SVG (no extra deps)
  const chartWidth = Math.max(720, months.length * 56);
  const chartHeight = 360;
  const paddingLeft = 54;
  const paddingBottom = 28;
  const innerWidth = chartWidth - paddingLeft - 16;
  const innerHeight = chartHeight - paddingBottom - 16;
  const barW = Math.max(12, Math.floor(innerWidth / Math.max(1, months.length) * 0.6));
  const stepX = innerWidth / Math.max(1, months.length);
  const scaleY = (v: number) => (maxStack > 0 ? (v / maxStack) * innerHeight : 0);

  const seriesOrder = CATEGORIES;
  const trendPoints = months.map((m, idx) => {
    const total = (dataByMonth[m] as any)?.total || 0;
    const x = paddingLeft + idx * stepX + (stepX - barW) / 2 + barW / 2;
    const y = 8 + (innerHeight - scaleY(total));
    return `${x},${y}`;
  });

  return (
    <div className="p-6">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Analiza – KPI: Prihodek</h2>
        <p className="text-gray-600">Mesečni pregled prihodkov po postavkah iz delovnih nalogov.</p>
      </div>

      <div className="bg-white border rounded-lg p-4 mb-4">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Od meseca</label>
            <input
              type="month"
              value={fromMonth}
              onChange={(e) => setFromMonth(e.target.value)}
              className="border rounded px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Do meseca</label>
            <input
              type="month"
              value={toMonth}
              onChange={(e) => setToMonth(e.target.value)}
              className="border rounded px-2 py-1"
            />
          </div>
          <div className="md:ml-auto flex flex-wrap gap-3">
          {seriesOrder.map(cat => {
            const checked = !!visible[cat.key];
            return (
              <label key={cat.key} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setVisible(v => ({ ...v, [cat.key]: !v[cat.key] }))}
                />
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: cat.color }}></span>
                  {cat.label}
                </span>
              </label>
            );
          })}
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4 overflow-auto">
        <svg width={chartWidth} height={chartHeight}>
          {/* Y axis and ticks */}
          <g transform={`translate(${paddingLeft}, 8)`}>
            {/* Y axis line */}
            <line x1={0} y1={0} x2={0} y2={innerHeight} stroke="#9ca3af" strokeWidth={1} />
            {/* Y ticks: 0%, 25%, 50%, 75%, 100% */}
            {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
              const y = innerHeight - p * innerHeight;
              const val = maxStack * p;
              return (
                <g key={i}>
                  <line x1={0} y1={y} x2={innerWidth} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" />
                  <text x={-8} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#6b7280">
                    {formatEUR(val)}
                  </text>
                </g>
              );
            })}

            {/* Bars */}
            {months.map((m, idx) => {
              const x = idx * stepX + (stepX - barW) / 2;
              // Build stack with only visible series
              const parts = seriesOrder
                .filter(s => visible[s.key])
                .map(s => ({ key: s.key, color: s.color, value: (dataByMonth[m] as any)[s.key] as number }));
              let yCursor = innerHeight;
              return (
                <g key={m}>
                  {parts.map((p, i) => {
                    const h = scaleY(p.value);
                    const y = yCursor - h;
                    yCursor = y;
                    return (
                      <rect
                        key={p.key}
                        x={x}
                        y={y}
                        width={barW}
                        height={h}
                        fill={p.color}
                        opacity={0.9}
                      />
                    );
                  })}
                  {/* Month label */}
                  <text
                    x={x + barW / 2}
                    y={innerHeight + 14}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#374151"
                  >
                    {m}
                  </text>
                </g>
              );
            })}
          </g>
          {/* Trend line over totals */}
          {months.length > 1 && (
            <polyline
              points={trendPoints.join(' ')}
              fill="none"
              stroke="#0ea5e9"
              strokeWidth={2}
            />
          )}
        </svg>
      </div>

      <div className="bg-white border rounded-lg p-4 mt-4 overflow-auto">
        <h3 className="text-lg font-semibold mb-2">Tabela – mesečni zneski</h3>
        <table className="min-w-full border border-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 border-b">Mesec</th>
              {seriesOrder.map(cat => (
                <th key={cat.key} className="text-right px-3 py-2 border-b">{cat.label}</th>
              ))}
              <th className="text-right px-3 py-2 border-b">Skupaj</th>
            </tr>
          </thead>
          <tbody>
            {months.map(m => (
              <tr key={m} className="odd:bg-white even:bg-gray-50">
                <td className="px-3 py-2 border-b">{m}</td>
                {seriesOrder.map(cat => (
                  <td key={cat.key} className="text-right px-3 py-2 border-b">
                    {formatEUR((dataByMonth[m] as any)[cat.key] || 0)}
                  </td>
                ))}
                <td className="text-right px-3 py-2 border-b font-semibold">
                  {formatEUR((dataByMonth[m] as any).total || 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* KPI: Tehnologi */}
      <div className="mt-8 mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Analiza – KPI: Tehnologi</h2>
        <p className="text-gray-600">Število nalogov in vrednost nalogov po tehnologih v izbranem obdobju.</p>
      </div>

      <TehnologiKPI nalogi={nalogi} />

      {/* KPI: Produkti */}
      <div className="mt-8 mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Analiza – KPI: Produkti</h2>
        <p className="text-gray-600">Število in vrednost po skupinah produktov v izbranem obdobju.</p>
      </div>
      <ProduktiKPI nalogi={nalogi} />
    </div>
  );
};

export default Analiza;

// ---------- Tehnologi KPI ----------

type TechKey = 'Bor' | 'Stane' | 'Tomaž' | 'Rok';

function normalizeText(input: any): string {
  if (input == null) return '';
  const s = typeof input === 'string' ? input : String(input);
  // Remove diacritics, spaces and non-letters, lowercase
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '');
}

function extractKomentar(komentarField: any): string {
  // komentarField lahko vsebuje string ali objekt { komentar: string }
  if (typeof komentarField === 'string') return komentarField;
  if (komentarField && typeof komentarField === 'object') {
    if (typeof komentarField.komentar === 'string') return komentarField.komentar;
    // fallback: preglej morebitne string vrednosti v objektu
    for (const v of Object.values(komentarField)) {
      if (typeof v === 'string') return v;
    }
  }
  return '';
}

function detectTechnologist(komentarField: any): TechKey | null {
  const t = normalizeText(extractKomentar(komentarField));
  if (!t) return null;
  // Rok variants: rok, r ok, rrok, rokk ...
  if (t.includes('rok')) return 'Rok';
  // Bor variants: bor, BOR, boR, b or; and also count "rob" as Bor
  if (t.includes('bor') || t.includes('rob')) return 'Bor';
  // Tomaz variants: tomaz, tomaz with diacritics removed, tomaž, tomas
  if (t.includes('tomaz') || t.includes('tomas')) return 'Tomaž';
  // Stane variants: stane, stan, tane
  if (t.includes('stane') || t.includes('stan') || t.includes('tane')) return 'Stane';
  return null;
}

const TehnologiKPI: React.FC<{ nalogi: any[] }> = ({ nalogi }) => {
  const allWeeks = useMemo(() => {
    const set = new Set<string>();
    (nalogi || []).forEach(n => {
      const d = getNalogDate(n);
      if (d) set.add(weekKey(d));
    });
    return Array.from(set).sort();
  }, [nalogi]);
  const [fromWeek, setFromWeek] = React.useState<string>(allWeeks[0] || `${new Date().getFullYear()}-W01`);
  const [toWeek, setToWeek] = React.useState<string>(allWeeks[allWeeks.length - 1] || `${new Date().getFullYear()}-W${String(getISOWeekParts(new Date()).week).padStart(2,'0')}`);
  const weeks = useMemo(() => enumerateWeeks(fromWeek, toWeek), [fromWeek, toWeek]);

  const agg = useMemo(() => {
    const res: Record<TechKey, { count: number; value: number }> = {
      Bor: { count: 0, value: 0 },
      Stane: { count: 0, value: 0 },
      Tomaž: { count: 0, value: 0 },
      Rok: { count: 0, value: 0 },
    };
    (nalogi || []).forEach(n => {
      const d = getNalogDate(n);
      if (!d) return;
      const key = weekKey(d);
      if (!weeks.includes(key)) return;
      const p = (n as any)?.podatki || {};
      const who = detectTechnologist(p?.komentar);
      if (!who) return;
      const s1 = p?.stroski1 || p?.stroski?.stroski1 || {};
      const s2 = p?.stroski2 || p?.stroski?.stroski2 || {};
      const val =
        parseMoney(s1.graficnaPriprava) +
        parseMoney(s1.cenaKlišeja) +
        parseMoney(s1.cenaIzsekovalnegaOrodja) +
        parseMoney(s1.cenaVzorca) +
        parseMoney(s1.cenaBrezDDV) +
        parseMoney(s2.graficnaPriprava) +
        parseMoney(s2.cenaKlišeja) +
        parseMoney(s2.cenaIzsekovalnegaOrodja) +
        parseMoney(s2.cenaVzorca) +
        parseMoney(s2.cenaBrezDDV);
      res[who].count += 1;
      res[who].value += val;
    });
    return res;
  }, [nalogi, weeks]);

  const techs: TechKey[] = ['Bor', 'Stane', 'Tomaž', 'Rok'];
  const maxCount = Math.max(1, ...techs.map(t => agg[t].count));
  const maxValue = Math.max(1, ...techs.map(t => agg[t].value));

  // Counts chart
  const countsWidth = 640;
  const countsHeight = 220;
  const cPadL = 32;
  const cPadB = 26;
  const cInnerW = countsWidth - cPadL - 12;
  const cInnerH = countsHeight - cPadB - 12;
  const cBarW = Math.max(20, Math.floor(cInnerW / techs.length * 0.6));
  const cStepX = cInnerW / techs.length;

  // Values chart
  const valsWidth = 640;
  const valsHeight = 260;
  const vPadL = 64;
  const vPadB = 26;
  const vInnerW = valsWidth - vPadL - 12;
  const vInnerH = valsHeight - vPadB - 12;
  const vBarW = Math.max(20, Math.floor(vInnerW / techs.length * 0.6));
  const vStepX = vInnerW / techs.length;

  const formatEUR = (n: number) =>
    new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n);

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Od tedna</label>
          <input type="week" value={fromWeek} onChange={e => setFromWeek(e.target.value)} className="border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Do tedna</label>
          <input type="week" value={toWeek} onChange={e => setToWeek(e.target.value)} className="border rounded px-2 py-1" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="font-semibold mb-2">Število nalogov po tehnologih</h4>
          <svg width={countsWidth} height={countsHeight}>
            <g transform={`translate(${cPadL}, 8)`}>
              <line x1={0} y1={0} x2={0} y2={cInnerH} stroke="#9ca3af" strokeWidth={1} />
              {[0, 0.5, 1].map((p, i) => {
                const y = cInnerH - p * cInnerH;
                const val = Math.round(maxCount * p);
                return (
                  <g key={i}>
                    <line x1={0} y1={y} x2={cInnerW} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" />
                    <text x={-6} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#6b7280">
                      {val}
                    </text>
                  </g>
                );
              })}
              {techs.map((t, i) => {
                const x = i * cStepX + (cStepX - cBarW) / 2;
                const h = (agg[t].count / maxCount) * cInnerH;
                const y = cInnerH - h;
                return (
                  <g key={t}>
                    <rect x={x} y={y} width={cBarW} height={h} fill="#2563eb" />
                    <text x={x + cBarW / 2} y={cInnerH + 14} fontSize="10" textAnchor="middle" fill="#374151">
                      {t}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        <div>
          <h4 className="font-semibold mb-2">Vrednost nalogov po tehnologih</h4>
          <svg width={valsWidth} height={valsHeight}>
            <g transform={`translate(${vPadL}, 8)`}>
              <line x1={0} y1={0} x2={0} y2={vInnerH} stroke="#9ca3af" strokeWidth={1} />
              {[0, 0.5, 1].map((p, i) => {
                const y = vInnerH - p * vInnerH;
                const val = maxValue * p;
                return (
                  <g key={i}>
                    <line x1={0} y1={y} x2={vInnerW} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" />
                    <text x={-8} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#6b7280">
                      {formatEUR(val)}
                    </text>
                  </g>
                );
              })}
              {techs.map((t, i) => {
                const x = i * vStepX + (vStepX - vBarW) / 2;
                const h = (agg[t].value / maxValue) * vInnerH;
                const y = vInnerH - h;
                return (
                  <g key={t}>
                    <rect x={x} y={y} width={vBarW} height={h} fill="#16a34a" />
                    <text x={x + vBarW / 2} y={vInnerH + 14} fontSize="10" textAnchor="middle" fill="#374151">
                      {t}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </div>

      {/* Trend: tedensko, vsaka krivulja po tehnologu */}
      <TechWeeklyMultiLine nalogi={nalogi} weeks={weeks} />

      <div className="mt-6 overflow-auto">
        <table className="min-w-full border border-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 border-b">Tehnolog</th>
              <th className="text-right px-3 py-2 border-b">Število nalogov</th>
              <th className="text-right px-3 py-2 border-b">Vrednost nalogov</th>
            </tr>
          </thead>
          <tbody>
            {techs.map(t => (
              <tr key={t} className="odd:bg-white even:bg-gray-50">
                <td className="px-3 py-2 border-b">{t}</td>
                <td className="text-right px-3 py-2 border-b">{agg[t].count}</td>
                <td className="text-right px-3 py-2 border-b">{formatEUR(agg[t].value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Generic monthly trend line component
/* eslint-disable @typescript-eslint/no-unused-vars */
const TrendLineMonths: React.FC<{
  nalogi: any[];
  months: string[];
  title: string;
  valueSelector: (nalog: any) => number;
  color: string;
  valueFormat: (n: number) => string;
}> = ({ nalogi, months, title, valueSelector, color, valueFormat }) => {
  const monthly = useMemo(() => {
    const map = new Map<string, number>();
    months.forEach(m => map.set(m, 0));
    (nalogi || []).forEach(n => {
      const d = getNalogDate(n);
      if (!d) return;
      const k = monthKey(d);
      if (!map.has(k)) return;
      map.set(k, (map.get(k) || 0) + (valueSelector(n) || 0));
    });
    return months.map(m => ({ m, v: map.get(m) || 0 }));
  }, [nalogi, months, valueSelector]);
  const width = Math.max(480, months.length * 48);
  const height = 200;
  const padL = 54;
  const padB = 24;
  const innerW = width - padL - 12;
  const innerH = height - padB - 12;
  const stepX = innerW / Math.max(1, months.length - 1);
  const maxV = Math.max(1, ...monthly.map(x => x.v));
  const scaleY = (v: number) => (v / maxV) * innerH;
  const points = monthly.map((x, i) => {
    const xPos = padL + (months.length === 1 ? innerW / 2 : i * stepX);
    const yPos = 8 + (innerH - scaleY(x.v));
    return `${xPos},${yPos}`;
  }).join(' ');
  return (
    <div className="bg-white border rounded-lg p-3 overflow-auto">
      <div className="font-semibold mb-2">{title}</div>
      <svg width={width} height={height}>
        <g transform={`translate(${padL}, 8)`}>
          <line x1={0} y1={0} x2={0} y2={innerH} stroke="#9ca3af" strokeWidth={1} />
          {[0, 0.5, 1].map((p, i) => {
            const y = innerH - p * innerH;
            const val = maxV * p;
            return (
              <g key={i}>
                <line x1={0} y1={y} x2={innerW} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" />
                <text x={-8} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#6b7280">
                  {valueFormat(val)}
                </text>
              </g>
            );
          })}
          {months.map((m, i) => (
            <text key={m} x={(months.length === 1 ? innerW / 2 : i * stepX)} y={innerH + 14} fontSize="10" textAnchor="middle" fill="#374151">{m}</text>
          ))}
        </g>
        {months.length > 0 && (
          <polyline points={points} fill="none" stroke={color} strokeWidth={2} />
        )}
      </svg>
    </div>
  );
};
/* eslint-enable @typescript-eslint/no-unused-vars */

// ---------- Produktski KPI ----------

type ProduktSkupina =
  | 'Embalaža'
  | 'Vizitke'
  | 'Katalog/Brošura'
  | 'Nalepka'
  | 'Plakat'
  | 'Zgibanka'
  | 'Letak'
  | 'Kuverta'
  | 'Dopisni list'
  | 'Mapa'
  | 'Bloki'
  | 'Vabila'
  | 'Wobbler'
  | 'Koledar'
  | 'Darilni bon'
  | 'Drugo';

function normalizeForProduct(s: any): string {
  if (s == null) return '';
  const str = typeof s === 'string' ? s : String(s);
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function classifyProdukt(predmet?: string): ProduktSkupina | null {
  const t = normalizeForProduct(predmet);
  if (!t) return null;
  // 1) Embalaža
  if (t.includes('embalaza') || t.includes('embal') || t.includes('skatla') || t.includes('skatlica') || t.includes('skat')) return 'Embalaža';
  // 2) Vizitke
  if (t.includes('vizitk')) return 'Vizitke';
  // 3) Katalog/Brošura
  if (t.includes('knjig') || t.includes('knjiz') || t.includes('publikac') || t.includes('brozur') || t.includes('brosur') || t.includes('slikanic') || t.includes('revij') || t.includes('katalog')) return 'Katalog/Brošura';
  // 4) Nalepka
  if (t.includes('nalepk') || t.includes('etiket') || t.includes('sticker') || t.includes('label')) return 'Nalepka';
  // 5) Plakat
  if (t.includes('plakat') || t.includes('transparent')) return 'Plakat';
  // 6) Zgibanka
  if (t.includes('zgibank') || t.includes('folder')) return 'Zgibanka';
  // 7) Letak
  if (t.includes('letak') || t.includes('flyer')) return 'Letak';
  // 8) Kuverta (AMBO/AMBLO, formati C4/C3 itd.)
  if (t.includes('kuvert') || t.includes('ambo') || t.includes('amblo') || /\bc[0-9]\b/.test(t)) return 'Kuverta';
  // 9) Dopisni list
  if (t.includes('dopisni') || t.includes('dopisi')) return 'Dopisni list';
  // 10) Mapa
  if (t.includes('mapa') || t.includes('mapica')) return 'Mapa';
  // 11) Bloki
  if (t.includes('blok')) return 'Bloki';
  // 12) Vabila
  if (t.includes('vabil') || t.includes('invitation')) return 'Vabila';
  // 13) Wobbler
  if (t.includes('wobbler') || t.includes('wobler') || t.includes('vobler') || t.includes('vobbler') || t.includes('obesnik')) return 'Wobbler';
  // 14) Koledar
  if (t.includes('koledar') || t.includes('chalander') || t.includes('koledarcek')) return 'Koledar';
  // 15) Darilni bon
  if ((t.includes('darilni') && t.includes('bon')) || t.includes('darilnibon') || t === 'bon' || t.includes(' bon')) return 'Darilni bon';
  return null;
}

const produktSkupine: ProduktSkupina[] = ['Embalaža','Vizitke','Katalog/Brošura','Nalepka','Plakat','Zgibanka','Letak','Kuverta','Dopisni list','Mapa','Bloki','Vabila','Wobbler','Koledar','Darilni bon','Drugo'];

const ProduktiKPI: React.FC<{ nalogi: any[] }> = ({ nalogi }) => {
  const allWeeks = useMemo(() => {
    const set = new Set<string>();
    (nalogi || []).forEach(n => {
      const d = getNalogDate(n);
      if (d) set.add(weekKey(d));
    });
    return Array.from(set).sort();
  }, [nalogi]);
  const [fromWeek, setFromWeek] = React.useState<string>(allWeeks[0] || `${new Date().getFullYear()}-W01`);
  const [toWeek, setToWeek] = React.useState<string>(allWeeks[allWeeks.length - 1] || `${new Date().getFullYear()}-W${String(getISOWeekParts(new Date()).week).padStart(2,'0')}`);
  const weeks = useMemo(() => enumerateWeeks(fromWeek, toWeek), [fromWeek, toWeek]);
  const [visible, setVisible] = React.useState<Record<ProduktSkupina, boolean>>(() => {
    const m: Record<ProduktSkupina, boolean> = {} as any;
    produktSkupine.forEach(g => { m[g] = true; });
    return m;
  });

  const agg = useMemo(() => {
    const counts: Record<ProduktSkupina, number> = Object.fromEntries(produktSkupine.map(k => [k, 0])) as any;
    const values: Record<ProduktSkupina, number> = Object.fromEntries(produktSkupine.map(k => [k, 0])) as any;
    (nalogi || []).forEach(n => {
      const d = getNalogDate(n);
      if (!d) return;
      const k = weekKey(d);
      if (!weeks.includes(k)) return;
      const p = (n as any)?.podatki || {};
      const t1 = p?.tisk?.tisk1?.predmet || '';
      const t2 = p?.tisk?.tisk2?.predmet || '';
      const g1 = classifyProdukt(t1);
      const g2 = classifyProdukt(t2);
      const matched: ProduktSkupina[] = [];
      if (g1) matched.push(g1);
      if (g2) matched.push(g2);
      if (matched.length === 0) matched.push('Drugo');
      // counts: št. pojavitev
      matched.forEach(g => { counts[g] = (counts[g] || 0) + 1; });
      // value: razdeli med skupine
      const s1 = p?.stroski1 || p?.stroski?.stroski1 || {};
      const s2 = p?.stroski2 || p?.stroski?.stroski2 || {};
      const total =
        parseMoney(s1.graficnaPriprava) + parseMoney(s1.cenaKlišeja) + parseMoney(s1.cenaIzsekovalnegaOrodja) + parseMoney(s1.cenaVzorca) + parseMoney(s1.cenaBrezDDV) +
        parseMoney(s2.graficnaPriprava) + parseMoney(s2.cenaKlišeja) + parseMoney(s2.cenaIzsekovalnegaOrodja) + parseMoney(s2.cenaVzorca) + parseMoney(s2.cenaBrezDDV);
      const share = matched.length > 0 ? total / matched.length : 0;
      matched.forEach(g => { values[g] = (values[g] || 0) + share; });
    });
    return { counts, values };
  }, [nalogi, weeks]);

  const groups = produktSkupine;
  const maxCount = Math.max(1, ...groups.map(g => agg.counts[g]));
  const maxValue = Math.max(1, ...groups.map(g => agg.values[g]));
  const width = 880;
  const height = 280;
  const padL = 100;
  const padB = 28;
  const innerW = width - padL - 16;
  const innerH = height - padB - 16;
  const barW = Math.max(18, Math.floor(innerW / groups.length * 0.6));
  const stepX = innerW / groups.length;
  const formatEUR = (n: number) => new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(n);

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Od tedna</label>
          <input type="week" value={fromWeek} onChange={e => setFromWeek(e.target.value)} className="border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Do tedna</label>
          <input type="week" value={toWeek} onChange={e => setToWeek(e.target.value)} className="border rounded px-2 py-1" />
        </div>
        <div className="ml-auto flex flex-wrap gap-3">
          {produktSkupine.map(g => (
            <label key={g} className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!visible[g]} onChange={() => setVisible(v => ({ ...v, [g]: !v[g] }))} />
              <span>{g}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="overflow-auto">
          <h4 className="font-semibold mb-2">Število produktov po skupinah</h4>
          <svg width={width} height={height}>
            <g transform={`translate(${padL}, 8)`}>
              <line x1={0} y1={0} x2={0} y2={innerH} stroke="#9ca3af" strokeWidth={1} />
              {[0, 0.5, 1].map((p, i) => {
                const y = innerH - p * innerH;
                const val = Math.round(maxCount * p);
                return (
                  <g key={i}>
                    <line x1={0} y1={y} x2={innerW} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" />
                    <text x={-8} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#6b7280">
                      {val}
                    </text>
                  </g>
                );
              })}
              {groups.map((grp, idx) => {
                const x = idx * stepX + (stepX - barW) / 2;
                const h = (agg.counts[grp as ProduktSkupina] / maxCount) * innerH;
                const y = innerH - h;
                return (
                  <g key={grp}>
                    <rect x={x} y={y} width={barW} height={h} fill="#64748b" />
                    <text x={x + barW / 2} y={innerH + 14} fontSize="10" textAnchor="middle" fill="#374151">
                      {grp}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        <div className="overflow-auto">
          <h4 className="font-semibold mb-2">Vrednost produktov po skupinah</h4>
          <svg width={width} height={height}>
            <g transform={`translate(${padL}, 8)`}>
              <line x1={0} y1={0} x2={0} y2={innerH} stroke="#9ca3af" strokeWidth={1} />
              {[0, 0.5, 1].map((p, i) => {
                const y = innerH - p * innerH;
                const val = maxValue * p;
                return (
                  <g key={i}>
                    <line x1={0} y1={y} x2={innerW} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" />
                    <text x={-8} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#6b7280">
                      {formatEUR(val)}
                    </text>
                  </g>
                );
              })}
              {groups.map((grp, idx) => {
                const x = idx * stepX + (stepX - barW) / 2;
                const h = (agg.values[grp as ProduktSkupina] / maxValue) * innerH;
                const y = innerH - h;
                return (
                  <g key={grp}>
                    <rect x={x} y={y} width={barW} height={h} fill="#0ea5e9" />
                    <text x={x + barW / 2} y={innerH + 14} fontSize="10" textAnchor="middle" fill="#374151">
                      {grp}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </div>

      {/* Trend: tedensko, multi-line po produktih */}
      <ProductsWeeklyMultiLine nalogi={nalogi} weeks={weeks} visible={visible} />
    </div>
  );
};

// Multi-line chart for technologists (daily or weekly)
const TechWeeklyMultiLine: React.FC<{ nalogi: any[]; weeks: string[] }> = ({ nalogi, weeks }) => {
  const [mode, setMode] = React.useState<'day'|'week'>('day');
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = React.useState<number>(800);
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const cw = e.contentRect.width;
        if (cw > 0) setContainerW(cw);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Build day domain from data
  const allDays = useMemo(() => {
    const set = new Set<string>();
    (nalogi || []).forEach(n => {
      const d = getNalogDate(n);
      if (!d) return;
      const k = dateKey(d);
      set.add(k);
    });
    const arr = Array.from(set).sort();
    return arr;
  }, [nalogi]);
  const [fromDay, setFromDay] = React.useState<string>(allDays[0] || dateKey(new Date()));
  const [toDay, setToDay] = React.useState<string>(allDays[allDays.length - 1] || dateKey(new Date()));
  const dayKeys = useMemo(() => enumerateBusinessDays(fromDay, toDay), [fromDay, toDay]);
  const keys = mode === 'day' ? dayKeys : weeks;

  const techs: TechKey[] = ['Bor','Stane','Tomaž','Rok'];
  const [apiData, setApiData] = React.useState<Array<{ Dan: string; Rok: number; Bor: number; Tomaz: number; Stane: number }>>([]);
  React.useEffect(() => {
    if (mode !== 'day' || !fromDay || !toDay) return setApiData([]);
    const controller = new AbortController();
    const url = `/api/analitika/tehnologi?from=${encodeURIComponent(fromDay)}&to=${encodeURIComponent(toDay)}`;
    fetch(url, { signal: controller.signal }).then(r => r.ok ? r.json() : Promise.reject(r.statusText)).then(setApiData).catch(() => {});
    return () => controller.abort();
  }, [mode, fromDay, toDay]);

  const weekly: Record<string, Record<TechKey, number>> = useMemo(() => {
    const map: Record<string, Record<TechKey, number>> = {};
    keys.forEach(w => {
      map[w] = { Bor: 0, Stane: 0, Tomaž: 0, Rok: 0 };
    });
    if (mode === 'day' && apiData.length > 0) {
      apiData.forEach(r => {
        const k = r.Dan?.slice(0, 10);
        if (!k || !map[k]) return;
        map[k].Rok += Number(r.Rok || 0);
        map[k].Bor += Number(r.Bor || 0);
        map[k].Tomaž += Number(r.Tomaz || 0);
        map[k].Stane += Number(r.Stane || 0);
      });
    } else {
      (nalogi || []).forEach(n => {
        const d = getNalogDate(n);
        if (!d) return;
        const w = (mode === 'day') ? dateKey(d) : weekKey(d);
        if (!map[w]) return;
        const p = (n as any)?.podatki || {};
        const who = detectTechnologist(p?.komentar);
        if (!who) return;
        map[w][who] += 1;
      });
    }
    return map;
  }, [nalogi, keys, mode, apiData]);
  const maxY = Math.max(1, ...keys.flatMap(w => techs.map(t => weekly[w]?.[t] || 0)));
  const width = Math.max(600, containerW);
  const height = 240;
  const padL = 54;
  const padB = 24;
  const innerW = width - padL - 12;
  const innerH = height - padB - 12;
  const stepX = innerW / Math.max(1, keys.length - 1);
  const scaleY = (v: number) => (v / maxY) * innerH;
  const colors: Record<TechKey, string> = { Bor: '#2563eb', Stane: '#16a34a', Tomaž: '#f59e0b', Rok: '#dc2626' };
  const pointsFor = (t: TechKey) =>
    keys.map((w, i) => {
      const x = padL + (keys.length === 1 ? innerW / 2 : i * stepX);
      const y = 8 + (innerH - scaleY(weekly[w]?.[t] || 0));
      return `${x},${y}`;
    }).join(' ');
  return (
    <div ref={containerRef} className="bg-white border rounded-lg p-3 mt-6">
      <div className="flex items-end justify-between mb-2">
        <div className="font-semibold">Trend: število nalogov po tehnologih</div>
        <div className="flex items-center gap-3 text-sm">
          <label className="inline-flex items-center gap-1">
            <input type="radio" checked={mode==='day'} onChange={() => setMode('day')} />
            Dnevno (brez vikendov)
          </label>
          <label className="inline-flex items-center gap-1">
            <input type="radio" checked={mode==='week'} onChange={() => setMode('week')} />
            Tedensko
          </label>
        </div>
      </div>
      {mode === 'day' && (
        <div className="flex items-end gap-3 mb-3">
          <div>
            <label className="block text-xs text-gray-700 mb-1">Od dne</label>
            <input type="date" value={fromDay} onChange={e => setFromDay(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-700 mb-1">Do dne</label>
            <input type="date" value={toDay} onChange={e => setToDay(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          </div>
        </div>
      )}
      <svg width={width} height={height}>
        <g transform={`translate(${padL}, 8)`}>
          <line x1={0} y1={0} x2={0} y2={innerH} stroke="#9ca3af" strokeWidth={1} />
          {[0, 0.5, 1].map((p) => {
            const y = innerH - p * innerH;
            const val = Math.round(maxY * p);
            return (
              <g key={String(p)}>
                <line x1={0} y1={y} x2={innerW} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" />
                <text x={-8} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#6b7280">
                  {val}
                </text>
              </g>
            );
          })}
          {keys.map((w, i) => {
            const interval = Math.max(1, Math.ceil(keys.length / 10));
            if (i % interval !== 0 && i !== keys.length - 1) return null;
            return <text key={w} x={(keys.length === 1 ? innerW / 2 : i * stepX)} y={innerH + 14} fontSize="10" textAnchor="middle" fill="#374151">{w}</text>;
          })}
        </g>
        {techs.map(t => (
          <polyline key={t} points={pointsFor(t)} fill="none" stroke={colors[t]} strokeWidth={2} />
        ))}
      </svg>
      <div className="mt-2 text-xs flex gap-4">
        {techs.map(t => (
          <span key={t} className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: colors[t] }}></span>{t}
          </span>
        ))}
      </div>
    </div>
  );
};

// Multi-line chart for products (daily or weekly)
const ProductsWeeklyMultiLine: React.FC<{ nalogi: any[]; weeks: string[]; visible: Record<ProduktSkupina, boolean> }> = ({ nalogi, weeks, visible }) => {
  const [mode, setMode] = React.useState<'day'|'week'>('day');
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = React.useState<number>(800);
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const cw = e.contentRect.width;
        if (cw > 0) setContainerW(cw);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Build day domain from data
  const allDays = useMemo(() => {
    const set = new Set<string>();
    (nalogi || []).forEach(n => {
      const d = getNalogDate(n);
      if (!d) return;
      set.add(dateKey(d));
    });
    return Array.from(set).sort();
  }, [nalogi]);
  const [fromDay, setFromDay] = React.useState<string>(allDays[0] || dateKey(new Date()));
  const [toDay, setToDay] = React.useState<string>(allDays[allDays.length - 1] || dateKey(new Date()));
  const dayKeys = useMemo(() => enumerateBusinessDays(fromDay, toDay), [fromDay, toDay]);
  const keys = mode === 'day' ? dayKeys : weeks;

  const groups = produktSkupine;
  const [apiData, setApiData] = React.useState<Array<{ Dan: string; Besedilo: string }>>([]);
  React.useEffect(() => {
    if (mode !== 'day' || !fromDay || !toDay) return setApiData([]);
    const controller = new AbortController();
    const url = `/api/analitika/produkti?from=${encodeURIComponent(fromDay)}&to=${encodeURIComponent(toDay)}`;
    fetch(url, { signal: controller.signal }).then(r => r.ok ? r.json() : Promise.reject(r.statusText)).then(setApiData).catch(() => {});
    return () => controller.abort();
  }, [mode, fromDay, toDay]);

  const weekly: Record<string, Record<ProduktSkupina, number>> = useMemo(() => {
    const map: Record<string, Record<ProduktSkupina, number>> = {};
    keys.forEach(w => {
      const row: Record<ProduktSkupina, number> = {} as any;
      groups.forEach(g => { row[g] = 0; });
      map[w] = row;
    });
    if (mode === 'day' && apiData.length > 0) {
      apiData.forEach(r => {
        const k = r.Dan?.slice(0, 10);
        if (!k || !map[k]) return;
        const g = classifyProdukt(r.Besedilo) || 'Drugo';
        map[k][g] += 1;
      });
    } else {
      (nalogi || []).forEach(n => {
        const d = getNalogDate(n);
        if (!d) return;
        const w = (mode === 'day') ? dateKey(d) : weekKey(d);
        if (!map[w]) return;
        const p = (n as any)?.podatki || {};
        const t1 = p?.tisk?.tisk1?.predmet || '';
        const t2 = p?.tisk?.tisk2?.predmet || '';
        const g1 = classifyProdukt(t1) || 'Drugo';
        const g2 = classifyProdukt(t2) || null;
        map[w][g1] += 1;
        if (g2) map[w][g2] += 1;
      });
    }
    return map;
  }, [nalogi, keys, mode, apiData]);
  const maxY = Math.max(1, ...keys.flatMap(w => groups.filter(g => visible[g]).map(g => weekly[w]?.[g] || 0)));
  const width = Math.max(600, containerW);
  const height = 260;
  const padL = 54;
  const padB = 24;
  const innerW = width - padL - 12;
  const innerH = height - padB - 12;
  const stepX = innerW / Math.max(1, keys.length - 1);
  const scaleY = (v: number) => (v / maxY) * innerH;
  // simple color palette
  const palette = ['#2563eb','#16a34a','#f59e0b','#dc2626','#0ea5e9','#9333ea','#14b8a6','#f97316','#64748b','#84cc16','#06b6d4','#ef4444','#8b5cf6','#22c55e','#eab308','#94a3b8'];
  const colorFor = (g: ProduktSkupina, idx: number) => palette[idx % palette.length];
  const pointsFor = (g: ProduktSkupina) =>
    keys.map((w, i) => {
      const x = padL + (keys.length === 1 ? innerW / 2 : i * stepX);
      const y = 8 + (innerH - scaleY(weekly[w]?.[g] || 0));
      return `${x},${y}`;
    }).join(' ');
  return (
    <div ref={containerRef} className="bg-white border rounded-lg p-3 mt-6">
      <div className="flex items-end justify-between mb-2">
        <div className="font-semibold">Trend: število produktov po skupinah</div>
        <div className="flex items-center gap-3 text-sm">
          <label className="inline-flex items-center gap-1">
            <input type="radio" checked={mode==='day'} onChange={() => setMode('day')} />
            Dnevno (brez vikendov)
          </label>
          <label className="inline-flex items-center gap-1">
            <input type="radio" checked={mode==='week'} onChange={() => setMode('week')} />
            Tedensko
          </label>
        </div>
      </div>
      {mode === 'day' && (
        <div className="flex items-end gap-3 mb-3">
          <div>
            <label className="block text-xs text-gray-700 mb-1">Od dne</label>
            <input type="date" value={fromDay} onChange={e => setFromDay(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-700 mb-1">Do dne</label>
            <input type="date" value={toDay} onChange={e => setToDay(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          </div>
        </div>
      )}
      <svg width={width} height={height}>
        <g transform={`translate(${padL}, 8)`}>
          <line x1={0} y1={0} x2={0} y2={innerH} stroke="#9ca3af" strokeWidth={1} />
          {[0, 0.5, 1].map((p) => {
            const y = innerH - p * innerH;
            const val = Math.round(maxY * p);
            return (
              <g key={String(p)}>
                <line x1={0} y1={y} x2={innerW} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" />
                <text x={-8} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#6b7280">
                  {val}
                </text>
              </g>
            );
          })}
          {keys.map((w, i) => {
            const interval = Math.max(1, Math.ceil(keys.length / 10));
            if (i % interval !== 0 && i !== keys.length - 1) return null;
            return <text key={w} x={(keys.length === 1 ? innerW / 2 : i * stepX)} y={innerH + 14} fontSize="10" textAnchor="middle" fill="#374151">{w}</text>;
          })}
        </g>
        {groups.map((g, idx) => visible[g] && (
          <polyline key={g} points={pointsFor(g)} fill="none" stroke={colorFor(g, idx)} strokeWidth={2} />
        ))}
      </svg>
      <div className="mt-2 text-xs flex flex-wrap gap-3">
        {groups.map((g, idx) => visible[g] && (
          <span key={g} className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: colorFor(g, idx) }}></span>{g}
          </span>
        ))}
      </div>
    </div>
  );
};


