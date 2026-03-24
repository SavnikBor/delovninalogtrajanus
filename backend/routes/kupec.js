'use strict';

const express = require('express');
const sql = require('mssql');
const { buildDbConfig } = require('../config/database');

async function connectPoolForKupec() {
  const targetDb = process.env.DB_NAME || process.env.DB_NAME_TEST || 'DelovniNalog_TEST';
  const cfg = buildDbConfig(targetDb);
  try {
    return await new sql.ConnectionPool(cfg).connect();
  } catch (e) {
    const hasInstance = !!(cfg.options && cfg.options.instanceName);
    if (hasInstance && cfg.port) {
      const cfg2 = { ...cfg, port: undefined };
      return await new sql.ConnectionPool(cfg2).connect();
    }
    throw e;
  }
}

function createKupecRouter() {
  const router = express.Router();

  // API endpoint: GET /api/kupec
  router.get('/api/kupec', async (req, res) => {
    let pool = null;
    try {
      pool = await connectPoolForKupec();
      const result = await pool.request().query('SELECT * FROM dbo.Kupec');
      res.json(result.recordset || []);
    } catch (err) {
      console.error('Napaka pri poizvedbi:', err);
      res.status(500).json({
        error: 'Napaka pri poizvedbi',
        details: err && err.message ? err.message : String(err),
      });
    } finally {
      try { if (pool) await pool.close(); } catch {}
    }
  });

  // API endpoint: POST /api/kupec (dodaj novo stranko)
  router.post('/api/kupec', async (req, res) => {
    let pool = null;
    try {
      const { Naziv, Naslov, Posta, Kraj, Telefon, Fax, IDzaDDV, email } = req.body || {};
      const nazivTrim = String(Naziv || '').trim();
      const hasOtherKupecPolje = [Naslov, Posta, Kraj, Telefon, Fax, IDzaDDV, email].some((x) => String(x || '').trim());
      if (!nazivTrim && !hasOtherKupecPolje) {
        return res.status(400).json({ ok: false, error: 'Vnesite vsaj naziv ali drug kupčev podatek.' });
      }
      pool = await connectPoolForKupec();
      // Preveri ali stolpec Email obstaja, če ne, ga poskusi dodati
      let hasEmailColumn = false;
      try {
        const check = await pool.request().query(`
        SELECT 1 AS x
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Kupec' AND COLUMN_NAME = 'Email'
      `);
        hasEmailColumn = (check.recordset && check.recordset.length > 0);
        if (!hasEmailColumn) {
          await pool.request().query(`ALTER TABLE dbo.Kupec ADD Email NVARCHAR(255) NULL`);
          hasEmailColumn = true;
        }
      } catch (schemaErr) {
        // Če nimamo pravic za ALTER TABLE, nadaljuj brez stolpca Email
        console.warn('⚠️  Ne morem dodati stolpca Email v dbo.Kupec (nadaljujem brez njega):', schemaErr && schemaErr.message ? schemaErr.message : schemaErr);
        hasEmailColumn = false;
      }

      const request = pool.request();
      request.input('Naziv', sql.NVarChar(255), nazivTrim || '(Kupčevi podatki brez naziva)');
      request.input('Naslov', sql.NVarChar(255), Naslov || '');
      request.input('Posta', sql.NVarChar(50), Posta || '');
      request.input('Kraj', sql.NVarChar(255), Kraj || '');
      request.input('Telefon', sql.NVarChar(100), Telefon || '');
      request.input('Fax', sql.NVarChar(100), Fax || '');
      request.input('IDzaDDV', sql.NVarChar(100), IDzaDDV || '');
      if (hasEmailColumn) {
        request.input('Email', sql.NVarChar(255), email || '');
      }

      // Insert novega kupca
      const insertQuery = hasEmailColumn
        ? `
          INSERT INTO dbo.Kupec (Naziv, Naslov, Posta, Kraj, Telefon, Fax, IDzaDDV, Email)
          VALUES (@Naziv, @Naslov, @Posta, @Kraj, @Telefon, @Fax, @IDzaDDV, @Email);
          SELECT SCOPE_IDENTITY() AS KupecID;
        `
        : `
          INSERT INTO dbo.Kupec (Naziv, Naslov, Posta, Kraj, Telefon, Fax, IDzaDDV)
          VALUES (@Naziv, @Naslov, @Posta, @Kraj, @Telefon, @Fax, @IDzaDDV);
          SELECT SCOPE_IDENTITY() AS KupecID;
        `;
      const result = await request.query(insertQuery);
      const newKupecID = result.recordset && result.recordset[0] ? parseInt(result.recordset[0].KupecID, 10) : null;
      return res.json({
        ok: true,
        kupec: {
          KupecID: newKupecID,
          Naziv: nazivTrim || '(Kupčevi podatki brez naziva)',
          Naslov,
          Posta,
          Kraj,
          Telefon,
          Fax,
          IDzaDDV,
          email: hasEmailColumn ? (email || '') : undefined
        }
      });
    } catch (err) {
      console.error('Napaka pri vnosu kupca:', err);
      res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
    } finally {
      try { if (pool) await pool.close(); } catch {}
    }
  });

  // API endpoint: POST /api/kupec/:id (posodobi obstoječo stranko) — namerno POST (bolj robustno preko proxy/setup)
  router.post('/api/kupec/:id', async (req, res) => {
    let pool = null;
    try {
      const KupecID = parseInt(String(req.params.id || ''), 10);
      if (!Number.isFinite(KupecID) || KupecID <= 0) {
        return res.status(400).json({ ok: false, error: 'Neveljaven KupecID.' });
      }

      const { Naziv, Naslov, Posta, Kraj, Telefon, Fax, IDzaDDV, email } = req.body || {};
      if (!Naziv) {
        return res.status(400).json({ ok: false, error: 'Polje Naziv je obvezno.' });
      }

      pool = await connectPoolForKupec();

      // Preveri ali stolpec Email obstaja, če ne, ga poskusi dodati (enako kot pri POST)
      let hasEmailColumn = false;
      try {
        const check = await pool.request().query(`
        SELECT 1 AS x
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Kupec' AND COLUMN_NAME = 'Email'
      `);
        hasEmailColumn = (check.recordset && check.recordset.length > 0);
        if (!hasEmailColumn) {
          await pool.request().query(`ALTER TABLE dbo.Kupec ADD Email NVARCHAR(255) NULL`);
          hasEmailColumn = true;
        }
      } catch (schemaErr) {
        console.warn('⚠️  Ne morem dodati stolpca Email v dbo.Kupec (nadaljujem brez njega):', schemaErr && schemaErr.message ? schemaErr.message : schemaErr);
        hasEmailColumn = false;
      }

      // Preveri ali kupec obstaja
      const exist = await pool.request()
        .input('KupecID', sql.Int, KupecID)
        .query(`SELECT TOP 1 KupecID FROM dbo.Kupec WHERE KupecID = @KupecID`);
      if (!exist.recordset || exist.recordset.length === 0) {
        return res.status(404).json({ ok: false, error: 'Kupec ni najden.' });
      }

      const request = pool.request();
      request.input('KupecID', sql.Int, KupecID);
      request.input('Naziv', sql.NVarChar(255), Naziv || '');
      request.input('Naslov', sql.NVarChar(255), Naslov || '');
      request.input('Posta', sql.NVarChar(50), Posta || '');
      request.input('Kraj', sql.NVarChar(255), Kraj || '');
      request.input('Telefon', sql.NVarChar(100), Telefon || '');
      request.input('Fax', sql.NVarChar(100), Fax || '');
      request.input('IDzaDDV', sql.NVarChar(100), IDzaDDV || '');
      if (hasEmailColumn) {
        request.input('Email', sql.NVarChar(255), email || '');
      }

      const updateQuery = hasEmailColumn
        ? `
        UPDATE dbo.Kupec
        SET Naziv=@Naziv, Naslov=@Naslov, Posta=@Posta, Kraj=@Kraj, Telefon=@Telefon, Fax=@Fax, IDzaDDV=@IDzaDDV, Email=@Email
        WHERE KupecID=@KupecID;
        SELECT * FROM dbo.Kupec WHERE KupecID=@KupecID;
      `
        : `
        UPDATE dbo.Kupec
        SET Naziv=@Naziv, Naslov=@Naslov, Posta=@Posta, Kraj=@Kraj, Telefon=@Telefon, Fax=@Fax, IDzaDDV=@IDzaDDV
        WHERE KupecID=@KupecID;
        SELECT * FROM dbo.Kupec WHERE KupecID=@KupecID;
      `;

      const updated = await request.query(updateQuery);
      const row = updated.recordset && updated.recordset[0] ? updated.recordset[0] : null;
      return res.json({ ok: true, kupec: row });
    } catch (err) {
      console.error('Napaka pri posodobitvi kupca:', err);
      res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
    } finally {
      try { if (pool) await pool.close(); } catch {}
    }
  });

  // API endpoint: DELETE /api/kupec/:id (izbriši stranko) — zahteva kodo 7474
  router.delete('/api/kupec/:id', async (req, res) => {
    let pool = null;
    try {
      const KupecID = parseInt(String(req.params.id || ''), 10);
      if (!Number.isFinite(KupecID) || KupecID <= 0) {
        return res.status(400).json({ ok: false, error: 'Neveljaven KupecID.' });
      }
      const code = String((req.body && (req.body.code ?? req.body.koda)) || '').trim();
      if (code !== '7474') {
        return res.status(403).json({ ok: false, error: 'Napačna koda.' });
      }

      pool = await connectPoolForKupec();

      // Preveri ali kupec obstaja
      const exist = await pool.request()
        .input('KupecID', sql.Int, KupecID)
        .query(`SELECT TOP 1 KupecID FROM dbo.Kupec WHERE KupecID = @KupecID`);
      if (!exist.recordset || exist.recordset.length === 0) {
        return res.status(404).json({ ok: false, error: 'Kupec ni najden.' });
      }

      // Preveri referenciranje v DelovniNalog (da ne brišemo strank, ki so že na nalogih)
      try {
        const ref = await pool.request()
          .input('KupecID', sql.Int, KupecID)
          .query(`SELECT COUNT(1) AS cnt FROM dbo.DelovniNalog WHERE KupecID = @KupecID`);
        const cnt = ref.recordset && ref.recordset[0] ? Number(ref.recordset[0].cnt) : 0;
        if (cnt > 0) {
          return res.status(409).json({ ok: false, error: `Stranke ni možno izbrisati, ker je uporabljena na ${cnt} delovnih nalogih.` });
        }
      } catch {}

      await pool.request()
        .input('KupecID', sql.Int, KupecID)
        .query(`DELETE FROM dbo.Kupec WHERE KupecID = @KupecID`);
      return res.json({ ok: true });
    } catch (err) {
      console.error('Napaka pri brisanju kupca:', err);
      res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
    } finally {
      try { if (pool) await pool.close(); } catch {}
    }
  });

  return router;
}

module.exports = { createKupecRouter };
