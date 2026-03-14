import Dexie from 'dexie';
import type { Table } from 'dexie';

export interface NalogRow {
  stevilkaNaloga: number;
  datumNarocila?: string | null;
  rokIzdelave?: string | null;
  status?: string;
  podatki?: any;
  zakljucen?: boolean;
  tiskZakljucen1?: boolean;
  tiskZakljucen2?: boolean;
  dobavljeno?: boolean;
  datumShranjevanja?: string;
  year?: number;
}

class DelovniNalogDB extends Dexie {
  nalogi!: Table<NalogRow, number>;
  constructor() {
    super('delovniNalogDB');
    this.version(1).stores({
      nalogi: 'stevilkaNaloga, year, status'
    });
  }
}

export const db = new DelovniNalogDB();

function mapAnyRowToNalogRow(r: any): NalogRow | null {
    const toBool = (v: any) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
    const stevilka = (r?.StevilkaNaloga ?? r?.stevilkaNaloga ?? r?.DelovniNalogID ?? r?.nalog);
    const stevilkaNum = Number(stevilka);
    if (!Number.isFinite(stevilkaNum) || stevilkaNum <= 0) return null;

    // Normaliziraj "podatki" (SQL import pogosto vrne rok/stroski/dodelave izven `podatki` ali pod `podatki.dodelava`)
    const rawP = (r && r.podatki && typeof r.podatki === 'object') ? r.podatki : null;
    const p: any = rawP ? { ...rawP } : { ...(r || {}) };
    // Rok: App izračun uporablja `nalog.podatki.rokIzdelave`
    if (typeof p.rokIzdelave === 'undefined' && (r?.rokIzdelave || r?.RokIzdelave)) {
      p.rokIzdelave = r.rokIzdelave ?? r.RokIzdelave;
    }
    if (typeof p.rokIzdelaveUra === 'undefined' && (r?.rokIzdelaveUra || r?.RokIzdelaveUra)) {
      p.rokIzdelaveUra = r.rokIzdelaveUra ?? r.RokIzdelaveUra;
    }
    // Dodelave/stroški: pretvori nested shemo -> top-level, ker App uporablja `podatki.dodelava1/2` in `podatki.stroski1/2`
    if (!p.dodelava1 && p?.dodelava?.dodelava1) p.dodelava1 = p.dodelava.dodelava1;
    if (!p.dodelava2 && p?.dodelava?.dodelava2) p.dodelava2 = p.dodelava.dodelava2;
    if (!p.stroski1 && p?.stroski?.stroski1) p.stroski1 = p.stroski.stroski1;
    if (!p.stroski2 && p?.stroski?.stroski2) p.stroski2 = p.stroski.stroski2;
    const d =
      r?.podatki?.datumNarocila ??
      r?.DatumOdprtja ??
      r?.datumNarocila ??
      r?.Datum ??
      r?.podatki?.rokIzdelave ??
      r?.rokIzdelave ??
      r?.Rok ??
      null;
    const y = d ? new Date(d).getFullYear() : undefined;
    const dobavljenoBool = toBool(r?.dobavljeno) || toBool(r?.Dobavljeno);
    const tiskZaklj1Bool =
      toBool(r?.tiskZakljucen1) ||
      toBool(r?.TiskZakljucen1) ||
      toBool(r?.podatki?.TiskZakljucen1) ||
      toBool(r?.podatki?.tiskZakljucen1);
    const tiskZaklj2Bool =
      toBool(r?.tiskZakljucen2) ||
      toBool(r?.TiskZakljucen2) ||
      toBool(r?.podatki?.TiskZakljucen2) ||
      toBool(r?.podatki?.tiskZakljucen2);
    const tiskZakljBool =
      toBool(r?.zakljucen) ||
      toBool(r?.TiskZakljucen) ||
      (tiskZaklj1Bool && tiskZaklj2Bool) ||
      /zaklju/.test(String(r?.Status || '').toLowerCase());
    const computedStatus = dobavljenoBool
      ? 'dobavljeno'
      : (tiskZakljBool ? 'zaključen' : (r?.Status ?? r?.status ?? 'v_delu'));
    const mappedRow: NalogRow = {
      stevilkaNaloga: stevilkaNum,
      datumNarocila: d ? new Date(d).toISOString() : null,
      rokIzdelave: (r?.podatki?.rokIzdelave ?? r?.rokIzdelave ?? r?.RokIzdelave ?? null),
      status: computedStatus,
      podatki: p,
      zakljucen: tiskZakljBool,
      tiskZakljucen1: tiskZaklj1Bool,
      tiskZakljucen2: tiskZaklj2Bool,
      dobavljeno: dobavljenoBool,
      datumShranjevanja: r?.datumShranjevanja ?? new Date().toISOString(),
      year: y
    };
    return mappedRow;
}

