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

## Legacy TypeScript (`src/app.ts`)

Datoteka `src/app.ts` je **vzporedna zgodovinska** implementacija; **ni** glavni strežnik. Kompilacija v `dist/` je na voljo le za morebitno lokalno preverjanje:

```bash
npm run build:legacy-ts
```

Za zagon aplikacije **ne** uporabljajte `dist/app.js`.
