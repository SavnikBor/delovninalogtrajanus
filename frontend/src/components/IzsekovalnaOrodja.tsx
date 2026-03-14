import React, { useEffect, useMemo, useRef, useState } from 'react';

type KupecMin = { KupecID: number; Naziv: string };

type IzsekovalnoOrodje = {
  OrodjeID: number;
  ZaporednaStevilka: number;
  StevilkaNaloga: number | null;
  Opis: string;
  VelikostKoncnegaProdukta: string;
  LetoIzdelave: number | null;
  KupecID: number | null;
  StrankaNaziv: string;
  Komentar: string;
  CreatedAt?: string | null;
  UpdatedAt?: string | null;
};

function normalizeTool(r: any): IzsekovalnoOrodje {
  return {
    OrodjeID: Number(r?.OrodjeID ?? r?.orodjeID ?? r?.id ?? 0) || 0,
    ZaporednaStevilka: Number(r?.ZaporednaStevilka ?? r?.zaporednaStevilka ?? 0) || 0,
    StevilkaNaloga: r?.StevilkaNaloga == null ? null : (Number(r.StevilkaNaloga) || null),
    Opis: String(r?.Opis ?? ''),
    VelikostKoncnegaProdukta: String(r?.VelikostKoncnegaProdukta ?? ''),
    LetoIzdelave: r?.LetoIzdelave == null ? null : (Number(r.LetoIzdelave) || null),
    KupecID: r?.KupecID == null ? null : (Number(r.KupecID) || null),
    StrankaNaziv: String(r?.StrankaNaziv ?? ''),
    Komentar: String(r?.Komentar ?? ''),
    CreatedAt: r?.CreatedAt ? String(r.CreatedAt) : null,
    UpdatedAt: r?.UpdatedAt ? String(r.UpdatedAt) : null,
  };
}

type FormState = {
  ZaporednaStevilka: string;
  StevilkaNaloga: string;
  Opis: string;
  VelikostKoncnegaProdukta: string;
  LetoIzdelave: string;
  KupecID: number | null;
  StrankaNaziv: string;
  Komentar: string;
};

const emptyForm: FormState = {
  ZaporednaStevilka: '',
  StevilkaNaloga: '',
  Opis: '',
  VelikostKoncnegaProdukta: '',
  LetoIzdelave: '',
  KupecID: null,
  StrankaNaziv: '',
  Komentar: '',
};

