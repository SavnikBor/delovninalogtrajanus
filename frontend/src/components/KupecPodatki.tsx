import React from 'react';
import type { Kupec } from './kupci.types';

interface Props {
  kupec: KupecData | null;
}

export default function KupecPodatki({ kupec }: Props) {
  if (!kupec) return null;

  return (
    <div className="border p-3 bg-gray-50 mt-4">
      <p><strong>Naziv:</strong> {kupec.Naziv}</p>
      <p><strong>Naslov:</strong> {kupec.Naslov}, {kupec.Posta} {kupec.Kraj}</p>
      <p><strong>Telefon:</strong> {kupec.Telefon}</p>
      <p><strong>ID za DDV:</strong> {kupec.IDzaDDV}</p>
    </div>
  );
}
