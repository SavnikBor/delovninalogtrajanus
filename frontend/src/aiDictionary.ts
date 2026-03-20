// Enostaven slovar in helperji za normalizacijo iz besedila e-maila
// Namen: robustno ujemanje barvnosti tudi, ko AI polje manjka ali je nepredvidljivo

export function normalizeColorsFromText(text: string | undefined | null): string {
  if (!text) return '';
  const t = text.toLowerCase();
  // Eksaktni vzorci najprej
  if (/\b4\s*\/\s*4\b/.test(t) || /dvostrans|obojestrans/.test(t)) {
    return '4/4 barvno obojestransko (CMYK)';
  }
  if (/\b4\s*\/\s*0\b/.test(t) || (/enostrans/.test(t) && /barvn/.test(t))) {
    return '4/0 barvno enostransko (CMYK)';
  }
  if (/\b1\s*\/\s*1\b/.test(t)) {
    return '1/1 črno belo obojestransko (K)';
  }
  if (/\b1\s*\/\s*0\b/.test(t) || /črno|crno/.test(t)) {
    return '1/0 črno belo enostransko (K)';
  }
  return '';
}

// ---- Možne vrednosti iz UI (da dobimo EXACT match) ----

export const BARVE_OPTIONS = [
  '4/0 barvno enostransko (CMYK)',
  '4/4 barvno obojestransko (CMYK)',
  '1/0 črno belo enostransko (K)',
  '1/1 črno belo obojestransko (K)',
] as const;

// Kopija materialov iz `TiskSekcija.tsx` (flatten).
export const MATERIAL_OPTIONS: string[] = [
  // papir
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
  'mat premazni 350 g/m²',
  // strukturiraniKarton
  'Fedrigoni Old Mill 250 g/m²',
  'Fedrigoni Tintoreto Soho 300 g/m²',
  'Fedrigoni Materica Kraft 250 g/m²',
  'Fedrigoni Woodstock Betulla 285 g/m²',
  'Fedrigoni Nettuno Bianco Artico 280 g/m²',
  'Fedrigoni Sirio Pearl 300 g/m²',
  'Polypaper',
  // embalazniKarton
  'enostransko premazni karton 250 g/m²',
  'enostransko premazni karton 300 g/m²',
  'enostransko premazni karton 350 g/m²',
  // nalepke
  'nepremazna nalepka',
  'mat premazna nalepka',
  'lahko odstranljiva mat premazna nalepka',
  'bela PVC nalepka',
  'prozorna PVC nalepka',
  'Woodstock bettula nepremazna nalepka',
  // valovitiKarton + plošče + ostalo
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
  'Drugo-glej komentar',
];

export const UV_TISK_OPTIONS = [
  '4/0 barvno enostransko (CMYK)',
  '4/4 barvno obojestransko (CMYK)',
  '1/0 črno belo enostransko (K)',
  '1/1 črno belo obojestransko (K)',
  '4/0 + bela',
  '4/4 + bela',
  '1/0 + bela',
  '1/1 + bela',
] as const;

export const UV_LAK_OPTIONS = ['1/0 parcialno', '1/1 parcialno'] as const;
export const VEZAVA_OPTIONS = ['spirala', 'vezano z žico', 'broširano', 'šivano'] as const;
export const IZSEK_OPTIONS = ['digitalni izsek', 'digitalni zasek', 'klasični izsek', 'okroglenje vogalov'] as const;
export const PLASTIFIKACIJA_OPTIONS = [
  '1/0 mat',
  '1/0 sijaj',
  '1/1 mat',
  '1/1 sijaj',
  '1/0 soft touch',
  '1/0 anti scratch',
  '1/1 soft touch',
  '1/1 anti scratch',
] as const;
export const LEPLJENJE_SIRINE_OPTIONS = [
  'trak širine 6 mm',
  'trak širine 9 mm',
  'trak širine 19 mm',
  'vroče strojno lepljenje',
] as const;

