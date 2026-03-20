import React, { useState, useRef, useMemo, useEffect } from 'react';
import { db, saveBatchToIndexedDB, loadByYearRange, clearIndexedDB } from './db/indexedDb';
import * as XLSX from 'xlsx';
import { normalizeColorsFromText } from './aiDictionary';
import DelovniNalogForm from './components/DelovniNalogForm';
import DelovniNalogHeader from './components/DelovniNalogHeader';
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
  odprtjeEmailPrikazan?: boolean;
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
  kooperanti: number;
  skupaj: number;
}

interface PrioritetaNaloga {
  stevilkaNaloga: number;
  predvideniCas: number; // v minutah
  casSekcije: CasSekcije;
  rokIzdelave: string;
  rokIzdelaveUra: string;
  prioriteta: number; // 1-5 (1=najvišja, 5=najnižja)
  status: 'v_delu' | 'zakljucen' | 'dobavljeno';
  podatki: any;
  preostaliCasDoRoka: number; // v minutah
}

// Helperji za localStorage
const LOCALSTORAGE_KEY = 'delovniNalogi';

function preberiNalogeIzLocalStorage(): any[] {
  const data = localStorage.getItem(LOCALSTORAGE_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function shraniNalogeVLokalno(nalogi: any[]): void {
  localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(nalogi));
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
  // Inicializacija časov sekcij
      const casSekcije: CasSekcije = {
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
        kooperanti: 0,
        skupaj: 0
    };
  
  // Izračun časa za tisk
  if (nalog.podatki?.tisk?.tisk1?.predmet) {
    const steviloPol = parseInt(nalog.podatki.tisk.tisk1.steviloPol) || 0;
    const format = nalog.podatki.tisk.tisk1.format || '';
    const barve = nalog.podatki.tisk.tisk1.barve || '';
    const b2Format = nalog.podatki.tisk.tisk1.b2Format || false;
    const b1Format = nalog.podatki.tisk.tisk1.b1Format || false;
    
    // Formula za tisk (velja le če ni obkljukana kljukica pri b2 ali b1 format pole)
    if (!b2Format && !b1Format) {
      let casTiska = 0;
      if (barve === '4/0 barvno enostransko (CMYK)') {
        // CMYK enostransko
        casTiska = Math.ceil(steviloPol / 3000 * 10) / 10;
      } else if (barve === '4/4 barvno obojestransko (CMYK)') {
        // CMYK obojestransko
        casTiska = Math.ceil(steviloPol / 1500 * 10) / 10;
      } else if (barve === '1/0 črno belo enostransko (K)') {
        // Črno-belo enostransko
        casTiska = Math.ceil(steviloPol / 6000 * 10) / 10;
      } else if (barve === '1/1 črno belo obojestransko (K)') {
        // Črno-belo obojestransko
        casTiska = Math.ceil(steviloPol / 3000 * 10) / 10;
      }
      casSekcije.tisk += casTiska;
    }
  }
  
  if (nalog.podatki?.tisk?.tisk2?.predmet) {
    const steviloPol = parseInt(nalog.podatki.tisk.tisk2.steviloPol) || 0;
    const format = nalog.podatki.tisk.tisk2.format || '';
    const barve = nalog.podatki.tisk.tisk2.barve || '';
    const b2Format = nalog.podatki.tisk.tisk2.b2Format || false;
    const b1Format = nalog.podatki.tisk.tisk2.b1Format || false;
    
    // Formula za tisk (velja le če ni obkljukana kljukica pri b2 ali b1 format pole)
    if (!b2Format && !b1Format) {
      let casTiska = 0;
      if (barve === '4/0 barvno enostransko (CMYK)') {
        // CMYK enostransko
        casTiska = Math.ceil(steviloPol / 3000 * 10) / 10;
      } else if (barve === '4/4 barvno obojestransko (CMYK)') {
        // CMYK obojestransko
        casTiska = Math.ceil(steviloPol / 1500 * 10) / 10;
      } else if (barve === '1/0 črno belo enostransko (K)') {
        // Črno-belo enostransko
        casTiska = Math.ceil(steviloPol / 6000 * 10) / 10;
      } else if (barve === '1/1 črno belo obojestransko (K)') {
        // Črno-belo obojestransko
        casTiska = Math.ceil(steviloPol / 3000 * 10) / 10;
      }
      casSekcije.tisk += casTiska;
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
      casSekcije.razrez += Math.ceil((steviloPol1 / 30) / 10 * 10) / 10;
    }
    
    // UV tisk
    if (dodelava1.uvTisk && dodelava1.uvTisk !== 'brez') {
      let casUvTiska = Math.ceil(steviloPol1 / (35 * 3 / 8) * 10) / 10;
      // Če je dvostranski tisk (4/4 ali 1/1), pomnoži z 2
      if (dodelava1.uvTisk.includes('4/4') || dodelava1.uvTisk.includes('1/1')) {
        casUvTiska *= 2;
      }
      casSekcije.uvTisk += casUvTiska;
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
        casIzseka = Math.ceil(8 + 0.5 + steviloPol1 / 1000 * 10) / 10;
      } else if (dodelava1.izsek === 'okroglenje vogalov') {
        casIzseka = Math.ceil((steviloKosov1 / 30) * 0.03 * 10) / 10;
      } else if (dodelava1.izsek === 'izsek') {
        // Formula za izsek: ROUNDUP((število pol/30)/10;1)
        casIzseka = Math.ceil((steviloPol1 / 30) / 10 * 10) / 10;
      }
      
      casSekcije.izsek += casIzseka;
    }
    
    // Topli tisk, reliefni tisk, globoki tisk
    if (dodelava1.topliTisk && dodelava1.topliTisk !== 'brez') {
      const steviloKosov1 = parseInt(nalog.podatki.tisk?.tisk1?.steviloKosov) || 0;
      const casTopliTiska = Math.ceil(8 + 1 + steviloKosov1 / 1000 * 10) / 10;
      casSekcije.topliTisk += casTopliTiska;
    }
    
    // Biganje
    if (dodelava1.biganje) {
      const steviloKosov1 = parseInt(nalog.podatki.tisk?.tisk1?.steviloKosov) || 0;
      const casBiganja = Math.ceil(steviloKosov1 / 1000 * 10) / 10;
      casSekcije.biganje += casBiganja;
    }
    
    // Biganje + ročno zgibanje
    if (dodelava1.biganjeRocnoZgibanje) {
      const steviloKosov1 = parseInt(nalog.podatki.tisk?.tisk1?.steviloKosov) || 0;
      const casBiganjaRocnoZgibanja = Math.ceil(steviloKosov1 / 1000 + steviloKosov1 / 500 * 10) / 10;
      casSekcije.biganjeRocnoZgibanje += casBiganjaRocnoZgibanja;
    }
    
    // Zgibanje
    if (dodelava1.zgibanje) {
      const steviloKosov1 = parseInt(nalog.podatki.tisk?.tisk1?.steviloKosov) || 0;
      const casZgibanja = Math.ceil(steviloKosov1 / 10000 * 10) / 10;
      casSekcije.zgibanje += casZgibanja;
    }
    
    // Lepljenje lepilnega traku
    if (dodelava1.lepljenje) {
      const steviloKosov1 = parseInt(nalog.podatki.tisk?.tisk1?.steviloKosov) || 0;
      const steviloLepilnihMest = parseInt(dodelava1.lepljenjeMesta) || 1;
      let casLepljenja = 0;
      
      if (dodelava1.lepljenjeSirina === 'vroče strojno lepljenje') {
        casLepljenja = Math.ceil(1 + steviloKosov1 / 10000 * 10) / 10;
      } else {
        // Za trak širine 6, 9 ali 19 mm
        casLepljenja = Math.ceil(0.1 + (steviloKosov1 * (15 / 3600)) * steviloLepilnihMest * 10) / 10;
      }
      casSekcije.lepljenje += casLepljenja;
    }
    
    // Lepljenje blokov
    if (dodelava1.lepljenjeBlokov) {
      const steviloKosov1 = parseInt(nalog.podatki.tisk?.tisk1?.steviloKosov) || 0;
      const casLepljenjaBlokov = Math.ceil(1 * (steviloKosov1 / (2 * 27)) * 10) / 10;
      casSekcije.lepljenjeBlokov += casLepljenjaBlokov;
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
      } else if (dodelava1.vezava === 'šivano') {
        casVezave = Math.ceil(steviloKosov1 / 100 * 10) / 10;
      }
      casSekcije.vezava += casVezave;
    }
    
    // Vrtanje luknje
    if (dodelava1.vrtanjeLuknje) {
      const steviloKosov1 = parseInt(nalog.podatki.tisk?.tisk1?.steviloKosov) || 0;
      const casVrtanja = Math.ceil(steviloKosov1 / 1000 * 10) / 10;
      casSekcije.vrtanjeLuknje += casVrtanja;
    }
    
    // Perforacija
    if (dodelava1.perforacija) {
      const steviloKosov1 = parseInt(nalog.podatki.tisk?.tisk1?.steviloKosov) || 0;
      const casPerforacije = Math.ceil(steviloKosov1 / 500 * 10) / 10;
      casSekcije.perforacija += casPerforacije;
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
      casSekcije.razrez += Math.ceil((steviloPol2 / 30) / 10 * 10) / 10;
    }
    
    // UV tisk
    if (dodelava2.uvTisk && dodelava2.uvTisk !== 'brez') {
      let casUvTiska = Math.ceil(steviloPol2 / (35 * 3 / 8) * 10) / 10;
      // Če je dvostranski tisk (4/4 ali 1/1), pomnoži z 2
      if (dodelava2.uvTisk.includes('4/4') || dodelava2.uvTisk.includes('1/1')) {
        casUvTiska *= 2;
      }
      casSekcije.uvTisk += casUvTiska;
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
        casIzseka = Math.ceil(8 + 0.5 + steviloPol2 / 1000 * 10) / 10;
      } else if (dodelava2.izsek === 'okroglenje vogalov') {
        casIzseka = Math.ceil((steviloKosov2 / 30) * 0.03 * 10) / 10;
      } else if (dodelava2.izsek === 'izsek') {
        // Formula za izsek: ROUNDUP((število pol/30)/10;1)
        casIzseka = Math.ceil((steviloPol2 / 30) / 10 * 10) / 10;
      }
      
      casSekcije.izsek += casIzseka;
    }
    
    // Topli tisk, reliefni tisk, globoki tisk
    if (dodelava2.topliTisk && dodelava2.topliTisk !== 'brez') {
      const steviloKosov2 = parseInt(nalog.podatki.tisk?.tisk2?.steviloKosov) || 0;
      const casTopliTiska = Math.ceil(8 + 1 + steviloKosov2 / 1000 * 10) / 10;
      casSekcije.topliTisk += casTopliTiska;
    }
    
    // Biganje
    if (dodelava2.biganje) {
      const steviloKosov2 = parseInt(nalog.podatki.tisk?.tisk2?.steviloKosov) || 0;
      const casBiganja = Math.ceil(steviloKosov2 / 1000 * 10) / 10;
      casSekcije.biganje += casBiganja;
    }
    
    // Biganje + ročno zgibanje
    if (dodelava2.biganjeRocnoZgibanje) {
      const steviloKosov2 = parseInt(nalog.podatki.tisk?.tisk2?.steviloKosov) || 0;
      const casBiganjaRocnoZgibanja = Math.ceil(steviloKosov2 / 1000 + steviloKosov2 / 500 * 10) / 10;
      casSekcije.biganjeRocnoZgibanje += casBiganjaRocnoZgibanja;
    }
    
    // Zgibanje
    if (dodelava2.zgibanje) {
      const steviloKosov2 = parseInt(nalog.podatki.tisk?.tisk2?.steviloKosov) || 0;
      const casZgibanja = Math.ceil(steviloKosov2 / 10000 * 10) / 10;
      casSekcije.zgibanje += casZgibanja;
    }
    
    // Lepljenje lepilnega traku
    if (dodelava2.lepljenje) {
      const steviloKosov2 = parseInt(nalog.podatki.tisk?.tisk2?.steviloKosov) || 0;
      const steviloLepilnihMest = parseInt(dodelava2.lepljenjeMesta) || 1;
      let casLepljenja = 0;
      
      if (dodelava2.lepljenjeSirina === 'vroče strojno lepljenje') {
        casLepljenja = Math.ceil(1 + steviloKosov2 / 10000 * 10) / 10;
      } else {
        // Za trak širine 6, 9 ali 19 mm
        casLepljenja = Math.ceil(0.1 + (steviloKosov2 * (15 / 3600)) * steviloLepilnihMest * 10) / 10;
      }
      casSekcije.lepljenje += casLepljenja;
    }
    
    // Lepljenje blokov
    if (dodelava2.lepljenjeBlokov) {
      const steviloKosov2 = parseInt(nalog.podatki.tisk?.tisk2?.steviloKosov) || 0;
      const casLepljenjaBlokov = Math.ceil(1 * (steviloKosov2 / (2 * 27)) * 10) / 10;
      casSekcije.lepljenjeBlokov += casLepljenjaBlokov;
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
      } else if (dodelava2.vezava === 'šivano') {
        casVezave = Math.ceil(steviloKosov2 / 100 * 10) / 10;
      }
      casSekcije.vezava += casVezave;
    }
    
    // Vrtanje luknje
    if (dodelava2.vrtanjeLuknje) {
      const steviloKosov2 = parseInt(nalog.podatki.tisk?.tisk2?.steviloKosov) || 0;
      const casVrtanja = Math.ceil(steviloKosov2 / 1000 * 10) / 10;
      casSekcije.vrtanjeLuknje += casVrtanja;
    }
    
    // Perforacija
    if (dodelava2.perforacija) {
      const steviloKosov2 = parseInt(nalog.podatki.tisk?.tisk2?.steviloKosov) || 0;
      const casPerforacije = Math.ceil(steviloKosov2 / 500 * 10) / 10;
      casSekcije.perforacija += casPerforacije;
    }
  }
  
  // Izračun skupnega časa izdelave (dodelave + tisk)
  const skupniCasIzdelave = casSekcije.tisk + casSekcije.uvTisk + casSekcije.plastifikacija + 
                            casSekcije.uvLak + casSekcije.izsek + casSekcije.razrez + 
                            casSekcije.topliTisk + casSekcije.biganje + casSekcije.biganjeRocnoZgibanje + 
                            casSekcije.zgibanje + casSekcije.lepljenje + casSekcije.lepljenjeBlokov + 
                            casSekcije.vezava + casSekcije.vrtanjeLuknje + casSekcije.perforacija + 
                            casSekcije.kooperanti;
  
  casSekcije.skupaj = skupniCasIzdelave;
  
  // Pretvori skupni čas v minute
  const predvideniCas = Math.round(skupniCasIzdelave * 60);
  
  // Izračun prioritete na podlagi razlike med časom "do roka" in časom izdelave
  let prioriteta = 5; // privzeta najnižja prioriteta
  let preostaliCasDoRoka = 0;
  
  const rokIzdelave = nalog.podatki?.rokIzdelave;
  const rokIzdelaveUra = nalog.podatki?.rokIzdelaveUra;
  
  if (rokIzdelave) {
    const datumRoka = new Date(rokIzdelave);
    const danes = new Date();
    
    // Nastavi konec roka z uro
    let konecRoka = new Date(datumRoka);
    if (rokIzdelaveUra) {
      const [ure, minute] = rokIzdelaveUra.split(':').map(Number);
      konecRoka.setHours(ure, minute, 0, 0);
    } else {
      konecRoka.setHours(15, 0, 0, 0);
    }
    
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
    kooperanti: Math.round(casSekcije.kooperanti * 60),
    skupaj: Math.round(casSekcije.skupaj * 60)
  };

  return {
    stevilkaNaloga: nalog.stevilkaNaloga,
    predvideniCas: predvideniCas,
    casSekcije: casSekcijeVMinutah,
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

// Helper funkcija za preverjanje ali je dodelava zaprta
const isTaskClosed = (stevilkaNaloga: number, taskType: string, closedTasks: Array<{ stevilkaNaloga: number; taskType: string }>): boolean => {
  return closedTasks.some(task => task.stevilkaNaloga === stevilkaNaloga && task.taskType === taskType);
};

// Helper funkcija za izračun skupnega časa brez zaprtih dodelav
const izracunajSkupniCasBrezZaprtih = (nalog: any, closedTasks: Array<{ stevilkaNaloga: number; taskType: string }>): number => {
  let skupniCas = 0;
  const casSekcije = nalog.casSekcije;
  
  // Če casSekcije ne obstaja, vrni 0
  if (!casSekcije) {
    return 0;
  }
  
  if (!isTaskClosed(nalog.stevilkaNaloga, 'Tisk', closedTasks) && casSekcije.tisk > 0) {
    skupniCas += casSekcije.tisk;
  }
  if (!isTaskClosed(nalog.stevilkaNaloga, 'UV Tisk', closedTasks) && casSekcije.uvTisk > 0) {
    skupniCas += casSekcije.uvTisk;
  }
  if (!isTaskClosed(nalog.stevilkaNaloga, 'Plastifikacija', closedTasks) && casSekcije.plastifikacija > 0) {
    skupniCas += casSekcije.plastifikacija;
  }
  if (!isTaskClosed(nalog.stevilkaNaloga, 'UV Lak', closedTasks) && casSekcije.uvLak > 0) {
    skupniCas += casSekcije.uvLak;
  }
  if (!isTaskClosed(nalog.stevilkaNaloga, 'Izsek/Zasek', closedTasks) && casSekcije.izsek > 0) {
    skupniCas += casSekcije.izsek;
  }
  if (!isTaskClosed(nalog.stevilkaNaloga, 'Razrez', closedTasks) && casSekcije.razrez > 0) {
    skupniCas += casSekcije.razrez;
  }
  if (!isTaskClosed(nalog.stevilkaNaloga, 'Topli tisk', closedTasks) && casSekcije.topliTisk > 0) {
    skupniCas += casSekcije.topliTisk;
  }
  if (!isTaskClosed(nalog.stevilkaNaloga, 'Biganje', closedTasks) && casSekcije.biganje > 0) {
    skupniCas += casSekcije.biganje;
  }
  if (!isTaskClosed(nalog.stevilkaNaloga, 'Biganje + ročno zgibanje', closedTasks) && casSekcije.biganjeRocnoZgibanje > 0) {
    skupniCas += casSekcije.biganjeRocnoZgibanje;
  }
  if (!isTaskClosed(nalog.stevilkaNaloga, 'Zgibanje', closedTasks) && casSekcije.zgibanje > 0) {
    skupniCas += casSekcije.zgibanje;
  }
  if (!isTaskClosed(nalog.stevilkaNaloga, 'Lepljenje', closedTasks) && casSekcije.lepljenje > 0) {
    skupniCas += casSekcije.lepljenje;
  }
  if (!isTaskClosed(nalog.stevilkaNaloga, 'Lepljenje blokov', closedTasks) && casSekcije.lepljenjeBlokov > 0) {
    skupniCas += casSekcije.lepljenjeBlokov;
  }
  if (!isTaskClosed(nalog.stevilkaNaloga, 'Vezava', closedTasks) && casSekcije.vezava > 0) {
    skupniCas += casSekcije.vezava;
  }
  if (!isTaskClosed(nalog.stevilkaNaloga, 'Vrtanje luknje', closedTasks) && casSekcije.vrtanjeLuknje > 0) {
    skupniCas += casSekcije.vrtanjeLuknje;
  }
  if (!isTaskClosed(nalog.stevilkaNaloga, 'Perforacija', closedTasks) && casSekcije.perforacija > 0) {
    skupniCas += casSekcije.perforacija;
  }
  if (!isTaskClosed(nalog.stevilkaNaloga, 'Kooperanti', closedTasks) && casSekcije.kooperanti > 0) {
    skupniCas += casSekcije.kooperanti;
  }
  
  return skupniCas;
};

function App() {
  const [zaklenjeno, setZaklenjeno] = useState(false);
  const [stevilkaNaloga, setStevilkaNaloga] = useState(65001);
  const [key, setKey] = useState(0); // Key za prisilno re-render komponent
  const [nalogShranjeno, setNalogShranjeno] = useState(true);
  const [emailPoslan, setEmailPoslan] = useState(false);
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
  
  // Testni e-mail
  const testEmail = `Pozdravljeni, prosim za pripravo 500 vizitk formata 85x55 mm, dvostranskega tiska, papir 300g, plastificirano mat. Dobava do 10. julija. Hvala, Marko Novak, Podjetje Medis`;
  const [emailVrsta, setEmailVrsta] = useState<'odprtje'|'zakljucek'>('odprtje');
  const [emailHtml, setEmailHtml] = useState('');
  const obrazecRef = useRef<HTMLDivElement>(null);
  const [prikaziIzbris, setPrikaziIzbris] = useState(false);
  const [gesloIzbris, setGesloIzbris] = useState('');
  const [prikaziUnsavedModal, setPrikaziUnsavedModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | (() => void)>(null);
  const [showSavedAnim, setShowSavedAnim] = useState(false);
  const [showEmailAnim, setShowEmailAnim] = useState(false);
  /** O SQL strežniku (POST /full); ne mešati z nalogShranjeno (samo „brez neshranjenih sprememb v obrazcu“). */
  const [sqlRemoteSaveStatus, setSqlRemoteSaveStatus] = useState<'idle' | 'pending' | 'success' | 'error' | 'local_only'>('idle');
  const [sqlRemoteSaveError, setSqlRemoteSaveError] = useState<string | null>(null);
  const [aktivniZavihek, setAktivniZavihek] = useState<'delovniNalog'|'prioritetniNalogi'|'kapacitete'|'analiza'>('delovniNalog');
  const [analizaUnlocked, setAnalizaUnlocked] = useState(false);
  const [showAnalizaPrompt, setShowAnalizaPrompt] = useState(false);
  const [analizaCode, setAnalizaCode] = useState('');
  const [originalniPodatki, setOriginalniPodatki] = useState<NalogPodatki | null>(null);
  const [closedTasks, setClosedTasks] = useState<Array<{ stevilkaNaloga: number; taskType: string }>>(() => {
    // Naloži zaprte naloge iz localStorage
    const saved = localStorage.getItem('closedTasks');
    return saved ? JSON.parse(saved) : [];
  });
  const stroskiRef = useRef<HTMLDivElement>(null);

  // Debug: dodaj console.log za setClosedTasks
  const handleSetClosedTasks = (newClosedTasks: Array<{ stevilkaNaloga: number; taskType: string }>) => {
    console.log('setClosedTasks klican z:', newClosedTasks);
    setClosedTasks(newClosedTasks);
  };

  // Shrani closedTasks v localStorage ob spremembi
  useEffect(() => {
    localStorage.setItem('closedTasks', JSON.stringify(closedTasks));
  }, [closedTasks]);

  // Ob spremembah obrazca: počisti napake / „local_only“ / „success“, med aktivnim POST /full pa ohrani „pending“
  useEffect(() => {
    if (!nalogShranjeno) {
      setSqlRemoteSaveError(null);
      setSqlRemoteSaveStatus((prev) => (prev === 'pending' ? prev : 'idle'));
    }
  }, [nalogShranjeno]);

  useEffect(() => {
    if (sqlRemoteSaveStatus !== 'local_only') return;
    const t = setTimeout(() => setSqlRemoteSaveStatus('idle'), 9000);
    return () => clearTimeout(t);
  }, [sqlRemoteSaveStatus]);

  // Odstranjena bližnjica Ctrl+S zaradi težav s podvajanjem/prepisovanjem nalogov

  // Stanje za shranjevanje podatkov iz vseh sekcij
  const [izvozOpen, setIzvozOpen] = useState(false);
  const izvozRef = useRef<HTMLDivElement | null>(null);
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
    zakljucekEmailPoslan: false,
    odprtjeEmailPrikazan: false
  });

  const [vsiNalogi, setVsiNalogi] = useState(() => preberiNalogeIzLocalStorage());

  const [zakljucekEmailPoslan, setZakljucekEmailPoslan] = useState(!!nalogPodatki.zakljucekEmailPoslan);

  // Izračunaj prioritetne naloge
  const prioritetniNalogi = useMemo(() => {
    return vsiNalogi
      .map(izracunajPrioriteto)
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
  }, [vsiNalogi]);

  // Zapri dropdown ob kliku izven in ob Escape
  useEffect(() => {
    if (!izvozOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (izvozRef.current && target && !izvozRef.current.contains(target)) {
        setIzvozOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIzvozOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [izvozOpen]);

  // MVP: naročnina na SSE /api/scan-events in osveževanje closedTasks (podpira scan in undo)
  useEffect(() => {
    const url = 'http://localhost:5000/api/scan-events';
    let es: EventSource | null = null;
    try {
      es = new EventSource(url);
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data || '{}');
          const nalog = Number(data.nalog);
          const step = String(data.step || '');
          const action = String(data.action || 'scan');
          if (!nalog || !step) return;
          if (action === 'undo') {
            setClosedTasks((prev) => {
              const next = prev.filter(t => !(t.stevilkaNaloga === nalog && t.taskType === step));
              try { localStorage.setItem('closedTasks', JSON.stringify(next)); } catch {}
              return next;
            });
          } else {
            // Posodobi closedTasks, če še ni vpisan
            setClosedTasks((prev) => {
              const exists = prev.some(t => t.stevilkaNaloga === nalog && t.taskType === step);
              if (exists) return prev;
              const next = [...prev, { stevilkaNaloga: nalog, taskType: step }];
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
  // Izračunaj mapo prioritet za vse naloge (vključno z zaključenimi)
  const prioritetaMapa = useMemo(() => {
    console.log('prioritetaMapa useMemo se izvaja, closedTasks:', closedTasks);
    const mapa = new Map<number, number>();
    
    // Funkcija za izračun prioritete z upoštevanjem zaprtih dodelav
    const izracunajPrioritetoZaprtih = (nalog: any): number => {
      if (nalog.status === 'zaključen' || nalog.dobavljeno) return 0;
      
      // Če ni določenega datuma, je prioriteta nizka (5)
      if (!nalog.podatki?.rokIzdelave) return 5;
      
      // Če nalog nima casSekcije, uporabi originalno funkcijo
      if (!nalog.casSekcije) {
        const prioritetaNaloga = izracunajPrioriteto(nalog);
        return prioritetaNaloga.prioriteta;
      }
      
      const datumRoka = new Date(nalog.podatki.rokIzdelave);
      const danes = new Date();
      
      // Nastavi konec roka z uro
      let konecRoka = new Date(datumRoka);
      if (nalog.podatki.rokIzdelaveUra) {
        const [ure, minute] = nalog.podatki.rokIzdelaveUra.split(':').map(Number);
        konecRoka.setHours(ure, minute, 0, 0);
      } else {
        konecRoka.setHours(15, 0, 0, 0);
      }
      
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
      
      // Izračun skupnega časa brez zaprtih dodelav
      const skupniCasBrezZaprtih = izracunajSkupniCasBrezZaprtih(nalog, closedTasks);
      
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
      // Pobriši le podatke naloga, številka ostane
      setNalogPodatki({
        kupec: null,
        tisk: null,
        dodelava1: null,
        dodelava2: null,
        stroski1: null,
        stroski2: null,
        posiljanje: null,
        komentar: null,
        emailPoslan: false,
        zakljucekEmailPoslan: false,
        datumNarocila: new Date().toISOString()
      });
      setNalogShranjeno(false);
      setEmailPoslan(false);
      setZakljucen(false);
      setTiskZakljucen1(false);
      setTiskZakljucen2(false);
      setDobavljeno(false);
      setZaklenjeno(false);
      setPrikaziIzbris(false);
      setGesloIzbris('');
      alert('Podatki naloga so bili pobrisani. Številka naloga ostaja.');
    } else {
      alert('Napačno geslo!');
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
    // Združi z obstoječim, da se ob Ctrl+S ne prepišejo polja z null/undefined
    const obstojeci = vsiNalogi.find(n => n.stevilkaNaloga === stevilkaNaloga);
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
    const mergedPodatki = {
      ...stariPodatki,
      ...nalogPodatki,
      kupec: mergePlain(nalogPodatki.kupec, stariPodatki.kupec),
      tisk: mergeTisk(nalogPodatki.tisk, stariPodatki.tisk),
      dodelava1: mergePlain(nalogPodatki.dodelava1, stariPodatki.dodelava1),
      dodelava2: mergePlain(nalogPodatki.dodelava2, stariPodatki.dodelava2),
      stroski1: mergePlain(nalogPodatki.stroski1, stariPodatki.stroski1),
      stroski2: mergePlain(nalogPodatki.stroski2, stariPodatki.stroski2),
      posiljanje: mergePlain(nalogPodatki.posiljanje, stariPodatki.posiljanje),
      komentar: nalogPodatki.komentar ?? stariPodatki.komentar,
      datumNarocila: nalogPodatki.datumNarocila ?? stariPodatki.datumNarocila,
      rokIzdelave: nalogPodatki.rokIzdelave ?? stariPodatki.rokIzdelave,
      rokIzdelaveUra: nalogPodatki.rokIzdelaveUra ?? stariPodatki.rokIzdelaveUra,
      odprtjeEmailPrikazan: nalogPodatki.odprtjeEmailPrikazan ?? stariPodatki.odprtjeEmailPrikazan ?? false
    };
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
    // Lokalno usklajeno z obrazcem; to še ne pomeni uspešnega SQL zapisa.
    setNalogShranjeno(true);
    setSqlRemoteSaveError(null);

    // 1) Zaključni e-mail ob vklopu "tisk zaključen" ali "dobavljeno"
    if ((zakljucen || dobavljeno) && nalogPodatki.kupec?.email && !zakljucekEmailPoslan) {
      setEmailHtml(generirajEmailHtml('zakljucek', nalogPodatki));
      setEmailVrsta('zakljucek');
      if (nalogPodatki.kupec?.posljiEmail) setPrikaziPredogledEmaila(true);
    }
    // 2) Začetni e-mail ob odprtju, samo PRVIČ: če je izbran "Pošlji email obvestilo stranki"
    if (!zakljucen && nalogPodatki.kupec?.posljiEmail && nalogPodatki.kupec?.email && !emailPoslan && !mergedPodatki.odprtjeEmailPrikazan) {
      setEmailHtml(generirajEmailHtml('odprtje', nalogPodatki));
      setEmailVrsta('odprtje');
      setPrikaziPredogledEmaila(true);
      // Zabeleži, da je bil predogled za odprtje že prikazan (da se ne ponovi)
      setNalogPodatki(prev => ({ ...prev, odprtjeEmailPrikazan: true }));
      mergedPodatki.odprtjeEmailPrikazan = true;
      // Posodobi tudi pravkar ustvarjen zapis v spominu
      novNalog.podatki = mergedPodatki;
    }

    const kupecID = nalogPodatki?.kupec?.KupecID;
    if (!kupecID) {
      setSqlRemoteSaveStatus('local_only');
      return;
    }

    setSqlRemoteSaveStatus('pending');
    try {
      const pos = nalogPodatki?.posiljanje || {};
      const fullBody: any = {
        delovniNalogID: stevilkaNaloga,
        stevilkaNaloga: stevilkaNaloga,
        kupec: nalogPodatki?.kupec || null,
        kontakt: nalogPodatki?.kontakt || null,
        komentar: (typeof nalogPodatki?.komentar === 'string') ? { komentar: nalogPodatki?.komentar } : (nalogPodatki?.komentar || {}),
        tisk: nalogPodatki?.tisk || { tisk1: {}, tisk2: {} },
        dodelava1: nalogPodatki?.dodelava1 || {},
        dodelava2: nalogPodatki?.dodelava2 || {},
        stroski1: nalogPodatki?.stroski1 || {},
        stroski2: nalogPodatki?.stroski2 || {},
        posiljanje: pos || {},
        datumNarocila: nalogPodatki?.datumNarocila || '',
        rokIzdelave: nalogPodatki?.rokIzdelave || ''
      };
      fullBody.tiskZakljucen1 = !!tiskZakljucen1;
      fullBody.tiskZakljucen2 = !!tiskZakljucen2;
      fullBody.tiskZakljucen = !!(tiskZakljucen1 && tiskZakljucen2);
      fullBody.dobavljeno = !!dobavljeno;
      fullBody.status = dobavljeno ? 'dobavljeno' : ((tiskZakljucen1 && tiskZakljucen2) ? 'zaključen' : 'v_delu');
      if (nalogPodatki?.reklamacija) fullBody.reklamacija = nalogPodatki.reklamacija;
      let stevilkaServer = stevilkaNaloga;
      const resFull = await fetch('http://localhost:5000/api/delovni-nalog/full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullBody)
      });
      if (!resFull.ok) {
        const t = await resFull.text().catch(() => '');
        throw new Error(`FULL upsert ni uspel (HTTP ${resFull.status})${t ? `: ${t}` : ''}`);
      }
      const dataFull = await resFull.json().catch(() => ({} as any));
      if (dataFull?.delovniNalogID && Number.isFinite(Number(dataFull.delovniNalogID))) {
        stevilkaServer = Number(dataFull.delovniNalogID);
        setStevilkaNaloga(stevilkaServer);
      }
      const litePayload = {
        StevilkaNaloga: stevilkaServer,
        DatumOdprtja: nalogPodatki?.datumNarocila || new Date().toISOString(),
        Status: zakljucen ? 'zaključen' : (dobavljeno ? 'dobavljeno' : 'v_delu'),
        Dobavljeno: dobavljeno ? 1 : 0,
        TiskZakljucen: zakljucen ? 1 : 0,
        TiskZakljucen1: tiskZakljucen1 ? 1 : 0,
        TiskZakljucen2: tiskZakljucen2 ? 1 : 0,
        KupecNaziv: (nalogPodatki?.kupec?.Naziv || '').toString().trim().replace(/^[,\s-]+|[,\s-]+$/g, ''),
        Predmet1: nalogPodatki?.tisk?.tisk1?.predmet || null,
        Predmet2: nalogPodatki?.tisk?.tisk2?.predmet || null
      };
      try { await saveBatchToIndexedDB([litePayload]); } catch {}
      const refreshed = await loadByYearRange(currentYearFilter);
      setVsiNalogi(refreshed);

      setSqlRemoteSaveStatus('success');
      setShowSavedAnim(true);
      setTimeout(() => {
        setShowSavedAnim(false);
        setSqlRemoteSaveStatus('idle');
      }, 1300);
    } catch (e: any) {
      console.warn('SQL shranjevanje ni uspelo:', e);
      const msg = (e && e.message) ? e.message : 'Shranjevanje v SQL ni uspelo. Preveri povezavo z bazo.';
      setSqlRemoteSaveStatus('error');
      setSqlRemoteSaveError(msg);
    }
  };

  const handlePosljiEmail = (vrsta: 'odprtje'|'zakljucek') => {
    setEmailVrsta(vrsta);
    setEmailHtml(generirajEmailHtml(vrsta, nalogPodatki));
    setPrikaziPredogledEmaila(true);
  };

  const potrdiPosljiEmail = async () => {
    try {
      const html = generirajEmailHtml(emailVrsta, nalogPodatki);
      const res = await fetch('http://localhost:5000/api/poslji-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: nalogPodatki.kupec?.email,
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
      if (emailVrsta === 'odprtje') setEmailPoslan(true);
      if (emailVrsta === 'zakljucek') setZakljucekEmailPoslan(true);
      // Prikaži kratko obvestilo (toast) in se samodejno skrij po ~1s
      setShowEmailAnim(true);
      setTimeout(() => setShowEmailAnim(false), 1000);
    } catch (e: any) {
      console.error('Napaka pri pošiljanju e-maila:', e);
      alert(`Napaka pri pošiljanju e-maila: ${e?.message || e}`);
    }
  };

  const handleDobavljenoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      // Preveri cene, če je vpisan predmet
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
          // Vrni checkbox nazaj
          (e.target as HTMLInputElement).checked = false;
          // Pomakni na sekcijo Stroški
          setTimeout(() => stroskiRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
          return;
        }
      }
      setDobavljeno(true);
      setZaklenjeno(true);
    } else {
      const koda = prompt('Za odklepanje vnesite kodo:');
      if (koda === '7474') {
        setDobavljeno(false);
        setZaklenjeno(false);
      } else {
        alert('Napačna koda. Nalog ostaja zaklenjen.');
      }
    }
  };

  const handleZakleniNalog = () => {
    setZaklenjeno(true);
    alert('Delovni nalog je bil zaklenjen. Za odklepanje uporabite gumb "Dobavljeno" z kodo 7474.');
  };

  // Odpiranje naloga iz seznama
  const handleIzberiNalog = (nalog: any) => {
    if (!jeNalogPrazen(nalogPodatki) && !nalogShranjeno) {
      handleShraniNalog();
    }
    const selId = Number(nalog.stevilkaNaloga);
    setStevilkaNaloga(selId);
    const applyFromPayload = (payload: any) => {
      setSqlRemoteSaveStatus('idle');
      setSqlRemoteSaveError(null);
      const sanitizeNaziv = (s: any) => (s != null ? String(s).trim().replace(/^[,\s-]+|[,\s-]+$/g, '') : s);
      // Podpri oba formata: { podatki: {...} } in "full" JSON z vrha (kupec/tisk/dodelave/stroski/posiljanje na vrhu)
      const pRawCandidate = (payload && payload.podatki && Object.keys(payload.podatki).length > 0) ? payload.podatki : payload;
      const pRaw = pRawCandidate || {};
      const p = {
        ...pRaw,
        kupec: pRaw.kupec ? { ...pRaw.kupec, Naziv: sanitizeNaziv(pRaw.kupec.Naziv) } : pRaw.kupec
      };
      const tisk = p?.tisk && (p.tisk.tisk1 || p.tisk.tisk2) ? p.tisk : { tisk1: {}, tisk2: {} };
      const d1 = p?.dodelava1 || p?.dodelava?.dodelava1 || {};
      const d2 = p?.dodelava2 || p?.dodelava?.dodelava2 || {};
      const s1 = p?.stroski1 || p?.stroski?.stroski1 || {};
      const s2 = p?.stroski2 || p?.stroski?.stroski2 || {};
      setNalogPodatki({
        ...p,
        tisk,
        dodelava1: d1,
        dodelava2: d2,
        stroski1: s1,
        stroski2: s2,
        posiljanje: p?.posiljanje || {},
        komentar: p?.komentar || {},
        datumNarocila: (p?.datumNarocila ?? payload?.datumNarocila ?? payload?.datumShranjevanja ?? new Date().toISOString())
      } as any);
    setNalogShranjeno(true);
      setEmailPoslan(!!payload?.emailPoslan);
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
    // If we don't have detailed data, load normalized detail from backend
    const hasDetails = !!(nalog?.podatki && (nalog.podatki.tisk?.tisk1 || nalog.podatki.tisk?.tisk2 || nalog.podatki.dodelava || nalog.podatki.stroski));
    if (!hasDetails) {
      (async () => {
        try {
          // Uporabi novi “full” GET endpoint
          const res = await fetch(`http://localhost:5000/api/delovni-nalog/${selId}`);
          if (res.ok) {
            const payload = await res.json();
            // Preferiraj “full” odgovor strežnika in ga shrani kot normalize/“lite” za IndexedDB
            try { await saveBatchToIndexedDB([payload]); } catch {}
            applyFromPayload(payload);
            return;
          }
        } catch {}
        // Fallback to whatever we have
        applyFromPayload(nalog);
      })();
    } else {
      applyFromPayload(nalog);
    }
  };

  // Novi nalog
  const handleNoviNalog = () => {
    if (!nalogShranjeno) {
      handleShraniNalog();
    }
    const novaStevilka = generirajNaslednjoStevilko(vsiNalogi);
    setStevilkaNaloga(novaStevilka);
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
    });
    setKey(prev => prev + 1);
    setNalogShranjeno(false);
    setEmailPoslan(false);
    setZakljucen(false);
    setTiskZakljucen1(false);
    setTiskZakljucen2(false);
    setDobavljeno(false);
    setZaklenjeno(false);
    setSqlRemoteSaveStatus('idle');
    setSqlRemoteSaveError(null);
    if (obrazecRef.current) {
      obrazecRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Kopiranje naloga
  const handleKopirajNalog = (nalogZaKopijo: any) => {
    if (!jeNalogPrazen(nalogPodatki) && !nalogShranjeno) {
      handleShraniNalog();
    }
    const novaStevilka = generirajNaslednjoStevilko(vsiNalogi);
    const kopiraniPodatki = { ...nalogZaKopijo.podatki };
    if (kopiraniPodatki.kupec) {
      kopiraniPodatki.kupec = { ...kopiraniPodatki.kupec, narocilnica: '' };
    }
    const kopija = {
      ...nalogZaKopijo,
      stevilkaNaloga: novaStevilka,
      datumShranjevanja: new Date().toISOString(),
      podatki: kopiraniPodatki
    };
    const noviSeznam = [...vsiNalogi, kopija].sort((a, b) => b.stevilkaNaloga - a.stevilkaNaloga);
    shraniNalogeVLokalno(noviSeznam);
    setVsiNalogi(noviSeznam);
    setStevilkaNaloga(novaStevilka);
    setNalogPodatki({ ...kopija.podatki });
    setKey(prev => prev + 1);
    setNalogShranjeno(false);
    setEmailPoslan(false);
    setZakljucen(false);
    setTiskZakljucen1(false);
    setTiskZakljucen2(false);
    setDobavljeno(false);
    setZaklenjeno(false);
    setSqlRemoteSaveStatus('idle');
    setSqlRemoteSaveError(null);
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

    const renderTisk = (oznaka: string, t: any) => {
      if (!t || (!t.predmet && !t.kolicina && !t.format && !t.papir && !t.barve)) return '';
      return `<tr><td style='padding:4px 8px;font-weight:bold;'>${oznaka}:</td><td style='padding:4px 8px;'>${[
        t.predmet,
        t.kolicina ? `količina: ${t.kolicina}` : '',
        t.format ? `format: ${t.format}` : '',
        t.papir ? `papir: ${t.papir}` : '',
        t.barve ? `barvnost: ${t.barve}` : ''
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
  function flattenForExcel(value: any, prefix = ''): Array<[string, string]> {
    const rows: Array<[string, string]> = [];
    const isPrimitive = (v: any) =>
      v === null || v === undefined || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
    if (isPrimitive(value)) {
      rows.push([prefix || 'value', value == null ? '' : String(value)]);
      return rows;
    }
    if (Array.isArray(value)) {
      // Za enostavnost serializirajmo polja v JSON
      rows.push([prefix || 'value', JSON.stringify(value)]);
      return rows;
    }
    if (typeof value === 'object') {
      Object.keys(value).forEach((k) => {
        const nextPrefix = prefix ? `${prefix}.${k}` : k;
        const v = (value as any)[k];
        if (isPrimitive(v) || Array.isArray(v)) {
          if (Array.isArray(v)) {
            rows.push([nextPrefix, JSON.stringify(v)]);
          } else {
            rows.push([nextPrefix, v == null ? '' : String(v)]);
          }
        } else {
          rows.push(...flattenForExcel(v, nextPrefix));
        }
      });
      return rows;
    }
    rows.push([prefix || 'value', String(value)]);
    return rows;
  }

  function exportExcel(part: 1 | 2) {
    const data: any = JSON.parse(JSON.stringify(nalogPodatki || {}));
    // Odstrani neustrezne sekcije glede na izbrani del
    if (part === 1) {
      if (data?.tisk) delete data.tisk.tisk2;
      delete data.dodelava2;
      delete data.stroski2;
    } else {
      if (data?.tisk) delete data.tisk.tisk1;
      delete data.dodelava1;
      delete data.stroski1;
    }
    const rows: any[][] = [['Polje', 'Vrednost']];
    const flat = flattenForExcel(data);
    flat.forEach(([k, v]) => rows.push([String(k), v == null ? '' : String(v)]));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Nalog ${stevilkaNaloga || ''}`);
    const fname = `nalog-${stevilkaNaloga || ''}-excel${part}.xlsx`;
    XLSX.writeFile(wb, fname);
  }

  // QR: vrednosti in PDF izvoz
  // QR koda in PDF izvoz sta premaknjena v StroskiSekcija (kopiranje številke naloga)

  // Funkcija za pošiljanje emaila (kličeš backend API)
  async function posljiEmail(nalog: any, vrsta: 'odprtje'|'zakljucek', html: string) {
    await fetch('http://localhost:5000/api/poslji-email', {
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
    // Preveri cene: če je vpisan predmet (tisk1 ali tisk2) in ni nobene cene v stroških, pokaži opozorilo
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
    if (vrednost && nalogPodatki.kupec?.posljiEmail && nalogPodatki.kupec?.email && !nalogPodatki.zakljucekEmailPoslan) {
      setEmailHtml(generirajEmailHtml('zakljucek', nalogPodatki));
      setEmailVrsta('zakljucek');
      setPrikaziPredogledEmaila(true);
    }
  };

  const handleZakljuciTiskDel = (part: 1 | 2) => {
    // Preveri cene za izbran del: če je vpisan predmet in ni nobene cene v stroških tega dela, pokaži opozorilo
    const tisk = part === 1 ? nalogPodatki?.tisk?.tisk1 : nalogPodatki?.tisk?.tisk2;
    const st = part === 1 ? (nalogPodatki?.stroski1 || {}) : (nalogPodatki?.stroski2 || {});
    const imaPredmet = !!(tisk?.predmet && String(tisk.predmet).trim().length > 0);
    const imaCeno = !!(st.graficnaPriprava || st.cenaKlišeja || st.cenaIzsekovalnegaOrodja || st.cenaVzorca || st.cenaBrezDDV);
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
    if (boFull && nalogPodatki.kupec?.posljiEmail && nalogPodatki.kupec?.email && !nalogPodatki.zakljucekEmailPoslan) {
      setEmailHtml(generirajEmailHtml('zakljucek', nalogPodatki));
      setEmailVrsta('zakljucek');
      setPrikaziPredogledEmaila(true);
    }
  };

  // Funkcija za prikaz modala, če so neshranjene spremembe
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
  const handleNoviNalogWrapper = () => confirmIfUnsaved(handleNoviNalog);

  // Shranjevanje (lokalno + SQL); ob uspehu SQL se prikaže overlay „Shranjeno v bazo“ iz handleShraniNalog
  const handleShraniNalogAnim = () => {
    void handleShraniNalog();
  };

  // AI Email Parser funkcije
  const handleRazberiEmail = async () => {
    if (!emailBesedilo.trim()) return;
    
    setAiLoading(true);
    setAiError('');
    setAiRezultat(null);
    setAiPreviewNalog(null);
    
    try {
      const response = await fetch('http://localhost:5000/api/ai/razberiNalogIzEmaila', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emailBesedilo: emailBesedilo.trim() }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setAiRezultat(data);
      // Zgradi predogled naloga (isti mapping kot za vnos, brez setState sprememb)
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
          const resKupci = await fetch('http://localhost:5000/api/kupec');
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
          rokIzdelaveUra: '15:00',
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
  async function ensureYearsLoaded(yearMin: number | null) {
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
          lite: 'true', normalized: 'false', limit: String(batchSize), offset: String(offset),
        });
        const res = await fetch(`http://localhost:5000/api/delovni-nalogi/test?${params.toString()}`);
        if (!res.ok) break;
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) break;
        await saveBatchToIndexedDB(rows);
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
      const have = await db.nalogi.where('year').equals(y).count();
      if (have > 0) continue;
      const batchSize = 1500;
      let offset = 0;
      let loaded = 0;
      const total = undefined; // ne vemo vnaprej
      for (;;) {
        if (cancelImportRef.current.cancel) break;
        setImportProgress({ label: `Uvoz leta ${y}`, loaded, total });
        const params = new URLSearchParams({
          lite: 'true', normalized: 'false', limit: String(batchSize), offset: String(offset), year: String(y),
        });
        const res = await fetch(`http://localhost:5000/api/delovni-nalogi/test?${params.toString()}`);
        if (!res.ok) break;
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) break;
        await saveBatchToIndexedDB(rows);
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
        await ensureYearsLoaded(cur);
        const data = await loadByYearRange(cur);
        setVsiNalogi(data);
      } catch (e) {
        console.error('Init load failed:', e);
      }
    })();
  }, []);

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
      const res = await fetch(`http://localhost:5000/api/delovni-nalogi/test?${params.toString()}`);
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
          const res2 = await fetch(`http://localhost:5000/api/delovni-nalogi/test?${p2.toString()}`);
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
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Sticky header: zavihki + gumbi */}
      <div className="sticky top-0 z-50 bg-white border-b shadow-sm">
        <div className="flex flex-col">
          {/* Zavihki */}
          <div className="flex">
            <button
              onClick={() => setAktivniZavihek('delovniNalog')}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                aktivniZavihek === 'delovniNalog'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              📋 Delovni nalog
            </button>
            <button
              onClick={() => setAktivniZavihek('prioritetniNalogi')}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                aktivniZavihek === 'prioritetniNalogi'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              ⏰ Seznam prioritetnih nalogov
            </button>
            <button
              onClick={() => setAktivniZavihek('kapacitete')}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                aktivniZavihek === 'kapacitete'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              🤖 AI in kooperani
            </button>
            <button
              onClick={() => {
                if (analizaUnlocked) {
                  setAktivniZavihek('analiza');
                } else {
                  setShowAnalizaPrompt(true);
                }
              }}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                aktivniZavihek === 'analiza'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              📈 Analiza
            </button>
          </div>
          {showAnalizaPrompt && (
            <div className="border-t bg-white px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">Vnesi kodo za dostop do analize:</span>
                <input
                  type="password"
                  value={analizaCode}
                  onChange={(e) => setAnalizaCode(e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                  placeholder="Koda"
                />
                <button
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm"
                  onClick={() => {
                    if (analizaCode === '407940') {
                      setAnalizaUnlocked(true);
                      setShowAnalizaPrompt(false);
                      setAnalizaCode('');
                      setAktivniZavihek('analiza');
                    } else {
                      alert('Napačna koda.');
                    }
                  }}
                >
                  Potrdi
                </button>
                <button
                  className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-md text-sm"
                  onClick={() => {
                    setShowAnalizaPrompt(false);
                    setAnalizaCode('');
                  }}
                >
                  Prekliči
                </button>
              </div>
            </div>
          )}
          {/* Gumbi za delovni nalog */}
          {aktivniZavihek === 'delovniNalog' && (
            <div className="border-t bg-white">
            <div className="flex flex-wrap items-center gap-2 px-4 py-2">
              <button
                type="button"
                onClick={handleShraniNalogAnim}
                disabled={sqlRemoteSaveStatus === 'pending'}
                className="px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 font-medium text-sm disabled:opacity-60 disabled:cursor-not-allowed"
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
                          exportExcel(1);
                          setIzvozOpen(false);
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        📊 Excel 1 (tisk/dodelave/stroški 1)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          exportExcel(2);
                          setIzvozOpen(false);
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        📊 Excel 2 (tisk/dodelave/stroški 2)
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
              {/* Reset in uvoz iz SQL TEST baze */}
              <button
                type="button"
                onClick={handleResetShranjeniNalogi}
                className="px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-sm"
                title="Izbriši vse lokalno shranjene naloge (testne) in zaprte korake"
              >
                🗑️ Resetiraj shranjene naloge
              </button>
              <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleImportFromSQLTest}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm"
                  title="Uvozi naloge iz SQL v IndexedDB glede na filter let"
              >
                ⤴️ Uvozi iz SQL (TEST)
              </button>
                {importing && (
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <div className="h-2 w-40 bg-gray-200 rounded overflow-hidden">
                      <div className="h-2 bg-indigo-500 animate-pulse" style={{ width: '75%' }} />
                    </div>
                    <span>
                      {importProgress?.label || 'Uvoz'}: {importProgress?.loaded ?? 0}{importProgress?.total != null ? ` / ${importProgress.total}` : ''}
                    </span>
                    <button
                      type="button"
                      className="px-2 py-1 bg-gray-300 rounded hover:bg-gray-400"
                      onClick={() => { cancelImportRef.current.cancel = true; }}
                    >
                      Ustavi
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  // Odpri dobavnico v novem zavihku
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
                  // Pripravi vrstice iz tiska (do 2 vrstici)
                  const tisk1 = nalogPodatki.tisk?.tisk1 || {};
                  const tisk2 = nalogPodatki.tisk?.tisk2 || {};
                  // Funkcije za izračun cen
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
                  const stroski1 = nalogPodatki.stroski1 || {};
                  const stroski2 = nalogPodatki.stroski2 || {};
                  const s1 = izracunSkupaj(stroski1);
                  const s2 = izracunSkupaj(stroski2);
                  const formatCurrency = (n: number) => new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n);
                  // Če je zaključen samo del naloga, izpiši na dobavnici samo zaključen(e) del(e)
                  const jeDelnoZakljucen = (tiskZakljucen1 || tiskZakljucen2) && !(tiskZakljucen1 && tiskZakljucen2);
                  const uporabi1 = jeDelnoZakljucen ? !!tiskZakljucen1 : true;
                  const uporabi2 = jeDelnoZakljucen ? !!tiskZakljucen2 : true;
                  // Zgradi vrstice z dodano ceno
                  const vrstice: Array<{ naziv: string; kolicina: string; enota: string; cena?: string }> = [];
                  if (uporabi1 && tisk1?.predmet) {
                    vrstice.push({ naziv: `${tisk1.predmet}${tisk1.format ? `, ${tisk1.format}` : ''}`, kolicina: tisk1.steviloKosov || '', enota: 'kos', cena: s1.skupaj ? formatCurrency(s1.skupaj) : '' });
                  }
                  if (uporabi2 && tisk2?.predmet) {
                    vrstice.push({ naziv: `${tisk2.predmet}${tisk2.format ? `, ${tisk2.format}` : ''}`, kolicina: tisk2.steviloKosov || '', enota: 'kos', cena: s2.skupaj ? formatCurrency(s2.skupaj) : '' });
                  }
                  if (vrstice.length === 0) {
                    vrstice.push({ naziv: 'Tiskovina', kolicina: '', enota: 'kos', cena: '' });
                  }
                  const vrsticeHtml = vrstice.map(v => `
                    <tr>
                      <td style="padding:8px; border:1px solid #000;">${(v.naziv || '').toString()}</td>
                      <td style="padding:8px; border:1px solid #000; text-align:center;">${(v.kolicina || '').toString()}</td>
                      <td style="padding:8px; border:1px solid #000; text-align:center;">${(v.enota || '').toString()}</td>
                      <td style="padding:8px; border:1px solid #000; text-align:right; width:140px;">${(v.cena || '').toString()}</td>
                    </tr>
                  `).join('');
                  const skupajBrezDDV = (uporabi1 ? (s1.skupaj || 0) : 0) + (uporabi2 ? (s2.skupaj || 0) : 0);
                  const skupajDDV = (uporabi1 ? (s1.ddv || 0) : 0) + (uporabi2 ? (s2.ddv || 0) : 0);
                  const skupajZDDV = (uporabi1 ? (s1.skupajZDDV || 0) : 0) + (uporabi2 ? (s2.skupajZDDV || 0) : 0);
                  // Zgradimo vsebino za eno kopijo dobavnice
                  const enaDobavnica = `
  <div class="header">
    <div class="bold">Trajanus d.o.o., Savska loka 21, 4000 Kranj</div>
  </div>

  <div class="title-line">
    <h1>DOBAVNICA št.: ${stevilkaNaloga}</h1>
    <div class="bold">Datum: ${datum}</div>
  </div>

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
        <th style="padding:8px; border:1px solid #000; text-align:right; width:140px;">Cena</th>
      </tr>
    </thead>
    <tbody>
      ${vrsticeHtml}
    </tbody>
  </table>

  <div class="block">
    <div><span class="bold">Skupaj (brez DDV):</span> ${formatCurrency(skupajBrezDDV)}</div>
    <div><span class="bold">DDV (22%):</span> ${formatCurrency(skupajDDV)}</div>
    <div><span class="bold">Skupaj (z DDV):</span> ${formatCurrency(skupajZDDV)}</div>
  </div>

  <div class="block" style="margin-top:24px;">
    <div class="bold">Prevzel:</div>
    <div style="border-bottom:1px solid #000; width:260px; height:28px;"></div>
  </div>

  <div class="block small">
    Opomba: Ta dobavnica je bila generirana iz delovnega naloga št. ${stevilkaNaloga}.
  </div>
                  `;
                  
                  const html = `
<!doctype html>
<html lang="sl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dobavnica ${stevilkaNaloga}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color: #000; }
    .header { border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 16px; }
    .title-line { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 8px; margin-top: 12px; }
    h1 { margin: 0; font-size: 24px; }
    .bold { font-weight: bold; }
    .block { margin: 12px 0; }
    table { border-collapse: collapse; width: 100%; margin-top: 8px; }
    .small { font-size: 12px; color: #333; }
    .copy-sep { margin: 24px 0; border-top: 2px dashed #000; }
    @media print {
      .no-print { display: none; }
      body { margin: 0.5cm; }
    }
  </style>
</head>
<body>
  ${enaDobavnica}
  <div class="copy-sep"></div>
  ${enaDobavnica}

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
                }}
                className="px-3 py-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium text-sm"
              >
                📄 Dobavnica
              </button>
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
                <input 
                  type="date" 
                  value={nalogPodatki.rokIzdelave || ''} 
                  onChange={e => {
                    handleRokIzdelaveChange(e.target.value);
                    setNalogShranjeno(false);
                  }} 
                  className="border rounded px-2 py-1 text-sm" 
                  disabled={zaklenjeno}
                />
                <select 
                  value={nalogPodatki.rokIzdelaveUra || '15:00'} 
                  onChange={e => {
                    handlePodatkiChange('rokIzdelaveUra', e.target.value);
                    setNalogShranjeno(false);
                  }} 
                  className="border rounded px-2 py-1 text-sm ml-1" 
                  disabled={zaklenjeno}
                >
                  {Array.from({length: 8*4}, (_, i) => {
                    const h = String(7 + Math.floor(i/4)).padStart(2, '0');
                    const m = String((i%4)*15).padStart(2, '0');
                    return <option key={h+':'+m} value={h+':'+m}>{h}:{m}</option>;
                  })}
                </select>
              </span>
              <div className="ml-auto flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={zakljucen}
                      onChange={(e) => handleZakljucenChange(e.target.checked)}
                      className="rounded"
                    />
                    Tisk zaključen
                  </label>
                  <select
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 't1') handleZakljuciTiskDel(1);
                      if (v === 't2') handleZakljuciTiskDel(2);
                      // reset na placeholder (ker je to akcijski dropdown)
                      e.currentTarget.value = '';
                    }}
                    disabled={zaklenjeno}
                    className="border rounded px-2 py-1 text-xs"
                    title="Ločeno zaključi tisk 1 ali tisk 2"
                  >
                    <option value="">Zaključi…</option>
                    <option value="t1" disabled={tiskZakljucen1}>Zaključi tisk 1</option>
                    <option value="t2" disabled={tiskZakljucen2}>Zaključi tisk 2</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={dobavljeno}
                    onChange={handleDobavljenoChange}
                    className="rounded"
                  />
                  Dobavljeno
                </label>
                <button
                  type="button"
                  onClick={() => setPrikaziIzbris(true)}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-sm"
                >
                  🗑️ Izbriši nalog
                </button>
              </div>
            </div>
            {sqlRemoteSaveStatus === 'pending' && (
              <div className="px-4 pb-2 text-sm text-gray-800 flex items-center gap-2 bg-amber-50/80 border-t border-amber-100">
                <span className="inline-block h-4 w-4 border-2 border-amber-700 border-t-transparent rounded-full animate-spin shrink-0" aria-hidden />
                Shranjevanje v bazo …
              </div>
            )}
            {sqlRemoteSaveStatus === 'local_only' && (
              <div className="px-4 pb-2 text-sm text-amber-950 bg-amber-50 border-t border-amber-100">
                <span className="font-medium">Shranjeno samo na tej napravi</span>
                {' '}(ni KupecID — izberite kupca iz baze ali dodajte stranko in jo shranjite v SQL, nato znova Shrani).
              </div>
            )}
            {sqlRemoteSaveStatus === 'error' && sqlRemoteSaveError && (
              <div className="px-4 pb-2 text-sm bg-red-50 border-t border-red-100 text-red-900">
                <span className="font-medium">Shranjevanje v bazo ni uspelo.</span>{' '}
                {sqlRemoteSaveError}
                <div className="mt-1 text-red-800">Ponovno kliknite Shrani, ko odpravite težavo.</div>
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      {/* Vsebina zavihkov */}
      {aktivniZavihek === 'delovniNalog' && (
        <div className="flex flex-row h-screen">
          {/* Leva stran: seznam nalogov */}
          <div className="border-r bg-white" style={{ minWidth: 380, height: '100vh', overflowY: 'auto' }}>
            <SeznamNaloga
              nalogi={vsiNalogi}
              onIzberi={handleIzberiNalogWrapper}
              onKopiraj={handleKopirajNalog}
              getPrioritetaBarva={getPrioritetaBarva}
              closedTasks={closedTasks}
              prioritetaMapa={prioritetaMapa}
              initialYear={currentYearFilter ?? new Date().getFullYear()}
              onYearFilterChange={onYearFilterChange}
            />
          </div>
          {/* Desna stran: obrazec */}
          <div className="flex-1" style={{ height: '100vh', overflowY: 'auto' }}>
            {/* Glavni obrazec */}
            <div ref={obrazecRef} className={`p-2 space-y-2 ${dobavljeno ? 'bg-[#e6f9f3]' : zakljucen ? 'bg-red-50' : ''}`}>
              {/* Glavne sekcije */}
              <div className="space-y-2">
                <KupecSelect
                  disabled={zaklenjeno}
                  zakljucen={zakljucen}
                  dobavljeno={dobavljeno}
                  kupecPodatki={nalogPodatki.kupec}
                  onKupecChange={(podatki) => handlePodatkiChange('kupec', podatki)}
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
        <div className="flex-1" style={{ height: '100vh', overflowY: 'auto' }}>
          <PrioritetniNalogi 
            prioritetniNalogi={prioritetniNalogi} 
            onIzberi={handleIzberiNalogWrapper}
            onClosedTasksChange={handleSetClosedTasks}
            closedTasks={closedTasks}
          />
        </div>
      )}

      {aktivniZavihek === 'kapacitete' && (
        <div className="flex-1 p-8" style={{ height: '100vh', overflowY: 'auto' }}>
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Levo: AI Email Parser */}
              <div className="md:pr-6 md:border-r md:border-gray-200">
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h2 className="text-2xl font-bold mb-2">Samodejni nalogi AI</h2>
                  <p className="text-gray-600 mb-4">Razbiranje e-mailov</p>
                <h3 className="text-xl font-semibold mb-4">AI Razbiranje e-mailov</h3>
                <p className="text-gray-600 mb-4">
                  Vnesite besedilo e-maila in AI bo samodejno razbral podatke za nov delovni nalog.
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
                      {aiLoading ? 'Razbiranje...' : 'Ustvari nalog iz e-maila'}
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
                        {JSON.stringify(aiPreviewNalog || aiRezultat, null, 2)}
                      </pre>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={handleUporabiAIRezultat}
                          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                        >
                          Ustvari nalog iz e-maila
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

              {/* Desno: Pregled kooperantov */}
              <div className="md:pl-6">
                <DostavaTiskovin
                  vsiNalogi={vsiNalogi}
                  onOpenNalog={(st) => {
                    const n = (vsiNalogi || []).find((x: any) => String(x?.stevilkaNaloga) === String(st));
                    if (n) {
                      handleIzberiNalogWrapper(n);
                    }
                  }}
                />
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

      {aktivniZavihek === 'analiza' && (
        <div className="flex-1" style={{ height: '100vh', overflowY: 'auto' }}>
          <Analiza nalogi={vsiNalogi} />
        </div>
      )}

      {/* Modali ostanejo zunaj zavihkov */}
      {/* Predogled emaila */}
      {prikaziPredogledEmaila && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg max-w-lg w-full">
            <h2 className="text-lg font-bold mb-2">Predogled emaila ({emailVrsta === 'odprtje' ? 'Obvestilo o odprtju' : 'Zaključen nalog'})</h2>
            <div className="mb-4 text-sm whitespace-pre-wrap max-h-96 overflow-y-auto" dangerouslySetInnerHTML={{__html: emailHtml}} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPrikaziPredogledEmaila(false)} className="px-3 py-1 bg-gray-300 rounded">Prekliči</button>
              <button onClick={potrdiPosljiEmail} className="px-3 py-1 bg-blue-600 text-white rounded">Pošlji</button>
            </div>
          </div>
        </div>
      )}
      {/* Modal za izbris nalog */}
      {prikaziIzbris && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg max-w-xs w-full">
            <h2 className="text-lg font-bold mb-2">Izbriši nalog</h2>
            <input type="password" placeholder="Geslo" value={gesloIzbris} onChange={e => setGesloIzbris(e.target.value)} className="border rounded px-2 py-1 w-full mb-3" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPrikaziIzbris(false)} className="px-3 py-1 bg-gray-300 rounded">Prekliči</button>
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
                onClick={() => {
                  setPrikaziUnsavedModal(false);
                  const next = pendingAction;
                  setPendingAction(null);
                  void (async () => {
                    await handleShraniNalog();
                    if (next) next();
                  })();
                }}
              >Da, shrani</button>
              <button
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
                onClick={() => {
                  setPrikaziUnsavedModal(false);
                  // Obnovi originalne podatke
                  if (originalniPodatki) {
                    setNalogPodatki(originalniPodatki);
                  }
                  setNalogShranjeno(true); // Označi kot shranjeno, da se ne shrani
                  setOriginalniPodatki(null);
                  // Ne kliči pendingAction, ker se ne sme shraniti
                  setPendingAction(null);
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
            Shranjeno v bazo
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
