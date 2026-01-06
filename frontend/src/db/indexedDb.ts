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

export async function saveBatchToIndexedDB(rows: any[]) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const mapped: NalogRow[] = rows.map((r: any) => {
    const toBool = (v: any) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
    const stevilka = (r?.StevilkaNaloga ?? r?.stevilkaNaloga ?? r?.DelovniNalogID ?? r?.nalog);
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
      stevilkaNaloga: Number(stevilka),
      datumNarocila: d ? new Date(d).toISOString() : null,
      rokIzdelave: (r?.podatki?.rokIzdelave ?? r?.rokIzdelave ?? r?.RokIzdelave ?? null),
      status: computedStatus,
      podatki: r?.podatki ?? r,
      zakljucen: tiskZakljBool,
      tiskZakljucen1: tiskZaklj1Bool,
      tiskZakljucen2: tiskZaklj2Bool,
      dobavljeno: dobavljenoBool,
      datumShranjevanja: r?.datumShranjevanja ?? new Date().toISOString(),
      year: y
    };
    return mappedRow;
  });
  await db.nalogi.bulkPut(mapped);
}

export async function loadByYearRange(yearMin: number | null) {
  const now = new Date().getFullYear();
  if (yearMin == null) {
    const all = await db.nalogi.toArray();
    return all.sort((a, b) => Number(b.stevilkaNaloga) - Number(a.stevilkaNaloga));
  }
  const arr = await db.nalogi.where('year').between(yearMin, now, true, true).toArray();
  return arr.sort((a, b) => Number(b.stevilkaNaloga) - Number(a.stevilkaNaloga));
}

export async function clearIndexedDB() {
  await db.nalogi.clear();
}


