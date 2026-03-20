import React, { useEffect } from 'react';

interface Kupec {
  KupecID: number;
  Naziv: string;
  Naslov: string;
  Posta: string;
  Kraj: string;
  Telefon: string;
  Fax: string;
  IDzaDDV: string;
  email?: string;
  narocilnica?: string;
  rocniVnos?: boolean;
  posljiEmail?: boolean;
}

const prazniKupec: Kupec = {
  KupecID: 0,
  Naziv: '',
  Naslov: '',
  Posta: '',
  Kraj: '',
  Telefon: '',
  Fax: '',
  IDzaDDV: '',
  email: '',
  narocilnica: '',
  rocniVnos: false
};

const KupecSelect: React.FC<{
  disabled?: boolean;
  zakljucen?: boolean;
  dobavljeno?: boolean;
  nalogKey?: number | string;
  onKupecChange?: (kupec: Kupec | null) => void;
  kupecPodatki?: Kupec | null;
  kontaktnaOseba?: string;
  onKontaktnaOsebaChange?: (v: string) => void;
  emailError?: string | null;
  emailOdprtjePoslan?: boolean;
  emailZakljucekPoslan?: boolean;
}> = ({ disabled = false, zakljucen = false, dobavljeno = false, nalogKey, onKupecChange, kupecPodatki, kontaktnaOseba = '', onKontaktnaOsebaChange, emailError = null, emailOdprtjePoslan = false, emailZakljucekPoslan = false }) => {
  // Controlled state: vedno vezano na props (merge z defaulti, da vrednosti niso nikoli undefined)
  const kupec = { ...prazniKupec, ...(kupecPodatki || {}) };

  // Naloži kupce iz backend API
  const [kupci, setKupci] = React.useState<Kupec[]>([]);
  const [iskanje, setIskanje] = React.useState('');
  const [prikazujDropdown, setPrikazujDropdown] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [prikaziNovoStranko, setPrikaziNovoStranko] = React.useState(false);
  const [panelMode, setPanelMode] = React.useState<'add' | 'update'>('add');
  const [novaStranka, setNovaStranka] = React.useState<Kupec>({ ...prazniKupec });
  const [shranjevanjeNove, setShranjevanjeNove] = React.useState(false);
  const [sqlFilter, setSqlFilter] = React.useState<Partial<Kupec>>({});
  const [izbranKupecZaUrejanje, setIzbranKupecZaUrejanje] = React.useState<Kupec | null>(null);
  const [urejanjeKupca, setUrejanjeKupca] = React.useState<Kupec>({ ...prazniKupec });
  const [shranjevanjeUrejanja, setShranjevanjeUrejanja] = React.useState(false);
  const [showDeleteModal, setShowDeleteModal] = React.useState(false);
  const [deleteCode, setDeleteCode] = React.useState('');
  const [deleteErr, setDeleteErr] = React.useState('');
  const [deleting, setDeleting] = React.useState(false);
  const deleteInputRef = React.useRef<HTMLInputElement>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  useEffect(() => {
    const naloziKupce = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/kupec');
        if (response.ok) {
          const data = await response.json();
          const normalized: Kupec[] = (Array.isArray(data) ? data : []).map((r: any) => ({
            KupecID: Number(r?.KupecID ?? r?.kupecID ?? 0) || 0,
            Naziv: (r?.Naziv ?? '').toString(),
            Naslov: (r?.Naslov ?? '').toString(),
            Posta: (r?.Posta ?? '').toString(),
            Kraj: (r?.Kraj ?? '').toString(),
            Telefon: (r?.Telefon ?? '').toString(),
            Fax: (r?.Fax ?? '').toString(),
            IDzaDDV: (r?.IDzaDDV ?? '').toString(),
            email: (r?.email ?? r?.Email ?? '').toString(),
          }));
          setKupci(normalized);
        } else {
          console.error('Napaka pri nalaganju kupcev:', response.statusText);
        }
      } catch (error) {
        console.error('Napaka pri povezavi z backend:', error);
      } finally {
        setLoading(false);
      }
    };
    naloziKupce();
  }, []);

  // Ko uporabnik odpre drug delovni nalog, zapri panel za dodajanje/urejanje stranke (da ne ostaja odprt)
  useEffect(() => {
    if (!prikaziNovoStranko) return;
    setPrikaziNovoStranko(false);
    setPanelMode('add');
    setSqlFilter({});
    setIzbranKupecZaUrejanje(null);
    setUrejanjeKupca({ ...prazniKupec });
    setNovaStranka({ ...prazniKupec });
  }, [nalogKey]);

  useEffect(() => {
    if (showDeleteModal) {
      requestAnimationFrame(() => deleteInputRef.current?.focus());
    }
  }, [showDeleteModal]);

  const reloadKupci = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/kupec');
      if (!response.ok) throw new Error(response.statusText);
      const data = await response.json();
      const normalized: Kupec[] = (Array.isArray(data) ? data : []).map((r: any) => ({
        KupecID: Number(r?.KupecID ?? r?.kupecID ?? 0) || 0,
        Naziv: (r?.Naziv ?? '').toString(),
        Naslov: (r?.Naslov ?? '').toString(),
        Posta: (r?.Posta ?? '').toString(),
        Kraj: (r?.Kraj ?? '').toString(),
        Telefon: (r?.Telefon ?? '').toString(),
        Fax: (r?.Fax ?? '').toString(),
        IDzaDDV: (r?.IDzaDDV ?? '').toString(),
        email: (r?.email ?? r?.Email ?? '').toString(),
      }));
      setKupci(normalized);
      return normalized;
    } catch (e) {
      console.error('reloadKupci failed:', e);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Filtriraj kupce glede na iskanje
  const filtriraniKupci = kupci.filter(kupecItem =>
    kupecItem.Naziv && kupecItem.Naziv.toLowerCase().includes(iskanje.toLowerCase())
  );

  // Handlerji za spremembo polj
  const spremeniPolje = (polje: keyof Kupec, vrednost: string | boolean) => {
    if (!onKupecChange) return;
    onKupecChange({ ...kupec, [polje]: vrednost });
  };

  // Izbira kupca iz filtra
  const handleKupecSelect = (kupecIzbira: Kupec) => {
    if (!onKupecChange) return;
    onKupecChange({ ...kupecIzbira, rocniVnos: false });
    setIskanje('');
    setPrikazujDropdown(false);
  };

  // Ročni vnos toggle
  const handleRocniVnosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onKupecChange) return;
    if (e.target.checked) {
      // Preklop na ročni vnos, ohrani trenutne vrednosti ali prazno
      onKupecChange({ ...prazniKupec, rocniVnos: true });
      setIskanje('');
      setPrikazujDropdown(false);
    } else {
      // Preklop nazaj na filter
      onKupecChange({ ...prazniKupec, rocniVnos: false });
      setIskanje('');
      setPrikazujDropdown(false);
    }
  };

  // Iskanje kupca
  const handleIskanjeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIskanje(e.target.value);
    setPrikazujDropdown(e.target.value.length > 0);
    if (e.target.value.length === 0 && onKupecChange) {
      onKupecChange({ ...prazniKupec, rocniVnos: false });
    }
  };

  const handleShraniNovoStranko = async () => {
    if (!novaStranka.Naziv) {
      setToast('Naziv je obvezen.');
      setTimeout(() => setToast(null), 1200);
      return;
    }
    setShranjevanjeNove(true);
    try {
      const res = await fetch('/api/kupec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Naziv: novaStranka.Naziv,
          Naslov: novaStranka.Naslov,
          Posta: novaStranka.Posta,
          Kraj: novaStranka.Kraj,
          Telefon: novaStranka.Telefon,
          Fax: novaStranka.Fax,
          IDzaDDV: novaStranka.IDzaDDV,
          email: novaStranka.email
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data?.error || 'Vnos stranke ni uspel.');
      const vnesena: Kupec = {
        KupecID: data.kupec.KupecID,
        Naziv: data.kupec.Naziv,
        Naslov: data.kupec.Naslov,
        Posta: data.kupec.Posta,
        Kraj: data.kupec.Kraj,
        Telefon: data.kupec.Telefon,
        Fax: data.kupec.Fax,
        IDzaDDV: data.kupec.IDzaDDV,
        email: data.kupec.email
      };
      setKupci(prev => [vnesena, ...prev]);
      if (onKupecChange) onKupecChange({ ...vnesena, rocniVnos: false });
      // Broadcast: posodobi tudi seznam nalogov (kupec snapshot)
      try { window.dispatchEvent(new CustomEvent('kupec-sql-changed', { detail: { ...vnesena, __action: 'insert' } })); } catch {}
      // Reload iz SQL, da je seznam vedno 100% skladen z bazo
      try { await reloadKupci(); } catch {}
      setPrikaziNovoStranko(false);
      setNovaStranka({ ...prazniKupec });
      setToast('Stranka dodana.');
      setTimeout(() => setToast(null), 1200);
    } catch (e: any) {
      console.error(e);
      setToast(e?.message || 'Napaka pri dodajanju.');
      setTimeout(() => setToast(null), 1500);
    } finally {
      setShranjevanjeNove(false);
    }
  };

  const openKupecPanel = (mode: 'add' | 'update') => {
    setPanelMode(mode);
    setPrikaziNovoStranko(true);
    if (mode === 'add') {
      setNovaStranka({ ...prazniKupec });
      setIzbranKupecZaUrejanje(null);
      setUrejanjeKupca({ ...prazniKupec });
    } else {
      setSqlFilter({});
      setIzbranKupecZaUrejanje(null);
      setUrejanjeKupca({ ...prazniKupec });
    }
  };

  const filtriraniSqlKupci = React.useMemo(() => {
    const f = sqlFilter || {};
    const norm = (v: any) => (v ?? '').toString().trim().toLowerCase();
    const naz = norm(f.Naziv);
    const nas = norm(f.Naslov);
    const pos = norm(f.Posta);
    const kra = norm(f.Kraj);
    const tel = norm(f.Telefon);
    const ddv = norm(f.IDzaDDV);
    const eml = norm((f as any).email);
    return (kupci || []).filter((k) => {
      if (naz && !norm(k.Naziv).includes(naz)) return false;
      if (nas && !norm(k.Naslov).includes(nas)) return false;
      if (pos && !norm(k.Posta).includes(pos)) return false;
      if (kra && !norm(k.Kraj).includes(kra)) return false;
      if (tel && !norm(k.Telefon).includes(tel)) return false;
      if (ddv && !norm(k.IDzaDDV).includes(ddv)) return false;
      if (eml && !norm(k.email).includes(eml)) return false;
      return true;
    });
  }, [kupci, sqlFilter]);

  const handleShraniPosodobitevKupca = async () => {
    if (!izbranKupecZaUrejanje?.KupecID) {
      setToast('Najprej izberi kupca iz seznama.');
      setTimeout(() => setToast(null), 1200);
      return;
    }
    if (!urejanjeKupca.Naziv) {
      setToast('Naziv je obvezen.');
      setTimeout(() => setToast(null), 1200);
      return;
    }
    setShranjevanjeUrejanja(true);
    try {
      const res = await fetch(`/api/kupec/${izbranKupecZaUrejanje.KupecID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Naziv: urejanjeKupca.Naziv,
          Naslov: urejanjeKupca.Naslov,
          Posta: urejanjeKupca.Posta,
          Kraj: urejanjeKupca.Kraj,
          Telefon: urejanjeKupca.Telefon,
          Fax: urejanjeKupca.Fax,
          IDzaDDV: urejanjeKupca.IDzaDDV,
          email: urejanjeKupca.email
        })
      });
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const data = ct.includes('application/json') ? await res.json().catch(() => ({} as any)) : null;
      const text = !ct.includes('application/json') ? await res.text().catch(() => '') : '';
      if (!res.ok || !(data && data.ok)) {
        const detail =
          (data && (data.error || data.details)) ||
          (text ? text.slice(0, 250) : '') ||
          `HTTP ${res.status}`;
        throw new Error(typeof detail === 'string' ? detail : 'Posodobitev stranke ni uspela.');
      }

      const row = data.kupec || {};
      const updated: Kupec = {
        KupecID: Number(row?.KupecID ?? izbranKupecZaUrejanje.KupecID) || izbranKupecZaUrejanje.KupecID,
        Naziv: (row?.Naziv ?? urejanjeKupca.Naziv ?? '').toString(),
        Naslov: (row?.Naslov ?? urejanjeKupca.Naslov ?? '').toString(),
        Posta: (row?.Posta ?? urejanjeKupca.Posta ?? '').toString(),
        Kraj: (row?.Kraj ?? urejanjeKupca.Kraj ?? '').toString(),
        Telefon: (row?.Telefon ?? urejanjeKupca.Telefon ?? '').toString(),
        Fax: (row?.Fax ?? urejanjeKupca.Fax ?? '').toString(),
        IDzaDDV: (row?.IDzaDDV ?? urejanjeKupca.IDzaDDV ?? '').toString(),
        email: (row?.Email ?? row?.email ?? urejanjeKupca.email ?? '').toString(),
      };

      setKupci(prev => (prev || []).map(k => (k.KupecID === updated.KupecID ? updated : k)));
      setIzbranKupecZaUrejanje(updated);
      setUrejanjeKupca({ ...updated });
      if (onKupecChange && kupec?.KupecID === updated.KupecID) {
        onKupecChange({ ...updated, rocniVnos: false });
      }
      // Broadcast: posodobi tudi seznam nalogov (kupec snapshot)
      try { window.dispatchEvent(new CustomEvent('kupec-sql-changed', { detail: { ...updated, __action: 'update' } })); } catch {}
      // Reload iz SQL, da je seznam vedno 100% skladen z bazo (če backend vrne drugačna polja)
      try {
        const refreshed = await reloadKupci();
        // Če se je kupec v bazi res posodobil, naj bo tudi v editorju pravilen
        const canonical = refreshed?.find(k => k.KupecID === updated.KupecID) || null;
        if (canonical) {
          setIzbranKupecZaUrejanje(canonical);
          setUrejanjeKupca({ ...canonical });
          if (onKupecChange && kupec?.KupecID === canonical.KupecID) onKupecChange({ ...canonical, rocniVnos: false });
        }
      } catch {}
      setToast('Stranka posodobljena.');
      setTimeout(() => setToast(null), 1200);
    } catch (e: any) {
      console.error(e);
      const msg = (e?.message || 'Napaka pri posodobitvi.').toString();
      const hint =
        msg.includes('Failed to fetch') || msg.includes('NetworkError')
          ? 'Ni povezave do backend-a. Preveri, da backend teče na portu 5000 (npm run dev).'
          : msg.includes('Cannot POST')
            ? 'Backend nima POST /api/kupec/:id. Preveri, da si restartal backend (npm run dev).'
            : null;
      setToast(hint || msg);
      setTimeout(() => setToast(null), 1500);
    } finally {
      setShranjevanjeUrejanja(false);
    }
  };

  const handleIzbrisiKupca = async () => {
    if (!izbranKupecZaUrejanje?.KupecID) return;
    const code = deleteCode.trim();
    if (!code) {
      setDeleteErr('Vnesi kodo.');
      return;
    }
    setDeleting(true);
    setDeleteErr('');
    try {
      const res = await fetch(`/api/kupec/${izbranKupecZaUrejanje.KupecID}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const data = ct.includes('application/json') ? await res.json().catch(() => ({} as any)) : null;
      const text = !ct.includes('application/json') ? await res.text().catch(() => '') : '';
      if (!res.ok || !(data && data.ok)) {
        const detail =
          (data && (data.error || data.details)) ||
          (text ? text.slice(0, 250) : '') ||
          `HTTP ${res.status}`;
        throw new Error(typeof detail === 'string' ? detail : 'Brisanje ni uspelo.');
      }
      const deletedId = izbranKupecZaUrejanje.KupecID;
      setKupci(prev => (prev || []).filter(k => k.KupecID !== deletedId));
      setIzbranKupecZaUrejanje(null);
      setUrejanjeKupca({ ...prazniKupec });
      setShowDeleteModal(false);
      setDeleteCode('');
      setToast('Stranka izbrisana.');
      setTimeout(() => setToast(null), 1200);
      try { window.dispatchEvent(new CustomEvent('kupec-sql-changed', { detail: { KupecID: deletedId, __action: 'delete' } })); } catch {}
      try { await reloadKupci(); } catch {}
    } catch (e: any) {
      const msg = (e?.message || 'Brisanje ni uspelo.').toString();
      setDeleteErr(msg);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-bold text-gray-900">Kupec</h2>
      <div className={`bg-white p-3 border rounded-lg shadow-sm ${zakljucen ? 'bg-red-50 border-red-200' : ''}`}>
        {/* Ročni vnos checkbox */}
        <div className="mb-3">
          <div className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!kupec.rocniVnos}
              onChange={handleRocniVnosChange}
              disabled={disabled}
              className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-100 border-red-300' : ''}`}
            />
            <span>Ročni vnos kupca</span>
            <button
              type="button"
              onClick={() => prikaziNovoStranko ? setPrikaziNovoStranko(false) : openKupecPanel('add')}
              disabled={disabled}
              className="ml-auto px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Dodaj novo stranko/posodobi stranko
            </button>
          </div>
        </div>

        {/* Iskanje kupca - samo če ni ročni vnos */}
        {!kupec.rocniVnos && (
          <div className="relative mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Išči kupca
            </label>
            <input
              type="text"
              placeholder="Vnesi naziv kupca..."
              value={iskanje}
              onChange={handleIskanjeChange}
              disabled={disabled || loading}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
            />
            {loading && (
              <div className="absolute right-3 top-8 text-gray-400">Nalaganje...</div>
            )}
            {prikazujDropdown && filtriraniKupci.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {filtriraniKupci.map((kupecItem) => (
                  <div
                    key={kupecItem.KupecID}
                    onClick={() => handleKupecSelect(kupecItem)}
                    className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                  >
                    <div className="font-medium">{kupecItem.Naziv}</div>
                    <div className="text-sm text-gray-600">
                      {kupecItem.Naslov}, {kupecItem.Posta} {kupecItem.Kraj}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {prikazujDropdown && iskanje.length > 0 && filtriraniKupci.length === 0 && !loading && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg p-3 text-gray-500">
                Ni najdenih kupcev z nazivom "{iskanje}"
              </div>
            )}
          </div>
        )}

        {/* Polja za podatke o kupcu - prikazana pri ročnem vnosu ALI če je izbran kupec iz filtra */}
        {(kupec.rocniVnos || (kupec.Naziv && !kupec.rocniVnos)) && (
          <div className={`grid grid-cols-1 md:grid-cols-3 gap-2 mb-3 p-3 border border-gray-200 rounded-md ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-100 border-red-300' : 'bg-gray-50'}`}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Naziv *</label>
              <input
                type="text"
                placeholder="Naziv kupca"
                value={kupec.Naziv}
                onChange={e => spremeniPolje('Naziv', e.target.value)}
                disabled={disabled}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Naslov</label>
              <input
                type="text"
                placeholder="Naslov"
                value={kupec.Naslov}
                onChange={e => spremeniPolje('Naslov', e.target.value)}
                disabled={disabled}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pošta</label>
              <input
                type="text"
                placeholder="Pošta"
                value={kupec.Posta}
                onChange={e => spremeniPolje('Posta', e.target.value)}
                disabled={disabled}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kraj</label>
              <input
                type="text"
                placeholder="Kraj"
                value={kupec.Kraj}
                onChange={e => spremeniPolje('Kraj', e.target.value)}
                disabled={disabled}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
              <input
                type="text"
                placeholder="Telefon"
                value={kupec.Telefon}
                onChange={e => spremeniPolje('Telefon', e.target.value)}
                disabled={disabled}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID za DDV</label>
              <input
                type="text"
                placeholder="ID za DDV"
                value={kupec.IDzaDDV}
                onChange={e => spremeniPolje('IDzaDDV', e.target.value)}
                disabled={disabled}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
              />
            </div>
          </div>
        )}

        {/* Email, naročilnica in pošlji sporočilo - prikazana, če je izbran kupec ALI ročni vnos */}
        {(kupec.Naziv || kupec.rocniVnos) && (
          <div className="space-y-3">
            {/* Številka naročilnice, Email in Kontaktna oseba v eni vrsti */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Številka naročilnice
                </label>
                <input
                  type="text"
                  placeholder="Vnesi številko naročilnice..."
                  value={kupec.narocilnica || ''}
                  onChange={e => spremeniPolje('narocilnica', e.target.value)}
                  disabled={disabled}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email naslov
                </label>
                <input
                  type="email"
                  placeholder="vnesi@email.com"
                  value={kupec.email || ''}
                  onChange={e => spremeniPolje('email', e.target.value)}
                  disabled={disabled}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                />
                {emailError ? (
                  <div className="mt-1 text-xs text-red-700">
                    {emailError}
                  </div>
                ) : null}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kontaktna oseba
                </label>
                <input
                  type="text"
                  placeholder="Ime in priimek..."
                  value={kontaktnaOseba || ''}
                  onChange={e => onKontaktnaOsebaChange?.(e.target.value)}
                  disabled={disabled}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-50 border-red-300' : 'border-gray-300'}`}
                />
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!!kupec.posljiEmail}
                  onChange={e => spremeniPolje('posljiEmail', e.target.checked)}
                  disabled={disabled}
                  className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${dobavljeno ? 'bg-[#e6f9f3] border-[#b6e7d8]' : zakljucen ? 'bg-red-100 border-red-300' : ''}`}
                />
                Pošlji email obvestilo stranki
                <span className="ml-auto flex items-center gap-2 text-[11px] text-gray-600">
                  <span className={`px-2 py-0.5 rounded ${emailOdprtjePoslan ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    Odprtje: {emailOdprtjePoslan ? 'poslano' : 'ne'}
                  </span>
                  <span className={`px-2 py-0.5 rounded ${emailZakljucekPoslan ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    Zaključek: {emailZakljucekPoslan ? 'poslano' : 'ne'}
                  </span>
                </span>
              </label>
            </div>
          </div>
        )}

        {/* Panel za dodajanje nove stranke */}
        {prikaziNovoStranko && (
          <div className="mt-3 p-3 border border-blue-200 rounded-md bg-blue-50">
            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                onClick={() => setPanelMode('add')}
                className={`px-2 py-1 text-xs rounded ${panelMode === 'add' ? 'bg-blue-700 text-white' : 'bg-white border text-gray-700'}`}
              >
                Dodaj novo
              </button>
              <button
                type="button"
                onClick={() => setPanelMode('update')}
                className={`px-2 py-1 text-xs rounded ${panelMode === 'update' ? 'bg-blue-700 text-white' : 'bg-white border text-gray-700'}`}
              >
                Posodobi obstoječo
              </button>
              <button type="button" onClick={() => setPrikaziNovoStranko(false)} className="ml-auto px-2 py-1 text-xs bg-gray-300 text-gray-900 rounded">
                Zapri
              </button>
            </div>

            {panelMode === 'add' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Naziv *</label>
                    <input className="w-full px-2 py-1 border rounded" value={novaStranka.Naziv} onChange={e => setNovaStranka(s => ({ ...s, Naziv: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Naslov</label>
                    <input className="w-full px-2 py-1 border rounded" value={novaStranka.Naslov} onChange={e => setNovaStranka(s => ({ ...s, Naslov: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Pošta</label>
                    <input className="w-full px-2 py-1 border rounded" value={novaStranka.Posta} onChange={e => setNovaStranka(s => ({ ...s, Posta: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Kraj</label>
                    <input className="w-full px-2 py-1 border rounded" value={novaStranka.Kraj} onChange={e => setNovaStranka(s => ({ ...s, Kraj: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Telefon</label>
                    <input className="w-full px-2 py-1 border rounded" value={novaStranka.Telefon} onChange={e => setNovaStranka(s => ({ ...s, Telefon: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Fax</label>
                    <input className="w-full px-2 py-1 border rounded" value={novaStranka.Fax} onChange={e => setNovaStranka(s => ({ ...s, Fax: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">ID za DDV</label>
                    <input className="w-full px-2 py-1 border rounded" value={novaStranka.IDzaDDV} onChange={e => setNovaStranka(s => ({ ...s, IDzaDDV: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                    <input className="w-full px-2 py-1 border rounded" value={novaStranka.email || ''} onChange={e => setNovaStranka(s => ({ ...s, email: e.target.value }))} />
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={shranjevanjeNove} onClick={handleShraniNovoStranko} className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm">
                    {shranjevanjeNove ? 'Shranjujem…' : 'Shrani v SQL bazo'}
                  </button>
                </div>
              </>
            )}

            {panelMode === 'update' && (
              <>
                <div className="mb-2 text-xs text-gray-700">
                  Najprej filtriraj in izberi kupca iz SQL baze, nato popravi podatke in shrani.
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Filter: Naziv</label>
                    <input className="w-full px-2 py-1 border rounded" value={(sqlFilter.Naziv || '') as any} onChange={e => setSqlFilter(s => ({ ...s, Naziv: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Filter: Naslov</label>
                    <input className="w-full px-2 py-1 border rounded" value={(sqlFilter.Naslov || '') as any} onChange={e => setSqlFilter(s => ({ ...s, Naslov: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Filter: Pošta</label>
                    <input className="w-full px-2 py-1 border rounded" value={(sqlFilter.Posta || '') as any} onChange={e => setSqlFilter(s => ({ ...s, Posta: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Filter: Kraj</label>
                    <input className="w-full px-2 py-1 border rounded" value={(sqlFilter.Kraj || '') as any} onChange={e => setSqlFilter(s => ({ ...s, Kraj: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Filter: Telefon</label>
                    <input className="w-full px-2 py-1 border rounded" value={(sqlFilter.Telefon || '') as any} onChange={e => setSqlFilter(s => ({ ...s, Telefon: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Filter: ID za DDV</label>
                    <input className="w-full px-2 py-1 border rounded" value={(sqlFilter.IDzaDDV || '') as any} onChange={e => setSqlFilter(s => ({ ...s, IDzaDDV: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Filter: Email</label>
                    <input className="w-full px-2 py-1 border rounded" value={((sqlFilter as any).email || '') as any} onChange={e => setSqlFilter(s => ({ ...(s as any), email: e.target.value }))} />
                  </div>
                </div>

                <div className="mt-3 border rounded bg-white max-h-56 overflow-y-auto">
                  {filtriraniSqlKupci.map((k) => (
                    <button
                      key={k.KupecID}
                      type="button"
                      onClick={() => {
                        setIzbranKupecZaUrejanje(k);
                        setUrejanjeKupca({ ...prazniKupec, ...k });
                      }}
                      className={`w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-gray-50 ${izbranKupecZaUrejanje?.KupecID === k.KupecID ? 'bg-blue-50' : ''}`}
                    >
                      <div className="text-sm font-medium">{k.Naziv}</div>
                      <div className="text-xs text-gray-600">{k.Naslov} • {k.Posta} {k.Kraj}</div>
                    </button>
                  ))}
                  {filtriraniSqlKupci.length === 0 && (
                    <div className="px-3 py-3 text-sm text-gray-500">Ni zadetkov.</div>
                  )}
                </div>

                {izbranKupecZaUrejanje && (
                  <div className="mt-3 p-3 border border-blue-200 rounded bg-blue-50">
                    <div className="mb-2 text-xs text-gray-700">
                      Urejanje kupca: <b>{izbranKupecZaUrejanje.Naziv}</b> (ID: {izbranKupecZaUrejanje.KupecID})
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Naziv *</label>
                        <input className="w-full px-2 py-1 border rounded" value={urejanjeKupca.Naziv} onChange={e => setUrejanjeKupca(s => ({ ...s, Naziv: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Naslov</label>
                        <input className="w-full px-2 py-1 border rounded" value={urejanjeKupca.Naslov} onChange={e => setUrejanjeKupca(s => ({ ...s, Naslov: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Pošta</label>
                        <input className="w-full px-2 py-1 border rounded" value={urejanjeKupca.Posta} onChange={e => setUrejanjeKupca(s => ({ ...s, Posta: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Kraj</label>
                        <input className="w-full px-2 py-1 border rounded" value={urejanjeKupca.Kraj} onChange={e => setUrejanjeKupca(s => ({ ...s, Kraj: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Telefon</label>
                        <input className="w-full px-2 py-1 border rounded" value={urejanjeKupca.Telefon} onChange={e => setUrejanjeKupca(s => ({ ...s, Telefon: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Fax</label>
                        <input className="w-full px-2 py-1 border rounded" value={urejanjeKupca.Fax} onChange={e => setUrejanjeKupca(s => ({ ...s, Fax: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">ID za DDV</label>
                        <input className="w-full px-2 py-1 border rounded" value={urejanjeKupca.IDzaDDV} onChange={e => setUrejanjeKupca(s => ({ ...s, IDzaDDV: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                        <input className="w-full px-2 py-1 border rounded" value={urejanjeKupca.email || ''} onChange={e => setUrejanjeKupca(s => ({ ...s, email: e.target.value }))} />
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button type="button" disabled={shranjevanjeUrejanja} onClick={handleShraniPosodobitevKupca} className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm">
                        {shranjevanjeUrejanja ? 'Shranjujem…' : 'Shrani posodobitev v SQL bazo'}
                      </button>
                      <button
                        type="button"
                        disabled={shranjevanjeUrejanja}
                        onClick={() => {
                          setDeleteCode('');
                          setDeleteErr('');
                          setShowDeleteModal(true);
                        }}
                        className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                      >
                        Izbriši stranko
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Modal: izbris stranke */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded shadow-lg max-w-xs w-full">
              <h2 className="text-lg font-bold mb-2">Izbriši stranko</h2>
              <div className="text-sm text-gray-700 mb-2">
                Vnesi kodo za izbris (7474). Stranka bo izbrisana iz SQL baze.
              </div>
              <input
                ref={deleteInputRef}
                autoFocus
                type="password"
                placeholder="Koda"
                value={deleteCode}
                onChange={(e) => {
                  setDeleteCode(e.target.value);
                  if (deleteErr) setDeleteErr('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleIzbrisiKupca();
                  }
                }}
                className="border rounded px-2 py-1 w-full mb-2"
              />
              {deleteErr && <div className="text-sm text-red-600 mb-2">{deleteErr}</div>}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteCode('');
                    setDeleteErr('');
                  }}
                  className="px-3 py-1 bg-gray-300 rounded"
                >
                  Prekliči
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleIzbrisiKupca}
                  className="px-3 py-1 bg-red-600 text-white rounded"
                >
                  {deleting ? 'Brišem…' : 'Izbriši'}
                </button>
              </div>
            </div>
          </div>
        )}
        {toast && (
          <div className="mt-2 text-sm text-green-700">{toast}</div>
        )}
      </div>
    </div>
  );
};

export default KupecSelect;


