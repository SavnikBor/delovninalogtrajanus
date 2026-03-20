# Delovni nalog

## Backend

**Kanonični backend entrypoint je `backend/server.js`.**

- Iz **korena** repozitorija: `npm run server` ali `npm start` (oba zaženeta `node server.js` v `backend/`).
- Iz mape **`backend/`**: `npm run dev` ali `npm run start` — enako, `server.js`.

Podrobnosti in legacy opomba za `src/app.ts`: glej [`backend/README.md`](backend/README.md).

## Frontend

Iz korena: `npm run client` / `npm run dev` (glej `package.json`).

## Celoten stack (dev)

```bash
npm run dev:http
```

Frontend uporablja Vite proxy za `/api` na backend (privzeto `http://localhost:5000`).
