import React, { useState, useMemo, useEffect } from 'react';

interface SeznamNalogaProps {
  nalogi: any[];
  onIzberi: (nalog: any) => void;
  onKopiraj: (nalog: any) => void;
  selectedStevilkaNaloga?: number;
  getPrioritetaBarva?: (prioriteta: number) => string;
  closedTasks?: Array<{ stevilkaNaloga: number; taskType: string }>;
  prioritetaMapa?: Map<number, number>;
  onPrioritetaClick?: (stevilkaNaloga: number) => void;
  onYearFilterChange?: (year: number) => void;
  initialYear?: number;
  scrollToStevilkaNaloga?: { id: number; ts: number } | null;
  initialListScrollTop?: number;
  onListScrollTopChange?: (scrollTop: number) => void;
}

const SeznamNaloga: React.FC<SeznamNalogaProps> = ({ nalogi, onIzberi, onKopiraj, selectedStevilkaNaloga, getPrioritetaBarva, closedTasks = [], prioritetaMapa, onPrioritetaClick, onYearFilterChange, initialYear, scrollToStevilkaNaloga, initialListScrollTop, onListScrollTopChange }) => {
  // Debug: izpiši informacije o prioritetaMapa
  console.log('SeznamNaloga render:', {
    prioritetaMapaSize: prioritetaMapa?.size,
    closedTasksLength: closedTasks.length,
    nalogiLength: nalogi.length
  });
  const [filterStevilka, setFilterStevilka] = useState('');
  const [filterNarocnik, setFilterNarocnik] = useState('');
  const [filterPredmet, setFilterPredmet] = useState('');
  const [filterRazno, setFilterRazno] = useState('');
  const [sortKey, setSortKey] = useState<'stevilka'|'narocnik'|'datumNarocila'|'prioriteta'>('stevilka');
  const [sortAsc, setSortAsc] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'vse'|'v_delu'|'zakljucen'|'dobavljeno'>('vse');
  // Year filter: statični seznam 2010..trenutno leto (desc)
  const vsaLeta = useMemo(() => {
    const now = new Date().getFullYear();
    const out: number[] = [];
    for (let y = now; y >= 2010; y--) out.push(y);
    return out;
  }, []);
  const [filterLeto, setFilterLeto] = useState<number>(initialYear ?? new Date().getFullYear());
  useEffect(() => {
    if (typeof initialYear === 'number') setFilterLeto(initialYear);
  }, [initialYear]);

  // Posodobi komponento, ko se spremenijo closedTasks
  useEffect(() => {
    // To bo povzročilo ponovno izračun prioritet
  }, [closedTasks]);

  const pocistiFiltre = () => {
    setFilterStevilka('');
    setFilterNarocnik('');
    setFilterPredmet('');
    setFilterRazno('');
    setStatusFilter('vse');
  };

  // ESC: počisti filtre (številka/naročnik/predmet/razno + status -> vse)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        pocistiFiltre();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Funkcija za preverjanje ali je dodelava zaprta
  const isTaskClosed = (stevilkaNaloga: number, taskType: string): boolean => {
    return closedTasks.some(task => task.stevilkaNaloga === stevilkaNaloga && task.taskType === taskType);
  };

  // Funkcija za izračun skupnega časa brez zaprtih dodelav
  const izracunajSkupniCasBrezZaprtih = (nalog: any): number => {
    let skupniCas = 0;
    
    // Dodaj čas tiska
    const casTiska = izracunajCasTiska(nalog);
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Tisk')) {
      skupniCas += casTiska;
    }
    
    // Dodaj čas dodelav (poenostavljeno)
    const dodelava1 = nalog.podatki?.dodelava1;
    const dodelava2 = nalog.podatki?.dodelava2;
    
    if (dodelava1) {
      if (dodelava1.razrez && !isTaskClosed(nalog.stevilkaNaloga, 'Razrez')) {
        skupniCas += 0.5;
      }
      if (dodelava1.uvTisk && !isTaskClosed(nalog.stevilkaNaloga, 'UV Tisk')) {
        skupniCas += 0.5;
      }
      if (dodelava1.plastifikacija && !isTaskClosed(nalog.stevilkaNaloga, 'Plastifikacija')) {
        skupniCas += 0.5;
      }
      if (dodelava1.uvLak && !isTaskClosed(nalog.stevilkaNaloga, 'UV Lak')) {
        skupniCas += 0.5;
      }
      if (dodelava1.izsek && !isTaskClosed(nalog.stevilkaNaloga, 'Izsek/Zasek')) {
        skupniCas += 0.5;
      }
      if (dodelava1.topliTisk && !isTaskClosed(nalog.stevilkaNaloga, 'Topli tisk')) {
        skupniCas += 0.5;
      }
      if (dodelava1.biganje && !isTaskClosed(nalog.stevilkaNaloga, 'Biganje')) {
        skupniCas += 0.5;
      }
      if (dodelava1.biganjeRocnoZgibanje && !isTaskClosed(nalog.stevilkaNaloga, 'Biganje + ročno zgibanje')) {
        skupniCas += 0.5;
      }
      if (dodelava1.zgibanje && !isTaskClosed(nalog.stevilkaNaloga, 'Zgibanje')) {
        skupniCas += 0.5;
      }
      if (dodelava1.lepljenje && !isTaskClosed(nalog.stevilkaNaloga, 'Lepljenje')) {
        skupniCas += 0.5;
      }
      if (dodelava1.lepljenjeBlokov && !isTaskClosed(nalog.stevilkaNaloga, 'Lepljenje blokov')) {
        skupniCas += 0.5;
      }
      if (dodelava1.vezava && !isTaskClosed(nalog.stevilkaNaloga, 'Vezava')) {
        skupniCas += 0.5;
      }
      if (dodelava1.vrtanjeLuknje && !isTaskClosed(nalog.stevilkaNaloga, 'Vrtanje luknje')) {
        skupniCas += 0.5;
      }
      if (dodelava1.perforacija && !isTaskClosed(nalog.stevilkaNaloga, 'Perforacija')) {
        skupniCas += 0.5;
      }
    }
    
    if (dodelava2) {
      if (dodelava2.razrez && !isTaskClosed(nalog.stevilkaNaloga, 'Razrez')) {
        skupniCas += 0.5;
      }
      if (dodelava2.uvTisk && !isTaskClosed(nalog.stevilkaNaloga, 'UV Tisk')) {
        skupniCas += 0.5;
      }
      if (dodelava2.plastifikacija && !isTaskClosed(nalog.stevilkaNaloga, 'Plastifikacija')) {
        skupniCas += 0.5;
      }
      if (dodelava2.uvLak && !isTaskClosed(nalog.stevilkaNaloga, 'UV Lak')) {
        skupniCas += 0.5;
      }
      if (dodelava2.izsek && !isTaskClosed(nalog.stevilkaNaloga, 'Izsek/Zasek')) {
        skupniCas += 0.5;
      }
      if (dodelava2.topliTisk && !isTaskClosed(nalog.stevilkaNaloga, 'Topli tisk')) {
        skupniCas += 0.5;
      }
      if (dodelava2.biganje && !isTaskClosed(nalog.stevilkaNaloga, 'Biganje')) {
        skupniCas += 0.5;
      }
      if (dodelava2.biganjeRocnoZgibanje && !isTaskClosed(nalog.stevilkaNaloga, 'Biganje + ročno zgibanje')) {
        skupniCas += 0.5;
      }
      if (dodelava2.zgibanje && !isTaskClosed(nalog.stevilkaNaloga, 'Zgibanje')) {
        skupniCas += 0.5;
      }
      if (dodelava2.lepljenje && !isTaskClosed(nalog.stevilkaNaloga, 'Lepljenje')) {
        skupniCas += 0.5;
      }
      if (dodelava2.lepljenjeBlokov && !isTaskClosed(nalog.stevilkaNaloga, 'Lepljenje blokov')) {
        skupniCas += 0.5;
      }
      if (dodelava2.vezava && !isTaskClosed(nalog.stevilkaNaloga, 'Vezava')) {
        skupniCas += 0.5;
      }
      if (dodelava2.vrtanjeLuknje && !isTaskClosed(nalog.stevilkaNaloga, 'Vrtanje luknje')) {
        skupniCas += 0.5;
      }
      if (dodelava2.perforacija && !isTaskClosed(nalog.stevilkaNaloga, 'Perforacija')) {
        skupniCas += 0.5;
      }
    }
    
    return skupniCas;
  };

  const filtriraniNalogi = useMemo(() => {
    return nalogi.filter(n => {
      const stevilkaMatch = filterStevilka ? String(n.stevilkaNaloga).includes(filterStevilka) : true;
      const narocnikRaw =
        (n.podatki?.kupec?.Naziv) ||
        (n.podatki?.kupec?.naziv) ||
        (n.podatki?.KupecNaziv) ||
        (n.podatki?.kupecNaziv) ||
        (n.kupecNaziv) ||
        (n.kupec?.Naziv) ||
        (n.Naziv) ||
        '';
      const narocnik = narocnikRaw.toString().trim().replace(/^[,\s-]+|[,\s-]+$/g, '');
      const narocnikMatch = filterNarocnik ? narocnik.toLowerCase().includes(filterNarocnik.toLowerCase()) : true;
      const predmet1 = (n.podatki?.tisk?.tisk1?.predmet) || (n.podatki?.Predmet1) || '';
      const predmet2 = (n.podatki?.tisk?.tisk2?.predmet) || (n.podatki?.Predmet2) || '';
      const predmetMatch = filterPredmet ? (predmet1 + ' ' + predmet2).toLowerCase().includes(filterPredmet.toLowerCase()) : true;
      const razno = JSON.stringify(n).toLowerCase();
      const raznoMatch = filterRazno ? razno.includes(filterRazno.toLowerCase()) : true;
      let statusOk = true;
      if (statusFilter === 'v_delu') statusOk = !n.dobavljeno && n.status !== 'zaključen';
      if (statusFilter === 'zakljucen') statusOk = !n.dobavljeno && n.status === 'zaključen';
      if (statusFilter === 'dobavljeno') statusOk = !!n.dobavljeno;
      // Year filter (inkluzivno: od izbranega leta do trenutnega)
      let letoOk = true;
      if (filterLeto) {
        const datum = n.podatki?.datumNarocila || n.datumNarocila || n.podatki?.rokIzdelave || n.rokIzdelave;
        if (!datum) letoOk = false;
        else {
          const leto = new Date(datum).getFullYear();
          letoOk = leto >= filterLeto;
        }
      }
      return stevilkaMatch && narocnikMatch && predmetMatch && raznoMatch && statusOk && letoOk;
    });
  }, [nalogi, filterStevilka, filterNarocnik, filterPredmet, filterRazno, statusFilter, filterLeto]);

  // Funkcija za izračun časa tiska
  const izracunajCasTiska = (nalog: any): number => {
    let skupniCas = 0;
    
    // Tisk 1
    if (nalog.podatki?.tisk?.tisk1?.predmet && nalog.podatki?.tisk?.tisk1?.barve && nalog.podatki?.tisk?.tisk1?.steviloPol) {
      const steviloPol = parseInt(nalog.podatki.tisk.tisk1.steviloPol) || 0;
      const b2Format = nalog.podatki.tisk.tisk1.b2Format || false;
      const b1Format = nalog.podatki.tisk.tisk1.b1Format || false;
      
      if (!b2Format && !b1Format) {
        let casTiska = 0;
        if (nalog.podatki.tisk.tisk1.barve === '4/0 barvno enostransko (CMYK)') {
          casTiska = Math.ceil(steviloPol / 3000 * 10) / 10;
        } else if (nalog.podatki.tisk.tisk1.barve === '4/4 barvno obojestransko (CMYK)') {
          casTiska = Math.ceil(steviloPol / 1500 * 10) / 10;
        } else if (nalog.podatki.tisk.tisk1.barve === '1/0 črno belo enostransko (K)') {
          casTiska = Math.ceil(steviloPol / 6000 * 10) / 10;
        } else if (nalog.podatki.tisk.tisk1.barve === '1/1 črno belo obojestransko (K)') {
          casTiska = Math.ceil(steviloPol / 3000 * 10) / 10;
        }
        skupniCas += casTiska;
      }
    }
    
    // Tisk 2
    if (nalog.podatki?.tisk?.tisk2?.predmet && nalog.podatki?.tisk?.tisk2?.barve && nalog.podatki?.tisk?.tisk2?.steviloPol) {
      const steviloPol = parseInt(nalog.podatki.tisk.tisk2.steviloPol) || 0;
      const b2Format = nalog.podatki.tisk.tisk2.b2Format || false;
      const b1Format = nalog.podatki.tisk.tisk2.b1Format || false;
      
      if (!b2Format && !b1Format) {
        let casTiska = 0;
        if (nalog.podatki.tisk.tisk2.barve === '4/0 barvno enostransko (CMYK)') {
          casTiska = Math.ceil(steviloPol / 3000 * 10) / 10;
        } else if (nalog.podatki.tisk.tisk2.barve === '4/4 barvno obojestransko (CMYK)') {
          casTiska = Math.ceil(steviloPol / 1500 * 10) / 10;
        } else if (nalog.podatki.tisk.tisk2.barve === '1/0 črno belo enostransko (K)') {
          casTiska = Math.ceil(steviloPol / 6000 * 10) / 10;
        } else if (nalog.podatki.tisk.tisk2.barve === '1/1 črno belo obojestransko (K)') {
          casTiska = Math.ceil(steviloPol / 3000 * 10) / 10;
        }
        skupniCas += casTiska;
      }
    }
    
    return skupniCas;
  };

  // Funkcija za pretvorbo časa v h in min
  const formatirajCas = (casVUrah: number): string => {
    if (casVUrah === 0) return '0 min';
    
    const ure = Math.floor(casVUrah);
    const minute = Math.round((casVUrah - ure) * 60);
    
    if (ure === 0) {
      return `${minute} min`;
    } else if (minute === 0) {
      return `${ure}h`;
    } else {
      return `${ure}h ${minute} min`;
    }
  };

  // Funkcija za formatiranje datuma v slovenski format (17.5.2025)
  const formatirajDatum = (datum: string): string => {
    if (!datum) return '';
    const date = new Date(datum);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  };

  // Funkcija za izračun prioritete naloga (kopija iz App.tsx)
  // Helper funkcije za izračun delovnih ur
  const jeDelovniDan = (datum: Date): boolean => {
    const dan = datum.getDay();
    return dan >= 1 && dan <= 5; // Pon-pet
  };

  const izracunajDelovneUre = (zacetek: Date, konec: Date): number => {
    let delovneUre = 0;
    let trenutniDan = new Date(zacetek);
    
    // Če je trenutni čas po 15:00, začni z naslednjim delovnim dnem ob 7:00
    if (zacetek.getHours() >= 15) {
      trenutniDan = new Date(zacetek);
      trenutniDan.setDate(trenutniDan.getDate() + 1);
      // Poišči naslednji delovni dan
      while (trenutniDan.getDay() === 0 || trenutniDan.getDay() === 6) {
        trenutniDan.setDate(trenutniDan.getDate() + 1);
      }
      trenutniDan.setHours(7, 0, 0, 0); // Začni ob 7:00
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
    
    // Če sta začetek in konec isti dan
    if (trenutniDan.getDate() === konec.getDate() && 
        trenutniDan.getMonth() === konec.getMonth() && 
        trenutniDan.getFullYear() === konec.getFullYear()) {
      const zacetekUra = Math.max(7, trenutniDan.getHours() + trenutniDan.getMinutes() / 60);
      const konecUra = Math.min(15, konec.getHours() + konec.getMinutes() / 60);
      return Math.max(0, konecUra - zacetekUra);
    }
    
    // Izračunaj čas za prvi dan (trenutni dan)
    if (trenutniDan.getDay() >= 1 && trenutniDan.getDay() <= 5) { // Delovni dan
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
        if (naslednjiDan.getDay() >= 1 && naslednjiDan.getDay() <= 5) { // Delovni dan
          const konecUra = Math.min(15, konec.getHours() + konec.getMinutes() / 60);
          delovneUre += Math.max(0, konecUra - 7);
        }
        break;
      }
      
      // Če ni dan roka, dodaj polni delovni dan
      if (naslednjiDan.getDay() >= 1 && naslednjiDan.getDay() <= 5) { // Delovni dan
        delovneUre += 8; // 8 delovnih ur na dan
      }
      
      naslednjiDan.setDate(naslednjiDan.getDate() + 1);
    }
    
    return delovneUre;
  };

  const izracunajCasDoRoka = (nalog: any): number => {
    if (!nalog.podatki?.rokIzdelave) return 0;
    
    const datumRoka = new Date(nalog.podatki.rokIzdelave);
    let konecRoka = new Date(datumRoka);
    
    // Nastavi konec roka z uro
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
    const uraStr = (() => {
      const fromPodatkiRaw = normalizirajUro(nalog.podatki?.rokIzdelaveUra);
      if (fromPodatkiRaw) return clampUraNaDelavnik(parseInt(fromPodatkiRaw.slice(0, 2), 10), parseInt(fromPodatkiRaw.slice(3, 5), 10));
      return '15:00';
    })();
    const [ure, minute] = uraStr.split(':').map(Number);
    konecRoka.setHours(ure, minute, 0, 0);
    
    // Določi začetek dela - uporabi trenutni čas
    const trenutniCas = new Date();
    let zacetekDela = new Date(trenutniCas);
    
    // Če je trenutni čas po 15:00, začni z naslednjim delovnim dnem ob 7:00
    if (trenutniCas.getHours() >= 15) {
      zacetekDela = new Date(trenutniCas);
      zacetekDela.setDate(zacetekDela.getDate() + 1);
      // Poišči naslednji delovni dan
      while (zacetekDela.getDay() === 0 || zacetekDela.getDay() === 6) {
        zacetekDela.setDate(zacetekDela.getDate() + 1);
      }
      zacetekDela.setHours(7, 0, 0, 0);
    } else if (!jeDelovniDan(trenutniCas)) {
      // Če ni delovni dan, se rok začne naslednji delovni dan ob 7:00
      zacetekDela = new Date(trenutniCas);
      zacetekDela.setDate(zacetekDela.getDate() + 1);
      while (zacetekDela.getDay() === 0 || zacetekDela.getDay() === 6) {
        zacetekDela.setDate(zacetekDela.getDate() + 1);
      }
      zacetekDela.setHours(7, 0, 0, 0);
    } else {
      // Če je delovni dan pred 15:00, se rok začne ob trenutnem času
      zacetekDela = new Date(trenutniCas);
    }
    
    // Izračun delovnih ur do roka
    const delovneUreDoRoka = izracunajDelovneUre(zacetekDela, konecRoka);
    return Math.round(delovneUreDoRoka * 60); // pretvori v minute
  };

  const izracunajPrioriteto = (nalog: any): number => {
    if (nalog.status === 'zaključen' || nalog.dobavljeno) return 0;
    
    // Če ni določenega datuma, je prioriteta nizka (5)
    const rokIzdelave = nalog.podatki?.rokIzdelave;
    if (!rokIzdelave) return 5;
    
    // Izračunaj čas izdelave brez zaprtih dodelav
    const casIzdelave = izracunajSkupniCasBrezZaprtih(nalog);
    
    // Izračunaj čas do roka z upoštevanjem delovnih ur
    const casDoRoka = izracunajCasDoRoka(nalog);
    
    // Izračun prioritete: razlika med časom "do roka" in časom izdelave
    const razlikaCas = casDoRoka - casIzdelave;
    
    if (razlikaCas < 0) return 1; // prekoračen rok
    if (razlikaCas <= 120) return 2; // rok izdelave med 0-2 h (120 min)
    if (razlikaCas <= 300) return 3; // rok izdelave med 2-5 h (300 min)
    if (razlikaCas <= 960) return 4; // rok izdelave med 5-16 h (960 min)
    return 5; // rok izdelave več od 16 h
  };

  const sortiraniNalogi = useMemo(() => {
    const arr = [...filtriraniNalogi];
    arr.sort((a, b) => {
      if (sortKey === 'stevilka') {
        return sortAsc ? a.stevilkaNaloga - b.stevilkaNaloga : b.stevilkaNaloga - a.stevilkaNaloga;
      }
      if (sortKey === 'narocnik') {
        const n1 = (a.podatki?.kupec?.Naziv || '').toLowerCase();
        const n2 = (b.podatki?.kupec?.Naziv || '').toLowerCase();
        if (n1 < n2) return sortAsc ? -1 : 1;
        if (n1 > n2) return sortAsc ? 1 : -1;
        return 0;
      }
      if (sortKey === 'datumNarocila') {
        const d1 = a.podatki?.datumNarocila || a.datumNarocila || '';
        const d2 = b.podatki?.datumNarocila || b.datumNarocila || '';
        if (d1 < d2) return sortAsc ? -1 : 1;
        if (d1 > d2) return sortAsc ? 1 : -1;
        return 0;
      }
      if (sortKey === 'prioriteta') {
        const p1 = prioritetaMapa ? prioritetaMapa.get(a.stevilkaNaloga) || 0 : izracunajPrioriteto(a);
        const p2 = prioritetaMapa ? prioritetaMapa.get(b.stevilkaNaloga) || 0 : izracunajPrioriteto(b);
        return sortAsc ? p1 - p2 : p2 - p1;
      }
      return 0;
    });
    // Dodatno razvrščanje: zaključeni in dobavljeni nalogi na konec samo pri razvrščanju po prioriteti
    if (sortKey === 'prioriteta') {
      arr.sort((a, b) => {
        const aStatus = a.status === 'zaključen' || a.dobavljeno;
        const bStatus = b.status === 'zaključen' || b.dobavljeno;
        if (aStatus && !bStatus) return 1;
        if (!aStatus && bStatus) return -1;
        return 0;
      });
    }
    return arr;
  }, [filtriraniNalogi, sortKey, sortAsc, closedTasks, prioritetaMapa]);

  const scrollToIndex = useMemo(() => {
    const id = Number(scrollToStevilkaNaloga?.id || 0);
    if (!id) return null;
    const idx = sortiraniNalogi.findIndex(n => Number(n?.stevilkaNaloga) === id);
    return idx >= 0 ? idx : null;
  }, [sortiraniNalogi, scrollToStevilkaNaloga?.id, scrollToStevilkaNaloga?.ts]);

  // Debug: izpiši informacije o prioritetaMapa dependency array
  console.log('SeznamNaloga sortiraniNalogi useMemo dependency array:', {
    filtriraniNalogiLength: filtriraniNalogi.length,
    sortKey,
    sortAsc,
    closedTasksLength: closedTasks.length,
    prioritetaMapaSize: prioritetaMapa?.size
  });

  const gridCols =
    'grid grid-cols-[40px_minmax(0,1.25fr)_minmax(0,1.25fr)_minmax(0,1.25fr)_80px_44px_84px]';

  return (
    <div className="w-full bg-white border-r flex flex-col min-w-0 h-full" style={{ height: '100%' }}>
      <div className="p-2 border-b bg-gray-50">
        <div className="grid grid-cols-2 gap-1">
          <input className="w-full px-2 py-1 border rounded text-sm" placeholder="Št. naloga" value={filterStevilka} onChange={e => setFilterStevilka(e.target.value)} />
          <input className="w-full px-2 py-1 border rounded text-sm" placeholder="Naročnik" value={filterNarocnik} onChange={e => setFilterNarocnik(e.target.value)} />
          <input className="w-full px-2 py-1 border rounded text-sm" placeholder="Predmet" value={filterPredmet} onChange={e => setFilterPredmet(e.target.value)} />
          <input className="w-full px-2 py-1 border rounded text-sm" placeholder="Razno (fulltext)" value={filterRazno} onChange={e => setFilterRazno(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-row gap-2 p-2 bg-gray-50 border-b text-xs items-center">
        <button onClick={() => setStatusFilter('vse')}>Vse</button>
        <button onClick={() => setStatusFilter('v_delu')}>V delu</button>
        <button onClick={() => setStatusFilter('zakljucen')}>Tisk zak.</button>
        <button onClick={() => setStatusFilter('dobavljeno')}>Dob.</button>
        <button
          type="button"
          onClick={pocistiFiltre}
          className="px-2 py-1 border rounded text-xs bg-white hover:bg-gray-100"
          title="Počisti filtre (deluje tudi tipka ESC)"
        >
          Počisti filt.
        </button>
        <div className="ml-auto flex items-center gap-1">
          <label htmlFor="filterLeto" className="text-xs">Leto:</label>
          <select
            id="filterLeto"
            className="border rounded px-1 py-0.5 text-xs"
            value={filterLeto}
            onChange={e => {
              const y = parseInt(e.target.value);
              setFilterLeto(y);
              onYearFilterChange && onYearFilterChange(y);
            }}
            style={{ minWidth: 60 }}
          >
            {vsaLeta.map(leto => (
              <option key={leto} value={leto}>{leto}</option>
            ))}
          </select>
        </div>
      </div>
      <div className={`${gridCols} items-center text-xs font-semibold bg-gray-100 border-b px-1 py-1 overflow-x-hidden`}>
        <span className="cursor-pointer" onClick={() => { setSortKey('stevilka'); setSortAsc(k => sortKey === 'stevilka' ? !k : false); }}>Zapor. št.</span>
        <span className="min-w-0 cursor-pointer" onClick={() => { setSortKey('narocnik'); setSortAsc(k => sortKey === 'narocnik' ? !k : false); }}>Naročnik</span>
        <span className="min-w-0">Predmet 1</span>
        <span className="min-w-0">Predmet 2</span>
        <span className="cursor-pointer" onClick={() => { setSortKey('datumNarocila'); setSortAsc(k => sortKey === 'datumNarocila' ? !k : false); }}>Datum odprtja</span>
        <span className="cursor-pointer" onClick={() => { setSortKey('prioriteta'); setSortAsc(k => sortKey === 'prioriteta' ? !k : false); }}>Pr.</span>
        <span className="text-right pr-1"> </span>
      </div>
      {/* Virtualiziran seznam za hitrost */}
      <VirtualizedList
        items={sortiraniNalogi}
        rowHeight={32}
        scrollToIndex={scrollToIndex}
        scrollToTs={scrollToStevilkaNaloga?.ts}
        initialScrollTop={initialListScrollTop}
        onScrollTopChange={onListScrollTopChange}
      >
        {(n: any, i: number) => {
          // Izračunaj index za izmenično barvanje po statusu
          let mintIndex = 0, redIndex = 0, whiteIndex = 0;
          for (let j = 0; j < i; j++) {
            const prev = sortiraniNalogi[j];
            if (prev.dobavljeno) mintIndex++;
            else if (prev.status === 'zaključen' || prev.zakljucen) redIndex++;
            else whiteIndex++;
          }
          const toBool = (v: any) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
          const jeDobavljeno = !!(toBool(n.dobavljeno) || toBool(n?.podatki?.Dobavljeno) || (String(n.status || '').toLowerCase() === 'dobavljeno'));
          const tiskZaklj1 = !!(toBool((n as any).tiskZakljucen1) || toBool(n?.podatki?.TiskZakljucen1) || toBool(n?.podatki?.tiskZakljucen1));
          const tiskZaklj2 = !!(toBool((n as any).tiskZakljucen2) || toBool(n?.podatki?.TiskZakljucen2) || toBool(n?.podatki?.tiskZakljucen2));
          const jeZakljucen = !!(toBool(n.zakljucen) || n.status === 'zaključen' || toBool(n?.podatki?.TiskZakljucen) || toBool(n?.podatki?.Zakljucen) || (tiskZaklj1 && tiskZaklj2));
          let rowClass = '';
          if (jeDobavljeno) rowClass = mintIndex % 2 === 0 ? 'bg-[#e6f9f3]' : 'bg-[#c2f0e3]';
          else if (jeZakljucen) rowClass = redIndex % 2 === 0 ? 'bg-red-50' : 'bg-red-100';
          else rowClass = whiteIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50';
          const predmet1HalfClass = (!jeDobavljeno && !jeZakljucen && tiskZaklj1) ? 'bg-red-100' : '';
          const predmet2HalfClass = (!jeDobavljeno && !jeZakljucen && tiskZaklj2) ? 'bg-red-100' : '';
          
          const prioriteta = prioritetaMapa ? prioritetaMapa.get(n.stevilkaNaloga) || 0 : izracunajPrioriteto(n);
          const prioritetaBarva = getPrioritetaBarva ? getPrioritetaBarva(prioriteta) : '';
          
          // Debug: izpiši prioriteto za nalog 65066
          if (n.stevilkaNaloga === 65066) {
            console.log(`SeznamNaloga - Nalog 65066:`, {
              prioriteta: prioriteta,
              barva: prioritetaBarva,
              prioritetaMapa: prioritetaMapa?.get(65066),
              closedTasks: closedTasks.filter(t => t.stevilkaNaloga === 65066),
              prioritetaMapaSize: prioritetaMapa?.size
            });
          }

          return (
            <div
              key={n.stevilkaNaloga}
              className={`h-full box-border border-b px-1 py-1 hover:bg-blue-50 cursor-pointer ${gridCols} items-center text-xs leading-snug min-w-0 overflow-x-hidden overflow-y-hidden ${rowClass} ${
                selectedStevilkaNaloga === n.stevilkaNaloga
                  // Inset ring (znotraj vrstice), da ne "posega" v sosednje vrstice
                  ? 'font-bold bg-blue-50 ring-2 ring-inset ring-blue-500'
                  : ''
              }`}
              onDoubleClick={() => onIzberi(n)}
              title="Dvojni klik za odpiranje naloga"
            >
              <span className={`font-bold pr-1 border-r border-gray-200 ${jeZakljucen ? 'text-red-700' : jeDobavljeno ? 'text-green-700' : 'text-blue-700'}`}>{n.stevilkaNaloga}</span>
              <span className="min-w-0 text-gray-700 truncate border-r border-gray-200 pr-1">
                {(
                  (n.podatki?.kupec?.Naziv) ||
                  (n.podatki?.kupec?.naziv) ||
                  (n.podatki?.KupecNaziv) ||
                  (n.podatki?.kupecNaziv) ||
                  (n.kupecNaziv) ||
                  (n.kupec?.Naziv) ||
                  (n.Naziv) ||
                  ''
                ).toString().trim().replace(/^[,\s-]+|[,\s-]+$/g, '')}
              </span>
              <span className={`min-w-0 text-gray-600 truncate border-r border-gray-200 pr-1 ${predmet1HalfClass}`}>{(n.podatki?.tisk?.tisk1?.predmet) || (n.podatki?.Predmet1) || ''}</span>
              <span className={`min-w-0 text-gray-600 truncate border-r border-gray-200 pr-1 ${predmet2HalfClass}`}>{(n.podatki?.tisk?.tisk2?.predmet) || (n.podatki?.Predmet2) || ''}</span>
              <span className="text-gray-500 border-r border-gray-200 pr-1">{formatirajDatum(n.podatki?.datumNarocila || n.datumNarocila)}</span>
              <span className="border-r border-gray-200 flex items-center justify-center">
                {prioriteta > 0 && (
                  <button
                    type="button"
                    className="p-0.5"
                    title="Pokaži nalog v seznamu prioritetnih nalogov"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPrioritetaClick && onPrioritetaClick(Number(n.stevilkaNaloga));
                    }}
                  >
                    <div className={`w-3 h-3 rounded-full ${prioritetaBarva}`}></div>
                  </button>
                )}
              </span>
              <span className="flex justify-end pr-1">
                <button
                  className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                  title="Kopiraj nalog"
                  onClick={e => { e.stopPropagation(); onKopiraj(n); }}
                >
                  Kopiraj
                </button>
              </span>
            </div>
          );
        }}
      </VirtualizedList>
    </div>
  );
};

