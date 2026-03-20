import React, { useState, useEffect } from 'react';

function safeEvalExpression(input: string): number | null {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (!/^[0-9+\-*/().,\s]+$/.test(raw)) return null;
  const s = raw.replace(/,/g, '.');
  if (!/\d/.test(s)) return null;
  if (s.length > 64) return null;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`return (${s});`);
    const v = fn();
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function formatInt(n: number, mode: 'round' | 'ceil' = 'round'): string {
  const v = mode === 'ceil' ? Math.ceil(n) : Math.round(n);
  return Number.isFinite(v) ? String(v) : '';
}

// Definicije materialov po kategorijah
const MATERIALI = {
  papir: [
    'brezlesni, nepremazni 90 g/m²',
    'brezlesni, nepremazni 120 g/m²',
    'brezlesni, nepremazni 170 g/m²',
    'brezlesni, nepremazni 200 g/m²',
    'brezlesni, nepremazni 250 g/m²',
    'brezlesni, nepremazni 300 g/m²',
    'brezlesni, nepremazni IVORY 90 g/m² EOS',
    'brezlesni, nepremazni IVORY 120 g/m² EOS',
    'brezlesni, nepremazni IVORY 250 g/m²',
    'mat premazni 115 g/m²',
    'mat premazni 130 g/m²',
    'mat premazni 150 g/m²',
    'mat premazni 170 g/m²',
    'mat premazni 200 g/m²',
    'mat premazni 250 g/m²',
    'mat premazni 300 g/m²',
    'mat premazni 350 g/m²'
  ],
  strukturiraniKarton: [
    'Fedrigoni Old Mill 250 g/m²',
    'Fedrigoni Tintoreto Soho 300 g/m²',
    'Fedrigoni Materica Kraft 250 g/m²',
    'Fedrigoni Woodstock Betulla 285 g/m²',
    'Fedrigoni Nettuno Bianco Artico 280 g/m²',
    'Fedrigoni Sirio Pearl 300 g/m²',
    'Polypaper'
  ],
  embalazniKarton: [
    'enostransko premazni karton 250 g/m²',
    'enostransko premazni karton 300 g/m²',
    'enostransko premazni karton 350 g/m²'
  ],
  nalepke: [
    'nepremazna nalepka',
    'mat premazna nalepka',
    'lahko odstranljiva mat premazna nalepka',
    'bela PVC nalepka',
    'prozorna PVC nalepka',
    'Woodstock bettula nepremazna nalepka'
  ],
  valovitiKarton: [
    'mikroval E val RJAVI',
    'mikroval E val RJAVI VEČJI',
    'mikroval E val BELI ZA TISK',
    'mikroval E val BELI ZA TISK VEČJI',
    'Karton EE val BELI ZA TISK',
    'Karton BE-val rjavi',
    'forex 1 mm',
    'forex 2 mm',
    'forex 3 mm',
    'forex 5 mm',
    'forex 10 mm',
    'forex 19 mm',
    'kapa 5 mm',
    'kapa 10 mm',
    'dibond',
    'polyplack',
    'naročnikov material',
    'Drugo-glej komentar'
  ]
};

const BARVE = [
  '4/0 barvno enostransko (CMYK)',
  '4/4 barvno obojestransko (CMYK)',
  '1/0 črno belo enostransko (K)',
  '1/1 črno belo obojestransko (K)',
  '3/0 EPM',
  '3/3 EPM',
  '3/1 EPM/K'
];

interface TiskPodatki {
  predmet: string;
  format: string;
  obseg: string;
  steviloKosov: string;
  material: string;
  barve: string;
  steviloPol: string;
  kosovNaPoli: string;
  tiskaKooperant: boolean;
  kooperant: string;
  rokKooperanta: string;
  znesekKooperanta: string;
  b2Format: boolean;
  b1Format: boolean;
  collate: boolean;
  steviloMutacij: string;
  mutacije: Array<{
    steviloPol: string;
  }>;
}

