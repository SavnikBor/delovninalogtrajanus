import React, { useEffect, useMemo, useRef, useState } from 'react';

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

function powerTrend(values: number[]): number[] | null {
  // Power trendline: y = a * x^b (Excel "Power")
  // ln(y) = ln(a) + b*ln(x). Upoštevamo samo y > 0.
  const pts = values
    .map((y, i) => ({ x: i + 1, y }))
    .filter(p => Number.isFinite(p.y) && p.y > 0);
  if (pts.length < 2) return null;
  let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
  for (const p of pts) {
    const lx = Math.log(p.x);
    const ly = Math.log(p.y);
    sumX += lx;
    sumY += ly;
    sumXX += lx * lx;
    sumXY += lx * ly;
  }
  const n = pts.length;
  const denom = (n * sumXX - sumX * sumX);
  if (!Number.isFinite(denom) || denom === 0) return null;
  const b = (n * sumXY - sumX * sumY) / denom;
  const aLog = (sumY - b * sumX) / n;
  const a = Math.exp(aLog);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return values.map((_, i) => a * Math.pow(i + 1, b));
}

function parseMonthStr(s: string): { y: number; m: number } | null {
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (!Number.isFinite(y) || !Number.isFinite(mm) || mm < 1 || mm > 12) return null;
  return { y, m: mm };
}

