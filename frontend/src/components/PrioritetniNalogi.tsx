import React, { useState, useMemo, useEffect, useRef } from 'react';

interface CasSekcije {
  tisk: number;
  uvTisk: number;
  plastifikacija: number;
  uvLak: number;
  izsek: number;
  razrez: number;
  topliTisk: number;
  biganje: number;
  biganjeRocnoZgibanje: number;
  zgibanje: number;
  lepljenje: number;
  lepljenjeBlokov: number;
  vezava: number;
  vrtanjeLuknje: number;
  perforacija: number;
  dodatno: number;
  kooperanti: number;
  skupaj: number;
}

interface PrioritetaNaloga {
  stevilkaNaloga: number;
  predvideniCas: number; // v minutah
  casSekcije: CasSekcije;
  casSekcije1?: CasSekcije; // Pozicija 1 (tisk 1 + dodelava 1), v minutah
  casSekcije2?: CasSekcije; // Pozicija 2 (tisk 2 + dodelava 2), v minutah
  rokIzdelave: string;
  rokIzdelaveUra: string;
  prioriteta: number; // 1-5 (1=najvišja, 5=najnižja)
  status: 'v_delu' | 'zakljucen' | 'dobavljeno';
  podatki: any;
  preostaliCasDoRoka: number; // v minutah
}

interface PrioritetniNalogiProps {
  prioritetniNalogi: PrioritetaNaloga[];
  onIzberi: (nalog: any) => void;
  onClosedTasksChange?: (closedTasks: ClosedTask[]) => void;
  closedTasks?: ClosedTask[];
  scrollToStevilkaNaloga?: { id: number; ts: number } | null;
}

interface ClosedTask {
  stevilkaNaloga: number;
  taskType: string;
  part?: 0 | 1 | 2;
  closedAt?: string; // ISO timestamp (za evidenco dejanskega dela po dnevih)
}

interface Storitev {
  naziv: string;
  skupniCas: number; // v minutah
  nalogi: Array<{
    stevilkaNaloga: number;
    cas: number; // v minutah
    naziv: string;
  }>;
}

