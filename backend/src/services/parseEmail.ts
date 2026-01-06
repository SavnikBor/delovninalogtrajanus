import OpenAI from 'openai';
import {
  ParsedEmailFormPrefill,
  ParsedEmailTiskInfo,
  RawAiParsedEmail,
} from '../types/parsedEmail';
import { RazbraniPodatkiEnvelope } from '../types/razbraniPodatki';

function toNullIfEmpty(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s.length === 0 ? null : s;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}

function toIsoDateOrNull(value: unknown): string | null {
  const s = typeof value === 'string' ? value.trim() : String(value || '').trim();
  if (!s) return null;
  // Accept common date forms and coerce to YYYY-MM-DD
  const isoLike = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoLike) return `${isoLike[1]}-${isoLike[2]}-${isoLike[3]}`;
  const euLike = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/);
  if (euLike) {
    const dd = euLike[1].padStart(2, '0');
    const mm = euLike[2].padStart(2, '0');
    const yyyy = euLike[3].length === 2 ? `20${euLike[3]}` : euLike[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  // Fallback attempt via Date ctor
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

export function normalizeParsedEmail(aiData: RawAiParsedEmail): ParsedEmailFormPrefill {
  // Defensive extraction with null fallbacks
  // Expected AI schema:
  // {
  //   "customer": { "name": string|null },
  //   "contact": { "name": string|null, "email": string|null, "phone": string|null },
  //   "order": { "predmet": string|null, "format": string|null, "steviloKosov": number|null, "material": string|null, "barve": string|null, "rokIzdelave": string|null, "komentar": string|null, "steviloPol": number|null, "kosovNaPoli": number|null }
  // }
  const customerName =
    toNullIfEmpty(aiData?.customer?.name) ??
    toNullIfEmpty(aiData?.stranka?.ime) ??
    toNullIfEmpty(aiData?.stranka?.naziv) ??
    null;

  const kontaktnaOseba =
    toNullIfEmpty(aiData?.contact?.name) ??
    toNullIfEmpty(aiData?.kontakt?.ime) ??
    null;

  const email =
    toNullIfEmpty(aiData?.contact?.email) ??
    toNullIfEmpty(aiData?.kontakt?.email) ??
    null;

  const telefon =
    toNullIfEmpty(aiData?.contact?.phone) ??
    toNullIfEmpty(aiData?.kontakt?.telefon) ??
    null;

  const predmet =
    toNullIfEmpty(aiData?.order?.predmet) ??
    toNullIfEmpty(aiData?.izdelek) ??
    null;

  const format =
    toNullIfEmpty(aiData?.order?.format) ??
    toNullIfEmpty(aiData?.format) ??
    null;

  const steviloKosov =
    toNumberOrNull(aiData?.order?.steviloKosov) ??
    toNumberOrNull(aiData?.kolicina) ??
    null;

  const material =
    toNullIfEmpty(aiData?.order?.material) ??
    toNullIfEmpty(aiData?.papir) ??
    null;

  const barve =
    toNullIfEmpty(aiData?.order?.barve) ??
    toNullIfEmpty(aiData?.barvnost) ??
    null;

  const rokIzdelave =
    toIsoDateOrNull(aiData?.order?.rokIzdelave) ??
    toIsoDateOrNull(aiData?.datumDobave) ??
    null;

  const komentar =
    toNullIfEmpty(aiData?.order?.komentar) ??
    toNullIfEmpty(aiData?.komentar) ??
    toNullIfEmpty(aiData?.narocilnica) ??
    null;

  const steviloPol =
    toNumberOrNull(aiData?.order?.steviloPol) ?? null;
  const kosovNaPoli =
    toNumberOrNull(aiData?.order?.kosovNaPoli) ?? null;

  const tisk: ParsedEmailTiskInfo = {
    predmet,
    format,
    steviloKosov,
    material,
    barve,
    steviloPol,
    kosovNaPoli,
  };

  const result: ParsedEmailFormPrefill = {
    customer: {
      name: customerName,
      id: null,
      lookup: {
        matched: false,
        candidates: [],
      },
    },
    kontaktnaOseba,
    email,
    telefon,
    rokIzdelave,
    komentar,
    tisk,
  };

  return result;
}

export async function parseEmailWithAI(emailText: string, openai: OpenAI): Promise<RawAiParsedEmail> {
  const systemPrompt =
    [
      'Ti si sistem za razbiranje e-mailov v strukturiran JSON za delovni nalog.',
      'Strogo vrni samo JSON, brez dodatnega besedila ali razlag.',
      'Vsa manjkajoča polja morajo imeti vrednost null.',
      'Števila morajo biti številke (ne nizi). Datumi v obliki YYYY-MM-DD, ali null.',
      'Izhodni JSON mora biti TOČNO v tej shemi:',
      '{',
      '  "customer": { "name": string|null },',
      '  "contact": { "name": string|null, "email": string|null, "phone": string|null },',
      '  "order": {',
      '    "predmet": string|null,',
      '    "format": string|null,',
      '    "steviloKosov": number|null,',
      '    "material": string|null,',
      '    "barve": string|null,',
      '    "rokIzdelave": string|null,',
      '    "komentar": string|null,',
      '    "steviloPol": number|null,',
      '    "kosovNaPoli": number|null',
      '  }',
      '}',
    ].join('\n');

  const userPrompt =
    [
      'Razberi spodnji e-mail v zgornjo shemo. Vrni samo čist JSON.',
      '',
      '--- E-MAIL ZA RAZBIRANJE ---',
      emailText,
      '--- KONEC ---',
    ].join('\n');

  const completion = await openai.chat.completions.create({
    // Prefer configurable model via env; fallback to a modern capable chat model
    model: process.env.OPENAI_MODEL || 'gpt-4.1',
    temperature: 0.1,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const content = completion.choices?.[0]?.message?.content || '';
  // Attempt to extract JSON if model wrapped it accidentally
  const jsonTextMatch = content.match(/\{[\s\S]*\}/);
  const jsonText = jsonTextMatch ? jsonTextMatch[0] : content;
  const parsed = JSON.parse(jsonText);
  return parsed;
}

/**
 * Strict extractor that returns EXACTLY the "razbraniPodatki" envelope as requested.
 * The model MUST output JSON only and match the structure precisely.
 */
export async function parseEmailToRazbraniWithAI(emailText: string, openai: OpenAI): Promise<RazbraniPodatkiEnvelope> {
  const system = [
    'YOU ARE A HIGH-PRECISION PRINT-ORDER EXTRACTION AI.',
    'Tvoja naloga je, da iz kateregakoli prejema e-maila avtomatsko razbereš podatke za izpolnitev delovnega naloga.',
    'E-mail je lahko v poljubnem jeziku, lahko je kratek ali dolg, neurejen, z reply chain in podpisi.',
    'IZHOD MORA BITI IZKLJUČNO JSON OBJEKT. NE DODAJ NIČESAR.',
    'Sledi pravilom, ne ugibaj, ne razlagaj. Če ni razvidno, vrni null.',
  ].join('\n');

  // Vključi točno shemo iz zahteve (komentarji so del navodil, AI naj vrne čist JSON brez komentarjev)
  const schemaBlock = [
    '{',
    '',
    '',
    '',
    '  "razbraniPodatki": {',
    '',
    '    "stevilkaNaloga": null,',
    '',
    '    "datumOdprtja": null,               // ISO "YYYY-MM-DDTHH:mm" ali "YYYY-MM-DD"',
    '',
    '    "status": null,                     // "v_delu" | "zaključen" | null',
    '',
    '    "dobavljeno": null,                 // boolean | null',
    '',
    '    "prioritetnaOcena": null,           // number | null',
    '',
    '    "emailPoslan": null,                // boolean | null',
    '',
    '    "zakljucekEmailPoslan": null,       // boolean | null',
    '',
    '    "kupec": {',
    '',
    '      "KupecID": null,',
    '',
    '      "Naziv": null,',
    '',
    '      "Naslov": null,',
    '',
    '      "Posta": null,',
    '',
    '      "Kraj": null,',
    '',
    '      "Telefon": null,',
    '',
    '      "Fax": null,',
    '',
    '      "IDzaDDV": null,',
    '',
    '      "email": null,',
    '',
    '      "narocilnica": null,',
    '',
    '      "rocniVnos": null,                // boolean | null',
    '',
    '      "posljiEmail": null               // boolean | null',
    '',
    '    },',
    '',
    '    "kontakt": {',
    '',
    '      "kontaktnaOseba": null,',
    '',
    '      "email": null,',
    '',
    '      "telefon": null',
    '',
    '    },',
    '',
    '    "rokIzdelave": null,                // ISO "YYYY-MM-DD"',
    '',
    '    "rokIzdelaveUra": null,             // "HH:mm" (07:00–15:00) | null',
    '',
    '    "datumNarocila": null,              // ISO "YYYY-MM-DD" | null',
    '',
    '    "tisk": {',
    '',
    '      "tisk1": {',
    '',
    '        "predmet": null,',
    '',
    '        "format": null,',
    '',
    '        "obseg": null,',
    '',
    '        "steviloKosov": null,           // string | null',
    '',
    '        "material": null,',
    '',
    '        "barve": null,',
    '',
    '        "steviloPol": null,             // string | null',
    '',
    '        "kosovNaPoli": null,            // string | null',
    '',
    '        "tiskaKooperant": null,         // boolean | null',
    '',
    '        "kooperant": null,',
    '',
    '        "rokKooperanta": null,          // ISO "YYYY-MM-DD" | null',
    '',
    '        "znesekKooperanta": null,       // string | null',
    '',
    '        "b2Format": null,               // boolean | null',
    '',
    '        "b1Format": null,               // boolean | null',
    '',
    '        "steviloMutacij": null,         // string | null (npr. "1"–"10")',
    '',
    '        "mutacije": [',
    '',
    '          { "steviloPol": null }        // string | null',
    '',
    '        ]',
    '',
    '      },',
    '',
    '      "tisk2": {',
    '',
    '        "predmet": null,',
    '',
    '        "format": null,',
    '',
    '        "obseg": null,',
    '',
    '        "steviloKosov": null,',
    '',
    '        "material": null,',
    '',
    '        "barve": null,',
    '',
    '        "steviloPol": null,',
    '',
    '        "kosovNaPoli": null,',
    '',
    '        "tiskaKooperant": null,',
    '',
    '        "kooperant": null,',
    '',
    '        "rokKooperanta": null,',
    '',
    '        "znesekKooperanta": null,',
    '',
    '        "b2Format": null,',
    '',
    '        "b1Format": null,',
    '',
    '        "steviloMutacij": null,',
    '',
    '        "mutacije": [',
    '',
    '          { "steviloPol": null }',
    '',
    '        ]',
    '',
    '      }',
    '',
    '    },',
    '',
    '    "dodelava": {',
    '',
    '      "dodelava1": {',
    '',
    '        "razrez": null,',
    '',
    '        "vPolah": null,',
    '',
    '        "zgibanje": null,',
    '',
    '        "biganje": null,',
    '',
    '        "perforacija": null,',
    '',
    '        "biganjeRocnoZgibanje": null,',
    '',
    '        "lepljenje": null,',
    '',
    '        "lepljenjeMesta": null,',
    '',
    '        "lepljenjeSirina": null,',
    '',
    '        "lepljenjeBlokov": null,',
    '',
    '        "vrtanjeLuknje": null,',
    '',
    '        "velikostLuknje": null,',
    '',
    '        "uvTisk": null,',
    '',
    '        "uvLak": null,',
    '',
    '        "topliTisk": null,',
    '',
    '        "vezava": null,',
    '',
    '        "izsek": null,',
    '',
    '        "plastifikacija": null,',
    '',
    '        "kooperant1": null,',
    '',
    '        "kooperant1Podatki": {',
    '',
    '          "imeKooperanta": null,',
    '',
    '          "predvidenRok": null,         // ISO "YYYY-MM-DD" | null',
    '',
    '          "znesekDodelave": null,',
    '',
    '          "vrstaDodelave": null',
    '',
    '        },',
    '',
    '        "kooperant2": null,',
    '',
    '        "kooperant2Podatki": {',
    '',
    '          "imeKooperanta": null,',
    '',
    '          "predvidenRok": null,',
    '',
    '          "znesekDodelave": null,',
    '',
    '          "vrstaDodelave": null',
    '',
    '        },',
    '',
    '        "kooperant3": null,',
    '',
    '        "kooperant3Podatki": {',
    '',
    '          "imeKooperanta": null,',
    '',
    '          "predvidenRok": null,',
    '',
    '          "znesekDodelave": null,',
    '',
    '          "vrstaDodelave": null',
    '',
    '        },',
    '',
    '        "stevilkaOrodja": null',
    '',
    '      },',
    '',
    '      "dodelava2": {',
    '',
    '        "razrez": null,',
    '',
    '        "vPolah": null,',
    '',
    '        "zgibanje": null,',
    '',
    '        "biganje": null,',
    '',
    '        "perforacija": null,',
    '',
    '        "biganjeRocnoZgibanje": null,',
    '',
    '        "lepljenje": null,',
    '',
    '        "lepljenjeMesta": null,',
    '',
    '        "lepljenjeSirina": null,',
    '',
    '        "lepljenjeBlokov": null,',
    '',
    '        "vrtanjeLuknje": null,',
    '',
    '        "velikostLuknje": null,',
    '',
    '        "uvTisk": null,',
    '',
    '        "uvLak": null,',
    '',
    '        "topliTisk": null,',
    '',
    '        "vezava": null,',
    '',
    '        "izsek": null,',
    '',
    '        "plastifikacija": null,',
    '',
    '        "kooperant1": null,',
    '',
    '        "kooperant1Podatki": {',
    '',
    '          "imeKooperanta": null,',
    '',
    '          "predvidenRok": null,',
    '',
    '          "znesekDodelave": null,',
    '',
    '          "vrstaDodelave": null',
    '',
    '        },',
    '',
    '        "kooperant2": null,',
    '',
    '        "kooperant2Podatki": {',
    '',
    '          "imeKooperanta": null,',
    '',
    '          "predvidenRok": null,',
    '',
    '          "znesekDodelave": null,',
    '',
    '          "vrstaDodelave": null',
    '',
    '        },',
    '',
    '        "kooperant3": null,',
    '',
    '        "kooperant3Podatki": {',
    '',
    '          "imeKooperanta": null,',
    '',
    '          "predvidenRok": null,',
    '',
    '          "znesekDodelave": null,',
    '',
    '          "vrstaDodelave": null',
    '',
    '        },',
    '',
    '        "stevilkaOrodja": null',
    '',
    '      }',
    '',
    '    },',
    '',
    '    "stroski": {',
    '',
    '      "stroski1": {',
    '',
    '        "graficnaPriprava": null,       // string | null (npr. "120,00")',
    '',
    '        "cenaKlišeja": null,            // string | null',
    '',
    '        "cenaIzsekovalnegaOrodja": null,// string | null',
    '',
    '        "cenaVzorca": null,             // string | null',
    '',
    '        "cenaBrezDDV": null,            // string | null',
    '',
    '        "skupaj": null,                 // number | null (izračun)',
    '',
    '        "skupajZDDV": null              // number | null (izračun)',
    '',
    '      },',
    '',
    '      "stroski2": {',
    '',
    '        "graficnaPriprava": null,',
    '',
    '        "cenaKlišeja": null,',
    '',
    '        "cenaIzsekovalnegaOrodja": null,',
    '',
    '        "cenaVzorca": null,',
    '',
    '        "cenaBrezDDV": null,',
    '',
    '        "skupaj": null,',
    '',
    '        "skupajZDDV": null',
    '',
    '      }',
    '',
    '    },',
    '',
    '    "posiljanje": {',
    '',
    '      "posiljanjePoPosti": null,        // boolean | null',
    '',
    '      "naziv": null,',
    '',
    '      "naslov": null,',
    '',
    '      "kraj": null,',
    '',
    '      "postnaStevilka": null,',
    '',
    '      "osebnoPrevzem": null,            // boolean | null',
    '',
    '      "dostavaNaLokacijo": null         // boolean | null',
    '',
    '    },',
    '',
    '    "komentar": {',
    '',
    '      "komentar": null',
    '',
    '    }',
    '',
    '  }',
    '',
    '}',
  ].join('\n');

  const user = [
    'Sledi spodnjim pravilom razbiranja.',
    '',
    schemaBlock,
    '',
    '📌 Pravila:',
    '- Nikoli ne ugibaj; če ni razvidno, vrni null.',
    '- Datume pretvori v ISO če možno (YYYY-MM-DD, HH:mm).',
    '- Prepoznaj kupca iz domene, podpisa ali besedila; ID ne izmišljuj.',
    '- Prepoznaj dodelave in tiskovne podatke po kontekstu.',
    '',
    '--- E-MAIL ZA RAZBIRANJE ---',
    emailText,
    '--- KONEC ---',
    '',
    'IZHOD: VRNI IZKLJUČNO ČIST JSON (brez komentarjev, brez besedila).',
  ].join('\n');

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4.1',
    temperature: 0.1,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const content = completion.choices?.[0]?.message?.content || '';
  const jsonTextMatch = content.match(/\{[\s\S]*\}/);
  const jsonText = jsonTextMatch ? jsonTextMatch[0] : content;
  const parsed = JSON.parse(jsonText) as RazbraniPodatkiEnvelope;
  return parsed;
}


