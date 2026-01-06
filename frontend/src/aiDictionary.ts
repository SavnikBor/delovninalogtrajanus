// Enostaven slovar in helperji za normalizacijo iz besedila e-maila
// Namen: robustno ujemanje barvnosti tudi, ko AI polje manjka ali je nepredvidljivo

export function normalizeColorsFromText(text: string | undefined | null): string {
  if (!text) return '';
  const t = text.toLowerCase();
  // Eksaktni vzorci najprej
  if (/\b4\s*\/\s*4\b/.test(t) || /dvostrans|obojestrans/.test(t)) {
    return '4/4 barvno obojestransko (CMYK)';
  }
  if (/\b4\s*\/\s*0\b/.test(t) || (/enostrans/.test(t) && /barvn/.test(t))) {
    return '4/0 barvno enostransko (CMYK)';
  }
  if (/\b1\s*\/\s*1\b/.test(t)) {
    return '1/1 črno belo obojestransko (K)';
  }
  if (/\b1\s*\/\s*0\b/.test(t) || /črno|crno/.test(t)) {
    return '1/0 črno belo enostransko (K)';
  }
  return '';
}

// V prihodnje: dodamo slovarje za dodelave/materiale kot mapo -> normalizirano
// export const DODELAVA_SYNONYMS: Record<string, string> = { ... }
// export const MATERIAL_SYNONYMS: Record<string, string> = { ... }



















