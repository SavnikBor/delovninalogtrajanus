import React, { useState, useRef, useMemo, useEffect } from 'react';
import { db, saveBatchToIndexedDB, saveBatchToIndexedDBPreserveExisting, loadByYearRange, clearIndexedDB, patchKupecInIndexedDB, cleanupInvalidNalogi } from './db/indexedDb';
import * as XLSX from 'xlsx';
import {
  bestKupecMatch,
  normalizeColorsFromText,
  normalizeDodelavaSelectFromText,
  normalizeMaterialFromText,
  MATERIAL_OPTIONS,
  BARVE_OPTIONS,
  UV_TISK_OPTIONS,
  UV_LAK_OPTIONS,
  VEZAVA_OPTIONS,
  IZSEK_OPTIONS,
  PLASTIFIKACIJA_OPTIONS,
  LEPLJENJE_SIRINE_OPTIONS,
} from './aiDictionary';
import DelovniNalogForm from './components/DelovniNalogForm';
import KupecSelect from './components/KupecSelect';
import TiskSekcija from './components/TiskSekcija';
import DodelavaSekcija from './components/DodelavaSekcija';
import StroskiSekcija from './components/StroskiSekcija';
import PosiljanjeSekcija from './components/PosiljanjeSekcija';
import KomentarPolje from './components/KomentarPolje';
import SeznamNaloga from './components/SeznamNaloga';
import PrioritetniNalogi from './components/PrioritetniNalogi';
import Analiza from './components/Analiza';
import KooperantiPregled from './components/KooperantiPregled';
import DostavaTiskovin from './components/DostavaTiskovin';
import Koledar from './components/Koledar';
import IzsekovalnaOrodja from './components/IzsekovalnaOrodja';

// Definicije tipov za podatke
interface NalogPodatki {
  kupec: any;
  kontakt?: any;
  tisk: any;
  dodelava1: any;
  dodelava2: any;
  stroski1: any;
  stroski2: any;
  posiljanje: any;
  komentar: any;
  // Datuma za izvoz (nastavita se ob kliku na checkbox)
  tiskZakljucenAt?: string;
  dobavljenoAt?: string;
  reklamacija?: {
    aktivna: boolean;
    vrsta: 'tisk' | 'dodelava' | 'priprava' | 'stranka' | '';
    znesek?: string;
  };
  stevilkaNaloga?: number;
  rokIzdelave?: string;
  rokIzdelaveUra?: string;
  datumNarocila?: string;
  emailPoslan: boolean;
  zakljucekEmailPoslan: boolean;
  // Email: indikatorji + "ponujeno" (da se avtomatski predogled pokaže le enkrat)
  odprtjeEmailPonujen?: boolean;
  zakljucekEmailPonujen?: boolean;
}

// Dodaj nove tipe in funkcije za prioritetne naloge
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

interface CenikPendingImport {
  importId: string;
  receivedAt: string;
  source: string;
  status: string;
  warnings: string[];
  predmet: string;
  rokIzdelave: string;
  rokIzdelaveUra: string | null;
  kolicina: string;
}

// Helperji za localStorage
const LOCALSTORAGE_KEY = 'delovniNalogi';

function normalizeNalogFromStorage(n: any): any {
  try {
    const out: any = (n && typeof n === 'object') ? { ...n } : {};
    const p: any = (out.podatki && typeof out.podatki === 'object') ? { ...out.podatki } : {};

    // Back-compat: veliko starejših zapisov je imelo polja na top-level (tisk/dodelave/stroški/...),
    // izračun časov pa uporablja `nalog.podatki.*`.
    const copyIfMissing = (key: string) => {
      if (typeof p[key] === 'undefined' && typeof out[key] !== 'undefined') p[key] = out[key];
    };
    copyIfMissing('kupec');
    copyIfMissing('kontakt');
    copyIfMissing('tisk');
    copyIfMissing('dodelava1');
    copyIfMissing('dodelava2');
    copyIfMissing('stroski1');
    copyIfMissing('stroski2');
    copyIfMissing('posiljanje');
    copyIfMissing('komentar');
    copyIfMissing('rokIzdelave');
    copyIfMissing('rokIzdelaveUra');
    copyIfMissing('datumNarocila');

    // Back-compat: nested sheme (dodelava/stroski)
    if (!p.dodelava1 && p?.dodelava?.dodelava1) p.dodelava1 = p.dodelava.dodelava1;
    if (!p.dodelava2 && p?.dodelava?.dodelava2) p.dodelava2 = p.dodelava.dodelava2;
    if (!p.stroski1 && p?.stroski?.stroski1) p.stroski1 = p.stroski.stroski1;
    if (!p.stroski2 && p?.stroski?.stroski2) p.stroski2 = p.stroski.stroski2;

    out.podatki = p;
    return out;
  } catch {
    return n;
  }
}

function preberiNalogeIzLocalStorage(): any[] {
  const data = localStorage.getItem(LOCALSTORAGE_KEY);
  if (!data) return [];
  try {
    const parsed = JSON.parse(data);
    const arr = Array.isArray(parsed) ? parsed : [];
    // Cleanup: odstrani pokvarjene zapise (npr. stevilkaNaloga=0), da ne vplivajo na prioritete
    const cleaned = arr
      .filter((n: any) => Number(n?.stevilkaNaloga) > 0)
      .map(normalizeNalogFromStorage);
    // Persist nazaj (da se po refreshu vedno pravilno prikažejo dodelave brez ponovnega shranjevanja)
    try { localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(cleaned)); } catch {}
    return cleaned;
  } catch {
    return [];
  }
}

function shraniNalogeVLokalno(nalogi: any[]): void {
  // Pri velikem številu nalogov lahko localStorage preseže quota -> to ne sme blokirati SQL/IndexedDB shranjevanja.
  try {
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(nalogi));
  } catch (e) {
    console.warn('Opozorilo: localStorage shranjevanje ni uspelo (quota?). Nadaljujem brez localStorage.', e);
  }
}

function generirajNaslednjoStevilko(nalogi: any[]): number {
  if (!nalogi.length) return 65001;
  return Math.max(...nalogi.map((n: any) => n.stevilkaNaloga || 0)) + 1;
}

// Helper za preverjanje ali je nalog prazen
function jeNalogPrazen(nalog: any): boolean {
  return !nalog || Object.values(nalog).every(v => v === null || v === '' || (typeof v === 'object' && jeNalogPrazen(v)));
}

// Funkcija za preverjanje, ali je datum delovni dan (pon-pet)
const jeDelovniDan = (datum: Date): boolean => {
  const dan = datum.getDay();
  return dan >= 1 && dan <= 5; // 1 = ponedeljek, 5 = petek
};

// Funkcija za pridobitev naslednjega delovnega dne
const naslednjiDelovniDan = (datum: Date): Date => {
  const naslednjiDan = new Date(datum);
  naslednjiDan.setDate(naslednjiDan.getDate() + 1);
  
  while (!jeDelovniDan(naslednjiDan)) {
    naslednjiDan.setDate(naslednjiDan.getDate() + 1);
  }
  
  return naslednjiDan;
};

// Funkcija za izračun delovnih ur med dvema datumoma
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

// Funkcija za pridobitev začetka dela naslednjega delovnega dne
const zacetekDelaNaslednjegaDne = (datum: Date): Date => {
  const naslednjiDan = naslednjiDelovniDan(datum);
  naslednjiDan.setHours(7, 0, 0, 0); // Začetek dela ob 7:00
  return naslednjiDan;
};

// Funkcija za izračun prioritete naloga
const izracunajPrioriteto = (nalog: any): PrioritetaNaloga => {
  const initCasSekcije = (): CasSekcije => ({
    tisk: 0,
    uvTisk: 0,
    plastifikacija: 0,
    uvLak: 0,
    izsek: 0,
    razrez: 0,
    topliTisk: 0,
    biganje: 0,
    biganjeRocnoZgibanje: 0,
    zgibanje: 0,
    lepljenje: 0,
    lepljenjeBlokov: 0,
    vezava: 0,
    vrtanjeLuknje: 0,
    perforacija: 0,
    dodatno: 0,
    kooperanti: 0,
    skupaj: 0
  });

  // Inicializacija časov sekcij (skupno + po pozicijah)
  const casSekcije: CasSekcije = initCasSekcije();
  const casSekcije1: CasSekcije = initCasSekcije();
  const casSekcije2: CasSekcije = initCasSekcije();
  
  // Izračun časa za tisk
  if (nalog.podatki?.tisk?.tisk1?.predmet) {
    const steviloPol = parseInt(nalog.podatki.tisk.tisk1.steviloPol) || 0;
    const format = nalog.podatki.tisk.tisk1.format || '';
    const barve = nalog.podatki.tisk.tisk1.barve || '';
    const b2Format = nalog.podatki.tisk.tisk1.b2Format || false;
    const b1Format = nalog.podatki.tisk.tisk1.b1Format || false;
    
    const tiskaKooperant = nalog.podatki.tisk.tisk1.tiskaKooperant || false;
    // Po novih pravilih: če je B1/B2 ali kooperant, časa tiska ne računamo.
    if (!b2Format && !b1Format && !tiskaKooperant) {
      let casTiska = 0;
      if (barve === '4/0 barvno enostransko (CMYK)') {
        casTiska = Math.ceil(steviloPol / 2000 * 10) / 10;
      } else if (barve === '4/4 barvno obojestransko (CMYK)') {
        casTiska = Math.ceil(steviloPol / 1200 * 10) / 10;
      } else if (barve === '1/0 črno belo enostransko (K)') {
        casTiska = Math.ceil(steviloPol / 5000 * 10) / 10;
      } else if (barve === '1/1 črno belo obojestransko (K)') {
        casTiska = Math.ceil(steviloPol / 2500 * 10) / 10;
      }
      casSekcije.tisk += casTiska;
      casSekcije1.tisk += casTiska;
    }
  }
  
  if (nalog.podatki?.tisk?.tisk2?.predmet) {
    const steviloPol = parseInt(nalog.podatki.tisk.tisk2.steviloPol) || 0;
    const format = nalog.podatki.tisk.tisk2.format || '';
    const barve = nalog.podatki.tisk.tisk2.barve || '';
    const b2Format = nalog.podatki.tisk.tisk2.b2Format || false;
    const b1Format = nalog.podatki.tisk.tisk2.b1Format || false;
    
    const tiskaKooperant = nalog.podatki.tisk.tisk2.tiskaKooperant || false;
    if (!b2Format && !b1Format && !tiskaKooperant) {
      let casTiska = 0;
      if (barve === '4/0 barvno enostransko (CMYK)') {
        casTiska = Math.ceil(steviloPol / 2000 * 10) / 10;
      } else if (barve === '4/4 barvno obojestransko (CMYK)') {
        casTiska = Math.ceil(steviloPol / 1200 * 10) / 10;
      } else if (barve === '1/0 črno belo enostransko (K)') {
        casTiska = Math.ceil(steviloPol / 5000 * 10) / 10;
      } else if (barve === '1/1 črno belo obojestransko (K)') {
        casTiska = Math.ceil(steviloPol / 2500 * 10) / 10;
      }
      casSekcije.tisk += casTiska;
      casSekcije2.tisk += casTiska;
    }
  }
  
  // Izračun časa za dodelave
  if (nalog.podatki?.dodelava1) {
    const dodelava1 = nalog.podatki.dodelava1;
    const steviloPol1 = parseInt(nalog.podatki.tisk?.tisk1?.steviloPol) || 0;
    const b2Format1 = nalog.podatki.tisk?.tisk1?.b2Format || false;
    const b1Format1 = nalog.podatki.tisk?.tisk1?.b1Format || false;
    
    // Dodelava: razrez
    if (dodelava1.razrez) {
      const casRazreza = (steviloPol1 / 100) / 15;
      casSekcije.razrez += Math.round(casRazreza * 1000) / 1000;
      casSekcije1.razrez += Math.round(casRazreza * 1000) / 1000;
    }
    
    // UV tisk
    if (dodelava1.uvTisk && dodelava1.uvTisk !== 'brez') {
      let casUvTiska = Math.ceil((steviloPol1 / 12) * 10) / 10;
      casSekcije.uvTisk += casUvTiska;
      casSekcije1.uvTisk += casUvTiska;
    }
    
    // Plastifikacija
    if (dodelava1.plastifikacija && dodelava1.plastifikacija !== 'brez') {
      let casPlastifikacije = 0;
      const je1_1 = dodelava1.plastifikacija.includes('1/1');
      
      if (!b2Format1 && !b1Format1) {
        // Standardna plastifikacija
        casPlastifikacije = Math.ceil(steviloPol1 * 0.33 / (3.5 * 60) * 10) / 10;
      } else if (b2Format1 && !b1Format1) {
        // B2 format pole
        casPlastifikacije = Math.ceil(steviloPol1 * 0.72 / (3.5 * 60) * 10) / 10;
      } else if (b1Format1) {
        // B1 format pole
        casPlastifikacije = Math.ceil(steviloPol1 * 1.02 / (3.5 * 60) * 10) / 10;
      }
      
      // Če je 1/1, pomnoži z 2
      if (je1_1) {
        casPlastifikacije *= 2;
      }
      
      casSekcije.plastifikacija += casPlastifikacije;
      casSekcije1.plastifikacija += casPlastifikacije;
    }
    
    // 3D UV lakiranje
    if (dodelava1.uvLak && dodelava1.uvLak !== 'brez') {
      let casUvLaka = 0;
      const je1_1 = dodelava1.uvLak.includes('1/1');
      
      if (!b2Format1 && !b1Format1) {
        // Standardni format
        casUvLaka = Math.ceil(steviloPol1 / 500 * 10) / 10;
      } else if (b2Format1 && !b1Format1) {
        // B2 format pole
        casUvLaka = Math.ceil(steviloPol1 / 280 * 10) / 10;
      }
      
      // Če je 1/1, pomnoži z 2
      if (je1_1) {
        casUvLaka *= 2;
      }
      
      casSekcije.uvLak += casUvLaka;
      casSekcije1.uvLak += casUvLaka;
    }
    
    // Dodelava: izsek/zasek
    if (dodelava1.izsek && dodelava1.izsek !== 'brez') {
      let casIzseka = 0;
      const steviloKosov1 = parseInt(nalog.podatki.tisk?.tisk1?.steviloKosov) || 0;
      
      if (dodelava1.izsek === 'digitalni izsek' || dodelava1.izsek === 'digitalni zasek') {
        if (!b2Format1 && !b1Format1) {
          casIzseka = Math.ceil(steviloPol1 / 60 * 10) / 10;
        } else if (b2Format1 && !b1Format1) {
          casIzseka = Math.ceil(steviloPol1 / 35 * 10) / 10;
        } else if (b1Format1) {
          casIzseka = Math.ceil(steviloPol1 / 20 * 10) / 10;
        }
      } else if (dodelava1.izsek === 'klasični izsek') {
        const imaOrodje = !!String(dodelava1.stevilkaOrodja || '').trim();
        casIzseka = imaOrodje
          ? Math.ceil((0.5 + steviloPol1 / 1000) * 10) / 10
          : Math.ceil((8 + 0.5 + steviloPol1 / 1000) * 10) / 10;
      } else if (dodelava1.izsek === 'okroglenje vogalov') {
        casIzseka = Math.ceil(((steviloKosov1 / 30) * 0.05) * 10) / 10;
      } else if (dodelava1.izsek === 'izsek') {
        // Opomba: ta varianta "izsek" se po novih pravilih ne uporablja (čas = 0).
        casIzseka = 0;
      }
      
      casSekcije.izsek += casIzseka;
      casSekcije1.izsek += casIzseka;
    }
    
    // Topli tisk, reliefni tisk, globoki tisk
    if (dodelava1.topliTisk && dodelava1.topliTisk !== 'brez') {
      const steviloKosov1 = parseInt(nalog.podatki.tisk?.tisk1?.steviloKosov) || 0;
      const obstojeciKlise = !!(dodelava1.obstojeciKlise);
      const casTopliTiska = obstojeciKlise
        ? Math.ceil((1 + steviloKosov1 / 500) * 10) / 10   // imamo kliše (checked) -> krajši
        : Math.ceil((8 + 1 + steviloKosov1 / 500) * 10) / 10; // nimamo -> daljši
      casSekcije.topliTisk += casTopliTiska;
      casSekcije1.topliTisk += casTopliTiska;
    }
    
    // Biganje
    if (dodelava1.biganje) {
      const steviloKosov1 = parseInt(nalog.podatki.tisk?.tisk1?.steviloKosov) || 0;
      const casBiganja = Math.ceil(steviloKosov1 / 1000 * 10) / 10;
      casSekcije.biganje += casBiganja;
      casSekcije1.biganje += casBiganja;
    }
    
    // Biganje + ročno zgibanje
    if (dodelava1.biganjeRocnoZgibanje) {
      const steviloKosov1 = parseInt(nalog.podatki.tisk?.tisk1?.steviloKosov) || 0;
      const casBiganjaRocnoZgibanja = Math.ceil(steviloKosov1 / 1000 + steviloKosov1 / 500 * 10) / 10;
      casSekcije.biganjeRocnoZgibanje += casBiganjaRocnoZgibanja;
      casSekcije1.biganjeRocnoZgibanje += casBiganjaRocnoZgibanja;
    }
    
    // Zgibanje
    if (dodelava1.zgibanje) {
      const steviloKosov1 = parseInt(nalog.podatki.tisk?.tisk1?.steviloKosov) || 0;
      const casZgibanja = Math.ceil(steviloKosov1 / 10000 * 10) / 10;
      casSekcije.zgibanje += casZgibanja;
      casSekcije1.zgibanje += casZgibanja;
    }
    
    // Lepljenje lepilnega traku
    if (dodelava1.lepljenje) {
      const steviloKosov1 = parseInt(nalog.podatki.tisk?.tisk1?.steviloKosov) || 0;
      const steviloLepilnihMest = parseInt(dodelava1.lepljenjeMesta) || 1;
      let casLepljenja = 0;
      
      if (dodelava1.lepljenjeSirina === 'vroče strojno lepljenje') {
        casLepljenja = Math.ceil((2 + (steviloKosov1 / 5000)) * 10) / 10;
      } else {
        // Za trak širine 6, 9 ali 19 mm
        casLepljenja = Math.ceil(0.1 + (steviloKosov1 * (15 / 3600)) * steviloLepilnihMest * 10) / 10;
      }
      casSekcije.lepljenje += casLepljenja;
      casSekcije1.lepljenje += casLepljenja;
    }
    
    // Lepljenje blokov
    if (dodelava1.lepljenjeBlokov) {
      const steviloKosov1 = parseInt(nalog.podatki.tisk?.tisk1?.steviloKosov) || 0;
      const casLepljenjaBlokov = Math.ceil(1 * (steviloKosov1 / (2 * 27)) * 10) / 10;
      casSekcije.lepljenjeBlokov += casLepljenjaBlokov;
      casSekcije1.lepljenjeBlokov += casLepljenjaBlokov;
    }
    
    // Vezava
    if (dodelava1.vezava && dodelava1.vezava !== 'brez') {
      const steviloKosov1 = parseInt(nalog.podatki.tisk?.tisk1?.steviloKosov) || 0;
      let casVezave = 0;
      
      if (dodelava1.vezava === 'spirala') {
        casVezave = Math.ceil(steviloKosov1 / 100 * 10) / 10;
      } else if (dodelava1.vezava === 'vezano z žico') {
        casVezave = Math.ceil(steviloKosov1 / 50 * 10) / 10;
      } else if (dodelava1.vezava === 'broširano') {
        casVezave = Math.ceil(steviloKosov1 / 200 * 10) / 10;
      } else if (dodelava1.vezava === 'trda vezava' || dodelava1.vezava === 'šivano') {
        casVezave = Math.ceil(steviloKosov1 / 100 * 10) / 10;
      }
      casSekcije.vezava += casVezave;
      casSekcije1.vezava += casVezave;
    }
    
    // Vrtanje luknje
    if (dodelava1.vrtanjeLuknje) {
      const steviloKosov1 = parseInt(nalog.podatki.tisk?.tisk1?.steviloKosov) || 0;
      const casVrtanja = Math.ceil(steviloKosov1 / 1000 * 10) / 10;
      casSekcije.vrtanjeLuknje += casVrtanja;
      casSekcije1.vrtanjeLuknje += casVrtanja;
    }
    
    // Perforacija
    if (dodelava1.perforacija) {
      const casPerforacije = 0.5 + (steviloPol1 / 1000);
      casSekcije.perforacija += Math.round(casPerforacije * 1000) / 1000;
      casSekcije1.perforacija += Math.round(casPerforacije * 1000) / 1000;
    }

    // Dodatno (Drugo) – ročno vnešen čas (v urah)
    if (dodelava1.drugo) {
      const cas = Number(String(dodelava1.drugoCas || '').replace(',', '.'));
      if (Number.isFinite(cas) && cas > 0) casSekcije.dodatno += cas;
      if (Number.isFinite(cas) && cas > 0) casSekcije1.dodatno += cas;
    }
  }
  
  // Izračun časa za dodelave 2
  if (nalog.podatki?.dodelava2) {
    const dodelava2 = nalog.podatki.dodelava2;
    const steviloPol2 = parseInt(nalog.podatki.tisk?.tisk2?.steviloPol) || 0;
    const b2Format2 = nalog.podatki.tisk?.tisk2?.b2Format || false;
    const b1Format2 = nalog.podatki.tisk?.tisk2?.b1Format || false;
    
    // Dodelava: razrez
    if (dodelava2.razrez) {
      const casRazreza = (steviloPol2 / 100) / 15;
      casSekcije.razrez += Math.round(casRazreza * 1000) / 1000;
      casSekcije2.razrez += Math.round(casRazreza * 1000) / 1000;
    }
    
    // UV tisk
    if (dodelava2.uvTisk && dodelava2.uvTisk !== 'brez') {
      let casUvTiska = Math.ceil((steviloPol2 / 12) * 10) / 10;
      casSekcije.uvTisk += casUvTiska;
      casSekcije2.uvTisk += casUvTiska;
    }
    
    // Plastifikacija
    if (dodelava2.plastifikacija && dodelava2.plastifikacija !== 'brez') {
      let casPlastifikacije = 0;
      const je1_1 = dodelava2.plastifikacija.includes('1/1');
      
      if (!b2Format2 && !b1Format2) {
        // Standardna plastifikacija
        casPlastifikacije = Math.ceil(steviloPol2 * 0.33 / (3.5 * 60) * 10) / 10;
      } else if (b2Format2 && !b1Format2) {
        // B2 format pole
        casPlastifikacije = Math.ceil(steviloPol2 * 0.72 / (3.5 * 60) * 10) / 10;
      } else if (b1Format2) {
        // B1 format pole
        casPlastifikacije = Math.ceil(steviloPol2 * 1.02 / (3.5 * 60) * 10) / 10;
      }
      
      // Če je 1/1, pomnoži z 2
      if (je1_1) {
        casPlastifikacije *= 2;
      }
      
      casSekcije.plastifikacija += casPlastifikacije;
      casSekcije2.plastifikacija += casPlastifikacije;
    }
    
    // 3D UV lakiranje
    if (dodelava2.uvLak && dodelava2.uvLak !== 'brez') {
      let casUvLaka = 0;
      const je1_1 = dodelava2.uvLak.includes('1/1');
      
      if (!b2Format2 && !b1Format2) {
        // Standardni format
        casUvLaka = Math.ceil(steviloPol2 / 500 * 10) / 10;
      } else if (b2Format2 && !b1Format2) {
        // B2 format pole
        casUvLaka = Math.ceil(steviloPol2 / 280 * 10) / 10;
      }
      
      // Če je 1/1, pomnoži z 2
      if (je1_1) {
        casUvLaka *= 2;
      }
      
      casSekcije.uvLak += casUvLaka;
      casSekcije2.uvLak += casUvLaka;
    }
    
    // Dodelava: izsek/zasek
    if (dodelava2.izsek && dodelava2.izsek !== 'brez') {
      let casIzseka = 0;
      const steviloKosov2 = parseInt(nalog.podatki.tisk?.tisk2?.steviloKosov) || 0;
      
      if (dodelava2.izsek === 'digitalni izsek' || dodelava2.izsek === 'digitalni zasek') {
        if (!b2Format2 && !b1Format2) {
          casIzseka = Math.ceil(steviloPol2 / 60 * 10) / 10;
        } else if (b2Format2 && !b1Format2) {
          casIzseka = Math.ceil(steviloPol2 / 35 * 10) / 10;
        } else if (b1Format2) {
          casIzseka = Math.ceil(steviloPol2 / 20 * 10) / 10;
        }
      } else if (dodelava2.izsek === 'klasični izsek') {
        const imaOrodje = !!String(dodelava2.stevilkaOrodja || '').trim();
        casIzseka = imaOrodje
          ? Math.ceil((0.5 + steviloPol2 / 1000) * 10) / 10
          : Math.ceil((8 + 0.5 + steviloPol2 / 1000) * 10) / 10;
      } else if (dodelava2.izsek === 'okroglenje vogalov') {
        casIzseka = Math.ceil(((steviloKosov2 / 30) * 0.05) * 10) / 10;
      } else if (dodelava2.izsek === 'izsek') {
        casIzseka = 0;
      }
      
      casSekcije.izsek += casIzseka;
      casSekcije2.izsek += casIzseka;
    }
    
    // Topli tisk, reliefni tisk, globoki tisk
    if (dodelava2.topliTisk && dodelava2.topliTisk !== 'brez') {
      const steviloKosov2 = parseInt(nalog.podatki.tisk?.tisk2?.steviloKosov) || 0;
      const obstojeciKlise = !!(dodelava2.obstojeciKlise);
      const casTopliTiska = obstojeciKlise
        ? Math.ceil((1 + steviloKosov2 / 500) * 10) / 10   // imamo kliše -> krajši
        : Math.ceil((8 + 1 + steviloKosov2 / 500) * 10) / 10; // nimamo -> daljši
      casSekcije.topliTisk += casTopliTiska;
      casSekcije2.topliTisk += casTopliTiska;
    }
    
    // Biganje
    if (dodelava2.biganje) {
      const steviloKosov2 = parseInt(nalog.podatki.tisk?.tisk2?.steviloKosov) || 0;
      const casBiganja = Math.ceil(steviloKosov2 / 1000 * 10) / 10;
      casSekcije.biganje += casBiganja;
      casSekcije2.biganje += casBiganja;
    }
    
    // Biganje + ročno zgibanje
    if (dodelava2.biganjeRocnoZgibanje) {
      const steviloKosov2 = parseInt(nalog.podatki.tisk?.tisk2?.steviloKosov) || 0;
      const casBiganjaRocnoZgibanja = Math.ceil(steviloKosov2 / 1000 + steviloKosov2 / 500 * 10) / 10;
      casSekcije.biganjeRocnoZgibanje += casBiganjaRocnoZgibanja;
      casSekcije2.biganjeRocnoZgibanje += casBiganjaRocnoZgibanja;
    }
    
    // Zgibanje
    if (dodelava2.zgibanje) {
      const steviloKosov2 = parseInt(nalog.podatki.tisk?.tisk2?.steviloKosov) || 0;
      const casZgibanja = Math.ceil(steviloKosov2 / 10000 * 10) / 10;
      casSekcije.zgibanje += casZgibanja;
      casSekcije2.zgibanje += casZgibanja;
    }
    
    // Lepljenje lepilnega traku
    if (dodelava2.lepljenje) {
      const steviloKosov2 = parseInt(nalog.podatki.tisk?.tisk2?.steviloKosov) || 0;
      const steviloLepilnihMest = parseInt(dodelava2.lepljenjeMesta) || 1;
      let casLepljenja = 0;
      
      if (dodelava2.lepljenjeSirina === 'vroče strojno lepljenje') {
        casLepljenja = Math.ceil((2 + (steviloKosov2 / 5000)) * 10) / 10;
      } else {
        // Za trak širine 6, 9 ali 19 mm
        casLepljenja = Math.ceil(0.1 + (steviloKosov2 * (15 / 3600)) * steviloLepilnihMest * 10) / 10;
      }
      casSekcije.lepljenje += casLepljenja;
      casSekcije2.lepljenje += casLepljenja;
    }
    
    // Lepljenje blokov
    if (dodelava2.lepljenjeBlokov) {
      const steviloKosov2 = parseInt(nalog.podatki.tisk?.tisk2?.steviloKosov) || 0;
      const casLepljenjaBlokov = Math.ceil(1 * (steviloKosov2 / (2 * 27)) * 10) / 10;
      casSekcije.lepljenjeBlokov += casLepljenjaBlokov;
      casSekcije2.lepljenjeBlokov += casLepljenjaBlokov;
    }
    
    // Vezava
    if (dodelava2.vezava && dodelava2.vezava !== 'brez') {
      const steviloKosov2 = parseInt(nalog.podatki.tisk?.tisk2?.steviloKosov) || 0;
      let casVezave = 0;
      
      if (dodelava2.vezava === 'spirala') {
        casVezave = Math.ceil(steviloKosov2 / 100 * 10) / 10;
      } else if (dodelava2.vezava === 'vezano z žico') {
        casVezave = Math.ceil(steviloKosov2 / 50 * 10) / 10;
      } else if (dodelava2.vezava === 'broširano') {
        casVezave = Math.ceil(steviloKosov2 / 200 * 10) / 10;
      } else if (dodelava2.vezava === 'trda vezava' || dodelava2.vezava === 'šivano') {
        casVezave = Math.ceil(steviloKosov2 / 100 * 10) / 10;
      }
      casSekcije.vezava += casVezave;
      casSekcije2.vezava += casVezave;
    }
    
    // Vrtanje luknje
    if (dodelava2.vrtanjeLuknje) {
      const steviloKosov2 = parseInt(nalog.podatki.tisk?.tisk2?.steviloKosov) || 0;
      const casVrtanja = Math.ceil(steviloKosov2 / 1000 * 10) / 10;
      casSekcije.vrtanjeLuknje += casVrtanja;
      casSekcije2.vrtanjeLuknje += casVrtanja;
    }
    
    // Perforacija
    if (dodelava2.perforacija) {
      const casPerforacije = 0.5 + (steviloPol2 / 1000);
      casSekcije.perforacija += Math.round(casPerforacije * 1000) / 1000;
      casSekcije2.perforacija += Math.round(casPerforacije * 1000) / 1000;
    }

    // Dodatno (Drugo) – ročno vnešen čas (v urah)
    if (dodelava2.drugo) {
      const cas = Number(String(dodelava2.drugoCas || '').replace(',', '.'));
      if (Number.isFinite(cas) && cas > 0) casSekcije.dodatno += cas;
      if (Number.isFinite(cas) && cas > 0) casSekcije2.dodatno += cas;
    }
  }
  
  // Izračun skupnega časa izdelave (dodelave + tisk)
  const skupniCasIzdelave = casSekcije.tisk + casSekcije.uvTisk + casSekcije.plastifikacija + 
                            casSekcije.uvLak + casSekcije.izsek + casSekcije.razrez + 
                            casSekcije.topliTisk + casSekcije.biganje + casSekcije.biganjeRocnoZgibanje + 
                            casSekcije.zgibanje + casSekcije.lepljenje + casSekcije.lepljenjeBlokov + 
                            casSekcije.vezava + casSekcije.vrtanjeLuknje + casSekcije.perforacija + 
                            casSekcije.dodatno + casSekcije.kooperanti;
  
  casSekcije.skupaj = skupniCasIzdelave;
  casSekcije1.skupaj =
    casSekcije1.tisk + casSekcije1.uvTisk + casSekcije1.plastifikacija + casSekcije1.uvLak + casSekcije1.izsek + casSekcije1.razrez +
    casSekcije1.topliTisk + casSekcije1.biganje + casSekcije1.biganjeRocnoZgibanje + casSekcije1.zgibanje + casSekcije1.lepljenje +
    casSekcije1.lepljenjeBlokov + casSekcije1.vezava + casSekcije1.vrtanjeLuknje + casSekcije1.perforacija + casSekcije1.dodatno + casSekcije1.kooperanti;
  casSekcije2.skupaj =
    casSekcije2.tisk + casSekcije2.uvTisk + casSekcije2.plastifikacija + casSekcije2.uvLak + casSekcije2.izsek + casSekcije2.razrez +
    casSekcije2.topliTisk + casSekcije2.biganje + casSekcije2.biganjeRocnoZgibanje + casSekcije2.zgibanje + casSekcije2.lepljenje +
    casSekcije2.lepljenjeBlokov + casSekcije2.vezava + casSekcije2.vrtanjeLuknje + casSekcije2.perforacija + casSekcije2.dodatno + casSekcije2.kooperanti;
  
  // Pretvori skupni čas v minute
  const predvideniCas = Math.round(skupniCasIzdelave * 60);
  
  // Izračun prioritete na podlagi razlike med časom "do roka" in časom izdelave
  let prioriteta = 5; // privzeta najnižja prioriteta
  let preostaliCasDoRoka = 0;
  
  const rokIzdelave = nalog.podatki?.rokIzdelave;
  const rokIzdelaveUra = nalog.podatki?.rokIzdelaveUra;

  // Ura roka: uporabi ločeno polje, sicer poskusi pobrati iz datetime (SQL pogosto vrne ISO z uro),
  // fallback je 15:00 (konec delavnika).
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
  const pridobiRokUro = (): string => {
    const fromPodatki = normalizirajUro(rokIzdelaveUra);
    if (fromPodatki) return clampUraNaDelavnik(parseInt(fromPodatki.slice(0, 2), 10), parseInt(fromPodatki.slice(3, 5), 10));
    return '15:00';
  };
  
  if (rokIzdelave) {
    const datumRoka = new Date(rokIzdelave);
    const danes = new Date();
    
    // Nastavi konec roka z uro
    let konecRoka = new Date(datumRoka);
    const uraStr = pridobiRokUro();
    const [ure, minute] = uraStr.split(':').map(Number);
    konecRoka.setHours(ure, minute, 0, 0);
    
    // Uporabi trenutni čas za izračun prioritete (ne čas odprtja naloga)
    let zacetekDela = new Date(danes);
    
    // Če je trenutni čas po 15:00, začni z naslednjim delovnim dnem ob 7:00
    if (danes.getHours() >= 15) {
      zacetekDela = zacetekDelaNaslednjegaDne(danes);
    } else if (!jeDelovniDan(danes)) {
      // Če ni delovni dan, se rok začne naslednji delovni dan ob 7:00
      zacetekDela = zacetekDelaNaslednjegaDne(danes);
    } else {
      // Če je delovni dan pred 15:00, se rok začne ob trenutnem času
      zacetekDela = new Date(danes);
    }
    
    // Izračun delovnih ur do roka
    const delovneUreDoRoka = izracunajDelovneUre(zacetekDela, konecRoka);
    preostaliCasDoRoka = Math.round(delovneUreDoRoka * 60); // pretvori v minute
    
    // Izračun prioritete: razlika med časom "do roka" in časom izdelave
    const razlikaCas = preostaliCasDoRoka - predvideniCas;
    
    if (razlikaCas < 0) prioriteta = 1; // prekoračen rok
    else if (razlikaCas <= 120) prioriteta = 2; // rok izdelave med 0-2 h (120 min)
    else if (razlikaCas <= 300) prioriteta = 3; // rok izdelave med 2-5 h (300 min)
    else if (razlikaCas <= 960) prioriteta = 4; // rok izdelave med 5-16 h (960 min)
    else prioriteta = 5; // rok izdelave več od 16 h
  }
  
  // Če je nalog zaključen ali dobavljen, ni prioriteten
  if (nalog.status === 'zaključen' || nalog.dobavljeno) {
    return {
      stevilkaNaloga: nalog.stevilkaNaloga,
      predvideniCas: 0,
      casSekcije: casSekcije,
      rokIzdelave: nalog.podatki?.rokIzdelave || '',
      rokIzdelaveUra: nalog.podatki?.rokIzdelaveUra || '',
      prioriteta: 0,
      status: nalog.dobavljeno ? 'dobavljeno' : 'zakljucen',
      podatki: nalog.podatki,
      preostaliCasDoRoka: 0
    };
  }
  
  // Pretvori vse časovne komponente iz ur v minute
  const casSekcijeVMinutah: CasSekcije = {
    tisk: Math.round(casSekcije.tisk * 60),
    uvTisk: Math.round(casSekcije.uvTisk * 60),
    plastifikacija: Math.round(casSekcije.plastifikacija * 60),
    uvLak: Math.round(casSekcije.uvLak * 60),
    izsek: Math.round(casSekcije.izsek * 60),
    razrez: Math.round(casSekcije.razrez * 60),
    topliTisk: Math.round(casSekcije.topliTisk * 60),
    biganje: Math.round(casSekcije.biganje * 60),
    biganjeRocnoZgibanje: Math.round(casSekcije.biganjeRocnoZgibanje * 60),
    zgibanje: Math.round(casSekcije.zgibanje * 60),
    lepljenje: Math.round(casSekcije.lepljenje * 60),
    lepljenjeBlokov: Math.round(casSekcije.lepljenjeBlokov * 60),
    vezava: Math.round(casSekcije.vezava * 60),
    vrtanjeLuknje: Math.round(casSekcije.vrtanjeLuknje * 60),
    perforacija: Math.round(casSekcije.perforacija * 60),
    dodatno: Math.round(casSekcije.dodatno * 60),
    kooperanti: Math.round(casSekcije.kooperanti * 60),
    skupaj: Math.round(casSekcije.skupaj * 60)
  };

  const toMinutes = (c: CasSekcije): CasSekcije => ({
    tisk: Math.round(c.tisk * 60),
    uvTisk: Math.round(c.uvTisk * 60),
    plastifikacija: Math.round(c.plastifikacija * 60),
    uvLak: Math.round(c.uvLak * 60),
    izsek: Math.round(c.izsek * 60),
    razrez: Math.round(c.razrez * 60),
    topliTisk: Math.round(c.topliTisk * 60),
    biganje: Math.round(c.biganje * 60),
    biganjeRocnoZgibanje: Math.round(c.biganjeRocnoZgibanje * 60),
    zgibanje: Math.round(c.zgibanje * 60),
    lepljenje: Math.round(c.lepljenje * 60),
    lepljenjeBlokov: Math.round(c.lepljenjeBlokov * 60),
    vezava: Math.round(c.vezava * 60),
    vrtanjeLuknje: Math.round(c.vrtanjeLuknje * 60),
    perforacija: Math.round(c.perforacija * 60),
    dodatno: Math.round(c.dodatno * 60),
    kooperanti: Math.round(c.kooperanti * 60),
    skupaj: Math.round(c.skupaj * 60),
  });

  return {
    stevilkaNaloga: nalog.stevilkaNaloga,
    predvideniCas: predvideniCas,
    casSekcije: casSekcijeVMinutah,
    casSekcije1: toMinutes(casSekcije1),
    casSekcije2: toMinutes(casSekcije2),
    rokIzdelave: rokIzdelave || '',
    rokIzdelaveUra: nalog.podatki?.rokIzdelaveUra || '',
    prioriteta: prioriteta,
    status: 'v_delu',
    podatki: nalog.podatki,
    preostaliCasDoRoka: preostaliCasDoRoka
  };
};

