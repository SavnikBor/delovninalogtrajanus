export interface ParsedEmailCustomerLookupCandidate {
  id: number;
  Naziv: string;
}

export interface ParsedEmailCustomerInfo {
  name: string | null;
  id: number | null;
  lookup: {
    matched: boolean;
    candidates: ParsedEmailCustomerLookupCandidate[];
  };
}

export interface ParsedEmailTiskInfo {
  predmet: string | null;
  format: string | null;
  steviloKosov: number | null;
  material: string | null;
  barve: string | null;
  steviloPol: number | null;
  kosovNaPoli: number | null;
}

export interface ParsedEmailFormPrefill {
  customer: ParsedEmailCustomerInfo;
  kontaktnaOseba: string | null;
  email: string | null;
  telefon: string | null;
  rokIzdelave: string | null; // ISO date YYYY-MM-DD or null
  komentar: string | null;
  tisk: ParsedEmailTiskInfo;
}

export type RawAiParsedEmail = any;



















