import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';

// Definicije možnosti za dodelave
const UV_TISK_OPCIJE = [
  '4/0 barvno enostransko (CMYK)',
  '4/4 barvno obojestransko (CMYK)',
  '1/0 črno belo enostransko (K)',
  '1/1 črno belo obojestransko (K)',
  '4/0 + bela',
  '4/4 + bela',
  '1/0 + bela',
  '1/1 + bela'
];

const UV_LAK_OPCIJE = [
  '1/0 parcialno',
  '1/1 parcialno'
];

const VEZAVA_OPCIJE = [
  'spirala',
  'vezano z žico',
  'broširano',
  'šivano'
];

const IZSEK_OPCIJE = [
  'digitalni izsek',
  'digitalni zasek',
  'klasični izsek',
  'okroglenje vogalov'
];

const PLASTIFIKACIJA_OPCIJE = [
  '1/0 mat',
  '1/0 sijaj',
  '1/1 mat',
  '1/1 sijaj',
  '1/0 soft touch',
  '1/0 anti scratch',
  '1/1 soft touch',
  '1/1 anti scratch'
];

const LEPLJENJE_SIRINE = [
  'trak širine 6 mm',
  'trak širine 9 mm',
  'trak širine 19 mm',
  'vroče strojno lepljenje'
];

const TOPLI_TISK_OPCIJE = [
  'topli tisk',
  'reliefni tisk',
  'globoki tisk'
];

interface DodelavaPodatki {
  razrez: boolean;
  vPolah: boolean;
  zgibanje: boolean;
  biganje: boolean;
  perforacija: boolean;
  biganjeRocnoZgibanje: boolean;
  lepljenje: boolean;
  lepljenjeMesta: string;
  lepljenjeSirina: string;
  lepljenjeBlokov: boolean;
  vrtanjeLuknje: boolean;
  velikostLuknje: string;
  uvTisk: string;
  uvLak: string;
  topliTisk: string;
  vezava: string;
  izsek: string;
  plastifikacija: string;
  kooperant1: boolean;
  kooperant1Podatki: {
    imeKooperanta: string;
    predvidenRok: string;
    znesekDodelave: string;
    vrstaDodelave: string;
  };
  kooperant2: boolean;
  kooperant2Podatki: {
    imeKooperanta: string;
    predvidenRok: string;
    znesekDodelave: string;
    vrstaDodelave: string;
  };
  kooperant3: boolean;
  kooperant3Podatki: {
    imeKooperanta: string;
    predvidenRok: string;
    znesekDodelave: string;
    vrstaDodelave: string;
  };
  stevilkaOrodja: string;
}

interface DodelavaSekcijaProps {
  disabled?: boolean;
  zakljucen?: boolean;
  zakljucen1?: boolean;
  zakljucen2?: boolean;
  onDodelavaChange?: (dodelava1: DodelavaPodatki, dodelava2: DodelavaPodatki) => void;
  dodelavaPodatki?: { dodelava1: DodelavaPodatki; dodelava2: DodelavaPodatki };
  dobavljeno?: boolean;
  tiskPodatki?: any;
}

