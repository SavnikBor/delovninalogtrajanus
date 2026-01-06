// src/components/DelovniNalogForm.tsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import KupecSelect from './KupecSelect';
import KupecPodatki from './KupecPodatki';
import KontaktInEmail from './KontaktInEmail';
import RokIzdelavePicker from './RokIzdelavePicker';
import KomentarPolje from './KomentarPolje';
import ProduktPlaceholder from './ProduktPlaceholder';
import DodelavePlaceholder from './DodelavePlaceholder';
import RezultatNaloga from './RezultatNaloga';
import type { Kupec } from './kupci.types';

const PRAZNIKI = [
  new Date(2025, 0, 1), new Date(2025, 3, 27),
  new Date(2025, 4, 1), new Date(2025, 4, 2),
  new Date(2025, 5, 25), new Date(2025, 7, 15),
  new Date(2025, 9, 31), new Date(2025, 10, 1),
  new Date(2025, 11, 25), new Date(2025, 11, 26),
];

export default function DelovniNalogForm() {
  const [kupci, setKupci] = useState<Kupec[]>([]);
  const [selectedKupec, setSelectedKupec] = useState<Kupec | null>(null);
  const [kontaktnaOseba, setKontaktnaOseba] = useState('');
  const [email, setEmail] = useState('');
  const [komentar, setKomentar] = useState('');
  const [rokIzdelave, setRokIzdelave] = useState('');
  const [rezultat, setRezultat] = useState<null | { stevilkaNaloga: number | string; datumOdprtja: string }>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    axios.get<Kupec[]>('http://localhost:5000/api/kupec').then(res => {
      setKupci(res.data);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKupec) return alert('Izberi kupca');
    setLoading(true);
    setRezultat(null);

    const body = {
      kupecID: selectedKupec.KupecID,
      kontaktnaOseba,
      email,
      komentar,
      rokIzdelave,
    };

    try {
      const res = await axios.post('http://localhost:5000/api/delovni-nalog', body);
      setRezultat({
        stevilkaNaloga: res.data.stevilkaNaloga,
        datumOdprtja: res.data.datumOdprtja,
      });
    } catch (err) {
      alert('Napaka pri shranjevanju delovnega naloga.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h2 className="text-xl font-bold mb-4">Nov delovni nalog</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <KupecSelect kupci={kupci} onSelect={setSelectedKupec} />
        <KupecPodatki kupec={selectedKupec} />
        <KontaktInEmail kontaktnaOseba={kontaktnaOseba} setKontaktnaOseba={setKontaktnaOseba} email={email} setEmail={setEmail} />
        <RokIzdelavePicker value={rokIzdelave} onChange={setRokIzdelave} prazniki={PRAZNIKI} />
        <ProduktPlaceholder />
        <KomentarPolje komentar={komentar} setKomentar={setKomentar} />
        <DodelavePlaceholder />
        <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded" disabled={loading}>
          {loading ? 'Shranjujem...' : 'Shrani delovni nalog'}
        </button>
      </form>
      {rezultat && (
        <RezultatNaloga stevilkaNaloga={rezultat.stevilkaNaloga} datumOdprtja={rezultat.datumOdprtja} />
      )}
    </div>
  );
}