export default SeznamNaloga; 

// Preprost virtualiziran seznam z fiksno višino vrstice
const VirtualizedList: React.FC<{
  items: any[];
  rowHeight: number;
  scrollToIndex?: number | null;
  scrollToTs?: number;
  initialScrollTop?: number;
  onScrollTopChange?: (scrollTop: number) => void;
  children: (item: any, index: number) => React.ReactNode;
}> = ({ items, rowHeight, scrollToIndex, scrollToTs, initialScrollTop, onScrollTopChange, children }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [height, setHeight] = React.useState(0);
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const top = (e.target as HTMLDivElement).scrollTop;
    setScrollTop(top);
    onScrollTopChange && onScrollTopChange(top);
  };
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const resize = () => setHeight(el.clientHeight);
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Ob prvem mountu obnovi scroll pozicijo (za preklapljanje med zavihki)
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const top = Number(initialScrollTop || 0);
    if (!Number.isFinite(top) || top <= 0) return;
    requestAnimationFrame(() => {
      try {
        el.scrollTop = top;
        setScrollTop(top);
      } catch {}
    });
    // samo ob mountu / spremembi initial (ob ponovnem mountu zavihka)
  }, [initialScrollTop]);

  // Programatičen scroll do izbrane vrstice (za "lociraj nalog" iz drugega zavihka).
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (scrollToIndex == null || !Number.isFinite(scrollToIndex)) return;
    const idx = Math.max(0, Math.min(items.length - 1, Number(scrollToIndex)));
    const targetTop = Math.max(0, idx * rowHeight - 6 * rowHeight); // malo "pred" vrstico, da je lepo vidna
    requestAnimationFrame(() => {
      try {
        el.scrollTop = targetTop;
        setScrollTop(targetTop);
      } catch {}
    });
  }, [scrollToIndex, scrollToTs, items.length, rowHeight]);
  const total = items.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 5);
  const visibleCount = height > 0 ? Math.ceil(height / rowHeight) + 10 : 50;
  const endIndex = Math.min(total, startIndex + visibleCount);
  const offsetY = startIndex * rowHeight;
  const slice = items.slice(startIndex, endIndex);
  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden" onScroll={onScroll}>
      {total === 0 && <div className="p-4 text-gray-400 text-center">Ni shranjenih nalogov</div>}
      <div style={{ height: total * rowHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${offsetY}px)` }}>
          {slice.map((item, idx) => (
            <div key={item.stevilkaNaloga} style={{ height: rowHeight, overflow: 'hidden' }}>
              {children(item, startIndex + idx)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};