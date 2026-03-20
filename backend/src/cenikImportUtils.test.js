const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateCenikImportPayload,
  summarizeCenikRazbrani,
  mapRazbraniToWorkOrderDraft,
} = require('./cenikImportUtils');

test('validacija: happy path payload', () => {
  const payload = {
    razbraniPodatki: {
      rokIzdelave: '2026-02-20',
      rokIzdelaveUra: '12:30',
      tisk: { tisk1: { predmet: 'Vizitke', steviloKosov: '500' } },
    }
  };
  const res = validateCenikImportPayload(payload);
  assert.equal(res.ok, true);
  assert.equal(res.errors.length, 0);
  assert.equal(res.normalizedPayload.razbraniPodatki.rokIzdelave, '2026-02-20');
  assert.equal(res.normalizedPayload.razbraniPodatki.rokIzdelaveUra, '12:30');
});

test('validacija: invalid payload in missing ura warning', () => {
  const invalid = validateCenikImportPayload({ razbraniPodatki: { rokIzdelave: 'neveljavno' } });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.length > 0);

  const missingUra = validateCenikImportPayload({ razbraniPodatki: { rokIzdelave: '2026-02-20' } });
  assert.equal(missingUra.ok, true);
  assert.ok(missingUra.warnings.some((w) => w.includes('rokIzdelaveUra manjka')));
  assert.equal(missingUra.normalizedPayload.razbraniPodatki.rokIzdelaveUra, null);
});

test('summary + draft map: basic fields', () => {
  const rp = {
    kupec: { Naziv: 'Medis' },
    kontakt: { email: 'a@b.si' },
    rokIzdelave: '2026-03-01',
    rokIzdelaveUra: '09:15',
    tisk: { tisk1: { predmet: 'Flyer', steviloKosov: '1000' } },
    dodelava: { dodelava1: { zgibanje: true } },
    stroski: { stroski1: { cenaBrezDDV: '120' } },
  };
  const s = summarizeCenikRazbrani(rp);
  assert.equal(s.predmet, 'Flyer');
  assert.equal(s.kolicina, '1000');
  assert.equal(s.rokIzdelaveUra, '09:15');

  const draft = mapRazbraniToWorkOrderDraft(rp);
  assert.equal(draft.kupec.Naziv, 'Medis');
  assert.equal(draft.tisk.tisk1.predmet, 'Flyer');
  assert.equal(draft.dodelava1.zgibanje, true);
  assert.equal(draft.stroski1.cenaBrezDDV, '120');
});
