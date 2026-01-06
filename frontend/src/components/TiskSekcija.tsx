import React, { useState, useEffect } from 'react';

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
  '1/1 črno belo obojestransko (K)'
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

  // Sinhronizacija z props
  useEffect(() => {
    const defaultObj = { predmet: '', format: '', obseg: '', steviloKosov: '', material: '', barve: '', steviloPol: '', kosovNaPoli: '', tiskaKooperant: false, kooperant: '', rokKooperanta: '', znesekKooperanta: '', b2Format: false, b1Format: false, collate: false, steviloMutacij: '1', mutacije: [] };
    const merge1 = { ...defaultObj, ...(tiskPodatki?.tisk1 || {}) };
    const merge2 = { ...defaultObj, ...(tiskPodatki?.tisk2 || {}) };
    setTisk1(merge1);
    setTisk2(merge2);
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
    
    // Formula za tisk (velja le če ni obkljukana kljukica pri b2 ali b1 format pole)
    if (!b2Format && !b1Format) {
      let casTiska = 0;
      if (podatki.barve === '4/0 barvno enostransko (CMYK)') {
        // CMYK enostransko
        casTiska = Math.ceil(steviloPol / 3000 * 10) / 10;
      } else if (podatki.barve === '4/4 barvno obojestransko (CMYK)') {
        // CMYK obojestransko
        casTiska = Math.ceil(steviloPol / 1500 * 10) / 10;
      } else if (podatki.barve === '1/0 črno belo enostransko (K)') {
        // Črno-belo enostransko
        casTiska = Math.ceil(steviloPol / 6000 * 10) / 10;
      } else if (podatki.barve === '1/1 črno belo obojestransko (K)') {
        // Črno-belo obojestransko
        casTiska = Math.ceil(steviloPol / 3000 * 10) / 10;
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

          {/* Obseg/mutacije */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Obseg/mutacije
            </label>
            <input
              type="number"
              value={podatki.steviloMutacij}
              onChange={(e) => {
                const vrednost = e.target.value;
                if (vrednost === '' || (parseInt(vrednost) >= 1 && parseInt(vrednost) <= 10)) {
                  const steviloMutacij = parseInt(vrednost) || 0;
                  const noveMutacije = Array.from({ length: steviloMutacij }, () => ({ steviloPol: '' }));
                  handleTiskChange(tiskIndex, 'steviloMutacij', vrednost);
                  handleMutacijeChange(tiskIndex, noveMutacije);
                }
              }}
              disabled={disabled}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
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
              type="number"
              value={podatki.steviloKosov}
              onChange={(e) => handleTiskChange(tiskIndex, 'steviloKosov', e.target.value)}
              disabled={disabled}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
              placeholder="0"
              min="0"
            />
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
                {podatki.mutacije.map((mutacija, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                      Mutac{index + 1}/sig{index + 1}:
                    </label>
                    <input
                      type="number"
                      value={mutacija.steviloPol}
                      onChange={(e) => {
                        const noveMutacije = [...podatki.mutacije];
                        noveMutacije[index].steviloPol = e.target.value;
                        handleMutacijeChange(tiskIndex, noveMutacije);
                        
                        // Izračunaj skupno število pol
                        const skupnoPol = noveMutacije.reduce((sum, m) => sum + (parseInt(m.steviloPol) || 0), 0);
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
              type="number"
              value={podatki.steviloPol}
              onChange={(e) => handleTiskChange(tiskIndex, 'steviloPol', e.target.value)}
              disabled={disabled}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${
                podatki.b2Format || podatki.b1Format ? 'bg-orange-50' : ''
              } ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
              placeholder="0"
              min="0"
            />
          </div>

          {/* Število kosov na poli */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Število kosov na poli {jePredmetVnesen && <span className="text-red-500">*</span>}
            </label>
            <input
              type="number"
              value={podatki.kosovNaPoli}
              onChange={(e) => handleTiskChange(tiskIndex, 'kosovNaPoli', e.target.value)}
              disabled={disabled}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucenLocal ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
              placeholder="0"
              min="0"
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