function deepMergeSection(a: any, b: any) {
  const A = (a && typeof a === 'object') ? a : {};
  const B = (b && typeof b === 'object') ? b : {};
  // Merge, but do NOT overwrite with undefined (to prevents "partial" payloads from wiping fields)
  const out: any = { ...A };
  for (const k of Object.keys(B)) {
    const v = (B as any)[k];
    if (typeof v === 'undefined') continue;
    out[k] = v;
  }
  return out;
}

function deepMergeTisk(existingTisk: any, incomingTisk: any) {
  const e = (existingTisk && typeof existingTisk === 'object') ? existingTisk : {};
  const i = (incomingTisk && typeof incomingTisk === 'object') ? incomingTisk : {};
  const e1 = (e.tisk1 && typeof e.tisk1 === 'object') ? e.tisk1 : {};
  const e2 = (e.tisk2 && typeof e.tisk2 === 'object') ? e.tisk2 : {};
  const i1 = (i.tisk1 && typeof i.tisk1 === 'object') ? i.tisk1 : {};
  const i2 = (i.tisk2 && typeof i.tisk2 === 'object') ? i.tisk2 : {};
  return {
    ...deepMergeSection(e, i),
    tisk1: deepMergeSection(e1, i1),
    tisk2: deepMergeSection(e2, i2),
  };
}

function mergePodatkiPreserveExisting(existingP: any, incomingP: any) {
  const e = (existingP && typeof existingP === 'object') ? existingP : {};
  const i = (incomingP && typeof incomingP === 'object') ? incomingP : {};
  const merged = {
    ...e,
    ...i,
    // ključne sekcije merge-aj globlje (da "lite" payload ne pobriše polj, ki jih SQL ne vrača)
    kupec: deepMergeSection(e.kupec, i.kupec),
    kontakt: deepMergeSection(e.kontakt, i.kontakt),
    // tisk je nested (tisk1/tisk2) -> brez tega se lahko polovični payload prepiše čez stara polja (steviloPol/kosov)
    tisk: deepMergeTisk(e.tisk, i.tisk),
    dodelava1: deepMergeSection(e.dodelava1, i.dodelava1),
    dodelava2: deepMergeSection(e.dodelava2, i.dodelava2),
    stroski1: deepMergeSection(e.stroski1, i.stroski1),
    stroski2: deepMergeSection(e.stroski2, i.stroski2),
    posiljanje: deepMergeSection(e.posiljanje, i.posiljanje),
    komentar: (typeof i.komentar !== 'undefined') ? i.komentar : e.komentar,
  };
  // Posebna pravila: backend /full lahko vrne generične placeholder vrednosti (npr. 'vezava', 'izsek'),
  // kar bi prepisalo natančne FE izbire ('spirala', 'digitalni izsek', ...). Tu raje ohranimo obstoječe.
  try {
    const patchDodelava = (key: 'dodelava1' | 'dodelava2') => {
      const ed = (e as any)[key] && typeof (e as any)[key] === 'object' ? (e as any)[key] : {};
      const id = (i as any)[key] && typeof (i as any)[key] === 'object' ? (i as any)[key] : {};
      const md = (merged as any)[key] && typeof (merged as any)[key] === 'object' ? (merged as any)[key] : {};

      // izsek: če incoming je "izsek" (generično) ali prazno, ohrani existing
      const incomingIzsek = String(id?.izsek ?? md?.izsek ?? '').trim().toLowerCase();
      const existingIzsek = ed?.izsek;
      if ((incomingIzsek === 'izsek' || incomingIzsek === '') && typeof existingIzsek !== 'undefined') {
        md.izsek = existingIzsek;
      }
      // vezava: če incoming je "vezava" (generično) ali prazno, ohrani existing
      const incomingVezava = String(id?.vezava ?? md?.vezava ?? '').trim().toLowerCase();
      const existingVezava = ed?.vezava;
      if ((incomingVezava === 'vezava' || incomingVezava === '') && typeof existingVezava !== 'undefined') {
        md.vezava = existingVezava;
      }
      (merged as any)[key] = md;
    };
    patchDodelava('dodelava1');
    patchDodelava('dodelava2');
  } catch {}
  return merged;
}

