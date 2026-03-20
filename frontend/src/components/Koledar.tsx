import React, { useEffect, useMemo, useRef, useState } from 'react';

type ClosedTask = { stevilkaNaloga: number; taskType: string; closedAt?: string };

type EmployeeSlot = {
  name: string;
  proizvodnja: boolean;
  administracija: boolean;
  proizvodnjaPct: number; // 0-100 (uporabi se, ko sta obkljukani obe)
  administracijaPct: number; // 0-100 (informativno; držimo vsoto ~100)
};

type DailySummary = {
  date: string; // YYYY-MM-DD
  availableHours: number;
  actualHours: number;
  predictedHours?: number; // plan ob 07:00 (ali fallback)
  metNorm: boolean;
  computedAt: string; // ISO
};

type KoledarProps = {
  nalogi: any[]; // pričakujemo elemente z .stevilkaNaloga in .casSekcije
  closedTasks: ClosedTask[];
};

const LS_BOOKINGS = 'koledarBookings-v1';
const LS_EMPLOYEES = 'koledarEmployees-v1';
const LS_YEAR = 'koledarSelectedYear-v1';
const LS_SUMMARY = 'koledarDailySummary-v1';
const LS_DODATNO_UNLOCK = 'koledarDodatnoUnlocked-v1';
const LS_DODATNO_LEFT_AT = 'koledarDodatnoLeftAt-v1';
const LS_PREDICT_7AM = 'koledarPredictedAt7-v1';

const PASSWORD_DODATNO = '407940';
const START_YEAR = 2026;
const H_PER_DAY = 7.5;

