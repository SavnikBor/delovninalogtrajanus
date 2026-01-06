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
  onKupecChange?: (kupec: Kupec | null) => void;
  kupecPodatki?: Kupec | null;
}> = ({ disabled = false, zakljucen = false, dobavljeno = false, onKupecChange, kupecPodatki }) => {
  // Controlled state: vedno vezano na props (merge z defaulti, da vrednosti niso nikoli undefined)
  const kupec = { ...prazniKupec, ...(kupecPodatki || {}) };

  // Naloži kupce iz backend API
  const [kupci, setKupci] = React.useState<Kupec[]>([]);
  const [iskanje, setIskanje] = React.useState('');
  const [prikazujDropdown, setPrikazujDropdown] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [prikaziNovoStranko, setPrikaziNovoStranko] = React.useState(false);
  const [novaStranka, setNovaStranka] = React.useState<Kupec>({ ...prazniKupec });
  const [shranjevanjeNove, setShranjevanjeNove] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  useEffect(() => {
    const naloziKupce = async () => {
      setLoading(true);
      try {
        const response = await fetch('http://localhost:5000/api/kupec');
        if (response.ok) {
          const data = await response.json();
          setKupci(data);
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
      const res = await fetch('http://localhost:5000/api/kupec', {
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
              onClick={() => setPrikaziNovoStranko(v => !v)}
              disabled={disabled}
              className="ml-auto px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Dodaj novo stranko
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
            {/* Številka naročilnice in Email v eni vrsti */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              </label>
            </div>
          </div>
        )}

        {/* Panel za dodajanje nove stranke */}
        {prikaziNovoStranko && (
          <div className="mt-3 p-3 border border-blue-200 rounded-md bg-blue-50">
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
              <button type="button" onClick={() => setPrikaziNovoStranko(false)} className="px-3 py-1.5 bg-gray-300 text-gray-900 rounded text-sm">
                Prekliči
              </button>
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