export async function saveBatchToIndexedDB(rows: any[]) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const mapped: NalogRow[] = rows
    .map(mapAnyRowToNalogRow)
    .filter(Boolean) as any;
  if (mapped.length === 0) return;
  await db.nalogi.bulkPut(mapped);
}

// Varianta za "lite" payloade (npr. /api/delovni-nalog/:id), kjer ne želimo izgubiti lokalnih polj,
// ki jih SQL ne vrača (npr. dodatne dodelave: topli tisk, lepljenje, vrtanje luknje, ...).
export async function saveBatchToIndexedDBPreserveExisting(rows: any[]) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const mapped: NalogRow[] = rows
    .map(mapAnyRowToNalogRow)
    .filter(Boolean) as any;
  if (mapped.length === 0) return;

  const keys = mapped.map(m => m.stevilkaNaloga);
  const existingArr = await db.nalogi.bulkGet(keys).catch(() => [] as any[]);
  const merged = mapped.map((m, idx) => {
    const existing = existingArr?.[idx];
    if (existing && existing.podatki) {
      return { ...m, podatki: mergePodatkiPreserveExisting(existing.podatki, m.podatki) };
    }
    return m;
  });
  await db.nalogi.bulkPut(merged);
}

export async function loadByYearRange(yearMin: number | null) {
  const now = new Date().getFullYear();
  if (yearMin == null) {
    const all = await db.nalogi.toArray();
    return all.filter(r => Number(r?.stevilkaNaloga) > 0).sort((a, b) => Number(b.stevilkaNaloga) - Number(a.stevilkaNaloga));
  }
  const arr = await db.nalogi.where('year').between(yearMin, now, true, true).toArray();
  return arr.filter(r => Number(r?.stevilkaNaloga) > 0).sort((a, b) => Number(b.stevilkaNaloga) - Number(a.stevilkaNaloga));
}

export async function clearIndexedDB() {
  await db.nalogi.clear();
}

// Cleanup: odstrani pokvarjene zapise (npr. stevilkaNaloga=0)
export async function cleanupInvalidNalogi() {
  try {
    await db.nalogi.where('stevilkaNaloga').belowOrEqual(0).delete();
  } catch {}
}

// Posodobi snapshot kupca v vseh nalogih v IndexedDB (po KupecID)
export async function patchKupecInIndexedDB(kupecID: number, patch: any) {
  const id = Number(kupecID);
  if (!Number.isFinite(id) || id <= 0) return 0;
  const isDelete = patch === null;
  const safePatch = (patch && typeof patch === 'object') ? patch : {};
  let changed = 0;
  await db.nalogi.toCollection().modify((row: any) => {
    const p = row?.podatki || {};
    const k = p?.kupec || {};
    if (Number(k?.KupecID || 0) !== id) return;
    row.podatki = {
      ...p,
      kupec: isDelete ? null : { ...k, ...safePatch }
    };
    changed++;
  });
  return changed;
}