// ---- Fuzzy matching helperji (brez novih dependencyjev) ----

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normBasic(s: string): string {
  return stripDiacritics((s || '').toLowerCase())
    .replace(/&/g, ' in ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(s: string): string[] {
  const t = normBasic(s);
  if (!t) return [];
  // odfiltriraj zelo kratke "šume"
  return t.split(/\s+/).filter(x => x.length >= 2);
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uni = A.size + B.size - inter;
  return uni > 0 ? inter / uni : 0;
}

export function bestMatchFromList(input: string | null | undefined, options: string[]): { match: string | null; score: number } {
  const q = (input || '').trim();
  if (!q) return { match: null, score: 0 };
  const qn = normBasic(q);
  const qTokens = tokenize(qn);
  let best: { match: string | null; score: number } = { match: null, score: 0 };
  for (const opt of options) {
    const on = normBasic(opt);
    const oTokens = tokenize(on);
    let score = jaccard(qTokens, oTokens);
    // substring boost
    if (qn && on.includes(qn)) score += 0.35;
    if (qn && qn.includes(on)) score += 0.25;
    // gramatura boost npr. "300g"
    const mg = q.match(/(\d{2,4})\s*g/i);
    if (mg && opt.includes(`${mg[1]} g/m²`)) score += 0.25;
    if (score > best.score) best = { match: opt, score };
  }
  return best;
}

export function normalizeMaterialFromText(input: string | null | undefined): string {
  const raw = (input || '').toString().trim();
  if (!raw) return '';

  // Stare sheme pogosto shranijo samo gramature ali "115 papir".
  // Hevristika: mapiraj na najbližji material iz dropdowna.
  const lower = raw.toLowerCase();
  const gOnly = raw.match(/^\s*(\d{2,4})\s*$/);
  const gPapir = raw.match(/(\d{2,4})\s*(?:g\b|g\/m2|g\/m²|g\/m\^2|g\/m\*2|papir)\b/i);
  const g = gOnly ? parseInt(gOnly[1], 10) : (gPapir ? parseInt(gPapir[1], 10) : null);
  if (g && Number.isFinite(g)) {
    // preferiraj tip po ključnih besedah, sicer "mat premazni"
    const prefer =
      /ivory/.test(lower) ? 'ivory' :
      (/brezlesni|nepremazni/.test(lower) ? 'brezlesni, nepremazni' :
      (/premazni|mat|sijaj/.test(lower) ? 'mat premazni' : 'mat premazni'));
    const candidates = MATERIAL_OPTIONS.filter((m) => m.includes(`${g} g/m²`) || m.includes(`${g} g/m2`));
    if (candidates.length) {
      const bestPref = candidates.find((m) => m.toLowerCase().includes(prefer));
      if (bestPref) return bestPref;
      return candidates[0];
    }
  }

  const { match, score } = bestMatchFromList(raw, MATERIAL_OPTIONS);
  return match && score >= 0.30 ? match : '';
}

export function normalizeDodelavaSelectFromText(
  input: string | null | undefined,
  options: readonly string[]
): string {
  const { match, score } = bestMatchFromList(input, [...options]);
  return match && score >= 0.35 ? match : '';
}

export function normalizeBooleanFromText(input: string | null | undefined, keywords: string[]): boolean | null {
  const t = normBasic(input || '');
  if (!t) return null;
  for (const k of keywords) {
    if (t.includes(normBasic(k))) return true;
  }
  return null;
}

// ---- Kupec fuzzy match (uporabi Naziv + domeno emaila) ----

export function bestKupecMatch(params: {
  query: string | null | undefined;
  emailText?: string | null | undefined;
  kupci: Array<{ KupecID?: number; Naziv?: string; email?: string }>;
}): { match: any | null; score: number; candidates: any[] } {
  const query = (params.query || '').trim();
  const kupci = Array.isArray(params.kupci) ? params.kupci : [];
  const emailText = params.emailText || '';
  const qTokens = tokenize(query);

  // izlušči domene (iz besedila + iz query, če vsebuje email)
  const domains = new Set<string>();
  const re = /[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(emailText)) !== null) {
    const dm = (m[1] || '').toLowerCase();
    if (dm) domains.add(dm);
  }
  if (query.includes('@')) {
    const dm = query.split('@')[1]?.toLowerCase();
    if (dm) domains.add(dm);
  }
  const sldSet = new Set<string>();
  for (const d of domains) {
    const parts = d.split('.');
    const sld = parts.length >= 2 ? parts[parts.length - 2] : '';
    if (sld) sldSet.add(sld);
  }

  let best: any = null;
  let bestScore = 0;
  const scored: Array<{ k: any; score: number }> = [];
  for (const k of kupci) {
    const naziv = (k?.Naziv || '').toString();
    if (!naziv) continue;
    const nTokens = tokenize(naziv);
    let score = jaccard(qTokens, nTokens);
    const qn = normBasic(query);
    const nn = normBasic(naziv);
    if (qn && nn.includes(qn)) score += 0.35;
    if (qn && qn.includes(nn)) score += 0.25;
    // domain boost
    const kEmail = (k as any)?.email ? String((k as any).email).toLowerCase() : '';
    const kDom = kEmail.includes('@') ? kEmail.split('@')[1] : '';
    if (kDom) {
      if (domains.has(kDom)) score += 0.45;
      const parts = kDom.split('.');
      const sld = parts.length >= 2 ? parts[parts.length - 2] : '';
      if (sld && sldSet.has(sld)) score += 0.25;
    } else {
      // če nimamo emaila v bazi, vseeno poskusi s SLD ujemanjem v nazivu
      for (const sld of sldSet) {
        if (nn.includes(sld)) {
          score += 0.15;
          break;
        }
      }
    }
    scored.push({ k, score });
    if (score > bestScore) {
      best = k;
      bestScore = score;
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return { match: bestScore >= 0.35 ? best : null, score: bestScore, candidates: scored.slice(0, 5).map(x => x.k) };
}



