export default function IzsekovalnaOrodja() {
  const [rows, setRows] = useState<IzsekovalnoOrodje[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('');

  const [kupci, setKupci] = useState<KupecMin[]>([]);
  const [kupciLoading, setKupciLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const strankaWrapRef = useRef<HTMLDivElement | null>(null);
  const [strankaDropdownOpen, setStrankaDropdownOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await fetch('/api/izsekovalna-orodja');
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const data = ct.includes('application/json') ? await res.json().catch(() => null) : null;
      if (!res.ok) {
        const msg = (data && (data.error || data.details)) ? String(data.error || data.details) : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      const normalized = (Array.isArray(data) ? data : []).map(normalizeTool);
      setRows(normalized);
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : 'Napaka pri nalaganju.');
    } finally {
      setLoading(false);
    }
  };

  const loadKupci = async () => {
    setKupciLoading(true);
    try {
      const res = await fetch('/api/kupec');
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const normalized: KupecMin[] = (Array.isArray(data) ? data : [])
        .map((r: any) => ({ KupecID: Number(r?.KupecID ?? 0) || 0, Naziv: String(r?.Naziv ?? '') }))
        .filter((k: KupecMin) => k.KupecID > 0 && k.Naziv.trim().length > 0);
      setKupci(normalized);
    } catch {
      // ignore
    } finally {
      setKupciLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadKupci();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 1200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = strankaWrapRef.current;
      if (!el) return;
      if (!el.contains(e.target as any)) setStrankaDropdownOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  const nextSerial = useMemo(() => {
    const mx = (rows || []).reduce((m, r) => Math.max(m, Number(r.ZaporednaStevilka || 0)), 0);
    return (Number.isFinite(mx) ? mx : 0) + 1;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const arr = (rows || []).slice().sort((a, b) => (a.ZaporednaStevilka || 0) - (b.ZaporednaStevilka || 0));
    if (!q) return arr;
    return arr.filter((r) => {
      const hay = [
        r.ZaporednaStevilka,
        r.StevilkaNaloga ?? '',
        r.Opis,
        r.VelikostKoncnegaProdukta,
        r.LetoIzdelave ?? '',
        r.StrankaNaziv,
        r.Komentar,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, filter]);

  const strankaCandidates = useMemo(() => {
    const q = form.StrankaNaziv.trim().toLowerCase();
    if (!q) return [];
    const out = (kupci || []).filter((k) => k.Naziv.toLowerCase().includes(q)).slice(0, 8);
    return out;
  }, [kupci, form.StrankaNaziv]);

  const openAdd = () => {
    setEditId(null);
    setForm({
      ...emptyForm,
      ZaporednaStevilka: String(nextSerial),
    });
    setModalOpen(true);
    setStrankaDropdownOpen(false);
  };

  const openEdit = (r: IzsekovalnoOrodje) => {
    setEditId(r.OrodjeID);
    setForm({
      ZaporednaStevilka: r.ZaporednaStevilka ? String(r.ZaporednaStevilka) : '',
      StevilkaNaloga: r.StevilkaNaloga != null ? String(r.StevilkaNaloga) : '',
      Opis: r.Opis || '',
      VelikostKoncnegaProdukta: r.VelikostKoncnegaProdukta || '',
      LetoIzdelave: r.LetoIzdelave != null ? String(r.LetoIzdelave) : '',
      KupecID: r.KupecID ?? null,
      StrankaNaziv: r.StrankaNaziv || '',
      Komentar: r.Komentar || '',
    });
    setModalOpen(true);
    setStrankaDropdownOpen(false);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditId(null);
    setForm({ ...emptyForm });
    setStrankaDropdownOpen(false);
  };

  const submit = async () => {
    setSaving(true);
    setErr('');
    try {
      const payload: any = {
        ZaporednaStevilka: form.ZaporednaStevilka.trim(),
        StevilkaNaloga: form.StevilkaNaloga.trim(),
        Opis: form.Opis,
        VelikostKoncnegaProdukta: form.VelikostKoncnegaProdukta,
        LetoIzdelave: form.LetoIzdelave.trim(),
        KupecID: form.KupecID,
        StrankaNaziv: form.StrankaNaziv,
        Komentar: form.Komentar,
      };
      const url = editId ? `/api/izsekovalna-orodja/${editId}` : '/api/izsekovalna-orodja';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const data = ct.includes('application/json') ? await res.json().catch(() => null) : null;
      if (!res.ok || !(data && data.ok)) {
        const msg =
          (data && (data.error || data.details)) ? String(data.error || data.details) :
          `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setToast(editId ? 'Shranjeno.' : 'Dodano.');
      closeModal();
      await load();
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : 'Napaka pri shranjevanju.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm('Res izbrišem izsekovalno orodje?')) return;
    setDeleteBusyId(id);
    setErr('');
    try {
      const res = await fetch(`/api/izsekovalna-orodja/${id}`, { method: 'DELETE' });
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const data = ct.includes('application/json') ? await res.json().catch(() => null) : null;
      if (!res.ok || !(data && data.ok)) {
        const msg =
          (data && (data.error || data.details)) ? String(data.error || data.details) :
          `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setToast('Izbrisano.');
      await load();
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : 'Napaka pri brisanju.');
    } finally {
      setDeleteBusyId(null);
    }
  };

  const onStrankaChange = (v: string) => {
    setForm((prev) => ({ ...prev, StrankaNaziv: v, KupecID: null }));
    setStrankaDropdownOpen(true);
  };

  const pickStranka = (k: KupecMin) => {
    setForm((prev) => ({ ...prev, StrankaNaziv: k.Naziv, KupecID: k.KupecID }));
    setStrankaDropdownOpen(false);
  };

  const headerRight = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300 text-sm"
        onClick={load}
        disabled={loading}
        title="Osveži"
      >
        Osveži
      </button>
      <button
        type="button"
        className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm"
        onClick={openAdd}
      >
        ➕ Dodaj
      </button>
    </div>
  );

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-2xl font-bold">Izsekovalna orodja</div>
          <div className="text-sm text-gray-600">
            Seznam izsekovalnih orodij (dodaj/uredi/izbriši). Brisanje ne renumerira obstoječih vrstic (luknje ostanejo).
          </div>
        </div>
        {headerRight}
      </div>

      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter</label>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="Išči po številki, opisu, stranki..."
            />
          </div>
          <div className="text-sm text-gray-600">
            {loading ? 'Nalagam…' : `Vrstic: ${filtered.length}`}
          </div>
        </div>

        {err && <div className="text-sm text-red-600 mb-3">{err}</div>}

        <div className="overflow-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b">
              <tr>
                <th className="text-left p-2">Zap. št.</th>
                <th className="text-left p-2">Del. nalog</th>
                <th className="text-left p-2">Opis</th>
                <th className="text-left p-2">Velikost</th>
                <th className="text-left p-2">Leto</th>
                <th className="text-left p-2">Stranka</th>
                <th className="text-left p-2">Komentar</th>
                <th className="text-right p-2">Akcije</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.OrodjeID} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="p-2 font-semibold whitespace-nowrap">{r.ZaporednaStevilka}</td>
                  <td className="p-2 whitespace-nowrap">{r.StevilkaNaloga ?? ''}</td>
                  <td className="p-2 min-w-[280px]">{r.Opis}</td>
                  <td className="p-2 whitespace-nowrap">{r.VelikostKoncnegaProdukta}</td>
                  <td className="p-2 whitespace-nowrap">{r.LetoIzdelave ?? ''}</td>
                  <td className="p-2 min-w-[220px]">
                    {r.StrankaNaziv}
                    {r.KupecID ? <span className="text-xs text-gray-500"> (SQL)</span> : null}
                  </td>
                  <td className="p-2 min-w-[240px]">{r.Komentar}</td>
                  <td className="p-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 mr-2"
                      onClick={() => openEdit(r)}
                    >
                      Uredi
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                      onClick={() => remove(r.OrodjeID)}
                      disabled={deleteBusyId === r.OrodjeID}
                    >
                      {deleteBusyId === r.OrodjeID ? 'Brišem…' : 'Izbriši'}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className="p-3 text-gray-600" colSpan={8}>
                    Ni podatkov.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {toast && <div className="mt-3 text-sm text-green-700">{toast}</div>}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg w-[92vw] max-w-3xl p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-lg font-bold">{editId ? 'Uredi orodje' : 'Dodaj orodje'}</div>
              <button
                type="button"
                className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                onClick={closeModal}
                disabled={saving}
              >
                Zapri
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zaporedna številka *</label>
                <input
                  value={form.ZaporednaStevilka}
                  onChange={(e) => setForm((p) => ({ ...p, ZaporednaStevilka: e.target.value }))}
                  className="w-full border rounded px-3 py-2"
                  inputMode="numeric"
                />
                <div className="text-xs text-gray-500 mt-1">Privzeto se doda na konec: {nextSerial}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Številka delovnega naloga</label>
                <input
                  value={form.StevilkaNaloga}
                  onChange={(e) => setForm((p) => ({ ...p, StevilkaNaloga: e.target.value }))}
                  className="w-full border rounded px-3 py-2"
                  inputMode="numeric"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Opis</label>
                <input
                  value={form.Opis}
                  onChange={(e) => setForm((p) => ({ ...p, Opis: e.target.value }))}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Velikost končnega produkta</label>
                <input
                  value={form.VelikostKoncnegaProdukta}
                  onChange={(e) => setForm((p) => ({ ...p, VelikostKoncnegaProdukta: e.target.value }))}
                  className="w-full border rounded px-3 py-2"
                  placeholder='npr. "190x180x32 mm"'
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Leto izdelave</label>
                <input
                  value={form.LetoIzdelave}
                  onChange={(e) => setForm((p) => ({ ...p, LetoIzdelave: e.target.value }))}
                  className="w-full border rounded px-3 py-2"
                  inputMode="numeric"
                  placeholder="npr. 2024"
                />
              </div>

              <div className="md:col-span-2" ref={strankaWrapRef}>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stranka</label>
                <input
                  value={form.StrankaNaziv}
                  onChange={(e) => onStrankaChange(e.target.value)}
                  onFocus={() => setStrankaDropdownOpen(true)}
                  className="w-full border rounded px-3 py-2"
                  placeholder={kupciLoading ? 'Nalaganje strank…' : 'Vpiši ali izberi iz SQL'}
                />
                <div className="mt-1 text-xs text-gray-500">
                  {form.KupecID ? `Izbrano iz SQL (KupecID: ${form.KupecID}).` : 'Ročni vnos.'}
                </div>
                {strankaDropdownOpen && form.StrankaNaziv.trim().length > 0 && (
                  <div className="relative">
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-56 overflow-y-auto">
                      {strankaCandidates.map((k) => (
                        <button
                          key={k.KupecID}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                          onClick={() => pickStranka(k)}
                        >
                          <div className="font-medium">{k.Naziv}</div>
                          <div className="text-xs text-gray-500">KupecID: {k.KupecID}</div>
                        </button>
                      ))}
                      {strankaCandidates.length === 0 && (
                        <div className="px-3 py-2 text-sm text-gray-500">
                          Ni zadetkov v SQL (lahko nadaljuješ z ročnim vnosom).
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Komentar</label>
                <textarea
                  value={form.Komentar}
                  onChange={(e) => setForm((p) => ({ ...p, Komentar: e.target.value }))}
                  className="w-full border rounded px-3 py-2 min-h-[90px]"
                />
              </div>
            </div>

            {err && <div className="text-sm text-red-600 mt-3">{err}</div>}

            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300"
                onClick={closeModal}
                disabled={saving}
              >
                Prekliči
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={submit}
                disabled={saving || form.ZaporednaStevilka.trim().length === 0}
              >
                {saving ? 'Shranjujem…' : 'Shrani'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