function toMonthStr(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`;
}

function addMonths(month: { y: number; m: number }, delta: number): { y: number; m: number } {
  const idx = month.y * 12 + (month.m - 1) + delta;
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return { y, m };
}

const Analiza: React.FC<{ nalogi: Nalog[] }> = ({ nalogi }) => {
  // KPI Prihodek: podatki iz SQL (od prvega do zadnjega zapisa)
  const [range, setRange] = useState<{ minMonth: string; maxMonth: string } | null>(null);
  const didInitRangeRef = useRef(false);
  const [fromMonth, setFromMonth] = useState<string>(() => `${new Date().getFullYear()}-01`);
  const [toMonth, setToMonth] = useState<string>(() => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [kpriRows, setKpriRows] = useState<any[]>([]);
  const [kpriLoading, setKpriLoading] = useState(false);
  const [kpriError, setKpriError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/analitika/kpri-prihodek/range', { signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((data) => {
        if (data?.minMonth && data?.maxMonth) {
          setRange({ minMonth: data.minMonth, maxMonth: data.maxMonth });
          if (!didInitRangeRef.current) {
            didInitRangeRef.current = true;
            // vedno startaj na zadnje 3 mesece
            const min = parseMonthStr(String(data.minMonth));
            const max = parseMonthStr(String(data.maxMonth));
            if (min && max) {
              const from3 = addMonths(max, -2);
              const from3Str = toMonthStr(from3.y, from3.m);
              // clamp na min
              const fromFinal = (from3Str < String(data.minMonth)) ? String(data.minMonth) : from3Str;
              setFromMonth(fromFinal);
              setToMonth(String(data.maxMonth));
            } else {
              setFromMonth(String(data.minMonth));
              setToMonth(String(data.maxMonth));
            }
          }
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!fromMonth || !toMonth) return;
    if (fromMonth > toMonth) return;
    const controller = new AbortController();
    setKpriLoading(true);
    setKpriError('');
    const url = `/api/analitika/kpri-prihodek?from=${encodeURIComponent(fromMonth)}&to=${encodeURIComponent(toMonth)}`;
    fetch(url, { signal: controller.signal })
      .then(async (r) => {
        if (r.ok) return r.json();
        const body = await r.text().catch(() => '');
        throw new Error(`HTTP ${r.status} ${r.statusText}${body ? `: ${body}` : ''}`);
      })
      .then((rows) => setKpriRows(Array.isArray(rows) ? rows : []))
      .catch((e) => {
        if (controller.signal.aborted || e?.name === 'AbortError' || String(e?.message || '').toLowerCase().includes('aborted')) {
          return;
        }
        setKpriError(e?.message ? String(e.message) : 'Napaka pri branju podatkov iz baze.');
      })
      .finally(() => setKpriLoading(false));
    return () => controller.abort();
  }, [fromMonth, toMonth]);
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

  // Aggregate revenue per month per category (iz SQL)
  const { months, dataByMonth, maxStack } = useMemo(() => {
    const months = (fromMonth && toMonth && fromMonth <= toMonth) ? enumerateMonths(fromMonth, toMonth) : [];
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

    const byMonth = new Map<string, any>();
    (kpriRows || []).forEach((r: any) => {
      const mk = String(r?.Mesec || '').slice(0, 7);
      if (mk) byMonth.set(mk, r);
    });
    months.forEach(m => {
      const r = byMonth.get(m);
      if (!r) return;
      const add = (cat: CategoryKey, val: number) => {
        rows[m][cat] += val;
        rows[m].total += val;
      };
      add('graficnaPriprava', Number(r.graficnaPriprava || 0));
      add('cenaKlišeja', Number(r.cenaKlišeja || 0));
      add('cenaIzsekovalnegaOrodja', Number(r.cenaIzsekovalnegaOrodja || 0));
      add('cenaVzorca', Number(r.cenaVzorca || 0));
      add('cenaBrezDDV', Number(r.cenaBrezDDV || 0));
    });

    let max = 0;
    months.forEach(m => {
      if (rows[m].total > max) max = rows[m].total;
    });

    return { months, dataByMonth: rows, maxStack: max };
  }, [kpriRows, fromMonth, toMonth]);

  const formatEUR = (n: number) =>
    new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n);

  // Simple stacked bar chart via SVG (no extra deps)
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const [chartContainerW, setChartContainerW] = useState<number>(0);
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const cw = e.contentRect.width;
        if (cw > 0) setChartContainerW(cw);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chartWidth = Math.max(320, chartContainerW || 720);
  const chartHeight = 360;
  const paddingLeft = 54;
  const paddingBottom = 28;
  const innerWidth = chartWidth - paddingLeft - 16;
  const innerHeight = chartHeight - paddingBottom - 16;
  const stepX = innerWidth / Math.max(1, months.length);
  const barW = Math.max(2, Math.floor(stepX * 0.7));
  const scaleY = (v: number) => (maxStack > 0 ? (v / maxStack) * innerHeight : 0);
  const labelEvery = months.length > 18 ? Math.ceil(months.length / 12) : 1;

  const seriesOrder = CATEGORIES;
  const trendKeys: CategoryKey[] = ['graficnaPriprava', 'cenaKlišeja', 'cenaIzsekovalnegaOrodja', 'cenaVzorca', 'cenaBrezDDV'];
  const trendLines = useMemo(() => {
    const xFor = (idx: number) => paddingLeft + idx * stepX + (stepX - barW) / 2 + barW / 2;
    return trendKeys
      .filter(k => visible[k])
      .map((k) => {
        const values = months.map(m => Number((dataByMonth[m] as any)?.[k] || 0));
        const pred = powerTrend(values);
        if (!pred) return null;
        const points = pred.map((v, idx) => {
          const x = xFor(idx);
          const y = 8 + (innerHeight - scaleY(v));
          return `${x},${y}`;
        }).join(' ');
        return { key: k, points };
      })
      .filter(Boolean) as Array<{ key: CategoryKey; points: string }>;
  }, [months, dataByMonth, paddingLeft, stepX, barW, innerHeight, maxStack, visible]);

  return (
    <div className="p-6">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Analiza – KPI: Prihodek</h2>
        <p className="text-gray-600">Mesečni pregled prihodkov po postavkah iz SQL baze (od prvega do zadnjega zapisa).</p>
      </div>

      <div className="bg-white border rounded-lg p-4 mb-4">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          {(() => {
            const rMin = range?.minMonth ? parseMonthStr(range.minMonth) : null;
            const rMax = range?.maxMonth ? parseMonthStr(range.maxMonth) : null;
            const f = parseMonthStr(fromMonth);
            const t = parseMonthStr(toMonth);
            const minYear = rMin?.y ?? new Date().getFullYear();
            const maxYear = rMax?.y ?? new Date().getFullYear();
            const years = [];
            for (let y = minYear; y <= maxYear; y++) years.push(y);
            const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
            const isFromMonthDisabled = (y: number, m: number) => {
              if (rMin && y === rMin.y && m < rMin.m) return true;
              if (rMax && y === rMax.y && m > rMax.m) return true;
              return false;
            };
            const isToMonthDisabled = (y: number, m: number) => {
              if (rMin && y === rMin.y && m < rMin.m) return true;
              if (rMax && y === rMax.y && m > rMax.m) return true;
              return false;
            };
            return (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Od</label>
                  <div className="flex gap-2">
                    <select
                      value={String(f?.y ?? minYear)}
                      onChange={(e) => {
                        const y = parseInt(e.target.value, 10);
                        const m = f?.m ?? 1;
                        let mm = m;
                        while (mm <= 12 && isFromMonthDisabled(y, mm)) mm++;
                        if (mm > 12) mm = 12;
                        const next = toMonthStr(y, mm);
                        setFromMonth(next);
                        if (toMonth && next > toMonth) setToMonth(next);
                      }}
                      className="border rounded px-2 py-1"
                    >
                      {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
                    </select>
                    <select
                      value={String(f?.m ?? 1)}
                      onChange={(e) => {
                        const m = parseInt(e.target.value, 10);
                        const y = f?.y ?? minYear;
                        const next = toMonthStr(y, m);
                        setFromMonth(next);
                        if (toMonth && next > toMonth) setToMonth(next);
                      }}
                      className="border rounded px-2 py-1"
                    >
                      {monthOptions.map(m => (
                        <option key={m} value={String(m)} disabled={isFromMonthDisabled(f?.y ?? minYear, m)}>
                          {String(m).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Do</label>
                  <div className="flex gap-2">
                    <select
                      value={String(t?.y ?? maxYear)}
                      onChange={(e) => {
                        const y = parseInt(e.target.value, 10);
                        const m = t?.m ?? 12;
                        let mm = m;
                        while (mm >= 1 && isToMonthDisabled(y, mm)) mm--;
                        if (mm < 1) mm = 1;
                        const next = toMonthStr(y, mm);
                        setToMonth(next);
                        if (fromMonth && fromMonth > next) setFromMonth(next);
                      }}
                      className="border rounded px-2 py-1"
                    >
                      {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
                    </select>
                    <select
                      value={String(t?.m ?? 12)}
                      onChange={(e) => {
                        const m = parseInt(e.target.value, 10);
                        const y = t?.y ?? maxYear;
                        const next = toMonthStr(y, m);
                        setToMonth(next);
                        if (fromMonth && fromMonth > next) setFromMonth(next);
                      }}
                      className="border rounded px-2 py-1"
                    >
                      {monthOptions.map(m => (
                        <option key={m} value={String(m)} disabled={isToMonthDisabled(t?.y ?? maxYear, m)}>
                          {String(m).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            );
          })()}
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

      <div ref={chartContainerRef} className="bg-white border rounded-lg p-4">
        {kpriError && <div className="text-sm text-red-600 mb-2">{kpriError}</div>}
        {kpriLoading && <div className="text-sm text-gray-600 mb-2">Nalagam podatke…</div>}
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
                  {(idx % labelEvery === 0 || idx === months.length - 1) && (
                    <text
                      x={x + barW / 2}
                      y={innerHeight + 14}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#374151"
                    >
                      {m}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
          {/* Power trend lines (Grafična priprava / Kliše / Izsekovalno orodje) */}
          {months.length > 1 && trendLines.map(tl => {
            const cat = seriesOrder.find(c => c.key === tl.key);
            const stroke = cat?.color || '#0ea5e9';
            return (
              <polyline
                key={tl.key}
                points={tl.points}
                fill="none"
                stroke={stroke}
                strokeWidth={2}
                strokeDasharray="6 4"
                opacity={0.9}
              />
            );
          })}
        </svg>
      </div>

      <div className="bg-white border rounded-lg p-4 mt-4">
        <h3 className="text-lg font-semibold mb-2">Tabela – mesečni zneski</h3>
        <div className={months.length > 12 ? 'max-h-80 overflow-y-auto border border-gray-200 rounded' : ''}>
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

      {/* KPI: Reklamacije */}
      <div className="mt-8 mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Analiza – KPI: Reklamacije</h2>
        <p className="text-gray-600">Število reklamacij po vrsti in ocenjena skupna vrednost v izbranem obdobju.</p>
      </div>
      <ReklamacijeKPI />

      {/* KPI: Kooperanti */}
      <div className="mt-8 mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Analiza – KPI: Kooperanti</h2>
        <p className="text-gray-600">Stroški kooperantov: ločeno tisk (kooperant pri tisku) in dodelave (kooperanti dodelav).</p>
      </div>
      <KooperantiKPI />

      {/* KPI: Prihodki po kupcih */}
      <div className="mt-8 mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Analiza – KPI: Prihodki po kupcih</h2>
        <p className="text-gray-600">Top 10 kupcev po prihodkih v izbranem obdobju + trend.</p>
      </div>
      <PrihodkiKupciKPI />

      {/* KPI: Čas od odprtja do dobave */}
      <div className="mt-8 mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Analiza – KPI: Čas od odprtja do dobave</h2>
        <p className="text-gray-600">Povprečen čas od odprtja do dobave in odstopanje od roka izdelave.</p>
      </div>
      <CasDobaveKPI />
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
  // Filter: po dnevih (SQL vir)
  const toISODate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const shiftMonths = (base: Date, deltaMonths: number) => {
    const y = base.getFullYear();
    const m = base.getMonth() + deltaMonths;
    const d = base.getDate();
    const first = new Date(y, m, 1);
    const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    first.setDate(Math.min(d, lastDay));
    return first;
  };
  const now = new Date();
  const defaultTo = toISODate(now);
  const defaultFrom = toISODate(shiftMonths(now, -3));
  const [fromDay, setFromDay] = React.useState<string>(defaultFrom);
  const [toDay, setToDay] = React.useState<string>(defaultTo);
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!fromDay || !toDay) return;
    if (fromDay > toDay) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const url = `/api/analitika/tehnologi-kpi?from=${encodeURIComponent(fromDay)}&to=${encodeURIComponent(toDay)}`;
    fetch(url, { signal: controller.signal })
      .then(async (r) => {
        if (r.ok) return r.json();
        const body = await r.text().catch(() => '');
        throw new Error(`HTTP ${r.status} ${r.statusText}${body ? `: ${body}` : ''}`);
      })
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((e) => {
        // Abort je normalen pri hitri spremembi filtra ali unmount-u (React StrictMode).
        if (controller.signal.aborted || e?.name === 'AbortError' || String(e?.message || '').toLowerCase().includes('aborted')) {
          return;
        }
        setError(e?.message ? String(e.message) : 'Napaka pri branju podatkov iz baze.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [fromDay, toDay]);

  const techs: TechKey[] = ['Bor', 'Stane', 'Tomaž', 'Rok'];

  const dayKeys = useMemo(() => {
    if (!fromDay || !toDay || fromDay > toDay) return [];
    const start = new Date(fromDay);
    const end = new Date(toDay);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
    const out: string[] = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (cur <= end) {
      out.push(toISODate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [fromDay, toDay]);

  const byDay = useMemo(() => {
    const map: Record<string, any> = {};
    dayKeys.forEach(d => {
      map[d] = {
        BorCount: 0, StaneCount: 0, TomazCount: 0, RokCount: 0,
        BorValue: 0, StaneValue: 0, TomazValue: 0, RokValue: 0,
      };
    });
    (rows || []).forEach((r: any) => {
      const k = String(r?.Dan || '').slice(0, 10);
      if (!k || !map[k]) return;
      map[k].BorCount += Number(r.BorCount || 0);
      map[k].StaneCount += Number(r.StaneCount || 0);
      map[k].TomazCount += Number(r.TomazCount || 0);
      map[k].RokCount += Number(r.RokCount || 0);
      map[k].BorValue += Number(r.BorValue || 0);
      map[k].StaneValue += Number(r.StaneValue || 0);
      map[k].TomazValue += Number(r.TomazValue || 0);
      map[k].RokValue += Number(r.RokValue || 0);
    });
    return map;
  }, [rows, dayKeys]);

  const agg = useMemo(() => {
    const res: Record<TechKey, { count: number; value: number }> = {
      Bor: { count: 0, value: 0 },
      Stane: { count: 0, value: 0 },
      Tomaž: { count: 0, value: 0 },
      Rok: { count: 0, value: 0 },
    };
    dayKeys.forEach(d => {
      const r = byDay[d];
      res.Bor.count += Number(r?.BorCount || 0);
      res.Stane.count += Number(r?.StaneCount || 0);
      res.Tomaž.count += Number(r?.TomazCount || 0);
      res.Rok.count += Number(r?.RokCount || 0);
      res.Bor.value += Number(r?.BorValue || 0);
      res.Stane.value += Number(r?.StaneValue || 0);
      res.Tomaž.value += Number(r?.TomazValue || 0);
      res.Rok.value += Number(r?.RokValue || 0);
    });
    return res;
  }, [byDay, dayKeys]);

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

  // Trend chart (dnevno): multi-line + power trendline (črtkano) za vsakega tehnologa
  const trendContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [trendW, setTrendW] = React.useState<number>(0);
  React.useEffect(() => {
    const el = trendContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const cw = e.contentRect.width;
        if (cw > 0) setTrendW(cw);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const trendH = 260;
  const tPadL = 54;
  const tPadB = 24;
  const tW = Math.max(320, trendW || 720);
  const tInnerW = tW - tPadL - 12;
  const tInnerH = trendH - tPadB - 12;
  const tStepX = tInnerW / Math.max(1, dayKeys.length - 1);
  const maxDayCount = Math.max(1, ...dayKeys.flatMap(d => ([
    byDay[d]?.BorCount || 0,
    byDay[d]?.StaneCount || 0,
    byDay[d]?.TomazCount || 0,
    byDay[d]?.RokCount || 0,
  ] as number[])));
  const tScaleY = (v: number) => (v / maxDayCount) * tInnerH;
  const colors: Record<TechKey, string> = { Bor: '#2563eb', Stane: '#16a34a', Tomaž: '#f59e0b', Rok: '#dc2626' };
  const countsSeries = (t: TechKey) => dayKeys.map(d => {
    if (t === 'Bor') return Number(byDay[d]?.BorCount || 0);
    if (t === 'Stane') return Number(byDay[d]?.StaneCount || 0);
    if (t === 'Tomaž') return Number(byDay[d]?.TomazCount || 0);
    return Number(byDay[d]?.RokCount || 0);
  });
  const pointsFor = (vals: number[]) =>
    vals.map((v, i) => {
      const x = tPadL + (dayKeys.length === 1 ? tInnerW / 2 : i * tStepX);
      const y = 8 + (tInnerH - tScaleY(v));
      return `${x},${y}`;
    }).join(' ');

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Od dne</label>
          <input type="date" value={fromDay} onChange={e => setFromDay(e.target.value)} className="border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Do dne</label>
          <input type="date" value={toDay} onChange={e => setToDay(e.target.value)} className="border rounded px-2 py-1" />
        </div>
      </div>
      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
      {loading && <div className="text-sm text-gray-600 mb-3">Nalagam podatke…</div>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="font-semibold mb-2">Število nalogov po tehnologih</h4>
          <svg width="100%" height={countsHeight} viewBox={`0 0 ${countsWidth} ${countsHeight}`}>
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
          <svg width="100%" height={valsHeight} viewBox={`0 0 ${valsWidth} ${valsHeight}`}>
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

      {/* Trend: dnevno, power trend za vsakega tehnologa */}
      <div ref={trendContainerRef} className="bg-white border rounded-lg p-3 mt-6">
        <div className="font-semibold mb-2">Trend: število nalogov po tehnologih (dnevno)</div>
        <svg width={tW} height={trendH}>
          <g transform={`translate(${tPadL}, 8)`}>
            <line x1={0} y1={0} x2={0} y2={tInnerH} stroke="#9ca3af" strokeWidth={1} />
            {[0, 0.5, 1].map((p) => {
              const y = tInnerH - p * tInnerH;
              const val = Math.round(maxDayCount * p);
              return (
                <g key={String(p)}>
                  <line x1={0} y1={y} x2={tInnerW} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" />
                  <text x={-8} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#6b7280">
                    {val}
                  </text>
                </g>
              );
            })}
            {dayKeys.map((d, i) => {
              const interval = Math.max(1, Math.ceil(dayKeys.length / 10));
              if (i % interval !== 0 && i !== dayKeys.length - 1) return null;
              return (
                <text key={d} x={(dayKeys.length === 1 ? tInnerW / 2 : i * tStepX)} y={tInnerH + 14} fontSize="10" textAnchor="middle" fill="#374151">
                  {d.slice(5)}
                </text>
              );
            })}
          </g>
          {techs.map(t => {
            const vals = countsSeries(t);
            const pLine = pointsFor(vals);
            const trend = powerTrend(vals);
            const pTrend = trend ? pointsFor(trend) : null;
            return (
              <g key={t}>
                <polyline points={pLine} fill="none" stroke={colors[t]} strokeWidth={2} opacity={0.9} />
                {pTrend && (
                  <polyline points={pTrend} fill="none" stroke={colors[t]} strokeWidth={2} strokeDasharray="6 4" opacity={0.9} />
                )}
              </g>
            );
          })}
        </svg>
        <div className="mt-2 text-xs flex gap-4">
          {techs.map(t => (
            <span key={t} className="inline-flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: colors[t] }}></span>{t}
            </span>
          ))}
        </div>
      </div>

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
  const [visible, setVisible] = React.useState<Record<ProduktSkupina, boolean>>(() => {
    const m: Record<ProduktSkupina, boolean> = {} as any;
    produktSkupine.forEach(g => { m[g] = true; });
    return m;
  });

  // Filter: po dnevih (SQL vir)
  const toISODate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const shiftMonths = (base: Date, deltaMonths: number) => {
    const y = base.getFullYear();
    const m = base.getMonth() + deltaMonths;
    const d = base.getDate();
    const first = new Date(y, m, 1);
    const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    first.setDate(Math.min(d, lastDay));
    return first;
  };
  const now = new Date();
  const defaultTo = toISODate(now);
  const defaultFrom = toISODate(shiftMonths(now, -3));
  const [fromDay, setFromDay] = React.useState<string>(defaultFrom);
  const [toDay, setToDay] = React.useState<string>(defaultTo);
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!fromDay || !toDay) return;
    if (fromDay > toDay) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const url = `/api/analitika/produkti-kpi?from=${encodeURIComponent(fromDay)}&to=${encodeURIComponent(toDay)}`;
    fetch(url, { signal: controller.signal })
      .then(async (r) => {
        if (r.ok) return r.json();
        const body = await r.text().catch(() => '');
        throw new Error(`HTTP ${r.status} ${r.statusText}${body ? `: ${body}` : ''}`);
      })
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((e) => {
        if (controller.signal.aborted || e?.name === 'AbortError' || String(e?.message || '').toLowerCase().includes('aborted')) {
          return;
        }
        setError(e?.message ? String(e.message) : 'Napaka pri branju podatkov iz baze.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [fromDay, toDay]);

  const dayKeys = useMemo(() => {
    if (!fromDay || !toDay || fromDay > toDay) return [];
    const start = new Date(fromDay);
    const end = new Date(toDay);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
    const out: string[] = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (cur <= end) {
      out.push(toISODate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [fromDay, toDay]);

  const agg = useMemo(() => {
    const counts: Record<ProduktSkupina, number> = Object.fromEntries(produktSkupine.map(k => [k, 0])) as any;
    const values: Record<ProduktSkupina, number> = Object.fromEntries(produktSkupine.map(k => [k, 0])) as any;
    (rows || []).forEach((r: any) => {
      const t1 = String(r?.Predmet1 || '');
      const t2 = String(r?.Predmet2 || '');
      const totalValue = Number(r?.TotalValue || 0);
      const g1 = classifyProdukt(t1);
      const g2 = classifyProdukt(t2);
      const matchedRaw: ProduktSkupina[] = [];
      if (g1) matchedRaw.push(g1);
      if (g2) matchedRaw.push(g2);
      const matched = Array.from(new Set(matchedRaw));
      const useGroups: ProduktSkupina[] = matched.length > 0 ? matched : ['Drugo'];
      // counts: pojavitev (poziciji)
      useGroups.forEach(g => { counts[g] = (counts[g] || 0) + 1; });
      // value: razdeli med skupine (če je več produktov v istem nalogu)
      const share = useGroups.length > 0 ? totalValue / useGroups.length : 0;
      useGroups.forEach(g => { values[g] = (values[g] || 0) + share; });
    });
    return { counts, values };
  }, [rows]);

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

  // Trend (dnevno): multi-line + power trend (črtkano) za vidne skupine
  const trendContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [trendW, setTrendW] = React.useState<number>(0);
  React.useEffect(() => {
    const el = trendContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const cw = e.contentRect.width;
        if (cw > 0) setTrendW(cw);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const perDay = useMemo(() => {
    const map: Record<string, Record<ProduktSkupina, number>> = {};
    dayKeys.forEach(d => {
      const row: Record<ProduktSkupina, number> = {} as any;
      groups.forEach(g => { row[g] = 0; });
      map[d] = row;
    });
    (rows || []).forEach((r: any) => {
      const d = String(r?.Dan || '').slice(0, 10);
      if (!d || !map[d]) return;
      const t1 = String(r?.Predmet1 || '');
      const t2 = String(r?.Predmet2 || '');
      const g1 = classifyProdukt(t1);
      const g2 = classifyProdukt(t2);
      if (g1) map[d][g1] += 1;
      if (g2) map[d][g2] += 1;
      if (!g1 && !g2) map[d]['Drugo'] += 1;
    });
    return map;
  }, [rows, dayKeys, groups]);

  const maxTrendY = Math.max(1, ...dayKeys.flatMap(d => groups.filter(g => visible[g]).map(g => perDay[d]?.[g] || 0)));
  const trendH = 260;
  const tPadL = 54;
  const tPadB = 24;
  const tW = Math.max(320, trendW || 720);
  const tInnerW = tW - tPadL - 12;
  const tInnerH = trendH - tPadB - 12;
  const tStepX = tInnerW / Math.max(1, dayKeys.length - 1);
  const tScaleY = (v: number) => (v / maxTrendY) * tInnerH;
  const labelEveryTrend = dayKeys.length > 18 ? Math.ceil(dayKeys.length / 10) : 1;
  const palette = ['#2563eb','#16a34a','#f59e0b','#dc2626','#0ea5e9','#9333ea','#14b8a6','#f97316','#64748b','#84cc16','#06b6d4','#ef4444','#8b5cf6','#22c55e','#eab308','#94a3b8'];
  const colorFor = (g: ProduktSkupina, idx: number) => palette[idx % palette.length];
  const seriesVals = (g: ProduktSkupina) => dayKeys.map((d) => Number(perDay[d]?.[g] || 0));
  const pointsFor = (vals: number[]) =>
    vals.map((v, i) => {
      const x = tPadL + (dayKeys.length === 1 ? tInnerW / 2 : i * tStepX);
      const y = 8 + (tInnerH - tScaleY(v));
      return `${x},${y}`;
    }).join(' ');

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Od dne</label>
          <input type="date" value={fromDay} onChange={e => setFromDay(e.target.value)} className="border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Do dne</label>
          <input type="date" value={toDay} onChange={e => setToDay(e.target.value)} className="border rounded px-2 py-1" />
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
      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
      {loading && <div className="text-sm text-gray-600 mb-3">Nalagam podatke…</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="overflow-auto">
          <h4 className="font-semibold mb-2">Število produktov po skupinah</h4>
          <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
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
          <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
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

      <div ref={trendContainerRef} className="bg-white border rounded-lg p-3 mt-6">
        <div className="font-semibold mb-2">Trend: število produktov po skupinah (dnevno)</div>
        <svg width={tW} height={trendH}>
          <g transform={`translate(${tPadL}, 8)`}>
            <line x1={0} y1={0} x2={0} y2={tInnerH} stroke="#9ca3af" strokeWidth={1} />
            {[0, 0.5, 1].map((p) => {
              const y = tInnerH - p * tInnerH;
              const val = Math.round(maxTrendY * p);
              return (
                <g key={String(p)}>
                  <line x1={0} y1={y} x2={tInnerW} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" />
                  <text x={-8} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#6b7280">
                    {val}
                  </text>
                </g>
              );
            })}
            {dayKeys.map((d, i) => {
              if (i % labelEveryTrend !== 0 && i !== dayKeys.length - 1) return null;
              return (
                <text key={d} x={(dayKeys.length === 1 ? tInnerW / 2 : i * tStepX)} y={tInnerH + 14} fontSize="10" textAnchor="middle" fill="#374151">
                  {d.slice(5)}
                </text>
              );
            })}
          </g>
          {groups.map((g, idx) => {
            if (!visible[g]) return null;
            const vals = seriesVals(g);
            const pLine = pointsFor(vals);
            const trend = powerTrend(vals);
            const pTrend = trend ? pointsFor(trend) : null;
            const c = colorFor(g, idx);
            return (
              <g key={g}>
                <polyline points={pLine} fill="none" stroke={c} strokeWidth={2} opacity={0.9} />
                {pTrend && (
                  <polyline points={pTrend} fill="none" stroke={c} strokeWidth={2} strokeDasharray="6 4" opacity={0.9} />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-6 overflow-auto">
        <h4 className="font-semibold mb-2">Tabela – vrednost po skupinah (v obdobju)</h4>
        <table className="min-w-full border border-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 border-b">Skupina</th>
              <th className="text-right px-3 py-2 border-b">Število</th>
              <th className="text-right px-3 py-2 border-b">Vrednost</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <tr key={g} className="odd:bg-white even:bg-gray-50">
                <td className="px-3 py-2 border-b">{g}</td>
                <td className="text-right px-3 py-2 border-b">{agg.counts[g]}</td>
                <td className="text-right px-3 py-2 border-b">{formatEUR(agg.values[g])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// (stari TechWeeklyMultiLine odstranjen – KPI Tehnologi je zdaj dnevno + SQL vir)

// ---------- Reklamacije KPI ----------
const ReklamacijeKPI: React.FC = () => {
  const toISODate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const shiftMonths = (base: Date, deltaMonths: number) => {
    const y = base.getFullYear();
    const m = base.getMonth() + deltaMonths;
    const d = base.getDate();
    const first = new Date(y, m, 1);
    const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    first.setDate(Math.min(d, lastDay));
    return first;
  };
  const now = new Date();
  const [fromDay, setFromDay] = React.useState<string>(toISODate(shiftMonths(now, -3)));
  const [toDay, setToDay] = React.useState<string>(toISODate(now));
  const [rows, setRows] = React.useState<Array<{ Vrsta: string; StReklamacij: number; SkupnaVrednost: number }>>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!fromDay || !toDay) return;
    if (fromDay > toDay) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const url = `/api/analitika/reklamacije-kpi?from=${encodeURIComponent(fromDay)}&to=${encodeURIComponent(toDay)}`;
    fetch(url, { signal: controller.signal })
      .then(async (r) => {
        if (r.ok) return r.json();
        const body = await r.text().catch(() => '');
        throw new Error(`HTTP ${r.status} ${r.statusText}${body ? `: ${body}` : ''}`);
      })
      .then((data) => setRows(Array.isArray(data?.byType) ? data.byType : []))
      .catch((e) => {
        if (controller.signal.aborted || e?.name === 'AbortError' || String(e?.message || '').toLowerCase().includes('aborted')) return;
        setError(e?.message ? String(e.message) : 'Napaka pri branju podatkov iz baze.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [fromDay, toDay]);

  const formatEUR0 = (n: number) => new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

  const types = rows.map(r => String(r.Vrsta || '(neznano)'));
  const maxCount = Math.max(1, ...rows.map(r => Number(r.StReklamacij || 0)));
  const maxValue = Math.max(1, ...rows.map(r => Number(r.SkupnaVrednost || 0)));

  const w = 900;
  const h = 280;
  const padL = 70;
  const padB = 28;
  const innerW = w - padL - 16;
  const innerH = h - padB - 16;
  const stepX = innerW / Math.max(1, rows.length);
  const barW = Math.max(10, Math.floor(stepX * 0.65));
  const labelEvery = rows.length > 14 ? Math.ceil(rows.length / 12) : 1;

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Od dne</label>
          <input type="date" value={fromDay} onChange={e => setFromDay(e.target.value)} className="border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Do dne</label>
          <input type="date" value={toDay} onChange={e => setToDay(e.target.value)} className="border rounded px-2 py-1" />
        </div>
      </div>
      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
      {loading && <div className="text-sm text-gray-600 mb-3">Nalagam podatke…</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="font-semibold mb-2">Število reklamacij (po vrsti)</h4>
          <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
            <g transform={`translate(${padL}, 8)`}>
              <line x1={0} y1={0} x2={0} y2={innerH} stroke="#9ca3af" strokeWidth={1} />
              {[0, 0.5, 1].map((p) => {
                const y = innerH - p * innerH;
                const val = Math.round(maxCount * p);
                return (
                  <g key={String(p)}>
                    <line x1={0} y1={y} x2={innerW} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" />
                    <text x={-8} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#6b7280">
                      {val}
                    </text>
                  </g>
                );
              })}
              {rows.map((r, i) => {
                const x = i * stepX + (stepX - barW) / 2;
                const v = Number(r.StReklamacij || 0);
                const hh = (v / maxCount) * innerH;
                const y = innerH - hh;
                return (
                  <g key={`${r.Vrsta}-${i}`}>
                    <rect x={x} y={y} width={barW} height={hh} fill="#ef4444" opacity={0.9} />
                    {(i % labelEvery === 0 || i === rows.length - 1) && (
                      <text x={x + barW / 2} y={innerH + 14} textAnchor="middle" fontSize="10" fill="#374151">
                        {String(r.Vrsta || '(neznano)')}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        <div>
          <h4 className="font-semibold mb-2">Skupna vrednost reklamacij (po vrsti)</h4>
          <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
            <g transform={`translate(${padL}, 8)`}>
              <line x1={0} y1={0} x2={0} y2={innerH} stroke="#9ca3af" strokeWidth={1} />
              {[0, 0.5, 1].map((p) => {
                const y = innerH - p * innerH;
                const val = maxValue * p;
                return (
                  <g key={String(p)}>
                    <line x1={0} y1={y} x2={innerW} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" />
                    <text x={-8} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#6b7280">
                      {formatEUR0(val)}
                    </text>
                  </g>
                );
              })}
              {rows.map((r, i) => {
                const x = i * stepX + (stepX - barW) / 2;
                const v = Number(r.SkupnaVrednost || 0);
                const hh = (v / maxValue) * innerH;
                const y = innerH - hh;
                return (
                  <g key={`${r.Vrsta}-${i}-v`}>
                    <rect x={x} y={y} width={barW} height={hh} fill="#0ea5e9" opacity={0.9} />
                    {(i % labelEvery === 0 || i === rows.length - 1) && (
                      <text x={x + barW / 2} y={innerH + 14} textAnchor="middle" fontSize="10" fill="#374151">
                        {String(r.Vrsta || '(neznano)')}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </div>

      <div className="mt-6 overflow-auto">
        <table className="min-w-full border border-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 border-b">Vrsta</th>
              <th className="text-right px-3 py-2 border-b">Število</th>
              <th className="text-right px-3 py-2 border-b">Vrednost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={String(r.Vrsta)} className="odd:bg-white even:bg-gray-50">
                <td className="px-3 py-2 border-b">{String(r.Vrsta || '(neznano)')}</td>
                <td className="text-right px-3 py-2 border-b">{Number(r.StReklamacij || 0)}</td>
                <td className="text-right px-3 py-2 border-b">{formatEUR0(Number(r.SkupnaVrednost || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ---------- Kooperanti KPI ----------
const KooperantiKPI: React.FC = () => {
  const toISODate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const shiftMonths = (base: Date, deltaMonths: number) => {
    const y = base.getFullYear();
    const m = base.getMonth() + deltaMonths;
    const day = base.getDate();
    const first = new Date(y, m, 1);
    const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    first.setDate(Math.min(day, lastDay));
    return first;
  };
  const now = new Date();
  const [fromDay, setFromDay] = React.useState<string>(toISODate(shiftMonths(now, -3)));
  const [toDay, setToDay] = React.useState<string>(toISODate(now));
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!fromDay || !toDay) return;
    if (fromDay > toDay) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const url = `/api/analitika/kooperanti-kpi?from=${encodeURIComponent(fromDay)}&to=${encodeURIComponent(toDay)}`;
    fetch(url, { signal: controller.signal })
      .then(async (r) => {
        if (r.ok) return r.json();
        const body = await r.text().catch(() => '');
        throw new Error(`HTTP ${r.status} ${r.statusText}${body ? `: ${body}` : ''}`);
      })
      .then(setData)
      .catch((e) => {
        if (controller.signal.aborted || e?.name === 'AbortError' || String(e?.message || '').toLowerCase().includes('aborted')) return;
        setError(e?.message ? String(e.message) : 'Napaka pri branju podatkov iz baze.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [fromDay, toDay]);

  const formatEUR0 = (n: number) => new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

  const tiskTop: Array<any> = Array.isArray(data?.tiskByKooperant) ? data.tiskByKooperant : [];
  const dodTop: Array<any> = Array.isArray(data?.dodelavaByKooperant) ? data.dodelavaByKooperant : [];
  const dodVrsta: Array<any> = Array.isArray(data?.dodelavaByVrsta) ? data.dodelavaByVrsta : [];
  const trend: Array<any> = Array.isArray(data?.trend) ? data.trend : [];

  const trendContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [trendW, setTrendW] = React.useState<number>(0);
  React.useEffect(() => {
    const el = trendContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const cw = e.contentRect.width;
        if (cw > 0) setTrendW(cw);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const keys = trend.map(r => String(r.Dan || '').slice(0, 10));
  const maxY = Math.max(1, ...trend.flatMap(r => [Number(r.TiskZnesek || 0), Number(r.DodelavaZnesek || 0)]));
  const w = Math.max(320, trendW || 720);
  const h = 240;
  const padL = 54;
  const padB = 24;
  const innerW = w - padL - 12;
  const innerH = h - padB - 12;
  const stepX = innerW / Math.max(1, keys.length - 1);
  const scaleY = (v: number) => (v / maxY) * innerH;
  const labelEvery = keys.length > 18 ? Math.ceil(keys.length / 10) : 1;
  const pointsFor = (vals: number[]) =>
    vals.map((v, i) => {
      const x = padL + (keys.length === 1 ? innerW / 2 : i * stepX);
      const y = 8 + (innerH - scaleY(v));
      return `${x},${y}`;
    }).join(' ');
  const tiskVals = trend.map(r => Number(r.TiskZnesek || 0));
  const dodVals = trend.map(r => Number(r.DodelavaZnesek || 0));

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Od dne</label>
          <input type="date" value={fromDay} onChange={e => setFromDay(e.target.value)} className="border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Do dne</label>
          <input type="date" value={toDay} onChange={e => setToDay(e.target.value)} className="border rounded px-2 py-1" />
        </div>
      </div>
      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
      {loading && <div className="text-sm text-gray-600 mb-3">Nalagam podatke…</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="font-semibold mb-2">Kooperanti – tisk (TOP 10)</h4>
          <div className="overflow-auto">
            <table className="min-w-full border border-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 border-b">Kooperant</th>
                  <th className="text-right px-3 py-2 border-b">Vnosov</th>
                  <th className="text-right px-3 py-2 border-b">Skupaj</th>
                </tr>
              </thead>
              <tbody>
                {tiskTop.map((r, i) => (
                  <tr key={i} className="odd:bg-white even:bg-gray-50">
                    <td className="px-3 py-2 border-b">{String(r.Kooperant)}</td>
                    <td className="text-right px-3 py-2 border-b">{Number(r.StVnosov || 0)}</td>
                    <td className="text-right px-3 py-2 border-b">{formatEUR0(Number(r.Skupaj || 0))}</td>
                  </tr>
                ))}
                {tiskTop.length === 0 && (
                  <tr><td className="px-3 py-2 text-gray-600" colSpan={3}>Ni podatkov v obdobju.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h4 className="font-semibold mb-2">Kooperanti – dodelave (TOP 10)</h4>
          <div className="overflow-auto">
            <table className="min-w-full border border-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 border-b">Kooperant</th>
                  <th className="text-right px-3 py-2 border-b">Vnosov</th>
                  <th className="text-right px-3 py-2 border-b">Skupaj</th>
                </tr>
              </thead>
              <tbody>
                {dodTop.map((r, i) => (
                  <tr key={i} className="odd:bg-white even:bg-gray-50">
                    <td className="px-3 py-2 border-b">{String(r.Kooperant)}</td>
                    <td className="text-right px-3 py-2 border-b">{Number(r.StVnosov || 0)}</td>
                    <td className="text-right px-3 py-2 border-b">{formatEUR0(Number(r.Skupaj || 0))}</td>
                  </tr>
                ))}
                {dodTop.length === 0 && (
                  <tr><td className="px-3 py-2 text-gray-600" colSpan={3}>Ni podatkov v obdobju.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h4 className="font-semibold mb-2">Dodelave – strošek po vrsti</h4>
        <div className="overflow-auto">
          <table className="min-w-full border border-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 border-b">Vrsta dodelave</th>
                <th className="text-right px-3 py-2 border-b">Vnosov</th>
                <th className="text-right px-3 py-2 border-b">Skupaj</th>
              </tr>
            </thead>
            <tbody>
              {dodVrsta.map((r, i) => (
                <tr key={i} className="odd:bg-white even:bg-gray-50">
                  <td className="px-3 py-2 border-b">{String(r.Vrsta)}</td>
                  <td className="text-right px-3 py-2 border-b">{Number(r.StVnosov || 0)}</td>
                  <td className="text-right px-3 py-2 border-b">{formatEUR0(Number(r.Skupaj || 0))}</td>
                </tr>
              ))}
              {dodVrsta.length === 0 && (
                <tr><td className="px-3 py-2 text-gray-600" colSpan={3}>Ni podatkov v obdobju.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div ref={trendContainerRef} className="bg-white border rounded-lg p-3 mt-6">
        <div className="font-semibold mb-2">Trend: strošek kooperantov (tisk vs dodelava)</div>
        <svg width={w} height={h}>
          <g transform={`translate(${padL}, 8)`}>
            <line x1={0} y1={0} x2={0} y2={innerH} stroke="#9ca3af" strokeWidth={1} />
            {[0, 0.5, 1].map((p) => {
              const y = innerH - p * innerH;
              const val = maxY * p;
              return (
                <g key={String(p)}>
                  <line x1={0} y1={y} x2={innerW} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" />
                  <text x={-8} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#6b7280">
                    {formatEUR0(val)}
                  </text>
                </g>
              );
            })}
            {keys.map((d, i) => {
              if (i % labelEvery !== 0 && i !== keys.length - 1) return null;
              return <text key={d} x={(keys.length === 1 ? innerW / 2 : i * stepX)} y={innerH + 14} fontSize="10" textAnchor="middle" fill="#374151">{d.slice(5)}</text>;
            })}
          </g>
          {keys.length > 0 && (
            <>
              <polyline points={pointsFor(tiskVals)} fill="none" stroke="#9333ea" strokeWidth={2} />
              <polyline points={pointsFor(dodVals)} fill="none" stroke="#16a34a" strokeWidth={2} />
            </>
          )}
        </svg>
        <div className="mt-2 text-xs flex gap-4">
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#9333ea' }}></span>Tisk</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#16a34a' }}></span>Dodelave</span>
        </div>
      </div>
    </div>
  );
};

// ---------- Prihodki po kupcih KPI ----------
const PrihodkiKupciKPI: React.FC = () => {
  const toISODate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const shiftMonths = (base: Date, deltaMonths: number) => {
    const y = base.getFullYear();
    const m = base.getMonth() + deltaMonths;
    const day = base.getDate();
    const first = new Date(y, m, 1);
    const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    first.setDate(Math.min(day, lastDay));
    return first;
  };
  const now = new Date();
  const [fromDay, setFromDay] = React.useState<string>(toISODate(shiftMonths(now, -3)));
  const [toDay, setToDay] = React.useState<string>(toISODate(now));
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!fromDay || !toDay) return;
    if (fromDay > toDay) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const url = `/api/analitika/prihodki-kupci?from=${encodeURIComponent(fromDay)}&to=${encodeURIComponent(toDay)}`;
    fetch(url, { signal: controller.signal })
      .then(async (r) => {
        if (r.ok) return r.json();
        const body = await r.text().catch(() => '');
        throw new Error(`HTTP ${r.status} ${r.statusText}${body ? `: ${body}` : ''}`);
      })
      .then(setData)
      .catch((e) => {
        if (controller.signal.aborted || e?.name === 'AbortError' || String(e?.message || '').toLowerCase().includes('aborted')) return;
        setError(e?.message ? String(e.message) : 'Napaka pri branju podatkov iz baze.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [fromDay, toDay]);

  const top: Array<any> = Array.isArray(data?.top) ? data.top : [];
  const daily: Array<any> = Array.isArray(data?.daily) ? data.daily : [];
  const formatEUR0 = (n: number) => new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

  const topIds = top.map(r => r.KupecID);
  const namesById = new Map<any, string>();
  top.forEach(r => namesById.set(r.KupecID, String(r.KupecNaziv || '(neznano)')));
  const daySet = new Set(daily.map(r => String(r.Dan || '').slice(0, 10)));
  const days = Array.from(daySet).sort();
  const seriesById = new Map<any, number[]>();
  topIds.forEach(id => seriesById.set(id, days.map(() => 0)));
  daily.forEach(r => {
    const d = String(r.Dan || '').slice(0, 10);
    const idx = days.indexOf(d);
    if (idx < 0) return;
    const id = r.KupecID;
    if (!seriesById.has(id)) return;
    seriesById.get(id)![idx] += Number(r.Skupaj || 0);
  });

  const trendContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [trendW, setTrendW] = React.useState<number>(0);
  React.useEffect(() => {
    const el = trendContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const cw = e.contentRect.width;
        if (cw > 0) setTrendW(cw);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const w = Math.max(320, trendW || 900);
  const h = 260;
  const padL = 64;
  const padB = 24;
  const innerW = w - padL - 12;
  const innerH = h - padB - 12;
  const stepX = innerW / Math.max(1, days.length - 1);
  const maxY = Math.max(1, ...topIds.flatMap(id => seriesById.get(id) || [0]));
  const scaleY = (v: number) => (v / maxY) * innerH;
  const labelEvery = days.length > 18 ? Math.ceil(days.length / 10) : 1;
  const palette = ['#2563eb','#16a34a','#f59e0b','#dc2626','#0ea5e9','#9333ea','#14b8a6','#f97316','#64748b','#84cc16'];
  const colorFor = (idx: number) => palette[idx % palette.length];
  const pointsFor = (vals: number[]) =>
    vals.map((v, i) => {
      const x = padL + (days.length === 1 ? innerW / 2 : i * stepX);
      const y = 8 + (innerH - scaleY(v));
      return `${x},${y}`;
    }).join(' ');

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Od dne</label>
          <input type="date" value={fromDay} onChange={e => setFromDay(e.target.value)} className="border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Do dne</label>
          <input type="date" value={toDay} onChange={e => setToDay(e.target.value)} className="border rounded px-2 py-1" />
        </div>
      </div>
      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
      {loading && <div className="text-sm text-gray-600 mb-3">Nalagam podatke…</div>}

      <div className="overflow-auto">
        <table className="min-w-full border border-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 border-b">Kupec</th>
              <th className="text-right px-3 py-2 border-b">Nalogov</th>
              <th className="text-right px-3 py-2 border-b">Prihodki</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r, i) => (
              <tr key={i} className="odd:bg-white even:bg-gray-50">
                <td className="px-3 py-2 border-b">{String(r.KupecNaziv || '(neznano)')}</td>
                <td className="text-right px-3 py-2 border-b">{Number(r.StNalogov || 0)}</td>
                <td className="text-right px-3 py-2 border-b">{formatEUR0(Number(r.Skupaj || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div ref={trendContainerRef} className="bg-white border rounded-lg p-3 mt-6">
        <div className="font-semibold mb-2">Trend: prihodki TOP 10 kupcev (dnevno)</div>
        <svg width={w} height={h}>
          <g transform={`translate(${padL}, 8)`}>
            <line x1={0} y1={0} x2={0} y2={innerH} stroke="#9ca3af" strokeWidth={1} />
            {[0, 0.5, 1].map((p) => {
              const y = innerH - p * innerH;
              const val = maxY * p;
              return (
                <g key={String(p)}>
                  <line x1={0} y1={y} x2={innerW} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" />
                  <text x={-8} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#6b7280">
                    {formatEUR0(val)}
                  </text>
                </g>
              );
            })}
            {days.map((d, i) => {
              if (i % labelEvery !== 0 && i !== days.length - 1) return null;
              return <text key={d} x={(days.length === 1 ? innerW / 2 : i * stepX)} y={innerH + 14} fontSize="10" textAnchor="middle" fill="#374151">{d.slice(5)}</text>;
            })}
          </g>
          {topIds.map((id, idx) => {
            const vals = seriesById.get(id) || [];
            return <polyline key={String(id)} points={pointsFor(vals)} fill="none" stroke={colorFor(idx)} strokeWidth={2} opacity={0.9} />;
          })}
        </svg>
        <div className="mt-2 text-xs flex flex-wrap gap-3">
          {topIds.map((id, idx) => (
            <span key={String(id)} className="inline-flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: colorFor(idx) }}></span>
              {namesById.get(id) || '(neznano)'}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---------- Čas dobave KPI ----------
const CasDobaveKPI: React.FC = () => {
  const toISODate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const shiftMonths = (base: Date, deltaMonths: number) => {
    const y = base.getFullYear();
    const m = base.getMonth() + deltaMonths;
    const day = base.getDate();
    const first = new Date(y, m, 1);
    const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    first.setDate(Math.min(day, lastDay));
    return first;
  };
  const now = new Date();
  const [fromDay, setFromDay] = React.useState<string>(toISODate(shiftMonths(now, -3)));
  const [toDay, setToDay] = React.useState<string>(toISODate(now));
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!fromDay || !toDay) return;
    if (fromDay > toDay) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const url = `/api/analitika/cas-dobave?from=${encodeURIComponent(fromDay)}&to=${encodeURIComponent(toDay)}`;
    fetch(url, { signal: controller.signal })
      .then(async (r) => {
        if (r.ok) return r.json();
        const body = await r.text().catch(() => '');
        throw new Error(`HTTP ${r.status} ${r.statusText}${body ? `: ${body}` : ''}`);
      })
      .then(setData)
      .catch((e) => {
        if (controller.signal.aborted || e?.name === 'AbortError' || String(e?.message || '').toLowerCase().includes('aborted')) return;
        setError(e?.message ? String(e.message) : 'Napaka pri branju podatkov iz baze.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [fromDay, toDay]);

  const summary = data?.summary || null;
  const daily: Array<any> = Array.isArray(data?.daily) ? data.daily : [];

  const minutesToHuman = (min: number) => {
    if (!Number.isFinite(min)) return '—';
    const abs = Math.abs(min);
    const days = Math.floor(abs / (60 * 24));
    const hours = Math.round((abs - days * 60 * 24) / 60);
    const sign = min < 0 ? '-' : '';
    if (days > 0) return `${sign}${days}d ${hours}h`;
    return `${sign}${Math.round(abs / 60)}h`;
  };

  const avgLead = summary?.AvgLeadMin != null ? Number(summary.AvgLeadMin) : null;
  const avgPlanned = summary?.AvgPlannedMin != null ? Number(summary.AvgPlannedMin) : null;
  const avgVsDeadline = summary?.AvgVsDeadlineMin != null ? Number(summary.AvgVsDeadlineMin) : null;
  const avgVsPlanned = (avgLead != null && avgPlanned != null) ? (avgLead - avgPlanned) : null;

  const trendContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [trendW, setTrendW] = React.useState<number>(0);
  React.useEffect(() => {
    const el = trendContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const cw = e.contentRect.width;
        if (cw > 0) setTrendW(cw);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const keys = daily.map(r => String(r.Dan || '').slice(0, 10));
  const leadVals = daily.map(r => Number(r.AvgLeadMin || 0));
  const deltaVals = daily.map(r => Number(r.AvgVsDeadlineMin || 0));
  const maxAbs = Math.max(1, ...leadVals.map(v => Math.abs(v)), ...deltaVals.map(v => Math.abs(v)));
  const w = Math.max(320, trendW || 720);
  const h = 240;
  const padL = 64;
  const padB = 24;
  const innerW = w - padL - 12;
  const innerH = h - padB - 12;
  const stepX = innerW / Math.max(1, keys.length - 1);
  const scaleY = (v: number) => (v / maxAbs) * innerH;
  const labelEvery = keys.length > 18 ? Math.ceil(keys.length / 10) : 1;
  const pointsFor = (vals: number[]) =>
    vals.map((v, i) => {
      const x = padL + (keys.length === 1 ? innerW / 2 : i * stepX);
      const y = 8 + (innerH - scaleY(v));
      return `${x},${y}`;
    }).join(' ');

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Od dne</label>
          <input type="date" value={fromDay} onChange={e => setFromDay(e.target.value)} className="border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Do dne</label>
          <input type="date" value={toDay} onChange={e => setToDay(e.target.value)} className="border rounded px-2 py-1" />
        </div>
      </div>
      {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
      {loading && <div className="text-sm text-gray-600 mb-3">Nalagam podatke…</div>}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mb-4">
        <div className="border rounded p-3 bg-gray-50">
          <div className="text-xs text-gray-600">Št. dobav</div>
          <div className="text-lg font-semibold">{summary?.StDobav ?? '—'}</div>
        </div>
        <div className="border rounded p-3 bg-gray-50">
          <div className="text-xs text-gray-600">Povp. odprtje → dobava</div>
          <div className="text-lg font-semibold">{avgLead != null ? minutesToHuman(avgLead) : '—'}</div>
        </div>
        <div className="border rounded p-3 bg-gray-50">
          <div className="text-xs text-gray-600">Povp. “plan” (odprtje → rok)</div>
          <div className="text-lg font-semibold">{avgPlanned != null ? minutesToHuman(avgPlanned) : '—'}</div>
        </div>
        <div className="border rounded p-3 bg-gray-50">
          <div className="text-xs text-gray-600">Povp. odstopanje od roka (dobava − rok)</div>
          <div className="text-lg font-semibold">{avgVsDeadline != null ? minutesToHuman(avgVsDeadline) : '—'}</div>
          <div className="text-xs text-gray-600 mt-1">(+ pomeni zamuda, − pomeni prej)</div>
        </div>
      </div>

      <div ref={trendContainerRef} className="bg-white border rounded-lg p-3">
        <div className="font-semibold mb-2">Trend (dnevno): čas dobave in odstopanje od roka</div>
        <svg width={w} height={h}>
          <g transform={`translate(${padL}, 8)`}>
            <line x1={0} y1={0} x2={0} y2={innerH} stroke="#9ca3af" strokeWidth={1} />
            {[0, 0.5, 1].map((p) => {
              const y = innerH - p * innerH;
              const val = maxAbs * p;
              return (
                <g key={String(p)}>
                  <line x1={0} y1={y} x2={innerW} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" />
                  <text x={-8} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#6b7280">
                    {minutesToHuman(val)}
                  </text>
                </g>
              );
            })}
            {keys.map((d, i) => {
              if (i % labelEvery !== 0 && i !== keys.length - 1) return null;
              return <text key={d} x={(keys.length === 1 ? innerW / 2 : i * stepX)} y={innerH + 14} fontSize="10" textAnchor="middle" fill="#374151">{d.slice(5)}</text>;
            })}
          </g>
          {keys.length > 0 && (
            <>
              <polyline points={pointsFor(leadVals)} fill="none" stroke="#2563eb" strokeWidth={2} />
              <polyline points={pointsFor(deltaVals)} fill="none" stroke="#dc2626" strokeWidth={2} strokeDasharray="6 4" />
            </>
          )}
        </svg>
        <div className="mt-2 text-xs flex gap-4">
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#2563eb' }}></span>Odprtje → dobava</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#dc2626' }}></span>Dobava − rok (črtkano)</span>
        </div>
        {avgVsPlanned != null && (
          <div className="mt-2 text-sm text-gray-700">
            Povprečno smo glede na plan (rok) <span className="font-semibold">{avgVsPlanned < 0 ? 'hitrejši' : 'počasnejši'}</span> za <span className="font-semibold">{minutesToHuman(avgVsPlanned)}</span>.
          </div>
        )}
      </div>
    </div>
  );
};


