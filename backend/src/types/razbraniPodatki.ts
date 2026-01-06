export interface RazbraniPodatkiKupec {
  KupecID: number | null;
  Naziv: string | null;
  Naslov: string | null;
  Posta: string | null;
  Kraj: string | null;
  Telefon: string | null;
  Fax: string | null;
  IDzaDDV: string | null;
  email: string | null;
  narocilnica: string | null;
  rocniVnos: boolean | null;
  posljiEmail: boolean | null;
}

export interface RazbraniPodatkiKontakt {
  kontaktnaOseba: string | null;
  email: string | null;
  telefon: string | null;
}

export interface RazbraniTiskMutacija {
  steviloPol: string | null;
}

export interface RazbraniTisk {
  predmet: string | null;
  format: string | null;
  obseg: string | null;
  steviloKosov: string | null;
  material: string | null;
  barve: string | null;
  steviloPol: string | null;
  kosovNaPoli: string | null;
  tiskaKooperant: boolean | null;
  kooperant: string | null;
  rokKooperanta: string | null;
  znesekKooperanta: string | null;
  b2Format: boolean | null;
  b1Format: boolean | null;
  steviloMutacij: string | null;
  mutacije: RazbraniTiskMutacija[];
}

export interface RazbraniKooperantPodatki {
  imeKooperanta: string | null;
  predvidenRok: string | null;
  znesekDodelave: string | null;
  vrstaDodelave: string | null;
}

export interface RazbraniDodelava {
  razrez: boolean | null;
  vPolah: boolean | null;
  zgibanje: boolean | null;
  biganje: boolean | null;
  perforacija: boolean | null;
  biganjeRocnoZgibanje: boolean | null;
  lepljenje: boolean | null;
  lepljenjeMesta: string | null;
  lepljenjeSirina: string | null;
  lepljenjeBlokov: boolean | null;
  vrtanjeLuknje: boolean | null;
  velikostLuknje: string | null;
  uvTisk: string | null;
  uvLak: string | null;
  topliTisk: string | null;
  vezava: string | null;
  izsek: string | null;
  plastifikacija: string | null;
  kooperant1: boolean | null;
  kooperant1Podatki: RazbraniKooperantPodatki;
  kooperant2: boolean | null;
  kooperant2Podatki: RazbraniKooperantPodatki;
  kooperant3: boolean | null;
  kooperant3Podatki: RazbraniKooperantPodatki;
  stevilkaOrodja: string | null;
}

export interface RazbraniStroski {
  graficnaPriprava: string | null;
  cenaKlišeja: string | null;
  cenaIzsekovalnegaOrodja: string | null;
  cenaVzorca: string | null;
  cenaBrezDDV: string | null;
  skupaj: number | null;
  skupajZDDV: number | null;
}

export interface RazbraniPosiljanje {
  posiljanjePoPosti: boolean | null;
  naziv: string | null;
  naslov: string | null;
  kraj: string | null;
  postnaStevilka: string | null;
  osebnoPrevzem: boolean | null;
  dostavaNaLokacijo: boolean | null;
}

export interface RazbraniKomentar {
  komentar: string | null;
}

export interface RazbraniPodatki {
  stevilkaNaloga: number | null;
  datumOdprtja: string | null; // ISO "YYYY-MM-DDTHH:mm" ali "YYYY-MM-DD"
  status: 'v_delu' | 'zaključen' | null;
  dobavljeno: boolean | null;
  prioritetnaOcena: number | null;
  emailPoslan: boolean | null;
  zakljucekEmailPoslan: boolean | null;
  kupec: RazbraniPodatkiKupec;
  kontakt: RazbraniPodatkiKontakt;
  rokIzdelave: string | null;      // ISO "YYYY-MM-DD"
  rokIzdelaveUra: string | null;   // "HH:mm"
  datumNarocila: string | null;    // ISO "YYYY-MM-DD"
  tisk: {
    tisk1: RazbraniTisk;
    tisk2: RazbraniTisk;
  };
  dodelava: {
    dodelava1: RazbraniDodelava;
    dodelava2: RazbraniDodelava;
  };
  stroski: {
    stroski1: RazbraniStroski;
    stroski2: RazbraniStroski;
  };
  posiljanje: RazbraniPosiljanje;
  komentar: RazbraniKomentar;
}

export interface RazbraniPodatkiEnvelope {
  razbraniPodatki: RazbraniPodatki;
}



















