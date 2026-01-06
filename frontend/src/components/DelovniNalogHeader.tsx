import React, { useState } from 'react';

// Dummy funkcija za slovenske praznike (za demo, lahko kasneje nadgradiš)
const slovenskiPrazniki = [
  '1.1.', '8.2.', '27.4.', '1.5.', '2.5.', '25.6.', '15.8.', '31.10.', '1.11.', '25.12.', '26.12.'
];

function isSlovenskiPraznik(date: Date) {
  const d = date.getDate() + '.' + (date.getMonth() + 1) + '.';
  return slovenskiPrazniki.includes(d);
}

function isWeekend(date: Date) {
  return date.getDay() === 0 || date.getDay() === 6;
}

function isAllowedTime(date: Date) {
  const hour = date.getHours();
  return hour >= 7 && hour < 15;
}

// Funkcija za formatiranje datuma v evropski format
function formatDateToEuropean(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

// Funkcija za formatiranje datuma v slovenski format (17.5.2025)
function formatDateToSlovenian(date: Date): string {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

// Generiraj ure med 07:00 in 15:00
const generateHours = () => {
  const hours = [];
  for (let i = 7; i < 15; i++) {
    hours.push(i.toString().padStart(2, '0'));
  }
  return hours;
};

// Generiraj minute (00, 15, 30, 45)
const generateMinutes = () => {
  return ['00', '15', '30', '45'];
};

const DelovniNalogHeader: React.FC<{
  stevilkaNaloga?: number;
  onZakleniUI?: (zaklenjeno: boolean) => void;
  onIzbrisiNalog?: () => void;
}> = ({ stevilkaNaloga = 65000, onZakleniUI, onIzbrisiNalog }) => {
  const [datumOdprtja] = useState(new Date());
  const [rokDatum, setRokDatum] = useState<string>('');
  const [rokUra, setRokUra] = useState<string>('07');
  const [rokMinuta, setRokMinuta] = useState<string>('00');
  const [tiskZakljucen, setTiskZakljucen] = useState(false);
  const [dobavljeno, setDobavljeno] = useState(false);
  const [zaklenjeno, setZaklenjeno] = useState(false);
  const [geslo, setGeslo] = useState('');
  const [gesloNapaka, setGesloNapaka] = useState('');
  const [prikazujIzbris, setPrikazujIzbris] = useState(false);
  const [gesloIzbris, setGesloIzbris] = useState('');
  const [gesloIzbrisNapaka, setGesloIzbrisNapaka] = useState('');

  const handleRokDatumChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const datum = e.target.value;
    setRokDatum(datum);
    
    if (datum) {
      const date = new Date(datum);
      if (isWeekend(date) || isSlovenskiPraznik(date)) {
        alert('Opozorilo: Izbran datum je vikend ali praznik!');
      }
    }
  };

  const handleDobavljenoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setDobavljeno(true);
      setZaklenjeno(true);
      if (onZakleniUI) onZakleniUI(true);
    } else {
      setDobavljeno(false);
      setZaklenjeno(false);
      if (onZakleniUI) onZakleniUI(false);
    }
  };

  const handleOdkleni = () => {
    if (geslo === '7474') {
      setZaklenjeno(false);
      setDobavljeno(false);
      setGeslo('');
      setGesloNapaka('');
      if (onZakleniUI) onZakleniUI(false);
    } else {
      setGesloNapaka('Napačno geslo!');
    }
  };

  const handleIzbrisiNalog = () => {
    if (gesloIzbris === '7474') {
      if (onIzbrisiNalog) {
        onIzbrisiNalog();
      }
      setPrikazujIzbris(false);
      setGesloIzbris('');
      setGesloIzbrisNapaka('');
    } else {
      setGesloIzbrisNapaka('Napačno geslo!');
    }
  };

  // Formatiraj prikaz roka izdelave
  const formatRokIzdelave = () => {
    if (!rokDatum) return '';
    const date = new Date(rokDatum);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return `${day}.${month}.${year} ${rokUra}:${rokMinuta}`;
  };

  return (
    <div className="flex flex-row items-start justify-end gap-6 p-4 border-b bg-gray-50">
      <div className="flex flex-col items-start">
        <span className="font-bold text-lg">Delovni nalog št.: {stevilkaNaloga}</span>
        <span className="text-sm text-gray-500">
          {formatDateToSlovenian(datumOdprtja)}
        </span>
      </div>
      <div className="flex flex-col items-start">
        <label className="text-sm font-medium">Rok izdelave</label>
        <div className="flex gap-2 items-center">
          <input
            type="date"
            className="border rounded px-2 py-1"
            value={rokDatum}
            onChange={handleRokDatumChange}
            disabled={zaklenjeno}
            min={new Date().toISOString().split('T')[0]}
          />
          <select
            value={rokUra}
            onChange={(e) => setRokUra(e.target.value)}
            disabled={zaklenjeno}
            className="border rounded px-2 py-1"
          >
            {generateHours().map(hour => (
              <option key={hour} value={hour}>{hour}</option>
            ))}
          </select>
          <span className="text-gray-500">:</span>
          <select
            value={rokMinuta}
            onChange={(e) => setRokMinuta(e.target.value)}
            disabled={zaklenjeno}
            className="border rounded px-2 py-1"
          >
            {generateMinutes().map(minute => (
              <option key={minute} value={minute}>{minute}</option>
            ))}
          </select>
        </div>
        <span className="text-xs text-gray-400">(pon–pet, 07:00–15:00, brez praznikov)</span>
        {rokDatum && (
          <span className="text-xs text-blue-600 mt-1">
            Rok: {formatRokIzdelave()}
          </span>
        )}
      </div>
      <div className="flex flex-col items-center justify-center">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={tiskZakljucen}
            onChange={e => setTiskZakljucen(e.target.checked)}
            disabled={zaklenjeno}
          />
          Tisk zaključen
        </label>
      </div>
      <div className="flex flex-col items-center justify-center gap-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={dobavljeno}
            onChange={handleDobavljenoChange}
            disabled={zaklenjeno}
          />
          Dobavljeno
        </label>
        {zaklenjeno && (
          <div className="flex flex-col items-center">
            <input
              type="password"
              placeholder="Geslo za odklep"
              className="border rounded px-2 py-1 text-xs"
              value={geslo}
              onChange={e => setGeslo(e.target.value)}
            />
            <button
              className="mt-1 px-2 py-1 bg-blue-500 text-white rounded text-xs"
              onClick={handleOdkleni}
            >
              Odkleni
            </button>
            {gesloNapaka && <span className="text-red-500 text-xs">{gesloNapaka}</span>}
          </div>
        )}
      </div>
      <div className="flex flex-col items-center justify-center">
        <button
          onClick={() => setPrikazujIzbris(true)}
          disabled={zaklenjeno}
          className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:bg-gray-400"
        >
          Izbriši nalog
        </button>
        {prikazujIzbris && (
          <div className="mt-2 flex flex-col items-center">
            <input
              type="password"
              placeholder="Geslo za izbris (7474)"
              className="border rounded px-2 py-1 text-xs"
              value={gesloIzbris}
              onChange={e => setGesloIzbris(e.target.value)}
            />
            <div className="flex gap-1 mt-1">
              <button
                className="px-2 py-1 bg-red-600 text-white rounded text-xs"
                onClick={handleIzbrisiNalog}
              >
                Potrdi
              </button>
              <button
                className="px-2 py-1 bg-gray-500 text-white rounded text-xs"
                onClick={() => {
                  setPrikazujIzbris(false);
                  setGesloIzbris('');
                  setGesloIzbrisNapaka('');
                }}
              >
                Prekliči
              </button>
            </div>
            {gesloIzbrisNapaka && <span className="text-red-500 text-xs">{gesloIzbrisNapaka}</span>}
          </div>
        )}
      </div>
    </div>
  );
};

export default DelovniNalogHeader; 