interface TiskSekcijaProps {
  disabled?: boolean;
  zakljucen?: boolean;
  zakljucen1?: boolean;
  zakljucen2?: boolean;
  onTiskChange?: (tisk1: TiskPodatki, tisk2: TiskPodatki) => void;
  tiskPodatki?: { tisk1: TiskPodatki; tisk2: TiskPodatki };
  dobavljeno?: boolean;
}

const TiskSekcija: React.FC<TiskSekcijaProps> = ({ disabled = false, zakljucen = false, zakljucen1, zakljucen2, onTiskChange, tiskPodatki, dobavljeno = false }) => {
  const jeZakljucen1 = (typeof zakljucen1 === 'boolean') ? zakljucen1 : zakljucen;
  const jeZakljucen2 = (typeof zakljucen2 === 'boolean') ? zakljucen2 : zakljucen;
  const jeZakljucenOba = jeZakljucen1 && jeZakljucen2;
  const [tisk1, setTisk1] = useState<TiskPodatki>(
    {
      predmet: '',
      format: '',
      obseg: '',
      steviloKosov: '',
      material: '',
      barve: '',
      steviloPol: '',
      kosovNaPoli: '',
      tiskaKooperant: false,
      kooperant: '',
      rokKooperanta: '',
      znesekKooperanta: '',
      b2Format: false,
      b1Format: false,
      collate: false,
      steviloMutacij: '1',
      mutacije: [],
      ...(tiskPodatki?.tisk1 || {})
    }
  );

  const [tisk2, setTisk2] = useState<TiskPodatki>(
    {
      predmet: '',
      format: '',
      obseg: '',
      steviloKosov: '',
      material: '',
      barve: '',
      steviloPol: '',
      kosovNaPoli: '',
      tiskaKooperant: false,
      kooperant: '',
      rokKooperanta: '',
      znesekKooperanta: '',
      b2Format: false,
      b1Format: false,
      collate: false,
      steviloMutacij: '1',
      mutacije: [],
      ...(tiskPodatki?.tisk2 || {})
    }
  );

  // Auto-calc: število pol = ceil(steviloKosov / kosovNaPoli) (tisk1+tisk2).
  // Če uporabnik ročno prepiše število pol, ob naslednji spremembi kosov/kosovNaPoli se polje še vedno posodobi,
  // in utripne rumeno.
  const [polFlash, setPolFlash] = useState<{ 1: boolean; 2: boolean }>({ 1: false, 2: false });
  const [polUserTouched, setPolUserTouched] = useState<{ 1: boolean; 2: boolean }>({ 1: false, 2: false });

  // Sinhronizacija z props
  useEffect(() => {
    const allMaterials: string[] = [
      ...MATERIALI.papir,
      ...MATERIALI.strukturiraniKarton,
      ...MATERIALI.embalazniKarton,
      ...MATERIALI.nalepke,
      ...MATERIALI.valovitiKarton,
    ];
    const norm = (s: string) =>
      (s || '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s*,\s*/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const tokens = (s: string) => norm(s).split(' ').filter(Boolean);
    const gramsFrom = (s: string) => {
      const m = String(s || '').match(/(\d{2,4})\s*g/i);
      return m ? Number(m[1]) : null;
    };
    const bestMaterialMatch = (raw: any): string => {
      const input = String(raw || '').trim();
      if (!input) return '';
      // Exact match (case-insensitive, normalized)
      const inNorm = norm(input);
      const exact = allMaterials.find((m) => norm(m) === inNorm);
      if (exact) return exact;

      const inT = tokens(input);
      const inG = gramsFrom(input);
      let best = '';
      let bestScore = -1;
      for (const opt of allMaterials) {
        const optT = tokens(opt);
        const setA = new Set(inT);
        const setB = new Set(optT);
        let inter = 0;
        for (const t of setA) if (setB.has(t)) inter++;
        const union = new Set([...setA, ...setB]).size || 1;
        let score = inter / union;
        const optG = gramsFrom(opt);
        if (inG && optG && inG === optG) score += 0.4; // močan bonus za enako gramaturo
        if (norm(opt).startsWith(inNorm) || inNorm.startsWith(norm(opt))) score += 0.15;
        if (score > bestScore) {
          bestScore = score;
          best = opt;
        }
      }
      // V praksi moramo vedno mapirati (v novem dropdown-u je več materialov kot prej).
      return best || input;
    };

    const defaultObj = { predmet: '', format: '', obseg: '', steviloKosov: '', material: '', barve: '', steviloPol: '', kosovNaPoli: '', tiskaKooperant: false, kooperant: '', rokKooperanta: '', znesekKooperanta: '', b2Format: false, b1Format: false, collate: false, steviloMutacij: '1', mutacije: [] };
    const merge1Raw = { ...defaultObj, ...(tiskPodatki?.tisk1 || {}) };
    const merge2Raw = { ...defaultObj, ...(tiskPodatki?.tisk2 || {}) };
    const merge1 = { ...merge1Raw, material: bestMaterialMatch((merge1Raw as any).material) };
    const merge2 = { ...merge2Raw, material: bestMaterialMatch((merge2Raw as any).material) };
    setTisk1(merge1);
    setTisk2(merge2);

    // Če smo material "preslikali" na novo ime, posodobi tudi parent state (da se shrani z novim imenom).
    const changed1 = String(merge1Raw.material || '') !== String(merge1.material || '');
    const changed2 = String(merge2Raw.material || '') !== String(merge2.material || '');
    if (onTiskChange && (changed1 || changed2)) {
      onTiskChange(merge1, merge2);
    }
  }, [tiskPodatki]);

  // Validacija tisk kalkulacije
  // Funkcija za izračun časa tiska
  const izracunajCasTiska = (podatki: TiskPodatki): number => {
    if (!podatki.predmet || !podatki.barve || !podatki.steviloPol) {
      return 0;
    }

    const steviloPol = parseInt(podatki.steviloPol) || 0;
    const b2Format = podatki.b2Format || false;
    const b1Format = podatki.b1Format || false;
    const tiskaKooperant = podatki.tiskaKooperant || false;
    
    // Formula za tisk (velja le če ni obkljukana kljukica pri b2 ali b1 format pole)
    // Po novih pravilih: če je B1/B2 ali kooperant, časa tiska ne računamo.
    if (!b2Format && !b1Format && !tiskaKooperant) {
      let casTiska = 0;
      if (podatki.barve === '4/0 barvno enostransko (CMYK)') {
        casTiska = Math.ceil(steviloPol / 2000 * 10) / 10;
      } else if (podatki.barve === '4/4 barvno obojestransko (CMYK)') {
        casTiska = Math.ceil(steviloPol / 1200 * 10) / 10;
      } else if (podatki.barve === '1/0 črno belo enostransko (K)') {
        casTiska = Math.ceil(steviloPol / 5000 * 10) / 10;
      } else if (podatki.barve === '1/1 črno belo obojestransko (K)') {
        casTiska = Math.ceil(steviloPol / 2500 * 10) / 10;
      }
      return casTiska;
    }
    
    return 0;
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

  const validirajTisk = (podatki: TiskPodatki) => {
    // Če ni predmeta, ni potrebna validacija
    if (!podatki.predmet || podatki.predmet.trim().length === 0) {
      return { veljaven: true, opozorilo: '' };
    }

    // Če je predmet vnesen, preveri obvezna polja
    if (!podatki.material || !podatki.steviloKosov || !podatki.steviloPol || !podatki.kosovNaPoli) {
      return { 
        veljaven: false, 
        opozorilo: 'Vsa polja so obvezna, če je vnesen predmet' 
      };
    }

    const pol = parseInt(podatki.steviloPol);
    const kosovNaPoli = parseInt(podatki.kosovNaPoli);
    const skupnoKosov = parseInt(podatki.steviloKosov);
    const izracunano = pol * kosovNaPoli;
    const razlika = Math.abs(izracunano - skupnoKosov);

    if (razlika <= 3) {
      return { veljaven: true, opozorilo: '' };
    } else {
      return { 
        veljaven: false, 
        opozorilo: `⚠️ PAZI: preveri količino tiska! (${pol} pol × ${kosovNaPoli} kosov = ${izracunano}, vneseno: ${skupnoKosov})` 
      };
    }
  };

  const handleTiskChange = (tiskIndex: 1 | 2, polje: keyof TiskPodatki, vrednost: string | boolean) => {
    const setTisk = tiskIndex === 1 ? setTisk1 : setTisk2;
    const trenutniTisk = tiskIndex === 1 ? tisk1 : tisk2;
    
    setTisk(prev => {
      const noviTisk = { ...prev, [polje]: vrednost };

      if (polje === 'steviloPol') {
        setPolUserTouched((p) => ({ ...p, [tiskIndex]: true }));
      }
      
      // Kliči callback, če obstaja
      if (onTiskChange) {
        if (tiskIndex === 1) {
          onTiskChange(noviTisk, tisk2);
        } else {
          onTiskChange(tisk1, noviTisk);
        }
      }
      
      return noviTisk;
    });
  };

  const commitExpr = (tiskIndex: 1 | 2, polje: 'obseg' | 'steviloKosov' | 'steviloPol' | 'kosovNaPoli') => {
    const cur = tiskIndex === 1 ? tisk1 : tisk2;
    const raw = String((cur as any)?.[polje] ?? '');
    if (!/[+\-*/()]/.test(raw)) return;
    const n = safeEvalExpression(raw);
    if (n == null) return;
    const mode = (polje === 'steviloPol') ? 'ceil' : 'round';
    const v = formatInt(n, mode);
    if (!v) return;
    handleTiskChange(tiskIndex, polje as any, v);
  };

  const maybeAutoPol = (tiskIndex: 1 | 2) => {
    const cur = tiskIndex === 1 ? tisk1 : tisk2;
    const mutN = parseInt(String(cur.steviloMutacij || '1'), 10) || 1;
    if (mutN > 1) return;

    const k = safeEvalExpression(String(cur.steviloKosov || '').trim()) ?? Number(String(cur.steviloKosov || '').replace(',', '.'));
    const np = safeEvalExpression(String(cur.kosovNaPoli || '').trim()) ?? Number(String(cur.kosovNaPoli || '').replace(',', '.'));
    if (!Number.isFinite(k) || !Number.isFinite(np) || k <= 0 || np <= 0) return;

    const computed = Math.ceil(k / np);
    const currentPol = parseInt(String(cur.steviloPol || ''), 10);
    if (Number.isFinite(currentPol) && currentPol === computed) return;

    const next = String(computed);
    const shouldFlash = !!polUserTouched[tiskIndex] && String(cur.steviloPol || '').trim().length > 0;
    const setTisk = tiskIndex === 1 ? setTisk1 : setTisk2;
    setTisk(prev => {
      const noviTisk = { ...prev, steviloPol: next };
      if (onTiskChange) {
        if (tiskIndex === 1) onTiskChange(noviTisk, tisk2);
        else onTiskChange(tisk1, noviTisk);
      }
      return noviTisk;
    });
    if (shouldFlash) {
      setPolFlash((p) => ({ ...p, [tiskIndex]: true }));
      window.setTimeout(() => setPolFlash((p) => ({ ...p, [tiskIndex]: false })), 600);
    }
  };

  useEffect(() => {
    maybeAutoPol(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tisk1.steviloKosov, tisk1.kosovNaPoli, tisk1.steviloMutacij]);
  useEffect(() => {
    maybeAutoPol(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tisk2.steviloKosov, tisk2.kosovNaPoli, tisk2.steviloMutacij]);

  const handleMutacijeChange = (tiskIndex: 1 | 2, mutacije: Array<{ steviloPol: string }>) => {
    const setTisk = tiskIndex === 1 ? setTisk1 : setTisk2;
    const trenutniTisk = tiskIndex === 1 ? tisk1 : tisk2;
    
    setTisk(prev => {
      const noviTisk = { ...prev, mutacije };
      
      // Kliči callback, če obstaja
      if (onTiskChange) {
        if (tiskIndex === 1) {
          onTiskChange(noviTisk, tisk2);
        } else {
          onTiskChange(tisk1, noviTisk);
        }
      }
      
      return noviTisk;
    });
  };

  const renderTiskForm = (tiskIndex: 1 | 2, podatki: TiskPodatki) => {
    const validacija = validirajTisk(podatki);
    const naslov = `Tisk ${tiskIndex}`;
    const jePredmetVnesen = podatki.predmet && podatki.predmet.trim().length > 0;
    const casTiska = izracunajCasTiska(podatki);
    const zakljucenLocal = tiskIndex === 1 ? jeZakljucen1 : jeZakljucen2;

    return (
      <div className={`bg-white p-4 border rounded-lg shadow-sm ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-50 border-red-200' : ''}`}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800">{naslov}</h3>
          {casTiska > 0 && (
            <div className="text-sm font-medium text-blue-600">
              Čas tiska: {formatirajCas(casTiska)}
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Predmet */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Predmet
            </label>
            <input
              type="text"
              value={podatki.predmet}
              onChange={(e) => handleTiskChange(tiskIndex, 'predmet', e.target.value)}
              disabled={disabled}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
              placeholder="Vnesi predmet..."
            />
          </div>

          {/* Format */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Format
            </label>
            <input
              type="text"
              value={podatki.format}
              onChange={(e) => handleTiskChange(tiskIndex, 'format', e.target.value)}
              disabled={disabled}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
              placeholder="npr. A4, 210×297 mm"
            />
          </div>

          {/* Obseg + Mutacije + Število kosov (v eni vrsti) */}
          <div className="md:col-span-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Obseg */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Obseg - (število strani)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={podatki.obseg}
                  onChange={(e) => handleTiskChange(tiskIndex, 'obseg', e.target.value)}
                  onBlur={() => commitExpr(tiskIndex, 'obseg')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitExpr(tiskIndex, 'obseg'); (e.currentTarget as HTMLInputElement).blur(); }
                    if (e.key === 'Tab') commitExpr(tiskIndex, 'obseg');
                  }}
                  disabled={disabled}
                  className={`w-full px-2 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                  placeholder="npr. 8"
                />
              </div>
              {/* Mutacije */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mutacije
                </label>
                <input
                  type="number"
                  value={podatki.steviloMutacij}
                  onChange={(e) => {
                    const vrednost = e.target.value;
                    if (vrednost === '' || (parseInt(vrednost) >= 1 && parseInt(vrednost) <= 10)) {
                      const steviloMutacij = parseInt(vrednost) || 0;
                      // Ne briši že vpisanih vrednosti: ohrani obstoječe in samo razširi seznam, če je potrebno.
                      const obstojece = Array.isArray(podatki.mutacije) ? [...podatki.mutacije] : [];
                      const noveMutacije = [...obstojece];
                      while (noveMutacije.length < steviloMutacij) {
                        noveMutacije.push({ steviloPol: '' });
                      }
                      handleTiskChange(tiskIndex, 'steviloMutacij', vrednost);
                      handleMutacijeChange(tiskIndex, noveMutacije);
                      // Število pol naj sledi vsoti trenutno aktivnih mutacij
                      const aktivne = noveMutacije.slice(0, Math.max(0, steviloMutacij));
                      const skupnoPol = aktivne.reduce((sum, m) => sum + (parseInt(m?.steviloPol) || 0), 0);
                      handleTiskChange(tiskIndex, 'steviloPol', skupnoPol.toString());
                    }
                  }}
                  disabled={disabled}
                  className={`w-full px-2 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                  placeholder="1-10"
                  min="1"
                  max="10"
                />
              </div>
              {/* Število kosov */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Število kosov {jePredmetVnesen && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={podatki.steviloKosov}
                  onChange={(e) => handleTiskChange(tiskIndex, 'steviloKosov', e.target.value)}
                  onBlur={() => commitExpr(tiskIndex, 'steviloKosov')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitExpr(tiskIndex, 'steviloKosov'); (e.currentTarget as HTMLInputElement).blur(); }
                    if (e.key === 'Tab') commitExpr(tiskIndex, 'steviloKosov');
                  }}
                  disabled={disabled}
                  className={`w-full px-2 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* Material */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Material {jePredmetVnesen && <span className="text-red-500">*</span>}
            </label>
            <select
              value={podatki.material}
              onChange={(e) => handleTiskChange(tiskIndex, 'material', e.target.value)}
              disabled={disabled}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
            >
              <option value="">-- Izberi material --</option>
              <optgroup label="Papir">
                {MATERIALI.papir.map(material => (
                  <option key={material} value={material}>{material}</option>
                ))}
              </optgroup>
              <optgroup label="Strukturirani karton">
                {MATERIALI.strukturiraniKarton.map(material => (
                  <option key={material} value={material}>{material}</option>
                ))}
              </optgroup>
              <optgroup label="Embalažni karton">
                {MATERIALI.embalazniKarton.map(material => (
                  <option key={material} value={material}>{material}</option>
                ))}
              </optgroup>
              <optgroup label="Nalepke">
                {MATERIALI.nalepke.map(material => (
                  <option key={material} value={material}>{material}</option>
                ))}
              </optgroup>
              <optgroup label="Valoviti karton">
                {MATERIALI.valovitiKarton.slice(0, 6).map(material => (
                  <option key={material} value={material}>{material}</option>
                ))}
              </optgroup>
              <optgroup label="Plošče">
                {MATERIALI.valovitiKarton.slice(6, 16).map(material => (
                  <option key={material} value={material}>{material}</option>
                ))}
              </optgroup>
              <optgroup label="Ostalo">
                {MATERIALI.valovitiKarton.slice(16).map(material => (
                  <option key={material} value={material}>{material}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Barve */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Barve
            </label>
            <select
              value={podatki.barve}
              onChange={(e) => handleTiskChange(tiskIndex, 'barve', e.target.value)}
              disabled={disabled}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
            >
              <option value="">-- Izberi barve --</option>
              {BARVE.map(barva => (
                <option key={barva} value={barva}>{barva}</option>
              ))}
            </select>
          </div>

          {/* Dodatna polja za mutacije */}
          {parseInt(podatki.steviloMutacij) > 1 && (
            <div className="md:col-span-2">
              <div className="grid grid-cols-2 gap-2 p-3 border rounded-md bg-gray-50">
                {(Array.isArray(podatki.mutacije) ? podatki.mutacije.slice(0, parseInt(podatki.steviloMutacij) || 0) : []).map((mutacija, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                      Mutac{index + 1}/sig{index + 1}:
                    </label>
                    <input
                      type="number"
                      value={mutacija.steviloPol}
                      onChange={(e) => {
                        const noveMutacije = Array.isArray(podatki.mutacije) ? [...podatki.mutacije] : [];
                        while (noveMutacije.length <= index) {
                          noveMutacije.push({ steviloPol: '' });
                        }
                        noveMutacije[index].steviloPol = e.target.value;
                        handleMutacijeChange(tiskIndex, noveMutacije);
                        
                        // Izračunaj skupno število pol
                        const activeN = parseInt(podatki.steviloMutacij) || 0;
                        const skupnoPol = noveMutacije.slice(0, activeN).reduce((sum, m) => sum + (parseInt(m?.steviloPol) || 0), 0);
                        handleTiskChange(tiskIndex, 'steviloPol', skupnoPol.toString());
                      }}
                      disabled={disabled}
                      className="w-20 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="0"
                      min="0"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Število pol (prikazuje se vedno) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Število pol {jePredmetVnesen && <span className="text-red-500">*</span>}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={podatki.steviloPol}
              onChange={(e) => handleTiskChange(tiskIndex, 'steviloPol', e.target.value)}
              onBlur={() => commitExpr(tiskIndex, 'steviloPol')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitExpr(tiskIndex, 'steviloPol'); (e.currentTarget as HTMLInputElement).blur(); }
                if (e.key === 'Tab') commitExpr(tiskIndex, 'steviloPol');
              }}
              disabled={disabled}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${
                (polFlash[tiskIndex] ? 'bg-yellow-200' : (podatki.b2Format || podatki.b1Format ? 'bg-orange-50' : ''))
              } ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
              placeholder="0"
            />
          </div>

          {/* Število kosov na poli */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Število kosov na poli {jePredmetVnesen && <span className="text-red-500">*</span>}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={podatki.kosovNaPoli}
              onChange={(e) => handleTiskChange(tiskIndex, 'kosovNaPoli', e.target.value)}
              onBlur={() => commitExpr(tiskIndex, 'kosovNaPoli')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitExpr(tiskIndex, 'kosovNaPoli'); (e.currentTarget as HTMLInputElement).blur(); }
                if (e.key === 'Tab') commitExpr(tiskIndex, 'kosovNaPoli');
              }}
              disabled={disabled}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
              placeholder="0"
            />
          </div>
            <div className="flex gap-4 mt-2">
              <label className={`flex items-center gap-2 px-2 py-1 rounded ${podatki.b2Format ? 'bg-blue-50 ring-1 ring-blue-300 font-semibold text-blue-800' : ''}`}>
                <input
                  type="checkbox"
                  checked={podatki.b2Format}
                  onChange={(e) => handleTiskChange(tiskIndex, 'b2Format', e.target.checked)}
                  disabled={disabled}
                  className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-100 border-red-300' : ''}`}
                />
                <span className="text-sm">B2 format pole</span>
              </label>
              <label className={`flex items-center gap-2 px-2 py-1 rounded ${podatki.b1Format ? 'bg-blue-50 ring-1 ring-blue-300 font-semibold text-blue-800' : ''}`}>
                <input
                  type="checkbox"
                  checked={podatki.b1Format}
                  onChange={(e) => handleTiskChange(tiskIndex, 'b1Format', e.target.checked)}
                  disabled={disabled}
                  className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-100 border-red-300' : ''}`}
                />
                <span className="text-sm">B1 format pole</span>
              </label>
              <label className={`flex items-center gap-2 px-2 py-1 rounded ${podatki.collate ? 'bg-blue-50 ring-1 ring-blue-300 font-semibold text-blue-800' : ''}`}>
                <input
                  type="checkbox"
                  checked={podatki.collate}
                  onChange={(e) => handleTiskChange(tiskIndex, 'collate', e.target.checked)}
                  disabled={disabled}
                  className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-100 border-red-300' : ''}`}
                />
                <span className="text-sm">collate</span>
              </label>
            </div>

          {/* Kooperant */}
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={podatki.tiskaKooperant}
                onChange={(e) => handleTiskChange(tiskIndex, 'tiskaKooperant', e.target.checked)}
                disabled={disabled}
                className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-100 border-red-300' : ''}`}
              />
              <span className="text-sm font-medium">Tiska kooperant</span>
            </label>
            {podatki.tiskaKooperant && (
              <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 p-3 border rounded-md ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-100 border-red-300' : 'bg-blue-50 border-blue-200'}`}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kooperant
                  </label>
                  <input
                    type="text"
                    value={podatki.kooperant}
                    onChange={(e) => handleTiskChange(tiskIndex, 'kooperant', e.target.value)}
                    disabled={disabled}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                    placeholder="Ime kooperanta..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Predviden rok
                  </label>
                  <input
                    type="date"
                    value={podatki.rokKooperanta}
                    onChange={(e) => handleTiskChange(tiskIndex, 'rokKooperanta', e.target.value)}
                    disabled={disabled}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Znesek dodelave (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={podatki.znesekKooperanta}
                    onChange={(e) => handleTiskChange(tiskIndex, 'znesekKooperanta', e.target.value)}
                    disabled={disabled}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                    placeholder="0.00"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Validacija opozorilo */}
        {!validacija.veljaven && (
          <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {validacija.opozorilo}
          </div>
        )}

        {/* Kalkulacija info */}
        {podatki.steviloPol && podatki.kosovNaPoli && (
          <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-blue-700 text-sm">
            <strong>Kalkulacija:</strong> {podatki.steviloPol} pol × {podatki.kosovNaPoli} kosov = {parseInt(podatki.steviloPol) * parseInt(podatki.kosovNaPoli)} kosov
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-bold text-gray-900">Tisk</h2>
      
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-3 ${dobavljeno ? 'bg-[#e6f9f3] p-3 border border-[#b6e7d8] rounded-lg' : jeZakljucenOba ? 'bg-red-50 p-3 border border-red-200 rounded-lg' : ''}`}>
        {renderTiskForm(1, tisk1)}
        {renderTiskForm(2, tisk2)}
      </div>
    </div>
  );
};

export default TiskSekcija; 