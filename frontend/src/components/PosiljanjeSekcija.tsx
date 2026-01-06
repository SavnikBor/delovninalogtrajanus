import React, { useState } from 'react';

interface PosiljanjePodatki {
  posiljanjePoPosti: boolean;
  naziv: string;
  naslov: string;
  kraj: string;
  postnaStevilka: string;
  osebnoPrevzem: boolean;
  dostavaNaLokacijo: boolean;
  kontaktnaOseba?: string;
  kontakt?: string;
}

interface PosiljanjeSekcijaProps {
  disabled?: boolean;
  zakljucen?: boolean;
  onPosiljanjeChange?: (posiljanje: PosiljanjePodatki) => void;
  posiljanjePodatki?: PosiljanjePodatki;
  dobavljeno?: boolean;
  kupecPodatki?: any;
}

const PosiljanjeSekcija: React.FC<PosiljanjeSekcijaProps> = ({ disabled = false, zakljucen = false, onPosiljanjeChange, posiljanjePodatki, dobavljeno, kupecPodatki }) => {
  const [prikazujNavodila, setPrikazujNavodila] = useState(false);
  const [enakGor, setEnakGor] = useState(false);

  // Helper za prazne podatke
  const prazniPodatki: PosiljanjePodatki = {
    posiljanjePoPosti: false,
    naziv: '',
    naslov: '',
    kraj: '',
    postnaStevilka: '',
    osebnoPrevzem: false,
    dostavaNaLokacijo: false,
    kontaktnaOseba: '',
    kontakt: ''
  };
  const podatki = { ...prazniPodatki, ...(posiljanjePodatki || {}) };

  const handlePosiljanjeChange = (polje: keyof PosiljanjePodatki, vrednost: boolean | string) => {
    if (!onPosiljanjeChange) return;
    // Enkrat je lahko obkljukana le ena kljukica pri pošiljanju
    if (polje === 'posiljanjePoPosti' || polje === 'osebnoPrevzem' || polje === 'dostavaNaLokacijo') {
      const isChecked = Boolean(vrednost);
      const next = {
        ...podatki,
        posiljanjePoPosti: false,
        osebnoPrevzem: false,
        dostavaNaLokacijo: false
      };
      (next as any)[polje] = isChecked;
      onPosiljanjeChange(next);
      return;
    }
    onPosiljanjeChange({ ...podatki, [polje]: vrednost });
  };

  const copyAddressFromKupec = () => {
    if (!onPosiljanjeChange || !kupecPodatki) return;
    const k = kupecPodatki || {};
    const next = {
      ...podatki,
      naziv: (k.Naziv || '').toString(),
      naslov: (k.Naslov || '').toString(),
      kraj: (k.Kraj || '').toString(),
      postnaStevilka: (k.Posta || '').toString()
    };
    onPosiljanjeChange(next);
  };

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-bold text-gray-900">Pošiljanje</h2>

      <div className={`p-3 border rounded-lg shadow-sm ${zakljucen ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
        <div className="space-y-4">
          <div className="flex flex-row items-center gap-4 mb-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={podatki.posiljanjePoPosti}
                onChange={(e) => handlePosiljanjeChange('posiljanjePoPosti', e.target.checked)}
                disabled={disabled}
                className={`rounded border-gray-300 text-purple-600 focus:ring-purple-500 ${zakljucen ? 'bg-red-100 border-red-300' : ''}`}
              />
              Pošiljanje po pošti
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={podatki.osebnoPrevzem}
                onChange={(e) => handlePosiljanjeChange('osebnoPrevzem', e.target.checked)}
                disabled={disabled}
                className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${zakljucen ? 'bg-red-100 border-red-300' : ''}`}
              />
              Osebni prevzem
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={podatki.dostavaNaLokacijo}
                onChange={(e) => handlePosiljanjeChange('dostavaNaLokacijo', e.target.checked)}
                disabled={disabled}
                className={`rounded border-gray-300 text-green-600 focus:ring-green-500 ${zakljucen ? 'bg-red-100 border-red-300' : ''}`}
              />
              Dostava na lokacijo
            </label>
            <button
              type="button"
              onClick={() => setPrikazujNavodila(!prikazujNavodila)}
              className="text-blue-600 text-lg ml-2"
            >
              ❓
            </button>
          </div>

          {(podatki.posiljanjePoPosti || podatki.dostavaNaLokacijo) && (
            <div className={`grid grid-cols-1 md:grid-cols-4 gap-4 p-2 border rounded-md ${zakljucen ? 'bg-red-100 border-red-300' : 'bg-purple-50 border-purple-200'}`}>
              <div className="md:col-span-4 -mb-2">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={enakGor}
                    onChange={(e) => {
                      setEnakGor(e.target.checked);
                      if (e.target.checked && kupecPodatki) copyAddressFromKupec();
                    }}
                    disabled={disabled}
                    className="rounded"
                  />
                  Enak naslov kot zgoraj
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Naziv
                </label>
                <input
                  type="text"
                  value={podatki.naziv}
                  onChange={(e) => handlePosiljanjeChange('naziv', e.target.value)}
                  disabled={disabled}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                  placeholder="Vnesi naziv..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Naslov
                </label>
                <input
                  type="text"
                  value={podatki.naslov}
                  onChange={(e) => handlePosiljanjeChange('naslov', e.target.value)}
                  disabled={disabled}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                  placeholder="Vnesi naslov..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kraj
                </label>
                <input
                  type="text"
                  value={podatki.kraj}
                  onChange={(e) => handlePosiljanjeChange('kraj', e.target.value)}
                  disabled={disabled}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                  placeholder="Vnesi kraj..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Poštna številka
                </label>
                <input
                  type="text"
                  value={podatki.postnaStevilka}
                  onChange={(e) => handlePosiljanjeChange('postnaStevilka', e.target.value)}
                  disabled={disabled}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                  placeholder="npr. 1000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kontaktna oseba
                </label>
                <input
                  type="text"
                  value={podatki.kontaktnaOseba || ''}
                  onChange={(e) => handlePosiljanjeChange('kontaktnaOseba', e.target.value)}
                  disabled={disabled}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                  placeholder="npr. Janez Novak"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kontakt
                </label>
                <input
                  type="text"
                  value={podatki.kontakt || ''}
                  onChange={(e) => handlePosiljanjeChange('kontakt', e.target.value)}
                  disabled={disabled}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                  placeholder="npr. 041 123 456"
                />
              </div>
            </div>
          )}

          {/* Navodila - skrita pod vprašaj */}
          {prikazujNavodila && (
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <ul className="list-disc list-inside space-y-1">
                <li>Če je checkbox "Pošiljanje po pošti" obkljukan, se prikažejo polja za naslov pošiljanja</li>
                <li>To polja se izpolnijo, če je naslov za pošiljanje drugačen od naslova naročnika</li>
                <li>Če checkbox ni obkljukan, se blago prevzame v podjetju (pon–pet, 07:00–15:00)</li>
                <li>Osebni prevzem je možno v naši pisarni</li>
                <li>Dostava na lokacijo je možna po dogovoru</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PosiljanjeSekcija; 