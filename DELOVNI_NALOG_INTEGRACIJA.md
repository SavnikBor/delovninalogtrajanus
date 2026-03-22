# Integracija Cenikov Trajanus z aplikacijo Delovni nalog

**Backend:** kanonični HTTP API teče iz **`backend/server.js`** (zagon iz korena: `npm run server` / `npm start`, ali iz `backend/`: `npm run dev`). Podrobnosti: [`backend/README.md`](backend/README.md).

**Opomba:** `backend/src/app.ts` je označen kot legacy in ni del aktivnega API toka — glej razdelek o deprecated TypeScript backendu v [`backend/README.md`](backend/README.md).

Ta dokument opisuje, kaj mora aplikacija **Delovni nalog** implementirati, da Ceniki Trajanus lahko pridobijo realne čase po dodelavah in jih uporabljajo pri izračunu cen.

---

## Pregled

Ceniki Trajanus imajo stran **Časi dodelav** (dostopna po vnosu kode 407940), kjer se prikazujejo realni časi po posamezni dodelavi. Ti časi pridejo iz Delovnega naloga in se pri izračunu cen upoštevajo samo za izbrane dodelave (npr. če je izbran UV lak, se prišteje čas UV lakiranja; če ni, se ne).

---

## Kaj mora Delovni nalog implementirati

### 1. Izvoz / izmenjava podatkov o časih po dodelavah

Delovni nalog mora omogočiti **izvoz** ali **posiljanje** agregiranih časov po dodelavah v Cenike Trajanus. Obstajata dva možna načina:

#### Možnost A: HTTP POST (priporočeno)

Delovni nalog pošlje podatke na endpoint Cenikov Trajanus:

- **URL:** `POST https://&lt;domena-cenikov&gt;/api/dodelave-times`
- **Content-Type:** `application/json`
- **Telo zahtevka:**

```json
{
  "casi": {
    "Tisk": 1.2,
    "plastifikacija": 0.5,
    "UV lak": 0.8,
    "Topli tisk": 0.3,
    "UV tisk": 0.6,
    "Perforacija": 0.2,
    "Izsek/zasek": 0.4,
    "Razrez": 0.3,
    "Lepljenje": 0.5,
    "Lepljenje blokov": 0.6,
    "Biganje + ročno zgibanje": 0.7,
    "Biganje": 0.5,
    "Zgibanje": 0.4,
    "Vrtanje luknje": 0.1,
    "Vezava": 0.6,
    "Dodatno": 0.2
  },
  "source": "delovni-nalog"
}
```

- `casi` – objekt, pri katerem so ključi **imena dodelav** (natančno kot v seznamu spodaj), vrednosti pa **časi v urah** (števila).
- `source` – izbirno, označa vir (npr. "delovni-nalog").

**Seznam imen dodelav** (ključi morajo biti enaki):

- Tisk, plastifikacija, UV lak, Topli tisk, UV tisk, Perforacija  
- Izsek/zasek, Razrez, Lepljenje, Lepljenje blokov  
- Biganje + ročno zgibanje, Biganje, Zgibanje  
- Vrtanje luknje, Vezava, Dodatno  

#### Možnost B: Sinhronizacija datoteke (če sta na istem strežniku)

Če Delovni nalog in Ceniki Trajanus tečeta na istem strežniku, lahko Delovni nalog piše v datoteko, ki jo Ceniki Trajanus bere. Datoteka bi bila npr. v korenu Cenikov: `dodelave-times.json` z enako strukturo kot v možnosti A.

---

### 2. Kako pridobiti čase iz Delovnega naloga

Delovni nalog mora:

1. **Zbrati** čase opravljenih del po posamezni dodelavi (npr. iz delovnih nalogov, časovnih list, tečajev ipd.).
2. **Agregirati** te čase (npr. povprečje zadnjih N nalogov, ali vsota časov po dodelavi za določeno obdobje).
3. **Poslati** strukturo `{ casi: { "Tisk": 1.2, "UV lak": 0.8, ... } }` na Cenike Trajanus (POST ali posodobitev datoteke).

Priporočljivo je, da v Delovnem nalogu vsaka operacija/dodelava ima ustrezno ime, ki se ujema z zgornjim seznamom (npr. "Tisk", "UV lak", "Perforacija"), da se časi pravilno pripišejo.

---

### 3. Stran „Časi dodelav“ v Cenikih Trajanus

V Cenikih Trajanus obstaja stran **Časi dodelav** (navigacija po vnosu kode 407940):

- Prikazuje preglednico časov po dodelavah.
- Omogoča ročni vnos JSON (če Delovni nalog še ne pošilja podatkov).
- Zadnja posodobitev se prikaže, če so podatki poslani prek POST.

---

### 4. Primer implementacije v Delovnem nalogu

#### Node.js / Express

```javascript
async function exportDodelaveTimesToCeniki() {
  const casi = await aggregateTimesByDodelava(); // vaša logika agregacije
  const url = process.env.CENIKI_API_URL || "http://localhost:3000";
  const res = await fetch(`${url}/api/dodelave-times`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ casi, source: "delovni-nalog" }),
  });
  if (!res.ok) throw new Error("Napaka pri pošiljanju časov v Cenike");
  return res.json();
}
```

#### Python

```python
import requests

def export_dodelave_times_to_ceniki(casi: dict, base_url: str = "http://localhost:3000"):
    r = requests.post(
        f"{base_url}/api/dodelave-times",
        json={"casi": casi, "source": "delovni-nalog"},
    )
    r.raise_for_status()
    return r.json()
```

---

### 5. Nastavitev v Delovnem nalogu

- V Delovnem nalogu nastavite spremenljivko okolja **CENIKI_API_URL** na URL Cenikov Trajanus (npr. `https://ceniki.example.com` ali `http://localhost:3000`). Če ni nastavljena, se podatki le zapišejo v log (dry run).
- Delovni nalog pošilja čase periodično (vsakih 15 s) in ob vsaki spremembi obremenitve.

### 6. Priporočila

- Čase pošiljajte ob zaključku delovnega naloga ali ob določenih intervalih (npr. vsako noč).
- Če Ceniki Trajanus tečejo na drugem strežniku, preverite dostop (firewall, HTTPS, eventualno API ključ, če ga dodate).
- Imena dodelav morajo biti **identična** kot v seznamu zgoraj (velikost črk, presledki, črke č/ž/š).

---

## Kje v Cenikih Trajanus se časi uporabljajo

1. **Stran Časi dodelav** – pregled uvoženih časov.
2. **Sekcija Dodelave** – pri vsaki dodelavi se prikaže njen realni čas (npr. `(1.2h)`), če je na voljo.
3. **Izbira dodelav** – uporabnik označi, katere dodelave veljajo za izdelek (checkboxi + polja z „Dodelava za čas“ v builderju).
4. **Skupni čas** – v povzetku cenika se prikaže vsota časov le za izbrane dodelave.
5. **Polje „Dodelava za čas“ v builderju** – pri vnosnem polju lahko nastavite, da se čas določene dodelave prišteje, ko je polje izpolnjeno.