const DodelavaSekcija: React.FC<DodelavaSekcijaProps> = ({ disabled = false, zakljucen = false, zakljucen1, zakljucen2, onDodelavaChange, dodelavaPodatki, dobavljeno = false, tiskPodatki }) => {
  try {
  const jeZakljucen1 = (typeof zakljucen1 === 'boolean') ? zakljucen1 : zakljucen;
  const jeZakljucen2 = (typeof zakljucen2 === 'boolean') ? zakljucen2 : zakljucen;
  const jeZakljucenOba = jeZakljucen1 && jeZakljucen2;
  const isInitializing = useRef(true);

  // Funkcija za izračun časa dodelave
  const izracunajCasDodelave = (dodelava: DodelavaPodatki, tiskPodatki?: any): { [key: string]: number } => {
    const casDodelav: { [key: string]: number } = {};
    
    if (!tiskPodatki) return casDodelav;
    
    const steviloPol = parseInt(tiskPodatki.steviloPol) || 0;
    const steviloKosov = parseInt(tiskPodatki.steviloKosov) || 0;
    const b2Format = tiskPodatki.b2Format || false;
    const b1Format = tiskPodatki.b1Format || false;
    
    // UV tisk
    if (dodelava.uvTisk && dodelava.uvTisk !== 'brez') {
      let casUvTiska = Math.ceil(steviloPol / (35 * 3 / 8) * 10) / 10;
      if (dodelava.uvTisk.includes('4/4') || dodelava.uvTisk.includes('1/1')) {
        casUvTiska *= 2;
      }
      casDodelav.uvTisk = casUvTiska;
    }
    
    // Plastifikacija
    if (dodelava.plastifikacija && dodelava.plastifikacija !== 'brez') {
      let casPlastifikacije = 0;
      const je1_1 = dodelava.plastifikacija.includes('1/1');
      
      if (!b2Format && !b1Format) {
        casPlastifikacije = Math.ceil(steviloPol * 0.33 / (3.5 * 60) * 10) / 10;
      } else if (b2Format && !b1Format) {
        casPlastifikacije = Math.ceil(steviloPol * 0.72 / (3.5 * 60) * 10) / 10;
      } else if (b1Format) {
        casPlastifikacije = Math.ceil(steviloPol * 1.02 / (3.5 * 60) * 10) / 10;
      }
      
      if (je1_1) {
        casPlastifikacije *= 2;
      }
      
      casDodelav.plastifikacija = casPlastifikacije;
    }
    
    // UV lakiranje
    if (dodelava.uvLak && dodelava.uvLak !== 'brez') {
      let casUvLaka = 0;
      const je1_1 = dodelava.uvLak.includes('1/1');
      
      if (!b2Format && !b1Format) {
        casUvLaka = Math.ceil(steviloPol / 500 * 10) / 10;
      } else if (b2Format && !b1Format) {
        casUvLaka = Math.ceil(steviloPol / 280 * 10) / 10;
      }
      
      if (je1_1) {
        casUvLaka *= 2;
      }
      
      casDodelav.uvLak = casUvLaka;
    }
    
    // Razrez
    if (dodelava.razrez) {
      // Formula za razrez: ROUNDUP((število pol/30)/10;1)
      const casRazreza = Math.ceil((steviloPol / 30) / 10 * 10) / 10;
      casDodelav.razrez = casRazreza;
    }

    // Izsek/zasek
    if (dodelava.izsek && dodelava.izsek !== 'brez') {
      let casIzseka = 0;
      
      if (dodelava.izsek === 'digitalni izsek' || dodelava.izsek === 'digitalni zasek') {
        if (!b2Format && !b1Format) {
          casIzseka = Math.ceil(steviloPol / 60 * 10) / 10;
        } else if (b2Format && !b1Format) {
          casIzseka = Math.ceil(steviloPol / 35 * 10) / 10;
        } else if (b1Format) {
          casIzseka = Math.ceil(steviloPol / 20 * 10) / 10;
        }
      } else if (dodelava.izsek === 'klasični izsek') {
        casIzseka = Math.ceil(8 + 0.5 + steviloPol / 1000 * 10) / 10;
      } else if (dodelava.izsek === 'okroglenje vogalov') {
        casIzseka = Math.ceil((steviloKosov / 30) * 0.03 * 10) / 10;
      }
      casDodelav.izsek = casIzseka;
    }
    
    // Topli tisk, reliefni tisk, globoki tisk
    if (dodelava.topliTisk && dodelava.topliTisk !== 'brez') {
      const casTopliTiska = Math.ceil(8 + 1 + steviloKosov / 1000 * 10) / 10;
      casDodelav.topliTisk = casTopliTiska;
    }
    
    // Biganje
    if (dodelava.biganje) {
      const casBiganja = Math.ceil(steviloKosov / 1000 * 10) / 10;
      casDodelav.biganje = casBiganja;
    }
    
    // Biganje + ročno zgibanje - popravljena formula
    if (dodelava.biganjeRocnoZgibanje) {
      const casBiganjaRocnoZgibanja = Math.ceil(steviloKosov / 1000 + steviloKosov / 500 * 10) / 10;
      casDodelav.biganjeRocnoZgibanje = casBiganjaRocnoZgibanja;
    }
    
    // Zgibanje
    if (dodelava.zgibanje) {
      const casZgibanja = Math.ceil(steviloKosov / 10000 * 10) / 10;
      casDodelav.zgibanje = casZgibanja;
    }
    
    // Lepljenje lepilnega traku
    if (dodelava.lepljenje) {
      const steviloLepilnihMest = parseInt(dodelava.lepljenjeMesta) || 1;
      let casLepljenja = 0;
      
      if (dodelava.lepljenjeSirina === 'vroče strojno lepljenje') {
        casLepljenja = Math.ceil(1 + steviloKosov / 10000 * 10) / 10;
      } else {
        // Za trak širine 6, 9 ali 19 mm
        casLepljenja = Math.ceil(0.1 + (steviloKosov * (15 / 3600)) * steviloLepilnihMest * 10) / 10;
      }
      casDodelav.lepljenje = casLepljenja;
    }
    
    // Lepljenje blokov
    if (dodelava.lepljenjeBlokov) {
      const casLepljenjaBlokov = Math.ceil(1 * (steviloKosov / (2 * 27)) * 10) / 10;
      casDodelav.lepljenjeBlokov = casLepljenjaBlokov;
    }
    
    // Vezava
    if (dodelava.vezava && dodelava.vezava !== 'brez') {
      let casVezave = 0;
      if (dodelava.vezava === 'spirala') {
        casVezave = Math.ceil(steviloKosov / 100 * 10) / 10;
      } else if (dodelava.vezava === 'vezano z žico') {
        casVezave = Math.ceil(steviloKosov / 50 * 10) / 10;
      } else if (dodelava.vezava === 'broširano') {
        casVezave = Math.ceil(steviloKosov / 200 * 10) / 10;
      } else if (dodelava.vezava === 'šivano') {
        casVezave = Math.ceil(steviloKosov / 100 * 10) / 10;
      }
      casDodelav.vezava = casVezave;
    }
    
    // Vrtanje luknje
    if (dodelava.vrtanjeLuknje) {
      const casVrtanja = Math.ceil(steviloKosov / 1000 * 10) / 10;
      casDodelav.vrtanjeLuknje = casVrtanja;
    }
    
    // Perforacija
    if (dodelava.perforacija) {
      const casPerforacije = Math.ceil(steviloKosov / 500 * 10) / 10;
      casDodelav.perforacija = casPerforacije;
    }
    
    return casDodelav;
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

  // Helper za prazne podatke
  const praznaDodelava = { 
    razrez: false, 
    vPolah: false, 
    zgibanje: false, 
    biganje: false, 
    perforacija: false, 
    biganjeRocnoZgibanje: false, 
    lepljenje: false, 
    lepljenjeMesta: '', 
    lepljenjeSirina: '', 
    lepljenjeBlokov: false, 
    vrtanjeLuknje: false, 
    velikostLuknje: '', 
    uvTisk: '', 
    uvLak: '', 
    topliTisk: '', 
    vezava: '', 
    izsek: '', 
    plastifikacija: '', 
    kooperant1: false, 
    kooperant1Podatki: { imeKooperanta: '', predvidenRok: '', znesekDodelave: '', vrstaDodelave: '' }, 
    kooperant2: false, 
    kooperant2Podatki: { imeKooperanta: '', predvidenRok: '', znesekDodelave: '', vrstaDodelave: '' }, 
    kooperant3: false, 
    kooperant3Podatki: { imeKooperanta: '', predvidenRok: '', znesekDodelave: '', vrstaDodelave: '' }, 
    stevilkaOrodja: '' 
  };
  const podatki1 = useMemo(() => {
    try {
      return {
        ...praznaDodelava,
        ...dodelavaPodatki?.dodelava1,
        kooperant1Podatki: {
          imeKooperanta: '',
          predvidenRok: '',
          znesekDodelave: '',
          vrstaDodelave: ''
        },
        kooperant2Podatki: {
          imeKooperanta: '',
          predvidenRok: '',
          znesekDodelave: '',
          vrstaDodelave: ''
        },
        kooperant3Podatki: {
          imeKooperanta: '',
          predvidenRok: '',
          znesekDodelave: '',
          vrstaDodelave: ''
        },
        ...(dodelavaPodatki?.dodelava1?.kooperant1Podatki && { kooperant1Podatki: dodelavaPodatki.dodelava1.kooperant1Podatki }),
        ...(dodelavaPodatki?.dodelava1?.kooperant2Podatki && { kooperant2Podatki: dodelavaPodatki.dodelava1.kooperant2Podatki }),
        ...(dodelavaPodatki?.dodelava1?.kooperant3Podatki && { kooperant3Podatki: dodelavaPodatki.dodelava1.kooperant3Podatki })
      };
    } catch (error) {
      console.error('Napaka pri inicializaciji podatki1:', error);
      return praznaDodelava;
    }
  }, [dodelavaPodatki?.dodelava1]);

  const podatki2 = useMemo(() => {
    try {
      return {
        ...praznaDodelava,
        ...dodelavaPodatki?.dodelava2,
        kooperant1Podatki: {
          imeKooperanta: '',
          predvidenRok: '',
          znesekDodelave: '',
          vrstaDodelave: ''
        },
        kooperant2Podatki: {
          imeKooperanta: '',
          predvidenRok: '',
          znesekDodelave: '',
          vrstaDodelave: ''
        },
        kooperant3Podatki: {
          imeKooperanta: '',
          predvidenRok: '',
          znesekDodelave: '',
          vrstaDodelave: ''
        },
        ...(dodelavaPodatki?.dodelava2?.kooperant1Podatki && { kooperant1Podatki: dodelavaPodatki.dodelava2.kooperant1Podatki }),
        ...(dodelavaPodatki?.dodelava2?.kooperant2Podatki && { kooperant2Podatki: dodelavaPodatki.dodelava2.kooperant2Podatki }),
        ...(dodelavaPodatki?.dodelava2?.kooperant3Podatki && { kooperant3Podatki: dodelavaPodatki.dodelava2.kooperant3Podatki })
      };
    } catch (error) {
      console.error('Napaka pri inicializaciji podatki2:', error);
      return praznaDodelava;
    }
  }, [dodelavaPodatki?.dodelava2]);

  const handleDodelavaChange = (dodelavaIndex: 1 | 2, polje: keyof DodelavaPodatki, vrednost: boolean | string) => {
    try {
      if (onDodelavaChange) {
        if (dodelavaIndex === 1) {
          onDodelavaChange({ ...podatki1, [polje]: vrednost }, podatki2);
        } else {
          onDodelavaChange(podatki1, { ...podatki2, [polje]: vrednost });
        }
      }
    } catch (error) {
      console.error('Napaka pri spreminjanju dodelave:', error);
    }
  };

  const handleKooperantPodatkiChange = useCallback((dodelavaIndex: 1 | 2, kooperantIndex: 1 | 2 | 3, polje: string, vrednost: string) => {
    try {
      const trenutnaDodelava = dodelavaIndex === 1 ? podatki1 : podatki2;
      
      // Ensure kooperant data exists
      const trenutniKooperantPodatki = trenutnaDodelava[`kooperant${kooperantIndex}Podatki` as keyof DodelavaPodatki] as any || {
        imeKooperanta: '',
        predvidenRok: '',
        znesekDodelave: '',
        vrstaDodelave: ''
      };
      
      const novaDodelava = {
        ...trenutnaDodelava,
        [`kooperant${kooperantIndex}Podatki`]: {
          ...trenutniKooperantPodatki,
          [polje]: vrednost
        }
      };
      
      if (onDodelavaChange) {
        onDodelavaChange(dodelavaIndex === 1 ? novaDodelava : podatki1, dodelavaIndex === 2 ? novaDodelava : podatki2);
      }
    } catch (error) {
      console.error('Napaka pri spreminjanju kooperant podatkov:', error);
    }
  }, [podatki1, podatki2, onDodelavaChange]);

  const renderDodelavaForm = (dodelavaIndex: 1 | 2, podatki: DodelavaPodatki) => {
    const zakljucenLocal = dodelavaIndex === 1 ? jeZakljucen1 : jeZakljucen2;
    const zakljucen = zakljucenLocal;
    const naslov = `Dodelava ${dodelavaIndex}`;

    return (
      <div className={`bg-white p-4 border rounded-lg shadow-sm ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : ''}`}>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">{naslov}</h3>
        
        <div className="space-y-4">
          {/* Osnovne dodelave - prva vrstica */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <label className={`flex items-center gap-2 px-2 py-1 rounded ${podatki.razrez ? 'bg-yellow-50 ring-1 ring-yellow-300 font-semibold text-yellow-900' : ''}`}>
              <input
                type="checkbox"
                checked={podatki.razrez}
                onChange={(e) => handleDodelavaChange(dodelavaIndex, 'razrez', e.target.checked)}
                disabled={disabled}
                className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : ''}`}
              />
              <span className="text-sm">razrez</span>
            </label>
            
            <label className={`flex items-center gap-2 px-2 py-1 rounded ${podatki.vPolah ? 'bg-yellow-50 ring-1 ring-yellow-300 font-semibold text-yellow-900' : ''}`}>
              <input
                type="checkbox"
                checked={podatki.vPolah}
                onChange={(e) => handleDodelavaChange(dodelavaIndex, 'vPolah', e.target.checked)}
                disabled={disabled}
                className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : ''}`}
              />
              <span className="text-sm">v polah</span>
            </label>
            
            <label className={`flex items-center gap-2 px-2 py-1 rounded ${podatki.zgibanje ? 'bg-yellow-50 ring-1 ring-yellow-300 font-semibold text-yellow-900' : ''}`}>
              <input
                type="checkbox"
                checked={podatki.zgibanje}
                onChange={(e) => handleDodelavaChange(dodelavaIndex, 'zgibanje', e.target.checked)}
                disabled={disabled}
                className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : ''}`}
              />
              <span className="text-sm">zgibanje</span>
            </label>
            
            <label className={`flex items-center gap-2 px-2 py-1 rounded ${podatki.biganje ? 'bg-yellow-50 ring-1 ring-yellow-300 font-semibold text-yellow-900' : ''}`}>
              <input
                type="checkbox"
                checked={podatki.biganje}
                onChange={(e) => handleDodelavaChange(dodelavaIndex, 'biganje', e.target.checked)}
                disabled={disabled}
                className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : ''}`}
              />
              <span className="text-sm">biganje</span>
            </label>
            
            <label className={`flex items-center gap-2 px-2 py-1 rounded ${podatki.perforacija ? 'bg-yellow-50 ring-1 ring-yellow-300 font-semibold text-yellow-900' : ''}`}>
              <input
                type="checkbox"
                checked={podatki.perforacija}
                onChange={(e) => handleDodelavaChange(dodelavaIndex, 'perforacija', e.target.checked)}
                disabled={disabled}
                className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : ''}`}
              />
              <span className="text-sm">perforacija</span>
            </label>
          </div>

          {/* Nove dodelave - druga vrstica */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className={`flex items-center gap-2 px-2 py-1 rounded ${podatki.biganjeRocnoZgibanje ? 'bg-yellow-50 ring-1 ring-yellow-300 font-semibold text-yellow-900' : ''}`}>
              <input
                type="checkbox"
                checked={podatki.biganjeRocnoZgibanje}
                onChange={(e) => handleDodelavaChange(dodelavaIndex, 'biganjeRocnoZgibanje', e.target.checked)}
                disabled={disabled}
                className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : ''}`}
              />
              <span className="text-sm">biganje + ročno zgibanje</span>
            </label>
            
            <label className={`flex items-center gap-2 px-2 py-1 rounded ${podatki.lepljenje ? 'bg-yellow-50 ring-1 ring-yellow-300 font-semibold text-yellow-900' : ''}`}>
              <input
                type="checkbox"
                checked={podatki.lepljenje}
                onChange={(e) => handleDodelavaChange(dodelavaIndex, 'lepljenje', e.target.checked)}
                disabled={disabled}
                className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : ''}`}
              />
              <span className="text-sm">lepljenje dvolepilnega traku</span>
            </label>
            
            <label className={`flex items-center gap-2 px-2 py-1 rounded ${podatki.lepljenjeBlokov ? 'bg-yellow-50 ring-1 ring-yellow-300 font-semibold text-yellow-900' : ''}`}>
              <input
                type="checkbox"
                checked={podatki.lepljenjeBlokov}
                onChange={(e) => handleDodelavaChange(dodelavaIndex, 'lepljenjeBlokov', e.target.checked)}
                disabled={disabled}
                className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : ''}`}
              />
              <span className="text-sm">lepljenje blokov</span>
            </label>
            
            <label className={`flex items-center gap-2 px-2 py-1 rounded ${podatki.vrtanjeLuknje ? 'bg-yellow-50 ring-1 ring-yellow-300 font-semibold text-yellow-900' : ''}`}>
              <input
                type="checkbox"
                checked={podatki.vrtanjeLuknje}
                onChange={(e) => handleDodelavaChange(dodelavaIndex, 'vrtanjeLuknje', e.target.checked)}
                disabled={disabled}
                className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : ''}`}
              />
              <span className="text-sm">vrtanje luknje</span>
            </label>
          </div>

          {/* Dodatna polja za nove dodelave */}
          {(podatki.lepljenje || podatki.vrtanjeLuknje) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              {podatki.lepljenje && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Število lepilnih mest
                    </label>
                    <select
                      value={podatki.lepljenjeMesta}
                      onChange={(e) => handleDodelavaChange(dodelavaIndex, 'lepljenjeMesta', e.target.value)}
                      disabled={disabled}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                    >
                      <option value="">-- Izberi število --</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vrsta lepljenja
                    </label>
                    <select
                      value={podatki.lepljenjeSirina}
                      onChange={(e) => handleDodelavaChange(dodelavaIndex, 'lepljenjeSirina', e.target.value)}
                      disabled={disabled}
                      className={`w-full min-w-[260px] px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                    >
                      <option value="">-- Izberi vrsto --</option>
                      {LEPLJENJE_SIRINE.map(opcija => (
                        <option key={opcija} value={opcija}>{opcija}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              
              {podatki.vrtanjeLuknje && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Velikost luknje
                  </label>
                  <input
                    type="text"
                    value={podatki.velikostLuknje}
                    onChange={(e) => handleDodelavaChange(dodelavaIndex, 'velikostLuknje', e.target.value)}
                    disabled={disabled}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                    placeholder="npr. fi 3 mm"
                  />
                </div>
              )}
            </div>
          )}

          {/* Dropdown meniji */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* UV tisk */}
            <div>
              <label className={`block text-sm mb-1 ${podatki.uvTisk ? 'font-semibold text-yellow-900' : 'font-medium text-gray-700'}`}>
                UV tisk
              </label>
              <select
                value={podatki.uvTisk}
                onChange={(e) => handleDodelavaChange(dodelavaIndex, 'uvTisk', e.target.value)}
                disabled={disabled}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${podatki.uvTisk ? 'bg-yellow-50 ring-yellow-300 border-yellow-300' : 'focus:ring-blue-500'} ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
              >
                <option value="">-- Izberi UV tisk --</option>
                {UV_TISK_OPCIJE.map(opcija => (
                  <option key={opcija} value={opcija}>{opcija}</option>
                ))}
              </select>
            </div>

            {/* 3D UV lak */}
            <div>
              <label className={`block text-sm mb-1 ${podatki.uvLak ? 'font-semibold text-yellow-900' : 'font-medium text-gray-700'}`}>
                3D UV lak
              </label>
              <select
                value={podatki.uvLak}
                onChange={(e) => handleDodelavaChange(dodelavaIndex, 'uvLak', e.target.value)}
                disabled={disabled}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${podatki.uvLak ? 'bg-yellow-50 ring-yellow-300 border-yellow-300' : 'focus:ring-blue-500'} ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
              >
                <option value="">-- Izberi UV lak --</option>
                {UV_LAK_OPCIJE.map(opcija => (
                  <option key={opcija} value={opcija}>{opcija}</option>
                ))}
              </select>
            </div>

            {/* Topli tisk */}
            <div>
              <label className={`block text-sm mb-1 ${podatki.topliTisk ? 'font-semibold text-yellow-900' : 'font-medium text-gray-700'}`}>
                Topli tisk
              </label>
              <select
                value={podatki.topliTisk}
                onChange={(e) => handleDodelavaChange(dodelavaIndex, 'topliTisk', e.target.value)}
                disabled={disabled}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${podatki.topliTisk ? 'bg-yellow-50 ring-yellow-300 border-yellow-300' : 'focus:ring-blue-500'} ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
              >
                <option value="">-- Izberi topli tisk --</option>
                {TOPLI_TISK_OPCIJE.map(opcija => (
                  <option key={opcija} value={opcija}>{opcija}</option>
                ))}
              </select>
            </div>

            {/* Vezava */}
            <div>
              <label className={`block text-sm mb-1 ${podatki.vezava ? 'font-semibold text-yellow-900' : 'font-medium text-gray-700'}`}>
                Vezava
              </label>
              <select
                value={podatki.vezava}
                onChange={(e) => handleDodelavaChange(dodelavaIndex, 'vezava', e.target.value)}
                disabled={disabled}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${podatki.vezava ? 'bg-yellow-50 ring-yellow-300 border-yellow-300' : 'focus:ring-blue-500'} ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
              >
                <option value="">-- Izberi vezavo --</option>
                {VEZAVA_OPCIJE.map(opcija => (
                  <option key={opcija} value={opcija}>{opcija}</option>
                ))}
              </select>
            </div>

            {/* Izsek/zasek */}
            <div>
              <label className={`block text-sm mb-1 ${podatki.izsek ? 'font-semibold text-yellow-900' : 'font-medium text-gray-700'}`}>
                Izsek/zasek
              </label>
              <select
                value={podatki.izsek}
                onChange={(e) => handleDodelavaChange(dodelavaIndex, 'izsek', e.target.value)}
                disabled={disabled}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${podatki.izsek ? 'bg-yellow-50 ring-yellow-300 border-yellow-300' : 'focus:ring-blue-500'} ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
              >
                <option value="">-- Izberi izsek --</option>
                {IZSEK_OPCIJE.map(opcija => (
                  <option key={opcija} value={opcija}>{opcija}</option>
                ))}
              </select>
            </div>

            {/* Številka orodja - prikaže se samo pri klasičnem izseku */}
            {podatki.izsek === 'klasični izsek' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Številka orodja
                </label>
                <input
                  type="text"
                  value={podatki.stevilkaOrodja}
                  onChange={(e) => handleDodelavaChange(dodelavaIndex, 'stevilkaOrodja', e.target.value)}
                  disabled={disabled}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                  placeholder="Vnesi številko orodja..."
                />
              </div>
            )}

            {/* Plastifikacija */}
            <div>
              <label className={`block text-sm mb-1 ${podatki.plastifikacija ? 'font-semibold text-yellow-900' : 'font-medium text-gray-700'}`}>
                Plastifikacija
              </label>
              <select
                value={podatki.plastifikacija}
                onChange={(e) => handleDodelavaChange(dodelavaIndex, 'plastifikacija', e.target.value)}
                disabled={disabled}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${podatki.plastifikacija ? 'bg-yellow-50 ring-yellow-300 border-yellow-300' : 'focus:ring-blue-500'} ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
              >
                <option value="">-- Izberi plastifikacijo --</option>
                {PLASTIFIKACIJA_OPCIJE.map(opcija => (
                  <option key={opcija} value={opcija}>{opcija}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Kooperanti */}
          <div className="space-y-4">
            {/* Kooperant 1 */}
            <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                              <label className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={podatki.kooperant1}
                    onChange={(e) => handleDodelavaChange(dodelavaIndex, 'kooperant1', e.target.checked)}
                    disabled={disabled}
                    className={`rounded border-gray-300 text-green-600 focus:ring-green-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : ''}`}
                  />
                  <span className="text-sm font-medium">Kooperant 1</span>
                </label>
                {podatki.kooperant1 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ime kooperanta
                    </label>
                                          <input
                        type="text"
                        value={podatki.kooperant1Podatki?.imeKooperanta || ''}
                        onChange={(e) => handleKooperantPodatkiChange(dodelavaIndex, 1, 'imeKooperanta', e.target.value)}
                        disabled={disabled}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                        placeholder="Vnesi ime kooperanta..."
                      />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Predviden rok
                    </label>
                    <input
                      type="date"
                      value={podatki.kooperant1Podatki?.predvidenRok || ''}
                      onChange={(e) => handleKooperantPodatkiChange(dodelavaIndex, 1, 'predvidenRok', e.target.value)}
                      disabled={disabled}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
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
                      value={podatki.kooperant1Podatki?.znesekDodelave || ''}
                      onChange={(e) => handleKooperantPodatkiChange(dodelavaIndex, 1, 'znesekDodelave', e.target.value)}
                      disabled={disabled}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Vrsta dodelave</label>
                    <input
                      type="text"
                      value={podatki.kooperant1Podatki?.vrstaDodelave || ''}
                      onChange={e => handleKooperantPodatkiChange(dodelavaIndex, 1, 'vrstaDodelave', e.target.value)}
                      disabled={disabled}
                      className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                      placeholder="Vnesi vrsto dodelave..."
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Kooperant 2 - prikaže se samo če je kooperant 1 izbran */}
            {podatki.kooperant1 && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={podatki.kooperant2}
                    onChange={(e) => handleDodelavaChange(dodelavaIndex, 'kooperant2', e.target.checked)}
                    disabled={disabled}
                    className={`rounded border-gray-300 text-green-600 focus:ring-green-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : ''}`}
                  />
                  <span className="text-sm font-medium">Kooperant 2</span>
                </label>
                {podatki.kooperant2 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Ime kooperanta
                      </label>
                      <input
                        type="text"
                        value={podatki.kooperant2Podatki?.imeKooperanta || ''}
                        onChange={(e) => handleKooperantPodatkiChange(dodelavaIndex, 2, 'imeKooperanta', e.target.value)}
                        disabled={disabled}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                        placeholder="Vnesi ime kooperanta..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Predviden rok
                      </label>
                      <input
                        type="date"
                        value={podatki.kooperant2Podatki?.predvidenRok || ''}
                        onChange={(e) => handleKooperantPodatkiChange(dodelavaIndex, 2, 'predvidenRok', e.target.value)}
                        disabled={disabled}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
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
                        value={podatki.kooperant2Podatki?.znesekDodelave || ''}
                        onChange={(e) => handleKooperantPodatkiChange(dodelavaIndex, 2, 'znesekDodelave', e.target.value)}
                        disabled={disabled}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vrsta dodelave</label>
                      <input
                        type="text"
                        value={podatki.kooperant2Podatki?.vrstaDodelave || ''}
                        onChange={e => handleKooperantPodatkiChange(dodelavaIndex, 2, 'vrstaDodelave', e.target.value)}
                        disabled={disabled}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                        placeholder="Vnesi vrsto dodelave..."
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Kooperant 3 - prikaže se samo če je kooperant 2 izbran */}
            {podatki.kooperant1 && podatki.kooperant2 && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={podatki.kooperant3}
                    onChange={(e) => handleDodelavaChange(dodelavaIndex, 'kooperant3', e.target.checked)}
                    disabled={disabled}
                    className={`rounded border-gray-300 text-green-600 focus:ring-green-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : ''}`}
                  />
                  <span className="text-sm font-medium">Kooperant 3</span>
                </label>
                {podatki.kooperant3 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Ime kooperanta
                      </label>
                      <input
                        type="text"
                        value={podatki.kooperant3Podatki?.imeKooperanta || ''}
                        onChange={(e) => handleKooperantPodatkiChange(dodelavaIndex, 3, 'imeKooperanta', e.target.value)}
                        disabled={disabled}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                        placeholder="Vnesi ime kooperanta..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Predviden rok
                      </label>
                      <input
                        type="date"
                        value={podatki.kooperant3Podatki?.predvidenRok || ''}
                        onChange={(e) => handleKooperantPodatkiChange(dodelavaIndex, 3, 'predvidenRok', e.target.value)}
                        disabled={disabled}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
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
                        value={podatki.kooperant3Podatki?.znesekDodelave || ''}
                        onChange={(e) => handleKooperantPodatkiChange(dodelavaIndex, 3, 'znesekDodelave', e.target.value)}
                        disabled={disabled}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vrsta dodelave</label>
                      <input
                        type="text"
                        value={podatki.kooperant3Podatki?.vrstaDodelave || ''}
                        onChange={e => handleKooperantPodatkiChange(dodelavaIndex, 3, 'vrstaDodelave', e.target.value)}
                        disabled={disabled}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                        placeholder="Vnesi vrsto dodelave..."
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Povzetek izbranih dodelav */}
          <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Izbrane dodelave:</h4>
            <div className="text-sm text-gray-600 space-y-1">
              {podatki.razrez && <div>• Razrez</div>}
              {podatki.vPolah && <div>• V polah</div>}
              {podatki.zgibanje && <div>• Zgibanje</div>}
              {podatki.biganje && <div>• Biganje</div>}
              {podatki.perforacija && <div>• Perforacija</div>}
              {podatki.biganjeRocnoZgibanje && <div>• Biganje + ročno zgibanje</div>}
              {podatki.lepljenje && <div>• Lepljenje dvolepilnega traku {podatki.lepljenjeMesta && `(${podatki.lepljenjeMesta} mesta)`} {podatki.lepljenjeSirina && `- ${podatki.lepljenjeSirina}`}</div>}
              {podatki.lepljenjeBlokov && <div>• Lepljenje blokov</div>}
              {podatki.vrtanjeLuknje && <div>• Vrtanje luknje {podatki.velikostLuknje && `(${podatki.velikostLuknje})`}</div>}
              {podatki.uvTisk && <div>• UV tisk: {podatki.uvTisk}</div>}
              {podatki.uvLak && <div>• 3D UV lak: {podatki.uvLak}</div>}
              {podatki.topliTisk && <div>• Topli tisk: {podatki.topliTisk}</div>}
              {podatki.vezava && <div>• Vezava: {podatki.vezava}</div>}
              {podatki.izsek && <div>• Izsek/zasek: {podatki.izsek}</div>}
              {podatki.plastifikacija && <div>• Plastifikacija: {podatki.plastifikacija}</div>}
              {podatki.kooperant1 && <div>• Kooperant 1: {podatki.kooperant1Podatki?.imeKooperanta || 'Naziv ni vnesen'}</div>}
              {podatki.kooperant2 && <div>• Kooperant 2: {podatki.kooperant2Podatki?.imeKooperanta || 'Naziv ni vnesen'}</div>}
              {podatki.kooperant3 && <div>• Kooperant 3: {podatki.kooperant3Podatki?.imeKooperanta || 'Naziv ni vnesen'}</div>}
              {podatki.izsek === 'klasični izsek' && podatki.stevilkaOrodja && <div>• Številka orodja: {podatki.stevilkaOrodja}</div>}
              {!podatki.razrez && !podatki.vPolah && !podatki.zgibanje && !podatki.biganje && 
               !podatki.perforacija && !podatki.biganjeRocnoZgibanje && !podatki.lepljenje && !podatki.lepljenjeBlokov &&
               !podatki.vrtanjeLuknje && !podatki.uvTisk && !podatki.uvLak && !podatki.topliTisk && !podatki.vezava && 
               !podatki.izsek && !podatki.plastifikacija && !podatki.kooperant1 && !podatki.kooperant2 && !podatki.kooperant3 && (
                <div className="text-gray-400 italic">Ni izbranih dodelav</div>
              )}
            </div>
            

          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-bold text-gray-900">Dodelava</h2>
      
      <div className={`space-y-2 ${jeZakljucenOba ? 'bg-red-50 p-3 border border-red-200 rounded-lg' : ''}`}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {renderDodelavaForm(1, podatki1)}
          {renderDodelavaForm(2, podatki2)}
        </div>
      </div>
    </div>
  );
  } catch (error) {
    console.error('Napaka v DodelavaSekcija:', error);
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-bold text-gray-900">Dodelava</h2>
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600">Prišlo je do napake pri nalaganju sekcije dodelave. Prosimo, osvežite stran.</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Osveži stran
          </button>
        </div>
      </div>
    );
  }
};

export default DodelavaSekcija; 