const PrioritetniNalogi: React.FC<PrioritetniNalogiProps> = ({ prioritetniNalogi, onIzberi, onClosedTasksChange, closedTasks = [], scrollToStevilkaNaloga }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [originalTasks, setOriginalTasks] = useState<Map<number, any>>(new Map());
  const headerScrollRef = useRef<HTMLDivElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef<null | 'header' | 'body'>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [kolektivniDates, setKolektivniDates] = useState<Set<string>>(() => new Set());
  const holidaysCacheRef = useRef<Map<number, Record<string, string>>>(new Map());
  const LS_BOOKINGS = 'koledarBookings-v1';

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const ymdLocal = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  // Velika noč (Anonymous Gregorian algorithm) – kopija iz Koledar.tsx
  function easterSunday(year: number): Date {
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

  const getHolidayMap = (year: number): Record<string, string> => {
    const cached = holidaysCacheRef.current.get(year);
    if (cached) return cached;
    const m = slovenianHolidays(year);
    holidaysCacheRef.current.set(year, m);
    return m;
  };

  const isWorkday = (d: Date): boolean => {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) return false; // vikend
    const key = ymdLocal(d);
    const holidays = getHolidayMap(d.getFullYear());
    if (holidays[key]) return false; // praznik
    if (kolektivniDates.has(key)) return false; // kolektivni dopust
    return true;
  };

  const loadKolektivniFromLocalStorage = () => {
    try {
      const raw = localStorage.getItem(LS_BOOKINGS);
      if (!raw) return new Set<string>();
      const obj = JSON.parse(raw);
      const out = new Set<string>();
      if (obj && typeof obj === 'object') {
        for (const k of Object.keys(obj)) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
          const v = (obj as any)[k];
          if (v && typeof v === 'object' && (v as any).kolektivni) out.add(k);
        }
      }
      return out;
    } catch {
      return new Set<string>();
    }
  };

  // Sync kolektivnih dni (Koledar shranjuje v localStorage + App dispatcha 'koledar-updated')
  useEffect(() => {
    const apply = () => setKolektivniDates(loadKolektivniFromLocalStorage());
    apply();
    const onKoledarUpdated = () => apply();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_BOOKINGS) apply();
    };
    window.addEventListener('koledar-updated', onKoledarUpdated as any);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('koledar-updated', onKoledarUpdated as any);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  
  // Funkcija za preverjanje, ali je delovni dan (upošteva vikende + slovenske praznike + kolektivne dneve)
  const jeDelovniDan = (datum: Date): boolean => {
    return isWorkday(datum);
  };
  
  const formatirajCas = (minute: number): string => {
    const ure = Math.floor(minute / 60);
    const min = Math.round(minute % 60);
    if (ure > 0) {
      return `${ure}h ${min}min`;
    }
    return `${min}min`;
  };

  const normalizirajUro = (ura: any): string => {
    const s = String(ura || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return '';
    const hh = String(Math.min(23, Math.max(0, parseInt(m[1], 10)))).padStart(2, '0');
    const mm = String(Math.min(59, Math.max(0, parseInt(m[2], 10)))).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const clampUraNaDelavnik = (hh: number, mm: number): string => {
    // Delavnik: 07:00–15:00
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return '';
    if (hh < 7) return '07:00';
    if (hh > 15) return '15:00';
    if (hh === 15 && mm > 0) return '15:00';
    const HH = String(hh).padStart(2, '0');
    const MM = String(mm).padStart(2, '0');
    return `${HH}:${MM}`;
  };

  const extractUraFromDateTime = (v: any): string => {
    const s = String(v || '').trim();
    if (!s) return '';
    // Če je rok shranjen kot "samo datum" (YYYY-MM-DD), nima ure -> naj se uporabi privzeto 15:00 (rešimo z '' in fallback spodaj)
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';

    // Najprej poskusi robustno: parse v Date in vzemi lokalno uro (reši tudi zamik -1h pri ISO z "Z")
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const hh = d.getHours(); // lokalni čas
      const mm = d.getMinutes();
      // Če je ura 00:00 in v inputu sploh ni eksplicitne ure, tretiraj kot manjkajočo uro.
      const hasExplicitTime = /T\d{1,2}:\d{2}/.test(s) || /\b\d{1,2}:\d{2}\b/.test(s);
      if (!hasExplicitTime) return '';
      // Če je eksplicitno 00:00, to je izven delavnika; clamp bo to popravil.
      return clampUraNaDelavnik(hh, mm);
    }

    // Fallback: regex (če Date parse ne deluje)
    const mIso = s.match(/T(\d{1,2}):(\d{2})/);
    if (mIso) return clampUraNaDelavnik(parseInt(mIso[1], 10), parseInt(mIso[2], 10));
    const mSpace = s.match(/\b(\d{1,2}):(\d{2})\b/);
    if (mSpace) return clampUraNaDelavnik(parseInt(mSpace[1], 10), parseInt(mSpace[2], 10));
    return '';
  };

  // Ura roka: če ni nastavljena, izračun "Do roka" privzeto uporablja 15:00
  const pridobiRokUro = (nalog: PrioritetaNaloga): string => {
    const fromTopRaw = normalizirajUro((nalog as any).rokIzdelaveUra);
    const fromPodatkiRaw = normalizirajUro((nalog as any).podatki?.rokIzdelaveUra ?? (nalog as any).podatki?.RokIzdelaveUra);
    const fromTop = fromTopRaw ? clampUraNaDelavnik(parseInt(fromTopRaw.slice(0, 2), 10), parseInt(fromTopRaw.slice(3, 5), 10)) : '';
    const fromPodatki = fromPodatkiRaw ? clampUraNaDelavnik(parseInt(fromPodatkiRaw.slice(0, 2), 10), parseInt(fromPodatkiRaw.slice(3, 5), 10)) : '';
    // Če ura ni posebej shranjena (stari nalogi), privzeto 15:00 (konec delavnika)
    return fromTop || fromPodatki || '15:00';
  };

  // Funkcija za izračun delovnih ur med dvema datumoma
  const izracunajDelovneUre = (zacetek: Date, konec: Date): number => {
    let delovneUre = 0;
    let trenutniDan = new Date(zacetek);
    const nextWorkdayAt7 = (from: Date): Date => {
      const d = new Date(from);
      d.setDate(d.getDate() + 1);
      d.setHours(7, 0, 0, 0);
      while (!isWorkday(d)) {
        d.setDate(d.getDate() + 1);
        d.setHours(7, 0, 0, 0);
      }
      return d;
    };
    const ensureWorkdayAtOrAfter = (from: Date): Date => {
      const d = new Date(from);
      while (!isWorkday(d)) {
        d.setDate(d.getDate() + 1);
        d.setHours(7, 0, 0, 0);
      }
      return d;
    };
    
    // Če je trenutni čas po 15:00, začni z naslednjim delovnim dnem ob 7:00
    if (zacetek.getHours() >= 15) {
      trenutniDan = nextWorkdayAt7(zacetek);
    }
    // Če je trenutni čas pred 7:00, začni ob 7:00 istega dne
    else if (zacetek.getHours() < 7) {
      trenutniDan = new Date(zacetek);
      trenutniDan.setHours(7, 0, 0, 0);
    }
    // Če je trenutni čas med 7:00 in 15:00, uporabi trenutni čas
    else {
      trenutniDan = new Date(zacetek);
    }
    
    // Če je konec pred začetkom, vrni 0
    if (konec <= trenutniDan) {
      return 0;
    }
    
    // Če začnemo na ne-delovni dan, preskoči na naslednji delovni dan ob 7:00
    trenutniDan = ensureWorkdayAtOrAfter(trenutniDan);

    // Če sta začetek in konec isti dan
    if (trenutniDan.getDate() === konec.getDate() && 
        trenutniDan.getMonth() === konec.getMonth() && 
        trenutniDan.getFullYear() === konec.getFullYear()) {
      if (!isWorkday(trenutniDan)) return 0;
      const zacetekUra = Math.max(7, trenutniDan.getHours() + trenutniDan.getMinutes() / 60);
      const konecUra = Math.min(15, konec.getHours() + konec.getMinutes() / 60);
      return Math.max(0, konecUra - zacetekUra);
    }
    
    // Izračunaj čas za prvi dan (trenutni dan)
    if (isWorkday(trenutniDan)) { // Delovni dan
      const zacetekUra = Math.max(7, trenutniDan.getHours() + trenutniDan.getMinutes() / 60);
      delovneUre += Math.max(0, 15 - zacetekUra);
    }
    
    // Poišči naslednji dan
    let naslednjiDan = new Date(trenutniDan);
    naslednjiDan.setDate(naslednjiDan.getDate() + 1);
    naslednjiDan.setHours(7, 0, 0, 0);
    
    // Izračunaj čas za vmesne dneve (polni delovni dnevi)
    // Preveri vse dneve med naslednjim dnem in dnem roka (vključno)
    while (naslednjiDan < konec) {
      // Če je to dan roka, izračunaj delni čas
      if (naslednjiDan.getDate() === konec.getDate() && 
          naslednjiDan.getMonth() === konec.getMonth() && 
          naslednjiDan.getFullYear() === konec.getFullYear()) {
        if (isWorkday(naslednjiDan)) { // Delovni dan
          const konecUra = Math.min(15, konec.getHours() + konec.getMinutes() / 60);
          delovneUre += Math.max(0, konecUra - 7);
        }
        break;
      }
      
      // Če ni dan roka, dodaj polni delovni dan
      if (isWorkday(naslednjiDan)) { // Delovni dan
        delovneUre += 8; // 8 delovnih ur na dan
      }
      
      naslednjiDan.setDate(naslednjiDan.getDate() + 1);
    }
    
    return delovneUre;
  };

  // Funkcija za izračun časa do roka z upoštevanjem delovnih ur
  const izracunajCasDoRoka = (nalog: PrioritetaNaloga): number => {
    if (!nalog.rokIzdelave) return 0;
    
    const datumRoka = new Date(nalog.rokIzdelave);
    let konecRoka = new Date(datumRoka);
    
    // Nastavi konec roka z uro
    const uraStr = pridobiRokUro(nalog);
    const [ure, minute] = uraStr.split(':').map(Number);
    konecRoka.setHours(ure, minute, 0, 0);
    
    // Določi začetek dela - uporabi trenutni čas
    let zacetekDela = new Date(currentTime);
    
    // Če je trenutni čas po 15:00, začni z naslednjim delovnim dnem ob 7:00
    if (currentTime.getHours() >= 15) {
      zacetekDela = new Date(currentTime);
      zacetekDela.setDate(zacetekDela.getDate() + 1);
      // Poišči naslednji delovni dan
      while (!isWorkday(zacetekDela)) {
        zacetekDela.setDate(zacetekDela.getDate() + 1);
      }
      zacetekDela.setHours(7, 0, 0, 0);
    } else if (!isWorkday(currentTime)) {
      // Če ni delovni dan, se rok začne naslednji delovni dan ob 7:00
      zacetekDela = new Date(currentTime);
      zacetekDela.setDate(zacetekDela.getDate() + 1);
      while (!isWorkday(zacetekDela)) {
        zacetekDela.setDate(zacetekDela.getDate() + 1);
      }
      zacetekDela.setHours(7, 0, 0, 0);
    } else {
      // Če je delovni dan pred 15:00, se rok začne ob trenutnem času
      zacetekDela = new Date(currentTime);
    }
    
    // Izračun delovnih ur do roka
    const delovneUreDoRoka = izracunajDelovneUre(zacetekDela, konecRoka);
    return Math.round(delovneUreDoRoka * 60); // pretvori v minute
  };

  const formatirajCasDoRoka = (preostaliCas: number): string => {
    if (preostaliCas < 0) {
      const prekoraceneUre = Math.abs(Math.floor(preostaliCas / 60));
      const prekoraceneMinute = Math.abs(preostaliCas % 60);
      return `Prekoračen za ${prekoraceneUre}h ${prekoraceneMinute}min`;
    } else {
      const ure = Math.floor(preostaliCas / 60);
      const minute = preostaliCas % 60;
      return `${ure}h ${minute}min`;
    }
  };

  // Timer za dinamično posodabljanje časa
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Posodobi vsako minuto

    return () => clearInterval(timer);
  }, []);

  // "Lociraj" nalog: po preklopu zavihka se samodejno scrollaj do izbranega naloga.
  useEffect(() => {
    const id = Number(scrollToStevilkaNaloga?.id || 0);
    if (!id) return;
    setFlashId(id);
    const t = window.setTimeout(() => setFlashId(null), 1600);
    window.setTimeout(() => {
      const el = document.getElementById(`prioritetni-nalog-${id}`);
      if (el) {
        try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
      }
    }, 50);
    return () => window.clearTimeout(t);
  }, [scrollToStevilkaNaloga?.id, scrollToStevilkaNaloga?.ts]);



  // Shrani originalne naloge ob prvem naloženju
  useEffect(() => {
    if (prioritetniNalogi.length > 0 && originalTasks.size === 0) {
      const originalMap = new Map();
      prioritetniNalogi.forEach(nalog => {
        originalMap.set(nalog.stevilkaNaloga, { ...nalog });
      });
      setOriginalTasks(originalMap);
    }
  }, [prioritetniNalogi, originalTasks.size]);

  // Funkcija za zapiranje dodelave
  const handleCloseTask = (stevilkaNaloga: number, taskType: string, part: 1 | 2) => {
    console.log('Zapiranje dodelave:', stevilkaNaloga, taskType);
    if (onClosedTasksChange) {
      // prepreči duplikate
      if (closedTasks.some(t => t.stevilkaNaloga === stevilkaNaloga && t.taskType === taskType && t.part === part)) return;
      onClosedTasksChange([...closedTasks, { stevilkaNaloga, taskType, part, closedAt: new Date().toISOString() }]);
    }
    // Sync na backend (SSE broadcast) – da se zapiranje pokaže na vseh računalnikih
    try {
      fetch('/api/closed-tasks/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nalog: stevilkaNaloga, step: taskType, part }),
      }).catch(() => {});
    } catch {}
  };

  // Funkcija za ponastavitev naloga (ločeno po poziciji)
  const handleResetNalog = (stevilkaNaloga: number, part: 1 | 2) => {
    console.log('Ponastavitev naloga:', stevilkaNaloga);
    if (onClosedTasksChange) {
      onClosedTasksChange(closedTasks.filter(task => task.stevilkaNaloga !== stevilkaNaloga || task.part !== part));
    }
    // Sync reset na backend (SSE broadcast)
    try {
      fetch('/api/closed-tasks/reset-part', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nalog: stevilkaNaloga, part }),
      }).catch(() => {});
    } catch {}
  };

  // Funkcija za preverjanje ali je dodelava zaprta
  const isTaskClosed = (stevilkaNaloga: number, taskType: string, part: 1 | 2): boolean => {
    return closedTasks.some(task => task.stevilkaNaloga === stevilkaNaloga && task.taskType === taskType && task.part === part);
  };

  // Funkcija za izračun skupnega časa brez zaprtih dodelav (skupaj čez pozicijo 1+2)
  const izracunajSkupniCasBrezZaprtih = (nalog: PrioritetaNaloga): number => {
    let skupniCas = 0;
    const cas1 = nalog.casSekcije1 || nalog.casSekcije;
    const cas2 = nalog.casSekcije2 || ({} as any);
    const hasP1 = !!(nalog.podatki?.tisk?.tisk1?.predmet);
    const hasP2 = !!(nalog.podatki?.tisk?.tisk2?.predmet);
    
    const addPart = (part: 1 | 2, cas: CasSekcije, enabled: boolean) => {
      if (!enabled) return;
      if (!isTaskClosed(nalog.stevilkaNaloga, 'Tisk', part) && cas.tisk > 0) skupniCas += cas.tisk;
      if (!isTaskClosed(nalog.stevilkaNaloga, 'UV Tisk', part) && cas.uvTisk > 0) skupniCas += cas.uvTisk;
      if (!isTaskClosed(nalog.stevilkaNaloga, 'Plastifikacija', part) && cas.plastifikacija > 0) skupniCas += cas.plastifikacija;
      if (!isTaskClosed(nalog.stevilkaNaloga, 'UV Lak', part) && cas.uvLak > 0) skupniCas += cas.uvLak;
      if (!isTaskClosed(nalog.stevilkaNaloga, 'Izsek/Zasek', part) && cas.izsek > 0) skupniCas += cas.izsek;
      if (!isTaskClosed(nalog.stevilkaNaloga, 'Razrez', part) && cas.razrez > 0) skupniCas += cas.razrez;
      if (!isTaskClosed(nalog.stevilkaNaloga, 'Topli tisk', part) && cas.topliTisk > 0) skupniCas += cas.topliTisk;
      if (!isTaskClosed(nalog.stevilkaNaloga, 'Biganje', part) && cas.biganje > 0) skupniCas += cas.biganje;
      if (!isTaskClosed(nalog.stevilkaNaloga, 'Biganje + ročno zgibanje', part) && cas.biganjeRocnoZgibanje > 0) skupniCas += cas.biganjeRocnoZgibanje;
      if (!isTaskClosed(nalog.stevilkaNaloga, 'Zgibanje', part) && cas.zgibanje > 0) skupniCas += cas.zgibanje;
      if (!isTaskClosed(nalog.stevilkaNaloga, 'Lepljenje', part) && cas.lepljenje > 0) skupniCas += cas.lepljenje;
      if (!isTaskClosed(nalog.stevilkaNaloga, 'Lepljenje blokov', part) && cas.lepljenjeBlokov > 0) skupniCas += cas.lepljenjeBlokov;
      if (!isTaskClosed(nalog.stevilkaNaloga, 'Vezava', part) && cas.vezava > 0) skupniCas += cas.vezava;
      if (!isTaskClosed(nalog.stevilkaNaloga, 'Vrtanje luknje', part) && cas.vrtanjeLuknje > 0) skupniCas += cas.vrtanjeLuknje;
      if (!isTaskClosed(nalog.stevilkaNaloga, 'Perforacija', part) && cas.perforacija > 0) skupniCas += cas.perforacija;
      if (!isTaskClosed(nalog.stevilkaNaloga, 'Dodatno', part) && (cas.dodatno || 0) > 0) skupniCas += (cas.dodatno || 0);
      if (!isTaskClosed(nalog.stevilkaNaloga, 'Kooperanti', part) && cas.kooperanti > 0) skupniCas += cas.kooperanti;
    };
    addPart(1, cas1, hasP1);
    addPart(2, cas2, hasP2);
    
    return skupniCas;
  };

  // Funkcija za izračun prioritete z upoštevanjem zaprtih dodelav
  const izracunajPrioriteto = (nalog: PrioritetaNaloga): number => {
    // Če ni določenega datuma ali ure, je prioriteta nizka (5)
    if (!nalog.rokIzdelave) return 5;
    
    const skupniCas = izracunajSkupniCasBrezZaprtih(nalog);
    const casDoRoka = izracunajCasDoRoka(nalog);
    const razlikaCas = casDoRoka - skupniCas;
    
    if (razlikaCas < 0) return 1; // prekoračen rok
    if (razlikaCas <= 120) return 2; // rok izdelave med 0-2 h (120 min)
    if (razlikaCas <= 300) return 3; // rok izdelave med 2-5 h (300 min)
    if (razlikaCas <= 960) return 4; // rok izdelave med 5-16 h (960 min)
    return 5; // rok izdelave več od 16 h
  };

  // Izračun obremenitve storitev
  const obremenitevStoritev = useMemo((): Storitev[] => {
    const storitve: { [key: string]: Storitev } = {};

    const addStoritev = (naziv: string, nalog: PrioritetaNaloga, cas: number) => {
      if (cas <= 0) return;
      if (!storitve[naziv]) storitve[naziv] = { naziv, skupniCas: 0, nalogi: [] };
      storitve[naziv].skupniCas += cas;
      const existing = storitve[naziv].nalogi.find(n => n.stevilkaNaloga === nalog.stevilkaNaloga);
      if (existing) {
        existing.cas += cas;
      } else {
        storitve[naziv].nalogi.push({
          stevilkaNaloga: nalog.stevilkaNaloga,
          cas,
          naziv: nalog.podatki?.naziv || `Nalog ${nalog.stevilkaNaloga}`
        });
      }
    };

    const sections = [
      { naziv: 'Tisk', taskType: 'Tisk', key: 'tisk' },
      { naziv: 'UV Tisk', taskType: 'UV Tisk', key: 'uvTisk' },
      { naziv: 'Plastifikacija', taskType: 'Plastifikacija', key: 'plastifikacija' },
      { naziv: 'UV Lak', taskType: 'UV Lak', key: 'uvLak' },
      { naziv: 'Izsek/Zasek', taskType: 'Izsek/Zasek', key: 'izsek' },
      { naziv: 'Razrez', taskType: 'Razrez', key: 'razrez' },
      { naziv: 'Topli tisk', taskType: 'Topli tisk', key: 'topliTisk' },
      { naziv: 'Biganje', taskType: 'Biganje', key: 'biganje' },
      { naziv: 'Biganje + ročno zgibanje', taskType: 'Biganje + ročno zgibanje', key: 'biganjeRocnoZgibanje' },
      { naziv: 'Zgibanje', taskType: 'Zgibanje', key: 'zgibanje' },
      { naziv: 'Lepljenje', taskType: 'Lepljenje', key: 'lepljenje' },
      { naziv: 'Lepljenje blokov', taskType: 'Lepljenje blokov', key: 'lepljenjeBlokov' },
      { naziv: 'Vezava', taskType: 'Vezava', key: 'vezava' },
      { naziv: 'Vrtanje luknje', taskType: 'Vrtanje luknje', key: 'vrtanjeLuknje' },
      { naziv: 'Perforacija', taskType: 'Perforacija', key: 'perforacija' },
      { naziv: 'Dodatno', taskType: 'Dodatno', key: 'dodatno' },
      { naziv: 'Kooperanti', taskType: 'Kooperanti', key: 'kooperanti' },
    ] as const;

    const addPart = (nalog: PrioritetaNaloga, cas: CasSekcije, part: 1 | 2, enabled: boolean) => {
      if (!enabled || !cas) return;
      for (const s of sections) {
        const v = Number((cas as any)[s.key] || 0);
        if (v > 0 && !isTaskClosed(nalog.stevilkaNaloga, s.taskType, part)) {
          addStoritev(s.naziv, nalog, v);
        }
      }
    };

    prioritetniNalogi.forEach(nalog => {
      const cas1 = nalog.casSekcije1 || nalog.casSekcije;
      const cas2 = nalog.casSekcije2 || ({} as any);
      const hasP1 = !!(nalog.podatki?.tisk?.tisk1?.predmet);
      const hasP2 = !!(nalog.podatki?.tisk?.tisk2?.predmet);
      addPart(nalog, cas1, 1, hasP1);
      addPart(nalog, cas2, 2, hasP2);
    });

    return Object.values(storitve).sort((a, b) => b.skupniCas - a.skupniCas);
  }, [prioritetniNalogi, closedTasks]);

  // Mapiranje naših nazivov na točna imena API-ja Cenikov (DELOVNI_NALOG_INTEGRACIJA.md)
  const NAZIV_TO_CENIKI_KEY: Record<string, string> = {
    'Tisk': 'Tisk',
    'Plastifikacija': 'plastifikacija',
    'UV Lak': 'UV lak',
    'Topli tisk': 'Topli tisk',
    'UV Tisk': 'UV tisk',
    'Perforacija': 'Perforacija',
    'Izsek/Zasek': 'Izsek/zasek',
    'Razrez': 'Razrez',
    'Lepljenje': 'Lepljenje',
    'Lepljenje blokov': 'Lepljenje blokov',
    'Biganje + ročno zgibanje': 'Biganje + ročno zgibanje',
    'Biganje': 'Biganje',
    'Zgibanje': 'Zgibanje',
    'Vrtanje luknje': 'Vrtanje luknje',
    'Vezava': 'Vezava',
    'Dodatno': 'Dodatno',
  };

  // Objekt casi za Cenike (vrednosti v urah). Kooperanti ni v seznamu API-ja.
  const casiZaCenike = useMemo((): Record<string, number> => {
    const casi: Record<string, number> = {};
    const API_KEYS = ['Tisk', 'plastifikacija', 'UV lak', 'Topli tisk', 'UV tisk', 'Perforacija', 'Izsek/zasek', 'Razrez', 'Lepljenje', 'Lepljenje blokov', 'Biganje + ročno zgibanje', 'Biganje', 'Zgibanje', 'Vrtanje luknje', 'Vezava', 'Dodatno'];
    API_KEYS.forEach(k => { casi[k] = 0; });
    obremenitevStoritev.forEach(st => {
      const apiKey = NAZIV_TO_CENIKI_KEY[st.naziv];
      if (apiKey && casi[apiKey] !== undefined) {
        casi[apiKey] += st.skupniCas / 60; // minute -> ure
      }
    });
    return casi;
  }, [obremenitevStoritev]);

  // Periodični izvoz časov v Cenike (vsakih 15 s + ob spremembi z debounce)
  const casiZaCenikeRef = useRef<Record<string, number>>({});
  const lastExportRef = useRef<number>(0);
  useEffect(() => {
    const INTERVAL_MS = 15000; // 15 sekund
    const MIN_INTERVAL_MS = 5000;  // najmanj 5 s med pošiljanjem
    const exportNow = () => {
      const now = Date.now();
      if (now - lastExportRef.current < MIN_INTERVAL_MS) return;
      lastExportRef.current = now;
      const casi = casiZaCenike;
      // Pošlji samo če je vsebina drugačna
      const str = JSON.stringify(casi);
      if (str === JSON.stringify(casiZaCenikeRef.current)) return;
      casiZaCenikeRef.current = casi;
      fetch('/api/dodelave-times/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ casi }),
      }).catch(() => {}); // tiho napako ignoriramo
    };
    exportNow(); // takoj ob spremembi
    const t = setInterval(exportNow, INTERVAL_MS);
    return () => clearInterval(t);
  }, [casiZaCenike]);

  const formatirajDatum = (datum: string): string => {
    if (!datum) return '';
    const date = new Date(datum);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  };

  const getPrioritetaBarva = (prioriteta: number): string => {
    switch (prioriteta) {
      case 1: return 'bg-purple-800 text-white'; // Najvišja prioriteta - temno vijolična
      case 2: return 'bg-red-600 text-white'; // Visoka prioriteta - temno rdeča
      case 3: return 'bg-orange-400 text-white'; // Srednja prioriteta - oranžna
      case 4: return 'bg-yellow-400 text-black'; // Nizka prioriteta - rumena
      case 5: return 'bg-green-400 text-white'; // Najnižja prioriteta - zelena
      default: return 'bg-gray-400 text-white'; // Ni prioritete
    }
  };

  const getPrioritetaText = (prioriteta: number): string => {
    switch (prioriteta) {
      case 1: return 'KRITIČNO';
      case 2: return 'URGENTNO';
      case 3: return 'POMEMBNO';
      case 4: return 'OBIČAJNO';
      case 5: return 'NIZKA';
      default: return 'N/A';
    }
  };

  // Funkcija za preverjanje, ali je mogoče izračunati vsaj 1 časovno komponento
  const lahkoIzracunamoCas = (nalog: PrioritetaNaloga): boolean => {
    const casSekcije = nalog.casSekcije;
    return casSekcije.tisk > 0 || casSekcije.uvTisk > 0 || casSekcije.plastifikacija > 0 || 
           casSekcije.uvLak > 0 || casSekcije.izsek > 0 || casSekcije.razrez > 0 || casSekcije.topliTisk > 0 || 
           casSekcije.biganje > 0 || casSekcije.biganjeRocnoZgibanje > 0 || casSekcije.zgibanje > 0 || 
           casSekcije.lepljenje > 0 || casSekcije.lepljenjeBlokov > 0 || casSekcije.vezava > 0 || 
           casSekcije.vrtanjeLuknje > 0 || casSekcije.perforacija > 0 || casSekcije.kooperanti > 0;
  };

  // Filtriraj naloge glede na prioriteto in leto
  const filtriraniNalogi = useMemo(() => {
    let filtrirani = prioritetniNalogi;
    
    // Filter: prikaži le naloge, katerim je možno izračunati vsaj 1 časovno komponento
    filtrirani = filtrirani.filter(lahkoIzracunamoCas);
    
    // Razvrsti po prioriteti in roku izdelave
    filtrirani.sort((a, b) => {
      // Najprej po prioriteti (1 je najvišja) - uporabi dinamično izračunano prioriteto
      const prioritetaA = izracunajPrioriteto(a);
      const prioritetaB = izracunajPrioriteto(b);
      if (prioritetaA !== prioritetaB) {
        return prioritetaA - prioritetaB;
      }
      // Če je prioriteta enaka, po datumu roka
      if (a.rokIzdelave && b.rokIzdelave) {
        return new Date(a.rokIzdelave).getTime() - new Date(b.rokIzdelave).getTime();
      }
      // Če ni roka, po številki naloga
      return a.stevilkaNaloga - b.stevilkaNaloga;
    });
    
    return filtrirani;
  }, [prioritetniNalogi, closedTasks, currentTime]);

  // Funkcija za pridobitev barve dodelave
  const getDodelavaBarva = (dodelava: string): string => {
    switch (dodelava) {
      // Opomba: barve morajo biti unikatne in enake tudi v "Obremenitev strojev"
      case 'Tisk': return 'bg-blue-100 text-blue-900';
      case 'Plastifikacija': return 'bg-emerald-100 text-emerald-900';
      case 'UV Lak': return 'bg-yellow-100 text-yellow-900';
      case 'Topli tisk': return 'bg-orange-100 text-orange-900';
      case 'UV Tisk': return 'bg-violet-100 text-violet-900';
      case 'Perforacija': return 'bg-lime-100 text-lime-900';
      case 'Izsek/Zasek': return 'bg-red-100 text-red-900';
      case 'Razrez': return 'bg-indigo-100 text-indigo-900';
      case 'Lepljenje': return 'bg-teal-100 text-teal-900';
      case 'Lepljenje blokov': return 'bg-cyan-100 text-cyan-900';
      case 'Biganje + ročno zgibanje': return 'bg-pink-100 text-pink-900';
      case 'Biganje': return 'bg-fuchsia-100 text-fuchsia-900';
      case 'Zgibanje': return 'bg-rose-100 text-rose-900';
      case 'Vezava': return 'bg-sky-100 text-sky-900';
      case 'Vrtanje luknje': return 'bg-slate-100 text-slate-900';
      case 'Dodatno': return 'bg-neutral-100 text-neutral-900';
      case 'Kooperanti': return 'bg-amber-100 text-amber-900';
      default: return 'bg-gray-100 text-gray-900';
    }
  };

  // 1. vrstica (podatki): vrni prejšnjo postavitev (boljša), samo z dodatnim stolpcem "Čas izdelave"
  const topGridCols =
    'inline-grid grid-cols-[72px_130px_minmax(0,320px)_minmax(0,260px)_minmax(0,260px)_200px_110px_150px_120px_110px_80px] gap-x-3';

  const dodelaveVrstniRed = [
    { label: 'Tisk', taskType: 'Tisk' as const, getCas: (c: CasSekcije) => c.tisk },
    { label: 'Plastifikacija', taskType: 'Plastifikacija' as const, getCas: (c: CasSekcije) => c.plastifikacija },
    { label: 'UV lak', taskType: 'UV Lak' as const, getCas: (c: CasSekcije) => c.uvLak },
    { label: 'Topli tisk', taskType: 'Topli tisk' as const, getCas: (c: CasSekcije) => c.topliTisk },
    { label: 'UV tisk', taskType: 'UV Tisk' as const, getCas: (c: CasSekcije) => c.uvTisk },
    { label: 'Perforacija', taskType: 'Perforacija' as const, getCas: (c: CasSekcije) => c.perforacija },
    { label: 'Izsek/zasek', taskType: 'Izsek/Zasek' as const, getCas: (c: CasSekcije) => c.izsek },
    { label: 'Razrez', taskType: 'Razrez' as const, getCas: (c: CasSekcije) => c.razrez },
    { label: 'Lepljenje', taskType: 'Lepljenje' as const, getCas: (c: CasSekcije) => c.lepljenje },
    { label: 'Lepljenje blokov', taskType: 'Lepljenje blokov' as const, getCas: (c: CasSekcije) => c.lepljenjeBlokov },
    { label: 'Biganje + ročno zgibanje', taskType: 'Biganje + ročno zgibanje' as const, getCas: (c: CasSekcije) => c.biganjeRocnoZgibanje },
    { label: 'Biganje', taskType: 'Biganje' as const, getCas: (c: CasSekcije) => c.biganje },
    { label: 'Zgibanje', taskType: 'Zgibanje' as const, getCas: (c: CasSekcije) => c.zgibanje },
    { label: 'Vrtanje luknje', taskType: 'Vrtanje luknje' as const, getCas: (c: CasSekcije) => c.vrtanjeLuknje },
    { label: 'Vezava', taskType: 'Vezava' as const, getCas: (c: CasSekcije) => c.vezava },
    { label: 'Dodatno', taskType: 'Dodatno' as const, getCas: (c: CasSekcije) => c.dodatno || 0 }
  ];

  return (
    <div className="w-full bg-white">
        {filtriraniNalogi.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="text-4xl mb-4">📋</div>
            <p className="text-lg font-medium">Ni aktivnih nalogov</p>
            <p className="text-sm">Vsi nalogi so zaključeni ali dobavljeni</p>
          </div>
        ) : (
          <div className="p-4">
            {/* Sticky: legenda + glave (lepljeno na vrh znotraj overflow-y kontejnerja v App.tsx) */}
            <div className="sticky top-0 z-50 bg-white">
              <div className="bg-gray-100 border border-gray-200 p-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">Prioritetni Nalogi</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Seznam aktivnih nalogov razvrščenih po prioriteti in roku izdelave
                  </p>
                  <div className="mt-3 flex gap-2 text-xs flex-wrap">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-purple-800"></div>
                      <span>Kritično (prekoračen)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-red-600"></div>
                      <span>Urgentno (0-2h)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-orange-400"></div>
                      <span>Pomembno (2-5h)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                      <span>Običajno (5-16h)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-green-400"></div>
                      <span>Nizka ({'>16h'})</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Header (horizontal scroll), scrollLeft se sinhronizira z body */}
              <div
                ref={headerScrollRef}
                onScroll={() => {
                  if (syncingScrollRef.current === 'body') return;
                  syncingScrollRef.current = 'header';
                  const a = headerScrollRef.current;
                  const b = bodyScrollRef.current;
                  if (a && b) b.scrollLeft = a.scrollLeft;
                  requestAnimationFrame(() => { syncingScrollRef.current = null; });
                }}
                style={{ overflowX: 'auto', overflowY: 'visible' as any }}
              >
                <div className="min-w-[1600px] w-full">
                  {/* Glavna glava (1. vrstica) */}
                  <div className="bg-gray-100 border border-gray-200 px-2 py-2 shadow-sm">
                    <div className={`${topGridCols} items-center text-sm font-semibold`}>
                      <span>Št.</span>
                      <span>Prioriteta</span>
                      <span className="min-w-0">Stranka</span>
                      <span className="min-w-0">Predmet 1</span>
                      <span className="min-w-0">Predmet 2</span>
                      <span>Rok izdelave</span>
                      <span>Predviden čas izdelave</span>
                      <span>Do roka</span>
                      <span>Preostali čas izdelave</span>
                      <span className="text-center">Razveljavi</span>
                      <span className="text-center">Odpri</span>
                    </div>
                  </div>

                  {/* Glava dodelav (2. vrstica) */}
                  <div
                    className="grid gap-1 text-[10px] font-semibold text-gray-600 bg-gray-50 border-x border-b border-gray-200 px-2 py-1 shadow-sm"
                    style={{ gridTemplateColumns: `repeat(${dodelaveVrstniRed.length}, minmax(0, 1fr))` }}
                  >
                    {dodelaveVrstniRed.map((d) => (
                      <div key={d.taskType} className="truncate" title={d.label}>
                        {d.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Body (horizontal scroll) */}
            <div
              ref={bodyScrollRef}
              onScroll={() => {
                if (syncingScrollRef.current === 'header') return;
                syncingScrollRef.current = 'body';
                const a = bodyScrollRef.current;
                const b = headerScrollRef.current;
                if (a && b) b.scrollLeft = a.scrollLeft;
                requestAnimationFrame(() => { syncingScrollRef.current = null; });
              }}
              style={{ overflowX: 'auto', overflowY: 'visible' as any }}
            >
              <div className="min-w-[1600px] w-full">
                <div className="border-x border-b border-gray-200">
                  {filtriraniNalogi.map((nalog, idx) => {
                    const prioriteta = izracunajPrioriteto(nalog);
                    const kupec = nalog.podatki?.kupec?.Naziv || 'Ni podatkov o kupcu';
                    const predmet1 = nalog.podatki?.tisk?.tisk1?.predmet || '';
                    const predmet2 = nalog.podatki?.tisk?.tisk2?.predmet || '';
                    const casIzdelaveMin = Number.isFinite((nalog as any).predvideniCas)
                      ? Number((nalog as any).predvideniCas)
                      : Number((nalog as any).casSekcije?.skupaj || 0);
                    const doRoka = izracunajCasDoRoka(nalog);
                    const skupaj = izracunajSkupniCasBrezZaprtih(nalog);
                    const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                    const hasAnyClosedP1 = closedTasks.some(t => t.stevilkaNaloga === nalog.stevilkaNaloga && t.part === 1);
                    const hasAnyClosedP2 = closedTasks.some(t => t.stevilkaNaloga === nalog.stevilkaNaloga && t.part === 2);
                    const cas1 = nalog.casSekcije1 || nalog.casSekcije;
                    const cas2 = nalog.casSekcije2 || ({
                      tisk: 0, uvTisk: 0, plastifikacija: 0, uvLak: 0, izsek: 0, razrez: 0, topliTisk: 0,
                      biganje: 0, biganjeRocnoZgibanje: 0, zgibanje: 0, lepljenje: 0, lepljenjeBlokov: 0,
                      vezava: 0, vrtanjeLuknje: 0, perforacija: 0, dodatno: 0, kooperanti: 0, skupaj: 0
                    } as any);
                    const rokUra = pridobiRokUro(nalog);
                    const rokPrikaz = `${formatirajDatum(nalog.rokIzdelave)}${rokUra ? ` ${rokUra}` : ''}`;

                    const isFlash = flashId === nalog.stevilkaNaloga;
                    return (
                      <div
                        key={nalog.stevilkaNaloga}
                        id={`prioritetni-nalog-${nalog.stevilkaNaloga}`}
                        className={`${rowBg} border-t border-gray-200 ${isFlash ? 'ring-2 ring-inset ring-blue-500' : ''}`}
                      >
                        {/* Meta vrstica (prikaži samo 1x na nalog) */}
                        <div className="px-2 pt-2 pb-2">
                          <div className={`${topGridCols} items-center text-sm md:text-base`}>
                            <span className="font-extrabold text-blue-700">#{nalog.stevilkaNaloga}</span>
                            <span>
                              <span className={`inline-flex px-3 py-1 rounded-full text-xs md:text-sm font-extrabold ${getPrioritetaBarva(prioriteta)}`}>
                                {getPrioritetaText(prioriteta)}
                              </span>
                            </span>
                            <span className="min-w-0 truncate text-gray-900 font-semibold" title={kupec}>{kupec}</span>
                            <span className="min-w-0 truncate text-gray-800" title={predmet1}>{predmet1}</span>
                            <span className="min-w-0 truncate text-gray-800" title={predmet2}>{predmet2}</span>
                            <span className="text-gray-800">{rokPrikaz}</span>
                            <span className="text-gray-800 font-semibold">{formatirajCas(casIzdelaveMin)}</span>
                            <span className="font-extrabold text-red-600">{formatirajCasDoRoka(doRoka)}</span>
                            <span className="font-extrabold text-gray-900">{formatirajCas(skupaj)}</span>
                            <span className="flex justify-center">
                              <div className="flex flex-col gap-1">
                                <button
                                  disabled={!hasAnyClosedP1}
                                  className={`px-3 py-1 rounded transition-colors text-xs md:text-sm ${
                                    hasAnyClosedP1 ? 'bg-gray-600 text-white hover:bg-gray-700' : 'bg-gray-300 text-gray-600 cursor-not-allowed'
                                  }`}
                                  onClick={() => handleResetNalog(nalog.stevilkaNaloga, 1)}
                                  title="Razveljavi samo dodelave za Predmet 1"
                                >
                                  Razveljavi 1
                                </button>
                                <button
                                  disabled={!hasAnyClosedP2}
                                  className={`px-3 py-1 rounded transition-colors text-xs md:text-sm ${
                                    hasAnyClosedP2 ? 'bg-gray-600 text-white hover:bg-gray-700' : 'bg-gray-300 text-gray-600 cursor-not-allowed'
                                  }`}
                                  onClick={() => handleResetNalog(nalog.stevilkaNaloga, 2)}
                                  title="Razveljavi samo dodelave za Predmet 2"
                                >
                                  Razveljavi 2
                                </button>
                              </div>
                            </span>
                            <span className="flex justify-center">
                              <button
                                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-xs md:text-sm"
                                onClick={() => {
                                  const originalniNalog = prioritetniNalogi.find(p => p.stevilkaNaloga === nalog.stevilkaNaloga);
                                  if (originalniNalog) {
                                    const nalogZaOdprtje = {
                                      stevilkaNaloga: originalniNalog.stevilkaNaloga,
                                      podatki: originalniNalog.podatki,
                                      status: originalniNalog.status,
                                      emailPoslan: originalniNalog.podatki?.emailPoslan || false,
                                      dobavljeno: originalniNalog.status === 'dobavljeno'
                                    };
                                    onIzberi(nalogZaOdprtje);
                                  }
                                }}
                              >
                                Odpri
                              </button>
                            </span>
                          </div>
                        </div>

                        {/* Oznaka: Predmet 1 */}
                        <div className="px-2 pb-1 -mt-1">
                          <div className="text-[11px] font-semibold text-gray-600 truncate" title={predmet1 || ''}>
                            Predmet 1{predmet1 ? `: ${predmet1}` : ''}
                          </div>
                        </div>

                        {/* Dodelave 1 */}
                        <div className="grid gap-1 px-2 pb-1 w-full" style={{ gridTemplateColumns: `repeat(${dodelaveVrstniRed.length}, minmax(0, 1fr))` }}>
                          {dodelaveVrstniRed.map((d) => {
                            const cas = d.getCas(cas1);
                            const jeZaprt = isTaskClosed(nalog.stevilkaNaloga, d.taskType, 1);
                            const naslov = `${d.label}: ${formatirajCas(cas)}`;
                            return (
                              <div key={`p1-${d.taskType}`} className="min-h-[28px]">
                                {cas > 0 ? (
                                  <div
                                    className={`px-2 py-1 rounded text-[11px] leading-tight border border-black/10 select-none ${getDodelavaBarva(d.taskType)} ${
                                      jeZaprt ? 'opacity-50 grayscale cursor-default' : 'cursor-pointer hover:opacity-90'
                                    }`}
                                    title={jeZaprt ? `${naslov} (zaključeno)` : `${naslov} (klik za zapiranje)`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => { if (!jeZaprt) handleCloseTask(nalog.stevilkaNaloga, d.taskType, 1); }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        if (!jeZaprt) handleCloseTask(nalog.stevilkaNaloga, d.taskType, 1);
                                      }
                                    }}
                                  >
                                    <div className="truncate">{d.label}: {formatirajCas(cas)}</div>
                                  </div>
                                ) : <div className="h-[28px]" />}
                              </div>
                            );
                          })}
                        </div>

                        {/* Oznaka: Predmet 2 */}
                        <div className="px-2 pb-1">
                          <div className="text-[11px] font-semibold text-gray-600 truncate" title={predmet2 || ''}>
                            Predmet 2{predmet2 ? `: ${predmet2}` : ''}
                          </div>
                        </div>

                        {/* Dodelave 2 */}
                        <div className="grid gap-1 px-2 pb-2 w-full" style={{ gridTemplateColumns: `repeat(${dodelaveVrstniRed.length}, minmax(0, 1fr))` }}>
                          {dodelaveVrstniRed.map((d) => {
                            const cas = d.getCas(cas2);
                            const jeZaprt = isTaskClosed(nalog.stevilkaNaloga, d.taskType, 2);
                            const naslov = `${d.label}: ${formatirajCas(cas)}`;
                            return (
                              <div key={`p2-${d.taskType}`} className="min-h-[28px]">
                                {cas > 0 ? (
                                  <div
                                    className={`px-2 py-1 rounded text-[11px] leading-tight border border-black/10 select-none ${getDodelavaBarva(d.taskType)} ${
                                      jeZaprt ? 'opacity-50 grayscale cursor-default' : 'cursor-pointer hover:opacity-90'
                                    }`}
                                    title={jeZaprt ? `${naslov} (zaključeno)` : `${naslov} (klik za zapiranje)`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => { if (!jeZaprt) handleCloseTask(nalog.stevilkaNaloga, d.taskType, 2); }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        if (!jeZaprt) handleCloseTask(nalog.stevilkaNaloga, d.taskType, 2);
                                      }
                                    }}
                                  >
                                    <div className="truncate">{d.label}: {formatirajCas(cas)}</div>
                                  </div>
                                ) : <div className="h-[28px]" />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Obremenitev strojev */}
            <div className="mt-6">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-800">Obremenitev strojev</h3>
                  <p className="text-sm text-gray-600">Skupni čas po storitvah</p>
                </div>
              </div>
              {obremenitevStoritev.length === 0 ? (
                <div className="mt-3 text-sm text-gray-500">Ni podatkov o obremenitvi.</div>
              ) : (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {obremenitevStoritev.map((storitev) => (
                    <div key={storitev.naziv} className={`rounded-lg p-3 border border-black/10 ${getDodelavaBarva(storitev.naziv)}`}>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold">{storitev.naziv}</h4>
                        <span className="text-sm font-extrabold">{formatirajCas(storitev.skupniCas)}</span>
                      </div>
                      <div className="space-y-1">
                        {storitev.nalogi.map((n) => (
                          <div key={n.stevilkaNaloga} className="flex items-center justify-between text-xs">
                            <span>#{n.stevilkaNaloga}</span>
                            <span className="font-semibold">{formatirajCas(n.cas)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
};

export default PrioritetniNalogi; 