const MONTHS_SL = [
  'Januar', 'Februar', 'Marec', 'April', 'Maj', 'Junij',
  'Julij', 'Avgust', 'September', 'Oktober', 'November', 'December',
];
const DOW_SL_SHORT = ['Ned', 'Pon', 'Tor', 'Sre', 'Čet', 'Pet', 'Sob'];

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function ymdLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatWeekdayDate(ymd: string) {
  const d = new Date(`${ymd}T00:00:00`);
  const weekday = new Intl.DateTimeFormat('sl-SI', { weekday: 'long' }).format(d);
  return `${weekday} ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

function hashHue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

function easterSunday(year: number) {
  // Anonymous Gregorian algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=Mar, 4=Apr
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function slovenianHolidays(year: number): Record<string, string> {
  const out: Record<string, string> = {};
  const fixed: Array<[number, number, string]> = [
    [1, 1, 'Novo leto'],
    [1, 2, 'Novo leto (2)'],
    [2, 8, 'Prešernov dan'],
    [4, 27, 'Dan upora proti okupatorju'],
    [5, 1, 'Praznik dela'],
    [5, 2, 'Praznik dela (2)'],
    [6, 25, 'Dan državnosti'],
    [8, 15, 'Marijino vnebovzetje'],
    [10, 31, 'Dan reformacije'],
    [11, 1, 'Dan spomina na mrtve'],
    [12, 25, 'Božič'],
    [12, 26, 'Dan samostojnosti in enotnosti'],
  ];
  for (const [m, d, name] of fixed) out[`${year}-${pad2(m)}-${pad2(d)}`] = name;

  const easter = easterSunday(year);
  const easterMonday = new Date(easter);
  easterMonday.setDate(easterMonday.getDate() + 1);
  out[ymdLocal(easterMonday)] = 'Velikonočni ponedeljek';

  const pentecost = new Date(easter);
  pentecost.setDate(pentecost.getDate() + 49);
  out[ymdLocal(pentecost)] = 'Binkošti';

  return out;
}

function clampPct(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: any) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export default function Koledar({ nalogi, closedTasks }: KoledarProps) {
  const currentYear = new Date().getFullYear();
  const initialYear = (() => {
    const stored = Number(localStorage.getItem(LS_YEAR) || '');
    if (Number.isFinite(stored) && stored >= START_YEAR) return stored;
    return Math.max(START_YEAR, currentYear);
  })();

  type BookingEntry = { name: string; kind: 'dopust' | 'bolniska' };
  type DayBooking = { kolektivni: boolean; entries: BookingEntry[] };
  const normalizeBookings = (raw: any): Record<string, DayBooking> => {
    const out: Record<string, DayBooking> = {};
    const src = (raw && typeof raw === 'object') ? raw : {};
    for (const k of Object.keys(src)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
      const v = (src as any)[k];
      if (Array.isArray(v)) {
        const names = v.slice(0, 4).map((x: any) => String(x || '')).filter((s: string) => s.trim().length > 0);
        out[k] = { kolektivni: false, entries: names.map(name => ({ name, kind: 'dopust' as const })) };
        continue;
      }
      if (v && typeof v === 'object') {
        const kolektivni = !!(v as any).kolektivni;
        const entriesRaw = Array.isArray((v as any).entries) ? (v as any).entries : [];
        const entries: BookingEntry[] = entriesRaw
          .slice(0, 4)
          .map((e: any) => ({
            name: String(e?.name || ''),
            kind: (String(e?.kind || 'dopust') === 'bolniska') ? 'bolniska' : 'dopust',
          }))
          .filter((e: BookingEntry) => e.name.trim().length > 0);
        out[k] = { kolektivni, entries };
      }
    }
    return out;
  };

  const [year, setYear] = useState<number>(initialYear);
  const [bookings, setBookings] = useState<Record<string, DayBooking>>(() => normalizeBookings(loadJson(LS_BOOKINGS, {} as any)));
  const [employees, setEmployees] = useState<EmployeeSlot[]>(() => {
    const loaded = loadJson<EmployeeSlot[] | null>(LS_EMPLOYEES, null);
    if (Array.isArray(loaded) && loaded.length > 0) {
      return Array.from({ length: 15 }).map((_, i) => {
        const v = loaded[i] as any;
        return {
          name: String(v?.name || ''),
          proizvodnja: !!v?.proizvodnja,
          administracija: !!v?.administracija,
          proizvodnjaPct: clampPct(v?.proizvodnjaPct ?? 100),
          administracijaPct: clampPct(v?.administracijaPct ?? 0),
        };
      });
    }
    return Array.from({ length: 15 }).map(() => ({
      name: '',
      proizvodnja: false,
      administracija: false,
      proizvodnjaPct: 100,
      administracijaPct: 0,
    }));
  });

  const [dodatnoUnlocked, setDodatnoUnlocked] = useState<boolean>(() => localStorage.getItem(LS_DODATNO_UNLOCK) === '1');
  const [showPwModal, setShowPwModal] = useState(false);
  const [pw, setPw] = useState('');
  const [pwErr, setPwErr] = useState('');
  const pwInputRef = useRef<HTMLInputElement | null>(null);
  const DODATNO_LEAVE_GRACE_MS = 2 * 60 * 1000;
  const DODATNO_IDLE_LOCK_MS = 10 * 60 * 1000;
  const dodatnoLastActivityRef = useRef<number>(0);
  const dodatnoTouchThrottleRef = useRef<number>(0);

  // multi-select + drag
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const dragStartedRef = useRef(false);

  const [showNameModal, setShowNameModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string>(''); // name
  const [selectedKind, setSelectedKind] = useState<'dopust'|'bolniska'>('dopust');
  const [kolektivni, setKolektivni] = useState(false);
  const [nameErr, setNameErr] = useState('');

  const holidays = useMemo(() => slovenianHolidays(year), [year]);
  const holidaysCurrentYear = useMemo(() => slovenianHolidays(currentYear), [currentYear]);

  const yearOptions = useMemo(() => {
    const max = Math.max(START_YEAR, new Date().getFullYear() + 5);
    const arr: number[] = [];
    for (let y = START_YEAR; y <= max; y++) arr.push(y);
    return arr;
  }, []);

  useEffect(() => saveJson(LS_BOOKINGS, bookings), [bookings]);
  useEffect(() => saveJson(LS_EMPLOYEES, employees), [employees]);
  useEffect(() => {
    try {
      localStorage.setItem(LS_YEAR, String(year));
    } catch {}
  }, [year]);

  // evidence snapshots
  const [summaries, setSummaries] = useState<Record<string, DailySummary>>(() => loadJson(LS_SUMMARY, {} as any));
  useEffect(() => saveJson(LS_SUMMARY, summaries), [summaries]);
  const [predictedAt7, setPredictedAt7] = useState<Record<string, { predictedHours: number; computedAt: string }>>(() => loadJson(LS_PREDICT_7AM, {} as any));
  useEffect(() => saveJson(LS_PREDICT_7AM, predictedAt7), [predictedAt7]);

  // Shared koledar state sync (LAN): employees + bookings preko backend-a
  const suppressKoledarSyncRef = useRef(false);
  const koledarSyncTimerRef = useRef<number | null>(null);
  const koledarSuppressTimerRef = useRef<number | null>(null);

  const applyRemoteKoledarState = (st: any) => {
    if (!st || typeof st !== 'object') return;
    // Med apply remote state NE pošiljaj nazaj na backend, sicer lahko prepišemo z delnim/starejšim stanjem (utripanje).
    suppressKoledarSyncRef.current = true;
    if (koledarSyncTimerRef.current != null) window.clearTimeout(koledarSyncTimerRef.current);
    koledarSyncTimerRef.current = null;
    if (koledarSuppressTimerRef.current != null) window.clearTimeout(koledarSuppressTimerRef.current);

    if ('employees' in st) setEmployees(Array.isArray((st as any).employees) ? (st as any).employees : []);
    if ('bookings' in st) setBookings(normalizeBookings((st as any).bookings));

    // Pusti malo časa, da se oba setState-a uveljavita, preden spet dovolimo POST nazaj.
    koledarSuppressTimerRef.current = window.setTimeout(() => {
      suppressKoledarSyncRef.current = false;
      koledarSuppressTimerRef.current = null;
    }, 350);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/koledar/state');
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const st = data?.state;
        if (!st || typeof st !== 'object') return;
        if (cancelled) return;
        applyRemoteKoledarState(st);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Poll koledar state (10s) kot varovalka, če SSE event ne pride
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const tick = async () => {
      if (cancelled || inFlight) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const res = await fetch('/api/koledar/state');
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const st = data?.state;
        if (!st || typeof st !== 'object') return;
        applyRemoteKoledarState(st);
      } catch {}
      finally { inFlight = false; }
    };
    const id = window.setInterval(tick, 10_000);
    tick();
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  useEffect(() => {
    const onEvt = (e: any) => {
      const st = e?.detail;
      if (!st || typeof st !== 'object') return;
      applyRemoteKoledarState(st);
    };
    window.addEventListener('koledar-updated', onEvt as any);
    return () => window.removeEventListener('koledar-updated', onEvt as any);
  }, []);

  useEffect(() => {
    if (suppressKoledarSyncRef.current) return;
    if (koledarSyncTimerRef.current != null) window.clearTimeout(koledarSyncTimerRef.current);
    koledarSyncTimerRef.current = window.setTimeout(() => {
      try {
        fetch('/api/koledar/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employees, bookings }),
        }).catch(() => {});
      } catch {}
    }, 400);
    return () => {
      if (koledarSyncTimerRef.current != null) window.clearTimeout(koledarSyncTimerRef.current);
      koledarSyncTimerRef.current = null;
    };
  }, [employees, bookings]);

  useEffect(() => {
    if (!showPwModal) return;
    requestAnimationFrame(() => pwInputRef.current?.focus());
  }, [showPwModal]);

  const nalogCasMap = useMemo(() => {
    const m = new Map<number, any>();
    (nalogi || []).forEach((n: any) => {
      const id = Number(n?.stevilkaNaloga);
      if (!Number.isFinite(id)) return;
      if (n?.casSekcije) m.set(id, n.casSekcije);
    });
    return m;
  }, [nalogi]);

  const taskTypeToKey: Record<string, string> = {
    'Tisk': 'tisk',
    'UV Tisk': 'uvTisk',
    'Plastifikacija': 'plastifikacija',
    'UV Lak': 'uvLak',
    'Izsek/Zasek': 'izsek',
    'Razrez': 'razrez',
    'Topli tisk': 'topliTisk',
    'Biganje': 'biganje',
    'Biganje + ročno zgibanje': 'biganjeRocnoZgibanje',
    'Zgibanje': 'zgibanje',
    'Lepljenje': 'lepljenje',
    'Lepljenje blokov': 'lepljenjeBlokov',
    'Vezava': 'vezava',
    'Vrtanje luknje': 'vrtanjeLuknje',
    'Perforacija': 'perforacija',
    'Dodatno': 'dodatno',
  };

  const isTaskClosed = (stevilkaNaloga: number, taskType: string) => {
    return (closedTasks || []).some(t => Number(t?.stevilkaNaloga) === Number(stevilkaNaloga) && String(t?.taskType || '') === String(taskType));
  };

  const actualHoursByDate = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of closedTasks || []) {
      const when = t?.closedAt ? new Date(t.closedAt) : null;
      if (!when || isNaN(when.getTime())) continue;
      const date = ymdLocal(when);
      const casSekcije = nalogCasMap.get(Number(t.stevilkaNaloga));
      const key = taskTypeToKey[String(t.taskType || '')];
      if (!casSekcije || !key) continue;
      const minutes = Number(casSekcije[key] || 0);
      if (!Number.isFinite(minutes) || minutes <= 0) continue;
      out[date] = (out[date] || 0) + (minutes / 60);
    }
    Object.keys(out).forEach((k) => (out[k] = Math.round(out[k] * 10) / 10));
    return out;
  }, [closedTasks, nalogCasMap]);

  const normalizeDueDate = (rok: any): string => {
    const s = String(rok || '').trim();
    if (!s) return '';
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(s);
    if (!isNaN(d.getTime())) return ymdLocal(d);
    return '';
  };

  const predictedHoursByDueDate = useMemo(() => {
    // za vsak datum roka: seštevek "preostanka" (ne-zaključenih dodelav) za aktivne naloge
    const out: Record<string, number> = {};
    for (const n of nalogi || []) {
      if (!n) continue;
      if (String(n.status || '') !== 'v_delu') continue;
      const due = normalizeDueDate((n as any).rokIzdelave ?? (n as any).podatki?.rokIzdelave);
      if (!due) continue;
      const id = Number((n as any).stevilkaNaloga);
      if (!Number.isFinite(id) || id <= 0) continue;
      const cs = (n as any).casSekcije;
      if (!cs || typeof cs !== 'object') continue;
      let remainingMin = 0;
      for (const [taskType, key] of Object.entries(taskTypeToKey)) {
        if (taskType === 'Kooperanti') continue;
        if (isTaskClosed(id, taskType)) continue;
        const minutes = Number((cs as any)[key] || 0);
        if (Number.isFinite(minutes) && minutes > 0) remainingMin += minutes;
      }
      const h = remainingMin / 60;
      if (h > 0) out[due] = (out[due] || 0) + h;
    }
    Object.keys(out).forEach((k) => (out[k] = Math.round(out[k] * 10) / 10));
    return out;
  }, [nalogi, taskTypeToKey, closedTasks]);

  const dueDatesUpcoming = useMemo(() => {
    const today = ymdLocal(new Date());
    const dates = Object.keys(predictedHoursByDueDate).filter(d => d >= today);
    dates.sort();
    return dates;
  }, [predictedHoursByDueDate]);

  // Auto-scroll plan na današnji dan (če je prisoten)
  useEffect(() => {
    if (!dodatnoUnlocked) return;
    const today = ymdLocal(new Date());
    const el = document.getElementById(`plan-row-${today}`);
    if (el) {
      el.scrollIntoView({ block: 'center' });
    }
  }, [dodatnoUnlocked, dueDatesUpcoming]);

  const months = useMemo(() => {
    return Array.from({ length: 12 }).map((_, m) => {
      const daysInMonth = new Date(year, m + 1, 0).getDate();
      const days = Array.from({ length: daysInMonth }).map((__, i) => {
        const d = new Date(year, m, i + 1);
        const date = ymdLocal(d);
        const dow = d.getDay();
        const holidayName = holidays[date] || '';
        const isWeekend = dow === 0 || dow === 6;
        return { date, day: i + 1, dow, isWeekend, holidayName };
      });
      return { monthIdx: m, monthName: MONTHS_SL[m], days };
    });
  }, [year, holidays]);

  const isEmployeeAbsent = (date: string, employeeName: string) => {
    const dn = (employeeName || '').trim().toLowerCase();
    if (!dn) return false;
    const day = bookings[date];
    if (day?.kolektivni) return true;
    const arr = Array.isArray(day?.entries) ? day.entries : [];
    return arr.some((b) => String(b?.name || '').trim().toLowerCase() === dn);
  };

  const productionSharePct = (e: EmployeeSlot) => {
    if (!e.proizvodnja) return 0;
    if (!e.administracija) return 100;
    return clampPct(e.proizvodnjaPct);
  };

  const availableProductionHours = (date: string) => {
    if (bookings[date]?.kolektivni) return 0;
    let sum = 0;
    for (const e of employees) {
      const name = (e?.name || '').trim();
      if (!name) continue;
      const share = productionSharePct(e);
      if (share <= 0) continue;
      if (isEmployeeAbsent(date, name)) continue;
      sum += H_PER_DAY * (share / 100);
    }
    return Math.round(sum * 10) / 10;
  };

  const isWorkday = (date: string) => {
    const d = new Date(`${date}T00:00:00`);
    const dow = d.getDay();
    return dow >= 1 && dow <= 5 && !holidays[date];
  };

  const isWorkdayFor = (date: string, holidaysMap: Record<string, string>) => {
    const d = new Date(`${date}T00:00:00`);
    const dow = d.getDay();
    return dow >= 1 && dow <= 5 && !holidaysMap[date] && !bookings[date]?.kolektivni;
  };

  const getDaySummary = (date: string, holidaysMap: Record<string, string>): DailySummary | null => {
    const todayYmd = ymdLocal(new Date());
    if (!isWorkdayFor(date, holidaysMap)) return null;
    const snapshot = summaries[date];
    if (date < todayYmd && snapshot) return snapshot;
    const availableHours = availableProductionHours(date);
    const actualHours = Number(actualHoursByDate[date] || 0);
    const predictedFromDue = Object.prototype.hasOwnProperty.call(predictedHoursByDueDate, date)
      ? Number(predictedHoursByDueDate[date] || 0)
      : undefined;
    const predictedHours = predictedAt7[date]?.predictedHours ?? predictedFromDue;
    const metNorm = (typeof predictedHours === 'number' && predictedHours > 0)
      ? actualHours >= predictedHours
      : (actualHours >= availableHours && availableHours > 0);
    return {
      date,
      availableHours,
      actualHours,
      predictedHours,
      metNorm,
      computedAt: new Date().toISOString(),
    };
  };

  const touchDodatnoActivity = () => {
    const now = Date.now();
    if (now - dodatnoTouchThrottleRef.current < 600) return;
    dodatnoTouchThrottleRef.current = now;
    dodatnoLastActivityRef.current = now;
  };

  const lockDodatno = () => {
    setDodatnoUnlocked(false);
    try { localStorage.setItem(LS_DODATNO_UNLOCK, '0'); } catch {}
    try { localStorage.setItem(LS_DODATNO_LEFT_AT, String(Date.now())); } catch {}
    dodatnoLastActivityRef.current = 0;
    dodatnoTouchThrottleRef.current = 0;
  };

  // Dodatno: zaklep po izhodu iz zavihka (component unmount) – ob vrnitvi v 2 min ostane, sicer zaklenemo
  useEffect(() => {
    const leftAt = Number(localStorage.getItem(LS_DODATNO_LEFT_AT) || 0);
    if (dodatnoUnlocked && leftAt) {
      if (Date.now() - leftAt >= DODATNO_LEAVE_GRACE_MS) {
        lockDodatno();
      } else {
        // vrnitev znotraj grace: resetiraj leftAt
        try { localStorage.setItem(LS_DODATNO_LEFT_AT, '0'); } catch {}
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dodatnoUnlocked) return;
    dodatnoLastActivityRef.current = Date.now();
    dodatnoTouchThrottleRef.current = 0;

    const onActivity = () => touchDodatnoActivity();
    window.addEventListener('mousemove', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity);
    window.addEventListener('click', onActivity, true);
    window.addEventListener('scroll', onActivity, true);

    const interval = window.setInterval(() => {
      const last = dodatnoLastActivityRef.current || 0;
      if (last && Date.now() - last >= DODATNO_IDLE_LOCK_MS) {
        lockDodatno();
      }
    }, 1000);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('mousemove', onActivity as any);
      window.removeEventListener('keydown', onActivity as any);
      window.removeEventListener('click', onActivity as any, true);
      window.removeEventListener('scroll', onActivity as any, true);
      if (dodatnoUnlocked) {
        try { localStorage.setItem(LS_DODATNO_LEFT_AT, String(Date.now())); } catch {}
      }
    };
  }, [dodatnoUnlocked]);

  // Snapshot plan ob 07:00 + zaključek ob 20:00 (tekoči dan)
  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = new Date();
      const date = ymdLocal(now);
      const hh = now.getHours();
      const mm = now.getMinutes();
      const key7 = predictedAt7[date];
      // 07:00 snapshot (če še ni)
      if ((hh > 7 || (hh === 7 && mm >= 0)) && !key7) {
        const predictedHours = Number(predictedHoursByDueDate[date] || 0);
        setPredictedAt7((prev) => ({
          ...prev,
          [date]: { predictedHours, computedAt: new Date().toISOString() },
        }));
      }
      // 20:00 finalize v evidenco (tekoče leto)
      if (hh === 20 && mm >= 0) {
        // samo če je datum v tekočem letu in je delovni dan
        if (date.startsWith(String(currentYear)) && isWorkdayFor(date, holidaysCurrentYear)) {
          setSummaries((prev) => {
            // ne prepisuj, če je že shranjeno za ta dan (razen če je prazno)
            if (prev?.[date]) return prev;
            const predictedHours = (predictedAt7[date]?.predictedHours ?? Number(predictedHoursByDueDate[date] || 0));
            const availableHours = availableProductionHours(date);
            const actualHours = Number(actualHoursByDate[date] || 0);
            const metNorm = predictedHours > 0 ? (actualHours >= predictedHours) : (actualHours >= availableHours && availableHours > 0);
            return {
              ...prev,
              [date]: {
                date,
                availableHours,
                actualHours,
                predictedHours,
                metNorm,
                computedAt: new Date().toISOString(),
              },
            };
          });
        }
      }
    }, 30 * 1000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [predictedHoursByDueDate, actualHoursByDate, employees, bookings, holidaysCurrentYear, currentYear, predictedAt7]);

  const dayClass = (d: { isWeekend: boolean; holidayName: string; date: string }) => {
    const isHoliday = !!d.holidayName;
    const isSelected = selected.has(d.date);
    return [
      'rounded border px-1 py-0.5 text-xs select-none',
      isSelected ? 'border-blue-600 ring-2 ring-blue-200' : 'border-gray-200',
      isHoliday ? 'bg-red-100 text-red-900' : (d.isWeekend ? 'bg-amber-100 text-amber-900' : 'bg-white text-gray-900'),
      'hover:bg-blue-50 cursor-pointer',
    ].join(' ');
  };

  const openNameModal = () => {
    setNameErr('');
    setSelectedEmployee('');
    setSelectedKind('dopust');
    setKolektivni(false);
    setShowNameModal(true);
  };

  const commitBookingToSelected = () => {
    const dates = Array.from(selected);
    if (dates.length === 0) {
      setNameErr('Ni izbranega dneva.');
      return;
    }
    const next: Record<string, DayBooking> = { ...bookings };
    if (kolektivni && !selectedEmployee) {
      for (const date of dates) {
        next[date] = { kolektivni: true, entries: [] };
      }
      setBookings(next);
      setShowNameModal(false);
      setSelected(new Set());
      return;
    }
    const name = (selectedEmployee || '').trim();
    if (!name) { setNameErr('Izberi zaposlenega ali označi kolektivni dopust.'); return; }
    let fullDays = 0;
    for (const date of dates) {
      const day = next[date] || { kolektivni: false, entries: [] };
      if (day.kolektivni) {
        // če je bil kolektivni, ga odstranimo in dodamo posameznike
        day.kolektivni = false;
        day.entries = [];
      }
      const entries = Array.isArray(day.entries) ? [...day.entries] : [];
      const exists = entries.some(e => String(e?.name || '').trim().toLowerCase() === name.toLowerCase());
      if (exists) { next[date] = { ...day, entries }; continue; }
      if (entries.length >= 4) { fullDays++; next[date] = { ...day, entries }; continue; }
      entries.push({ name, kind: selectedKind });
      next[date] = { ...day, entries };
    }
    setBookings(next);
    setShowNameModal(false);
    setSelected(new Set());
    if (fullDays > 0) alert(`Nekateri dnevi imajo že 4 vnose (preskočeno: ${fullDays}).`);
  };

  const removeBooking = (date: string, name: string) => {
    if (!confirm(`Odstranim vnos "${name}" za ${date}?`)) return;
    const next = { ...bookings };
    const day = next[date];
    if (!day) return;
    const target = String(name || '').trim().toLowerCase();
    const entries = (day.entries || []).filter((e) => String(e?.name || '').trim().toLowerCase() !== target);
    const outDay: DayBooking = { kolektivni: !!day.kolektivni, entries };
    if (!outDay.kolektivni && outDay.entries.length === 0) delete next[date];
    else next[date] = outDay;
    setBookings(next);
  };

  const clearKolektivni = (date: string) => {
    if (!confirm(`Odstranim kolektivni dopust za ${date}?`)) return;
    const next = { ...bookings };
    delete next[date];
    setBookings(next);
  };

  const onDayMouseDown = (date: string) => {
    dragStartedRef.current = true;
    setDragging(true);
    setSelected(new Set([date]));
  };
  const onDayMouseEnter = (date: string) => {
    if (!dragging) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.add(date);
      return next;
    });
  };

  useEffect(() => {
    const onUp = () => {
      if (!dragging) return;
      setDragging(false);
      if (dragStartedRef.current) {
        dragStartedRef.current = false;
        if (selected.size > 0) openNameModal();
      }
    };
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mouseleave', onUp as any);
    return () => {
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mouseleave', onUp as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, selected]);

  const resetSummaries = () => {
    if (!confirm('Res izbrišem evidenco za pretekle dni?')) return;
    setSummaries({});
  };

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-2xl font-bold">Koledar</div>
          <div className="text-sm text-gray-600">
            Klikni ali povleci čez dni za vnos (max 4 vnosi/dan). Vikendi/prazniki so obarvani.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-gray-700">Leto</div>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border rounded px-2 py-1 bg-white"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Letni prikaz */}
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="grid grid-cols-12 gap-3">
          {months.map((m) => (
            <div key={m.monthIdx} className="min-w-0">
              <div className="text-sm font-bold text-center mb-2">{m.monthName}</div>
              <div className="flex flex-col gap-1">
                {m.days.map((d) => {
                  const day = bookings[d.date] || null;
                  const dayBookings = day?.entries || [];
                  return (
                    <div
                      key={d.date}
                      className={dayClass(d)}
                      title={d.holidayName ? `${d.holidayName} (${d.date})` : d.date}
                      onMouseDown={() => onDayMouseDown(d.date)}
                      onMouseEnter={() => onDayMouseEnter(d.date)}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="font-medium">
                          {d.day}. <span className="font-normal">{DOW_SL_SHORT[d.dow]}</span>
                        </div>
                        {d.holidayName ? (
                          <div className="text-[10px] font-semibold truncate max-w-[80px]">{d.holidayName}</div>
                        ) : null}
                      </div>
                      {day?.kolektivni && (
                        <div className="mt-1">
                          <div className="flex items-center justify-between gap-1 rounded px-1 bg-gray-200 border border-gray-300">
                            <span className="truncate font-semibold">KOLEKTIVNI DOPUST</span>
                            <button
                              type="button"
                              className="text-[10px] text-gray-700 hover:text-black"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                clearKolektivni(d.date);
                              }}
                              title="Odstrani kolektivni dopust"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      )}
                      {dayBookings.length > 0 && (
                        <div className="mt-1 flex flex-col gap-0.5">
                          {dayBookings.slice(0, 4).map((name, idx) => {
                            const entry = dayBookings[idx] as any;
                            const nm = String(entry?.name || name || '');
                            const kind = (entry?.kind === 'bolniska') ? 'B' : 'D';
                            const hue = hashHue(nm.toLowerCase());
                            const bg = `hsl(${hue} 70% 90%)`;
                            const bd = `hsl(${hue} 70% 60%)`;
                            return (
                              <div
                                key={`${nm}-${idx}`}
                                className="flex items-center justify-between gap-1 rounded px-1"
                                style={{ backgroundColor: bg, border: `1px solid ${bd}` }}
                              >
                                <span className="truncate">{nm} <span className="font-semibold">({kind})</span></span>
                                <button
                                  type="button"
                                  className="text-[10px] text-gray-700 hover:text-black"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeBooking(d.date, nm);
                                  }}
                                  title="Odstrani vnos"
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dodatno (skrito) */}
      <div className="mt-6">
        {!dodatnoUnlocked ? (
          <button
            type="button"
            className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-sm font-medium"
            onClick={() => {
              setPwErr('');
              setPw('');
              setShowPwModal(true);
            }}
          >
            Dodatno
          </button>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-bold">Dodatno</div>
                <div className="text-sm text-gray-600">
                  Zaklene se po 10 min neaktivnosti ali če zapustiš zavihek za več kot 2 min.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetSummaries}
                  className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300 text-sm"
                  title="Izbriši evidenco"
                >
                  Reset evidenca
                </button>
                <button
                  type="button"
                  onClick={lockDodatno}
                  className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300 text-sm"
                  title="Skrij Dodatno"
                >
                  Skrij
                </button>
              </div>
            </div>

            {/* PLAN (po rokih) */}
            <div className="mt-4">
              <div className="text-lg font-bold mb-1">Plan po rokih (delovni dnevi)</div>
              <div className="text-sm text-gray-600 mb-3">
                Prikazani so dnevi v prihodnje, za katere obstajajo aktivni nalogi z rokom. Današnji dan je označen rdeče.
              </div>

              <div className="border rounded max-h-[34vh] overflow-auto">
                <div className="sticky top-0 bg-gray-50 border-b px-3 py-2 text-xs text-gray-700">
                  <div className="grid grid-cols-5 gap-2">
                    <div className="font-semibold">Dan</div>
                    <div className="font-semibold text-right">Število predvidenih ur dela</div>
                    <div className="font-semibold text-right">Število razpoložljivih ur delavcev</div>
                    <div className="font-semibold text-right">Razlika</div>
                    <div className="font-semibold text-right">Narejene ure</div>
                  </div>
                </div>
                {(() => {
                  const today = ymdLocal(new Date());
                  const rows = dueDatesUpcoming;
                  if (rows.length === 0) {
                    return <div className="p-3 text-sm text-gray-500">Ni aktivnih nalogov z roki v prihodnje.</div>;
                  }
                  return (
                    <div>
                      {rows.map((date) => {
                        const predicted = Number(predictedHoursByDueDate[date] || 0);
                        const available = availableProductionHours(date);
                        const actual = Number(actualHoursByDate[date] || 0);
                        const diff = Math.round((available - predicted) * 10) / 10;
                        const isToday = date === today;
                        const diffClass = diff >= 0 ? 'text-green-700' : 'text-red-700';
                        return (
                          <div
                            key={date}
                            id={`plan-row-${date}`}
                            className={`px-3 py-2 border-b last:border-b-0 ${isToday ? 'bg-red-50' : 'bg-white'}`}
                          >
                            <div className="grid grid-cols-5 gap-2 items-center text-sm">
                              <div className="font-medium">{formatWeekdayDate(date)}</div>
                              <div className="text-right">{predicted.toFixed(1)} h</div>
                              <div className="text-right">{available.toFixed(1)} h</div>
                              <div className={`text-right font-semibold ${diffClass}`}>{diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)} h</div>
                              <div className="text-right">{actual.toFixed(1)} h</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Evidenca norme – tekoče leto */}
            <div className="mt-6">
              <div className="text-lg font-bold">Evidenca (tekoče leto)</div>
              <div className="text-sm text-gray-600">
                V tabeli je samo tekoče leto. Shrani se avtomatsko ob 20:00.
              </div>
              <div className="mt-3 max-h-[36vh] overflow-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-2">Datum</th>
                      <th className="text-right p-2">Predvidene ure (07:00)</th>
                      <th className="text-right p-2">Razpoložljive ure</th>
                      <th className="text-right p-2">Narejene ure</th>
                      <th className="text-center p-2">Rezultat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const rows: DailySummary[] = [];
                      const start = new Date(currentYear, 0, 1);
                      const end = new Date(currentYear, 11, 31);
                      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                        const date = ymdLocal(d);
                        const s = getDaySummary(date, holidaysCurrentYear);
                        if (!s) continue;
                        rows.push(s);
                      }
                      if (rows.length === 0) {
                        return (
                          <tr>
                            <td className="p-2 text-gray-500" colSpan={5}>Ni podatkov.</td>
                          </tr>
                        );
                      }
                      const todayYmd = ymdLocal(new Date());
                      return rows.map((s) => {
                        const isToday = s.date === todayYmd;
                        const dateLabel = formatWeekdayDate(s.date);
                        return (
                        <tr key={s.date} className="border-b last:border-b-0">
                          <td className="p-2">
                            {isToday ? (
                              <span className="inline-flex items-center rounded-full border border-red-400 bg-red-50 px-2 py-0.5">
                                {dateLabel}
                              </span>
                            ) : (
                              dateLabel
                            )}
                          </td>
                          <td className="p-2 text-right">{(typeof s.predictedHours === 'number' ? s.predictedHours : 0).toFixed(1)} h</td>
                          <td className="p-2 text-right">{s.availableHours.toFixed(1)} h</td>
                          <td className="p-2 text-right">{s.actualHours.toFixed(1)} h</td>
                          <td className="p-2 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${s.metNorm ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {s.metNorm ? 'OK' : 'NI OK'}
                            </span>
                          </td>
                        </tr>
                      )});
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Zaposleni (15 polj) – brez horizontalnega scrolla */}
            <div className="mt-6">
              <div className="text-lg font-bold mb-2">Zaposleni (15 polj)</div>
              <div className="text-sm text-gray-600 mb-3">
                Vsak zaposleni: obkljukaj proizvodnja/administracija. Če sta obe, nastavi % (vsota naj bo 100).
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {employees.map((e, idx) => {
                  const both = e.proizvodnja && e.administracija;
                  return (
                    <div key={idx} className="border rounded p-3 bg-gray-50">
                      <div className="text-xs font-semibold text-gray-600 mb-1">#{idx + 1}</div>
                      <input
                        value={e.name}
                        onChange={(ev) => {
                          const v = ev.target.value;
                          setEmployees((prev) => prev.map((x, i) => i === idx ? { ...x, name: v } : x));
                        }}
                        placeholder="Ime zaposlenega"
                        className="w-full border rounded px-2 py-1 bg-white text-sm"
                      />
                      <div className="mt-2 space-y-1 text-sm">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={e.proizvodnja}
                            onChange={(ev) => {
                              const proizvodnja = ev.target.checked;
                              setEmployees((prev) => prev.map((x, i) => {
                                if (i !== idx) return x;
                                const next = { ...x, proizvodnja };
                                if (!proizvodnja) next.proizvodnjaPct = 0;
                                if (proizvodnja && !next.administracija) {
                                  next.proizvodnjaPct = 100;
                                  next.administracijaPct = 0;
                                }
                                return next;
                              }));
                            }}
                          />
                          Proizvodnja
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={e.administracija}
                            onChange={(ev) => {
                              const administracija = ev.target.checked;
                              setEmployees((prev) => prev.map((x, i) => {
                                if (i !== idx) return x;
                                const next = { ...x, administracija };
                                if (administracija && !next.proizvodnja) {
                                  next.proizvodnjaPct = 0;
                                  next.administracijaPct = 100;
                                }
                                if (!administracija && next.proizvodnja) {
                                  next.proizvodnjaPct = 100;
                                  next.administracijaPct = 0;
                                }
                                if (administracija && next.proizvodnja) {
                                  if (next.proizvodnjaPct === 0 && next.administracijaPct === 0) {
                                    next.proizvodnjaPct = 50;
                                    next.administracijaPct = 50;
                                  } else if (next.proizvodnjaPct + next.administracijaPct !== 100) {
                                    next.administracijaPct = 100 - clampPct(next.proizvodnjaPct);
                                  }
                                }
                                return next;
                              }));
                            }}
                          />
                          Priprava / admin
                        </label>
                      </div>

                      {both && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <label className="text-xs text-gray-700">
                            % prod.
                            <input
                              type="number"
                              value={e.proizvodnjaPct}
                              onChange={(ev) => {
                                const v = clampPct(ev.target.value);
                                setEmployees((prev) => prev.map((x, i) => i === idx ? { ...x, proizvodnjaPct: v, administracijaPct: 100 - v } : x));
                              }}
                              className="mt-1 w-full border rounded px-2 py-1 bg-white text-sm"
                              min={0}
                              max={100}
                            />
                          </label>
                          <label className="text-xs text-gray-700">
                            % admin
                            <input
                              type="number"
                              value={e.administracijaPct}
                              onChange={(ev) => {
                                const v = clampPct(ev.target.value);
                                setEmployees((prev) => prev.map((x, i) => i === idx ? { ...x, administracijaPct: v, proizvodnjaPct: 100 - v } : x));
                              }}
                              className="mt-1 w-full border rounded px-2 py-1 bg-white text-sm"
                              min={0}
                              max={100}
                            />
                          </label>
                        </div>
                      )}

                      <div className="mt-2 text-xs text-gray-600">
                        Prispevek v proizvodnjo: <b>{(H_PER_DAY * (productionSharePct(e) / 100)).toFixed(2)} h/dan</b>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: vnos imena */}
      {showNameModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg w-[92vw] max-w-md p-4">
            <div className="text-lg font-bold mb-1">Vpis v koledar</div>
            <div className="text-sm text-gray-600 mb-3">Izbranih dni: <b>{selected.size}</b></div>
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium text-gray-700 mb-1">Zaposleni</div>
                <select
                  value={selectedEmployee}
                  onChange={(e) => { setSelectedEmployee(e.target.value); setKolektivni(false); if (nameErr) setNameErr(''); }}
                  className="w-full border rounded px-3 py-2 bg-white"
                >
                  <option value="">(brez izbire)</option>
                  {employees
                    .map(e => String(e?.name || '').trim())
                    .filter(Boolean)
                    .map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                </select>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={selectedKind === 'dopust'}
                    onChange={() => setSelectedKind('dopust')}
                    disabled={!selectedEmployee}
                  />
                  Dopust
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={selectedKind === 'bolniska'}
                    onChange={() => setSelectedKind('bolniska')}
                    disabled={!selectedEmployee}
                  />
                  Bolniška
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={kolektivni}
                  onChange={(e) => { setKolektivni(e.target.checked); if (e.target.checked) setSelectedEmployee(''); if (nameErr) setNameErr(''); }}
                />
                Kolektivni dopust (nihče ne dela)
              </label>
            </div>
            {nameErr && <div className="text-sm text-red-600 mt-2">{nameErr}</div>}
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300"
                onClick={() => { setShowNameModal(false); setSelected(new Set()); }}
              >
                Prekliči
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
                onClick={commitBookingToSelected}
              >
                Potrdi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: geslo */}
      {showPwModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg w-[92vw] max-w-xs p-4">
            <div className="text-lg font-bold mb-2">Dodatno (geslo)</div>
            <input
              ref={pwInputRef}
              value={pw}
              onChange={(e) => { setPw(e.target.value); if (pwErr) setPwErr(''); }}
              className="w-full border rounded px-3 py-2"
              placeholder="Vpiši geslo"
              type="password"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (pw === PASSWORD_DODATNO) {
                    setDodatnoUnlocked(true);
                    try { localStorage.setItem(LS_DODATNO_UNLOCK, '1'); } catch {}
                    try { localStorage.setItem(LS_DODATNO_LEFT_AT, '0'); } catch {}
                    dodatnoLastActivityRef.current = Date.now();
                    dodatnoTouchThrottleRef.current = 0;
                    setShowPwModal(false);
                    setPw('');
                  } else {
                    setPwErr('Napačno geslo.');
                  }
                }
                if (e.key === 'Escape') { setShowPwModal(false); setPw(''); setPwErr(''); }
              }}
            />
            {pwErr && <div className="text-sm text-red-600 mt-2">{pwErr}</div>}
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300"
                onClick={() => { setShowPwModal(false); setPw(''); setPwErr(''); }}
              >
                Prekliči
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => {
                  if (pw === PASSWORD_DODATNO) {
                    setDodatnoUnlocked(true);
                    try { localStorage.setItem(LS_DODATNO_UNLOCK, '1'); } catch {}
                    try { localStorage.setItem(LS_DODATNO_LEFT_AT, '0'); } catch {}
                    dodatnoLastActivityRef.current = Date.now();
                    dodatnoTouchThrottleRef.current = 0;
                    setShowPwModal(false);
                    setPw('');
                    setPwErr('');
                  } else {
                    setPwErr('Napačno geslo.');
                  }
                }}
              >
                Odkleni
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

