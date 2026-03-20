import React, { useState, useEffect } from 'react';

interface KomentarPodatki {
  komentar: string;
}

interface KomentarPoljeProps {
  disabled?: boolean;
  zakljucen?: boolean;
  onKomentarChange?: (komentar: KomentarPodatki) => void;
  komentarPodatki?: KomentarPodatki;
  dobavljeno?: boolean;
}

const KomentarPolje: React.FC<KomentarPoljeProps> = ({ disabled = false, zakljucen = false, onKomentarChange, komentarPodatki, dobavljeno }) => {
  const prazniPodatki: KomentarPodatki = { komentar: '' };
  const podatki = { ...prazniPodatki, ...(komentarPodatki || {}) };

  const handleKomentarChange = (vrednost: string) => {
    if (onKomentarChange) {
      onKomentarChange({ ...podatki, komentar: vrednost });
    }
  };

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-bold text-gray-900">Komentar</h2>

      <div className={`p-3 border rounded-lg shadow-sm ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Vnesi komentar *
          </label>
          <textarea
            value={podatki.komentar}
            onChange={(e) => handleKomentarChange(e.target.value)}
            disabled={disabled}
            rows={6}
            required
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
            placeholder="Vnesi komentar za delovni nalog... (obvezno)"
          />
        </div>
      </div>
    </div>
  );
};

export default KomentarPolje;
