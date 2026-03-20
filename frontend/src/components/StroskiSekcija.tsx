import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { flushSync } from 'react-dom';

interface StroskiPodatki {
  graficnaPriprava: string;
  cenaKlišeja: string;
  cenaIzsekovalnegaOrodja: string;
  cenaVzorca: string;
  cenaBrezDDV: string;
  skupaj: number;
  skupajZDDV: number;
}

interface ReklamacijaPodatki {
  aktivna: boolean;
  vrsta: 'tisk' | 'dodelava' | 'priprava' | 'stranka' | '';
  znesek?: string;
}

interface StroskiSekcijaProps {
  disabled?: boolean;
  zakljucen?: boolean;
  zakljucen1?: boolean;
  zakljucen2?: boolean;
  onStroskiChange?: (stroski1: StroskiPodatki, stroski2: StroskiPodatki) => void;
  stevilkaNaloga?: number;
  tiskPodatki?: { tisk1?: any; tisk2?: any };
  stroskiPodatki?: { stroski1: StroskiPodatki; stroski2: StroskiPodatki };
  dobavljeno?: boolean;
  reklamacijaPodatki?: ReklamacijaPodatki;
  onReklamacijaChange?: (rekl: ReklamacijaPodatki) => void;
  skupnaCenaIzbrana?: boolean;
  onSkupnaCenaChange?: (v: boolean) => void;
}

