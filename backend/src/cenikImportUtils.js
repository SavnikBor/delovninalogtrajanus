function toYmd(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isValidYmd(value) {
  const ymd = toYmd(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const d = new Date(`${ymd}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

function toHm(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function validateCenikImportPayload(payload) {
  const out = {
    ok: false,
    errors: [],
    warnings: [],
    normalizedPayload: null,
  };
  const body = payload || {};
  const rp = body.razbraniPodatki;
  if (!rp || typeof rp !== 'object') {
    out.errors.push('Manjka payload.razbraniPodatki');
    return out;
  }
  const rokIzdelave = toYmd(rp.rokIzdelave);
  if (!rokIzdelave || !isValidYmd(rokIzdelave)) {
    out.errors.push('Neveljaven razbraniPodatki.rokIzdelave (pričakovan YYYY-MM-DD)');
    return out;
  }
  const rawUra = rp.rokIzdelaveUra;
  const rokIzdelaveUra = toHm(rawUra);
  if (!String(rawUra || '').trim()) {
    out.warnings.push('rokIzdelaveUra manjka; nastavljeno na null');
  } else if (!rokIzdelaveUra) {
    out.warnings.push('rokIzdelaveUra ni v HH:mm; nastavljeno na null');
  }
  out.normalizedPayload = {
    ...body,
    razbraniPodatki: {
      ...rp,
      rokIzdelave,
      rokIzdelaveUra: rokIzdelaveUra || null,
    }
  };
  out.ok = true;
  return out;
}

function summarizeCenikRazbrani(rp) {
  const tisk1 = rp?.tisk?.tisk1 || {};
  const meta = rp?._cenikMeta || {};
  const predmet = String(tisk1.predmet || meta.naslovTiskovine || meta.naslov || rp?.predmet || '').trim();
  const kolicina = String(tisk1.steviloKosov || rp?.kolicina || '').trim();
  return {
    predmet: predmet || '(brez naslova tiskovine)',
    kolicina: kolicina || '-',
    rokIzdelave: toYmd(rp?.rokIzdelave) || '',
    rokIzdelaveUra: toHm(rp?.rokIzdelaveUra) || null,
  };
}

function mapRazbraniToWorkOrderDraft(rp) {
  const tisk = (rp && typeof rp.tisk === 'object') ? rp.tisk : {};
  const dodelava = (rp && typeof rp.dodelava === 'object') ? rp.dodelava : {};
  const stroski = (rp && typeof rp.stroski === 'object') ? rp.stroski : {};
  return {
    kupec: rp?.kupec || {},
    kontakt: rp?.kontakt || {},
    tisk: {
      tisk1: tisk?.tisk1 || {},
      tisk2: tisk?.tisk2 || {},
    },
    dodelava1: dodelava?.dodelava1 || rp?.dodelava1 || {},
    dodelava2: dodelava?.dodelava2 || rp?.dodelava2 || {},
    stroski1: stroski?.stroski1 || rp?.stroski1 || {},
    stroski2: stroski?.stroski2 || rp?.stroski2 || {},
    posiljanje: rp?.posiljanje || {},
    komentar: rp?.komentar || {},
    datumNarocila: rp?.datumNarocila || new Date().toISOString(),
    rokIzdelave: toYmd(rp?.rokIzdelave) || '',
    rokIzdelaveUra: toHm(rp?.rokIzdelaveUra) || '',
    emailPoslan: false,
    zakljucekEmailPoslan: false,
    odprtjeEmailPonujen: false,
    zakljucekEmailPonujen: false,
    _cenikMeta: rp?._cenikMeta || {},
  };
}

module.exports = {
  toYmd,
  toHm,
  isValidYmd,
  validateCenikImportPayload,
  summarizeCenikRazbrani,
  mapRazbraniToWorkOrderDraft,
};
