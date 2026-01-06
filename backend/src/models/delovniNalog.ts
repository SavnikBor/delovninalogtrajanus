export interface DelovniNalog {
  id: number;
  številka_naloga: string;
  naziv: string;
  kupec_id: number;
  datum: Date;
  rok: Date;
  opis: string;
  status: string;
  prioritetna_ocena: number;
  dodelave: string | object;
} 