const StroskiSekcija: React.FC<StroskiSekcijaProps> = ({ disabled = false, zakljucen = false, zakljucen1, zakljucen2, onStroskiChange, stevilkaNaloga = 0, tiskPodatki, stroskiPodatki, dobavljeno = false, reklamacijaPodatki, onReklamacijaChange, skupnaCenaIzbrana = false, onSkupnaCenaChange }) => {
  const jeZakljucen1 = (typeof zakljucen1 === 'boolean') ? zakljucen1 : zakljucen;
  const jeZakljucen2 = (typeof zakljucen2 === 'boolean') ? zakljucen2 : zakljucen;
  const jeZakljucenOba = jeZakljucen1 && jeZakljucen2;
  const isInitializing = useRef(true);

  // Helper za prazne podatke
  const prazniStroski = { graficnaPriprava: '', cenaKlišeja: '', cenaIzsekovalnegaOrodja: '', cenaVzorca: '', cenaBrezDDV: '', skupaj: 0, skupajZDDV: 0 };
  const podatki1 = stroskiPodatki?.stroski1 || prazniStroski;
  const podatki2 = stroskiPodatki?.stroski2 || prazniStroski;
  const rekl: ReklamacijaPodatki = reklamacijaPodatki ? reklamacijaPodatki : { aktivna: false, vrsta: '', znesek: '' };

  const handleStroskiChange = (stroskiIndex: 1 | 2, polje: keyof StroskiPodatki, vrednost: string | number) => {
    if (onStroskiChange) {
      if (stroskiIndex === 1) {
        onStroskiChange({ ...podatki1, [polje]: vrednost }, podatki2);
      } else {
        onStroskiChange(podatki1, { ...podatki2, [polje]: vrednost });
      }
    }
  };

  const handleReklamacijaChange = (partial: Partial<ReklamacijaPodatki>) => {
    if (!onReklamacijaChange) return;
    onReklamacijaChange({
      aktivna: partial.aktivna ?? rekl.aktivna,
      vrsta: partial.vrsta ?? rekl.vrsta,
      znesek: partial.znesek ?? rekl.znesek
    });
  };

  // Parse denar iz različnih zapisov:
  // - "24.12" iz SQL naj pomeni 24,12 (decimalna pika)
  // - "1.234,56" pomeni 1234,56 (tisočice z piko, decimalna vejica)
  // - "1234,56" pomeni 1234,56
  const parseDenar = (raw: any): number | null => {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    if (!s) return null;
    // Če je prisotna vejica, jo tretiraj kot decimalno ločilo; pike so tisočice.
    if (s.includes(',')) {
      const n = Number(s.replace(/\./g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    }
    // Če ni vejice, ampak je pika: odločimo ali je to decimalna pika (npr. 24.12) ali tisočice.
    if (s.includes('.')) {
      // npr. 24.12 (2 decimalni mesti) => decimalna pika
      if (/^\d+\.\d{1,2}$/.test(s)) {
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
      }
      // sicer odstrani pike kot tisočice
      const n = Number(s.replace(/\./g, ''));
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const formatirajCeno = (cena: number) => {
    return new Intl.NumberFormat('sl-SI', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2
    }).format(cena);
  };

  // Funkcija za izračun skupaj in skupajZDDV iz inputov
  const izracunajSkupaj = (podatki: StroskiPodatki) => {
    const graficna = parseDenar(podatki.graficnaPriprava) || 0;
    const klise = parseDenar(podatki.cenaKlišeja) || 0;
    const orodje = parseDenar(podatki.cenaIzsekovalnegaOrodja) || 0;
    const vzorec = parseDenar(podatki.cenaVzorca) || 0;
    const brezDDV = parseDenar(podatki.cenaBrezDDV) || 0;
    const skupaj = graficna + klise + orodje + vzorec + brezDDV;
    const ddv = skupaj * 0.22;
    return { skupaj, skupajZDDV: skupaj + ddv };
  };

  const skupaj1 = izracunajSkupaj(podatki1);
  const skupaj2 = izracunajSkupaj(podatki2);
  const skupnaCena = skupaj1.skupaj + skupaj2.skupaj;
  const skupnaCenaZDDV = skupaj1.skupajZDDV + skupaj2.skupajZDDV;
  const skupniDDV = skupnaCenaZDDV - skupnaCena;

  // Funkcija za izračun cene na kos za vsak strošek posebej
  const izracunajCenoNaKos = (skupaj: number, tisk: any) => {
    const steviloKosov = tisk?.steviloKosov ? (parseDenar((tisk.steviloKosov || '').toString()) || 0) : 0;
    if (!steviloKosov || !isFinite(skupaj)) return 0;
    return skupaj / steviloKosov;
  };

  const renderStroskiForm = (stroskiIndex: 1 | 2, podatki: StroskiPodatki) => {
    const zakljucenLocal = stroskiIndex === 1 ? jeZakljucen1 : jeZakljucen2;
    const zakljucen = zakljucenLocal;
    const naslov = `Cena ${stroskiIndex}`;
    const tisk = stroskiIndex === 1 ? tiskPodatki?.tisk1 : tiskPodatki?.tisk2;
    const skupaj = stroskiIndex === 1 ? skupaj1.skupaj : skupaj2.skupaj;
    const cenaNaKos = izracunajCenoNaKos(skupaj, tisk);
    const formatirajCenoNaKos = (cena: number) => new Intl.NumberFormat('sl-SI', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(cena);
    const steviloKosov = stroskiIndex === 1 ? tiskPodatki?.tisk1?.steviloKosov : tiskPodatki?.tisk2?.steviloKosov;
    const steviloKosovNum = steviloKosov ? (parseDenar(steviloKosov) || 0) : 0;

    return (
      <div className={`bg-white p-3 border rounded-lg shadow-sm ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}>
        <h3 className="text-lg font-semibold text-gray-800 mb-3">{naslov}</h3>
        <div className="space-y-3">
          {/* Horizontalna postavitev polj za cene */}
          <div className="grid grid-cols-5 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Grafična priprava
              </label>
              <input
                type="text"
                value={podatki.graficnaPriprava}
                onChange={e => {
                  let v = e.target.value;
                  // Dovoli številke, decimalno vejico in piko
                  if (!/^[0-9]*[.,]?[0-9]*$/.test(e.target.value)) return;
                  handleStroskiChange(stroskiIndex, 'graficnaPriprava', v);
                }}
                disabled={disabled}
                className={`w-full px-2 py-1 text-sm border ${dobavljeno ? 'border-[#b6e7d8]' : zakljucen ? 'border-red-300' : 'border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100`}
                placeholder="0,00"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Cena klišeja
              </label>
              <input
                type="text"
                value={podatki.cenaKlišeja}
                onChange={e => {
                  let v = e.target.value;
                  // Dovoli številke, decimalno vejico in piko
                  if (!/^[0-9]*[.,]?[0-9]*$/.test(e.target.value)) return;
                  handleStroskiChange(stroskiIndex, 'cenaKlišeja', v);
                }}
                disabled={disabled}
                className={`w-full px-2 py-1 text-sm border ${dobavljeno ? 'border-[#b6e7d8]' : zakljucen ? 'border-red-300' : 'border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100`}
                placeholder="0,00"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Cena izsek. orod.
              </label>
              <input
                type="text"
                value={podatki.cenaIzsekovalnegaOrodja}
                onChange={e => {
                  let v = e.target.value;
                  // Dovoli številke, decimalno vejico in piko
                  if (!/^[0-9]*[.,]?[0-9]*$/.test(e.target.value)) return;
                  handleStroskiChange(stroskiIndex, 'cenaIzsekovalnegaOrodja', v);
                }}
                disabled={disabled}
                className={`w-full px-2 py-1 text-sm border ${dobavljeno ? 'border-[#b6e7d8]' : zakljucen ? 'border-red-300' : 'border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100`}
                placeholder="0,00"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Cena vzorca
              </label>
              <input
                type="text"
                value={podatki.cenaVzorca}
                onChange={e => {
                  let v = e.target.value;
                  // Dovoli številke, decimalno vejico in piko
                  if (!/^[0-9]*[.,]?[0-9]*$/.test(e.target.value)) return;
                  handleStroskiChange(stroskiIndex, 'cenaVzorca', v);
                }}
                disabled={disabled}
                className={`w-full px-2 py-1 text-sm border ${dobavljeno ? 'border-[#b6e7d8]' : zakljucen ? 'border-red-300' : 'border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100`}
                placeholder="0,00"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Cena brez DDV
              </label>
              <input
                type="text"
                value={podatki.cenaBrezDDV}
                onChange={e => {
                  let v = e.target.value;
                  // Dovoli številke, decimalno vejico in piko
                  if (!/^[0-9]*[.,]?[0-9]*$/.test(e.target.value)) return;
                  handleStroskiChange(stroskiIndex, 'cenaBrezDDV', v);
                }}
                disabled={disabled}
                className={`w-full px-2 py-1 text-sm border ${dobavljeno ? 'border-[#b6e7d8]' : zakljucen ? 'border-red-300' : 'border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100`}
                placeholder="0,00"
              />
            </div>
          </div>
          {/* Skupaj in cena na kos */}
          <div className="flex justify-between items-center p-2 bg-blue-50 border border-blue-200 rounded-md">
            <div className="text-sm">
              <span className="font-medium">Skupaj {stroskiIndex}: </span>
              <span className="text-blue-700 font-bold">
                {formatirajCeno(skupaj)}
              </span>
            </div>
            <div className="text-sm">
              <span className="font-medium">Cena na kos: </span>
              <span className="text-blue-700 font-bold">
                {formatirajCenoNaKos(cenaNaKos)} €
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-bold text-gray-900">Prodajna cena</h2>
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-3 ${jeZakljucenOba ? 'bg-red-50 p-3 border border-red-200 rounded-lg' : ''}`}>
        {renderStroskiForm(1, podatki1)}
        {renderStroskiForm(2, podatki2)}
      </div>
      {/* Skupni znesek - vodoravno */}
      <div className={`flex flex-wrap gap-4 md:gap-6 justify-between items-center p-3 border rounded-lg shadow-sm mt-2 ${jeZakljucenOba ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
        {/* Reklamacija: checkbox + možnosti + strošek (levo) */}
        <div className="flex flex-row flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!rekl.aktivna}
              onChange={e => handleReklamacijaChange({ aktivna: e.target.checked })}
              disabled={disabled || zakljucen || dobavljeno}
              className="w-4 h-4"
            />
            <span className="font-medium">Reklamacija</span>
          </label>
          {rekl.aktivna && (
            <>
              <div className="flex items-center gap-2 text-xs md:text-sm">
                <label className="inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name="reklamacija-vrsta"
                    value="tisk"
                    checked={rekl.vrsta === 'tisk'}
                    onChange={() => handleReklamacijaChange({ vrsta: 'tisk' })}
                    disabled={disabled || zakljucen || dobavljeno}
                  />
                  <span>Rekl. tisk</span>
                </label>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name="reklamacija-vrsta"
                    value="dodelava"
                    checked={rekl.vrsta === 'dodelava'}
                    onChange={() => handleReklamacijaChange({ vrsta: 'dodelava' })}
                    disabled={disabled || zakljucen || dobavljeno}
                  />
                  <span>Rekl. dodelava</span>
                </label>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name="reklamacija-vrsta"
                    value="priprava"
                    checked={rekl.vrsta === 'priprava'}
                    onChange={() => handleReklamacijaChange({ vrsta: 'priprava' })}
                    disabled={disabled || zakljucen || dobavljeno}
                  />
                  <span>Rek. priprava</span>
                </label>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name="reklamacija-vrsta"
                    value="stranka"
                    checked={rekl.vrsta === 'stranka'}
                    onChange={() => handleReklamacijaChange({ vrsta: 'stranka' })}
                    disabled={disabled || zakljucen || dobavljeno}
                  />
                  <span>Rekl. Stranka</span>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs md:text-sm text-gray-700">Ocenjen strošek (€):</label>
                <input
                  type="text"
                  value={rekl.znesek || ''}
                  onChange={e => {
                    const v = e.target.value;
                    if (!/^[0-9]*[.,]?[0-9]*$/.test(v)) return;
                    handleReklamacijaChange({ znesek: v });
                  }}
                  placeholder="0,00"
                  disabled={disabled || zakljucen || dobavljeno}
                  className={`w-28 px-2 py-1 text-sm border ${dobavljeno ? 'border-[#b6e7d8]' : zakljucen ? 'border-red-300' : 'border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100`}
                />
              </div>
            </>
          )}
        </div>
        {/* Skupaj (desno) - Skupna cena checkbox levo od Skupaj brez DDV */}
        <div className="flex flex-row gap-6 items-center">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!skupnaCenaIzbrana}
              onChange={e => onSkupnaCenaChange?.(e.target.checked)}
              disabled={disabled || zakljucen || dobavljeno}
              className="w-4 h-4"
            />
            <span className="font-medium">Skupna cena</span>
          </label>
          <div className="text-sm"><b>Skupaj brez DDV:</b> {formatirajCeno(skupnaCena)}</div>
          <div className="text-sm"><b>DDV (22%):</b> {formatirajCeno(skupniDDV)}</div>
          <div className="text-sm"><b>Skupaj z DDV:</b> {formatirajCeno(skupnaCenaZDDV)}</div>
        </div>
      </div>
      {/* Polje za kopiranje - horizontalno + QR kode */}
      <div className={`p-3 border rounded-lg shadow-sm ${zakljucen ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Kopiranje številke naloga</h3>
        <div className="flex flex-row gap-4">
          {/* Tisk 1 */}
          {tiskPodatki?.tisk1?.predmet && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-md p-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tisk 1:
              </label>
              <input
                type="text"
                value={stevilkaNaloga ? `${stevilkaNaloga}_${tiskPodatki.tisk1.predmet}` : ''}
                readOnly
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700 font-mono text-sm"
              />
              <button
                type="button"
                disabled={!stevilkaNaloga}
                onClick={() => {
                  if (stevilkaNaloga) {
                    navigator.clipboard.writeText(`${stevilkaNaloga}_${tiskPodatki.tisk1.predmet}`);
                  }
                }}
                className={`px-3 py-2 ${stevilkaNaloga ? 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500' : 'bg-gray-300 cursor-not-allowed'} text-white rounded-md focus:outline-none focus:ring-2`}
              >
                📋
              </button>
              <div className="flex items-center gap-2">
                <QRCodeCanvas id={`qr-kopiranje-1-${stevilkaNaloga}`} value={`${stevilkaNaloga}_${tiskPodatki.tisk1.predmet}`} size={64} includeMargin={false} />
                <button
                  type="button"
                  disabled={!stevilkaNaloga}
                  onClick={async () => {
                    const canvas = document.getElementById(`qr-kopiranje-1-${stevilkaNaloga}`) as HTMLCanvasElement | null;
                    if (!canvas) return;
                    const pngDataUrl = canvas.toDataURL('image/png');
                    const pdfDoc = await PDFDocument.create();
                    const page = pdfDoc.addPage([595.28, 841.89]); // A4 v pt
                    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                    const pngImage = await pdfDoc.embedPng(pngDataUrl);
                    const text1 = `Delovni nalog: ${stevilkaNaloga}`;
                    const text2 = `Sklop 1 — Predmet: ${tiskPodatki.tisk1.predmet}`;
                    page.drawText(text1, { x: 50, y: 800, size: 14, font });
                    page.drawText(text2, { x: 50, y: 780, size: 12, font });
                    const targetW = 180; // px v pt
                    const scale = targetW / pngImage.width;
                    const targetH = pngImage.height * scale;
                    page.drawImage(pngImage, { x: 50, y: 780 - 20 - targetH, width: targetW, height: targetH });
                    const bytes = await pdfDoc.save();
                    const ab = new ArrayBuffer(bytes.byteLength);
                    new Uint8Array(ab).set(bytes);
                    const blob = new Blob([ab], { type: 'application/pdf' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `qr-${stevilkaNaloga}-sklop1.pdf`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className={`px-3 py-2 ${stevilkaNaloga ? 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-400' : 'bg-gray-300 cursor-not-allowed'} text-white rounded-md focus:outline-none focus:ring-2 text-xs`}
                >
                  ⤓ PDF
                </button>
              </div>
            </div>
          )}
          {/* Tisk 2 */}
          {tiskPodatki?.tisk2?.predmet && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-md p-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tisk 2:
              </label>
              <input
                type="text"
                value={stevilkaNaloga ? `${stevilkaNaloga}_${tiskPodatki.tisk2.predmet}` : ''}
                readOnly
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700 font-mono text-sm"
              />
              <button
                type="button"
                disabled={!stevilkaNaloga}
                onClick={() => {
                  if (stevilkaNaloga) {
                    navigator.clipboard.writeText(`${stevilkaNaloga}_${tiskPodatki.tisk2.predmet}`);
                  }
                }}
                className={`px-3 py-2 ${stevilkaNaloga ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500' : 'bg-gray-300 cursor-not-allowed'} text-white rounded-md focus:outline-none focus:ring-2`}
              >
                📋
              </button>
              <div className="flex items-center gap-2">
                <QRCodeCanvas id={`qr-kopiranje-2-${stevilkaNaloga}`} value={`${stevilkaNaloga}_${tiskPodatki.tisk2.predmet}`} size={64} includeMargin={false} />
                <button
                  type="button"
                  disabled={!stevilkaNaloga}
                  onClick={async () => {
                    const canvas = document.getElementById(`qr-kopiranje-2-${stevilkaNaloga}`) as HTMLCanvasElement | null;
                    if (!canvas) return;
                    const pngDataUrl = canvas.toDataURL('image/png');
                    const pdfDoc = await PDFDocument.create();
                    const page = pdfDoc.addPage([595.28, 841.89]); // A4 v pt
                    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                    const pngImage = await pdfDoc.embedPng(pngDataUrl);
                    const text1 = `Delovni nalog: ${stevilkaNaloga}`;
                    const text2 = `Sklop 2 — Predmet: ${tiskPodatki.tisk2.predmet}`;
                    page.drawText(text1, { x: 50, y: 800, size: 14, font });
                    page.drawText(text2, { x: 50, y: 780, size: 12, font });
                    const targetW = 180;
                    const scale = targetW / pngImage.width;
                    const targetH = pngImage.height * scale;
                    page.drawImage(pngImage, { x: 50, y: 780 - 20 - targetH, width: targetW, height: targetH });
                    const bytes = await pdfDoc.save();
                    const ab = new ArrayBuffer(bytes.byteLength);
                    new Uint8Array(ab).set(bytes);
                    const blob = new Blob([ab], { type: 'application/pdf' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `qr-${stevilkaNaloga}-sklop2.pdf`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className={`px-3 py-2 ${stevilkaNaloga ? 'bg-green-500 hover:bg-green-600 focus:ring-green-400' : 'bg-gray-300 cursor-not-allowed'} text-white rounded-md focus:outline-none focus:ring-2 text-xs`}
                >
                  ⤓ PDF
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StroskiSekcija; 