import React from 'react';


interface RezultatNalogaProps {
  stevilkaNaloga: number | string;
  datumOdprtja: string;
}

export default function RezultatNaloga({ stevilkaNaloga, datumOdprtja }: RezultatNalogaProps) {
  return (
    <div className="border p-4 mt-4 text-center">
      <div className="mb-2 font-bold">Delovni nalog št. {stevilkaNaloga}</div>
      <div className="mb-2">Datum odprtja: {datumOdprtja}</div>
      <QRCode value={String(stevilkaNaloga)} size={128} />
    </div>
  );
} 