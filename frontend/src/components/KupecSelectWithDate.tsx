import React, { useState, useMemo } from 'react';

export interface Kupec {
  KupecID: number;
  Naziv: string;
}

interface Props {
  kupci: Kupec[];
  onSelect: (kupec: Kupec | null) => void;
  onDateChange?: (isoDate: string) => void; // opcijsko, da se sporoči datum navzven
}

export default function KupecSelectWithDate({ kupci, onSelect, onDateChange }: Props) {
  const [search, setSearch] = useState('');
  const [selectedKupec, setSelectedKupec] = useState<Kupec | null>(null);
  const [date, setDate] = useState<string>(''); // ISO format yyyy-mm-dd

  // Filter kupcev glede na vpisano iskanje (case insensitive)
  const filteredKupci = useMemo(() => {
    const lower = search.toLowerCase();
    return kupci.filter(k => k.Naziv.toLowerCase().includes(lower));
  }, [search, kupci]);

  // Pretvori ISO datum v evropski format dd.mm.yyyy
  const formatDateEU = (isoDate: string) => {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-');
    return `${d}.${m}.${y}`;
  };

  // Ko uporabnik spremeni datum (input type=date vrne ISO yyyy-mm-dd)
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const iso = e.target.value;
    setDate(iso);
    if (onDateChange) onDateChange(iso);
  };

  // Ko izberemo kupca iz dropdowna
  const handleSelectKupec = (kupecID: number) => {
    const kupec = kupci.find(k => k.KupecID === kupecID) || null;
    setSelectedKupec(kupec);
    onSelect(kupec);
    setSearch(kupec?.Naziv ?? '');
  };

  return (
    <div className="max-w-md mx-auto">
      <label className="block font-semibold mb-1" htmlFor="kupecSearch">
        Išči in izberi kupca:
      </label>
      <input
        id="kupecSearch"
        type="text"
        className="w-full p-2 border rounded mb-2"
        placeholder="Vnesi del imena kupca"
        value={search}
        onChange={e => {
          setSearch(e.target.value);
          setSelectedKupec(null);
          onSelect(null);
        }}
      />

      {search && filteredKupci.length > 0 && (
        <ul className="border rounded max-h-40 overflow-auto mb-4 bg-white">
          {filteredKupci.map(k => (
            <li
              key={k.KupecID}
              className="p-2 cursor-pointer hover:bg-blue-100"
              onClick={() => handleSelectKupec(k.KupecID)}
            >
              {k.Naziv}
            </li>
          ))}
        </ul>
      )}

      <label className="block font-semibold mb-1" htmlFor="datumIzbira">
        Izberi rok izdelave (datum):
      </label>
      <input
        id="datumIzbira"
        type="date"
        className="w-full p-2 border rounded"
        value={date}
        onChange={handleDateChange}
      />
      {date && (
        <div className="mt-1 text-gray-600">
          Izbran datum: <strong>{formatDateEU(date)}</strong>
        </div>
      )}
    </div>
  );
}


// -----
// Primer uporabe:

const primerKupci: Kupec[] = [
  { KupecID: 1, Naziv: 'Podjetje A' },
  { KupecID: 2, Naziv: 'Firma B' },
  { KupecID: 3, Naziv: 'Kleparstvo C' },
];

export function PrimerUporabe() {
  const [izbranKupec, setIzbranKupec] = React.useState<Kupec | null>(null);
  const [datum, setDatum] = React.useState<string>('');

  return (
    <div className="p-4 max-w-lg mx-auto">
      <KupecSelectWithDate
        kupci={primerKupci}
        onSelect={setIzbranKupec}
        onDateChange={setDatum}
      />
      <div className="mt-4">
        <strong>Izbran kupec:</strong> {izbranKupec ? izbranKupec.Naziv : '-'}
      </div>
      <div>
        <strong>Izbran datum (ISO):</strong> {datum || '-'}
      </div>
    </div>
  );
}
