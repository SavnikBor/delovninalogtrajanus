# Formule za izračun časa v sistemu delovnih nalogov

## Tisk

### Standardni tisk (brez B2/B1 format pole)
- **4/0 barvno enostransko (CMYK)**: `Math.ceil(število_pol / 3000 * 10) / 10`
- **4/4 barvno obojestransko (CMYK)**: `Math.ceil(število_pol / 1500 * 10) / 10`
- **1/0 črno belo enostransko (K)**: `Math.ceil(število_pol / 6000 * 10) / 10`
- **1/1 črno belo obojestransko (K)**: `Math.ceil(število_pol / 3000 * 10) / 10`

## UV Tisk
- **Osnovna formula**: `Math.ceil(število_pol / (35 * 3 / 8) * 10) / 10`
- **Dvostranski tisk (4/4 ali 1/1)**: pomnoži z 2

## Plastifikacija
- **Standardni format**: `Math.ceil(število_pol * 0.33 / (3.5 * 60) * 10) / 10`
- **B2 format pole**: `Math.ceil(število_pol * 0.72 / (3.5 * 60) * 10) / 10`
- **B1 format pole**: `Math.ceil(število_pol * 1.02 / (3.5 * 60) * 10) / 10`
- **1/1 plastifikacija**: pomnoži z 2

## UV Lakiranje
- **Standardni format**: `Math.ceil(število_pol / 500 * 10) / 10`
- **B2 format pole**: `Math.ceil(število_pol / 280 * 10) / 10`
- **1/1 lakiranje**: pomnoži z 2

## Izsek/Zasek

### Digitalni izsek/zasek
- **Standardni format**: `Math.ceil(število_pol / 60 * 10) / 10`
- **B2 format pole**: `Math.ceil(število_pol / 35 * 10) / 10`
- **B1 format pole**: `Math.ceil(število_pol / 20 * 10) / 10`

### Klasični izsek
- **Formula**: `Math.ceil(8 + 0.5 + število_pol / 1000 * 10) / 10`

### Okroglenje vogalov
- **Formula**: `Math.ceil((število_kosov / 30) * 0.03 * 10) / 10`

### Razrez
- **Formula**: `Math.ceil((število_pol / 30) / 10 * 10) / 10`

## Topli tisk, reliefni tisk, globoki tisk
- **Formula**: `Math.ceil(8 + 1 + število_kosov / 1000 * 10) / 10`

## Biganje
- **Formula**: `Math.ceil(število_kosov / 1000 * 10) / 10`

## Biganje + ročno zgibanje
- **Formula**: `Math.ceil(število_kosov / 1000 + število_kosov / 500 * 10) / 10`

## Zgibanje
- **Formula**: `Math.ceil(število_kosov / 10000 * 10) / 10`

## Lepljenje lepilnega traku

### Vroče strojno lepljenje
- **Formula**: `Math.ceil(1 + število_kosov / 10000 * 10) / 10`

### Trak širine 6, 9 ali 19 mm
- **Formula**: `Math.ceil(0.1 + (število_kosov * (15 / 3600)) * število_lepilnih_mest * 10) / 10`

## Lepljenje blokov
- **Formula**: `Math.ceil(1 * (število_kosov / (2 * 27)) * 10) / 10`

## Vezava
- **Spirala**: `Math.ceil(število_kosov / 100 * 10) / 10`
- **Vezano z žico**: `Math.ceil(število_kosov / 50 * 10) / 10`
- **Broširano**: `Math.ceil(število_kosov / 200 * 10) / 10`
- **Šivano**: `Math.ceil(število_kosov / 100 * 10) / 10`

## Vrtanje luknje
- **Formula**: `Math.ceil(število_kosov / 1000 * 10) / 10`

## Perforacija
- **Formula**: `Math.ceil(število_kosov / 500 * 10) / 10`

## Lokacije formul v kodi

### App.tsx
- Funkcija `izracunajPrioriteto()` (vrstice ~148-713)
- Vse formule za prioritetne naloge

### DodelavaSekcija.tsx
- Funkcija `izracunajCasDodelave()` (vrstice ~119-264)
- Vse formule za dodelave

### TiskSekcija.tsx
- Funkcija `izracunajCasTiska()` (vrstice ~168-200)
- Formule za tisk

### SeznamNaloga.tsx
- Funkcija `izracunajCasTiska()` (vrstice ~75-125)
- Formule za prikaz časa tiska v seznamu

### PrioritetniNalogi.tsx
- Funkcija `formatirajCas()` (vrstice ~47-56)
- Prikaz časov v urah in minutah

## Opombe
- Vse formule uporabljajo `Math.ceil()` za zaokroževanje navzgor
- Časi so v urah (decimalni format)
- Prikaz časov se formatira v "Xh Ymin" format
- B2 in B1 format pole vplivata na večino formul
- Dvostranski tisk (4/4, 1/1) se pomnoži z 2 