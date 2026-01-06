import React from 'react';

interface Props {
  rokIzdelave: string;
  setRokIzdelave: (value: string) => void;
  datumOdprtja: string;
}

export default function RokIzdelavePicker({
  rokIzdelave,
  setRokIzdelave,
  datumOdprtja,
}: Props) {
  return (
    <div>
      <label>Rok izdelave:</label>
      <input
        type="datetime-local"
        className="border p-2 w-full"
        value={rokIzdelave}
        onChange={(e) => setRokIzdelave(e.target.value)}
      />
      <p className="text-sm text-gray-600 mt-1">
        Datum odprtja: <strong>{datumOdprtja}</strong>
      </p>
    </div>
  );
}