// Funkcija za pridobitev barve prioritete
const getPrioritetaBarva = (prioriteta: number): string => {
  switch (prioriteta) {
    case 1: return 'bg-purple-800 text-white'; // KRITIČNO - prekoračen rok (temno vijolična)
    case 2: return 'bg-red-600 text-white'; // URGENTNO - rok 0-2h (temno rdeča)
    case 3: return 'bg-orange-400 text-white'; // POMEMBNO - rok 2-5h
    case 4: return 'bg-yellow-400 text-black'; // OBIČAJNO - rok 5-16h
    case 5: return 'bg-green-400 text-white'; // NIZKA - rok >16h
    default: return 'bg-gray-400 text-white'; // Ni prioritete
  }
};

type ClosedTaskLite = { stevilkaNaloga: number; taskType: string; part?: number | null; closedAt?: string };

// Helper funkcija za preverjanje ali je dodelava zaprta (po delih/partih).
// Strogo: part 1 ne sme zapreti part 2 (in obratno). Če part manjka/je neveljaven, ga tretiramo kot 0.
const isTaskClosed = (
  stevilkaNaloga: number,
  taskType: string,
  closedTasks: ClosedTaskLite[],
  part?: number
): boolean => {
  const normPart = (p: any): 0 | 1 | 2 => {
    const n = Number(p ?? 0);
    return (n === 1 || n === 2) ? (n as any) : 0;
  };
  return closedTasks.some(task => {
    if (task.stevilkaNaloga !== stevilkaNaloga) return false;
    if (task.taskType !== taskType) return false;
    if (part == null) return true;
    return normPart(task.part) === normPart(part);
  });
};

// Helper funkcija za izračun skupnega časa brez zaprtih dodelav
const izracunajSkupniCasBrezZaprtih = (
  nalog: any,
  closedTasks: ClosedTaskLite[]
): number => {
  const sumFor = (casSekcije: any, part: number): number => {
    if (!casSekcije) return 0;
    let sum = 0;
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Tisk', closedTasks, part) && casSekcije.tisk > 0) sum += casSekcije.tisk;
    if (!isTaskClosed(nalog.stevilkaNaloga, 'UV Tisk', closedTasks, part) && casSekcije.uvTisk > 0) sum += casSekcije.uvTisk;
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Plastifikacija', closedTasks, part) && casSekcije.plastifikacija > 0) sum += casSekcije.plastifikacija;
    if (!isTaskClosed(nalog.stevilkaNaloga, 'UV Lak', closedTasks, part) && casSekcije.uvLak > 0) sum += casSekcije.uvLak;
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Izsek/Zasek', closedTasks, part) && casSekcije.izsek > 0) sum += casSekcije.izsek;
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Razrez', closedTasks, part) && casSekcije.razrez > 0) sum += casSekcije.razrez;
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Topli tisk', closedTasks, part) && casSekcije.topliTisk > 0) sum += casSekcije.topliTisk;
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Biganje', closedTasks, part) && casSekcije.biganje > 0) sum += casSekcije.biganje;
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Biganje + ročno zgibanje', closedTasks, part) && casSekcije.biganjeRocnoZgibanje > 0) sum += casSekcije.biganjeRocnoZgibanje;
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Zgibanje', closedTasks, part) && casSekcije.zgibanje > 0) sum += casSekcije.zgibanje;
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Lepljenje', closedTasks, part) && casSekcije.lepljenje > 0) sum += casSekcije.lepljenje;
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Lepljenje blokov', closedTasks, part) && casSekcije.lepljenjeBlokov > 0) sum += casSekcije.lepljenjeBlokov;
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Vezava', closedTasks, part) && casSekcije.vezava > 0) sum += casSekcije.vezava;
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Vrtanje luknje', closedTasks, part) && casSekcije.vrtanjeLuknje > 0) sum += casSekcije.vrtanjeLuknje;
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Perforacija', closedTasks, part) && casSekcije.perforacija > 0) sum += casSekcije.perforacija;
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Dodatno', closedTasks, part) && casSekcije.dodatno > 0) sum += casSekcije.dodatno;
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Kooperanti', closedTasks, part) && casSekcije.kooperanti > 0) sum += casSekcije.kooperanti;
    return sum;
  };

  // Prefer part-specific breakdown when available (casSekcije1/casSekcije2 are in minutes).
  const cas1 = nalog.casSekcije1 || nalog.casSekcije;
  const cas2 = nalog.casSekcije2;
  return sumFor(cas1, 1) + sumFor(cas2, 2);
};

