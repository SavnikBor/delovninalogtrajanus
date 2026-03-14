import React, { useEffect, useState, useRef } from 'react';
import * as XLSX from 'xlsx';

type Kupec = { KupecID: number; Naziv: string };

type IzsekovalnoOrodje = {
  IzsekovalnoOrodjeID: number;
  ZaporednaStevilka: number;
  StevilkaNaloga: number;
  Opis: string | null;
  VelikostProdukta: string | null;
  LetoIzdelave: number | null;
  StrankaNaziv: string | null;
  KupecID: number | null;
  KupecNaziv?: string | null;
  Komentar: string | null;
};

const IzsekovalnaOrodja: React.FC = () => {
  const [orodja, setOrodja] = useState<IzsekovalnoOrodje[]>([]);
  const [kupci, setKupci] = useState<Kupec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [nextZaporedna, setNextZaporedna] = useState<number>(1);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    ZaporednaStevilka: '',
    StevilkaNaloga: '',
    Opis: '',
    VelikostProdukta: '',
    LetoIzdelave: '',
    StrankaNaziv: '',
    KupecID: '' as string | number,
    rocniVnos: false,
    Komentar: '',
  });

  const loadOrodja = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/izsekovalna-orodja');
      if (res.status === 503) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || 'Tabela še ne obstaja. Zaženi migracijo backend/sql/20260314_izsekovalna_orodja.sql');
        setOrodja([]);
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setOrodja(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || 'Napaka pri nalaganju.');
      setOrodja([]);
    } finally {
      setLoading(false);
    }
  };

  const loadNextZaporedna = async () => {
    try {
      const res = await fetch('/api/izsekovalna-orodja/next-zaporedna');
      if (res.ok) {
        const data = await res.json();
        setNextZaporedna(Number(data?.next) || 1);
      }
    } catch {}
  };

  const loadKupci = async () => {
    try {
      const res = await fetch('/api/kupec');
      if (res.ok) {
        const data = await res.json();
        setKupci(Array.isArray(data) ? data.map((r: any) => ({ KupecID: r.KupecID, Naziv: r.Naziv || '' })) : []);
      }
    } catch {}
  };

  useEffect(() => {
    loadOrodja();
    loadKupci();
  }, []);

  useEffect(() => {
    if (showAddForm || editingId === null) loadNextZaporedna();
  }, [showAddForm, editingId]);

  const resetForm = () => {
    setForm({
      ZaporednaStevilka: String(nextZaporedna),
      StevilkaNaloga: '',
      Opis: '',
      VelikostProdukta: '',
      LetoIzdelave: '',
      StrankaNaziv: '',
      KupecID: '',
      rocniVnos: false,
      Komentar: '',
    });
    setShowAddForm(false);
    setEditingId(null);
  };

  const openAddForm = async () => {
    const next = await fetch('/api/izsekovalna-orodja/next-zaporedna')
      .then(r => r.ok ? r.json() : { next: 1 })
      .then(d => Number(d?.next) || 1)
      .catch(() => nextZaporedna);
    setNextZaporedna(next);
    setForm({
      ZaporednaStevilka: String(next),
      StevilkaNaloga: '',
      Opis: '',
      VelikostProdukta: '',
      LetoIzdelave: new Date().getFullYear().toString(),
      StrankaNaziv: '',
      KupecID: '',
      rocniVnos: false,
      Komentar: '',
    });
    setShowAddForm(true);
    setEditingId(null);
  };

  const openEditForm = (o: IzsekovalnoOrodje) => {
    setForm({
      ZaporednaStevilka: String(o.ZaporednaStevilka),
      StevilkaNaloga: String(o.StevilkaNaloga),
      Opis: o.Opis || '',
      VelikostProdukta: o.VelikostProdukta || '',
      LetoIzdelave: o.LetoIzdelave ? String(o.LetoIzdelave) : '',
      StrankaNaziv: o.StrankaNaziv || '',
      KupecID: o.KupecID || '',
      rocniVnos: !o.KupecID,
      Komentar: o.Komentar || '',
    });
    setEditingId(o.IzsekovalnoOrodjeID);
    setShowAddForm(false);
  };

  const handleShraniNovo = async () => {
    const zap = parseInt(form.ZaporednaStevilka, 10);
    const stNal = parseInt(form.StevilkaNaloga, 10);
    if (!Number.isFinite(zap) || zap < 1) {
      setToast('Zaporedna številka je obvezna.');
      return;
    }
    if (!Number.isFinite(stNal) || stNal < 1) {
      setToast('Številka naloga je obvezna.');
      return;
    }
    const strankaNaziv = form.rocniVnos ? form.StrankaNaziv.trim() : (form.KupecID ? kupci.find(k => k.KupecID === Number(form.KupecID))?.Naziv || form.StrankaNaziv : form.StrankaNaziv).trim() || null;
    const kupecId = form.rocniVnos ? null : (form.KupecID ? Number(form.KupecID) : null);
    try {
      const res = await fetch('/api/izsekovalna-orodja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ZaporednaStevilka: zap,
          StevilkaNaloga: stNal,
          Opis: form.Opis.trim() || null,
          VelikostProdukta: form.VelikostProdukta.trim() || null,
          LetoIzdelave: form.LetoIzdelave ? parseInt(form.LetoIzdelave, 10) : null,
          StrankaNaziv: strankaNaziv,
          KupecID: kupecId,
          Komentar: form.Komentar.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Shranjevanje ni uspelo.');
      setToast('Orodje dodano.');
      resetForm();
      loadOrodja();
      loadNextZaporedna();
    } catch (e: any) {
      setToast(e?.message || 'Napaka.');
    }
    setTimeout(() => setToast(null), 2000);
  };

  const handleShraniUrejanje = async () => {
    if (!editingId) return;
    const zap = parseInt(form.ZaporednaStevilka, 10);
    const stNal = parseInt(form.StevilkaNaloga, 10);
    if (!Number.isFinite(zap) || zap < 1 || !Number.isFinite(stNal) || stNal < 1) {
      setToast('Zaporedna številka in številka naloga sta obvezni.');
      return;
    }
    const strankaNaziv = form.rocniVnos ? form.StrankaNaziv.trim() : (form.KupecID ? kupci.find(k => k.KupecID === Number(form.KupecID))?.Naziv || form.StrankaNaziv : form.StrankaNaziv).trim() || null;
    const kupecId = form.rocniVnos ? null : (form.KupecID ? Number(form.KupecID) : null);
    try {
      const res = await fetch(`/api/izsekovalna-orodja/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ZaporednaStevilka: zap,
          StevilkaNaloga: stNal,
          Opis: form.Opis.trim() || null,
          VelikostProdukta: form.VelikostProdukta.trim() || null,
          LetoIzdelave: form.LetoIzdelave ? parseInt(form.LetoIzdelave, 10) : null,
          StrankaNaziv: strankaNaziv,
          KupecID: kupecId,
          Komentar: form.Komentar.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Posodobitev ni uspela.');
      setToast('Orodje posodobljeno.');
      resetForm();
      loadOrodja();
    } catch (e: any) {
      setToast(e?.message || 'Napaka.');
    }
    setTimeout(() => setToast(null), 2000);
  };

  const handleIzbris = async (id: number) => {
    try {
      const res = await fetch(`/api/izsekovalna-orodja/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Brisanje ni uspelo.');
      setToast('Orodje izbrisano.');
      setDeleteConfirmId(null);
      loadOrodja();
      loadNextZaporedna();
    } catch (e: any) {
      setToast(e?.message || 'Napaka pri brisanju.');
    }
    setTimeout(() => setToast(null), 2000);
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = ev.target?.result;
        if (!data) return;
        const wb = XLSX.read(data, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (rows.length < 2) {
          setToast('Excel datoteka je prazna ali nima vrstic.');
          return;
        }
        const headers = rows[0] as string[];
        const mapCol = (names: string[]) => {
          const idx = headers.findIndex(h => names.some(n => String(h || '').toLowerCase().includes(n.toLowerCase())));
          return idx >= 0 ? idx : -1;
        };
        const colIme = mapCol(['ime štance', 'štance', 'nalog', 'zaporedna']);
        const colOpis = mapCol(['opis']);
        const colVelikost = mapCol(['velikost', 'dim', 'produkt']);
        const colLeto = mapCol(['leto', 'izdelav']);
        const colStranka = mapCol(['stranka', 'kupec']);
        const colKomentar = mapCol(['komentar']);
        const toSend: Record<string, any>[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i] as any[];
          const imeVal = colIme >= 0 ? row[colIme] : '';
          const imeStr = String(imeVal || '').trim();
          const parts = imeStr.split(/\s+/).filter(Boolean);
          const seqMatch = imeStr.match(/^(\d+)/);
          const zaporedna = seqMatch ? parseInt(seqMatch[1], 10) : null;
          const nalogPart = parts.find((p: string) => /^\d{4,}$/.test(p)) || parts[parts.length - 1];
          const stevilkaNaloga = nalogPart ? parseInt(String(nalogPart), 10) : null;
          toSend.push({
            ZaporednaStevilka: zaporedna,
            StevilkaNaloga: stevilkaNaloga,
            Opis: colOpis >= 0 ? row[colOpis] : '',
            VelikostProdukta: colVelikost >= 0 ? row[colVelikost] : '',
            LetoIzdelave: colLeto >= 0 ? row[colLeto] : '',
            StrankaNaziv: colStranka >= 0 ? row[colStranka] : '',
            Komentar: colKomentar >= 0 ? row[colKomentar] : '',
          });
        }
        const valid = toSend.filter(r => r.ZaporednaStevilka && r.StevilkaNaloga);
        if (valid.length === 0) {
          setToast('Ni veljavnih vrstic. Preveri stolpce (Ime štance/nalog, Opis, Velikost, Leto, Stranka, Komentar).');
          return;
        }
        const res = await fetch('/api/izsekovalna-orodja/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: valid }),
        });
        const importRes = await res.json().catch(() => ({}));
        if (!res.ok || !importRes.ok) throw new Error(importRes?.error || 'Uvoz ni uspel.');
        setToast(`Uvoženo: ${importRes.inserted || 0}, preskočeno: ${importRes.skipped || 0}`);
        loadOrodja();
        loadNextZaporedna();
      } catch (err: any) {
        setToast(err?.message || 'Napaka pri uvozu.');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setToast(null), 3000);
    };
    reader.readAsBinaryString(file);
  };

  const gaps = React.useMemo(() => {
    const used = new Set(orodja.map(o => o.ZaporednaStevilka));
    const max = Math.max(0, ...orodja.map(o => o.ZaporednaStevilka));
    const g: number[] = [];
    for (let i = 1; i <= max; i++) if (!used.has(i)) g.push(i);
    return g;
  }, [orodja]);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold text-gray-900">Izsekovalna orodja</h1>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleExcelImport}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-amber-600 text-white rounded-md hover:bg-amber-700 text-sm font-medium"
          >
            📥 Uvozi iz Excel
          </button>
          <button
            type="button"
            onClick={openAddForm}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
          >
            ➕ Dodaj orodje
          </button>
        </div>
      </div>

      {toast && (
        <div className="mb-3 px-3 py-2 bg-blue-100 text-blue-800 rounded text-sm">{toast}</div>
      )}

      {error && (
        <div className="mb-3 px-3 py-2 bg-amber-100 text-amber-800 rounded text-sm">{error}</div>
      )}

      {(showAddForm || editingId !== null) && (
        <div className="mb-4 p-4 bg-white border rounded-lg shadow-sm">
          <h2 className="text-lg font-semibold mb-3">{editingId ? 'Uredi orodje' : 'Dodaj novo orodje'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zaporedna številka</label>
              <select
                value={form.ZaporednaStevilka}
                onChange={(e) => setForm(f => ({ ...f, ZaporednaStevilka: e.target.value }))}
                className="w-full px-2 py-1.5 border rounded"
              >
                {gaps.map(g => (
                  <option key={g} value={g}>Luknja {g}</option>
                ))}
                <option value={String(nextZaporedna)}>Na konec ({nextZaporedna})</option>
                {editingId && !gaps.includes(parseInt(form.ZaporednaStevilka, 10)) && parseInt(form.ZaporednaStevilka, 10) !== nextZaporedna && (
                  <option value={form.ZaporednaStevilka}>Trenutna ({form.ZaporednaStevilka})</option>
                )}
              </select>
              <p className="text-xs text-gray-500 mt-0.5">Izberi luknjo ali dodaj na konec</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Številka naloga</label>
              <input
                type="number"
                value={form.StevilkaNaloga}
                onChange={(e) => setForm(f => ({ ...f, StevilkaNaloga: e.target.value }))}
                placeholder="npr. 67512"
                className="w-full px-2 py-1.5 border rounded"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Opis</label>
              <input
                type="text"
                value={form.Opis}
                onChange={(e) => setForm(f => ({ ...f, Opis: e.target.value }))}
                placeholder="npr. Skatla za praline 9x DNO"
                className="w-full px-2 py-1.5 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Velikost končnega produkta (notr. dim.)</label>
              <input
                type="text"
                value={form.VelikostProdukta}
                onChange={(e) => setForm(f => ({ ...f, VelikostProdukta: e.target.value }))}
                placeholder="npr. 108x108x32 mm"
                className="w-full px-2 py-1.5 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Leto izdelave</label>
              <input
                type="number"
                value={form.LetoIzdelave}
                onChange={(e) => setForm(f => ({ ...f, LetoIzdelave: e.target.value }))}
                placeholder="npr. 2024"
                className="w-full px-2 py-1.5 border rounded"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Stranka</label>
              <div className="flex items-center gap-2 mb-1">
                <input
                  type="checkbox"
                  checked={form.rocniVnos}
                  onChange={(e) => setForm(f => ({ ...f, rocniVnos: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm">Ročni vnos (če stranke ni v bazi)</span>
              </div>
              {form.rocniVnos ? (
                <input
                  type="text"
                  value={form.StrankaNaziv}
                  onChange={(e) => setForm(f => ({ ...f, StrankaNaziv: e.target.value }))}
                  placeholder="Ime stranke"
                  className="w-full px-2 py-1.5 border rounded"
                />
              ) : (
                <select
                  value={form.KupecID}
                  onChange={(e) => {
                    const id = e.target.value;
                    const k = kupci.find(kk => kk.KupecID === Number(id));
                    setForm(f => ({ ...f, KupecID: id, StrankaNaziv: k?.Naziv || '' }));
                  }}
                  className="w-full px-2 py-1.5 border rounded"
                >
                  <option value="">-- Izberi stranko --</option>
                  {kupci.map(k => (
                    <option key={k.KupecID} value={k.KupecID}>{k.Naziv}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Komentar</label>
              <input
                type="text"
                value={form.Komentar}
                onChange={(e) => setForm(f => ({ ...f, Komentar: e.target.value }))}
                placeholder="Dodaten komentar"
                className="w-full px-2 py-1.5 border rounded"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={editingId ? handleShraniUrejanje : handleShraniNovo}
              className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700"
            >
              {editingId ? 'Shrani spremembe' : 'Dodaj'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-1.5 bg-gray-200 rounded hover:bg-gray-300"
            >
              Prekliči
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-gray-500">Nalaganje...</div>
      ) : (
        <div className="overflow-x-auto border rounded-lg bg-white shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Št. / Nalog</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Opis</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Velikost</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Leto</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Stranka</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Komentar</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Akcije</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orodja.map((o) => (
                <tr key={o.IzsekovalnoOrodjeID} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-sm font-medium">{o.ZaporednaStevilka} {o.StevilkaNaloga}</td>
                  <td className="px-3 py-2 text-sm">{o.Opis || '—'}</td>
                  <td className="px-3 py-2 text-sm">{o.VelikostProdukta || '—'}</td>
                  <td className="px-3 py-2 text-sm">{o.LetoIzdelave || '—'}</td>
                  <td className="px-3 py-2 text-sm">{o.StrankaNaziv || o.KupecNaziv || '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-600">{o.Komentar || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => openEditForm(o)}
                      className="text-blue-600 hover:text-blue-800 mr-2"
                    >
                      Uredi
                    </button>
                    {deleteConfirmId === o.IzsekovalnoOrodjeID ? (
                      <>
                        <span className="text-red-600 text-sm mr-1">Potrdi?</span>
                        <button
                          type="button"
                          onClick={() => handleIzbris(o.IzsekovalnoOrodjeID)}
                          className="text-red-600 hover:text-red-800 font-medium"
                        >
                          Da
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          className="text-gray-600 hover:text-gray-800 ml-1"
                        >
                          Ne
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(o.IzsekovalnoOrodjeID)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Izbriši
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orodja.length === 0 && !loading && (
            <div className="px-4 py-8 text-center text-gray-500">
              Ni vpisanih orodij. Dodaj novo ali uvozi iz Excel.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default IzsekovalnaOrodja;
