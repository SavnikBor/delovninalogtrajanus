'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const sql = require('mssql');
const { buildDbConfig } = require('../config/database');

function createIzsekovalnaOrodjaRouter() {
  const router = express.Router();

  const IZSEK_DB_NAME = 'DelovniNalog_TEST';

  function normalizeIzsekovalnoOrodjeRow(r) {
  const row = r || {};
  return {
    OrodjeID: Number(row.OrodjeID ?? row.orodjeID ?? row.id ?? 0) || 0,
    ZaporednaStevilka: Number(row.ZaporednaStevilka ?? row.zaporednaStevilka ?? row.stevilka ?? 0) || 0,
    IsFree: !!(row.IsFree ?? row.isFree ?? row.ProstoMesto ?? row.prostoMesto ?? false),
    StevilkaNaloga: (row.StevilkaNaloga == null ? null : (Number(row.StevilkaNaloga) || null)),
    Opis: (row.Opis ?? '').toString(),
    VelikostKoncnegaProdukta: (row.VelikostKoncnegaProdukta ?? '').toString(),
    LetoIzdelave: (row.LetoIzdelave == null ? null : (Number(row.LetoIzdelave) || null)),
    KupecID: (row.KupecID == null ? null : (Number(row.KupecID) || null)),
    StrankaNaziv: (row.StrankaNaziv ?? '').toString(),
    Komentar: (row.Komentar ?? '').toString(),
    CreatedAt: row.CreatedAt ? new Date(row.CreatedAt).toISOString() : null,
    UpdatedAt: row.UpdatedAt ? new Date(row.UpdatedAt).toISOString() : null,
  };
}

async function ensureIzsekovalnaOrodjaSchema(pool) {
  // Ustvari tabelo, če ne obstaja. Namenoma brez FKs, ker mora delovati tudi, če struktura Kupec/DelovniNalog ni identična.
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.IzsekovalnoOrodje', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.IzsekovalnoOrodje (
        OrodjeID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_IzsekovalnoOrodje PRIMARY KEY,
        ZaporednaStevilka INT NOT NULL,
        IsFree BIT NOT NULL CONSTRAINT DF_IzsekovalnoOrodje_IsFree DEFAULT(0),
        StevilkaNaloga INT NULL,
        Opis NVARCHAR(500) NULL,
        VelikostKoncnegaProdukta NVARCHAR(100) NULL,
        LetoIzdelave INT NULL,
        KupecID INT NULL,
        StrankaNaziv NVARCHAR(255) NULL,
        Komentar NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_IzsekovalnoOrodje_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt DATETIME2 NULL
      );
    END;

    IF NOT EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='IzsekovalnoOrodje' AND COLUMN_NAME='IsFree'
    )
    BEGIN
      ALTER TABLE dbo.IzsekovalnoOrodje
      ADD IsFree BIT NOT NULL CONSTRAINT DF_IzsekovalnoOrodje_IsFree DEFAULT(0);
    END;

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = N'UX_IzsekovalnoOrodje_Zaporedna' AND object_id = OBJECT_ID(N'dbo.IzsekovalnoOrodje')
    )
    BEGIN
      CREATE UNIQUE INDEX UX_IzsekovalnoOrodje_Zaporedna ON dbo.IzsekovalnoOrodje(ZaporednaStevilka);
    END;
  `);
}

let izsekovalnaSeedAttempted = false;
async function maybeSeedIzsekovalnaOrodja(pool) {
  // Seed samo enkrat na zagon in samo če je tabela prazna.
  if (izsekovalnaSeedAttempted) return;
  izsekovalnaSeedAttempted = true;
  try {
    const cntRes = await pool.request().query(`SELECT COUNT(1) AS cnt FROM dbo.IzsekovalnoOrodje`);
    const cnt = cntRes.recordset && cntRes.recordset[0] ? Number(cntRes.recordset[0].cnt) : 0;
    if (cnt > 0) return;

    const seedPath = path.join(__dirname, '../data/izsekovalna-orodja-seed.json');
    if (!fs.existsSync(seedPath)) return;
    const raw = fs.readFileSync(seedPath, 'utf-8');
    const seed = JSON.parse(raw);
    if (!Array.isArray(seed) || seed.length === 0) return;

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      for (const s of seed) {
        const r = new sql.Request(tx);
        r.input('ZaporednaStevilka', sql.Int, Number(s?.ZaporednaStevilka ?? s?.zaporednaStevilka ?? s?.st ?? 0) || 0);
        r.input('StevilkaNaloga', sql.Int, s?.StevilkaNaloga != null ? Number(s.StevilkaNaloga) : null);
        r.input('Opis', sql.NVarChar(500), (s?.Opis ?? '').toString());
        r.input('Velikost', sql.NVarChar(100), (s?.VelikostKoncnegaProdukta ?? s?.Velikost ?? '').toString());
        r.input('LetoIzdelave', sql.Int, s?.LetoIzdelave != null ? Number(s.LetoIzdelave) : null);
        r.input('KupecID', sql.Int, s?.KupecID != null ? Number(s.KupecID) : null);
        r.input('StrankaNaziv', sql.NVarChar(255), (s?.StrankaNaziv ?? s?.Stranka ?? '').toString());
        r.input('Komentar', sql.NVarChar(sql.MAX), (s?.Komentar ?? s?.komentar ?? '').toString());
        await r.query(`
          INSERT INTO dbo.IzsekovalnoOrodje
            (ZaporednaStevilka, StevilkaNaloga, Opis, VelikostKoncnegaProdukta, LetoIzdelave, KupecID, StrankaNaziv, Komentar)
          VALUES
            (@ZaporednaStevilka, @StevilkaNaloga, @Opis, @Velikost, @LetoIzdelave, @KupecID, @StrankaNaziv, @Komentar)
        `);
      }
      await tx.commit();
      console.log(`✅ Seed IzsekovalnaOrodja: inserted ${seed.length} rows`);
    } catch (e) {
      try { await tx.rollback(); } catch {}
      console.warn('⚠️  Seed IzsekovalnaOrodja ni uspel:', e && e.message ? e.message : String(e));
    }
  } catch (e) {
    console.warn('⚠️  Seed IzsekovalnaOrodja preskočen:', e && e.message ? e.message : String(e));
  }
}

// GET: seznam izsekovalnih orodij
router.get('/api/izsekovalna-orodja', async (req, res) => {
  let pool = null;
  try {
    const cfg = buildDbConfig(IZSEK_DB_NAME);
    pool = await new sql.ConnectionPool(cfg).connect();
    await ensureIzsekovalnaOrodjaSchema(pool);
    await maybeSeedIzsekovalnaOrodja(pool);
    const result = await pool.request().query(`
      SELECT OrodjeID, ZaporednaStevilka, IsFree, StevilkaNaloga, Opis, VelikostKoncnegaProdukta, LetoIzdelave, KupecID, StrankaNaziv, Komentar, CreatedAt, UpdatedAt
      FROM dbo.IzsekovalnoOrodje
      ORDER BY ZaporednaStevilka ASC
    `);
    return res.json((result.recordset || []).map(normalizeIzsekovalnoOrodjeRow));
  } catch (e) {
    console.error('Napaka /api/izsekovalna-orodja:', e);
    return res.status(500).json({ ok: false, error: 'Napaka pri branju izsekovalnih orodij', details: e && e.message ? e.message : String(e) });
  } finally {
    try { if (pool) await pool.close(); } catch {}
  }
});

// POST: dodaj izsekovalno orodje
router.post('/api/izsekovalna-orodja', async (req, res) => {
  let pool = null;
  try {
    const body = req.body || {};
    const cfg = buildDbConfig(IZSEK_DB_NAME);
    pool = await new sql.ConnectionPool(cfg).connect();
    await ensureIzsekovalnaOrodjaSchema(pool);
    await maybeSeedIzsekovalnaOrodja(pool);

    const requestedZapRaw = body.ZaporednaStevilka ?? body.zaporednaStevilka ?? body.zaporedna ?? null;
    let requestedZap = Number(requestedZapRaw);
    if (!Number.isFinite(requestedZap) || requestedZap <= 0) requestedZap = NaN;

    // Če ni zaporedne številke: zasedi prvo prosto mesto (IsFree=1), sicer dodaj na konec.
    let zap = requestedZap;
    if (!Number.isFinite(zap) || zap <= 0) {
      const freeRes = await pool.request().query(`
        SELECT TOP 1 ZaporednaStevilka
        FROM dbo.IzsekovalnoOrodje
        WHERE IsFree = 1
        ORDER BY ZaporednaStevilka ASC
      `);
      const freeZap = freeRes.recordset && freeRes.recordset[0] ? Number(freeRes.recordset[0].ZaporednaStevilka) : null;
      if (freeZap && Number.isFinite(freeZap)) {
        zap = freeZap;
      } else {
        const maxRes = await pool.request().query(`SELECT ISNULL(MAX(ZaporednaStevilka), 0) AS mx FROM dbo.IzsekovalnoOrodje`);
        const mx = maxRes.recordset && maxRes.recordset[0] ? Number(maxRes.recordset[0].mx) : 0;
        zap = (Number.isFinite(mx) ? mx : 0) + 1;
      }
    }

    // Če zap že obstaja in je prosto -> zapolni; če obstaja in NI prosto -> conflict.
    const exists = await pool.request()
      .input('zap', sql.Int, zap)
      .query(`SELECT TOP 1 OrodjeID, IsFree FROM dbo.IzsekovalnoOrodje WHERE ZaporednaStevilka=@zap`);
    const existing = exists.recordset && exists.recordset[0] ? exists.recordset[0] : null;
    const canFill = existing && (existing.IsFree === true || existing.IsFree === 1);
    if (existing && !canFill) {
      return res.status(409).json({ ok: false, error: `Zaporedna številka ${zap} že obstaja.` });
    }

    const stevilkaNalogaRaw = body.StevilkaNaloga ?? body.stevilkaNaloga ?? body.nalog ?? null;
    const stevilkaNaloga = (stevilkaNalogaRaw == null || String(stevilkaNalogaRaw).trim() === '') ? null : (Number(stevilkaNalogaRaw) || null);
    const letoRaw = body.LetoIzdelave ?? body.letoIzdelave ?? null;
    const leto = (letoRaw == null || String(letoRaw).trim() === '') ? null : (Number(letoRaw) || null);
    const kupecIDRaw = body.KupecID ?? body.kupecID ?? null;
    const kupecID = (kupecIDRaw == null || String(kupecIDRaw).trim() === '') ? null : (Number(kupecIDRaw) || null);
    const strankaNaziv = (body.StrankaNaziv ?? body.strankaNaziv ?? body.Stranka ?? '').toString();

    const request = pool.request();
    request.input('ZaporednaStevilka', sql.Int, zap);
    request.input('StevilkaNaloga', sql.Int, stevilkaNaloga);
    request.input('Opis', sql.NVarChar(500), (body.Opis ?? '').toString());
    request.input('Velikost', sql.NVarChar(100), (body.VelikostKoncnegaProdukta ?? body.Velikost ?? '').toString());
    request.input('LetoIzdelave', sql.Int, leto);
    request.input('KupecID', sql.Int, kupecID);
    request.input('StrankaNaziv', sql.NVarChar(255), strankaNaziv);
    request.input('Komentar', sql.NVarChar(sql.MAX), (body.Komentar ?? '').toString());

    if (canFill) {
      request.input('id', sql.Int, Number(existing.OrodjeID));
      const upd = await request.query(`
        UPDATE dbo.IzsekovalnoOrodje
        SET
          IsFree = 0,
          StevilkaNaloga = @StevilkaNaloga,
          Opis = @Opis,
          VelikostKoncnegaProdukta = @Velikost,
          LetoIzdelave = @LetoIzdelave,
          KupecID = @KupecID,
          StrankaNaziv = @StrankaNaziv,
          Komentar = @Komentar,
          UpdatedAt = SYSUTCDATETIME()
        WHERE OrodjeID = @id;
        SELECT TOP 1 *
        FROM dbo.IzsekovalnoOrodje
        WHERE OrodjeID = @id;
      `);
      const row = upd.recordset && upd.recordset[0] ? normalizeIzsekovalnoOrodjeRow(upd.recordset[0]) : null;
      return res.json({ ok: true, orodje: row });
    } else {
      const ins = await request.query(`
        INSERT INTO dbo.IzsekovalnoOrodje
          (ZaporednaStevilka, IsFree, StevilkaNaloga, Opis, VelikostKoncnegaProdukta, LetoIzdelave, KupecID, StrankaNaziv, Komentar)
        VALUES
          (@ZaporednaStevilka, 0, @StevilkaNaloga, @Opis, @Velikost, @LetoIzdelave, @KupecID, @StrankaNaziv, @Komentar);
        SELECT TOP 1 *
        FROM dbo.IzsekovalnoOrodje
        WHERE OrodjeID = SCOPE_IDENTITY();
      `);
      const row = ins.recordset && ins.recordset[0] ? normalizeIzsekovalnoOrodjeRow(ins.recordset[0]) : null;
      return res.json({ ok: true, orodje: row });
    }
  } catch (e) {
    console.error('Napaka POST /api/izsekovalna-orodja:', e);
    return res.status(500).json({ ok: false, error: 'Napaka pri dodajanju izsekovalnega orodja', details: e && e.message ? e.message : String(e) });
  } finally {
    try { if (pool) await pool.close(); } catch {}
  }
});

// POST: uvoz iz Excela/CSV (insert-only; obstoječih ne spreminjaj)
// Body: { rows: Array<{ ZaporednaStevilka, StevilkaNaloga, Opis, VelikostKoncnegaProdukta, LetoIzdelave, StrankaNaziv, Komentar }> } ali kar array.
//
// Pomembno: ta ruta mora biti pred /api/izsekovalna-orodja/:id, sicer Express ujame "import" kot :id.
router.post('/api/izsekovalna-orodja/import', async (req, res) => {
  let pool = null;
  try {
    const body = req.body || {};
    const rows = Array.isArray(body) ? body : (Array.isArray(body.rows) ? body.rows : []);
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ ok: false, error: 'Manjka rows (array).' });
    }
    if (rows.length > 5000) {
      return res.status(413).json({ ok: false, error: 'Preveč vrstic (max 5000 na uvoz).' });
    }
    const cfg = buildDbConfig(IZSEK_DB_NAME);
    pool = await new sql.ConnectionPool(cfg).connect();
    await ensureIzsekovalnaOrodjaSchema(pool);
    await maybeSeedIzsekovalnaOrodja(pool);

    const tx = new sql.Transaction(pool);
    await tx.begin();
    let inserted = 0;
    let skipped = 0;
    try {
      for (const raw of rows) {
        const zap = Number(raw?.ZaporednaStevilka ?? raw?.zaporednaStevilka ?? raw?.st ?? NaN);
        if (!Number.isFinite(zap) || zap <= 0) { skipped++; continue; }
        const stevilkaNalogaRaw = raw?.StevilkaNaloga ?? raw?.stevilkaNaloga ?? raw?.nalog ?? null;
        const stevilkaNaloga = (stevilkaNalogaRaw == null || String(stevilkaNalogaRaw).trim() === '') ? null : (Number(stevilkaNalogaRaw) || null);
        const letoRaw = raw?.LetoIzdelave ?? raw?.letoIzdelave ?? null;
        const leto = (letoRaw == null || String(letoRaw).trim() === '') ? null : (Number(letoRaw) || null);

        const r = new sql.Request(tx);
        r.input('ZaporednaStevilka', sql.Int, zap);
        r.input('StevilkaNaloga', sql.Int, stevilkaNaloga);
        r.input('Opis', sql.NVarChar(500), (raw?.Opis ?? '').toString());
        r.input('Velikost', sql.NVarChar(100), (raw?.VelikostKoncnegaProdukta ?? raw?.Velikost ?? '').toString());
        r.input('LetoIzdelave', sql.Int, leto);
        r.input('KupecID', sql.Int, raw?.KupecID != null ? Number(raw.KupecID) : null);
        r.input('StrankaNaziv', sql.NVarChar(255), (raw?.StrankaNaziv ?? raw?.Stranka ?? '').toString());
        r.input('Komentar', sql.NVarChar(sql.MAX), (raw?.Komentar ?? raw?.komentar ?? '').toString());

        const ins = await r.query(`
          DECLARE @didWrite INT = 0;
          IF EXISTS (SELECT 1 FROM dbo.IzsekovalnoOrodje WHERE ZaporednaStevilka=@ZaporednaStevilka AND IsFree=1)
          BEGIN
            UPDATE dbo.IzsekovalnoOrodje
            SET
              IsFree=0,
              StevilkaNaloga=@StevilkaNaloga,
              Opis=@Opis,
              VelikostKoncnegaProdukta=@Velikost,
              LetoIzdelave=@LetoIzdelave,
              KupecID=@KupecID,
              StrankaNaziv=@StrankaNaziv,
              Komentar=@Komentar,
              UpdatedAt=SYSUTCDATETIME()
            WHERE ZaporednaStevilka=@ZaporednaStevilka;
            SET @didWrite = 1;
          END
          ELSE IF NOT EXISTS (SELECT 1 FROM dbo.IzsekovalnoOrodje WHERE ZaporednaStevilka=@ZaporednaStevilka)
          BEGIN
            INSERT INTO dbo.IzsekovalnoOrodje
              (ZaporednaStevilka, IsFree, StevilkaNaloga, Opis, VelikostKoncnegaProdukta, LetoIzdelave, KupecID, StrankaNaziv, Komentar)
            VALUES
              (@ZaporednaStevilka, 0, @StevilkaNaloga, @Opis, @Velikost, @LetoIzdelave, @KupecID, @StrankaNaziv, @Komentar);
            SET @didWrite = 1;
          END
          SELECT @didWrite AS didWrite;
        `);
        const did = ins.recordset && ins.recordset[0] ? Number(ins.recordset[0].didWrite) : 0;
        if (did === 1) inserted++;
        else skipped++;
      }
      await tx.commit();
    } catch (e) {
      try { await tx.rollback(); } catch {}
      throw e;
    }

    return res.json({ ok: true, inserted, skipped, total: rows.length });
  } catch (e) {
    console.error('Napaka POST /api/izsekovalna-orodja/import:', e);
    return res.status(500).json({ ok: false, error: 'Napaka pri uvozu izsekovalnih orodij', details: e && e.message ? e.message : String(e) });
  } finally {
    try { if (pool) await pool.close(); } catch {}
  }
});

// POST: posodobi izsekovalno orodje (namerno POST, enako kot pri /api/kupec/:id)
// Opomba: route regex (npr. :id(\\d+)) ni kompatibilen z vsemi router verzijami (Express 5 stack),
// zato validacijo naredimo v handlerju.
router.post('/api/izsekovalna-orodja/:id', async (req, res) => {
  let pool = null;
  try {
    const id = parseInt(String(req.params.id || ''), 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'Neveljaven id.' });
    const body = req.body || {};
    const cfg = buildDbConfig(IZSEK_DB_NAME);
    pool = await new sql.ConnectionPool(cfg).connect();
    await ensureIzsekovalnaOrodjaSchema(pool);

    const existsRow = await pool.request().input('id', sql.Int, id).query(`SELECT TOP 1 * FROM dbo.IzsekovalnoOrodje WHERE OrodjeID=@id`);
    if (!existsRow.recordset || existsRow.recordset.length === 0) return res.status(404).json({ ok: false, error: 'Vrstica ni najdena.' });

    const current = existsRow.recordset[0];

    const zapRaw = body.ZaporednaStevilka ?? body.zaporednaStevilka ?? null;
    const zap = (zapRaw == null || String(zapRaw).trim() === '') ? Number(current.ZaporednaStevilka) : (Number(zapRaw) || Number(current.ZaporednaStevilka));
    if (!Number.isFinite(zap) || zap <= 0) return res.status(400).json({ ok: false, error: 'Zaporedna številka mora biti pozitivna.' });

    if (Number(zap) !== Number(current.ZaporednaStevilka)) {
      const conflict = await pool.request()
        .input('zap', sql.Int, zap)
        .input('id', sql.Int, id)
        .query(`SELECT TOP 1 OrodjeID FROM dbo.IzsekovalnoOrodje WHERE ZaporednaStevilka=@zap AND OrodjeID<>@id`);
      if (conflict.recordset && conflict.recordset.length > 0) {
        return res.status(409).json({ ok: false, error: `Zaporedna številka ${zap} je že zasedena.` });
      }
    }

    const stevilkaNalogaRaw = body.StevilkaNaloga ?? body.stevilkaNaloga ?? null;
    const stevilkaNaloga = (stevilkaNalogaRaw == null || String(stevilkaNalogaRaw).trim() === '') ? null : (Number(stevilkaNalogaRaw) || null);
    const letoRaw = body.LetoIzdelave ?? body.letoIzdelave ?? null;
    const leto = (letoRaw == null || String(letoRaw).trim() === '') ? null : (Number(letoRaw) || null);
    const kupecIDRaw = body.KupecID ?? body.kupecID ?? null;
    const kupecID = (kupecIDRaw == null || String(kupecIDRaw).trim() === '') ? null : (Number(kupecIDRaw) || null);

    const r = pool.request();
    r.input('id', sql.Int, id);
    r.input('ZaporednaStevilka', sql.Int, zap);
    r.input('StevilkaNaloga', sql.Int, stevilkaNaloga);
    r.input('Opis', sql.NVarChar(500), (body.Opis ?? current.Opis ?? '').toString());
    r.input('Velikost', sql.NVarChar(100), (body.VelikostKoncnegaProdukta ?? body.Velikost ?? current.VelikostKoncnegaProdukta ?? '').toString());
    r.input('LetoIzdelave', sql.Int, leto);
    r.input('KupecID', sql.Int, kupecID);
    r.input('StrankaNaziv', sql.NVarChar(255), (body.StrankaNaziv ?? body.strankaNaziv ?? current.StrankaNaziv ?? '').toString());
    r.input('Komentar', sql.NVarChar(sql.MAX), (body.Komentar ?? current.Komentar ?? '').toString());

    const upd = await r.query(`
      UPDATE dbo.IzsekovalnoOrodje
      SET
        ZaporednaStevilka=@ZaporednaStevilka,
        IsFree=0,
        StevilkaNaloga=@StevilkaNaloga,
        Opis=@Opis,
        VelikostKoncnegaProdukta=@Velikost,
        LetoIzdelave=@LetoIzdelave,
        KupecID=@KupecID,
        StrankaNaziv=@StrankaNaziv,
        Komentar=@Komentar,
        UpdatedAt=SYSUTCDATETIME()
      WHERE OrodjeID=@id;
      SELECT TOP 1 *
      FROM dbo.IzsekovalnoOrodje
      WHERE OrodjeID=@id;
    `);
    const row = upd.recordset && upd.recordset[0] ? normalizeIzsekovalnoOrodjeRow(upd.recordset[0]) : null;
    return res.json({ ok: true, orodje: row });
  } catch (e) {
    console.error('Napaka POST /api/izsekovalna-orodja/:id:', e);
    return res.status(500).json({ ok: false, error: 'Napaka pri posodobitvi izsekovalnega orodja', details: e && e.message ? e.message : String(e) });
  } finally {
    try { if (pool) await pool.close(); } catch {}
  }
});

// DELETE: izbriši izsekovalno orodje (luknje so dovoljene; ne renumeriraj)
// DELETE: sprosti mesto (pusti ZaporednaStevilka, izbriše podatke)
router.delete('/api/izsekovalna-orodja/:id', async (req, res) => {
  let pool = null;
  try {
    const id = parseInt(String(req.params.id || ''), 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'Neveljaven id.' });
    const cfg = buildDbConfig(IZSEK_DB_NAME);
    pool = await new sql.ConnectionPool(cfg).connect();
    await ensureIzsekovalnaOrodjaSchema(pool);
    const exist = await pool.request().input('id', sql.Int, id).query(`SELECT TOP 1 OrodjeID FROM dbo.IzsekovalnoOrodje WHERE OrodjeID=@id`);
    if (!exist.recordset || exist.recordset.length === 0) return res.status(404).json({ ok: false, error: 'Vrstica ni najdena.' });
    await pool.request().input('id', sql.Int, id).query(`
      UPDATE dbo.IzsekovalnoOrodje
      SET
        IsFree = 1,
        StevilkaNaloga = NULL,
        Opis = NULL,
        VelikostKoncnegaProdukta = NULL,
        LetoIzdelave = NULL,
        KupecID = NULL,
        StrankaNaziv = NULL,
        Komentar = NULL,
        UpdatedAt = SYSUTCDATETIME()
      WHERE OrodjeID=@id
    `);
    return res.json({ ok: true });
  } catch (e) {
    console.error('Napaka DELETE /api/izsekovalna-orodja/:id:', e);
    return res.status(500).json({ ok: false, error: 'Napaka pri brisanju izsekovalnega orodja', details: e && e.message ? e.message : String(e) });
  } finally {
    try { if (pool) await pool.close(); } catch {}
  }
});

  return router;
}

module.exports = { createIzsekovalnaOrodjaRouter };
