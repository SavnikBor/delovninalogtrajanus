# Backend (Delovni nalog)

## Kanonični entrypoint

**Produkcijski in razvojni API teče iz `server.js`** (v mapi `backend/`). To je isti vhod kot pri zagonu iz korena repozitorija (`npm run server` / `npm start`).

## Zagon

Iz mape `backend/`:

```bash
npm run dev
# ali
npm start
```

Oba ukaza zaženeta `node server.js` (privzeti port običajno **5000**, glej `PORT` v `.env`).

### Samodejni reload ob spremembi datoteke (Node 18+)

```bash
npm run dev:watch
```

## Legacy TypeScript (`src/app.ts`) — **deprecated**

`backend/src/app.ts` **ni** del aktivnega dev/prod toka. Kanonični runtime za API je **`server.js`** (glej zgoraj). Ta TypeScript datoteka ostaja v repozitoriju kot zgodovinska/vzporedna implementacija; če jo zaženete ročno (`ts-node`, `dist/app.js`), dobite **drugačen nabor poti in obnašanja** kot pri `server.js` — zato je za običajen razvoj in testiranje integracije **priporočljivo `app.ts sploh ne zaganjati`**.

### Poti, ki v `server.js` **nimajo** neposrednega ekvivalenta

Te poti obstajajo v `app.ts`, v kanoničnem backendu pa so nadomeščene z drugimi ali manjkajo:

| Pot | Opomba |
|-----|--------|
| `POST /api/parse-email` | — |
| `GET /api/prioritetni-nalogi` | — |
| `GET /api/analitika/tehnologi` | V `server.js` je npr. `GET /api/analitika/tehnologi-kpi` |
| `GET /api/analitika/produkti` | V `server.js` je npr. `GET /api/analitika/produkti-kpi` |

### Skupaj z `server.js`, a z drugačno implementacijo

Nekatere poti (npr. `GET /api/kupec`, `POST /api/delovni-nalog`, `POST /api/poslji-email`, `POST /api/ai/razberiNalogIzEmaila`) so v obeh datotekah, vendar se lahko razlikujejo v validaciji, SQL in odzivih.

### Frontend v tem repozitoriju

Trenutni frontend se proxy-ja na **`server.js`** in **ne kliče** zgornjih poti, ki so specifične za `app.ts` (`/api/parse-email`, `/api/prioritetni-nalogi`, `/api/analitika/tehnologi` in `/api/analitika/produkti` brez `-kpi`).

### Kompilacija (le za legacy / lokalno preverjanje)

```bash
npm run build:legacy-ts
```

Za zagon aplikacije **ne** uporabljajte `dist/app.js` kot nadomestek za `server.js`.