function App() {
  const [zaklenjeno, setZaklenjeno] = useState(false);
  const [stevilkaNaloga, setStevilkaNaloga] = useState(65001);
  const [key, setKey] = useState(0); // Key za prisilno re-render komponent
  const [nalogShranjeno, setNalogShranjeno] = useState(true);
  const [emailPoslan, setEmailPoslan] = useState(false);
  const [emailNapaka, setEmailNapaka] = useState<string>('');
  const [zakljucen, setZakljucen] = useState(false);
  const [tiskZakljucen1, setTiskZakljucen1] = useState(false);
  const [tiskZakljucen2, setTiskZakljucen2] = useState(false);
  const [dobavljeno, setDobavljeno] = useState(false);
  const [prikaziPredogledEmaila, setPrikaziPredogledEmaila] = useState(false);
  
  // AI Email Parser state
  const [emailBesedilo, setEmailBesedilo] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiRezultat, setAiRezultat] = useState<any>(null);
  const [aiPreviewNalog, setAiPreviewNalog] = useState<any>(null);
  const [aiRunId, setAiRunId] = useState<number | null>(null);
  
  // Testni e-mail
  const testEmail = `Pozdravljeni, prosim za pripravo 500 vizitk formata 85x55 mm, dvostranskega tiska, papir 300g, plastificirano mat. Dobava do 10. julija. Hvala, Marko Novak, Podjetje Medis`;
  const [emailVrsta, setEmailVrsta] = useState<'odprtje'|'zakljucek'>('odprtje');
  const [emailHtml, setEmailHtml] = useState('');
  const obrazecRef = useRef<HTMLDivElement>(null);
  // Za zaščito pred "race condition": pozni SQL odgovor ne sme prepisati trenutno odprtega naloga
  const openNalogRef = useRef<number>(stevilkaNaloga);
  const saveSeqRef = useRef<number>(0);
  // Realtime: polling je še vedno uporaben kot robusten fallback (če SSE včasih zataji),
  // zato ga ne izklapljamo — preprečimo pa utripanje tako, da NE posodabljamo state-a, če ni sprememb.
  const afterEmailCloseActionRef = useRef<null | (() => void)>(null);
  // Če uporabnik izbere "Ne, nadaljuj", moramo preprečiti auto-save ob odpiranju cilja
  const skipAutoSaveOnceRef = useRef<boolean>(false);
  const [prikaziIzbris, setPrikaziIzbris] = useState(false);
  const [gesloIzbris, setGesloIzbris] = useState('');
  const [gesloIzbrisNapaka, setGesloIzbrisNapaka] = useState('');
  const [showDobavljenoUnlockPrompt, setShowDobavljenoUnlockPrompt] = useState(false);
  const [dobavljenoUnlockCode, setDobavljenoUnlockCode] = useState('');
  const [dobavljenoUnlockNapaka, setDobavljenoUnlockNapaka] = useState('');
  const [prikaziUnsavedModal, setPrikaziUnsavedModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | (() => void)>(null);
  const [showSavedAnim, setShowSavedAnim] = useState(false);
  const [showDeletedAnim, setShowDeletedAnim] = useState(false);
  const [showEmailAnim, setShowEmailAnim] = useState(false);
  const [aktivniZavihek, setAktivniZavihek] = useState<'delovniNalog'|'prioritetniNalogi'|'kapacitete'|'koledar'|'izsekovalnaOrodja'|'analiza'>('delovniNalog');
  const [scrollToPrioritetniNalog, setScrollToPrioritetniNalog] = useState<{ id: number; ts: number } | null>(null);
  const [scrollToSeznamNalog, setScrollToSeznamNalog] = useState<{ id: number; ts: number } | null>(null);
  // Scroll restore (per tab + delovni nalog: seznam + obrazec)
  const scrollPosRef = useRef<Record<string, number>>({});
  const delovniFormScrollRef = useRef<HTMLDivElement | null>(null);
  const prioritetniScrollRef = useRef<HTMLDivElement | null>(null);
  const kapaciteteScrollRef = useRef<HTMLDivElement | null>(null);
  const koledarScrollRef = useRef<HTMLDivElement | null>(null);
  const izsekovalnaOrodjaScrollRef = useRef<HTMLDivElement | null>(null);
  const analizaScrollRef = useRef<HTMLDivElement | null>(null);
  // Refs za tab navigacijo med zavihki
  const tabsBarRef = useRef<HTMLDivElement | null>(null);
  const delovniNalogTabRef = useRef<HTMLButtonElement | null>(null);
  const prioritetniNalogiTabRef = useRef<HTMLButtonElement | null>(null);
  const kapaciteteTabRef = useRef<HTMLButtonElement | null>(null);
  const koledarTabRef = useRef<HTMLButtonElement | null>(null);
  const izsekovalnaOrodjaTabRef = useRef<HTMLButtonElement | null>(null);
  const aktivniZavihekRef = useRef<typeof aktivniZavihek>(aktivniZavihek);
  const [analizaUnlocked, setAnalizaUnlocked] = useState(false);
  const [showAnalizaPrompt, setShowAnalizaPrompt] = useState(false);
  const [analizaCode, setAnalizaCode] = useState('');
  const [analizaNapaka, setAnalizaNapaka] = useState('');

  // Analiza: zakleni ob izhodu iz zavihka.
  // - če zapustiš Analizo in se vrneš v 2 min: ostane odklenjena (čas se resetira)
  // - če si zunaj Analize >= 2 min: zakleni Analizo
  // - če si neaktiven 10 min v Analizi: preklopi na "Delovni nalog" in zakleni Analizo
  const ANALIZA_LEAVE_GRACE_MS = 2 * 60 * 1000;
  const ANALIZA_IDLE_REDIRECT_MS = 10 * 60 * 1000;
  const analizaLastActivityRef = useRef<number>(0);
  const analizaTouchThrottleRef = useRef<number>(0);
  const analizaLeftAtRef = useRef<number>(0);
  const analizaLeaveTimeoutRef = useRef<number | null>(null);
  const prevZavihekRef = useRef<typeof aktivniZavihek>(aktivniZavihek);
  const touchAnalizaActivity = () => {
    const now = Date.now();
    // throttle (da ne spamamo pri mousemove)
    if (now - analizaTouchThrottleRef.current < 600) return;
    analizaTouchThrottleRef.current = now;
    analizaLastActivityRef.current = now;
  };

  const analizaInputRef = useRef<HTMLInputElement>(null);
  const izbrisInputRef = useRef<HTMLInputElement>(null);
  const dobavljenoUnlockInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showAnalizaPrompt) {
      requestAnimationFrame(() => analizaInputRef.current?.focus());
    }
  }, [showAnalizaPrompt]);

  // ESC: vedno pokaži "Delovni nalog" (razen če si že na njem – tam naj ostane obstoječe brisanje filtrov)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (aktivniZavihek !== 'delovniNalog') {
        e.preventDefault();
        e.stopPropagation();
        setAktivniZavihek('delovniNalog');
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [aktivniZavihek]);

  // Ob preklopu zavihka: obnovi scroll pozicijo za ciljni zavihek
  useEffect(() => {
    const restore = () => {
      const key = aktivniZavihek;
      const top = Number(scrollPosRef.current[key] || 0);
      const el =
        key === 'delovniNalog' ? delovniFormScrollRef.current :
        key === 'prioritetniNalogi' ? prioritetniScrollRef.current :
        key === 'kapacitete' ? kapaciteteScrollRef.current :
        key === 'koledar' ? koledarScrollRef.current :
        key === 'izsekovalnaOrodja' ? izsekovalnaOrodjaScrollRef.current :
        key === 'analiza' ? analizaScrollRef.current :
        null;
      if (!el) return;
      try { el.scrollTop = top; } catch {}
    };
    // po renderju, da ref obstaja
    requestAnimationFrame(restore);
  }, [aktivniZavihek]);

  const lockAnaliza = (opts?: { openPrompt?: boolean }) => {
    setAnalizaUnlocked(false);
    analizaLastActivityRef.current = 0;
    analizaTouchThrottleRef.current = 0;
    analizaLeftAtRef.current = 0;
    if (analizaLeaveTimeoutRef.current != null) {
      window.clearTimeout(analizaLeaveTimeoutRef.current);
      analizaLeaveTimeoutRef.current = null;
    }
    setAnalizaCode('');
    setAnalizaNapaka('');
    setShowAnalizaPrompt(!!opts?.openPrompt);
  };

  // Zaklep Analize po 2 min odsotnosti (grace timer)
  useEffect(() => {
    const prev = prevZavihekRef.current;
    if (prev === 'analiza' && aktivniZavihek !== 'analiza') {
      analizaLeftAtRef.current = Date.now();
      if (analizaLeaveTimeoutRef.current != null) {
        window.clearTimeout(analizaLeaveTimeoutRef.current);
        analizaLeaveTimeoutRef.current = null;
      }
      // zakleni šele po 2 min, če se ne vrneš
      analizaLeaveTimeoutRef.current = window.setTimeout(() => {
        if (prevZavihekRef.current !== 'analiza') {
          lockAnaliza({ openPrompt: false });
        }
      }, ANALIZA_LEAVE_GRACE_MS);
    }
    if (aktivniZavihek === 'analiza' && prev !== 'analiza') {
      // vrnitev v Analizo: resetiraj timer
      analizaLeftAtRef.current = 0;
      if (analizaLeaveTimeoutRef.current != null) {
        window.clearTimeout(analizaLeaveTimeoutRef.current);
        analizaLeaveTimeoutRef.current = null;
      }
      if (analizaUnlocked) {
        analizaLastActivityRef.current = Date.now();
        analizaTouchThrottleRef.current = 0;
      }
    }
    prevZavihekRef.current = aktivniZavihek;
  }, [aktivniZavihek, analizaUnlocked]);

  // Medtem ko si v Analizi in odklenjen: če si neaktiven 10 min, preklopi na Delovni nalog + zakleni Analizo
  useEffect(() => {
    if (aktivniZavihek !== 'analiza' || !analizaUnlocked) return;

    analizaLastActivityRef.current = Date.now();
    analizaTouchThrottleRef.current = 0;

    const onActivity = () => touchAnalizaActivity();
    window.addEventListener('mousemove', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity);
    window.addEventListener('click', onActivity, true);
    window.addEventListener('scroll', onActivity, true);

    const interval = setInterval(() => {
      const last = analizaLastActivityRef.current || 0;
      if (last && Date.now() - last >= ANALIZA_IDLE_REDIRECT_MS) {
        lockAnaliza({ openPrompt: false });
        setAktivniZavihek('delovniNalog');
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('mousemove', onActivity as any);
      window.removeEventListener('keydown', onActivity as any);
      window.removeEventListener('click', onActivity as any, true);
      window.removeEventListener('scroll', onActivity as any, true);
    };
  }, [aktivniZavihek, analizaUnlocked]);

  useEffect(() => {
    if (prikaziIzbris) {
      requestAnimationFrame(() => izbrisInputRef.current?.focus());
    }
  }, [prikaziIzbris]);

  useEffect(() => {
    if (showDobavljenoUnlockPrompt) {
      requestAnimationFrame(() => dobavljenoUnlockInputRef.current?.focus());
    }
  }, [showDobavljenoUnlockPrompt]);
  const [originalniPodatki, setOriginalniPodatki] = useState<NalogPodatki | null>(null);
  type ClosedTaskState = { stevilkaNaloga: number; taskType: string; part?: 0 | 1 | 2; closedAt?: string };
  const [closedTasks, setClosedTasks] = useState<ClosedTaskState[]>(() => {
    // Naloži zaprte naloge iz localStorage (back-compat)
    const saved = localStorage.getItem('closedTasks');
    const parsed = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((t: any) => {
        const p = Number(t?.part ?? 0);
        const part = (p === 1 || p === 2) ? p : 0;
        return ({
          stevilkaNaloga: Number(t?.stevilkaNaloga ?? t?.nalog),
          taskType: String(t?.taskType ?? t?.step ?? ''),
          part: part as 0 | 1 | 2,
          closedAt: t?.closedAt ? String(t.closedAt) : undefined,
        });
      })
      .filter((t: any) => Number.isFinite(t.stevilkaNaloga) && t.stevilkaNaloga > 0 && t.taskType);
  });
  const stroskiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    openNalogRef.current = stevilkaNaloga;
  }, [stevilkaNaloga]);

  // Debug: dodaj console.log za setClosedTasks
  const handleSetClosedTasks = (newClosedTasks: ClosedTaskState[]) => {
    console.log('setClosedTasks klican z:', newClosedTasks);
    setClosedTasks(newClosedTasks);
  };

  // Shrani closedTasks v localStorage ob spremembi
  useEffect(() => {
    localStorage.setItem('closedTasks', JSON.stringify(closedTasks));
  }, [closedTasks]);

  // Bližnjico Ctrl+S dodamo nižje (po definiciji handleShraniNalog).

  // Stanje za shranjevanje podatkov iz vseh sekcij
  const [izvozOpen, setIzvozOpen] = useState(false);
  const izvozRef = useRef<HTMLDivElement | null>(null);
  const [showBulkExport, setShowBulkExport] = useState(false);
  const [bulkTab, setBulkTab] = useState<'kupec' | 'material' | 'etikete'>('kupec');
  const [bulkFrom, setBulkFrom] = useState('');
  const [bulkTo, setBulkTo] = useState('');
  const [bulkKupci, setBulkKupci] = useState<any[]>([]);
  const [bulkKupecSearch, setBulkKupecSearch] = useState('');
  const [bulkKupec, setBulkKupec] = useState<any | null>(null);
  const [bulkOnlyDelivered, setBulkOnlyDelivered] = useState(true);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState('');
  // Etikete: stanje (seznam + izbor + pozicije + preview)
  type EtiketaItem = { id: number; part: 1 | 2; predmet: string; kosov: string };
  const [etiketeItems, setEtiketeItems] = useState<EtiketaItem[]>([]);
  const [etiketeBusy, setEtiketeBusy] = useState(false);
  const [etiketeError, setEtiketeError] = useState('');
  const [etiketeChecked, setEtiketeChecked] = useState<Record<string, boolean>>({});
  const [etiketePos, setEtiketePos] = useState<Record<string, number>>({});
  // Material export je vedno "zbirno" po dropdown materialih
  const [bulkAdvancedEmail, setBulkAdvancedEmail] = useState(false);
  const emailEditorRef = useRef<HTMLDivElement | null>(null);
  const emailEditorSyncedRef = useRef(false);
  const [zakljuciMenuOpen, setZakljuciMenuOpen] = useState(false);
  const zakljuciMenuRef = useRef<HTMLDivElement | null>(null);
  const [dobavnicaMenuOpen, setDobavnicaMenuOpen] = useState(false);
  const dobavnicaMenuRef = useRef<HTMLDivElement | null>(null);

  // TAB navigacija: omeji premikanje fokusa na glavne zavihke (brez Analize).
  // Opomba: v input/textarea/select/contenteditable pustimo privzeto obnašanje (da tipkanje ostane normalno).
  useEffect(() => {
    aktivniZavihekRef.current = aktivniZavihek;
  }, [aktivniZavihek]);
  useEffect(() => {
    const isEditableTarget = (el: EventTarget | null): boolean => {
      const h = el as HTMLElement | null;
      if (!h) return false;
      const tag = (h.tagName || '').toLowerCase();
      if ((h as any).isContentEditable) return true;
      return tag === 'input' || tag === 'textarea' || tag === 'select';
    };
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Če so odprti modali, pusti TAB znotraj modala (ne preklapljaj zavihkov)
      if (prikaziPredogledEmaila || showBulkExport || showAnalizaPrompt || showDobavljenoUnlockPrompt || prikaziIzbris || prikaziUnsavedModal) return;
      if (isEditableTarget(e.target)) return;

      const tabButtons: Array<HTMLButtonElement | null> = [
        delovniNalogTabRef.current,
        prioritetniNalogiTabRef.current,
        kapaciteteTabRef.current,
        koledarTabRef.current,
        izsekovalnaOrodjaTabRef.current
      ];
      const tabKeys: Array<'delovniNalog' | 'prioritetniNalogi' | 'kapacitete' | 'koledar' | 'izsekovalnaOrodja'> = [
        'delovniNalog',
        'prioritetniNalogi',
        'kapacitete',
        'koledar',
        'izsekovalnaOrodja'
      ];

      const cur = aktivniZavihekRef.current;
      const curIdx =
        cur === 'prioritetniNalogi' ? 1 :
        cur === 'kapacitete' ? 2 :
        cur === 'koledar' ? 3 :
        cur === 'izsekovalnaOrodja' ? 4 :
        0; // analiza šteje kot 0
      const nextIdx = e.shiftKey ? (curIdx - 1 + tabKeys.length) % tabKeys.length : (curIdx + 1) % tabKeys.length;
      const nextTab = tabKeys[nextIdx];
      e.preventDefault();
      e.stopPropagation();
      // TAB naj dejansko preklopi zavihek (ne samo fokus)
      setAktivniZavihek(nextTab);
      // in fokus naj gre na njegov gumb
      setTimeout(() => tabButtons[nextIdx]?.focus(), 0);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [aktivniZavihek, prikaziPredogledEmaila, showBulkExport, showAnalizaPrompt, showDobavljenoUnlockPrompt, prikaziIzbris, prikaziUnsavedModal]);
  const [nalogPodatki, setNalogPodatki] = useState<NalogPodatki>({
    kupec: null,
    tisk: null,
    dodelava1: null,
    dodelava2: null,
    stroski1: null,
    stroski2: null,
    posiljanje: null,
    komentar: null,
    emailPoslan: false,
    zakljucekEmailPoslan: false
  });

  const [vsiNalogi, setVsiNalogi] = useState(() => preberiNalogeIzLocalStorage());
  const [cenikPendingImports, setCenikPendingImports] = useState<CenikPendingImport[]>([]);
  const [cenikSelectedIds, setCenikSelectedIds] = useState<string[]>([]);
  const [cenikImportBusy, setCenikImportBusy] = useState(false);
  const [cenikImportError, setCenikImportError] = useState('');

  const [zakljucekEmailPoslan, setZakljucekEmailPoslan] = useState(!!nalogPodatki.zakljucekEmailPoslan);
  const pendingDobavljenoSaveRef = useRef<string>('');

  // Email editor: sync HTML v contentEditable samo ob odprtju ali ko eksplicitno ponastavimo,
  // sicer re-renderji lahko premaknejo kurzor in naredijo urejanje neuporabno.
  useEffect(() => {
    if (!prikaziPredogledEmaila) {
      emailEditorSyncedRef.current = false;
      return;
    }
    const el = emailEditorRef.current;
    if (!el) return;
    if (!emailEditorSyncedRef.current) {
      el.innerHTML = emailHtml || '';
      emailEditorSyncedRef.current = true;
    }
  }, [prikaziPredogledEmaila, emailHtml]);

  useEffect(() => {
    if (!showBulkExport) return;
    (async () => {
      try {
        const res = await fetch('/api/kupec');
        if (res.ok) {
          const kupci = await res.json();
          setBulkKupci(Array.isArray(kupci) ? kupci : []);
        }
      } catch {}
    })();
  }, [showBulkExport]);

  // Etikete: ko izberemo zavihek + kupca + obdobje, naloži naloge (samo tisk zaključen, ne dobavljeno)
  useEffect(() => {
    if (!showBulkExport) return;
    if (bulkTab !== 'etikete') return;
    setEtiketeError('');
    if (!bulkFrom || !bulkTo || !bulkKupec?.KupecID) {
      setEtiketeItems([]);
      setEtiketeChecked({});
      setEtiketePos({});
      return;
    }
    let alive = true;
    (async () => {
      try {
        setEtiketeBusy(true);
        const ps = new URLSearchParams();
        ps.set('from', bulkFrom);
        ps.set('to', bulkTo);
        ps.set('kupecId', String(bulkKupec.KupecID));
        const r = await fetch(`/api/export/etikete?${ps.toString()}`);
        if (!r.ok) {
          const msg = await r.text().catch(() => '');
          throw new Error(msg || `HTTP ${r.status}`);
        }
        const data = await r.json().catch(() => ({} as any));
        const rows = Array.isArray(data?.rows) ? data.rows : [];
        const items: EtiketaItem[] = [];
        for (const row of rows) {
          const id = Number(row?.id);
          if (!Number.isFinite(id)) continue;
          const p1 = String(row?.predmet1 || '').trim();
          const p2 = String(row?.predmet2 || '').trim();
          const k1 = row?.kosov1 != null ? String(row.kosov1) : '';
          const k2 = row?.kosov2 != null ? String(row.kosov2) : '';
          if (p1) items.push({ id, part: 1, predmet: p1, kosov: k1 });
          if (p2) items.push({ id, part: 2, predmet: p2, kosov: k2 });
        }
        // privzete pozicije 1..12 po vrstnem redu
        const initPos: Record<string, number> = {};
        items.slice(0, 12).forEach((it, idx) => { initPos[`${it.id}:${it.part}`] = idx + 1; });
        if (!alive) return;
        setEtiketeItems(items);
        setEtiketeChecked({});
        setEtiketePos(initPos);
      } catch (e: any) {
        if (!alive) return;
        setEtiketeItems([]);
        setEtiketeChecked({});
        setEtiketePos({});
        setEtiketeError(e?.message || String(e));
      } finally {
        if (alive) setEtiketeBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [showBulkExport, bulkTab, bulkFrom, bulkTo, bulkKupec?.KupecID]);

  // Izračunaj prioritetne naloge
  const vsiNalogiIzracunani = useMemo(() => {
    return (vsiNalogi || []).map(izracunajPrioriteto);
  }, [vsiNalogi]);

  const prioritetniNalogi = useMemo(() => {
    return vsiNalogiIzracunani
      .filter(nalog => nalog.status === 'v_delu') // Samo aktivni nalogi
      .sort((a, b) => {
        // Najprej po prioriteti (1 je najvišja)
        if (a.prioriteta !== b.prioriteta) {
          return a.prioriteta - b.prioriteta;
        }
        // Če je prioriteta enaka, po datumu roka
        if (a.rokIzdelave && b.rokIzdelave) {
          return new Date(a.rokIzdelave).getTime() - new Date(b.rokIzdelave).getTime();
        }
        // Če ni roka, po številki naloga
        return a.stevilkaNaloga - b.stevilkaNaloga;
      });
  }, [vsiNalogiIzracunani]);

  // Zapri dropdown-e ob kliku izven in ob Escape
  useEffect(() => {
    if (!izvozOpen && !zakljuciMenuOpen && !dobavnicaMenuOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (izvozRef.current && !izvozRef.current.contains(target)) setIzvozOpen(false);
      if (zakljuciMenuRef.current && !zakljuciMenuRef.current.contains(target)) setZakljuciMenuOpen(false);
      if (dobavnicaMenuRef.current && !dobavnicaMenuRef.current.contains(target)) setDobavnicaMenuOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIzvozOpen(false);
        setZakljuciMenuOpen(false);
        setDobavnicaMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [izvozOpen, zakljuciMenuOpen, dobavnicaMenuOpen]);

  const openDobavnica = (opts?: { hidePrices?: boolean; alwaysBoth?: boolean; onlyPart?: 1 | 2 }) => {
    const hidePrices = !!opts?.hidePrices;
    const alwaysBoth = !!opts?.alwaysBoth;
    const onlyPart = opts?.onlyPart ?? undefined;

    const d = new Date();
    const datum = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
    const kupec = nalogPodatki.kupec || {};
    const naziv = kupec.Naziv || '';
    const naslov = kupec.Naslov || '';
    const posta = kupec.Posta || '';
    const kraj = kupec.Kraj || '';
    const telefon = kupec.Telefon || '';
    const idZaDDV = kupec.IDzaDDV || '';
    const kontakt = kupec.email || '';
    const tisk1 = nalogPodatki.tisk?.tisk1 || {};
    const tisk2 = nalogPodatki.tisk?.tisk2 || {};

    const parseNum = (v?: string) => {
      if (v == null) return 0;
      let s = String(v).trim().replace(/\s/g, '');
      if (s === '') return 0;
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
    };
    const izracunSkupaj = (stroski: any) => {
      const graficna = parseNum(stroski?.graficnaPriprava);
      const klise = parseNum(stroski?.cenaKlišeja);
      const orodje = parseNum(stroski?.cenaIzsekovalnegaOrodja);
      const vzorec = parseNum(stroski?.cenaVzorca);
      const brezDDV = parseNum(stroski?.cenaBrezDDV);
      const skupaj = graficna + klise + orodje + vzorec + brezDDV;
      const ddv = skupaj * 0.22;
      return { skupaj, ddv, skupajZDDV: skupaj + ddv };
    };
    const formatCurrency = (n: number) => new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n);

    // Standard: če je zaključen samo del naloga, izpiši na dobavnici samo zaključen(e) del(e)
    const jeDelnoZakljucen = (tiskZakljucen1 || tiskZakljucen2) && !(tiskZakljucen1 && tiskZakljucen2);
    const uporabi1 = (onlyPart === 1) ? true : (onlyPart === 2) ? false : (alwaysBoth ? true : (jeDelnoZakljucen ? !!tiskZakljucen1 : true));
    const uporabi2 = (onlyPart === 2) ? true : (onlyPart === 1) ? false : (alwaysBoth ? true : (jeDelnoZakljucen ? !!tiskZakljucen2 : true));

    const stroski1 = nalogPodatki.stroski1 || {};
    const stroski2 = nalogPodatki.stroski2 || {};
    const s1 = izracunSkupaj(stroski1);
    const s2 = izracunSkupaj(stroski2);

    const vrstice: Array<{ naziv: string; kolicina: string; enota: string; cena?: string }> = [];
    const pushVrstica = (idx: 1 | 2, t: any, s: any) => {
      const predmet = (t?.predmet || '').toString();
      if (!predmet.trim()) return; // ne izpisuj placeholderjev (npr. "Tiskovina 2"), če je predmet prazen
      const format = (t?.format || '').toString();
      const nazivIz = `${predmet}${format ? `, ${format}` : ''}`;
      vrstice.push({
        naziv: nazivIz,
        kolicina: (t?.steviloKosov || '').toString(),
        enota: 'kos',
        ...(hidePrices ? {} : { cena: s?.skupaj ? formatCurrency(s.skupaj) : '' })
      });
    };

    if (uporabi1) pushVrstica(1, tisk1, s1);
    if (uporabi2) pushVrstica(2, tisk2, s2);
    if (vrstice.length === 0) {
      vrstice.push({ naziv: 'Tiskovina', kolicina: '', enota: 'kos', ...(hidePrices ? {} : { cena: '' }) });
    }

    const vrsticeHtml = vrstice.map(v => `
      <tr>
        <td style="padding:8px; border:1px solid #000;">${(v.naziv || '').toString()}</td>
        <td style="padding:8px; border:1px solid #000; text-align:center;">${(v.kolicina || '').toString()}</td>
        <td style="padding:8px; border:1px solid #000; text-align:center;">${(v.enota || '').toString()}</td>
        ${hidePrices ? '' : `<td style="padding:8px; border:1px solid #000; text-align:right; width:140px;">${(v.cena || '').toString()}</td>`}
      </tr>
    `).join('');

    const skupajBrezDDV = (uporabi1 ? (s1.skupaj || 0) : 0) + (uporabi2 ? (s2.skupaj || 0) : 0);
    const skupajDDV = (uporabi1 ? (s1.ddv || 0) : 0) + (uporabi2 ? (s2.ddv || 0) : 0);
    const skupajZDDV = (uporabi1 ? (s1.skupajZDDV || 0) : 0) + (uporabi2 ? (s2.skupajZDDV || 0) : 0);

    const totalsHtml = hidePrices ? '' : `
      <div class="block">
        <div><span class="bold">Skupaj (brez DDV):</span> ${formatCurrency(skupajBrezDDV)}</div>
        <div><span class="bold">DDV (22%):</span> ${formatCurrency(skupajDDV)}</div>
        <div><span class="bold">Skupaj (z DDV):</span> ${formatCurrency(skupajZDDV)}</div>
      </div>
    `;

    const priceTh = hidePrices ? '' : `<th style="padding:8px; border:1px solid #000; text-align:right; width:140px;">Cena</th>`;
    const narocilnica =
      (nalogPodatki as any)?.kupec?.narocilnica ||
      (nalogPodatki as any)?.kupec?.Narocilnica ||
      '';

    const enaDobavnica = `
<div class="header">
  <div class="bold">Trajanus d.o.o., Savska loka 21, 4000 Kranj</div>
</div>

<div class="title-line">
  <h1>DOBAVNICA št.: ${stevilkaNaloga}</h1>
  <div class="bold">Datum: ${datum}</div>
</div>

${narocilnica ? `
<div class="block">
  <div><span class="bold">Naročilnica:</span> ${narocilnica}</div>
</div>
` : ''}

<div class="block">
  <div class="bold">Prejemnik:</div>
  <div>${naziv}</div>
  <div>${naslov}</div>
  <div>${posta} ${kraj}</div>
</div>

<div class="block">
  <div><span class="bold">ID za DDV:</span> ${idZaDDV || '-'}</div>
  <div><span class="bold">Kontakt:</span> ${kontakt || '-'}</div>
  <div><span class="bold">Telefon:</span> ${telefon || '-'}</div>
</div>

<table>
  <thead>
    <tr>
      <th style="padding:8px; border:1px solid #000; text-align:left;">Naziv</th>
      <th style="padding:8px; border:1px solid #000; text-align:center; width:120px;">Količina</th>
      <th style="padding:8px; border:1px solid #000; text-align:center; width:140px;">Merska enota</th>
      ${priceTh}
    </tr>
  </thead>
  <tbody>
    ${vrsticeHtml}
  </tbody>
</table>

${totalsHtml}

<div class="block" style="margin-top:24px;">
  <div class="bold">Prevzel:</div>
  <div style="border-bottom:1px solid #000; width:260px; height:28px;"></div>
</div>
    `;

    const html = `
<!doctype html>
<html lang="sl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dobavnica ${stevilkaNaloga}${hidePrices ? ' (kooperant)' : ''}</title>
  <style>
    /* A4: 210x297mm. Perforacija mora biti natanko na 148,5mm (polovica višine). */
    @page { size: A4; margin: 0; }
    html, body { padding: 0; margin: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #f3f4f6; }
    .header { border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 16px; }
    .title-line { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 8px; margin-top: 12px; }
    h1 { margin: 0; font-size: 24px; }
    .bold { font-weight: bold; }
    .block { margin: 12px 0; }
    table { border-collapse: collapse; width: 100%; margin-top: 8px; }
    .small { font-size: 12px; color: #333; }
    .a4 {
      position: relative;
      width: 210mm;
      height: 297mm;
      background: #fff;
      margin: 12px auto;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.12);
    }
    .copy {
      position: absolute;
      left: 0;
      width: 100%;
      box-sizing: border-box;
      padding: 10mm;
    }
    .copy.top { top: 0; height: 148.5mm; overflow: hidden; }
    .copy.bottom { top: 148.5mm; height: 148.5mm; overflow: hidden; }
    .perforacija {
      position: absolute;
      top: 148.5mm;
      left: 0;
      right: 0;
      border-top: 2px dashed #000;
      pointer-events: none;
    }
    @media print {
      .no-print { display: none; }
      body { background: #fff; }
      .a4 { margin: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="a4">
    <div class="copy top">
      ${enaDobavnica}
    </div>
    <div class="perforacija"></div>
    <div class="copy bottom">
      ${enaDobavnica}
    </div>
  </div>

  <div class="no-print" style="margin-top:16px;">
    <button onclick="window.print()">Natisni</button>
  </div>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
    }
  };

  // MVP: naročnina na SSE /api/scan-events in osveževanje closedTasks (podpira scan in undo)
  useEffect(() => {
    const url = '/api/scan-events';
    let es: EventSource | null = null;
    try {
      es = new EventSource(url);
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data || '{}');
          const nalog = Number((data as any).nalog ?? (data as any).stevilkaNaloga);
          const step = String(data.step || '');
          const action = String(data.action || 'scan');
          const partNum = Number((data as any).part ?? 0);
          const part: 0 | 1 | 2 = (partNum === 1 || partNum === 2) ? (partNum as any) : 0;
          const closedAt = data?.closedAt ? String(data.closedAt) : (data?.ts ? new Date(Number(data.ts)).toISOString() : new Date().toISOString());
          // koledar-updated nima nujno nalog id -> obdelaj prej
          if (action === 'koledar-updated') {
            // posreduj Koledar komponenti (da zaposleni + bookings postanejo enaki na vseh napravah)
            try {
              window.dispatchEvent(new CustomEvent('koledar-updated', { detail: data?.state || null }));
            } catch {}
            return;
          }
          if (!nalog) return;
          if (action === 'nalog-updated') {
            // takoj pobere full nalog in posodobi IndexedDB + seznam (časi dodelav)
            (async () => {
              try {
                const openId = Number(openNalogRef.current || 0);
                const blockOpen = openId > 0 && !nalogShranjeno;
                if (blockOpen && nalog === openId) return;
                const fetchId = Number((data as any)?.delovniNalogID || (data as any)?.DelovniNalogID || nalog);
                const r = await fetch(`/api/delovni-nalog/${fetchId}`);
                if (!r.ok) return;
                const payload = await r.json().catch(() => null);
                if (!payload) return;
                try { await saveBatchToIndexedDBPreserveExisting([payload]); } catch {}
                try {
                  const refreshed = await loadByYearRange(currentYearFilter);
                  setVsiNalogi(refreshed);
                  try { shraniNalogeVLokalno(refreshed as any); } catch {}
                } catch {}
              } catch {}
            })();
            return;
          }
          if (action === 'reset-nalog') {
            setClosedTasks((prev) => {
              const next = prev.filter(t => t.stevilkaNaloga !== nalog);
              try { localStorage.setItem('closedTasks', JSON.stringify(next)); } catch {}
              return next;
            });
          } else if (action === 'reset-part') {
            setClosedTasks((prev) => {
              const next = prev.filter(t => !(t.stevilkaNaloga === nalog && (t.part ?? 0) === part));
              try { localStorage.setItem('closedTasks', JSON.stringify(next)); } catch {}
              return next;
            });
          } else if (action === 'undo') {
            if (!step) return;
            setClosedTasks((prev) => {
              const next = prev.filter(t => !(t.stevilkaNaloga === nalog && t.taskType === step && (t.part ?? 0) === part));
              try { localStorage.setItem('closedTasks', JSON.stringify(next)); } catch {}
              return next;
            });
          } else {
            if (!step) return;
            // Posodobi closedTasks, če še ni vpisan
            setClosedTasks((prev) => {
              const exists = prev.some(t => t.stevilkaNaloga === nalog && t.taskType === step && (t.part ?? 0) === part);
              if (exists) return prev;
              const next = [...prev, { stevilkaNaloga: nalog, taskType: step, part, closedAt }];
              try { localStorage.setItem('closedTasks', JSON.stringify(next)); } catch {}
              return next;
            });
          }
          // Če trenutno gledamo isti nalog, lahko osvežimo UI (neobvezno)
          if (stevilkaNaloga === nalog) {
            // primer: nič ne brišemo iz podatkov, ker prioriteta temelji na closedTasks
          }
        } catch {}
      };
      es.onerror = () => {
        // EventSource sam retry-a zaradi retry headerja
      };
    } catch (e) {
      console.warn('SSE ni na voljo:', e);
    }
    return () => {
      if (es) es.close();
    };
  }, [stevilkaNaloga]);

  // Cross-PC sync: closedTasks polling (10s), da se PrioritetniNalogi posodablja na vseh računalnikih
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const tick = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const res = await fetch('/api/closed-tasks');
        if (!res.ok) return;
        const arr = await res.json().catch(() => null);
        if (!Array.isArray(arr)) return;
        const mapped = arr
          .map((t: any) => ({
            stevilkaNaloga: Number(t?.stevilkaNaloga ?? t?.nalog),
            taskType: String(t?.taskType ?? t?.step ?? ''),
            part: (() => {
              const p = Number(t?.part ?? 0);
              return (p === 1 || p === 2) ? p : 0;
            })() as 0 | 1 | 2,
            closedAt: t?.closedAt ? String(t.closedAt) : undefined,
          }))
          .filter((t: any) => Number.isFinite(t.stevilkaNaloga) && t.stevilkaNaloga > 0 && t.taskType);
        // Stabilen red, da ne prihaja do nepotrebnih razlik med poll cikli
        mapped.sort((a: any, b: any) => {
          if (a.stevilkaNaloga !== b.stevilkaNaloga) return a.stevilkaNaloga - b.stevilkaNaloga;
          if ((a.part ?? 0) !== (b.part ?? 0)) return (a.part ?? 0) - (b.part ?? 0);
          if (a.taskType !== b.taskType) return String(a.taskType).localeCompare(String(b.taskType));
          return String(a.closedAt || '').localeCompare(String(b.closedAt || ''));
        });
        if (cancelled) return;
        setClosedTasks((prev) => {
          const key = (x: any) => `${x.stevilkaNaloga}|${x.part ?? 0}|${x.taskType}`;
          const a = new Set(prev.map(key));
          const b = new Set(mapped.map(key));
          if (a.size === b.size) {
            let same = true;
            for (const k of a) { if (!b.has(k)) { same = false; break; } }
            if (same) return prev;
          }
          try { localStorage.setItem('closedTasks', JSON.stringify(mapped)); } catch {}
          return mapped;
        });
      } catch {}
      finally { inFlight = false; }
    };
    const id = window.setInterval(tick, 10_000);
    tick();
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);
  // Izračunaj mapo prioritet za vse naloge (vključno z zaključenimi)
  const prioritetaMapa = useMemo(() => {
    console.log('prioritetaMapa useMemo se izvaja, closedTasks:', closedTasks);
    const mapa = new Map<number, number>();
    
    // Funkcija za izračun prioritete z upoštevanjem zaprtih dodelav
    const izracunajPrioritetoZaprtih = (nalog: any): number => {
      if (nalog.status === 'zaključen' || nalog.dobavljeno) return 0;
      
      // Če ni določenega datuma, je prioriteta nizka (5)
      if (!nalog.podatki?.rokIzdelave) return 5;

      // Ura roka: uporabi ločeno polje, sicer poskusi pobrati iz datetime (SQL pogosto vrne ISO z uro)
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
      const pridobiRokUro = (): string => {
        const fromPodatkiRaw = normalizirajUro(nalog.podatki?.rokIzdelaveUra);
        if (fromPodatkiRaw) {
          return clampUraNaDelavnik(parseInt(fromPodatkiRaw.slice(0, 2), 10), parseInt(fromPodatkiRaw.slice(3, 5), 10));
        }
        return '15:00';
      };
      
      // Če nalog nima predizračunanih časov (casSekcije/casSekcije1/2), jih izračunaj iz trenutnih podatkov.
      // To je ključno, da se prioriteta (in barva) v seznamu shranjenih nalogov osvežuje ob zapiranju dodelav (closedTasks).
      let casSekcije = nalog.casSekcije;
      let casSekcije1 = nalog.casSekcije1;
      let casSekcije2 = nalog.casSekcije2;
      if (!casSekcije) {
        const computed = izracunajPrioriteto(nalog);
        casSekcije = computed.casSekcije;
        casSekcije1 = computed.casSekcije1;
        casSekcije2 = computed.casSekcije2;
      }
      
      const datumRoka = new Date(nalog.podatki.rokIzdelave);
      const danes = new Date();
      
      // Nastavi konec roka z uro
      let konecRoka = new Date(datumRoka);
      const uraStr = pridobiRokUro();
      const [ure, minute] = uraStr.split(':').map(Number);
      konecRoka.setHours(ure, minute, 0, 0);
      
      // Uporabi trenutni čas za izračun prioritete
      let zacetekDela = new Date(danes);
      
      // Če je trenutni čas po 15:00, začni z naslednjim delovnim dnem ob 7:00
      if (danes.getHours() >= 15) {
        zacetekDela = zacetekDelaNaslednjegaDne(danes);
      } else if (!jeDelovniDan(danes)) {
        // Če ni delovni dan, se rok začne naslednji delovni dan ob 7:00
        zacetekDela = zacetekDelaNaslednjegaDne(danes);
      } else {
        // Če je delovni dan pred 15:00, se rok začne ob trenutnem času
        zacetekDela = new Date(danes);
      }
      
      // Izračun delovnih ur do roka
      const delovneUreDoRoka = izracunajDelovneUre(zacetekDela, konecRoka);
      const preostaliCasDoRoka = Math.round(delovneUreDoRoka * 60); // pretvori v minute
      
      // Izračun skupnega časa brez zaprtih dodelav (uporabi part-specific čase, če obstajajo)
      const nalogZaCas = { ...nalog, casSekcije, casSekcije1, casSekcije2 };
      const skupniCasBrezZaprtih = izracunajSkupniCasBrezZaprtih(nalogZaCas, closedTasks);
      
      // Izračun prioritete: razlika med časom "do roka" in časom izdelave (brez zaprtih dodelav)
      const razlikaCas = preostaliCasDoRoka - skupniCasBrezZaprtih;
      
      if (razlikaCas < 0) return 1; // prekoračen rok
      if (razlikaCas <= 120) return 2; // rok izdelave med 0-2 h (120 min)
      if (razlikaCas <= 300) return 3; // rok izdelave med 2-5 h (300 min)
      if (razlikaCas <= 960) return 4; // rok izdelave med 5-16 h (960 min)
      return 5; // rok izdelave več od 16 h
    };

    vsiNalogi.forEach(nalog => {
      const prioritetaNaloga = izracunajPrioritetoZaprtih(nalog);
      mapa.set(nalog.stevilkaNaloga, prioritetaNaloga);
      
      // Debug: izpiši za nalog 65066
      if (nalog.stevilkaNaloga === 65066) {
        console.log('Nalog 65066 v prioritetaMapa:', {
          prioriteta: prioritetaNaloga,
          closedTasks: closedTasks.filter(t => t.stevilkaNaloga === 65066),
          skupniCasBrezZaprtih: izracunajSkupniCasBrezZaprtih(nalog, closedTasks)
        });
      }
    });

    // Dodaj trenutni nalog, če ni shranjen
    if (!nalogShranjeno && nalogPodatki) {
      const trenutniNalog = {
        stevilkaNaloga,
        podatki: nalogPodatki,
        status: zakljucen ? 'zaključen' : 'v teku',
        dobavljeno: dobavljeno
      };
      const prioritetaTrenutnega = izracunajPrioritetoZaprtih(trenutniNalog);
      mapa.set(stevilkaNaloga, prioritetaTrenutnega);
    }
    
    return mapa;
  }, [vsiNalogi, nalogShranjeno, nalogPodatki, stevilkaNaloga, zakljucen, dobavljeno, closedTasks]);

  // Debug: izpiši prioritetaMapa za nalog 65066
  console.log('prioritetaMapa za 65066:', prioritetaMapa?.get(65066), 'closedTasks:', closedTasks);

  const handleIzbrisiNalog = () => {
    if (gesloIzbris === '7474') {
      (async () => {
        try {
          const id = Number(stevilkaNaloga);
          const res = await fetch(`/api/delovni-nalog/${id}/clear`, { method: 'POST' });
          if (!res.ok) {
            const t = await res.text().catch(() => '');
            throw new Error(`Brisanje ni uspelo (HTTP ${res.status})${t ? `: ${t}` : ''}`);
          }
          // Preberi nazaj iz SQL in osveži UI + IndexedDB
          const resGet = await fetch(`/api/delovni-nalog/${id}`);
          if (resGet.ok) {
            const payload = await resGet.json();
            // Po /clear je namen brisanja/ponastavitve: lokalnih polj NE smemo ohraniti (material/cene/dodelave...),
            // zato tu naredimo "overwrite" v IndexedDB.
            try { await saveBatchToIndexedDB([payload]); } catch {}
            applyFromPayload(payload);
          } else {
            // Fallback: lokalno počisti
            setNalogPodatki({
              kupec: null,
              tisk: { tisk1: {}, tisk2: {} },
              dodelava1: {},
              dodelava2: {},
              stroski1: {},
              stroski2: {},
              posiljanje: {},
              komentar: {},
              emailPoslan: false,
              zakljucekEmailPoslan: false,
              datumNarocila: new Date().toISOString()
            } as any);
          }
          const refreshed = await loadByYearRange(currentYearFilter);
          setVsiNalogi(refreshed);
          setPrikaziIzbris(false);
          setGesloIzbris('');
          setGesloIzbrisNapaka('');
          setShowDeletedAnim(true);
          setTimeout(() => setShowDeletedAnim(false), 2000);
        } catch (e: any) {
          console.error('Brisanje naloga ni uspelo:', e);
          alert(`Brisanje ni uspelo: ${e?.message || e}`);
        }
      })();
    } else {
      setGesloIzbrisNapaka('Napačno geslo!');
    }
  };

  const handlePodatkiChange = (sekcija: keyof NalogPodatki, podatki: any) => {
    setNalogPodatki(prev => ({
      ...prev,
      [sekcija]: podatki
    }));
    setNalogShranjeno(false);
  };

  const handleDodelavaChange = (dodelava1: any, dodelava2: any) => {
    setNalogPodatki(prev => ({
      ...prev,
      dodelava1,
      dodelava2
    }));
    setNalogShranjeno(false);
  };

  const handleStroskiChange = (stroski1: any, stroski2: any) => {
    setNalogPodatki(prev => ({
      ...prev,
      stroski1,
      stroski2
    }));
    setNalogShranjeno(false);
  };

  const handleTiskChange = (tisk1: any, tisk2: any) => {
    setNalogPodatki(prev => ({
      ...prev,
      tisk: { tisk1, tisk2 }
    }));
    setNalogShranjeno(false);
  };

  const handleShraniNalog = async () => {
    const isNewId = !Number.isFinite(Number(stevilkaNaloga)) || Number(stevilkaNaloga) <= 0;
    // Združi z obstoječim, da se ob Ctrl+S ne prepišejo polja z null/undefined
    const obstojeci = isNewId ? null : vsiNalogi.find(n => n.stevilkaNaloga === stevilkaNaloga);
    const stariPodatki = obstojeci?.podatki || {};
    const mergePlain = (novObj: any, starObj: any) => {
      // Če je novObj eksplicitno null ali prazen objekt, to pomeni namerni "reset" -> počisti staro stanje
      if (novObj === null) return {};
      if (novObj && typeof novObj === 'object' && Object.keys(novObj).length === 0) return {};
      // Če oba manjkata, vrni prazen objekt
      if (!novObj && !starObj) return {};
      // Če novObj ni podan (undefined), ohrani staro stanje
      if (typeof novObj === 'undefined') return { ...(starObj || {}) };
      // Če ni starega, vrni novega
      if (!starObj) return { ...(novObj || {}) };
      return { ...starObj, ...novObj };
    };
    const mergeTisk = (novTisk: any, starTisk: any) => {
      // Namerni reset celotne sekcije tisk
      if (novTisk === null) {
        return { tisk1: {}, tisk2: {} };
      }
      const nT = novTisk || {};
      const sT = starTisk || {};
      return {
        tisk1: mergePlain(nT.tisk1, sT.tisk1),
        tisk2: mergePlain(nT.tisk2, sT.tisk2),
      };
    };
    const isManualKupec = (() => {
      const k = nalogPodatki.kupec as any;
      if (!k) return false;
      const id = Number(k.KupecID || 0);
      const hasNaziv = !!String(k.Naziv || '').trim();
      return !!k.rocniVnos || (hasNaziv && !Number.isFinite(id)) || (hasNaziv && id <= 0);
    })();

    const normalizeRok = (rokDateRaw: any, rokUraRaw: any, datumNarocilaRaw: any) => {
      const rokDate = String(rokDateRaw || '').trim(); // YYYY-MM-DD ali ''
      const rokUra = String(rokUraRaw || '').trim();   // HH:MM ali ''
      const hasDate = !!rokDate;
      const hasUra = /^\d{1,2}:\d{2}$/.test(rokUra);
      // nič nastavljeno -> pusti prazno, ne računaj prioritete
      if (!hasDate && !hasUra) return { rokIzdelave: '', rokIzdelaveUra: '' };
      // samo datum -> ura privzeto 15:00
      if (hasDate && !hasUra) return { rokIzdelave: rokDate, rokIzdelaveUra: '15:00' };
      // samo ura -> datum privzeto danes (ali datum naročila, če obstaja)
      if (!hasDate && hasUra) {
        const base = String(datumNarocilaRaw || '').trim();
        const d = base ? new Date(base) : new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return { rokIzdelave: `${y}-${m}-${day}`, rokIzdelaveUra: rokUra };
      }
      // oboje nastavljeno
      return { rokIzdelave: rokDate, rokIzdelaveUra: rokUra };
    };

    const mergedPodatki = {
      ...stariPodatki,
      ...nalogPodatki,
      // Pri ročno vpisanih kupcih NE deduj polj iz prejšnjih/shranjenih nalogov.
      // To prepreči bug: pri ročnem kupcu se je pokazal samo Naziv, ostala polja pa so "ostala" od prejšnjega naloga.
      kupec: isManualKupec ? (nalogPodatki.kupec || {}) : mergePlain(nalogPodatki.kupec, stariPodatki.kupec),
      tisk: mergeTisk(nalogPodatki.tisk, stariPodatki.tisk),
      dodelava1: mergePlain(nalogPodatki.dodelava1, stariPodatki.dodelava1),
      dodelava2: mergePlain(nalogPodatki.dodelava2, stariPodatki.dodelava2),
      stroski1: mergePlain(nalogPodatki.stroski1, stariPodatki.stroski1),
      stroski2: mergePlain(nalogPodatki.stroski2, stariPodatki.stroski2),
      posiljanje: mergePlain(nalogPodatki.posiljanje, stariPodatki.posiljanje),
      komentar: nalogPodatki.komentar ?? stariPodatki.komentar,
      datumNarocila: nalogPodatki.datumNarocila ?? stariPodatki.datumNarocila ?? new Date().toISOString(),
      ...normalizeRok(
        (nalogPodatki as any).rokIzdelave ?? (stariPodatki as any).rokIzdelave,
        (nalogPodatki as any).rokIzdelaveUra ?? (stariPodatki as any).rokIzdelaveUra,
        (nalogPodatki as any).datumNarocila ?? (stariPodatki as any).datumNarocila
      ),
      odprtjeEmailPonujen: nalogPodatki.odprtjeEmailPonujen ?? stariPodatki.odprtjeEmailPonujen ?? false,
      zakljucekEmailPonujen: nalogPodatki.zakljucekEmailPonujen ?? stariPodatki.zakljucekEmailPonujen ?? false
    };

    // Naj bo UI konsistenten z normalizacijo roka (posebej: "prazno" mora ostati prazno)
    if (
      mergedPodatki.rokIzdelave !== (nalogPodatki as any).rokIzdelave ||
      mergedPodatki.rokIzdelaveUra !== (nalogPodatki as any).rokIzdelaveUra ||
      !nalogPodatki.datumNarocila
    ) {
      setNalogPodatki(prev => ({
        ...prev,
        datumNarocila: mergedPodatki.datumNarocila,
        rokIzdelave: mergedPodatki.rokIzdelave,
        rokIzdelaveUra: mergedPodatki.rokIzdelaveUra,
      } as any));
    }

    // Email: avtomatski predogled naj se pokaže le 1x (pri prvi shrambI), tudi če uporabnik prekliče.
    // Ključ je, da "ponujeno" nastavimo PREDEN pošljemo v SQL, sicer se po reload-u ponovi.
    let openedEmailPreview = false;
    const offerZakljucek = (zakljucen || dobavljeno) &&
      !!nalogPodatki.kupec?.posljiEmail &&
      !!nalogPodatki.kupec?.email &&
      !mergedPodatki.zakljucekEmailPonujen;
    const offerOdprtje = (!zakljucen && !dobavljeno) &&
      !!nalogPodatki.kupec?.posljiEmail &&
      !!nalogPodatki.kupec?.email &&
      !mergedPodatki.odprtjeEmailPonujen;
    if (offerZakljucek) {
      mergedPodatki.zakljucekEmailPonujen = true;
      openedEmailPreview = true;
      setEmailHtml(generirajEmailHtml('zakljucek', nalogPodatki));
      setEmailVrsta('zakljucek');
      setPrikaziPredogledEmaila(true);
    } else if (offerOdprtje) {
      mergedPodatki.odprtjeEmailPonujen = true;
      openedEmailPreview = true;
      setEmailHtml(generirajEmailHtml('odprtje', nalogPodatki));
      setEmailVrsta('odprtje');
      setPrikaziPredogledEmaila(true);
    }
    if (offerZakljucek || offerOdprtje) {
      setNalogPodatki(prev => ({
        ...prev,
        odprtjeEmailPonujen: mergedPodatki.odprtjeEmailPonujen,
        zakljucekEmailPonujen: mergedPodatki.zakljucekEmailPonujen
      }));
    }

    if (!isNewId) {
      const novNalog = {
        stevilkaNaloga,
        podatki: mergedPodatki,
        datumShranjevanja: new Date().toISOString(),
        status: zakljucen ? 'zaključen' : 'v teku',
        dobavljeno: dobavljeno,
        emailPoslan: emailPoslan
      };
      const noviSeznam = [...vsiNalogi.filter(n => n.stevilkaNaloga !== stevilkaNaloga), novNalog].sort((a, b) => b.stevilkaNaloga - a.stevilkaNaloga);
      shraniNalogeVLokalno(noviSeznam);
      setVsiNalogi(noviSeznam);
      setNalogShranjeno(true);
      // Pomembno: posodobi tudi IndexedDB, da se rok/ura ne "povrne" pri menjavi let ali ponovnem zagonu.
      try {
        await saveBatchToIndexedDB([{
          stevilkaNaloga,
          podatki: mergedPodatki,
          status: dobavljeno ? 'dobavljeno' : (zakljucen ? 'zaključen' : 'v_delu'),
          dobavljeno: !!dobavljeno,
          tiskZakljucen1: !!tiskZakljucen1,
          tiskZakljucen2: !!tiskZakljucen2,
          datumNarocila: mergedPodatki?.datumNarocila || new Date().toISOString(),
          rokIzdelave: mergedPodatki?.rokIzdelave || null,
          datumShranjevanja: new Date().toISOString()
        }]);
      } catch {}
    } else {
      // Pri novem nalogu (ID=0) NE shranjuj v localStorage/IndexedDB z ID=0.
      // Po uspešnem SQL insertu dobimo pravi ID in takrat osvežimo seznam.
      setNalogShranjeno(true);
    }
    // Async: posodobi ali ustvari tudi v SQL bazi in TAKOJ osveži IndexedDB/UI
    const saveFor = stevilkaNaloga;
    const saveSeq = ++saveSeqRef.current;
    await (async () => {
      try {
        // Za SQL shranjevanje vedno uporabi merge (da se ne izgubijo polja, ki jih kupec iz baze ne vsebuje)
        const podatkiZaSql = mergedPodatki;
        const kupecID = podatkiZaSql?.kupec?.KupecID;
          const buildXml = (tisk: any = {}, dodelava: any = {}, stroski: any = {}) => {
            const gramMatch = (tisk?.material || '').toString().match(/(\d{2,4})\s*g/);
            const gram = gramMatch ? parseInt(gramMatch[1], 10) : undefined;
            return {
              predmet: tisk?.predmet || '',
              format: tisk?.format || '',
              obseg: tisk?.obseg || '',
              steviloKosov: tisk?.steviloKosov || '',
              steviloPol: tisk?.steviloPol || '',
              kosovNaPoli: tisk?.kosovNaPoli || '',
              material: tisk?.material || '',
              barve: tisk?.barve || '',
              gramatura: gram,
              uvTisk: dodelava?.uvTisk || '',
              uvLak: dodelava?.uvLak || '',
              plastifikacija: dodelava?.plastifikacija || '',
              izsek: dodelava?.izsek || '',
              zgibanje: !!dodelava?.zgibanje,
              biganje: !!dodelava?.biganje,
              perforacija: !!dodelava?.perforacija,
              vezava: dodelava?.vezava || '',
              razrez: !!dodelava?.razrez,
              vPolah: !!dodelava?.vPolah,
              cenaBrezDDV: stroski?.cenaBrezDDV,
              graficnaPriprava: stroski?.graficnaPriprava
            };
          };
          const xml1 = buildXml(podatkiZaSql?.tisk?.tisk1, podatkiZaSql?.dodelava1, podatkiZaSql?.stroski1);
          const xml2 = buildXml(podatkiZaSql?.tisk?.tisk2, podatkiZaSql?.dodelava2, podatkiZaSql?.stroski2);
          const pos = podatkiZaSql?.posiljanje || {};
          const buildRokIzdelaveForSql = () => {
            const dRaw = (podatkiZaSql?.rokIzdelave || '').toString().trim();
            if (!dRaw) return '';
            // Če je že ISO/datetime, ga pusti.
            if (/^\d{4}-\d{2}-\d{2}T/.test(dRaw)) return dRaw;
            // UI hrani datum in uro ločeno: datum (YYYY-MM-DD) + rokIzdelaveUra (HH:mm)
            const t = (podatkiZaSql?.rokIzdelaveUra || '').toString().trim() || '15:00';
            if (/^\d{4}-\d{2}-\d{2}$/.test(dRaw) && /^\d{2}:\d{2}$/.test(t)) {
              return `${dRaw}T${t}:00`;
            }
            return dRaw;
          };
          // “FULL” upsert na /api/delovni-nalog/full
          const fullBody: any = {
            kupec: podatkiZaSql?.kupec || null,
            kontakt: podatkiZaSql?.kontakt || null,
            komentar: (typeof podatkiZaSql?.komentar === 'string') ? { komentar: podatkiZaSql?.komentar } : (podatkiZaSql?.komentar || {}),
            tisk: podatkiZaSql?.tisk || { tisk1: {}, tisk2: {} },
            dodelava1: podatkiZaSql?.dodelava1 || {},
            dodelava2: podatkiZaSql?.dodelava2 || {},
            stroski1: podatkiZaSql?.stroski1 || {},
            stroski2: podatkiZaSql?.stroski2 || {},
            posiljanje: pos || {},
            datumNarocila: podatkiZaSql?.datumNarocila || '',
            rokIzdelave: buildRokIzdelaveForSql(),
            rokIzdelaveUra: podatkiZaSql?.rokIzdelaveUra || '',
            // status flags + datumi za izvoz
            dobavljeno: !!dobavljeno,
            tiskZakljucen1: !!tiskZakljucen1,
            tiskZakljucen2: !!tiskZakljucen2,
            tiskZakljucenAt: podatkiZaSql?.tiskZakljucenAt || '',
            dobavljenoAt: podatkiZaSql?.dobavljenoAt || '',
            // AI learning: connect this nalog with the originating AI parse run (if any)
            aiRunId: (podatkiZaSql as any)?.aiRunId ?? aiRunId ?? null,
            skupnaCena: !!(podatkiZaSql as any)?.skupnaCena,
            reklamacija: podatkiZaSql?.reklamacija || null
          };
          if (!isNewId) {
            // Update obstoječega
            fullBody.delovniNalogID = stevilkaNaloga; // v tej bazi je št. naloga = ID
            fullBody.stevilkaNaloga = stevilkaNaloga;
          }
          // Dodatna header polja pošlji tudi eksplicitno (da se ne izgubijo pri kupcu iz baze)
          fullBody.narocilnica = (podatkiZaSql?.kupec && typeof podatkiZaSql.kupec.narocilnica !== 'undefined')
            ? podatkiZaSql.kupec.narocilnica
            : null;
          fullBody.kontaktEmail = (podatkiZaSql?.kupec && (podatkiZaSql.kupec.email || (podatkiZaSql.kupec as any).Email))
            ? (podatkiZaSql.kupec.email || (podatkiZaSql.kupec as any).Email)
            : null;
          fullBody.posljiEmail = !!(podatkiZaSql?.kupec && (podatkiZaSql.kupec.posljiEmail || (podatkiZaSql.kupec as any).PosljiEmail));
          // Email indikatorji + "ponujeno" (persist v SQL)
          fullBody.emailPoslan = !!podatkiZaSql?.emailPoslan;
          fullBody.zakljucekEmailPoslan = !!podatkiZaSql?.zakljucekEmailPoslan;
          fullBody.odprtjeEmailPonujen = !!podatkiZaSql?.odprtjeEmailPonujen;
          fullBody.zakljucekEmailPonujen = !!podatkiZaSql?.zakljucekEmailPonujen;
          // Statusi zaključevanja: ločeno za tisk 1 / tisk 2
          fullBody.tiskZakljucen1 = !!tiskZakljucen1;
          fullBody.tiskZakljucen2 = !!tiskZakljucen2;
          fullBody.tiskZakljucen = !!(tiskZakljucen1 && tiskZakljucen2);
          fullBody.dobavljeno = !!dobavljeno;
          fullBody.status = dobavljeno ? 'dobavljeno' : ((tiskZakljucen1 && tiskZakljucen2) ? 'zaključen' : 'v_delu');
          if (nalogPodatki?.reklamacija) fullBody.reklamacija = nalogPodatki.reklamacija;
          let stevilkaServer = stevilkaNaloga;
          const resFull = await fetch('/api/delovni-nalog/full', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fullBody)
          });
          if (!resFull.ok) {
            // Včasih backend (ali middleware) vrne HTML error stran. Poskusi prebrati JSON, sicer skrajšaj in očisti HTML.
            const raw = await resFull.text().catch(() => '');
            let detail = raw;
            try {
              const asJson = JSON.parse(raw);
              detail = asJson?.error || asJson?.details || raw;
            } catch {}
            // odstrani HTML tage (za bolj berljivo opozorilo)
            detail = String(detail || '')
              .replace(/<[^>]*>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 400);
            // Če SQL ni dosegljiv (npr. localhost:1433), naj se nalog vseeno shrani lokalno brez "blokirajočega" alerta.
            // (SQL sync je best-effort; uporabnik je poročal, da se nalog kljub temu shrani.)
            if (/ConnectionError|Failed to connect/i.test(detail)) {
              console.warn(`FULL upsert preskočen (SQL nedosegljiv) HTTP ${resFull.status}:`, detail);
              return; // prekini SQL del; lokalno shranjevanje se nadaljuje brez napake
            }
            throw new Error(`FULL upsert ni uspel (HTTP ${resFull.status})${detail ? `: ${detail}` : ''}`);
          }
          const dataFull = await resFull.json().catch(() => ({} as any));
          if (dataFull?.delovniNalogID && Number.isFinite(Number(dataFull.delovniNalogID))) {
            stevilkaServer = Number(dataFull.delovniNalogID);
            if (openNalogRef.current === saveFor && saveSeq === saveSeqRef.current) {
              setStevilkaNaloga(stevilkaServer);
            }
          }
          // Po shranjevanju takoj preberi nazaj iz SQL in osveži UI + IndexedDB (tako vemo, da je res zapisano)
          try {
            const resGet = await fetch(`/api/delovni-nalog/${stevilkaServer}`);
            if (resGet.ok) {
              const payload = await resGet.json();
              // Detekcija: če SQL ne vrne istih ključnih polj, opozori
              const expNar = (podatkiZaSql?.kupec && typeof (podatkiZaSql.kupec as any).narocilnica !== 'undefined') ? String((podatkiZaSql.kupec as any).narocilnica || '') : '';
              const expEmail = (podatkiZaSql?.kupec && (typeof (podatkiZaSql.kupec as any).email !== 'undefined' || typeof (podatkiZaSql.kupec as any).Email !== 'undefined'))
                ? String(((podatkiZaSql.kupec as any).email || (podatkiZaSql.kupec as any).Email) || '')
                : '';
              const expPoslji = !!(podatkiZaSql?.kupec && ((podatkiZaSql.kupec as any).posljiEmail || (podatkiZaSql.kupec as any).PosljiEmail));
              const gotNar = payload?.kupec && (typeof (payload.kupec as any).narocilnica !== 'undefined' || typeof (payload.kupec as any).Narocilnica !== 'undefined')
                ? String((((payload.kupec as any).narocilnica ?? (payload.kupec as any).Narocilnica) || ''))
                : '';
              const gotEmail = payload?.kupec && (typeof (payload.kupec as any).email !== 'undefined' || typeof (payload.kupec as any).Email !== 'undefined')
                ? String((((payload.kupec as any).email ?? (payload.kupec as any).Email) || ''))
                : '';
              const gotPoslji = !!(payload?.kupec && (((payload.kupec as any).posljiEmail || (payload.kupec as any).PosljiEmail)));
              // Ne blokiraj shranjevanja zaradi razlik v shemi/ključih (npr. Email vs email).
              // Če se vrednosti res razlikujejo, označi kot "ni potrjeno", ampak še vedno osveži seznam.
              if (expNar !== gotNar || expEmail !== gotEmail || expPoslji !== gotPoslji) {
                if (openNalogRef.current === saveFor && saveSeq === saveSeqRef.current) {
                  setNalogShranjeno(false);
                }
                console.warn('SQL ni potrdil vseh dodatnih polj (narocilnica/email/posljiEmail). Nadaljujem z osvežitvijo seznama.', { expNar, gotNar, expEmail, gotEmail, expPoslji, gotPoslji });
              }
              // SQL odgovor lahko ne vsebuje vseh lokalnih polj -> merge v IndexedDB
              try { await saveBatchToIndexedDBPreserveExisting([payload]); } catch {}
              if (openNalogRef.current === saveFor && saveSeq === saveSeqRef.current) {
                applyFromPayload(payload);
              }
            }
          } catch {}
          // Osveži prikaz glede na aktivni filter let
          const refreshed = await loadByYearRange(currentYearFilter);
          setVsiNalogi(refreshed);
      } catch (e: any) {
        console.warn('SQL shranjevanje ni uspelo:', e);
        const msg = (e && e.message) ? e.message : 'Shranjevanje v SQL ni uspelo. Preveri povezavo z bazo.';
        // Ne prikazuj alarmantnega alerta za "SQL nedosegljiv" – nalog je praviloma že shranjen lokalno (IndexedDB).
        if (!/ConnectionError|Failed to connect/i.test(String(msg))) {
          alert(msg);
        }
      }
    })();
    return openedEmailPreview;
  };

  const handlePosljiEmail = (vrsta: 'odprtje'|'zakljucek') => {
    setEmailVrsta(vrsta);
    setEmailHtml(generirajEmailHtml(vrsta, nalogPodatki));
    setPrikaziPredogledEmaila(true);
  };

  const potrdiPosljiEmail = async () => {
    try {
      setEmailNapaka('');
      const html = (emailHtml || '').toString();
      if (!html.trim()) {
        throw new Error('Email vsebina je prazna.');
      }
      const to = String(nalogPodatki.kupec?.email || '').trim();
      if (!to || !to.includes('@')) {
        const msg = 'Neveljaven email: vpiši vsaj znak @.';
        setEmailNapaka(msg);
        throw new Error(msg);
      }
      const res = await fetch('/api/poslji-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject: emailVrsta === 'odprtje'
            ? `Obvestilo o odprtju delovnega naloga ${nalogPodatki.stevilkaNaloga || stevilkaNaloga || ''}`
            : `Zaključen delovni nalog ${nalogPodatki.stevilkaNaloga || stevilkaNaloga || ''}`,
          html
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));
        const extra = [data?.code, data?.details, data?.address && `addr=${data.address}`, data?.port && `port=${data.port}`, data?.command && `cmd=${data.command}`].filter(Boolean).join(' | ');
        const msg = data?.error || `Pošiljanje ni uspelo (HTTP ${res.status})`;
        throw new Error(extra ? `${msg} — ${extra}` : msg);
      }
      setPrikaziPredogledEmaila(false);
      // Če je bilo v ozadju načrtovano odpiranje drugega naloga, ga izvedi šele po zaprtju emaila.
      const after = afterEmailCloseActionRef.current;
      afterEmailCloseActionRef.current = null;
      if (after) setTimeout(() => after(), 0);
      if (emailVrsta === 'odprtje') {
        setEmailPoslan(true);
        setNalogPodatki(prev => ({ ...prev, odprtjeEmailPonujen: true, emailPoslan: true }));
      }
      if (emailVrsta === 'zakljucek') {
        setZakljucekEmailPoslan(true);
        setNalogPodatki(prev => ({ ...prev, zakljucekEmailPonujen: true, zakljucekEmailPoslan: true }));
      }
      // Prikaži kratko obvestilo (toast) in se samodejno skrij po ~1s
      setShowEmailAnim(true);
      setTimeout(() => setShowEmailAnim(false), 1000);
    } catch (e: any) {
      console.error('Napaka pri pošiljanju e-maila:', e);
      setEmailNapaka(e?.message ? String(e.message) : 'Email ni bil poslan.');
      alert(`Napaka pri pošiljanju e-maila: ${e?.message || e}`);
    }
  };

  const handleDobavljenoChangeChecked = (checked: boolean) => {
    setNalogShranjeno(false);
    if (checked) {
      // Preveri cene, če je vpisan predmet. Pri "Skupna cena" zadostuje vsaj eno polje.
      const imaPredmet = !!(nalogPodatki?.tisk?.tisk1?.predmet || nalogPodatki?.tisk?.tisk2?.predmet);
      const st1 = nalogPodatki?.stroski1 || {};
      const st2 = nalogPodatki?.stroski2 || {};
      const imaCeno = !!(
        st1.graficnaPriprava || st1.cenaKlišeja || st1.cenaIzsekovalnegaOrodja || st1.cenaVzorca || st1.cenaBrezDDV ||
        st2.graficnaPriprava || st2.cenaKlišeja || st2.cenaIzsekovalnegaOrodja || st2.cenaVzorca || st2.cenaBrezDDV
      );
      if (imaPredmet && !imaCeno) {
        const proceed = window.confirm('Delovnem nalogu manjka cena. Kliknite V redu za nadaljevanje ali Prekliči za dodajanje cene.');
        if (!proceed) {
          // Pomakni na sekcijo Stroški
          setTimeout(() => stroskiRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
          return;
        }
      }
      setDobavljeno(true);
      setZaklenjeno(true);
      setNalogPodatki((prev: any) => ({
        ...prev,
        dobavljenoAt: prev.dobavljenoAt || new Date().toISOString()
      }));
    } else {
      // Ne odkleni takoj - pokaži popup vnos kode (auto-focus + Enter potrdi)
      setDobavljenoUnlockCode('');
      setDobavljenoUnlockNapaka('');
      setShowDobavljenoUnlockPrompt(true);
    }
  };

  // Auto-save "Dobavljeno": počakaj, da React res nastavi dobavljeno + dobavljenoAt,
  // sicer bi v SQL poslali staro vrednost (in checkbox samo utripne).
  useEffect(() => {
    if (!dobavljeno) return;
    const at = (nalogPodatki as any)?.dobavljenoAt;
    if (!at) return;
    const key = `${stevilkaNaloga || ''}|${String(at)}`;
    if (pendingDobavljenoSaveRef.current === key) return;
    pendingDobavljenoSaveRef.current = key;
    if (prikaziUnsavedModal || prikaziPredogledEmaila) return;
    try { handleShraniNalog(); } catch {}
  }, [dobavljeno, (nalogPodatki as any)?.dobavljenoAt, stevilkaNaloga, prikaziUnsavedModal, prikaziPredogledEmaila]);

  const handleZakleniNalog = () => {
    setZaklenjeno(true);
    alert('Delovni nalog je bil zaklenjen. Za odklepanje uporabite gumb "Dobavljeno" z kodo 7474.');
  };

  // Enoten "apply" za podatke iz SQL (GET /api/delovni-nalog/:id) ali iz IndexedDB payload-a
  const applyFromPayload = (payload: any) => {
    const sanitizeNaziv = (s: any) => {
      if (s == null) return s;
      let out = String(s);
      // Normalizacija presledkov in vejic (da je de-dupe zanesljiv)
      out = out.replace(/\s+/g, ' ');
      out = out.replace(/\s*,\s*/g, ', ');
      out = out.trim().replace(/^[,\s-]+|[,\s-]+$/g, '');
      // Fix: včasih se po refreshu podvoji naziv (npr. "MEDIS, d.o.o., MEDIS, d.o.o.")
      const tryDedup = (sep: string) => {
        const L = out.length;
        const sL = sep.length;
        if (L <= 0) return false;
        if ((L - sL) % 2 !== 0) return false;
        const aLen = (L - sL) / 2;
        if (aLen <= 0) return false;
        if (out.slice(aLen, aLen + sL) !== sep) return false;
        const a = out.slice(0, aLen).trim();
        const b = out.slice(aLen + sL).trim();
        if (a && b && a === b) {
          out = a;
          return true;
        }
        return false;
      };
      // Najpogostejši separatorji med duplikatoma
      tryDedup(', ') || tryDedup(',') || tryDedup(' ');
      // Ponovno počisti robove po morebitni spremembi
      out = out.trim().replace(/^[,\s-]+|[,\s-]+$/g, '');
      return out;
    };
    const toDateInput = (v: any) => {
      if (!v) return '';
      const s = String(v).trim();
      if (s === '') return '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return '';
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const toTimeInput = (v: any) => {
      if (!v) return '';
      const s = String(v).trim();
      if (/^\d{2}:\d{2}$/.test(s)) return s;
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return '';
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    };
    const normalizeTiskDates = (t: any) => {
      const obj = { ...(t || {}) };
      if (obj.rokKooperanta) obj.rokKooperanta = toDateInput(obj.rokKooperanta);
      if (Array.isArray(obj.mutacije)) {
        const n = obj.mutacije.length;
        if (!obj.steviloMutacij && n > 0) obj.steviloMutacij = String(n);
      }
      return obj;
    };
    const normalizeDodelavaKooperantDates = (d: any) => {
      const out = { ...(d || {}) };
      for (let k = 1; k <= 3; k++) {
        const key = `kooperant${k}Podatki`;
        const cur = out[key];
        if (cur && typeof cur === 'object') {
          out[key] = { ...cur, predvidenRok: toDateInput(cur.predvidenRok) };
        }
      }
      return out;
    };
    // Payload je lahko iz seznama v obliki { stevilkaNaloga, podatki: {...} }.
    // Vedno ohrani ID na vrhu, sicer pri "full" re-apply-u ne vemo, ali gre za isti nalog in material lahko "u-tripne" na prazno.
    const wrapperStev = (payload && (payload.stevilkaNaloga ?? payload.delovniNalogID)) ?? null;
    const pRawCandidate = (payload && payload.podatki && Object.keys(payload.podatki).length > 0) ? payload.podatki : payload;
    const pRaw = pRawCandidate || {};
    const normalizedKupec = (() => {
      const k = pRaw?.kupec;
      if (!k) return k;
      const kk: any = { ...(k || {}) };
      kk.Naziv = sanitizeNaziv(kk.Naziv);
      const id = Number(kk.KupecID || 0);
      const hasNaziv = !!String(kk.Naziv || '').trim();
      // Hevristika: če ni KupecID in je naziv vpisan, obravnavaj kot ročni vnos
      if (hasNaziv && (!Number.isFinite(id) || id <= 0)) {
        kk.rocniVnos = true;
        kk.KupecID = 0;
      }
      return kk;
    })();

    const p = {
      ...pRaw,
      // preferiraj eksplicitno stevilko iz payload, fallback na wrapper
      stevilkaNaloga: (pRaw?.stevilkaNaloga ?? pRaw?.delovniNalogID ?? wrapperStev ?? null),
      delovniNalogID: (pRaw?.delovniNalogID ?? pRaw?.stevilkaNaloga ?? wrapperStev ?? null),
      kupec: normalizedKupec
    };
    const tiskRaw = p?.tisk && (p.tisk.tisk1 || p.tisk.tisk2) ? p.tisk : { tisk1: {}, tisk2: {} };
    let tisk = { ...tiskRaw, tisk1: normalizeTiskDates(tiskRaw?.tisk1), tisk2: normalizeTiskDates(tiskRaw?.tisk2) };
    const d1Raw = p?.dodelava1 || p?.dodelava?.dodelava1 || {};
    const d2Raw = p?.dodelava2 || p?.dodelava?.dodelava2 || {};
    const d1 = normalizeDodelavaKooperantDates(d1Raw);
    const d2 = normalizeDodelavaKooperantDates(d2Raw);
    const s1 = p?.stroski1 || p?.stroski?.stroski1 || {};
    const s2 = p?.stroski2 || p?.stroski?.stroski2 || {};
    const rokDate = toDateInput(p?.rokIzdelave ?? payload?.rokIzdelave);
    // Ura roka: če manjka, privzeto 15:00 (konec delavnika) – to velja tudi za stare naloge, kjer ure ni bilo.
    const rokTime = (p?.rokIzdelaveUra && /^\d{2}:\d{2}$/.test(String(p.rokIzdelaveUra))) ? String(p.rokIzdelaveUra) : '';
    setNalogPodatki((prev: any) => {
      const nextId =
        (p as any)?.stevilkaNaloga ??
        (p as any)?.delovniNalogID ??
        (payload as any)?.stevilkaNaloga ??
        (payload as any)?.delovniNalogID ??
        null;
      const prevId =
        prev?.stevilkaNaloga ??
        prev?.delovniNalogID ??
        null;
      const sameNalog = String(prevId || '') !== '' && String(nextId || '') !== '' && String(prevId) === String(nextId);

      const prevT1 = prev?.tisk?.tisk1?.material;
      const prevT2 = prev?.tisk?.tisk2?.material;
      const inT1 = (tisk as any)?.tisk1?.material;
      const inT2 = (tisk as any)?.tisk2?.material;
      const mergedTisk = {
        ...(tisk as any),
        tisk1: {
          ...((tisk as any)?.tisk1 || {}),
          // Ne "podeduj" materiala iz drugega naloga. Fallback je dovoljen samo,
          // ko se isti nalog ponovno apply-a (npr. list → full GET).
          material: String(inT1 || '').trim() ? inT1 : (sameNalog && String(prevT1 || '').trim() ? prevT1 : ''),
        },
        tisk2: {
          ...((tisk as any)?.tisk2 || {}),
          material: String(inT2 || '').trim() ? inT2 : (sameNalog && String(prevT2 || '').trim() ? prevT2 : ''),
        },
      };
      return {
        ...p,
        tisk: mergedTisk,
        dodelava1: d1,
        dodelava2: d2,
        stroski1: s1,
        stroski2: s2,
        posiljanje: p?.posiljanje || {},
        komentar: p?.komentar || {},
        rokIzdelave: rokDate || '',
        rokIzdelaveUra: (rokDate ? (rokTime || '15:00') : ''),
        datumNarocila: (p?.datumNarocila ?? payload?.datumNarocila ?? payload?.datumShranjevanja ?? new Date().toISOString()),
        skupnaCena: (payload?.skupnaCena ?? p?.skupnaCena) === true
      } as any;
    });
    setNalogShranjeno(true);
    setEmailPoslan(!!payload?.emailPoslan);
    setZakljucekEmailPoslan(!!payload?.zakljucekEmailPoslan);
    const toBool = (v: any) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
    const fromStatus = payload?.status === 'zaključen';
    const fromZaklj = toBool(payload?.zakljucen) || toBool(payload?.TiskZakljucen) || toBool(payload?.podatki?.TiskZakljucen);
    const t1 = toBool(payload?.tiskZakljucen1) || toBool(payload?.TiskZakljucen1) || toBool(payload?.podatki?.TiskZakljucen1) || toBool(payload?.podatki?.tiskZakljucen1);
    const t2 = toBool(payload?.tiskZakljucen2) || toBool(payload?.TiskZakljucen2) || toBool(payload?.podatki?.TiskZakljucen2) || toBool(payload?.podatki?.tiskZakljucen2);
    const full = !!(fromStatus || fromZaklj || (t1 && t2));
    setTiskZakljucen1(full ? true : t1);
    setTiskZakljucen2(full ? true : t2);
    setZakljucen(full);
    setDobavljeno(!!payload?.dobavljeno);
    setZaklenjeno(!!payload?.dobavljeno);
  };

  const loadCenikPendingImports = async () => {
    try {
      const res = await fetch('/api/cenik-import/pending');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({} as any));
      const items = Array.isArray(data?.items) ? data.items : [];
      setCenikPendingImports(items);
      setCenikSelectedIds((prev) => prev.filter((id) => items.some((it: any) => it.importId === id)));
      setCenikImportError('');
    } catch (e: any) {
      setCenikImportError(e?.message || 'Napaka pri nalaganju uvozov iz Cenikov.');
    }
  };

  useEffect(() => {
    if (aktivniZavihek !== 'kapacitete') return;
    loadCenikPendingImports();
    const t = window.setInterval(() => { loadCenikPendingImports(); }, 10000);
    return () => window.clearInterval(t);
  }, [aktivniZavihek]);

  const toggleCenikSelection = (importId: string) => {
    setCenikSelectedIds((prev) => {
      if (prev.includes(importId)) return prev.filter((x) => x !== importId);
      if (prev.length >= 2) return prev;
      return [...prev, importId];
    });
  };

  const toYmdLocal = (v: any) => {
    const s = String(v || '').trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const toHmLocal = (v: any) => {
    const s = String(v || '').trim();
    if (!s) return '';
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return '';
    const hh = Number(m[1]); const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };
  const rokToMs = (rok: any, ura: any) => {
    const d = toYmdLocal(rok);
    if (!d) return Number.POSITIVE_INFINITY;
    const t = toHmLocal(ura) || '15:00';
    const dt = new Date(`${d}T${t}:00`);
    const ms = dt.getTime();
    return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
  };

  /** Zaokroži HH:mm na najbližji 15-min interval; omeji na območje 07:00–14:45 (kot v selectu rok izdelave). */
  const roundToNearestRokUra = (hm: string): string => {
    const parsed = toHmLocal(hm);
    if (!parsed) return '15:00';
    const [h, m] = parsed.split(':').map(Number);
    const totalMins = h * 60 + m;
    const roundedMins = Math.round(totalMins / 15) * 15;
    const clamped = Math.max(7 * 60, Math.min(14 * 60 + 45, roundedMins));
    const hOut = Math.floor(clamped / 60);
    const mOut = clamped % 60;
    return `${String(hOut).padStart(2, '0')}:${String(mOut).padStart(2, '0')}`;
  };

  const rpToPart = (rp: any) => {
    const tisk = rp?.tisk && typeof rp.tisk === 'object' ? rp.tisk : {};
    const dodelava = rp?.dodelava && typeof rp.dodelava === 'object' ? rp.dodelava : {};
    const stroski = rp?.stroski && typeof rp.stroski === 'object' ? rp.stroski : {};
    return {
      tisk: tisk?.tisk1 || {},
      dodelava: dodelava?.dodelava1 || rp?.dodelava1 || {},
      stroski: stroski?.stroski1 || rp?.stroski1 || {},
    };
  };

  const buildNalogFromCenikImports = (razbraniList: any[]) => {
    const first = razbraniList[0] || {};
    const second = razbraniList[1] || null;
    const p1 = rpToPart(first);
    const p2 = second ? rpToPart(second) : { tisk: {}, dodelava: {}, stroski: {} };

    const rokCandidates = razbraniList
      .map((rp) => ({ rok: toYmdLocal(rp?.rokIzdelave), ura: toHmLocal(rp?.rokIzdelaveUra) || '15:00', ms: rokToMs(rp?.rokIzdelave, rp?.rokIzdelaveUra) }))
      .filter((x) => x.rok);
    rokCandidates.sort((a, b) => a.ms - b.ms);
    const nearest = rokCandidates[0] || { rok: '', ura: '' };

    const komentarObj = (first?.komentar && typeof first.komentar === 'object')
      ? { ...first.komentar }
      : { komentar: String(first?.komentar || '') };
    if (first?._cenikMeta) {
      (komentarObj as any)._cenikMeta = first._cenikMeta;
    }
    if (second?._cenikMeta) {
      (komentarObj as any)._cenikMeta2 = second._cenikMeta;
    }

    return {
      kupec: first?.kupec || {},
      kontakt: first?.kontakt || {},
      tisk: {
        tisk1: { obseg: '1', steviloMutacij: '1', mutacije: [{ steviloPol: '' }], ...(p1.tisk || {}) },
        tisk2: { obseg: '1', steviloMutacij: '1', mutacije: [{ steviloPol: '' }], ...(p2.tisk || {}) },
      },
      dodelava1: p1.dodelava || {},
      dodelava2: p2.dodelava || {},
      stroski1: p1.stroski || {},
      stroski2: p2.stroski || {},
      posiljanje: first?.posiljanje || {},
      komentar: komentarObj,
      datumNarocila: first?.datumNarocila || new Date().toISOString(),
      rokIzdelave: nearest.rok || '',
      rokIzdelaveUra: nearest.rok ? roundToNearestRokUra(nearest.ura || '15:00') : '',
      emailPoslan: false,
      zakljucekEmailPoslan: false,
      odprtjeEmailPonujen: false,
      zakljucekEmailPonujen: false,
    } as any;
  };

  const handleRejectCenikImport = async (importId: string) => {
    try {
      setCenikImportBusy(true);
      setCenikImportError('');
      const res = await fetch(`/api/cenik-import/${encodeURIComponent(importId)}/reject`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadCenikPendingImports();
      setCenikSelectedIds((prev) => prev.filter((x) => x !== importId));
    } catch (e: any) {
      setCenikImportError(e?.message || 'Napaka pri zavrnitvi uvoza.');
    } finally {
      setCenikImportBusy(false);
    }
  };

  const handleConfirmSelectedCenikImports = async () => {
    if (!cenikSelectedIds.length) return;
    try {
      setCenikImportBusy(true);
      setCenikImportError('');
      const detailResults = await Promise.all(
        cenikSelectedIds.map(async (id) => {
          const res = await fetch(`/api/cenik-import/${encodeURIComponent(id)}`);
          if (!res.ok) throw new Error(`Detajl importa ${id} ni dosegljiv (HTTP ${res.status})`);
          const data = await res.json().catch(() => ({} as any));
          return data?.item;
        })
      );
      const razbraniList = detailResults
        .map((it: any) => it?.payload?.razbraniPodatki)
        .filter((x: any) => x && typeof x === 'object');
      if (!razbraniList.length) throw new Error('Ni veljavnih payload podatkov za uvoz.');

      await Promise.all(cenikSelectedIds.map(async (id) => {
        const res = await fetch(`/api/cenik-import/${encodeURIComponent(id)}/confirm`, { method: 'POST' });
        if (!res.ok) throw new Error(`Potrditev importa ${id} ni uspela (HTTP ${res.status})`);
      }));

      const noviNalog = buildNalogFromCenikImports(razbraniList.slice(0, 2));
      setStevilkaNaloga(0 as any);
      setNalogPodatki(noviNalog);
      setKey(prev => prev + 1);
      setNalogShranjeno(false);
      setEmailPoslan(false);
      setZakljucekEmailPoslan(false);
      setZakljucen(false);
      setTiskZakljucen1(false);
      setTiskZakljucen2(false);
      setDobavljeno(false);
      setZaklenjeno(false);
      setAktivniZavihek('delovniNalog');
      setCenikSelectedIds([]);
      await loadCenikPendingImports();
      if (obrazecRef.current) {
        obrazecRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (e: any) {
      setCenikImportError(e?.message || 'Napaka pri potrditvi uvoza.');
    } finally {
      setCenikImportBusy(false);
    }
  };

  // Odpiranje naloga iz seznama
  const handleIzberiNalog = (nalog: any) => {
    if (skipAutoSaveOnceRef.current) {
      skipAutoSaveOnceRef.current = false;
    } else if (!jeNalogPrazen(nalogPodatki) && !nalogShranjeno) {
      handleShraniNalog();
    }
    const selId = Number(nalog.stevilkaNaloga);
    setStevilkaNaloga(selId);
    // Vedno poskusi prebrati "full" iz backend-a, ker import/list lahko vrne nepopoln zapis
    // (in s tem bi se po refreshu zdelo, kot da se polja niso shranila).
    applyFromPayload(nalog);
    (async () => {
      try {
        const res = await fetch(`/api/delovni-nalog/${selId}`);
        if (res.ok) {
          const payload = await res.json();
          try { await saveBatchToIndexedDBPreserveExisting([payload]); } catch {}
          applyFromPayload(payload);
        }
      } catch {}
    })();
  };

  // Novi nalog
  const handleNoviNalog = () => {
    if (skipAutoSaveOnceRef.current) {
      skipAutoSaveOnceRef.current = false;
    } else if (!nalogShranjeno) {
      handleShraniNalog();
    }
    // Nov nalog: ne ugibaj številke iz seznama (ni zanesljivo pri veliko letih).
    // Številko/ID dobiš ob prvem shranjevanju iz SQL (identity).
    setStevilkaNaloga(0 as any);
    setNalogPodatki({
      kupec: null,
      // Default: obseg=1, mutacije=1
      tisk: {
        tisk1: { obseg: '1', steviloMutacij: '1', mutacije: [{ steviloPol: '' }] } as any,
        tisk2: { obseg: '1', steviloMutacij: '1', mutacije: [{ steviloPol: '' }] } as any,
      },
      dodelava1: {},
      dodelava2: {},
      stroski1: {},
      stroski2: {},
      posiljanje: {},
      komentar: {},
      rokIzdelave: '',
      rokIzdelaveUra: '',
      emailPoslan: false,
      zakljucekEmailPoslan: false,
      odprtjeEmailPonujen: false,
      zakljucekEmailPonujen: false,
      datumNarocila: new Date().toISOString()
    });
    setKey(prev => prev + 1);
    setNalogShranjeno(false);
    setEmailPoslan(false);
    setZakljucen(false);
    setTiskZakljucen1(false);
    setTiskZakljucen2(false);
    setDobavljeno(false);
    setZaklenjeno(false);
    if (obrazecRef.current) {
      obrazecRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Kopiranje naloga
  const handleKopirajNalog = (nalogZaKopijo: any) => {
    if (!jeNalogPrazen(nalogPodatki) && !nalogShranjeno) {
      handleShraniNalog();
    }
    const ok = window.confirm(`Ali res želite kopirati delovni nalog št. ${nalogZaKopijo?.stevilkaNaloga ?? ''}?`);
    if (!ok) return;
    // Deep clone, da ne delimo referenc med starim in novim nalogom
    const nowIso = new Date().toISOString();
    // Kopija mora nastati kot NOV nalog v SQL (nov ID). To naredimo direktno preko /full brez delovniNalogID,
    // nato preberemo nazaj iz SQL in osvežimo UI + seznam.
    (async () => {
      try {
        // Za stare naloge (npr. 2014) je local/IDB pogosto "lite". Zato vedno poskusi prebrati FULL iz backend-a.
        let basePayload: any = null;
        try {
          const srcId = Number(nalogZaKopijo?.stevilkaNaloga);
          if (Number.isFinite(srcId) && srcId > 0) {
            const res = await fetch(`/api/delovni-nalog/${srcId}`);
            if (res.ok) basePayload = await res.json();
          }
        } catch {}
        if (!basePayload) basePayload = nalogZaKopijo?.podatki || {};
        // Deep clone
        const kopiraniPodatki = JSON.parse(JSON.stringify(basePayload));

        // Reset: naročilnica + rok izdelave (datum + ura) pri kopiji
        if (kopiraniPodatki.kupec) kopiraniPodatki.kupec = { ...kopiraniPodatki.kupec, narocilnica: '' };
        kopiraniPodatki.rokIzdelave = '';
        kopiraniPodatki.rokIzdelaveUra = '';
        kopiraniPodatki.datumNarocila = nowIso;
        kopiraniPodatki.emailPoslan = false;
        kopiraniPodatki.zakljucekEmailPoslan = false;

        const fullBody: any = {
          // namerno brez delovniNalogID/stevilkaNaloga -> INSERT
          kupec: kopiraniPodatki.kupec || null,
          kontakt: kopiraniPodatki.kontakt || null,
          komentar: (typeof kopiraniPodatki.komentar === 'string') ? { komentar: kopiraniPodatki.komentar } : (kopiraniPodatki.komentar || {}),
          tisk: kopiraniPodatki.tisk || { tisk1: {}, tisk2: {} },
          dodelava1: kopiraniPodatki.dodelava1 || {},
          dodelava2: kopiraniPodatki.dodelava2 || {},
          stroski1: kopiraniPodatki.stroski1 || {},
          stroski2: kopiraniPodatki.stroski2 || {},
          posiljanje: kopiraniPodatki.posiljanje || {},
          datumNarocila: kopiraniPodatki.datumNarocila || nowIso,
          rokIzdelave: kopiraniPodatki.rokIzdelave || '',
          rokIzdelaveUra: kopiraniPodatki.rokIzdelaveUra || '',
        };
        const resFull = await fetch('/api/delovni-nalog/full', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fullBody),
        });
        if (!resFull.ok) {
          const t = await resFull.text().catch(() => '');
          throw new Error(`Kopiranje ni uspelo (HTTP ${resFull.status})${t ? `: ${t}` : ''}`);
        }
        const dataFull = await resFull.json().catch(() => ({} as any));
        const newId = Number(dataFull?.delovniNalogID);
        if (!Number.isFinite(newId) || newId <= 0) throw new Error('Kopiranje ni vrnilo novega ID iz SQL.');
        const resGet = await fetch(`/api/delovni-nalog/${newId}`);
        if (!resGet.ok) throw new Error(`Kopiranje: GET ni uspel (HTTP ${resGet.status})`);
        const payload = await resGet.json();
        try { await saveBatchToIndexedDBPreserveExisting([payload]); } catch {}
        applyFromPayload(payload);
        const refreshed = await loadByYearRange(currentYearFilter);
        setVsiNalogi(refreshed);
      } catch (e: any) {
        console.error('Kopiranje naloga ni uspelo:', e);
        alert(`Kopiranje ni uspelo: ${e?.message || e}`);
      }
    })();
  };

  // Funkcija za spremembo roka izdelave
  const handleRokIzdelaveChange = (novRok: string) => {
    setNalogPodatki(prev => ({ ...prev, rokIzdelave: novRok }));
    setNalogShranjeno(false);
  };

  // Funkcija za generiranje HTML emaila skladno z zahtevami
  function generirajEmailHtml(vrsta: 'odprtje'|'zakljucek', nalog: any) {
    // Uporabi inline CID, če backend doda priponko 'logo' in 'footer'
    const logoUrl = 'cid:logo';
    // Poskrbi, da je številka naloga vedno prisotna (fallback na state)
    const stNaloga = nalog.stevilkaNaloga || stevilkaNaloga || '';
    const datumOdprtja = nalog?.datumNarocila ? new Date(nalog.datumNarocila) : new Date();
    const datumOdprtjaStr = `${datumOdprtja.getDate()}.${datumOdprtja.getMonth()+1}.${datumOdprtja.getFullYear()}`;
    const rok = nalog?.rokIzdelave ? nalog.rokIzdelave : '';

    // Povzetek (tisk 1, tisk 2, dodelava 1, dodelava 2, cena, dostava) brez kooperantov in brez komentarja
    const tisk1 = nalog?.tisk?.tisk1 || {};
    const tisk2 = nalog?.tisk?.tisk2 || {};
    const d1 = nalog?.dodelava1 || {};
    const d2 = nalog?.dodelava2 || {};
    const stroski1 = nalog?.stroski1 || {};
    const stroski2 = nalog?.stroski2 || {};
    const posiljanje = nalog?.posiljanje || {};

    const mapBarveForEmail = (barveRaw: any): string => {
      const b = String(barveRaw || '').trim();
      if (b === '3/0 EPM') return '4/0 barvno enostransko (CMYK)';
      if (b === '3/3 EPM') return '4/4 barvno obojestransko (CMYK)';
      if (b === '3/1 EPM/K') return '4/1 barvno/črno (CMYK/K)';
      return b;
    };

    const renderTisk = (oznaka: string, t: any) => {
      if (!t || (!t.predmet && !t.kolicina && !t.format && !t.papir && !t.barve)) return '';
      const barve = mapBarveForEmail(t.barve);
      return `<tr><td style='padding:4px 8px;font-weight:bold;'>${oznaka}:</td><td style='padding:4px 8px;'>${[
        t.predmet,
        t.kolicina ? `količina: ${t.kolicina}` : '',
        t.format ? `format: ${t.format}` : '',
        t.papir ? `papir: ${t.papir}` : '',
        barve ? `barvnost: ${barve}` : ''
      ].filter(Boolean).join(' | ')}</td></tr>`;
    };

    const renderDodelava = (oznaka: string, d: any) => {
      if (!d) return '';
      const izbrane: string[] = [];
      if (d.razrez) izbrane.push('razrez');
      if (d.vPolah) izbrane.push('v polah');
      if (d.zgibanje) izbrane.push('zgibanje');
      if (d.biganje) izbrane.push('biganje');
      if (d.perforacija) izbrane.push('perforacija');
      if (d.biganjeRocnoZgibanje) izbrane.push('biganje + ročno zgibanje');
      if (d.lepljenje) izbrane.push(`lepljenje (${d.lepljenjeSirina || 'trak'})${d.lepljenjeMesta ? `, mesta: ${d.lepljenjeMesta}` : ''}`);
      if (d.lepljenjeBlokov) izbrane.push('lepljenje blokov');
      if (d.vrtanjeLuknje) izbrane.push(`vrtanje luknje${d.velikostLuknje ? ` (${d.velikostLuknje})` : ''}`);
      if (d.uvTisk) izbrane.push(`UV tisk: ${d.uvTisk}`);
      if (d.uvLak) izbrane.push(`3D UV lak: ${d.uvLak}`);
      if (d.topliTisk) izbrane.push(`topli tisk: ${d.topliTisk}`);
      if (d.vezava) izbrane.push(`vezava: ${d.vezava}`);
      if (d.izsek) izbrane.push(`izsek/zasek: ${d.izsek}`);
      if (d.plastifikacija) izbrane.push(`plastifikacija: ${d.plastifikacija}`);
      if (izbrane.length === 0) return '';
      return `<tr><td style='padding:4px 8px;font-weight:bold;'>${oznaka}:</td><td style='padding:4px 8px;'>${izbrane.join(' | ')}</td></tr>`;
    };

    const renderDostava = () => {
      const oznake: string[] = [];
      const jePosta = Boolean(posiljanje?.posiljanjePoPosti);
      const jeDostava = Boolean(posiljanje?.dostavaNaLokacijo);
      if (jePosta) oznake.push('pošiljanje po pošti');
      if (posiljanje?.osebnoPrevzem) oznake.push('osebni prevzem');
      if (jeDostava) oznake.push('dostava na lokacijo');
      if (oznake.length === 0) return '';

      const naziv = (posiljanje?.naziv || '').trim();
      const naslov = (posiljanje?.naslov || '').trim();
      const kraj = (posiljanje?.kraj || '').trim();
      const posta = (posiljanje?.postnaStevilka || '').trim();
      const imaNaslovnePodatke = (naziv || naslov || kraj || posta) && (jePosta || jeDostava);
      const naslovHtml = imaNaslovnePodatke
        ? `<div style='margin-top:6px; line-height:1.4;'>
             <div style='font-weight:600;'>Naslov za ${jePosta ? 'pošiljanje' : 'dostavo'}:</div>
             ${naziv ? `<div>${naziv}</div>` : ''}
             ${naslov ? `<div>${naslov}</div>` : ''}
             ${(posta || kraj) ? `<div>${[posta, kraj].filter(Boolean).join(' ')}</div>` : ''}
           </div>`
        : '';
      return `<tr>
        <td style='padding:4px 8px;font-weight:bold;'>Dostava:</td>
        <td style='padding:4px 8px;'>
          ${oznake.join(' | ')}
          ${naslovHtml}
        </td>
      </tr>`;
    };

    // Stroški - podrobni vnosi in seštevki
    const parseNum = (v?: string) => {
      if (v == null) return 0;
      let s = String(v).trim().replace(/\s/g, '');
      if (s === '') return 0;
      const hasComma = s.includes(',');
      const hasDot = s.includes('.');
      if (hasComma && hasDot) {
        // Primeri kot 1.234,56 ali 1,234.56
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
          s = s.replace(/\./g, '').replace(',', '.'); // EU: vejica decimalno
        } else {
          s = s.replace(/,/g, ''); // US: pika decimalno
        }
      } else if (hasComma) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        // samo pika ali samo števke -> piko obravnavaj kot decimalno
        // brez spremembe
      }
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };
    const formatEUR = (n: number) => new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n);
    const zgradiStroske = (oznaka: string, s: any) => {
      const pariBase: [string, number][] = [
        ['Grafična priprava', parseNum(s.graficnaPriprava)],
        ['Cena klišeja', parseNum(s.cenaKlišeja)],
        ['Cena izsek. orod.', parseNum(s.cenaIzsekovalnegaOrodja)],
        ['Cena vzorca', parseNum(s.cenaVzorca)],
        ['Cena brez DDV', parseNum(s.cenaBrezDDV)],
      ];
      const pari: [string, number][] = pariBase.filter(([, v]) => v > 0);
      if (pari.length === 0) return '';
      const rows = pari.map(([k, v]) => `<tr><td style='padding:4px 8px;'>${k}</td><td style='padding:4px 8px; text-align:right;'>${formatEUR(v)}</td></tr>`).join('');
      const skupaj = pari.reduce((acc, [, v]) => acc + v, 0);
      return `
        <tr><td colspan="2" style="padding:4px 8px;font-weight:bold;border-top:1px solid #ddd;">${oznaka}</td></tr>
        ${rows}
        <tr><td style='padding:4px 8px;font-weight:bold;'>Skupaj (${oznaka}) brez DDV</td><td style='padding:4px 8px; text-align:right; font-weight:bold;'>${formatEUR(skupaj)}</td></tr>
      `;
    };
    const s1Html = zgradiStroske('Stroški 1', stroski1);
    const s2Html = zgradiStroske('Stroški 2', stroski2);
    const totalBrez = (
      parseNum(stroski1.graficnaPriprava) + parseNum(stroski1.cenaKlišeja) + parseNum(stroski1.cenaIzsekovalnegaOrodja) + parseNum(stroski1.cenaVzorca) + parseNum(stroski1.cenaBrezDDV) +
      parseNum(stroski2.graficnaPriprava) + parseNum(stroski2.cenaKlišeja) + parseNum(stroski2.cenaIzsekovalnegaOrodja) + parseNum(stroski2.cenaVzorca) + parseNum(stroski2.cenaBrezDDV)
    );
    const totalDDV = totalBrez * 0.22;
    const totalZDDV = totalBrez + totalDDV;
    const stroskiHtml = (s1Html || s2Html || totalBrez > 0)
      ? `
        <div style='margin-top:8px;'>
          <div style='font-weight:bold;margin-bottom:4px;'>Stroški</div>
          <table style='border-collapse:collapse; width:100%;'>
            ${s1Html}${s2Html}
            <tr><td style='padding:4px 8px; font-weight:bold;'>SKUPAJ brez DDV</td><td style='padding:4px 8px; text-align:right; font-weight:bold;'>${formatEUR(totalBrez)}</td></tr>
            <tr><td style='padding:4px 8px;'>DDV (22%)</td><td style='padding:4px 8px; text-align:right;'>${formatEUR(totalDDV)}</td></tr>
            <tr><td style='padding:4px 8px; font-weight:bold;'>SKUPAJ z DDV</td><td style='padding:4px 8px; text-align:right; font-weight:bold;'>${formatEUR(totalZDDV)}</td></tr>
          </table>
        </div>
      `
      : '';

    let povzetek = `<table style='margin-top:16px;margin-bottom:16px;border-collapse:collapse;'>`;
    povzetek += `<tr><td style='padding:4px 8px;font-weight:bold;'>Št. naloga:</td><td style='padding:4px 8px;'>${stNaloga}</td></tr>`;
    povzetek += renderTisk('Tisk 1', tisk1);
    povzetek += renderTisk('Tisk 2', tisk2);
    povzetek += renderDodelava('Dodelava 1', d1);
    povzetek += renderDodelava('Dodelava 2', d2);
    povzetek += renderDostava();
    povzetek += `</table>`;

    // Prilagojeno besedilo glede na način pošiljanja
    const nacinPosiljanja = posiljanje?.posiljanjePoPosti
      ? 'pošiljanje po pošti'
      : posiljanje?.osebnoPrevzem
      ? 'osebni prevzem'
      : posiljanje?.dostavaNaLokacijo
      ? 'dostava na lokacijo'
      : '';
    let besedilo = '';
    if (vrsta === 'odprtje') {
      if (nacinPosiljanja === 'pošiljanje po pošti') {
        besedilo = `Pozdravljeni, potrjujemo prejetje vašega naročila, ki ga vodimo pod številko delovnega naloga (${stNaloga}), odprtega dne ${datumOdprtjaStr}.${rok ? ` Predviden rok izdelave je ${rok}.` : ''} Način dostave: pošiljanje po pošti.`;
      } else if (nacinPosiljanja === 'osebni prevzem') {
        besedilo = `Pozdravljeni, potrjujemo prejetje vašega naročila, ki ga vodimo pod številko delovnega naloga (${stNaloga}), odprtega dne ${datumOdprtjaStr}.${rok ? ` Predviden rok izdelave je ${rok}.` : ''} Način dostave: osebni prevzem.`;
      } else if (nacinPosiljanja === 'dostava na lokacijo') {
        besedilo = `Pozdravljeni, potrjujemo prejetje vašega naročila, ki ga vodimo pod številko delovnega naloga (${stNaloga}), odprtega dne ${datumOdprtjaStr}.${rok ? ` Predviden rok izdelave je ${rok}.` : ''} Način dostave: dostava na lokacijo.`;
      } else {
        besedilo = `Pozdravljeni, potrjujemo prejetje vašega naročila, ki ga vodimo pod številko delovnega naloga (${stNaloga}), odprtega dne ${datumOdprtjaStr}.${rok ? ` Predviden rok izdelave je ${rok}.` : ''}`;
      }
    } else {
      if (nacinPosiljanja === 'pošiljanje po pošti') {
        besedilo = `Pozdravljeni, obveščamo vas, da je vaša tiskovina dokončana in jo bomo odposlali na navedeni naslov.`;
      } else if (nacinPosiljanja === 'osebni prevzem') {
        besedilo = `Pozdravljeni, obveščamo vas, da je vaša tiskovina dokončana in pripravljena za osebni prevzem.`;
      } else if (nacinPosiljanja === 'dostava na lokacijo') {
        besedilo = `Pozdravljeni, obveščamo vas, da je vaša tiskovina dokončana in bo dostavljena na dogovorjeno lokacijo.`;
      } else {
        besedilo = `Pozdravljeni, obveščamo vas, da je vaša tiskovina dokončana in pripravljena za prevzem ali dostavo.`;
      }
    }

    return `<div style='font-family:sans-serif;'>
      <img src='${logoUrl}' alt='Trajanus' style='max-width:200px;margin-bottom:16px;' />
      <div style='margin-bottom:16px;'>${besedilo}</div>
      ${povzetek}
      ${stroskiHtml}
      <div style='margin-top:16px;'>Lep pozdrav, ekipa Trajanus</div>
      <div style='margin-top:24px;'>
        <img src='cid:footer' alt='' style='width:50%;height:auto;display:block;' />
      </div>
    </div>`;
  }

  // Excel izvoz (Excel 1 = tisk1/dodelava1/stroski1, Excel 2 = tisk2/dodelava2/stroski2)
  function flattenToEntries(value: any, prefix = '', out: Array<[string, string]> = []): Array<[string, string]> {
    const isPrimitive = (v: any) =>
      v === null || v === undefined || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
    const toStr = (v: any) => {
      if (v == null) return '';
      // Lepši prikaz datumov, če dobimo ISO
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
        try { return new Date(v).toISOString(); } catch {}
      }
      return String(v);
    };
    if (isPrimitive(value)) {
      out.push([prefix || 'value', toStr(value)]);
      return out;
    }
    if (Array.isArray(value)) {
      out.push([prefix || 'value', JSON.stringify(value)]);
      return out;
    }
    if (typeof value === 'object') {
      Object.keys(value).forEach((k) => {
        const nextPrefix = prefix ? `${prefix}.${k}` : k;
        const v = (value as any)[k];
        if (isPrimitive(v) || Array.isArray(v)) {
          out.push([nextPrefix, Array.isArray(v) ? JSON.stringify(v) : toStr(v)]);
        } else {
          flattenToEntries(v, nextPrefix, out);
        }
      });
      return out;
    }
    out.push([prefix || 'value', toStr(value)]);
    return out;
  }

  const getExcelTemplate = () => ({
    stevilkaNaloga: '',
    datumNarocila: '',
    rokIzdelave: '',
    rokIzdelaveUra: '',
    tiskZakljucenAt: '',
    dobavljenoAt: '',
    status: '',
    zakljucen: false,
    dobavljeno: false,
    tiskZakljucen1: false,
    tiskZakljucen2: false,
    kupec: {
      KupecID: '',
      Naziv: '',
      Naslov: '',
      Posta: '',
      Kraj: '',
      Telefon: '',
      IDzaDDV: '',
      email: '',
      posljiEmail: false,
      narocilnica: ''
    },
    kontakt: {
      kontaktnaOseba: '',
      email: '',
      telefon: ''
    },
    komentar: { komentar: '' },
    tisk: {
      tisk1: {
        predmet: '',
        format: '',
        obseg: '',
        steviloKosov: '',
        steviloPol: '',
        kosovNaPoli: '',
        material: '',
        barve: '',
        b1Format: false,
        b2Format: false,
        collate: false,
        kooperantTisk: false,
        tiskaKooperant: false
      },
      tisk2: {
        predmet: '',
        format: '',
        obseg: '',
        steviloKosov: '',
        steviloPol: '',
        kosovNaPoli: '',
        material: '',
        barve: '',
        b1Format: false,
        b2Format: false,
        collate: false,
        kooperantTisk: false,
        tiskaKooperant: false
      }
    },
    dodelava1: {},
    dodelava2: {},
    stroski1: {
      graficnaPriprava: '',
      cenaKlišeja: '',
      cenaIzsekovalnegaOrodja: '',
      cenaVzorca: '',
      cenaBrezDDV: ''
    },
    stroski2: {
      graficnaPriprava: '',
      cenaKlišeja: '',
      cenaIzsekovalnegaOrodja: '',
      cenaVzorca: '',
      cenaBrezDDV: ''
    },
    posiljanje: {
      posiljanjePoPosti: false,
      osebnoPrevzem: false,
      dostavaNaLokacijo: false,
      naziv: '',
      naslov: '',
      kraj: '',
      postnaStevilka: '',
      kontaktnaOseba: '',
      telefon: '',
      email: '',
      posljiEmail: false
    },
    reklamacija: {
      aktivna: false,
      vrsta: '',
      znesek: ''
    },
    emailPoslan: false,
    zakljucekEmailPoslan: false,
    odprtjeEmailPonujen: false,
    zakljucekEmailPonujen: false
  });

  const EXCEL_KEYS = (() => {
    const tpl = getExcelTemplate();
    return flattenToEntries(tpl).map(([k]) => k);
  })();

  function toExcelMap(obj: any) {
    const map: Record<string, string> = {};
    flattenToEntries(obj).forEach(([k, v]) => { map[k] = v; });
    return map;
  }

  function exportExcelRows(nalogi: any[], filename: string) {
    const formatDatumSl = (iso: any) => {
      if (!iso) return '';
      try {
        const d = new Date(String(iso));
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('sl-SI');
      } catch {
        return '';
      }
    };
    const EXTRA_KEYS = [
      'st.nalog.predmet1.datum.tiskzakljucen',
      'st.nalog.predmet2.datum.tiskzakljucen'
    ];
    const header = [...EXCEL_KEYS, ...EXTRA_KEYS];

    const rows = nalogi.map((n) => {
      const map = toExcelMap(n);
      const row: Record<string, any> = {};
      EXCEL_KEYS.forEach((k) => { row[k] = map[k] ?? ''; });

      // Če naročilnica prazna, v export dodaj "E-MAIL"
      if (Object.prototype.hasOwnProperty.call(row, 'kupec.narocilnica')) {
        const v = String(row['kupec.narocilnica'] ?? '').trim();
        if (!v) row['kupec.narocilnica'] = 'E-MAIL';
      }

      const st = map['stevilkaNaloga'] || map['delovniNalogID'] || '';
      const p1 = map['tisk.tisk1.predmet'] || '';
      const p2 = map['tisk.tisk2.predmet'] || '';
      const dz = formatDatumSl(map['tiskZakljucenAt']);
      row['st.nalog.predmet1.datum.tiskzakljucen'] = [p1, (st ? `dob. št.: ${st}` : ''), dz].filter(Boolean).join(', ');
      row['st.nalog.predmet2.datum.tiskzakljucen'] = [p2, (st ? `dob. št.: ${st}` : ''), dz].filter(Boolean).join(', ');
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows, { header });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Izvoz');
    XLSX.writeFile(wb, filename);
  }

  function exportExcelCurrentNalog() {
    const data: any = JSON.parse(JSON.stringify(nalogPodatki || {}));
    exportExcelRows([data], `nalog-${stevilkaNaloga || ''}-excel.xlsx`);
  }

  async function runBulkExport() {
    try {
      setBulkError('');
      if (bulkTab === 'etikete') return;
      if (!bulkFrom || !bulkTo) {
        setBulkError('Izberi obdobje (od / do).');
        return;
      }
      if (bulkTab === 'kupec' && !bulkKupec?.KupecID) {
        setBulkError('Izberi stranko.');
        return;
      }
      setBulkBusy(true);

      // Material export: hitra agregacija v SQL (ne fetch-aj posameznih nalogov)
      if (bulkTab === 'material') {
        const totals = new Map<string, number>();
        MATERIAL_OPTIONS.forEach((m) => totals.set(m, 0));

        const ps = new URLSearchParams();
        ps.set('from', bulkFrom);
        ps.set('to', bulkTo);
        ps.set('onlyDelivered', bulkOnlyDelivered ? '1' : '0');
        const r0 = await fetch(`/api/export/material-summary?${ps.toString()}`);
        if (!r0.ok) {
          const msg = await r0.text().catch(() => '');
          throw new Error(msg || `HTTP ${r0.status}`);
        }
        const data0 = await r0.json().catch(() => ({} as any));
        const rows0 = Array.isArray(data0?.rows) ? data0.rows : [];
        for (const row of rows0) {
          const rawMat = (row?.material || '').toString().trim();
          const pol = Number(row?.pol || 0);
          if (!rawMat) continue;
          const mapped = normalizeMaterialFromText(rawMat) || 'Drugo-glej komentar';
          totals.set(mapped, (totals.get(mapped) || 0) + (Number.isFinite(pol) ? pol : 0));
        }

        const dataRows = MATERIAL_OPTIONS.map((m) => ({ material: m, pol: totals.get(m) || 0 }));
        const wsRows: any[][] = [];
        wsRows.push(['Zbirna dobavnica']);
        wsRows.push([]);
        const fromSl = new Date(`${bulkFrom}T00:00:00`).toLocaleDateString('sl-SI');
        const toSl = new Date(`${bulkTo}T00:00:00`).toLocaleDateString('sl-SI');
        wsRows.push(['Za obdobje:', `${fromSl} - ${toSl}`]);
        wsRows.push([]);
        wsRows.push(['Skupina materiala', 'Št. pol']);
        dataRows.forEach((r) => wsRows.push([r.material, r.pol]));
        const ws = XLSX.utils.aoa_to_sheet(wsRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Material');
        XLSX.writeFile(wb, `zbirni-material-${bulkFrom}-${bulkTo}.xlsx`);
        setShowBulkExport(false);
        return;
      }

      // 1) Najprej dobimo seznam ID-jev (vedno po obdobju + delivered toggle)
      const paramsRange = new URLSearchParams();
      paramsRange.set('mode', 'range');
      paramsRange.set('from', bulkFrom);
      paramsRange.set('to', bulkTo);
      // Izvoz po kupcu: vedno filtriraj po DobavljenoAt (torej onlyDelivered=1)
      paramsRange.set('onlyDelivered', (bulkTab === 'kupec') ? '1' : (bulkOnlyDelivered ? '1' : '0'));
      if (bulkTab === 'kupec') paramsRange.set('kupecId', String(bulkKupec.KupecID));
      // brez material filtra

      const resIds = await fetch(`/api/export/bulk?${paramsRange.toString()}`);
      if (!resIds.ok) {
        const msg = await resIds.text().catch(() => '');
        throw new Error(msg || `HTTP ${resIds.status}`);
      }
      const dataIds = await resIds.json();
      const ids: number[] = Array.isArray(dataIds?.ids) ? dataIds.ids : (Array.isArray(dataIds) ? dataIds : []);
      if (!ids.length) {
        setBulkError('Ni najdenih nalogov za izbrane filtre.');
        return;
      }
      if (ids.length > 400) {
        const ok = window.confirm(`Najdenih je ${ids.length} nalogov. To lahko traja nekaj časa. Nadaljujem?`);
        if (!ok) return;
      }

      // 3) Standard bulk export: pobere full naloge in eksportira "horizontalno"
      const nalogiFull: any[] = [];
      for (const id of ids) {
        const r = await fetch(`/api/delovni-nalog/${id}`);
        if (!r.ok) continue;
        const n = await r.json().catch(() => null);
        if (n) nalogiFull.push(n);
      }
      const fname = `zbirni-izvoz-${bulkTab}-${bulkFrom}-${bulkTo}.xlsx`;
      exportExcelRows(nalogiFull, fname);
      setShowBulkExport(false);
    } catch (e: any) {
      setBulkError(e?.message || String(e));
    } finally {
      setBulkBusy(false);
    }
  }

  const escapeHtml = (s: string) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const buildEtiketeSlots = () => {
    const selected = etiketeItems
      .map((it) => {
        const key = `${it.id}:${it.part}`;
        return { ...it, key, checked: !!etiketeChecked[key], pos: Number(etiketePos[key] || 0) };
      })
      .filter((x) => x.checked);

    const conflicts = new Set<number>();
    const used = new Set<number>();
    for (const s of selected) {
      if (!s.pos || s.pos < 1 || s.pos > 12) continue;
      if (used.has(s.pos)) conflicts.add(s.pos);
      used.add(s.pos);
    }

    const slots: Array<null | (EtiketaItem & { key: string; pos: number })> = Array.from({ length: 12 }, () => null);
    for (const s of selected) {
      if (s.pos && s.pos >= 1 && s.pos <= 12 && !conflicts.has(s.pos)) {
        slots[s.pos - 1] = { id: s.id, part: s.part, predmet: s.predmet, kosov: s.kosov, key: s.key, pos: s.pos };
      }
    }
    return { slots, selectedCount: selected.length, conflicts: Array.from(conflicts.values()).sort((a, b) => a - b) };
  };

  const exportEtikete = () => {
    setEtiketeError('');
    const { slots, selectedCount, conflicts } = buildEtiketeSlots();
    if (!selectedCount) {
      setEtiketeError('Izberi vsaj eno etiketo.');
      return;
    }
    if (selectedCount > 12) {
      setEtiketeError(`Izbranih je ${selectedCount} etiket. Naenkrat lahko izvoziš največ 12.`);
      return;
    }
    if (conflicts.length) {
      setEtiketeError(`Podvojene pozicije: ${conflicts.join(', ')}. Vsaka etiketa mora imeti unikatno pozicijo 1–12.`);
      return;
    }
    const kupecNaziv = String(bulkKupec?.Naziv || '').trim();
    if (!kupecNaziv) {
      setEtiketeError('Najprej izberi stranko.');
      return;
    }

    const css = `
      @page { size: A4; margin: 0; }
      body { margin: 0; font-family: Arial, sans-serif; }
      .sheet { width: 210mm; height: 297mm; box-sizing: border-box; padding: 0; }
      .grid { width: 210mm; height: 297mm; display: grid; grid-template-columns: 105mm 105mm; grid-template-rows: repeat(6, 49.5mm); }
      .cell { box-sizing: border-box; border: 1px dashed #888; padding: 6mm 7mm; overflow: hidden; }
      .cell[contenteditable]:focus { outline: 2px solid #3b82f6; background: #f8fafc; }
      .line { font-size: 11pt; line-height: 1.25; }
      .labelTitle { font-weight: bold; }
      .predmet { font-weight: 800; font-size: 14pt; margin-top: 4mm; }
      .kosov { margin-top: 3mm; font-size: 12pt; }
      .no-print { margin-top: 16px; }
      @media print { .no-print { display: none; } }
    `;

    const htmlCell = (s: any) => {
      if (!s) return `<div class="cell" contenteditable="true"></div>`;
      const predmet = String(s.predmet || '').trim();
      const kosov = String(s.kosov || '').trim();
      return `
        <div class="cell" contenteditable="true">
          <div class="line"><span class="labelTitle">Naročnik:</span> ${escapeHtml(kupecNaziv)}</div>
          <div class="line"><span class="labelTitle">Dobavitelj:</span> Trajanus d.o.o.</div>
          <div class="predmet">${escapeHtml(predmet)}</div>
          <div class="kosov"><span class="labelTitle">Število kosov:</span> ${escapeHtml(kosov)}</div>
        </div>
      `;
    };

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Etikete</title>
          <style>${css}</style>
        </head>
        <body>
          <div class="sheet">
            <div class="grid">
              ${slots.map(htmlCell).join('')}
            </div>
          </div>
          <div class="no-print">
            <p style="margin-bottom:8px;color:#374151;font-size:14px;">Pred tiskanjem lahko urejate vsebino celic (klikni in piši). Ko ste zadovoljni, kliknite Tiskaj.</p>
            <button onclick="window.print()" style="padding:10px 20px;font-size:16px;background:#2563eb;color:white;border:none;border-radius:8px;cursor:pointer;">Tiskaj</button>
          </div>
        </body>
      </html>
    `;
    const w = window.open('', '_blank');
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
    }
  };

  // QR: vrednosti in PDF izvoz
  // QR koda in PDF izvoz sta premaknjena v StroskiSekcija (kopiranje številke naloga)

  // Funkcija za pošiljanje emaila (kličeš backend API)
  async function posljiEmail(nalog: any, vrsta: 'odprtje'|'zakljucek', html: string) {
    await fetch('/api/poslji-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: nalog.kupec?.email,
        subject: vrsta === 'odprtje'
          ? `Obvestilo o odprtju delovnega naloga ${nalog.stevilkaNaloga || stevilkaNaloga || ''}`
          : `Zaključen delovni nalog ${nalog.stevilkaNaloga || stevilkaNaloga || ''}`,
        html
      })
    });
  }

  // Ob kliku na "tisk zaključen":
  const handleZakljucenChange = (vrednost: boolean) => {
    setNalogShranjeno(false);
    // Preveri cene: če je vpisan predmet (tisk1 ali tisk2) in ni nobene cene v stroških, pokaži opozorilo
    // Pri "Skupna cena" zadostuje vsaj eno polje v cena 1 ali cena 2
    const imaPredmet = !!(nalogPodatki?.tisk?.tisk1?.predmet || nalogPodatki?.tisk?.tisk2?.predmet);
    const st1 = nalogPodatki?.stroski1 || {};
    const st2 = nalogPodatki?.stroski2 || {};
    const imaCeno = !!(
      st1.graficnaPriprava || st1.cenaKlišeja || st1.cenaIzsekovalnegaOrodja || st1.cenaVzorca || st1.cenaBrezDDV ||
      st2.graficnaPriprava || st2.cenaKlišeja || st2.cenaIzsekovalnegaOrodja || st2.cenaVzorca || st2.cenaBrezDDV
    );
    if (vrednost && imaPredmet && !imaCeno) {
      const proceed = window.confirm('Delovnem nalogu manjka cena. Kliknite V redu za nadaljevanje ali Prekliči za dodajanje cene.');
      if (!proceed) {
        // Pomakni na sekcijo Stroški
        setTimeout(() => stroskiRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
        return;
      }
    }
    setZakljucen(vrednost);
    setTiskZakljucen1(vrednost);
    setTiskZakljucen2(vrednost);
    // Če je nalog zaključen, šteje kot zaključek vseh dodelav (za koledar/normo).
    // Zapri vse korake (če še niso zaprti) z timestampom, da se pravilno sešteva "narejeno" po dnevih.
    if (vrednost) {
      const stNaloga = Number(stevilkaNaloga);
      const closedAt = new Date().toISOString();
      const ALL_STEPS = [
        'Tisk',
        'UV Tisk',
        'Plastifikacija',
        'UV Lak',
        'Izsek/Zasek',
        'Razrez',
        'Topli tisk',
        'Biganje',
        'Biganje + ročno zgibanje',
        'Zgibanje',
        'Lepljenje',
        'Lepljenje blokov',
        'Vezava',
        'Vrtanje luknje',
        'Perforacija',
        'Dodatno',
      ];
      setClosedTasks((prev) => {
        const next = [...prev];
        const hasP1 = !!(nalogPodatki?.tisk?.tisk1?.predmet && String(nalogPodatki.tisk.tisk1.predmet).trim());
        const hasP2 = !!(nalogPodatki?.tisk?.tisk2?.predmet && String(nalogPodatki.tisk.tisk2.predmet).trim());
        const parts: Array<1 | 2> = [];
        if (hasP1) parts.push(1);
        if (hasP2) parts.push(2);
        for (const part of parts) {
          for (const step of ALL_STEPS) {
            const exists = next.some(t => t.stevilkaNaloga === stNaloga && t.taskType === step && (t.part ?? 0) === part);
            if (!exists) next.push({ stevilkaNaloga: stNaloga, taskType: step, part, closedAt });
          }
        }
        try { localStorage.setItem('closedTasks', JSON.stringify(next)); } catch {}
        return next;
      });
    }
    setNalogPodatki((prev: any) => ({
      ...prev,
      tiskZakljucenAt: vrednost ? (prev.tiskZakljucenAt || new Date().toISOString()) : ''
    }));
    if (vrednost && nalogPodatki.kupec?.posljiEmail && nalogPodatki.kupec?.email && !nalogPodatki.zakljucekEmailPoslan) {
      setEmailHtml(generirajEmailHtml('zakljucek', nalogPodatki));
      setEmailVrsta('zakljucek');
      setPrikaziPredogledEmaila(true);
    }
  };

  const handleZakljuciTiskDel = (part: 1 | 2) => {
    setNalogShranjeno(false);
    // Preveri cene za izbran del: če je vpisan predmet in ni nobene cene, pokaži opozorilo
    // Pri "Skupna cena" zadostuje vsaj eno polje v cena 1 ali cena 2
    const tisk = part === 1 ? nalogPodatki?.tisk?.tisk1 : nalogPodatki?.tisk?.tisk2;
    const st1 = nalogPodatki?.stroski1 || {};
    const st2 = nalogPodatki?.stroski2 || {};
    const imaPredmet = !!(tisk?.predmet && String(tisk.predmet).trim().length > 0);
    const jeSkupnaCena = !!(nalogPodatki as any)?.skupnaCena;
    const imaCeno = jeSkupnaCena
      ? !!(st1.graficnaPriprava || st1.cenaKlišeja || st1.cenaIzsekovalnegaOrodja || st1.cenaVzorca || st1.cenaBrezDDV ||
          st2.graficnaPriprava || st2.cenaKlišeja || st2.cenaIzsekovalnegaOrodja || st2.cenaVzorca || st2.cenaBrezDDV)
      : !!((part === 1 ? st1 : st2).graficnaPriprava || (part === 1 ? st1 : st2).cenaKlišeja || (part === 1 ? st1 : st2).cenaIzsekovalnegaOrodja || (part === 1 ? st1 : st2).cenaVzorca || (part === 1 ? st1 : st2).cenaBrezDDV);
    if (imaPredmet && !imaCeno) {
      const proceed = window.confirm('Delovnemu nalogu manjka cena za izbrani del. Kliknite V redu za nadaljevanje ali Prekliči za dodajanje cene.');
      if (!proceed) {
        setTimeout(() => stroskiRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
        return;
      }
    }
    const next1 = part === 1 ? true : tiskZakljucen1;
    const next2 = part === 2 ? true : tiskZakljucen2;
    if (part === 1) setTiskZakljucen1(true);
    if (part === 2) setTiskZakljucen2(true);
    const boFull = next1 && next2;
    setZakljucen(boFull);
    if (boFull) {
      const stNaloga = Number(stevilkaNaloga);
      const closedAt = new Date().toISOString();
      const ALL_STEPS = [
        'Tisk',
        'UV Tisk',
        'Plastifikacija',
        'UV Lak',
        'Izsek/Zasek',
        'Razrez',
        'Topli tisk',
        'Biganje',
        'Biganje + ročno zgibanje',
        'Zgibanje',
        'Lepljenje',
        'Lepljenje blokov',
        'Vezava',
        'Vrtanje luknje',
        'Perforacija',
        'Dodatno',
      ];
      setClosedTasks((prev) => {
        const next = [...prev];
        const hasP1 = !!(nalogPodatki?.tisk?.tisk1?.predmet && String(nalogPodatki.tisk.tisk1.predmet).trim());
        const hasP2 = !!(nalogPodatki?.tisk?.tisk2?.predmet && String(nalogPodatki.tisk.tisk2.predmet).trim());
        const parts: Array<1 | 2> = [];
        if (hasP1) parts.push(1);
        if (hasP2) parts.push(2);
        for (const part of parts) {
          for (const step of ALL_STEPS) {
            const exists = next.some(t => t.stevilkaNaloga === stNaloga && t.taskType === step && (t.part ?? 0) === part);
            if (!exists) next.push({ stevilkaNaloga: stNaloga, taskType: step, part, closedAt });
          }
        }
        try { localStorage.setItem('closedTasks', JSON.stringify(next)); } catch {}
        return next;
      });
      setNalogPodatki((prev: any) => ({
        ...prev,
        tiskZakljucenAt: prev.tiskZakljucenAt || new Date().toISOString()
      }));
    }
    if (boFull && nalogPodatki.kupec?.posljiEmail && nalogPodatki.kupec?.email && !nalogPodatki.zakljucekEmailPoslan) {
      setEmailHtml(generirajEmailHtml('zakljucek', nalogPodatki));
      setEmailVrsta('zakljucek');
      setPrikaziPredogledEmaila(true);
    }
  };

  const confirmIfUnsaved = (action: () => void) => {
    if (!nalogShranjeno) {
      // Shrani trenutne podatke kot originalne
      setOriginalniPodatki(JSON.parse(JSON.stringify(nalogPodatki)));
      setPendingAction(() => action);
      setPrikaziUnsavedModal(true);
    } else {
      action();
    }
  };

  // Prekrij handleIzberiNalog in handleNoviNalog z logiko za neshranjene spremembe
  const handleIzberiNalogWrapper = (nalog: any) => confirmIfUnsaved(() => {
    handleIzberiNalog(nalog);
    setAktivniZavihek('delovniNalog');
  });

  const canLocateInSeznam = (nalogOrId: any): boolean => {
    const id = Number(typeof nalogOrId === 'number' ? nalogOrId : nalogOrId?.stevilkaNaloga);
    if (!id) return false;
    const found = vsiNalogi.find(n => Number(n?.stevilkaNaloga) === id);
    if (!found) return false;
    const datum = found?.podatki?.datumNarocila || found?.datumNarocila || found?.podatki?.rokIzdelave || found?.rokIzdelave;
    if (!datum) return false;
    const leto = new Date(datum).getFullYear();
    if (typeof currentYearFilter === 'number') {
      return leto >= currentYearFilter;
    }
    return true;
  };

  const handleIzberiNalogFromPrioritetni = (nalog: any) => confirmIfUnsaved(() => {
    handleIzberiNalog(nalog);
    setAktivniZavihek('delovniNalog');
    const id = Number(nalog?.stevilkaNaloga || 0);
    if (id && canLocateInSeznam(id)) {
      setScrollToSeznamNalog({ id, ts: Date.now() });
    }
  });
  const handleNoviNalogWrapper = () => confirmIfUnsaved(handleNoviNalog);

  // Animacija za shranjevanje
  const handleShraniNalogAnim = () => {
    handleShraniNalog();
    setShowSavedAnim(true);
    setTimeout(() => setShowSavedAnim(false), 1000);
  };

  // Bližnjica Ctrl+S: shrani nalog (stabilno, brez konflikta z modali)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = (e.key || '').toLowerCase();
      const isSave = key === 's' && (e.ctrlKey || e.metaKey);
      if (!isSave) return;
      if (prikaziUnsavedModal || prikaziPredogledEmaila) return;
      e.preventDefault();
      handleShraniNalogAnim();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [prikaziUnsavedModal, prikaziPredogledEmaila, stevilkaNaloga, nalogShranjeno, nalogPodatki]);

  // AI Email Parser funkcije
  const handleRazberiEmail = async () => {
    if (!emailBesedilo.trim()) return;
    
    setAiLoading(true);
    setAiError('');
    setAiRezultat(null);
    setAiPreviewNalog(null);
    setAiRunId(null);
    
    try {
      const response = await fetch('/api/ai/razberiNalogIzEmaila', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emailBesedilo: emailBesedilo.trim() }),
      });
      
      if (!response.ok) {
        let details = '';
        try {
          const raw = await response.text();
          try {
            const j = JSON.parse(raw);
            details = [j?.error, j?.details, j?.hint].filter(Boolean).join(' - ');
          } catch {
            details = raw ? String(raw).replace(/\s+/g, ' ').slice(0, 200) : '';
          }
        } catch {}
        throw new Error(`HTTP error! status: ${response.status}${details ? ` - ${details}` : ''}`);
      }
      
      const data = await response.json();
      // Backend returns aiRunId (stored parse run in SQL); keep it for later feedback on "tisk zaključen".
      const rid = Number((data as any)?.aiRunId ?? (data as any)?.meta?.aiRunId);
      if (Number.isFinite(rid) && rid > 0) {
        setAiRunId(rid);
        // Persist in nalog state too, so it survives subsequent edits before save
        setNalogPodatki((prev: any) => ({ ...prev, aiRunId: rid }));
      }

      // NOVO (2026-01): backend vrne strogo shemo { razbraniPodatki: ... }
      if ((data as any)?.razbraniPodatki) {
        const rp = (data as any).razbraniPodatki || {};
        const toBool = (v: any) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
        const normalizeDateToInput = (v: any) => {
          const s = (v || '').toString().trim();
          if (!s) return '';
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
          const mEU = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/);
          if (mEU) {
            const dd = mEU[1].padStart(2, '0');
            const mm = mEU[2].padStart(2, '0');
            const yyyy = mEU[3].length === 2 ? `20${mEU[3]}` : mEU[3];
            return `${yyyy}-${mm}-${dd}`;
          }
          return s;
        };
        // Frontend "agresivna" obogatitev (da ne smo odvisni samo od AI).
        const enrichFromEmailFE = (env: any, emailText: string) => {
          try {
            const txt = String(emailText || '');
            const lower = txt.toLowerCase();
            env.kupec = env.kupec || {};
            env.kontakt = env.kontakt || {};
            env.tisk = env.tisk || { tisk1: {}, tisk2: {} };
            env.tisk.tisk1 = env.tisk.tisk1 || {};
            env.dodelava = env.dodelava || { dodelava1: {}, dodelava2: {} };
            env.dodelava.dodelava1 = env.dodelava.dodelava1 || {};
            env.stroski = env.stroski || { stroski1: {}, stroski2: {} };
            env.stroski.stroski1 = env.stroski.stroski1 || {};

            // naročilnica
            const mNar = txt.match(/(?:Št\.?\s*naročilnice|St\.?\s*narocilnice|naročilnica|narocilnica)\s*[:#]?\s*([0-9]{4,})/i);
            if (mNar && !env.kupec.narocilnica) env.kupec.narocilnica = String(mNar[1]);

            // email
            const emails = Array.from(txt.matchAll(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/ig)).map(m => m[0]);
            const nonTraj = emails.find(e => !e.toLowerCase().endsWith('@trajanus.si')) || emails[0] || '';
            if (nonTraj) {
              if (!env.kontakt.email) env.kontakt.email = nonTraj;
              if (!env.kupec.email) env.kupec.email = nonTraj;
              // kupec naziv iz domene
              if (!env.kupec.Naziv) {
                const dom = nonTraj.split('@')[1] || '';
                const sld = dom.split('.').slice(-2, -1)[0] || '';
                if (sld) env.kupec.Naziv = sld.charAt(0).toUpperCase() + sld.slice(1);
              }
            }

            // kontaktna oseba iz podpisa: "Tina Hočevar | T ..."
            const mName = txt.match(/\n\s*([A-ZŠŽČĆĐ][^\n|]{1,60})\s*\|\s*T/i);
            if (mName) env.kontakt.kontaktnaOseba = String(mName[1]).trim();
            // fallback: "LP, Tina"
            if (!env.kontakt.kontaktnaOseba) {
              const mLp = txt.match(/(?:LP|Lep pozdrav)[, ]+([A-ZŠŽČĆĐ][A-Za-zŠŽČĆĐšžčćđ\-]+(?:\s+[A-ZŠŽČĆĐ][A-Za-zŠŽČĆĐšžčćđ\-]+)?)/i);
              if (mLp) env.kontakt.kontaktnaOseba = String(mLp[1]).trim();
            }

            // predmet + format iz "Material:" vrstice
            const mMat = txt.match(/Material\s*[:\-]\s*([^\n\r]+)/i);
            if (mMat) {
              const line = String(mMat[1]).trim();
              const predmet = line.replace(/^\d+\s+/, '').trim();
              if (!env.tisk.tisk1.predmet) env.tisk.tisk1.predmet = predmet;
              const mFmt = line.match(/(\d{2,4}\s*[x×]\s*\d{2,4})\s*mm/i);
              if (mFmt && !env.tisk.tisk1.format) env.tisk.tisk1.format = `${mFmt[1].replace(/\s+/g, '')} mm`;
            } else if (!env.tisk.tisk1.predmet && (lower.includes('brošur') || lower.includes('brosur'))) {
              env.tisk.tisk1.predmet = 'brošura';
            }

            // papir -> map na UI
            const mPapir = txt.match(/Papir\s*[:\-]\s*([^\n\r]+)/i);
            if (mPapir) {
              const p = String(mPapir[1]).toLowerCase();
              const g = (p.match(/(\d{2,4})\s*g/) || [])[1];
              if (g && !env.tisk.tisk1.material) {
                // UI nima "sijaj premazni" -> najbližje "mat premazni"
                env.tisk.tisk1.material = normalizeMaterialFromText(`mat premazni ${parseInt(g, 10)} g/m²`) || `mat premazni ${parseInt(g, 10)} g/m²`;
              }
            }

            // vezava: "Speto z žico" -> "vezano z žico"
            if (!env.dodelava.dodelava1.vezava && /spet[oa]\s+z\s+žico|speto\s+z\s+zico|žič/i.test(lower)) {
              env.dodelava.dodelava1.vezava = 'vezano z žico';
            }

            // cena
            const mCena = txt.match(/Cena\s*[:\-]\s*([0-9]{1,3}(?:[.\s][0-9]{3})*(?:[,\.][0-9]{2})?)/i);
            if (mCena && !env.stroski.stroski1.cenaBrezDDV) env.stroski.stroski1.cenaBrezDDV = String(mCena[1]).trim();

            // rok dobave (dd.mm.yyyy)
            if (!env.rokIzdelave) {
              const mRok = txt.match(/Rok\s+dobave\s*[:\-]\s*([^\n\r]+)/i);
              const s = mRok ? String(mRok[1]) : '';
              const dm = (s || txt).match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
              if (dm) {
                const dd = String(parseInt(dm[1], 10)).padStart(2, '0');
                const mm = String(parseInt(dm[2], 10)).padStart(2, '0');
                const yyyy = dm[3].length === 2 ? `20${dm[3]}` : dm[3];
                env.rokIzdelave = `${yyyy}-${mm}-${dd}`;
              }
            }
          } catch {}
        };
        enrichFromEmailFE(rp, emailBesedilo);
        const guessUraFromText = (txt: string): string | '' => {
          const m = (txt || '').match(/(?:do|ob)\s*(\d{1,2})(?::(\d{2}))?\s*h\b/i);
          if (!m) return '';
          const hh = String(Math.min(23, Math.max(0, parseInt(m[1], 10)))).padStart(2, '0');
          const mm = String(m[2] ? parseInt(m[2], 10) : 0).padStart(2, '0');
          return `${hh}:${mm}`;
        };
        const ensureMutacije = (t: any) => {
          const steviloMutacij = (t?.steviloMutacij || '').toString().trim() || '1';
          let mutacije = Array.isArray(t?.mutacije) ? t.mutacije : [];
          if (mutacije.length === 0) mutacije = [{ steviloPol: '' }];
          return { steviloMutacij, mutacije };
        };
        const normalizeBarve = (raw: any, emailText: string) => {
          const s = (raw || '').toString().trim();
          if (s && (BARVE_OPTIONS as readonly string[]).includes(s)) return s;
          return normalizeColorsFromText(s || emailText) || '';
        };
        const normalizeTisk = (t: any, emailText: string) => {
          const raw = t || {};
          const { steviloMutacij, mutacije } = ensureMutacije(raw);
          const barve = normalizeBarve(raw?.barve, emailText);
          const material = normalizeMaterialFromText(raw?.material) || '';
          const collate = toBool(raw?.collate) || /collate/i.test(emailText);
          return {
            predmet: (raw?.predmet ?? '') as any,
            format: (raw?.format ?? '') as any,
            obseg: (raw?.obseg != null && String(raw.obseg).trim() ? String(raw.obseg) : '1') as any,
            steviloKosov: (raw?.steviloKosov != null ? String(raw.steviloKosov) : '') as any,
            material: material || '',
            barve: barve || '',
            steviloPol: (raw?.steviloPol != null ? String(raw.steviloPol) : '') as any,
            kosovNaPoli: (raw?.kosovNaPoli != null ? String(raw.kosovNaPoli) : '') as any,
            tiskaKooperant: toBool(raw?.tiskaKooperant),
            kooperant: (raw?.kooperant ?? '') as any,
            rokKooperanta: normalizeDateToInput(raw?.rokKooperanta),
            znesekKooperanta: (raw?.znesekKooperanta != null ? String(raw.znesekKooperanta) : '') as any,
            b2Format: toBool(raw?.b2Format),
            b1Format: toBool(raw?.b1Format),
            collate,
            steviloMutacij,
            mutacije,
          };
        };
        const normalizeDodelava = (d: any) => {
          const raw = d || {};
          const uvTisk = normalizeDodelavaSelectFromText(raw?.uvTisk, UV_TISK_OPTIONS);
          const uvLak = normalizeDodelavaSelectFromText(raw?.uvLak, UV_LAK_OPTIONS);
          const vezava = normalizeDodelavaSelectFromText(raw?.vezava, VEZAVA_OPTIONS);
          const izsek = normalizeDodelavaSelectFromText(raw?.izsek, IZSEK_OPTIONS);
          const plastifikacija = normalizeDodelavaSelectFromText(raw?.plastifikacija, PLASTIFIKACIJA_OPTIONS);
          const lepljenjeSirina = normalizeDodelavaSelectFromText(raw?.lepljenjeSirina, LEPLJENJE_SIRINE_OPTIONS);
          return {
            ...raw,
            uvTisk: uvTisk || '',
            uvLak: uvLak || '',
            vezava: vezava || '',
            izsek: izsek || '',
            plastifikacija: plastifikacija || '',
            lepljenjeSirina: lepljenjeSirina || '',
          };
        };

        // Kupec: poskusi najti najbližje ujemanje iz baze
        let kupecFromDb: any | null = null;
        let kupecCandidates: any[] = [];
        try {
          const resKupci = await fetch('/api/kupec');
          if (resKupci.ok) {
            const kupci = await resKupci.json();
            const q = (rp?.kupec?.Naziv || rp?.kupec?.email || '').toString();
            const best = bestKupecMatch({ query: q, emailText: emailBesedilo, kupci });
            kupecFromDb = best.match;
            kupecCandidates = best.candidates || [];
          }
        } catch {}

        const kontakt = rp?.kontakt || {};
        const kupec = (() => {
          const raw = rp?.kupec || {};
          const merged = kupecFromDb ? { ...kupecFromDb } : { ...raw };
          if (raw?.narocilnica) merged.narocilnica = raw.narocilnica;
          if (raw?.posljiEmail != null) merged.posljiEmail = raw.posljiEmail;
          if (!merged.email && (raw?.email || kontakt?.email)) merged.email = raw?.email || kontakt?.email;
          if (!merged.Telefon && (raw?.Telefon || kontakt?.telefon)) merged.Telefon = raw?.Telefon || kontakt?.telefon;
          if (kupecFromDb) merged.rocniVnos = false;
          return merged;
        })();

        const tisk1 = normalizeTisk(rp?.tisk?.tisk1, emailBesedilo);
        const tisk2 = normalizeTisk(rp?.tisk?.tisk2, emailBesedilo);
        // Fix: če AI ni dejansko razbral drugega izdelka (predmet prazen), ne vsiljuj barv za Tisk 2.
        // Model je v praksi pogosto nastavljal Tisk2.barve na 4/0 kot "default", kar zavede uporabnika.
        const tisk2IsEmpty =
          !String(tisk2?.predmet || '').trim() &&
          !String(tisk2?.format || '').trim() &&
          !String(tisk2?.material || '').trim() &&
          !String(tisk2?.steviloKosov || '').trim() &&
          !String(tisk2?.steviloPol || '').trim() &&
          !String(tisk2?.kosovNaPoli || '').trim();
        if (tisk2IsEmpty) {
          (tisk2 as any).barve = '';
        }
        const dodelava1 = normalizeDodelava(rp?.dodelava?.dodelava1);
        const dodelava2 = normalizeDodelava(rp?.dodelava?.dodelava2);
        const stroski1 = rp?.stroski?.stroski1 || {};
        const stroski2 = rp?.stroski?.stroski2 || {};
        const rokIzdelave = normalizeDateToInput(rp?.rokIzdelave);
        const rokIzdelaveUra = (rp?.rokIzdelaveUra && /^\d{2}:\d{2}$/.test(String(rp.rokIzdelaveUra)))
          ? String(rp.rokIzdelaveUra)
          : (guessUraFromText(emailBesedilo) || (rokIzdelave ? '15:00' : ''));
        const datumNarocila = normalizeDateToInput(rp?.datumNarocila) || new Date().toISOString();

        // UI dovoljuje samo eno kljukico pri pošiljanju
        const pRaw = rp?.posiljanje || {};
        const pickedPos =
          toBool(pRaw?.dostavaNaLokacijo) ? { dostavaNaLokacijo: true, posiljanjePoPosti: false, osebnoPrevzem: false } :
          toBool(pRaw?.posiljanjePoPosti) ? { dostavaNaLokacijo: false, posiljanjePoPosti: true, osebnoPrevzem: false } :
          toBool(pRaw?.osebnoPrevzem) ? { dostavaNaLokacijo: false, posiljanjePoPosti: false, osebnoPrevzem: true } :
          { dostavaNaLokacijo: false, posiljanjePoPosti: false, osebnoPrevzem: false };

        const previewNalog: any = {
          stevilkaNaloga: '(predogled)',
          datumNarocila,
          kupec,
          kontakt,
          tisk: { tisk1, tisk2 },
          dodelava1,
          dodelava2,
          stroski1,
          stroski2,
          posiljanje: {
            ...pRaw,
            ...pickedPos,
            kontaktnaOseba: (rp?.posiljanje?.kontaktnaOseba ?? kontakt?.kontaktnaOseba ?? '') as any,
            kontakt: (rp?.posiljanje?.kontakt ?? kontakt?.telefon ?? kontakt?.email ?? '') as any,
          },
          komentar: (rp?.komentar && typeof rp.komentar === 'object') ? rp.komentar : { komentar: (rp?.komentar?.komentar ?? '') },
          rokIzdelave,
          rokIzdelaveUra,
          emailPoslan: false,
          zakljucekEmailPoslan: false,
        };

        setAiRezultat({ razbraniPodatki: rp, _kupecCandidates: kupecCandidates });
        setAiPreviewNalog(previewNalog);
        return;
      }

      setAiRezultat(data);
      // Zgradi predogled naloga (stari format – kompatibilnost)
      try {
        const produkt = Array.isArray(data?.produkti) && data.produkti.length > 0 ? data.produkti[0] : data;
        // Reuporabi logiko iz handleUporabiAIRezultat – generiraj noviNalog brez pisanja stanja
        // (kopija najnujnejših korakov)
        const toMaterial = (papir: string): string => {
          if (!papir) return '';
          const p = papir.toLowerCase();
          const m = papir.match(/(\d{2,4})\s*g/i);
          const g = m ? `${parseInt(m[1],10)} g/m²` : '';
          const isPremazni = p.includes('premazni');
          const isNepremazni = p.includes('nepremazni') || p.includes('brezlesni');
          const isMat = p.includes('mat');
          const isSijaj = p.includes('sijaj');
          if (isPremazni || p.includes('plastific')) {
            const tip = isMat ? 'mat premazni' : (isSijaj ? 'sijaj premazni' : 'mat premazni');
            return g ? `${tip} ${g}` : `${tip} 300 g/m²`;
          }
          if (isNepremazni) {
            return g ? `brezlesni, nepremazni ${g}` : 'brezlesni, nepremazni 300 g/m²';
          }
          return g ? `mat premazni ${g}` : 'mat premazni 300 g/m²';
        };
        const toBarve = (barvnost: string): string => {
          const b = (barvnost || '').toLowerCase();
          if (b.includes('4/4') || b.includes('dvostr') || b.includes('obojestrans')) return '4/4 barvno obojestransko (CMYK)';
          if (b.includes('4/0') || (b.includes('enostr') && b.includes('barvno'))) return '4/0 barvno enostransko (CMYK)';
          if (b.includes('1/1')) return '1/1 črno belo obojestransko (K)';
          if (b.includes('1/0') || b.includes('črno') || b.includes('crno')) return '1/0 črno belo enostransko (K)';
          return '';
        };
        const toPlastifikacija = (dodelava: string, barve: string): string => {
          const d = (dodelava || '').toLowerCase();
          if (d.includes('plastific')) {
            const jeObojestransko = (barve || '').includes('4/4') || (barve || '').includes('1/1');
            const mat = d.includes('mat');
            return jeObojestransko ? (mat ? '1/1 mat' : '1/1 sijaj') : (mat ? '1/0 mat' : '1/0 sijaj');
          }
          return '';
        };
        const normalizeDate = (input?: string) => {
          if (!input) return '';
          if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
          const year = new Date().getFullYear();
          const mDM = input.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/);
          if (mDM) {
            const d = parseInt(mDM[1], 10);
            const m = parseInt(mDM[2], 10);
            const y = mDM[3] ? (mDM[3].length === 2 ? 2000 + parseInt(mDM[3], 10) : parseInt(mDM[3], 10)) : year;
            if (m>=1 && m<=12 && d>=1 && d<=31) return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          }
          return input;
        };
        const izdelek = produkt?.izdelek || '';
        const kolicina = (produkt?.kolicina != null ? produkt.kolicina : '')?.toString() || '';
        const format = produkt?.format || '';
        const papir = produkt?.papir || '';
        const barvnost = produkt?.barvnost || '';
        const dodelava = produkt?.dodelava || '';
        let barveMapped = toBarve(barvnost);
        if (!barveMapped) {
          barveMapped = normalizeColorsFromText(emailBesedilo);
        }
        const materialMapped = toMaterial(papir);
        const plastifikacijaMapped = toPlastifikacija(dodelava, barveMapped);
        const mCena = (emailBesedilo || '').match(/cena\s+([\d\.,]+)\s*€?/i);
        const cenaKonv = produkt?.cena != null ? String(produkt.cena) : (mCena ? String(parseFloat(mCena[1].replace(/\./g, '').replace(',', '.'))) : undefined);
        const dostava = (produkt?.dostava || produkt?.dostavaNačin || '').toString().toLowerCase();
        const posiljanjeParsed: any = {};
        if (dostava.includes('pošti') || dostava.includes('pošta')) posiljanjeParsed.posiljanjePoPosti = true;
        if (dostava.includes('osebni') || dostava.includes('prevzem')) posiljanjeParsed.osebnoPrevzem = true;
        if (dostava.includes('dostava') || dostava.includes('lokacijo')) posiljanjeParsed.dostavaNaLokacijo = true;
        // Fallback iz e-maila
        const emailLower = (emailBesedilo || '').toLowerCase();
        if (emailLower.includes('po pošti') || emailLower.includes('po posti') || emailLower.includes('pošta')) {
          posiljanjeParsed.posiljanjePoPosti = true;
        }
        const ddUra = produkt?.datumDobaveUra || (data as any)?.datumDobaveUra || (() => {
          const m = (emailBesedilo || '').match(/(?:do|ob)\s*(\d{1,2})(?::(\d{2}))?\s*h\b/i);
          if (m) {
            const hh = String(Math.min(23, Math.max(0, parseInt(m[1], 10)))).padStart(2,'0');
            const mm = String(m[2] ? parseInt(m[2], 10) : 0).padStart(2,'0');
            return `${hh}:${mm}`;
          }
          return '15:00';
        })();
        const noviPreview = {
          stevilkaNaloga: '(predogled)',
          datumNarocila: new Date().toISOString(),
          kupec: {
            Naziv: (produkt?.stranka?.kraj || data?.stranka?.kraj || ''),
            email: produkt?.kontakt?.email || data?.kontakt?.email || '',
            Telefon: produkt?.kontakt?.telefon || data?.kontakt?.telefon || ''
          },
          tisk: {
            tisk1: {
              predmet: izdelek || '',
              format: format || '',
              steviloKosov: kolicina || '',
              material: materialMapped || '',
              barve: barveMapped || ''
            },
            tisk2: {}
          },
          dodelava1: (() => {
            const obj: any = {};
            if (Array.isArray(produkt?.dodelaveSeznam)) {
              for (const tok of produkt.dodelaveSeznam) {
                const t = (tok || '').toLowerCase();
                if (t.includes('uv') && t.includes('lak')) obj.uvLak = obj.uvLak || '1/0 parcialno';
                if (t.includes('plastific')) obj.plastifikacija = obj.plastifikacija || plastifikacijaMapped || '1/0 mat';
                if (t.includes('zgib')) obj.zgibanje = true;
                if (t.includes('big')) obj.biganje = true;
                if (t.includes('perfor')) obj.perforacija = true;
                if (t.includes('vrtanj') || t.includes('luknj')) obj.vrtanjeLuknje = true;
                if (t.includes('lepljen')) obj.lepljenje = true;
                if (t.includes('digitalni izsek')) obj.izsek = 'digitalni izsek';
                else if (t === 'izsek' || t.includes('izsek')) obj.izsek = obj.izsek || 'izsek';
              }
            }
            if (!obj.plastifikacija && plastifikacijaMapped) obj.plastifikacija = plastifikacijaMapped;
            return obj;
          })(),
          dodelava2: {},
          stroski1: cenaKonv ? { cenaBrezDDV: cenaKonv } : {},
          stroski2: {},
          posiljanje: posiljanjeParsed,
          komentar: (produkt?.stranka?.ime || data?.stranka?.ime) ? `Kontakt: ${(produkt?.stranka?.ime || data?.stranka?.ime)}` : '',
          rokIzdelave: normalizeDate(produkt?.datumDobave || data?.datumDobave) || '',
          rokIzdelaveUra: ddUra
        };
        setAiPreviewNalog(noviPreview);
      } catch {}
    } catch (error) {
      console.error('Napaka pri razbiranju e-maila:', error);
      setAiError(error instanceof Error ? error.message : 'Neznana napaka');
    } finally {
      setAiLoading(false);
    }
  };

  const handleUporabiAIRezultat = async () => {
    if (!aiRezultat) return;

    // NOVO: če imamo "razbraniPodatki", uporabi podatke (predogled je optional).
    if ((aiRezultat as any)?.razbraniPodatki) {
      const rp = (aiRezultat as any).razbraniPodatki || {};
      const emailText = String(emailBesedilo || '');
      const toBool = (v: any) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
      const normalizeDateToInput = (v: any) => {
        const s = (v || '').toString().trim();
        if (!s) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const mEU = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/);
        if (mEU) {
          const dd = mEU[1].padStart(2, '0');
          const mm = mEU[2].padStart(2, '0');
          const yyyy = mEU[3].length === 2 ? `20${mEU[3]}` : mEU[3];
          return `${yyyy}-${mm}-${dd}`;
        }
        const tSplit = s.split('T')[0];
        if (tSplit && /^\d{4}-\d{2}-\d{2}$/.test(tSplit)) return tSplit;
        return s;
      };
      const guessUraFromText = (txt: string): string | '' => {
        const m = (txt || '').match(/(?:do|ob)\s*(\d{1,2})(?::(\d{2}))?\s*h\b/i);
        if (!m) return '';
        const hh = String(Math.min(23, Math.max(0, parseInt(m[1], 10)))).padStart(2, '0');
        const mm = String(m[2] ? parseInt(m[2], 10) : 0).padStart(2, '0');
        return `${hh}:${mm}`;
      };
      const ensureMutacije = (t: any) => {
        const steviloMutacij = (t?.steviloMutacij || '').toString().trim() || '1';
        let mutacije = Array.isArray(t?.mutacije) ? t.mutacije : [];
        if (mutacije.length === 0) mutacije = [{ steviloPol: '' }];
        return { steviloMutacij, mutacije };
      };
      const normalizeTisk = (t: any) => {
        const raw = t || {};
        const { steviloMutacij, mutacije } = ensureMutacije(raw);
        const barve = (raw?.barve && String(raw.barve).trim())
          ? (String(raw.barve).trim() as any)
          : (normalizeColorsFromText(emailText) || '');
        const material = (raw?.material && String(raw.material).trim())
          ? (normalizeMaterialFromText(String(raw.material)) || String(raw.material))
          : '';
        return {
          predmet: (raw?.predmet != null ? String(raw.predmet) : ''),
          format: (raw?.format != null ? String(raw.format) : ''),
          obseg: (raw?.obseg != null && String(raw.obseg).trim() ? String(raw.obseg) : '1'),
          steviloKosov: (raw?.steviloKosov != null ? String(raw.steviloKosov) : ''),
          material,
          barve,
          steviloPol: (raw?.steviloPol != null ? String(raw.steviloPol) : ''),
          kosovNaPoli: (raw?.kosovNaPoli != null ? String(raw.kosovNaPoli) : ''),
          tiskaKooperant: toBool(raw?.tiskaKooperant),
          kooperant: (raw?.kooperant != null ? String(raw.kooperant) : ''),
          rokKooperanta: normalizeDateToInput(raw?.rokKooperanta),
          znesekKooperanta: (raw?.znesekKooperanta != null ? String(raw.znesekKooperanta) : ''),
          b2Format: toBool(raw?.b2Format),
          b1Format: toBool(raw?.b1Format),
          collate: toBool(raw?.collate) || /collate/i.test(emailText),
          steviloMutacij,
          mutacije,
        };
      };

      // Če imamo že zgrajen predogled, uporabimo njega (ima boljše normalizacije).
      const fromPreview = aiPreviewNalog || null;
      const kupec = fromPreview?.kupec || rp?.kupec || null;
      const kontakt = fromPreview?.kontakt || rp?.kontakt || null;
      const tisk = fromPreview?.tisk || {
        tisk1: normalizeTisk(rp?.tisk?.tisk1),
        tisk2: normalizeTisk(rp?.tisk?.tisk2),
      };
      const dodelava1 = fromPreview?.dodelava1 || rp?.dodelava?.dodelava1 || {};
      const dodelava2 = fromPreview?.dodelava2 || rp?.dodelava?.dodelava2 || {};
      const stroski1 = fromPreview?.stroski1 || rp?.stroski?.stroski1 || {};
      const stroski2 = fromPreview?.stroski2 || rp?.stroski?.stroski2 || {};
      const komentar = fromPreview?.komentar || rp?.komentar || {};
      const datumNarocila = fromPreview?.datumNarocila || normalizeDateToInput(rp?.datumNarocila) || new Date().toISOString();
      const rokIzdelave = fromPreview?.rokIzdelave || normalizeDateToInput(rp?.rokIzdelave) || '';
      const rokIzdelaveUra = fromPreview?.rokIzdelaveUra ||
        (rp?.rokIzdelaveUra && /^\d{2}:\d{2}$/.test(String(rp.rokIzdelaveUra)) ? String(rp.rokIzdelaveUra) : '') ||
        (guessUraFromText(emailText) || (rokIzdelave ? '15:00' : ''));
      const posiljanje = fromPreview?.posiljanje || rp?.posiljanje || {};

      setStevilkaNaloga(0 as any);
      setNalogPodatki({
        kupec,
        kontakt,
        tisk: {
          tisk1: { obseg: '1', steviloMutacij: '1', mutacije: [{ steviloPol: '' }], ...(tisk?.tisk1 || {}) },
          tisk2: { obseg: '1', steviloMutacij: '1', mutacije: [{ steviloPol: '' }], ...(tisk?.tisk2 || {}) },
        },
        dodelava1,
        dodelava2,
        stroski1,
        stroski2,
        posiljanje,
        komentar,
        datumNarocila,
        rokIzdelave,
        rokIzdelaveUra,
        emailPoslan: false,
        zakljucekEmailPoslan: false,
        odprtjeEmailPonujen: false,
        zakljucekEmailPonujen: false,
      } as any);
      setKey(prev => prev + 1);
      setNalogShranjeno(false);
      setEmailPoslan(false);
      setZakljucekEmailPoslan(false);
      setZakljucen(false);
      setTiskZakljucen1(false);
      setTiskZakljucen2(false);
      setDobavljeno(false);
      setZaklenjeno(false);
      setAktivniZavihek('delovniNalog');
      if (obrazecRef.current) {
        obrazecRef.current.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }
    
    // Preklopi na zavihek delovni nalog
    const uporabiParsedProdukt = async (produkt: any) => {
      const novaStevilka = generirajNaslednjoStevilko(vsiNalogi);

      // Helperji za mapiranje
      const toMaterial = (papir: string): string => {
        if (!papir) return '';
        const p = papir.toLowerCase();
        const m = papir.match(/(\d{2,4})\s*g/i);
        const g = m ? `${parseInt(m[1],10)} g/m²` : '';
        const isPremazni = p.includes('premazni');
        const isNepremazni = p.includes('nepremazni') || p.includes('brezlesni');
        const isMat = p.includes('mat');
        const isSijaj = p.includes('sijaj');
        if (isPremazni || p.includes('plastific')) {
          // Če je premazni, izberi mat/sijaj, sicer privzemi mat
          const tip = isMat ? 'mat premazni' : (isSijaj ? 'sijaj premazni' : 'mat premazni');
          return g ? `${tip} ${g}` : `${tip} 300 g/m²`;
        }
        if (isNepremazni) {
          return g ? `brezlesni, nepremazni ${g}` : 'brezlesni, nepremazni 300 g/m²';
        }
        // Če AI poda samo gramuro (npr. "300g") in e-mail je govoril o premaznem (backend zdaj to doda),
        // pa vseeno fallback:
        return g ? `mat premazni ${g}` : 'mat premazni 300 g/m²';
      };
      const toBarve = (barvnost: string): string => {
        const b = (barvnost || '').toLowerCase();
        if (b.includes('4/4') || b.includes('dvostr') || b.includes('obojestrans')) return '4/4 barvno obojestransko (CMYK)';
        if (b.includes('4/0') || (b.includes('enostr') && b.includes('barvno'))) return '4/0 barvno enostransko (CMYK)';
        if (b.includes('1/1')) return '1/1 črno belo obojestransko (K)';
        if (b.includes('1/0') || b.includes('črno') || b.includes('crno')) return '1/0 črno belo enostransko (K)';
        return '';
      };
      const toPlastifikacija = (dodelava: string, barve: string): string => {
        const d = (dodelava || '').toLowerCase();
        if (d.includes('plastific')) {
          const jeObojestransko = (barve || '').includes('4/4') || (barve || '').includes('1/1');
          const mat = d.includes('mat');
          return jeObojestransko ? (mat ? '1/1 mat' : '1/1 sijaj') : (mat ? '1/0 mat' : '1/0 sijaj');
        }
        return '';
      };
      const normalizeDate = (input?: string) => {
        if (!input) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
        const year = new Date().getFullYear();
        const mDM = input.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/);
        if (mDM) {
          const d = parseInt(mDM[1], 10);
          const m = parseInt(mDM[2], 10);
          const y = mDM[3] ? (mDM[3].length === 2 ? 2000 + parseInt(mDM[3], 10) : parseInt(mDM[3], 10)) : year;
          if (m>=1 && m<=12 && d>=1 && d<=31) return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        }
        const mMonthWord = input.match(/(\d{1,2})\.\s*(januar\w*|februar\w*|marec\w*|april\w*|maj\w*|junij\w*|julij\w*|avgust\w*|september\w*|oktober\w*|november\w*|december\w*)/i);
        if (mMonthWord) {
          const d = parseInt(mMonthWord[1], 10);
          const words = ['januar','februar','marec','april','maj','junij','julij','avgust','september','oktober','november','december'];
          const monthIdx = words.findIndex(w => mMonthWord[2].toLowerCase().startsWith(w));
          const mm = monthIdx >= 0 ? monthIdx + 1 : 7;
          return `${year}-${String(mm).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        }
        return input;
      };

      const izdelek = produkt?.izdelek || '';
      const kolicina = (produkt?.kolicina != null ? produkt.kolicina : '')?.toString() || '';
      const format = produkt?.format || '';
      const papir = produkt?.papir || '';
      const barvnost = produkt?.barvnost || '';
      const dodelava = produkt?.dodelava || '';
      const cena = produkt?.cena;
      const datum = normalizeDate(produkt?.datumDobave || aiRezultat?.datumDobave);

      let barveMapped = toBarve(barvnost);
      if (!barveMapped) {
        barveMapped = normalizeColorsFromText(emailBesedilo);
      }
      const materialMapped = toMaterial(papir);
      const plastifikacijaMapped = toPlastifikacija(dodelava, barveMapped);

      // Kupec: poskusi najti obstoječega v bazi po nazivu (AI polje "kraj" je naziv podjetja)
      const firmaNaziv = (produkt?.stranka?.kraj || aiRezultat?.stranka?.kraj || '').toString().trim();
      const kontaktIme = (produkt?.stranka?.ime || aiRezultat?.stranka?.ime || produkt?.kontakt?.ime || aiRezultat?.kontakt?.ime || '').toString();
      let kupecObj: any = {
        ...(firmaNaziv ? { Naziv: firmaNaziv } : { rocniVnos: true }),
        email: (produkt?.kontakt?.email || aiRezultat?.kontakt?.email || ''),
        Telefon: (produkt?.kontakt?.telefon || aiRezultat?.kontakt?.telefon || '')
      };
      // Dodaj narocilnica v kupec, če obstaja
      const narocilnicaVal = (produkt?.narocilnica || (aiRezultat as any)?.narocilnica || '').toString();
      if (narocilnicaVal) kupecObj.narocilnica = narocilnicaVal;
      if (firmaNaziv) {
        try {
          const resKupci = await fetch('/api/kupec');
          if (resKupci.ok) {
            const kupci = await resKupci.json();
            const niz = firmaNaziv.toLowerCase();
            let match = kupci.find((k: any) => (k?.Naziv || '').toString().toLowerCase() === niz);
            if (!match) match = kupci.find((k: any) => (k?.Naziv || '').toString().toLowerCase().includes(niz));
            // Dodatno: obrni primerjavo (npr. "Podjetje Medis" proti "Medis")
            if (!match) match = kupci.find((k: any) => niz.includes(((k?.Naziv || '').toString().toLowerCase())));
            // Dodatno: poskusi z domeno e-maila
            if (!match) {
              const emails: string[] = [];
              if (kupecObj.email) emails.push(kupecObj.email);
              const re = /[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/ig;
              let m;
              while ((m = re.exec(emailBesedilo || '')) !== null) {
                emails.push(m[0]);
              }
              const guessNames = new Set<string>();
              emails.forEach(e => {
                const dm = e.toLowerCase().split('@')[1];
                if (dm) {
                  const parts = dm.split('.');
                  const sld = parts.length >= 2 ? parts[parts.length - 2] : '';
                  if (sld) guessNames.add(sld);
                }
              });
              for (const g of guessNames) {
                match = kupci.find((k: any) => (k?.Naziv || '').toString().toLowerCase().includes(g));
                if (match) break;
              }
            }
            if (match) {
              kupecObj = { ...match, rocniVnos: false, email: match.email || kupecObj.email, narocilnica: kupecObj.narocilnica || '' };
            }
          }
        } catch {}
      }

      const posiljanjeParsed: any = {};
      const dostava = (produkt?.dostava || produkt?.dostavaNačin || '').toString().toLowerCase();
      if (dostava.includes('pošti') || dostava.includes('pošta')) posiljanjeParsed.posiljanjePoPosti = true;
      if (dostava.includes('osebni') || dostava.includes('prevzem')) posiljanjeParsed.osebnoPrevzem = true;
      if (dostava.includes('dostava') || dostava.includes('lokacijo')) posiljanjeParsed.dostavaNaLokacijo = true;
      // Fallback: razberi iz surovega e-maila
      const emailLower = (emailBesedilo || '').toLowerCase();
      if (emailLower.includes('po pošti') || emailLower.includes('po posti') || emailLower.includes('pošta')) {
        posiljanjeParsed.posiljanjePoPosti = true;
      }

      const stroski1: any = {};
      if (cena != null && cena !== '') {
        stroski1.cenaBrezDDV = String(cena);
      }

      // Zgradi dodelava1 iz dodelaveSeznam (če obstaja) + iz glavne "dodelava"
      const dodelavaObj: any = {};
      const applyDodelavaToken = (token: string) => {
        const t = (token || '').toLowerCase();
        if (!t) return;
        if (t.includes('3d uv lak') || (t.includes('uv') && t.includes('lak'))) {
          dodelavaObj.uvLak = dodelavaObj.uvLak || '1/0 parcialno';
        }
        if (t.includes('plastifikacija') || t.includes('plastificirano') || t.includes('plastific')) {
          // če že imamo plastifikacijo iz toPlastifikacija, naj ostane
          dodelavaObj.plastifikacija = dodelavaObj.plastifikacija || plastifikacijaMapped || '1/0 mat';
        }
        if (t.includes('zgib')) dodelavaObj.zgibanje = true;
        if (t.includes('big')) dodelavaObj.biganje = true;
        if (t.includes('perfor')) dodelavaObj.perforacija = true;
        if (t.includes('vrtanj') || t.includes('luknj')) dodelavaObj.vrtanjeLuknje = true;
        if (t.includes('lepljen')) dodelavaObj.lepljenje = true;
        if (t.includes('digitalni izsek')) dodelavaObj.izsek = 'digitalni izsek';
        else if (t === 'izsek' || t.includes('izsek')) dodelavaObj.izsek = dodelavaObj.izsek || 'izsek';
      };
      // Najprej lista, nato primarni string
      if (Array.isArray(produkt?.dodelaveSeznam)) {
        for (const tok of produkt.dodelaveSeznam) applyDodelavaToken(tok);
      }
      applyDodelavaToken(dodelava);
      // Če nič od zgornjega, a imamo plastifikacijo iz mapiranja
      if (!dodelavaObj.plastifikacija && plastifikacijaMapped) {
        dodelavaObj.plastifikacija = plastifikacijaMapped;
      }

      // Cena: če ni v AI rezultatu, poskusi razbrati iz e-maila
      let cenaKonv: string | undefined = undefined;
      if (cena != null && cena !== '') {
        cenaKonv = String(cena);
      } else if (emailBesedilo) {
        const m = emailBesedilo.match(/cena\s+([\d\.,]+)\s*€?/i);
        if (m) {
          const num = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
          if (isFinite(num)) cenaKonv = String(num);
        }
      }

      const noviNalog: any = {
        stevilkaNaloga: novaStevilka,
        datumNarocila: new Date().toISOString(),
        kupec: kupecObj,
        tisk: {
          tisk1: {
            predmet: izdelek || '',
            format: format || '',
            steviloKosov: kolicina || '',
            material: materialMapped || '',
            barve: barveMapped || ''
          },
          tisk2: {}
        },
        dodelava1: dodelavaObj,
        dodelava2: {},
        stroski1: { ...stroski1, ...(cenaKonv ? { cenaBrezDDV: cenaKonv } : {}) },
        stroski2: {},
        posiljanje: posiljanjeParsed,
        komentar: kontaktIme ? `Kontakt: ${kontaktIme}${(produkt?.narocilnica || aiRezultat?.narocilnica) ? ` | Naročilnica: ${produkt?.narocilnica || aiRezultat?.narocilnica}` : ''}` : ((produkt?.narocilnica || aiRezultat?.narocilnica) ? `Naročilnica: ${produkt?.narocilnica || aiRezultat?.narocilnica}` : ''),
        rokIzdelave: datum || '',
        rokIzdelaveUra: (produkt?.datumDobaveUra || (aiRezultat as any)?.datumDobaveUra || (() => {
          // Fallback: preberi uro iz surovega e-maila (zahtevaj 'h' da ne ujamemo datumov)
          const m = (emailBesedilo || '').match(/(?:do|ob)\s*(\d{1,2})(?::(\d{2}))?\s*h\b/i);
          if (m) {
            const hh = String(Math.min(23, Math.max(0, parseInt(m[1], 10)))).padStart(2,'0');
            const mm = String(m[2] ? parseInt(m[2], 10) : 0).padStart(2,'0');
            return `${hh}:${mm}`;
          }
          return '15:00';
        })()),
        emailPoslan: false,
        zakljucekEmailPoslan: false,
      };
      setNalogPodatki(noviNalog);
      setStevilkaNaloga(novaStevilka);
      setKey(prev => prev + 1);
      setNalogShranjeno(false);
      setAktivniZavihek('delovniNalog');
    };
    // Če AI vrne več produktov, uporabi prvega z glavnim gumbom
    if (Array.isArray(aiRezultat?.produkti) && aiRezultat.produkti.length > 0) {
      const p = aiRezultat.produkti;
      if (p.length === 1) {
        await uporabiParsedProdukt(p[0]);
      } else {
        // Zgradi oba tiska (tisk1, tisk2) v en sam nalog
        const novaStevilka = generirajNaslednjoStevilko(vsiNalogi);
        const build = async (produkt: any) => {
          const toMaterial = (papir: string): string => {
            if (!papir) return '';
            const x = papir.toLowerCase();
            const m = papir.match(/(\d{2,4})\s*g/i);
            const g = m ? `${parseInt(m[1],10)} g/m²` : '';
            const isPremazni = x.includes('premazni');
            const isNepremazni = x.includes('nepremazni') || x.includes('brezlesni');
            const isMat = x.includes('mat');
            const isSijaj = x.includes('sijaj');
            if (isPremazni || x.includes('plastific')) {
              const tip = isMat ? 'mat premazni' : (isSijaj ? 'sijaj premazni' : 'mat premazni');
              return g ? `${tip} ${g}` : `${tip} 300 g/m²`;
            }
            if (isNepremazni) return g ? `brezlesni, nepremazni ${g}` : 'brezlesni, nepremazni 300 g/m²';
            return g ? `mat premazni ${g}` : 'mat premazni 300 g/m²';
          };
          const toBarve = (barvnost: string): string => {
            const b = (barvnost || '').toLowerCase();
            if (b.includes('4/4') || b.includes('dvostr') || b.includes('obojestrans')) return '4/4 barvno obojestransko (CMYK)';
            if (b.includes('4/0') || (b.includes('enostr') && b.includes('barvno'))) return '4/0 barvno enostransko (CMYK)';
            if (b.includes('1/1')) return '1/1 črno belo obojestransko (K)';
            if (b.includes('1/0') || b.includes('črno') || b.includes('crno')) return '1/0 črno belo enostransko (K)';
            return '';
          };
          const izdelek = produkt?.izdelek || '';
          const kolicina = (produkt?.kolicina != null ? produkt.kolicina : '')?.toString() || '';
          const format = produkt?.format || '';
          const papir = produkt?.papir || '';
          const barvnost = produkt?.barvnost || '';
          let barveMapped = toBarve(barvnost);
          if (!barveMapped) barveMapped = normalizeColorsFromText(emailBesedilo);
          const materialMapped = toMaterial(papir);
          const cenaKonv = produkt?.cena != null ? String(produkt.cena) : undefined;
          // dodelava
          const dodelavaObj: any = {};
          const apply = (token: string) => {
            const t = (token || '').toLowerCase();
            if (!t) return;
            if (t.includes('uv') && t.includes('lak')) dodelavaObj.uvLak = dodelavaObj.uvLak || '1/0 parcialno';
            if (t.includes('plastific')) {
              dodelavaObj.plastifikacija = dodelavaObj.plastifikacija || ((barveMapped.includes('4/4') || barveMapped.includes('1/1')) ? '1/1 mat' : '1/0 mat');
            }
            if (t.includes('zgib')) dodelavaObj.zgibanje = true;
            if (t.includes('big')) dodelavaObj.biganje = true;
            if (t.includes('perfor')) dodelavaObj.perforacija = true;
            if (t.includes('vrtanj') || t.includes('luknj')) dodelavaObj.vrtanjeLuknje = true;
            if (t.includes('lepljen')) dodelavaObj.lepljenje = true;
            if (t.includes('digitalni izsek')) dodelavaObj.izsek = 'digitalni izsek';
            else if (t.includes('izsek')) dodelavaObj.izsek = dodelavaObj.izsek || 'izsek';
          };
          if (Array.isArray(produkt?.dodelaveSeznam)) produkt.dodelaveSeznam.forEach(apply);
          if (produkt?.dodelava) apply(produkt.dodelava);
          return {
            tisk: { predmet: izdelek || '', format, steviloKosov: kolicina, material: materialMapped, barve: barveMapped },
            dodelava: dodelavaObj,
            cena: cenaKonv
          };
        };
        const a = await build(p[0]);
        const b = await build(p[1]);
        const noviNalog: any = {
          stevilkaNaloga: novaStevilka,
          datumNarocila: new Date().toISOString(),
          kupec: {},
          tisk: { tisk1: a.tisk, tisk2: b.tisk },
          dodelava1: a.dodelava,
          dodelava2: b.dodelava,
          stroski1: a.cena ? { cenaBrezDDV: a.cena } : {},
          stroski2: b.cena ? { cenaBrezDDV: b.cena } : {},
          posiljanje: {},
          komentar: '',
          rokIzdelave: '',
          rokIzdelaveUra: '',
          emailPoslan: false,
          zakljucekEmailPoslan: false
        };
        setNalogPodatki(noviNalog);
        setStevilkaNaloga(novaStevilka);
        setKey(prev => prev + 1);
        setNalogShranjeno(false);
        setAktivniZavihek('delovniNalog');
        return;
      }
    } else {
      await uporabiParsedProdukt(aiRezultat);
    }
  };

  // Reset lokalno shranjene naloge (testne) in zaprte korake
  const [currentYearFilter, setCurrentYearFilter] = useState<number | null>(new Date().getFullYear());
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{label: string; loaded: number; total?: number} | null>(null);
  const cancelImportRef = useRef<{cancel: boolean}>({ cancel: false });
  const hydratedActiveRef = useRef<{ yearMin: number | null; done: boolean }>({ yearMin: null, done: false });

  // Če se kupec v SQL posodobi/doda, posodobi tudi shranjene naloge (snapshot kupca),
  // da se v seznamih in pri pošiljanju emaila takoj pokažejo novi podatki.
  useEffect(() => {
    const handler = (ev: any) => {
      const detail = ev?.detail || {};
      const kupecID = Number(detail?.KupecID || 0);
      if (!Number.isFinite(kupecID) || kupecID <= 0) return;

      // Delete: odstrani snapshot kupca iz nalogov (ne briši nalogov)
      if (detail?.__action === 'delete') {
        setVsiNalogi((prev: any[]) => {
          const arr = Array.isArray(prev) ? prev : [];
          const updated = arr.map((n: any) => {
            const p = n?.podatki || {};
            const k = p?.kupec || {};
            if (Number(k?.KupecID || 0) !== kupecID) return n;
            return { ...n, podatki: { ...p, kupec: null } };
          });
          try { shraniNalogeVLokalno(updated); } catch {}
          return updated;
        });
        (async () => {
          try { await patchKupecInIndexedDB(kupecID, null); } catch {}
          try {
            const refreshed = await loadByYearRange(currentYearFilter);
            setVsiNalogi(refreshed);
            try { shraniNalogeVLokalno(refreshed as any); } catch {}
          } catch {}
        })();
        return;
      }

      const nextKupec = {
        KupecID: kupecID,
        Naziv: detail?.Naziv ?? '',
        Naslov: detail?.Naslov ?? '',
        Posta: detail?.Posta ?? '',
        Kraj: detail?.Kraj ?? '',
        Telefon: detail?.Telefon ?? '',
        Fax: detail?.Fax ?? '',
        IDzaDDV: detail?.IDzaDDV ?? '',
        email: detail?.email ?? detail?.Email ?? '',
      };
      setVsiNalogi((prev: any[]) => {
        const arr = Array.isArray(prev) ? prev : [];
        let changed = false;
        const updated = arr.map((n: any) => {
          const p = n?.podatki || {};
          const k = p?.kupec || {};
          if (Number(k?.KupecID || 0) !== kupecID) return n;
          changed = true;
          return {
            ...n,
            podatki: {
              ...p,
              kupec: { ...k, ...nextKupec }
            }
          };
        });
        if (changed) {
          try { shraniNalogeVLokalno(updated); } catch {}
        }
        return changed ? updated : prev;
      });

      // Posodobi tudi IndexedDB in osveži seznam (da so podatki konsistentni tudi po menjavi let/ponovnem zagonu)
      (async () => {
        try { await patchKupecInIndexedDB(kupecID, nextKupec); } catch {}
        try {
          const refreshed = await loadByYearRange(currentYearFilter);
          setVsiNalogi(refreshed);
          try { shraniNalogeVLokalno(refreshed as any); } catch {}
        } catch {}
      })();
    };
    window.addEventListener('kupec-sql-changed', handler as any);
    return () => window.removeEventListener('kupec-sql-changed', handler as any);
  }, [currentYearFilter]);

  // Po zagonu: če so aktivni nalogi v localStorage "lite" (manjkajo rok ura / dodelave),
  // jih samodejno osveži iz backend-a, da PrioritetniNalogi dela pravilno brez dvoklika+shrani.
  useEffect(() => {
    if (importing) return;
    // Če smo ta year filter že osvežili, ne ponavljaj.
    if (hydratedActiveRef.current.done && hydratedActiveRef.current.yearMin === currentYearFilter) return;
    const list = Array.isArray(vsiNalogi) ? vsiNalogi : [];
    if (list.length === 0) return;

    const toBool = (v: any) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
    const isActive = (n: any) => {
      const status = String(n?.status ?? n?.Status ?? n?.podatki?.status ?? n?.podatki?.Status ?? '').toLowerCase();
      const dob = toBool(n?.dobavljeno) || toBool(n?.Dobavljeno) || toBool(n?.podatki?.dobavljeno) || toBool(n?.podatki?.Dobavljeno);
      const zak = toBool(n?.zakljucen) || /zaklju/.test(status);
      return !dob && !zak && (status === 'v_delu' || status === 'v teku' || status === 'v_teku' || status === '' || status === 'aktivno');
    };
    const needsHydration = (n: any) => {
      const p = n?.podatki || {};
      const rok = p?.rokIzdelave ?? p?.RokIzdelave ?? n?.rokIzdelave ?? n?.RokIzdelave ?? '';
      const ura = p?.rokIzdelaveUra ?? p?.RokIzdelaveUra ?? n?.rokIzdelaveUra ?? n?.RokIzdelaveUra ?? '';
      const hasRok = !!String(rok || '').trim();
      const hasUra = /^\d{1,2}:\d{2}$/.test(String(ura || '').trim());
      const d1 = p?.dodelava1 || p?.dodelava?.dodelava1 || {};
      const d2 = p?.dodelava2 || p?.dodelava?.dodelava2 || {};
      const hasDodelave = !!(
        (d1 && Object.values(d1).some(Boolean)) ||
        (d2 && Object.values(d2).some(Boolean))
      );
      return hasRok && (!hasUra || !hasDodelave);
    };

    const ids = list
      .filter(isActive)
      .filter(needsHydration)
      .map((n: any) => Number(n?.stevilkaNaloga ?? n?.StevilkaNaloga ?? n?.DelovniNalogID ?? n?.nalog))
      .filter((id: any) => Number.isFinite(id) && id > 0)
      .slice(0, 30); // varovalka

    if (ids.length === 0) {
      hydratedActiveRef.current = { yearMin: currentYearFilter, done: true };
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        for (const id of ids) {
          if (cancelled) return;
          try {
            const res = await fetch(`/api/delovni-nalog/${id}`);
            if (res.ok) {
              const payload = await res.json();
              // Hydration payload je pogosto "lite" (SQL ne vrača vseh polj dodelav),
              // zato merge-aj v IndexedDB, da ne izgubimo lokalnih dodelav.
              try { await saveBatchToIndexedDBPreserveExisting([payload]); } catch {}
            }
          } catch {}
        }
        if (cancelled) return;
        // Osveži seznam iz IndexedDB (ima največ šans, da vsebuje "full" podatke)
        try {
          const refreshed = await loadByYearRange(currentYearFilter);
          if (!cancelled) {
            setVsiNalogi(refreshed);
            try { shraniNalogeVLokalno(refreshed as any); } catch {}
          }
        } catch {}
      } finally {
        hydratedActiveRef.current = { yearMin: currentYearFilter, done: true };
      }
    })();

    return () => { cancelled = true; };
  }, [currentYearFilter, importing, vsiNalogi]);

  const handleResetShranjeniNalogi = async () => {
    try {
      localStorage.removeItem('delovniNalogi');
      localStorage.removeItem('closedTasks');
      localStorage.removeItem('sqlImportOffset');
    } catch {}
    try { await clearIndexedDB(); } catch {}
    setVsiNalogi([]);
    setClosedTasks([]);
    try {
      const cur = new Date().getFullYear();
      setCurrentYearFilter(cur);
      await ensureYearsLoaded(cur);
      const data = await loadByYearRange(cur);
      setVsiNalogi(data);
    } catch (e) {
      console.error('Init after reset failed:', e);
    }
  };

  // Uvoz nalogov iz SQL test baze (DelovniNalog_TEST) v IndexedDB po straneh
  async function ensureYearsLoaded(yearMin: number | null, opts?: { force?: boolean }) {
    cancelImportRef.current.cancel = false;
    setImporting(true);
    if (yearMin == null) {
      // Vsa leta - neznan total, prikazujemo sprotni napredek
      const batchSize = 1500;
      let offset = 0;
      let loaded = 0;
      for (;;) {
        if (cancelImportRef.current.cancel) break;
        setImportProgress({ label: 'Uvoz vseh let', loaded });
        const params = new URLSearchParams({
          // Pomembno: normalized=true, da dobimo tudi stare podatke (material/dodelave/stroški) v enotni JSON shemi
          lite: 'false', normalized: 'true', limit: String(batchSize), offset: String(offset),
        });
        const res = await fetch(`/api/delovni-nalogi?${params.toString()}`);
        if (!res.ok) break;
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) break;
        await saveBatchToIndexedDBPreserveExisting(rows);
        loaded += rows.length;
        offset += rows.length;
        if (rows.length < batchSize) break;
      }
      setImportProgress(null);
      setImporting(false);
      return;
    }
    // Specifična leta (inkluzivno do trenutnega)
    const nowY = new Date().getFullYear();
    for (let y = yearMin; y <= nowY; y++) {
      if (cancelImportRef.current.cancel) break;
      const forceThisYear = !!opts?.force && y === yearMin;
      const have = await db.nalogi.where('year').equals(y).count();
      if (have > 0 && !forceThisYear) {
        // Če v tem letu že imamo naloge, a so "lite" (manjkajo stroski/material/dodelava),
        // naredi re-import z normalized=true, da se zapolnijo manjkajoči podatki.
        try {
          const missing = await db.nalogi
            .where('year')
            .equals(y)
            .filter((row: any) => {
              const p = row?.podatki || {};
              const tisk1 = p?.tisk?.tisk1 || {};
              const tisk2 = p?.tisk?.tisk2 || {};
              const hasAnyMaterial = !!(String(tisk1?.material || '').trim() || String(tisk2?.material || '').trim());
              const d1 = p?.dodelava1 || p?.dodelava?.dodelava1 || {};
              const d2 = p?.dodelava2 || p?.dodelava?.dodelava2 || {};
              const hasAnyDodelava = !!(
                (d1 && Object.values(d1).some(Boolean)) ||
                (d2 && Object.values(d2).some(Boolean))
              );
              const s1 = p?.stroski1 || p?.stroski?.stroski1 || {};
              const s2 = p?.stroski2 || p?.stroski?.stroski2 || {};
              const hasAnyStroski = !!(
                (s1 && Object.values(s1).some(Boolean)) ||
                (s2 && Object.values(s2).some(Boolean))
              );
              // Dodatna detekcija: če je rok (datum) nastavljen, a ura manjka, to je pogosto "lite" zapis.
              const hasRok = !!String(p?.rokIzdelave || p?.RokIzdelave || '').trim();
              const hasUra = !!String(p?.rokIzdelaveUra || p?.RokIzdelaveUra || '').trim();
              const missingCritical = hasRok && !hasUra;
              return !(hasAnyMaterial || hasAnyDodelava || hasAnyStroski) || missingCritical;
            })
            .limit(1)
            .toArray();
          if (!missing || missing.length === 0) {
            continue; // leto je že dovolj "polno"
          }
        } catch {
          // če preverjanje odpove, raje poskusi reimport (ne škodi - bulkPut samo prepiše)
        }
      }
      const batchSize = 1500;
      let offset = 0;
      let loaded = 0;
      const total = undefined; // ne vemo vnaprej
      for (;;) {
        if (cancelImportRef.current.cancel) break;
        setImportProgress({ label: `Uvoz leta ${y}`, loaded, total });
        const params = new URLSearchParams({
          // Pomembno: normalized=true, da dobimo tudi stare podatke (material/dodelave/stroški) v enotni JSON shemi
          lite: 'false', normalized: 'true', limit: String(batchSize), offset: String(offset), year: String(y),
        });
        const res = await fetch(`/api/delovni-nalogi?${params.toString()}`);
        if (!res.ok) break;
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) break;
        await saveBatchToIndexedDBPreserveExisting(rows);
        loaded += rows.length;
        offset += rows.length;
        if (rows.length < batchSize) break;
      }
    }
    setImportProgress(null);
    setImporting(false);
  }

  // Uvoz nalogov iz SQL test baze (DelovniNalog_TEST) v lokalni seznam (IDB + prikaz)
  const handleImportFromSQLTest = async () => {
    try {
      // Če je izbran filter let, uvozi samo ta leta (od izbranega do trenutnega); sicer vsa leta
      await ensureYearsLoaded(currentYearFilter);
      const rows = await loadByYearRange(currentYearFilter);
      setVsiNalogi(rows);
      return;
    } catch (e) {
      alert('Napaka pri uvozu iz SQL DelovniNalog_TEST');
      console.error(e);
    }
  };

  // Ob spremembi filtra leta iz SeznamNaloga
  const onYearFilterChange = async (y: number | null) => {
    setCurrentYearFilter(y);
    try {
      await ensureYearsLoaded(y);
      const data = await loadByYearRange(y);
      setVsiNalogi(data);
    } catch (e) {
      console.error('Napaka pri nalaganju let iz IndexedDB:', e);
    }
  };

  // Ob mount prikaži aktualno leto (odpri 2025 ipd.)
  useEffect(() => {
    (async () => {
      try {
        const cur = new Date().getFullYear();
        // Cleanup: odstrani pokvarjene zapise (npr. stevilkaNaloga=0), da ne vplivajo na sezname/prioritete
        try { await cleanupInvalidNalogi(); } catch {}
        // Ključno: ob zagonu prisili re-import trenutnega leta (da se 2026 takoj “polno” naloži in prioritete delajo)
        await ensureYearsLoaded(cur, { force: true });
        const data = await loadByYearRange(cur);
        setVsiNalogi(data);
      } catch (e) {
        console.error('Init load failed:', e);
      }
    })();
  }, []);

  // Soft refresh: vsakih 10s osveži samo seznam shranjenih nalogov iz SQL (ne posega v odprt obrazec).
  // Pravilo konflikta ostaja "zadnji shrani zmaga" (SQL je vir resnice); UI tu samo osveži seznam.
  useEffect(() => {
    if (importing) return;
    const nowY = new Date().getFullYear();
    // Pollamo samo tekoče leto (najbolj tipično za delo). Seznam pa osvežimo ne glede na filter,
    // ker lahko filter (npr. 2025) vključuje tudi 2026 (>= filterLeto).

    let cancelled = false;
    const toBool = (v: any) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
    let inFlight = false;

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (inFlight) return;
      inFlight = true;
      try {
        const params = new URLSearchParams({
          lite: 'true',
          normalized: 'false',
          limit: '2000',
          offset: '0',
          year: String(nowY),
        });
        const res = await fetch(`/api/delovni-nalogi?${params.toString()}`);
        if (!res.ok) return;
        const rows = await res.json().catch(() => []);
        if (!Array.isArray(rows) || rows.length === 0) return;

        const hydrateQueue: Array<{ stevilka: number; fullId: number | null }> = [];

        // Mehko osveži samo seznam (vsiNalogi). Nikoli ne kliči applyFromPayload tukaj.
        setVsiNalogi((prev: any[]) => {
          const prevArr = Array.isArray(prev) ? prev : [];
          const byId = new Map<number, any>();
          for (const n of prevArr) {
            const id = Number(n?.stevilkaNaloga);
            if (Number.isFinite(id) && id > 0) byId.set(id, n);
          }

          const openId = Number(openNalogRef.current || 0);
          const blockOpen = openId > 0 && !nalogShranjeno; // če je odprt nalog nespremenjen/shranjen=false, ga ne prepiši v seznamu
          let changed = false;

          for (const r of rows) {
            const id = Number(r?.StevilkaNaloga ?? r?.stevilkaNaloga ?? r?.DelovniNalogID ?? r?.nalog);
            if (!Number.isFinite(id) || id <= 0) continue;
            if (blockOpen && id === openId) continue;

            const existing = byId.get(id) || {};
            const p0 = (existing && existing.podatki && typeof existing.podatki === 'object') ? existing.podatki : {};
            const p: any = { ...p0 };

            const kupecNaziv = (r?.KupecNaziv ?? r?.kupecNaziv ?? r?.Naziv ?? null);
            if (kupecNaziv != null && String(kupecNaziv).trim()) {
              p.kupec = { ...(p.kupec || {}), Naziv: String(kupecNaziv).trim() };
              p.KupecNaziv = String(kupecNaziv).trim();
            }
            // Lite payload ne sme "pobrisati" predmetov z prazno vrednostjo (to povzroča utripanje).
            // Če je predmet dejansko spremenjen/počistjen, to pride preko FULL hydrate (nalog-updated).
            if (r?.Predmet1 != null && String(r.Predmet1).trim().length > 0) {
              p.Predmet1 = r.Predmet1;
              // Če imamo že "full" strukturo, posodobi tudi nested (da UI, ki bere tisk.tisk1.predmet, takoj pokaže spremembo).
              if (p?.tisk?.tisk1 && typeof p.tisk.tisk1 === 'object') {
                p.tisk = { ...(p.tisk || {}), tisk1: { ...(p.tisk.tisk1 || {}), predmet: r.Predmet1 } };
              }
            }
            if (r?.Predmet2 != null && String(r.Predmet2).trim().length > 0) {
              p.Predmet2 = r.Predmet2;
              if (p?.tisk?.tisk2 && typeof p.tisk.tisk2 === 'object') {
                p.tisk = { ...(p.tisk || {}), tisk2: { ...(p.tisk.tisk2 || {}), predmet: r.Predmet2 } };
              }
            }

            const dOdprtja = r?.DatumOdprtja ?? r?.datumNarocila ?? null;
            if (dOdprtja) {
              try {
                const d = new Date(dOdprtja);
                if (!isNaN(+d)) p.datumNarocila = d.toISOString();
              } catch {}
            }
            const rok = r?.RokIzdelave ?? r?.rokIzdelave ?? null;
            if (rok != null && String(rok).trim()) p.rokIzdelave = rok;
            const ura = r?.RokIzdelaveUra ?? r?.rokIzdelaveUra ?? null;
            if (ura != null && String(ura).trim()) p.rokIzdelaveUra = String(ura).trim();

            const dob = toBool(r?.Dobavljeno ?? r?.dobavljeno);
            const t1 = toBool(r?.TiskZakljucen1 ?? r?.tiskZakljucen1);
            const t2 = toBool(r?.TiskZakljucen2 ?? r?.tiskZakljucen2);
            const zak = toBool(r?.TiskZakljucen ?? r?.tiskZakljucen) || (t1 && t2) || /zaklju/.test(String(r?.Status || '').toLowerCase());
            const status = dob ? 'dobavljeno' : (zak ? 'zaključen' : 'v_delu');

            const remoteSavedAt = (r?.DatumShranjevanja ?? r?.datumShranjevanja ?? null);
            const remoteSavedAtStr = remoteSavedAt ? String(remoteSavedAt) : '';
            const existingSavedAtStr = String(existing?.datumShranjevanja || '');
            if (remoteSavedAtStr && remoteSavedAtStr !== existingSavedAtStr) {
              const fullIdRaw = (r as any)?.DelovniNalogID ?? (r as any)?.delovniNalogID ?? null;
              const fullIdNum = Number(fullIdRaw);
              hydrateQueue.push({ stevilka: id, fullId: Number.isFinite(fullIdNum) && fullIdNum > 0 ? fullIdNum : null });
            }

            const next = {
              ...existing,
              stevilkaNaloga: id,
              podatki: p,
              status,
              dobavljeno: dob,
              zakljucen: zak,
              tiskZakljucen1: t1,
              tiskZakljucen2: t2,
              rokIzdelave: p.rokIzdelave ?? existing.rokIzdelave,
              datumNarocila: p.datumNarocila ?? existing.datumNarocila,
              datumShranjevanja: remoteSavedAtStr || existing?.datumShranjevanja || '',
            };

            const prevKupec = String(existing?.podatki?.kupec?.Naziv || existing?.podatki?.KupecNaziv || '');
            const nextKupec = String(next?.podatki?.kupec?.Naziv || next?.podatki?.KupecNaziv || '');
            const prevP1 = String(existing?.podatki?.Predmet1 || existing?.podatki?.tisk?.tisk1?.predmet || '');
            const nextP1 = String(next?.podatki?.Predmet1 || next?.podatki?.tisk?.tisk1?.predmet || '');
            const prevP2 = String(existing?.podatki?.Predmet2 || existing?.podatki?.tisk?.tisk2?.predmet || '');
            const nextP2 = String(next?.podatki?.Predmet2 || next?.podatki?.tisk?.tisk2?.predmet || '');

            if (
              !byId.has(id) ||
              existing?.status !== next.status ||
              !!existing?.dobavljeno !== !!next.dobavljeno ||
              !!existing?.tiskZakljucen1 !== !!next.tiskZakljucen1 ||
              !!existing?.tiskZakljucen2 !== !!next.tiskZakljucen2 ||
              String(existing?.podatki?.rokIzdelave || '') !== String(next?.podatki?.rokIzdelave || '') ||
              String(existing?.podatki?.rokIzdelaveUra || '') !== String(next?.podatki?.rokIzdelaveUra || '') ||
              String(existing?.datumShranjevanja || '') !== String(next?.datumShranjevanja || '') ||
              prevKupec !== nextKupec ||
              prevP1 !== nextP1 ||
              prevP2 !== nextP2
            ) {
              changed = true;
              byId.set(id, next);
            }
          }

          if (!changed) return prev;
          const out = Array.from(byId.values()).sort((a, b) => Number(b?.stevilkaNaloga || 0) - Number(a?.stevilkaNaloga || 0));
          try { shraniNalogeVLokalno(out); } catch {}
          return out;
        });

        // Če je kateri nalog posodobljen, poberi "full" verzijo in posodobi IndexedDB + vsiNalogi
        if (hydrateQueue.length > 0) {
          const seen = new Set<string>();
          const items = hydrateQueue.filter(x => {
            const k = `${x.fullId || 0}|${x.stevilka}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          }).slice(0, 25);
          for (const it of items) {
            try {
              const fetchId = (it.fullId && it.fullId > 0) ? it.fullId : it.stevilka;
              const r = await fetch(`/api/delovni-nalog/${fetchId}`);
              if (!r.ok) continue;
              const payload = await r.json().catch(() => null);
              if (payload) {
                try { await saveBatchToIndexedDBPreserveExisting([payload]); } catch {}
              }
            } catch {}
          }
          try {
            const refreshed = await loadByYearRange(currentYearFilter);
            setVsiNalogi(refreshed);
            try { shraniNalogeVLokalno(refreshed as any); } catch {}
          } catch {}
        }
      } catch {}
      finally {
        inFlight = false;
      }
    };

    const intervalId = setInterval(tick, 10_000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [currentYearFilter, importing, nalogShranjeno]);

  // Napreden uvoz: ohranimo stari ročni batch uvoz (offset/cursor) kot dodatno možnost
  const handleImportFromSQLTest_advanced = async () => {
    try {
      // Uvozi eno "stran" (1500) na klik; offset se hrani v localStorage (sqlImportOffset)
      const batchSize = 1500;
      let importOffset = 0;
      try {
        const s = localStorage.getItem('sqlImportOffset');
        if (s) {
          const n = parseInt(s, 10);
          if (Number.isFinite(n) && n >= 0) importOffset = n;
        }
      } catch {}
      const params = new URLSearchParams({
        lite: 'false',
        normalized: 'true',
        limit: String(batchSize),
        offset: String(importOffset),
      });
      let rows: any[] = [];
      let usedMode: 'offset'|'cursor' = 'offset';
      let beforeCursor: number | null = null;
      {
      const res = await fetch(`/api/delovni-nalogi?${params.toString()}`);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${errText ? `: ${errText}` : ''}`);
      }
        rows = await res.json();
      }
      if (!Array.isArray(rows)) rows = [];

      // Mapiranje enega batcha
      const mapBatch = (arr: any[]) => (arr || []).map((r: any, idx: number) => {
        if (r && r.podatki && (r.stevilkaNaloga || r.stevilkaNaloga === 0)) {
          return r;
        }
        const ci = new Map<string, any>();
        Object.keys(r || {}).forEach(k => ci.set(k.toLowerCase(), r[k]));
        const get = (...keys: string[]) => {
          for (const k of keys) {
            const v = ci.get(k.toLowerCase());
            if (v !== undefined && v !== null) return v;
          }
          return undefined;
        };
        const num = (v: any) => { const n = Number(v); return isFinite(n) ? n : undefined; };
        const toIso = (v: any) => { if (!v) return undefined; try { const d = new Date(v); if (isNaN(d.getTime())) return undefined; return d.toISOString(); } catch { return undefined; } };
        const stevilkaNaloga = num(get('StevilkaNaloga','ŠtevilkaNaloga','stevilkanaloga','Stevilka_Naloga','NalogStevilka','Stevilka','DelovniNalogID','delovninalogid','nalog','id')) ?? (65000 + idx + 1);
        const datumNarocila = get('DatumOdprtja','datumodprtja','Datum','datum','DatumNastanka','datumnastanka','DatumUstvarjanja','datumustvarjanja') ?? null;
        const rokIzdelave = get('RokIzdelave','rokizdelave','Rok','rok','RokDobave','rokdobave','RokIzdel','rokizdel') ?? null;
        const kupecID = num(get('KupecID','kupecid','Kupec','kupec','IdKupca','idkupca','StrankaID','strankaid')) ?? null;
        const komentar = get('Komentar','komentar','Opis','opis','Opomba','opomba','Opombe','opombe') ?? '';
        const email = get('Email','email','E-Mail','e-mail','E_posta','e_posta','Eposta','eposta') ?? '';
        const kontaktnaOseba = get('KontaktnaOseba','kontaktnaoseba','Kontakt_Oseba','kontakt_oseba','KontaktOseba','kontaktoseba','Kontakt','kontakt','KupecKontakt','kupeckontakt') ?? '';
        const statusRaw = get('Status','status','Stanje','stanje');
        const tiskZakljucen = !!get('TiskZakljucen','tiskzakljucen');
        const dobavljeno = !!get('Dobavljeno','dobavljeno');
        const status = dobavljeno ? 'dobavljeno' : (tiskZakljucen ? 'zakljucen' : (statusRaw || 'v_delu'));
        const kupecNaziv = get('KupecNaziv','kupecnaziv','Naziv','naziv');
        const kupecNaslov = get('KupecNaslov','kupecnaslov','Naslov','naslov');
        const kupecPosta = get('KupecPosta','kupecposta','Posta','posta');
        const kupecKraj = get('KupecKraj','kupeckraj','Kraj','kraj');
        const kupecTelefon = get('KupecTelefon','kupectelefon','Telefon','telefon');
        const kupecFax = get('KupecFax','kupecfax','Fax','fax');
        const kupecIDzaDDV = get('KupecIDzaDDV','kupecidzaddv','IDzaDDV','idzaddv');
        const opombeRaw = get('Opombe','opombe','Komentar','komentar','Opis','opis') || '';
        const parsed = (() => {
          const res: any = { tisk1: {}, tisk2: {}, dodelava1: {}, stroski1: {}, posiljanje: {} };
          const raw = String(opombeRaw || '');
          if (!raw.trim()) return res;
          return res;
        })();
        const tiskData: any = {};
        if (parsed.tisk1 && Object.keys(parsed.tisk1).length) tiskData.tisk1 = parsed.tisk1;
        if (parsed.tisk2 && Object.keys(parsed.tisk2).length) tiskData.tisk2 = parsed.tisk2;
        const dodelavaData = { dodelava1: parsed.dodelava1 || {} };
        const stroskiData = { stroski1: parsed.stroski1 || {} };
        const posiljanjeData = parsed.posiljanje && Object.keys(parsed.posiljanje).length ? parsed.posiljanje : null;
        return {
          stevilkaNaloga,
          datumNarocila: toIso(datumNarocila) || datumNarocila || null,
          rokIzdelave: toIso(rokIzdelave) || rokIzdelave || null,
          podatki: {
            kupec: {
              ...(kupecID != null ? { KupecID: kupecID } : {}),
              ...(kupecNaziv != null ? { Naziv: kupecNaziv } : {}),
              ...(kupecNaslov != null ? { Naslov: kupecNaslov } : {}),
              ...(kupecPosta != null ? { Posta: kupecPosta } : {}),
              ...(kupecKraj != null ? { Kraj: kupecKraj } : {}),
              ...(kupecTelefon != null ? { Telefon: kupecTelefon } : {}),
              ...(kupecFax != null ? { Fax: kupecFax } : {}),
              ...(kupecIDzaDDV != null ? { IDzaDDV: kupecIDzaDDV } : {}),
              ...(email ? { Email: email } : {})
            },
            kontakt: { kontaktnaOseba: String(kontaktnaOseba || ''), email: String(email || ''), telefon: kupecTelefon || '' },
            komentar: { komentar: String(komentar || '') },
            ...(Object.keys(tiskData).length ? { tisk: tiskData } : {}),
            ...(parsed && parsed.dodelava1 && Object.keys(parsed.dodelava1).length ? { dodelava: dodelavaData } : {}),
            ...(parsed && parsed.stroski1 && Object.keys(parsed.stroski1).length ? { stroski: stroskiData } : {}),
            ...(posiljanjeData ? { posiljanje: posiljanjeData } : {})
          },
          status: String(status || 'v_delu'),
          zakljucen: tiskZakljucen,
          dobavljeno: dobavljeno,
          emailPoslan: false,
          zakljucekEmailPoslan: false,
          datumShranjevanja: new Date().toISOString(),
        };
      });

      const existing = Array.isArray(vsiNalogi) ? vsiNalogi : [];
      const prevCount = existing.length;
      const byId = new Map<number, any>();
      for (const n of existing) {
        if (n && (typeof n.stevilkaNaloga === 'number' || typeof n.stevilkaNaloga === 'string')) {
          byId.set(Number(n.stevilkaNaloga), n);
        }
      }
      const mappedBatch = mapBatch(rows);
      for (const n of mappedBatch) {
        if (n && (typeof n.stevilkaNaloga === 'number' || typeof n.stevilkaNaloga === 'string')) {
          const key = Number(n.stevilkaNaloga);
          if (!byId.has(key)) byId.set(key, n);
        }
      }
      let merged = Array.from(byId.values()).sort((a: any, b: any) => Number(b.stevilkaNaloga) - Number(a.stevilkaNaloga));
      let addedCount = merged.length - prevCount;

      // Če offset ni dal novih, poskusi cursor (before = najnižja trenutno naložena številka)
      if (addedCount === 0 && merged.length > 0) {
        const minId = merged.reduce((m: number, n: any) => Math.min(m, Number(n.stevilkaNaloga) || m), Number.MAX_SAFE_INTEGER);
        if (Number.isFinite(minId)) {
          const p2 = new URLSearchParams({
            lite: 'false',
            normalized: 'true',
            limit: String(batchSize),
            before: String(minId)
          });
          const res2 = await fetch(`/api/delovni-nalogi?${p2.toString()}`);
          if (res2.ok) {
            const rows2 = await res2.json();
            usedMode = 'cursor';
            beforeCursor = minId;
            const mapped2 = mapBatch(Array.isArray(rows2) ? rows2 : []);
            for (const n of mapped2) {
              if (n && (typeof n.stevilkaNaloga === 'number' || typeof n.stevilkaNaloga === 'string')) {
                const key = Number(n.stevilkaNaloga);
                if (!byId.has(key)) byId.set(key, n);
              }
            }
            merged = Array.from(byId.values()).sort((a: any, b: any) => Number(b.stevilkaNaloga) - Number(a.stevilkaNaloga));
            addedCount = merged.length - prevCount;
          }
        }
      }

      // Poskusi shraniti; ob QuotaExceeded omeji velikost
      let toSave = merged;
      while (toSave.length > 0) {
        try {
          shraniNalogeVLokalno(toSave);
          setVsiNalogi(toSave);
          break;
        } catch (err) {
          toSave = toSave.slice(0, Math.ceil(toSave.length / 2));
          if (toSave.length <= 50) {
            try { shraniNalogeVLokalno(toSave); setVsiNalogi(toSave); } catch {}
            break;
          }
        }
      }
      // Nadgradi offset le, če smo uporabljali offset način in kaj dodali
      try {
        if (usedMode === 'offset' && Array.isArray(rows) && rows.length > 0) {
          const nextOffset = importOffset + rows.length;
          localStorage.setItem('sqlImportOffset', String(nextOffset));
        }
      } catch {}
      console.log('[SQL TEST import] mode=', usedMode, 'added=', addedCount, 'total=', (toSave || []).length, usedMode === 'cursor' ? { before: beforeCursor } : {});
      if (addedCount === 0) {
        alert('Ni več starejših nalogov za uvoz.');
      }
    } catch (e) {
      alert('Napaka pri uvozu iz SQL DelovniNalog_TEST');
      console.error(e);
    }
  };

  return (
    <div className="h-screen bg-gray-100 flex flex-col overflow-hidden">
      {/* Sticky header: zavihki + gumbi */}
      <div className="sticky top-0 z-50 bg-white border-b shadow-sm">
        <div className="flex flex-col">
          {/* Zavihki */}
          <div className="flex" ref={tabsBarRef}>
            <button
              ref={delovniNalogTabRef}
              onClick={() => setAktivniZavihek('delovniNalog')}
              tabIndex={0}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                aktivniZavihek === 'delovniNalog'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              📋 Delovni nalog
            </button>
            <button
              ref={prioritetniNalogiTabRef}
              onClick={() => setAktivniZavihek('prioritetniNalogi')}
              tabIndex={0}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                aktivniZavihek === 'prioritetniNalogi'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              ⏰ Seznam prioritetnih nalogov
            </button>
            <button
              ref={kapaciteteTabRef}
              onClick={() => setAktivniZavihek('kapacitete')}
              tabIndex={0}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                aktivniZavihek === 'kapacitete'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              🤖 AI in kooperani
            </button>
            <button
              ref={koledarTabRef}
              onClick={() => setAktivniZavihek('koledar')}
              tabIndex={0}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                aktivniZavihek === 'koledar'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              📅 Koledar
            </button>
            <button
              ref={izsekovalnaOrodjaTabRef}
              onClick={() => setAktivniZavihek('izsekovalnaOrodja')}
              tabIndex={0}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                aktivniZavihek === 'izsekovalnaOrodja'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              ✂️ Izsekovalna orodja
            </button>
            <button
              onClick={() => {
                const now = Date.now();
                const leftAt = analizaLeftAtRef.current || 0;
                const expired = leftAt && (now - leftAt >= ANALIZA_LEAVE_GRACE_MS);
                if (analizaUnlocked && !expired) {
                  // vstop znotraj 2 min resetira timer
                  analizaLeftAtRef.current = 0;
                  if (analizaLeaveTimeoutRef.current != null) {
                    window.clearTimeout(analizaLeaveTimeoutRef.current);
                    analizaLeaveTimeoutRef.current = null;
                  }
                  analizaLastActivityRef.current = now;
                  setAktivniZavihek('analiza');
                } else {
                  lockAnaliza({ openPrompt: true });
                }
              }}
              tabIndex={-1}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                aktivniZavihek === 'analiza'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              📈 Analiza
            </button>
          </div>
          {/* Gumbi za delovni nalog */}
          {aktivniZavihek === 'delovniNalog' && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-t bg-white">
              <button
                type="button"
                onClick={handleShraniNalogAnim}
                className="px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 font-medium text-sm"
              >
                💾 Shrani
              </button>
              <button
                type="button"
                onClick={handleNoviNalogWrapper}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm"
              >
                ➕ Novi nalog
              </button>
              <div className="relative inline-block text-left" ref={izvozRef}>
                <button
                  type="button"
                  onClick={() => setIzvozOpen(v => !v)}
                  className="px-3 py-1.5 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 font-medium text-sm"
                >
                  ⤓ Izvoz podatkov
                </button>
                {izvozOpen && (
                  <div className="absolute right-0 z-10 mt-1 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-none">
                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          const dataStr = JSON.stringify(nalogPodatki, null, 2);
                          const dataBlob = new Blob([dataStr], { type: 'application/json' });
                          const url = URL.createObjectURL(dataBlob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = `nalog-${stevilkaNaloga}.json`;
                          link.click();
                          URL.revokeObjectURL(url);
                          setIzvozOpen(false);
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        📄 Prenesi JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          exportExcelCurrentNalog();
                          setIzvozOpen(false);
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        📊 Izvoz excel trenut. nalog
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIzvozOpen(false);
                          setBulkError('');
                          setBulkTab('kupec');
                          setShowBulkExport(true);
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        🧾 Zbirni izvoz podatkov
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={(zakljucen || dobavljeno) ? (zakljucekEmailPoslan || !nalogPodatki.kupec?.email) : (emailPoslan || !nalogPodatki.kupec?.email)}
                onClick={() => handlePosljiEmail((zakljucen || dobavljeno) ? 'zakljucek' : 'odprtje')}
                className="px-3 py-1.5 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 font-medium text-sm disabled:bg-gray-300"
              >
                📧 Pošlji email
              </button>
              <div className="relative inline-flex items-stretch" ref={dobavnicaMenuRef}>
                <button
                  type="button"
                  onClick={() => openDobavnica({ hidePrices: false, alwaysBoth: false })}
                  className="px-3 py-1.5 bg-purple-600 text-white rounded-l-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium text-sm"
                >
                  📄 Dobavnica
                </button>
                <button
                  type="button"
                  aria-label="Dobavnica meni"
                  onClick={() => setDobavnicaMenuOpen(v => !v)}
                  className="px-2 py-1.5 bg-purple-600 text-white rounded-r-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium text-sm border-l border-purple-500"
                >
                  ▾
                </button>
                {dobavnicaMenuOpen && (
                  <div className="absolute left-0 top-full mt-1 z-20 w-56 rounded-md bg-white shadow-lg ring-1 ring-black/5">
                    <button
                      type="button"
                      className="block w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-100"
                      onClick={() => {
                        setDobavnicaMenuOpen(false);
                        openDobavnica({ hidePrices: true, alwaysBoth: true });
                      }}
                    >
                      Dobavnica za kooperanta
                    </button>
                    <button
                      type="button"
                      className="block w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-100"
                      onClick={() => {
                        setDobavnicaMenuOpen(false);
                        openDobavnica({ hidePrices: true, alwaysBoth: true, onlyPart: 1 });
                      }}
                    >
                      Dobavnica za kooperanta tisk 1
                    </button>
                    <button
                      type="button"
                      className="block w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-100"
                      onClick={() => {
                        setDobavnicaMenuOpen(false);
                        openDobavnica({ hidePrices: true, alwaysBoth: true, onlyPart: 2 });
                      }}
                    >
                      Dobavnica za kooperanta tisk 2
                    </button>
                  </div>
                )}
              </div>
              <span className="ml-4 font-bold text-lg">Delovni nalog št.: {stevilkaNaloga}</span>
              <span className="ml-2 text-sm text-gray-600">Datum odprtja: {nalogPodatki?.datumNarocila ? (() => {
                const date = new Date(nalogPodatki.datumNarocila);
                const day = date.getDate();
                const month = date.getMonth() + 1;
                const year = date.getFullYear();
                const hours = date.getHours().toString().padStart(2, '0');
                const minutes = date.getMinutes().toString().padStart(2, '0');
                return `${day}.${month}.${year} ${hours}:${minutes}`;
              })() : '-'}</span>
              <span className="ml-2 text-sm text-gray-600">Rok izdelave: 
                {(() => {
                  const ymd = (nalogPodatki.rokIzdelave || '').toString();
                  const hasRok = !!ymd;
                  const ddmmyyyy = (() => {
                    const parts = ymd.split('-');
                    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
                      const [y, m, d] = parts;
                      return `${Number(d)}.${Number(m)}.${y}`;
                    }
                    return '';
                  })();
                  return (
                    <span className="inline-flex items-center">
                      {/* Prikazno polje (dd.mm.yyyy) */}
                      <input
                        type="text"
                        readOnly
                        value={ddmmyyyy}
                        placeholder="dd.mm.llll"
                        onClick={(e) => {
                          // Odpri native date picker preko skritega inputa (Chrome/Edge)
                          const wrapper = (e.currentTarget as HTMLInputElement).parentElement;
                          const hidden = wrapper?.querySelector('input[data-rok-hidden=\"1\"]') as any;
                          if (hidden?.showPicker) hidden.showPicker();
                          else hidden?.click?.();
                        }}
                        className={`border rounded px-2 py-1 text-sm w-[108px] cursor-pointer bg-white ${hasRok ? 'border-blue-500 bg-blue-50 font-bold' : ''}`}
                        disabled={zaklenjeno}
                      />
                      {/* Skrit date input, ki hrani dejansko vrednost YYYY-MM-DD */}
                      <input
                        data-rok-hidden="1"
                        type="date"
                        value={ymd}
                        onChange={e => {
                          handleRokIzdelaveChange(e.target.value);
                          setNalogShranjeno(false);
                        }}
                        className="absolute opacity-0 pointer-events-none w-0 h-0"
                        tabIndex={-1}
                        disabled={zaklenjeno}
                      />
                    </span>
                  );
                })()}
                <select 
                  value={nalogPodatki.rokIzdelave ? (nalogPodatki.rokIzdelaveUra || '15:00') : ''} 
                  onChange={e => {
                    const v = e.target.value;
                    // Če uporabnik nastavi samo uro brez datuma, datum privzeto danes
                    if (v && !nalogPodatki.rokIzdelave) {
                      const d = new Date();
                      const y = d.getFullYear();
                      const m = String(d.getMonth() + 1).padStart(2, '0');
                      const day = String(d.getDate()).padStart(2, '0');
                      handlePodatkiChange('rokIzdelave', `${y}-${m}-${day}`);
                    }
                    handlePodatkiChange('rokIzdelaveUra', v);
                    setNalogShranjeno(false);
                  }} 
                  className={`border rounded px-2 py-1 text-sm ml-1 ${nalogPodatki.rokIzdelave ? 'border-blue-500 bg-blue-50 font-bold' : ''}`} 
                  disabled={zaklenjeno}
                >
                  <option value="">—</option>
                  {Array.from({length: 8*4}, (_, i) => {
                    const h = String(7 + Math.floor(i/4)).padStart(2, '0');
                    const m = String((i%4)*15).padStart(2, '0');
                    return <option key={h+':'+m} value={h+':'+m}>{h}:{m}</option>;
                  })}
                </select>
              </span>
              <div className="ml-auto flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <div className="flex flex-col">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={zakljucen}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        handleZakljucenChange(checked);
                      }}
                      className="rounded"
                    />
                    Tisk zaključen
                  </label>
                  {(zakljucen && nalogPodatki.tiskZakljucenAt) && (
                    <div className="text-[11px] text-gray-500 ml-6">
                      {new Date(nalogPodatki.tiskZakljucenAt).toLocaleDateString('sl-SI')}
                    </div>
                  )}
                  </div>
                  <div className="relative inline-flex" ref={zakljuciMenuRef}>
                    <button
                      type="button"
                      disabled={zaklenjeno}
                      onClick={() => setZakljuciMenuOpen(v => !v)}
                      className="border rounded px-2 py-1 text-xs bg-white hover:bg-gray-50 disabled:bg-gray-100"
                      title="Ločeno zaključi tisk 1 ali tisk 2"
                      aria-label="Zaključi tisk meni"
                    >
                      ▾
                    </button>
                    {zakljuciMenuOpen && (
                      <div className="absolute left-0 top-full mt-1 z-20 w-44 rounded-md bg-white shadow-lg ring-1 ring-black/5">
                        <button
                          type="button"
                          disabled={tiskZakljucen1}
                          className="block w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-white"
                          onClick={() => {
                            setZakljuciMenuOpen(false);
                            handleZakljuciTiskDel(1);
                          }}
                        >
                          Zaključi tisk 1
                        </button>
                        <button
                          type="button"
                          disabled={tiskZakljucen2}
                          className="block w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-white"
                          onClick={() => {
                            setZakljuciMenuOpen(false);
                            handleZakljuciTiskDel(2);
                          }}
                        >
                          Zaključi tisk 2
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={dobavljeno}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        handleDobavljenoChangeChecked(checked);
                      }}
                      className="rounded"
                    />
                    Dobavljeno
                  </label>
                  {(dobavljeno && nalogPodatki.dobavljenoAt) && (
                    <div className="text-[11px] text-gray-500 ml-6">
                      {new Date(nalogPodatki.dobavljenoAt).toLocaleDateString('sl-SI')}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setGesloIzbris('');
                    setGesloIzbrisNapaka('');
                    setPrikaziIzbris(true);
                  }}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-sm"
                >
                  🗑️ Izbriši nalog
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Vsebina zavihkov */}
      {aktivniZavihek === 'delovniNalog' && (
        <div className="flex flex-row flex-1 min-h-0">
          {/* Leva stran: seznam nalogov */}
          <div
            className="border-r bg-white flex-shrink-0"
            style={{ width: '30%', minWidth: 420, maxWidth: 580, height: '100%', overflowX: 'hidden', overflowY: 'hidden' }}
          >
            <SeznamNaloga
              nalogi={vsiNalogi}
              onIzberi={handleIzberiNalogWrapper}
              onKopiraj={handleKopirajNalog}
              getPrioritetaBarva={getPrioritetaBarva}
              closedTasks={closedTasks}
              prioritetaMapa={prioritetaMapa}
              scrollToStevilkaNaloga={scrollToSeznamNalog}
              initialListScrollTop={Number(scrollPosRef.current['delovni_list'] || 0)}
              onListScrollTopChange={(top) => { scrollPosRef.current['delovni_list'] = Number(top || 0); }}
              onPrioritetaClick={(id) => {
                const nalogId = Number(id || 0);
                if (!nalogId) return;
                setAktivniZavihek('prioritetniNalogi');
                setScrollToPrioritetniNalog({ id: nalogId, ts: Date.now() });
              }}
              initialYear={currentYearFilter ?? new Date().getFullYear()}
              onYearFilterChange={onYearFilterChange}
                selectedStevilkaNaloga={Number(stevilkaNaloga) || undefined}
            />
          </div>
          {/* Desna stran: obrazec */}
          <div
            ref={delovniFormScrollRef}
            className="flex-1 min-h-0 overflow-y-auto text-sm"
            onScroll={(e) => { scrollPosRef.current['delovniNalog'] = (e.currentTarget as HTMLDivElement).scrollTop; }}
          >
            {/* Glavni obrazec */}
            <div ref={obrazecRef} className={`p-2 space-y-2 ${dobavljeno ? 'bg-[#e6f9f3]' : zakljucen ? 'bg-red-50' : ''}`}>
              {/* Glavne sekcije */}
              <div className="space-y-2">
                <KupecSelect
                  disabled={zaklenjeno}
                  zakljucen={zakljucen}
                  dobavljeno={dobavljeno}
                  nalogKey={stevilkaNaloga}
                  kupecPodatki={nalogPodatki.kupec}
                  onKupecChange={(podatki) => handlePodatkiChange('kupec', podatki)}
                  kontaktnaOseba={(nalogPodatki as any)?.kontakt?.kontaktnaOseba || ''}
                  onKontaktnaOsebaChange={(v) => handlePodatkiChange('kontakt', { ...(nalogPodatki as any)?.kontakt, kontaktnaOseba: v })}
                  emailError={emailNapaka || null}
                  emailOdprtjePoslan={!!emailPoslan}
                  emailZakljucekPoslan={!!zakljucekEmailPoslan}
                />
                
                <TiskSekcija
                  key={`${stevilkaNaloga}-tisk`}
                  disabled={zaklenjeno}
                  zakljucen={zakljucen}
                  zakljucen1={tiskZakljucen1}
                  zakljucen2={tiskZakljucen2}
                  dobavljeno={dobavljeno}
                  tiskPodatki={nalogPodatki.tisk}
                  onTiskChange={handleTiskChange}
                />
                
                <DodelavaSekcija
                  key={`${stevilkaNaloga}-dodelava`}
                  disabled={zaklenjeno}
                  zakljucen={zakljucen}
                  zakljucen1={tiskZakljucen1}
                  zakljucen2={tiskZakljucen2}
                  dobavljeno={dobavljeno}
                  dodelavaPodatki={nalogPodatki.dodelava1 || nalogPodatki.dodelava2 ? { dodelava1: nalogPodatki.dodelava1 || {}, dodelava2: nalogPodatki.dodelava2 || {} } : undefined}
                  onDodelavaChange={handleDodelavaChange}
                  tiskPodatki={nalogPodatki.tisk}
                />
                
                <div ref={stroskiRef}>
                  <StroskiSekcija
                  key={`${stevilkaNaloga}-stroski`}
                  disabled={zaklenjeno}
                  zakljucen={zakljucen}
                  zakljucen1={tiskZakljucen1}
                  zakljucen2={tiskZakljucen2}
                  dobavljeno={dobavljeno}
                  tiskPodatki={nalogPodatki.tisk}
                  stroskiPodatki={nalogPodatki.stroski1 || nalogPodatki.stroski2 ? { stroski1: nalogPodatki.stroski1 || {}, stroski2: nalogPodatki.stroski2 || {} } : undefined}
                  onStroskiChange={handleStroskiChange}
                  reklamacijaPodatki={nalogPodatki.reklamacija}
                  onReklamacijaChange={(rekl) => handlePodatkiChange('reklamacija', rekl)}
                  stevilkaNaloga={stevilkaNaloga}
                  skupnaCenaIzbrana={!!(nalogPodatki as any)?.skupnaCena}
                  onSkupnaCenaChange={(v) => handlePodatkiChange('skupnaCena', v)}
                />
                </div>
                
                <PosiljanjeSekcija
                  disabled={zaklenjeno}
                  zakljucen={zakljucen}
                  dobavljeno={dobavljeno}
                  kupecPodatki={nalogPodatki.kupec}
                  posiljanjePodatki={nalogPodatki.posiljanje}
                  onPosiljanjeChange={(podatki) => handlePodatkiChange('posiljanje', podatki)}
                />
                
                <KomentarPolje
                  disabled={zaklenjeno}
                  zakljucen={zakljucen}
                  dobavljeno={dobavljeno}
                  komentarPodatki={nalogPodatki.komentar}
                  onKomentarChange={(podatki) => handlePodatkiChange('komentar', podatki)}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {aktivniZavihek === 'prioritetniNalogi' && (
        <div
          ref={prioritetniScrollRef}
          className="flex-1 min-h-0 overflow-y-auto"
          onScroll={(e) => { scrollPosRef.current['prioritetniNalogi'] = (e.currentTarget as HTMLDivElement).scrollTop; }}
        >
          <PrioritetniNalogi 
            prioritetniNalogi={prioritetniNalogi} 
            onIzberi={handleIzberiNalogFromPrioritetni}
            onClosedTasksChange={handleSetClosedTasks}
            closedTasks={closedTasks}
            scrollToStevilkaNaloga={scrollToPrioritetniNalog}
          />
        </div>
      )}

      {aktivniZavihek === 'kapacitete' && (
        <div
          ref={kapaciteteScrollRef}
          className="flex-1 min-h-0 overflow-y-auto p-8"
          onScroll={(e) => { scrollPosRef.current['kapacitete'] = (e.currentTarget as HTMLDivElement).scrollTop; }}
        >
          <div className="w-full">
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-2xl font-bold mb-1">Uvoz iz Cenikov</h2>
                  <p className="text-gray-600 text-sm">Prejeti JSON dokumenti za pripravo novega delovnega naloga (izberi največ 2).</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={cenikImportBusy}
                    onClick={loadCenikPendingImports}
                    className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm disabled:opacity-50"
                  >
                    Osveži
                  </button>
                  <button
                    type="button"
                    disabled={cenikImportBusy || cenikSelectedIds.length === 0}
                    onClick={handleConfirmSelectedCenikImports}
                    className="px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700 text-sm disabled:opacity-50"
                  >
                    Potrdi in ustvari nalog ({cenikSelectedIds.length})
                  </button>
                </div>
              </div>

              {cenikImportError && (
                <div className="mb-3 rounded border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">
                  {cenikImportError}
                </div>
              )}

              {cenikPendingImports.length === 0 ? (
                <div className="text-sm text-gray-500">Trenutno ni čakajočih uvozov iz Cenikov.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-2 pr-3">Izberi</th>
                        <th className="py-2 pr-3">Tiskovina</th>
                        <th className="py-2 pr-3">Rok izdelave</th>
                        <th className="py-2 pr-3">Količina</th>
                        <th className="py-2 pr-3">Prejeto</th>
                        <th className="py-2 pr-3">Akcije</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cenikPendingImports.map((imp) => {
                        const selected = cenikSelectedIds.includes(imp.importId);
                        const maxed = cenikSelectedIds.length >= 2 && !selected;
                        return (
                          <tr key={imp.importId} className="border-b last:border-b-0">
                            <td className="py-2 pr-3 align-top">
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={cenikImportBusy || maxed}
                                onChange={() => toggleCenikSelection(imp.importId)}
                              />
                            </td>
                            <td className="py-2 pr-3 align-top font-medium">{imp.predmet || '-'}</td>
                            <td className="py-2 pr-3 align-top">{imp.rokIzdelave ? `${imp.rokIzdelave}${imp.rokIzdelaveUra ? ` ${imp.rokIzdelaveUra}` : ''}` : '-'}</td>
                            <td className="py-2 pr-3 align-top">{imp.kolicina || '-'}</td>
                            <td className="py-2 pr-3 align-top">{new Date(imp.receivedAt).toLocaleString('sl-SI')}</td>
                            <td className="py-2 pr-3 align-top">
                              <button
                                type="button"
                                disabled={cenikImportBusy}
                                onClick={() => handleRejectCenikImport(imp.importId)}
                                className="px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                              >
                                Zavrni
                              </button>
                              {Array.isArray(imp.warnings) && imp.warnings.length > 0 && (
                                <div className="text-xs text-amber-700 mt-1">
                                  {imp.warnings.join(' | ')}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Levo: AI Email Parser */}
              <div className="min-w-0">
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h2 className="text-2xl font-bold mb-2">Samodejni nalogi AI</h2>
                  <p className="text-gray-600 mb-4">Razbiranje e-mailov</p>
                <h3 className="text-xl font-semibold mb-4">AI Razbiranje e-mailov</h3>
                <p className="text-gray-600 mb-4">
                  Prilepite celoten e-mail pogovor. AI bo poskusil razbrati čim več polj (tudi ločeno za Tisk 1 / Tisk 2) in pripravil predogled.
                </p>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Besedilo e-maila:
                    </label>
                    <textarea
                      value={emailBesedilo}
                      onChange={(e) => setEmailBesedilo(e.target.value)}
                      placeholder="Prilepite besedilo e-maila tukaj..."
                      className="w-full h-32 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  
                  <div className="flex gap-4">
                    <button
                      onClick={handleRazberiEmail}
                      disabled={!emailBesedilo.trim() || aiLoading}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {aiLoading ? 'Razbiranje...' : 'Razberi e-mail'}
                    </button>
                    
                    <button
                      onClick={() => { setEmailBesedilo(''); setAiRezultat(null); setAiPreviewNalog(null); setAiError(''); }}
                      className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                    >
                      Izbriši E-mail
                    </button>
                  </div>
                  
                  {aiError && (
                    <div className="text-red-600 bg-red-50 p-3 rounded-md">
                      Napaka: {aiError}
                    </div>
                  )}
                  
                  {aiRezultat && (
                    <div className="bg-green-50 p-4 rounded-md space-y-3">
                      <h4 className="font-semibold text-green-800">Razbrani podatki</h4>
                      <pre className="text-sm text-green-700 whitespace-pre-wrap">
                        {(() => {
                          const full = aiPreviewNalog || aiRezultat;
                          const stripEmpty = (o: any): any => {
                            if (o === null || o === undefined) return undefined;
                            if (typeof o === 'string' && o.trim() === '') return undefined;
                            if (Array.isArray(o)) {
                              const a = o.map(stripEmpty).filter((v) => v !== undefined);
                              return a.length ? a : undefined;
                            }
                            if (typeof o === 'object') {
                              const out: Record<string, any> = {};
                              for (const [k, v] of Object.entries(o)) {
                                const v2 = stripEmpty(v);
                                if (v2 !== undefined) out[k] = v2;
                              }
                              return Object.keys(out).length ? out : undefined;
                            }
                            return o;
                          };
                          const compact = stripEmpty(full);
                          return JSON.stringify(compact ?? {}, null, 2);
                        })()}
                      </pre>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={handleUporabiAIRezultat}
                          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                        >
                          Ustvari nov delovni nalog
                        </button>
                      </div>
                      {Array.isArray(aiRezultat?.produkti) && aiRezultat.produkti.length > 1 && (
                        <div className="mt-3 border-t pt-3">
                          <div className="font-semibold mb-2">Zaznanih je več produktov. Ustvarite jih enega po enega:</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {aiRezultat.produkti.map((p: any, idx: number) => (
                              <div key={idx} className="border rounded p-3 bg-white">
                                <div className="text-sm">
                                  <div><span className="font-medium">Izdelek:</span> {p.izdelek || '-'}</div>
                                  <div><span className="font-medium">Količina:</span> {(p.kolicina != null ? p.kolicina : '').toString() || '-'}</div>
                                  <div><span className="font-medium">Format:</span> {p.format || '-'}</div>
                                  <div><span className="font-medium">Papir:</span> {p.papir || '-'}</div>
                                  <div><span className="font-medium">Barvnost:</span> {p.barvnost || '-'}</div>
                                  <div><span className="font-medium">Dodelava:</span> {p.dodelava || '-'}</div>
                                  <div><span className="font-medium">Rok:</span> {p.datumDobave || '-'}</div>
                                </div>
                                <button
                                  onClick={() => {
                                    const prevRez = aiRezultat;
                                    const uporabiParsedProdukt = (produkt: any) => {
                                      const novaStevilka = generirajNaslednjoStevilko(vsiNalogi);
                                      const dostava = (produkt.dostava || produkt.dostavaNačin || '').toString().toLowerCase();
                                      const posiljanjeParsed: any = {};
                                      if (dostava.includes('pošti') || dostava.includes('pošta')) posiljanjeParsed.posiljanjePoPosti = true;
                                      if (dostava.includes('osebni') || dostava.includes('prevzem')) posiljanjeParsed.osebnoPrevzem = true;
                                      if (dostava.includes('dostava') || dostava.includes('lokacijo')) posiljanjeParsed.dostavaNaLokacijo = true;
                                      const stroski1: any = {};
                                      if (produkt.cena) {
                                        stroski1.cenaBrezDDV = String(produkt.cena);
                                      }
                                      const noviNalog: any = {
                                        stevilkaNaloga: novaStevilka,
                                        datumNarocila: new Date().toISOString(),
                                        kupec: {
                                          ime: produkt?.stranka?.ime || prevRez?.stranka?.ime || '',
                                          kraj: produkt?.stranka?.kraj || prevRez?.stranka?.kraj || '',
                                          email: produkt?.kontakt?.email || prevRez?.kontakt?.email || '',
                                          telefon: produkt?.kontakt?.telefon || prevRez?.kontakt?.telefon || '',
                                        },
                                        tisk: {
                                          tisk1: {
                                            predmet: produkt?.izdelek || '',
                                            kolicina: (produkt?.kolicina != null ? produkt.kolicina : '')?.toString() || '',
                                            format: produkt?.format || '',
                                            papir: produkt?.papir || '',
                                            barve: produkt?.barvnost || '',
                                          },
                                          tisk2: {}
                                        },
                                        dodelava1: produkt?.dodelava ? { vrstaDodelave: produkt.dodelava, opomba: '' } : {},
                                        dodelava2: {},
                                        stroski1,
                                        stroski2: {},
                                        posiljanje: posiljanjeParsed,
                                        komentar: (produkt?.narocilnica || prevRez?.narocilnica) ? `Naročilnica: ${produkt?.narocilnica || prevRez?.narocilnica}` : '',
                                        rokIzdelave: produkt?.datumDobave || prevRez?.datumDobave || '',
                                        rokIzdelaveUra: '15:00',
                                        emailPoslan: false,
                                        zakljucekEmailPoslan: false,
                                      };
                                      setNalogPodatki(noviNalog);
                                      setStevilkaNaloga(novaStevilka);
                                      setKey(prev => prev + 1);
                                      setNalogShranjeno(false);
                                      setAktivniZavihek('delovniNalog');
                                    };
                                    uporabiParsedProdukt(p);
                                  }}
                                  className="mt-2 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                                >
                                  Vnesi v novi nalog
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                </div>
              </div>

              {/* Sredina: Dostava tiskovin */}
              <div className="min-w-0">
                <DostavaTiskovin
                  vsiNalogi={vsiNalogi}
                  onOpenNalog={(st) => {
                    const n = (vsiNalogi || []).find((x: any) => String(x?.stevilkaNaloga) === String(st));
                    if (n) {
                      handleIzberiNalogWrapper(n);
                    }
                  }}
                />
              </div>
              {/* Desno: Pregled kooperantov */}
              <div className="min-w-0">
                <KooperantiPregled
                  vsiNalogi={vsiNalogi}
                  onOpenNalog={(st) => {
                    const n = (vsiNalogi || []).find((x: any) => String(x?.stevilkaNaloga) === String(st));
                    if (n) {
                      handleIzberiNalogWrapper(n);
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {aktivniZavihek === 'koledar' && (
        <div
          ref={koledarScrollRef}
          className="flex-1 min-h-0 overflow-y-auto"
          onScroll={(e) => { scrollPosRef.current['koledar'] = (e.currentTarget as HTMLDivElement).scrollTop; }}
        >
          <Koledar nalogi={vsiNalogiIzracunani} closedTasks={closedTasks} />
        </div>
      )}

      {aktivniZavihek === 'izsekovalnaOrodja' && (
        <div
          ref={izsekovalnaOrodjaScrollRef}
          className="flex-1 min-h-0 overflow-y-auto"
          onScroll={(e) => { scrollPosRef.current['izsekovalnaOrodja'] = (e.currentTarget as HTMLDivElement).scrollTop; }}
        >
          <IzsekovalnaOrodja />
        </div>
      )}

      {aktivniZavihek === 'analiza' && (
        <div
          ref={analizaScrollRef}
          className="flex-1 min-h-0 overflow-y-auto"
          onScroll={(e) => { scrollPosRef.current['analiza'] = (e.currentTarget as HTMLDivElement).scrollTop; }}
        >
          <Analiza nalogi={vsiNalogi} />
        </div>
      )}

      {/* Modali ostanejo zunaj zavihkov */}
      {/* Predogled emaila */}
      {prikaziPredogledEmaila && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded shadow-lg w-[92vw] max-w-6xl h-[85vh] overflow-auto" style={{ resize: 'both' as any }}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-lg font-bold">
                Email ({emailVrsta === 'odprtje' ? 'Obvestilo o odprtju' : 'Zaključen nalog'}) — urejanje pred pošiljanjem
              </h2>
              <button
                onClick={() => setPrikaziPredogledEmaila(false)}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
              >
                Zapri
              </button>
            </div>

            <div className="mb-2 text-sm text-gray-600">
              Uredi email <b>direktno v prikazu</b> (klikni v tekst in popravi). Če želiš, lahko spodaj odpreš napredni način (HTML).
            </div>

            <div
              ref={emailEditorRef}
              className="border rounded bg-white p-3 overflow-auto h-[62vh]"
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => {
                // Ne renderaj nazaj v element med tipkanjem (to premika kurzor).
                const html = (e.currentTarget as HTMLDivElement).innerHTML;
                setEmailHtml(html);
              }}
            />

            <div className="flex items-center justify-between mt-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={bulkAdvancedEmail}
                  onChange={(e) => setBulkAdvancedEmail(e.target.checked)}
                />
                Napredno (pokaži HTML)
              </label>
              <button
                onClick={() => {
                  const next = generirajEmailHtml(emailVrsta, nalogPodatki);
                  setEmailHtml(next);
                  // takoj sync v editor
                  const el = emailEditorRef.current;
                  if (el) el.innerHTML = next || '';
                  emailEditorSyncedRef.current = true;
                }}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm"
                title="Ponastavi na samodejno generiran tekst"
              >
                Ponastavi
              </button>
            </div>

            {bulkAdvancedEmail && (
              <textarea
                value={emailHtml}
                onChange={(e) => setEmailHtml(e.target.value)}
                className="mt-2 w-full border rounded p-2 font-mono text-xs"
                style={{ minHeight: 180 }}
              />
            )}

            <div className="flex gap-2 justify-end mt-3">
              <button
                onClick={() => {
                  setPrikaziPredogledEmaila(false);
                  const after = afterEmailCloseActionRef.current;
                  afterEmailCloseActionRef.current = null;
                  if (after) setTimeout(() => after(), 0);
                }}
                className="px-3 py-1 bg-gray-300 rounded"
              >
                Prekliči
              </button>
              <button
                onClick={potrdiPosljiEmail}
                className="px-3 py-1 bg-blue-600 text-white rounded"
              >
                Pošlji
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: zbirni izvoz */}
      {showBulkExport && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded shadow-lg w-[92vw] max-w-5xl h-[80vh] overflow-auto" style={{ resize: 'both' as any }}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-lg font-bold">Zbirni izvoz podatkov</h2>
              <button
                onClick={() => setShowBulkExport(false)}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
              >
                Zapri
              </button>
            </div>

            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setBulkTab('kupec')}
                className={`px-3 py-1.5 rounded border ${bulkTab === 'kupec' ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white'}`}
              >
                Izvoz po kupcu
              </button>
              <button
                type="button"
                onClick={() => setBulkTab('material')}
                className={`px-3 py-1.5 rounded border ${bulkTab === 'material' ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white'}`}
              >
                Izvoz materiala
              </button>
              <button
                type="button"
                onClick={() => setBulkTab('etikete')}
                className={`px-3 py-1.5 rounded border ${bulkTab === 'etikete' ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white'}`}
              >
                Izvoz etikete
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <label className="text-sm">
                <div className="font-semibold mb-1">Obdobje od</div>
                <div className="inline-flex items-center gap-2 w-full">
                  <input
                    type="text"
                    readOnly
                    value={bulkFrom ? new Date(`${bulkFrom}T00:00:00`).toLocaleDateString('sl-SI') : ''}
                    placeholder="dd.mm.llll"
                    onClick={(e) => {
                      const wrapper = (e.currentTarget as HTMLInputElement).parentElement;
                      const hidden = wrapper?.querySelector('input[data-bulk-from=\"1\"]') as any;
                      if (hidden?.showPicker) hidden.showPicker();
                      else hidden?.click?.();
                    }}
                    className="border rounded px-2 py-1 w-full cursor-pointer bg-white"
                  />
                  <input
                    data-bulk-from="1"
                    type="date"
                    value={bulkFrom}
                    onChange={(e) => setBulkFrom(e.target.value)}
                    className="sr-only"
                  />
                </div>
              </label>
              <label className="text-sm">
                <div className="font-semibold mb-1">Obdobje do</div>
                <div className="inline-flex items-center gap-2 w-full">
                  <input
                    type="text"
                    readOnly
                    value={bulkTo ? new Date(`${bulkTo}T00:00:00`).toLocaleDateString('sl-SI') : ''}
                    placeholder="dd.mm.llll"
                    onClick={(e) => {
                      const wrapper = (e.currentTarget as HTMLInputElement).parentElement;
                      const hidden = wrapper?.querySelector('input[data-bulk-to=\"1\"]') as any;
                      if (hidden?.showPicker) hidden.showPicker();
                      else hidden?.click?.();
                    }}
                    className="border rounded px-2 py-1 w-full cursor-pointer bg-white"
                  />
                  <input
                    data-bulk-to="1"
                    type="date"
                    value={bulkTo}
                    onChange={(e) => setBulkTo(e.target.value)}
                    className="sr-only"
                  />
                </div>
              </label>
            </div>

            {bulkTab === 'kupec' && (
              <div className="mb-3">
                <div className="text-sm font-semibold mb-1">Stranka (iz SQL)</div>
                <input
                  type="text"
                  value={bulkKupecSearch}
                  onChange={(e) => setBulkKupecSearch(e.target.value)}
                  placeholder="Išči po nazivu…"
                  className="border rounded px-2 py-1 w-full"
                />
                <div className="mt-2 border rounded max-h-56 overflow-auto">
                  {(bulkKupci || [])
                    .filter((k: any) => String(k?.Naziv || '').toLowerCase().includes(bulkKupecSearch.toLowerCase()))
                    .slice(0, 50)
                    .map((k: any) => (
                      <button
                        key={String(k?.KupecID ?? k?.Naziv)}
                        type="button"
                        onClick={() => setBulkKupec(k)}
                        className={`block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${bulkKupec?.KupecID === k?.KupecID ? 'bg-blue-50' : ''}`}
                      >
                        {k?.Naziv}
                      </button>
                    ))}
                </div>
                {bulkKupec?.Naziv && (
                  <div className="text-sm text-gray-600 mt-1">
                    Izbrano: <span className="font-semibold">{bulkKupec.Naziv}</span>
                  </div>
                )}
                <div className="text-xs text-gray-500 mt-1">
                  Filter: izvozi naloge, ki imajo <b>Dobavljeno</b> in datum dobavljeno znotraj obdobja.
                </div>
              </div>
            )}

            {bulkTab === 'material' && (
              <div className="mb-3">
                <div className="text-sm text-gray-700">
                  Izvoz vrne <b>samo</b> tabelo: <b>Material</b> + <b>Št. pol</b> (za vse materiale iz dropdown menija).
                </div>
                <label className="flex items-center gap-2 text-sm mt-2">
                  <input type="checkbox" checked={bulkOnlyDelivered} onChange={(e) => setBulkOnlyDelivered(e.target.checked)} />
                  Samo dobavljeno (datum dobavljeno je v izbranem obdobju)
                </label>
              </div>
            )}

            {bulkTab === 'etikete' && (
              <div className="mb-3">
                <div className="text-sm font-semibold mb-1">Stranka (iz SQL)</div>
                <input
                  type="text"
                  value={bulkKupecSearch}
                  onChange={(e) => setBulkKupecSearch(e.target.value)}
                  placeholder="Išči po nazivu…"
                  className="border rounded px-2 py-1 w-full"
                />
                <div className="mt-2 border rounded max-h-56 overflow-auto">
                  {(bulkKupci || [])
                    .filter((k: any) => String(k?.Naziv || '').toLowerCase().includes(bulkKupecSearch.toLowerCase()))
                    .slice(0, 50)
                    .map((k: any) => (
                      <button
                        key={String(k?.KupecID ?? k?.Naziv)}
                        type="button"
                        onClick={() => setBulkKupec(k)}
                        className={`block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${bulkKupec?.KupecID === k?.KupecID ? 'bg-blue-50' : ''}`}
                      >
                        {k?.Naziv}
                      </button>
                    ))}
                </div>
                {bulkKupec?.Naziv && (
                  <div className="text-sm text-gray-600 mt-1">
                    Izbrano: <span className="font-semibold">{bulkKupec.Naziv}</span>
                  </div>
                )}
                <div className="text-xs text-gray-500 mt-1">
                  Filter: prikaže <b>samo</b> naloge, ki imajo <b>samo</b> kljukico <b>Tisk zaključen</b> (ne dobavljeno) in imajo <b>datum tisk zaključen</b> znotraj obdobja.
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">Nalogi (etikete)</div>
                    {etiketeBusy && <div className="text-xs text-gray-500">Nalagam…</div>}
                  </div>

                  {etiketeError && (
                    <div className="mt-2 text-sm text-red-600 whitespace-pre-wrap">{etiketeError}</div>
                  )}

                  {!etiketeBusy && !etiketeError && !etiketeItems.length && bulkFrom && bulkTo && bulkKupec?.KupecID && (
                    <div className="mt-2 text-sm text-gray-600">Ni nalogov za izbrane filtre.</div>
                  )}

                  {etiketeItems.length > 0 && (
                    <div className="mt-2 border rounded overflow-auto max-h-72">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-2 py-2 w-10">Izb.</th>
                            <th className="text-left px-2 py-2 w-24">Poz.</th>
                            <th className="text-left px-2 py-2 w-28">Nalog</th>
                            <th className="text-left px-2 py-2">Predmet</th>
                            <th className="text-left px-2 py-2 w-32">Št. kosov</th>
                          </tr>
                        </thead>
                        <tbody>
                          {etiketeItems.slice(0, 200).map((it) => {
                            const k = `${it.id}:${it.part}`;
                            const checked = !!etiketeChecked[k];
                            const pos = Number(etiketePos[k] || 1);
                            return (
                              <tr key={k} className="border-t">
                                <td className="px-2 py-2">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      const next = e.target.checked;
                                      setEtiketeChecked((prev) => ({ ...prev, [k]: next }));
                                      if (next && !etiketePos[k]) {
                                        // če ni nastavljene pozicije, nastavi prvo prosto 1..12
                                        const used = new Set<number>();
                                        Object.keys(etiketePos).forEach((kk) => {
                                          if (etiketeChecked[kk]) {
                                            const p = Number(etiketePos[kk] || 0);
                                            if (p) used.add(p);
                                          }
                                        });
                                        let firstFree = 1;
                                        while (firstFree <= 12 && used.has(firstFree)) firstFree++;
                                        setEtiketePos((prev) => ({ ...prev, [k]: Math.min(firstFree, 12) }));
                                      }
                                    }}
                                  />
                                </td>
                                <td className="px-2 py-2">
                                  <select
                                    className="border rounded px-2 py-1"
                                    value={pos}
                                    onChange={(e) => setEtiketePos((prev) => ({ ...prev, [k]: Number(e.target.value) }))}
                                  >
                                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                                      <option key={n} value={n}>{n}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-2 py-2 font-mono">{it.id}</td>
                                <td className="px-2 py-2">{it.predmet}</td>
                                <td className="px-2 py-2">{it.kosov || ''}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {etiketeItems.length > 0 && (
                    <div className="mt-4">
                      <div className="text-sm font-semibold mb-2">Predogled (1–12)</div>
                      {(() => {
                        const { slots } = buildEtiketeSlots();
                        return (
                          <div className="border rounded p-2 bg-white overflow-auto">
                            <div className="grid grid-cols-2 gap-2" style={{ width: 520 }}>
                              {slots.map((s, idx) => (
                                <div key={idx} className="border border-dashed border-gray-400 p-2" style={{ height: 110 }}>
                                  <div className="text-[10px] text-gray-500 mb-1">Pozicija {idx + 1}</div>
                                  {s ? (
                                    <div className="text-[11px] leading-snug">
                                      <div><b>Naročnik:</b> {bulkKupec?.Naziv}</div>
                                      <div><b>Dobavitelj:</b> Trajanus d.o.o.</div>
                                      <div className="mt-1 font-bold">{s.predmet}</div>
                                      <div className="mt-1"><b>Št. kosov:</b> {s.kosov || ''}</div>
                                    </div>
                                  ) : (
                                    <div className="text-xs text-gray-400">—</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )}

            {bulkError && (
              <div className="mb-3 text-sm text-red-600 whitespace-pre-wrap">{bulkError}</div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowBulkExport(false)}
                className="px-3 py-1.5 bg-gray-200 rounded hover:bg-gray-300"
                disabled={bulkBusy}
              >
                Prekliči
              </button>
              <button
                onClick={() => {
                  if (bulkTab === 'etikete') exportEtikete();
                  else runBulkExport();
                }}
                className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300"
                disabled={bulkBusy || (bulkTab === 'etikete' ? etiketeBusy : false)}
              >
                {bulkTab === 'etikete'
                  ? ((bulkBusy || etiketeBusy) ? 'Izvažam…' : 'Izvozi etikete')
                  : (bulkBusy ? 'Izvažam…' : 'Izvozi v Excel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: koda za analizo */}
      {showAnalizaPrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg max-w-xs w-full">
            <h2 className="text-lg font-bold mb-2">Dostop do analize</h2>
            <input
              ref={analizaInputRef}
              autoFocus
              type="password"
              placeholder="Koda"
              value={analizaCode}
              onChange={(e) => {
                setAnalizaCode(e.target.value);
                if (analizaNapaka) setAnalizaNapaka('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (analizaCode === '407940') {
                    setAnalizaUnlocked(true);
                    setShowAnalizaPrompt(false);
                    setAnalizaCode('');
                    setAnalizaNapaka('');
                    setAktivniZavihek('analiza');
                  } else {
                    setAnalizaNapaka('Napačna koda.');
                  }
                }
              }}
              className="border rounded px-2 py-1 w-full mb-2"
            />
            {analizaNapaka && <div className="text-sm text-red-600 mb-2">{analizaNapaka}</div>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowAnalizaPrompt(false);
                  setAnalizaCode('');
                  setAnalizaNapaka('');
                }}
                className="px-3 py-1 bg-gray-300 rounded"
              >
                Prekliči
              </button>
              <button
                onClick={() => {
                  if (analizaCode === '407940') {
                    setAnalizaUnlocked(true);
                    setShowAnalizaPrompt(false);
                    setAnalizaCode('');
                    setAnalizaNapaka('');
                    setAktivniZavihek('analiza');
                  } else {
                    setAnalizaNapaka('Napačna koda.');
                  }
                }}
                className="px-3 py-1 bg-blue-600 text-white rounded"
              >
                Potrdi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: koda za odklep "Dobavljeno" */}
      {showDobavljenoUnlockPrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg max-w-xs w-full">
            <h2 className="text-lg font-bold mb-2">Odklep naloga</h2>
            <input
              ref={dobavljenoUnlockInputRef}
              autoFocus
              type="password"
              placeholder="Koda"
              value={dobavljenoUnlockCode}
              onChange={(e) => {
                setDobavljenoUnlockCode(e.target.value);
                if (dobavljenoUnlockNapaka) setDobavljenoUnlockNapaka('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (dobavljenoUnlockCode === '7474') {
                    setDobavljeno(false);
                    setZaklenjeno(false);
                    setNalogPodatki((prev: any) => ({ ...prev, dobavljenoAt: '' }));
                    setShowDobavljenoUnlockPrompt(false);
                    setDobavljenoUnlockCode('');
                    setDobavljenoUnlockNapaka('');
                  } else {
                    setDobavljenoUnlockNapaka('Napačna koda. Nalog ostaja zaklenjen.');
                  }
                }
              }}
              className="border rounded px-2 py-1 w-full mb-2"
            />
            {dobavljenoUnlockNapaka && <div className="text-sm text-red-600 mb-2">{dobavljenoUnlockNapaka}</div>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowDobavljenoUnlockPrompt(false);
                  setDobavljenoUnlockCode('');
                  setDobavljenoUnlockNapaka('');
                }}
                className="px-3 py-1 bg-gray-300 rounded"
              >
                Prekliči
              </button>
              <button
                onClick={() => {
                  if (dobavljenoUnlockCode === '7474') {
                    setDobavljeno(false);
                    setZaklenjeno(false);
                    setNalogPodatki((prev: any) => ({ ...prev, dobavljenoAt: '' }));
                    setShowDobavljenoUnlockPrompt(false);
                    setDobavljenoUnlockCode('');
                    setDobavljenoUnlockNapaka('');
                  } else {
                    setDobavljenoUnlockNapaka('Napačna koda. Nalog ostaja zaklenjen.');
                  }
                }}
                className="px-3 py-1 bg-blue-600 text-white rounded"
              >
                Potrdi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal za izbris nalog */}
      {prikaziIzbris && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg max-w-xs w-full">
            <h2 className="text-lg font-bold mb-2">Izbriši nalog</h2>
            <input
              ref={izbrisInputRef}
              autoFocus
              type="password"
              placeholder="Geslo"
              value={gesloIzbris}
              onChange={e => {
                setGesloIzbris(e.target.value);
                if (gesloIzbrisNapaka) setGesloIzbrisNapaka('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleIzbrisiNalog();
                }
              }}
              className="border rounded px-2 py-1 w-full mb-3"
            />
            {gesloIzbrisNapaka && <div className="text-sm text-red-600 mb-2">{gesloIzbrisNapaka}</div>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setPrikaziIzbris(false);
                  setGesloIzbris('');
                  setGesloIzbrisNapaka('');
                }}
                className="px-3 py-1 bg-gray-300 rounded"
              >
                Prekliči
              </button>
              <button onClick={handleIzbrisiNalog} className="px-3 py-1 bg-red-600 text-white rounded">Izbriši</button>
            </div>
          </div>
        </div>
      )}
      {/* Modal za neshranjene spremembe */}
      {prikaziUnsavedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full">
            <div className="mb-4 text-lg font-semibold text-gray-800">Neshranjene spremembe</div>
            <div className="mb-6 text-gray-700">Narejene so bile spremembe v delovnem nalogu. Ali želite shraniti spremembe?</div>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                onClick={async () => {
                  setPrikaziUnsavedModal(false);
                  const next = pendingAction;
                  setPendingAction(null);
                  setOriginalniPodatki(null);
                  if (next) {
                    // Shrani in nato odpri ciljni nalog. Če se vmes odpre email modal,
                    // cilj odpri šele po zaprtju emaila (da ne pride do preklopa nazaj).
                    const openedEmail = await handleShraniNalog();
                    const go = () => next();
                    if (openedEmail || prikaziPredogledEmaila) {
                      afterEmailCloseActionRef.current = go;
                    } else {
                      go();
                    }
                  }
                }}
              >Da, shrani</button>
              <button
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
                onClick={() => {
                  setPrikaziUnsavedModal(false);
                  const next = pendingAction;
                  // Uporabnik želi zavreči spremembe: prepreči auto-save in takoj odpri cilj.
                  skipAutoSaveOnceRef.current = true;
                  setNalogShranjeno(true);
                  setOriginalniPodatki(null);
                  setPendingAction(null);
                  // Nadaljuj na ciljni nalog (brez ponovnega klika)
                  if (next) setTimeout(() => next(), 0);
                }}
              >Ne, nadaljuj</button>
            </div>
          </div>
        </div>
      )}
      {/* Animacija za shranjevanje */}
      {showSavedAnim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-green-600 text-white px-6 py-4 rounded-lg shadow-lg text-lg font-semibold">
            Delovni nalog shranjen!
          </div>
        </div>
      )}
      {/* Obvestilo o brisanju (auto-hide) */}
      {showDeletedAnim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-red-600 text-white px-6 py-4 rounded-lg shadow-lg text-lg font-semibold">
            Podatki naloga izbrisani (številka ostaja).
          </div>
        </div>
      )}
      {/* Obvestilo o poslanem e-mailu */}
      {showEmailAnim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-green-600 text-white px-6 py-4 rounded-lg shadow-lg text-lg font-semibold">
            E-mail poslan stranki!
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
