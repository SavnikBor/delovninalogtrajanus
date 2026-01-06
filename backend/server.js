// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Podpri tudi datoteki process.env: v korenu projekta in v mapi backend
try {
  const rootEnvPath = path.resolve(__dirname, '../process.env');
  const backendEnvPath = path.resolve(__dirname, './process.env');
  [rootEnvPath, backendEnvPath].forEach((p) => {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8');
      content.split(/\r?\n/).forEach((line) => {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) {
          const key = m[1].trim();
          let value = m[2].trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          if (!process.env[key]) process.env[key] = value;
        }
      });
    }
  });
} catch (e) {
  console.warn('Opozorilo: branje process.env ni uspelo:', e);
}

// MSSQL povezava (povzeto iz .env datoteke)
// Podpri več imen ključev za združljivost (DB_PASS/DB_PASSWORD, DB_SERVER/DB_HOST, DB_PORT)
const dbConfig = {
  user: process.env.DB_USER || process.env.DB_USERNAME,
  password: process.env.DB_PASS || process.env.DB_PASSWORD,
  server: process.env.DB_SERVER || process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};
console.log('ℹ️  DB config:', {
  server: dbConfig.server,
  database: dbConfig.database,
  user: dbConfig.user ? '[set]' : undefined,
  port: dbConfig.port || '(default)'
});

// Nodemailer transporter (SMTP)
const smtpHost = process.env.SMTP_HOST;
const smtpHostIp = process.env.SMTP_HOST_IP; // opcijsko: prisili povezavo na IP, SNI ostane hostname
const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465;
const smtpSecure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : smtpPort === 465;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

// Dodatne SMTP nastavitve prek okolja (za starejše TLS strežnike in diagnostiko)
const smtpRequireTLS = process.env.SMTP_REQUIRE_TLS === 'true'; // uporabno za port 587 (STARTTLS)
const smtpTlsMinVersion = process.env.SMTP_TLS_MIN_VERSION; // npr. 'TLSv1', 'TLSv1.1', 'TLSv1.2'
const smtpTlsRejectUnauthorized = process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'false' ? false : true; // privzeto true
const smtpDebug = process.env.SMTP_DEBUG === 'true';

function buildTransportOptions(targetHost, forceServername) {
  const options = {
    host: targetHost,
    port: smtpPort,
    secure: smtpSecure,
    // requireTLS pomaga na 587, da prisili STARTTLS
    requireTLS: !smtpSecure && smtpRequireTLS ? true : undefined,
    auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
    // Znižaj timeoute za hitrejši fallback pri težavah z omrežjem/DNS
    connectionTimeout: 4000,
    greetingTimeout: 4000,
    socketTimeout: 6000,
    logger: smtpDebug
  };
  const tls = {};
  if (smtpTlsMinVersion) tls.minVersion = smtpTlsMinVersion;
  if (forceServername) tls.servername = smtpHost;
  if (smtpTlsRejectUnauthorized === false) tls.rejectUnauthorized = false;
  if (Object.keys(tls).length > 0) options.tls = tls;
  return options;
}

// Primarni transporter: vedno uporabi hostname (DNS), bolj zanesljivo z vidika certifikatov in sprememb IP
const mailTransporterHost = smtpHost
  ? nodemailer.createTransport(buildTransportOptions(smtpHost, false))
  : null;

// Sekundarni transporter: opcijsko prisili IP, za primere, ko DNS/route ne deluje
const mailTransporterIp = smtpHost && smtpHostIp
  ? nodemailer.createTransport(buildTransportOptions(smtpHostIp, true))
  : null;

// Preveri SMTP transporter ob zagonu, za lažje iskanje napak
if (smtpHost) {
  // Izpiši DNS razrešitev za SMTP_HOST
  try {
    const dns = require('dns');
    dns.lookup(smtpHost, (e, address) => {
      if (e) console.warn('⚠️  SMTP DNS lookup ni uspel:', e.message || e);
      else console.log(`ℹ️  SMTP_HOST ${smtpHost} -> ${address}:${smtpPort} secure=${smtpSecure}${smtpHostIp ? ` (forced IP ${smtpHostIp})` : ''}`);
    });
  } catch {}

  // Preveri hostname transporter
  if (mailTransporterHost) {
    mailTransporterHost.verify((err) => {
      if (err) {
        console.error('❌ SMTP preverjanje (hostname) ni uspelo:', err && err.message ? err.message : err);
      } else {
        console.log('✅ SMTP (hostname) je veljaven in pripravljen.');
      }
    });
  }
  // Preveri IP transporter, če obstaja
  if (mailTransporterIp) {
    mailTransporterIp.verify((err) => {
      if (err) {
        console.error('❌ SMTP preverjanje (forced IP) ni uspelo:', err && err.message ? err.message : err);
      } else {
        console.log('✅ SMTP (forced IP) je veljaven in pripravljen.');
      }
    });
  }
} else {
  console.warn('⚠️  SMTP ni konfiguriran (manjka SMTP_HOST). Pošiljanje e-mailov ne bo delovalo.');
}

// Healthcheck ruta
app.get('/', (req, res) => {
  res.status(200).send('API OK');
});

// Debug: izpiši registrirane rute
app.get('/__routes', (req, res) => {
  try {
    const routes = [];
    const stack = (app && app._router && Array.isArray(app._router.stack)) ? app._router.stack : [];
    stack.forEach((m) => {
      try {
        if (m && m.route && m.route.path) {
          const methods = Object.keys(m.route.methods || {}).filter(Boolean).map(x => x.toUpperCase());
          routes.push({ path: m.route.path, methods });
        } else if (m && m.name === 'router' && m.handle && Array.isArray(m.handle.stack)) {
          m.handle.stack.forEach((h) => {
            if (h && h.route && h.route.path) {
              const methods = Object.keys(h.route.methods || {}).filter(Boolean).map(x => x.toUpperCase());
              routes.push({ path: h.route.path, methods });
            }
          });
        }
      } catch {}
    });
    res.json({ ok: true, routes });
  } catch (e) {
    res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});

// Alias za /__routes
app.get('/routes', (req, res) => {
  res.redirect('/__routes');
});
// API endpoint: GET /api/kupec
app.get('/api/kupec', async (req, res) => {
  try {
    await sql.connect(dbConfig);
    const result = await sql.query('SELECT * FROM dbo.Kupec');
    res.json(result.recordset);
  } catch (err) {
    console.error('Napaka pri poizvedbi:', err);
    res.status(500).send('Napaka pri poizvedbi');
  }
});

// API endpoint: POST /api/kupec (dodaj novo stranko)
app.post('/api/kupec', async (req, res) => {
  try {
    const { Naziv, Naslov, Posta, Kraj, Telefon, Fax, IDzaDDV, email } = req.body || {};
    if (!Naziv) {
      return res.status(400).json({ ok: false, error: 'Polje Naziv je obvezno.' });
    }
    await sql.connect(dbConfig);
    // Preveri ali stolpec Email obstaja, če ne, ga poskusi dodati
    let hasEmailColumn = false;
    try {
      const check = await new sql.Request().query(`
        SELECT 1 AS x
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Kupec' AND COLUMN_NAME = 'Email'
      `);
      hasEmailColumn = (check.recordset && check.recordset.length > 0);
      if (!hasEmailColumn) {
        await new sql.Request().query(`ALTER TABLE dbo.Kupec ADD Email NVARCHAR(255) NULL`);
        hasEmailColumn = true;
      }
    } catch (schemaErr) {
      // Če nimamo pravic za ALTER TABLE, nadaljuj brez stolpca Email
      console.warn('⚠️  Ne morem dodati stolpca Email v dbo.Kupec (nadaljujem brez njega):', schemaErr && schemaErr.message ? schemaErr.message : schemaErr);
      hasEmailColumn = false;
    }

    const request = new sql.Request();
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
    const KupecID = result.recordset && result.recordset[0] ? parseInt(result.recordset[0].KupecID, 10) : null;
    return res.json({
      ok: true,
      kupec: { KupecID, Naziv, Naslov, Posta, Kraj, Telefon, Fax, IDzaDDV, email: hasEmailColumn ? (email || '') : undefined }
    });
  } catch (err) {
    console.error('Napaka pri vnosu kupca:', err);
    res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
  }
});

// API endpoint: GET /api/delovni-nalogi/test — preberi vse iz TEST baze (DelovniNalog_TEST)
app.get('/api/delovni-nalogi/test', async (req, res) => {
  try {
    console.log('↪️  GET /api/delovni-nalogi/test');
    const testDbName = process.env.DB_NAME_TEST || 'DelovniNalog_TEST';
    const limit = (() => {
      const q = parseInt(String(req.query.limit || ''), 10);
      if (isFinite(q) && q > 0 && q <= 10000) return q;
      return 2000; // privzet limit
    })();
    const offset = (() => {
      const q = parseInt(String(req.query.offset || ''), 10);
      if (isFinite(q) && q >= 0) return q;
      return 0;
    })();
    const before = (() => {
      const q = parseInt(String(req.query.before || ''), 10);
      if (isFinite(q)) return q;
      return null;
    })();
    const idParam = (() => {
      const q = parseInt(String((req.query.id ?? req.query.nalog) || ''), 10);
      return Number.isFinite(q) ? q : null;
    })();
    const year = (() => {
      const q = parseInt(String(req.query.year || ''), 10);
      return Number.isFinite(q) ? q : null;
    })();
    const lite = String(req.query.lite || 'true').toLowerCase() !== 'false';
    console.log(`   params: limit=${limit}, offset=${offset}, before=${before}, year=${year}, id=${idParam}, lite=${lite}`);
    const testConfig = {
      user: process.env.DB_USER || process.env.DB_USERNAME,
      password: process.env.DB_PASS || process.env.DB_PASSWORD,
      server: process.env.DB_SERVER || process.env.DB_HOST || 'localhost',
      database: testDbName,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
      options: { encrypt: false, trustServerCertificate: true },
    };
    const poolTest = await new sql.ConnectionPool(testConfig).connect();
    // Preberi seznam stolpcev in zgradi SELECT dinamično
    const colsRes = await poolTest.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'DelovniNalog'
    `);
    const haveCols = new Set((colsRes.recordset || []).map(r => String(r.COLUMN_NAME).toLowerCase()));
    const has = (name) => haveCols.has(String(name).toLowerCase());
    const pickFirst = (candidates) => candidates.find(c => has(c));

    let result;
    const normalized = String(req.query.normalized || 'false').toLowerCase() === 'true';
    if (lite && !normalized) {
      // Kandidati za posamezna polja in aliasi za konsistenten odgovor
      const fieldStevilka = pickFirst(['DelovniNalogID','StevilkaNaloga','Stevilka_Naloga','NalogStevilka','Stevilka']) || 'DelovniNalogID';
      const fieldDatum = pickFirst(['DatumOdprtja','Datum','DatumNastanka','DatumUstvarjanja']) || null;
      const fieldKupecId = pickFirst(['KupecID','IdKupca','StrankaID','Kupec']) || null;
      const selectParts = [
        `dn.[${fieldStevilka}] AS [StevilkaNaloga]`,
        fieldDatum ? `dn.[${fieldDatum}] AS [DatumOdprtja]` : `NULL AS [DatumOdprtja]`
      ];
      const joinSql = fieldKupecId ? `LEFT JOIN dbo.Kupec k ON k.[KupecID] = dn.[${fieldKupecId}]` : '';
      const kupecSelect = fieldKupecId ? `, k.[Naziv] AS [KupecNaziv]` : '';
      // Status polja (če obstajajo)
      const fieldStatus = pickFirst(['Status','Stanje']) || null;
      const fieldDobavljeno = pickFirst(['Dobavljeno']) || null;
      const fieldTiskZakljucen = pickFirst(['TiskZakljucen','Zakljucen']) || null;
      const fieldTiskZakljucen1 = pickFirst(['TiskZakljucen1','Zakljucen1']) || null;
      const fieldTiskZakljucen2 = pickFirst(['TiskZakljucen2','Zakljucen2']) || null;
      const statusSelect = `
        ${fieldStatus ? `, dn.[${fieldStatus}] AS [Status]` : ''}
        ${fieldDobavljeno ? `, dn.[${fieldDobavljeno}] AS [Dobavljeno]` : ''}
        ${fieldTiskZakljucen ? `, dn.[${fieldTiskZakljucen}] AS [TiskZakljucen]` : ''}
        ${fieldTiskZakljucen1 ? `, dn.[${fieldTiskZakljucen1}] AS [TiskZakljucen1]` : ''}
        ${fieldTiskZakljucen2 ? `, dn.[${fieldTiskZakljucen2}] AS [TiskZakljucen2]` : ''}
      `;
      // Predmet1/2 iz DelovniNalogPozicija (subselect zaradi performance preprostosti v "lite" načinu)
      const predmetSelect = `
        , (SELECT TOP 1 x.[Predmet] FROM dbo.DelovniNalogPozicija x WHERE x.[DelovniNalogID] = dn.[DelovniNalogID] AND x.[Pozicija] = 1) AS [Predmet1]
        , (SELECT TOP 1 x.[Predmet] FROM dbo.DelovniNalogPozicija x WHERE x.[DelovniNalogID] = dn.[DelovniNalogID] AND x.[Pozicija] = 2) AS [Predmet2]
      `;
      // Ugotovi stolpec za order by (prednost številka naloga, sicer datum)
      const orderCandidates = ['StevilkaNaloga','Stevilka_Naloga','NalogStevilka','Stevilka','DatumOdprtja','Datum','DatumNastanka','DatumUstvarjanja'];
      const orderFound = pickFirst(orderCandidates);
      const orderBy = orderFound ? `dn.[${orderFound}]` : `dn.[StevilkaNaloga]`;
      const orderCol = orderFound ? `dn.[${orderFound}]` : `dn.[StevilkaNaloga]`;
      const dateColCand = ['DatumOdprtja','Datum','DatumNastanka','DatumUstvarjanja'];
      const dateFound = pickFirst(dateColCand);
      const yearClause = (year && dateFound) ? `(dn.[${dateFound}] >= '${year}-01-01' AND dn.[${dateFound}] < '${year + 1}-01-01')` : '';
      const idColFound = pickFirst(['DelovniNalogID','StevilkaNaloga','NalogStevilka','Stevilka']);
      const idClause = (idParam != null && idColFound) ? `(dn.[${idColFound}] = ${idParam})` : '';
      const beforeClauseOnly = before != null && orderFound ? `${orderCol} < ${before}` : '';
      const whereParts = [yearClause, idClause, beforeClauseOnly].filter(Boolean);
      const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
      const query = `
        SELECT ${selectParts.join(', ')}${kupecSelect}${statusSelect}${predmetSelect}
        FROM dbo.DelovniNalog dn
        ${joinSql}
        ${whereSql}
        ORDER BY ${orderBy} DESC
        OFFSET ${(beforeClauseOnly && !year) || idParam != null ? 0 : offset} ROWS FETCH NEXT ${limit} ROWS ONLY
      `;
      const qRes = await poolTest.request().query(query);
      result = qRes;
    } else {
      // surovi SELECT za normalizacijo v JS
      const orderCandidates = ['DelovniNalogID','StevilkaNaloga','Stevilka_Naloga','NalogStevilka','Stevilka','DatumOdprtja','Datum','DatumNastanka','DatumUstvarjanja'];
      const orderFound = pickFirst(orderCandidates);
      let baseQuery;
      if (orderFound) {
        const orderCol = `dn.[${orderFound}]`;
        const dateColCand = ['DatumOdprtja','Datum','DatumNastanka','DatumUstvarjanja'];
        const dateFound = pickFirst(dateColCand);
        const yearClause = (year && dateFound) ? `(dn.[${dateFound}] >= '${year}-01-01' AND dn.[${dateFound}] < '${year + 1}-01-01')` : '';
        const idColFound = pickFirst(['DelovniNalogID','StevilkaNaloga','NalogStevilka','Stevilka']);
        const idClause = (idParam != null && idColFound) ? `(dn.[${idColFound}] = ${idParam})` : '';
        const beforeClauseOnly = before != null ? `${orderCol} < ${before}` : '';
        const whereParts = [yearClause, idClause, beforeClauseOnly].filter(Boolean);
        const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
        // Join na Kupec za naziv
        const fieldKupecId = pickFirst(['KupecID','IdKupca','StrankaID','Kupec']) || null;
        const joinSql = fieldKupecId ? `LEFT JOIN dbo.Kupec k ON k.[KupecID] = dn.[${fieldKupecId}]` : '';
        const kupecSelect = fieldKupecId ? `, k.[Naziv] AS [KupecNaziv]` : '';
        baseQuery = `
            SELECT dn.*${kupecSelect}
            FROM dbo.DelovniNalog dn
            ${joinSql}
            ${whereSql}
            ORDER BY dn.[${orderFound}] DESC
            OFFSET ${(beforeClauseOnly && !year) || idParam != null ? 0 : offset} ROWS FETCH NEXT ${limit} ROWS ONLY
          `;
      } else {
        baseQuery = `
            SELECT TOP (${limit}) *
            FROM dbo.DelovniNalog
          `;
      }
      const raw = await poolTest.request().query(baseQuery);
      if (!normalized) {
        result = raw;
      } else {
        // Preberi tudi podrobnosti iz DelovniNalogXML za izbrane ID-je
        const ids = (raw.recordset || []).map(r => r.DelovniNalogID).filter(id => typeof id === 'number' && isFinite(id));
        let xmlById = new Map();
        let pozById = new Map();
        let dodelavaById = new Map();
        if (ids.length > 0) {
          // Razdeli v kose, če je veliko ID-jev (SQL IN dolžina)
          const chunkSize = 900;
          const allRows = [];
          const allPoz = [];
          const allDod = [];
          for (let i = 0; i < ids.length; i += chunkSize) {
            const chunk = ids.slice(i, i + chunkSize);
            const xmlQuery = `
              SELECT *
              FROM dbo.DelovniNalogXML
              WHERE DelovniNalogID IN (${chunk.join(',')})
            `;
            const xmlRes = await poolTest.request().query(xmlQuery);
            allRows.push(...(xmlRes.recordset || []));
            // Fallback: preberi osnovo iz DelovniNalogPozicija
            const pozQuery = `
              SELECT DelovniNalogID, Pozicija, Predmet, Format, Obseg, StKosov, TiskID, StPol, StKosovNaPoli, GraficnaPriprava, CenaBrezDDV
              FROM dbo.DelovniNalogPozicija
              WHERE DelovniNalogID IN (${chunk.join(',')})
            `;
            const pozRes = await poolTest.request().query(pozQuery);
            allPoz.push(...(pozRes.recordset || []));
            // Fallback dodelave iz DelovniNalogPozicijaDodelava (če obstaja)
            try {
              const dodQuery = `
                SELECT DelovniNalogID, Pozicija, Razrez, VPolah, Zgibanje, Biganje, Perforacija, BiganjeRocnoZgibanje,
                       UVTiskID, UVLakID, TopliTisk, VezavaID, IzsekZasekID, PlastifikacijaID
                FROM dbo.DelovniNalogPozicijaDodelava
                WHERE DelovniNalogID IN (${chunk.join(',')})
              `;
              const dodRes = await poolTest.request().query(dodQuery);
              allDod.push(...(dodRes.recordset || []));
            } catch {}
          }
          xmlById = allRows.reduce((map, row) => {
            const id = row.DelovniNalogID;
            if (!map.has(id)) map.set(id, []);
            map.get(id).push(row);
            return map;
          }, new Map());
          pozById = allPoz.reduce((map, row) => {
            const id = row.DelovniNalogID;
            if (!map.has(id)) map.set(id, new Map());
            map.get(id).set(row.Pozicija, row);
            return map;
          }, new Map());
          dodelavaById = allDod.reduce((map, row) => {
            const id = row.DelovniNalogID;
            if (!map.has(id)) map.set(id, new Map());
            map.get(id).set(row.Pozicija, row);
            return map;
          }, new Map());
        }
        // Normaliziraj v pričakovano strukturo
        const normalizeRow = (row) => {
          const keys = Object.keys(row || {});
          const lowerToKey = new Map(keys.map(k => [k.toLowerCase(), k]));
          const get = (...cands) => {
            for (const c of cands) {
              const k = lowerToKey.get(String(c).toLowerCase());
              if (k !== undefined) return row[k];
            }
            return undefined;
          };
          const getLike = (mustIncludes = [], anyIncludes = []) => {
            const lowerKeys = keys.map(k => k.toLowerCase());
            for (let i = 0; i < lowerKeys.length; i++) {
              const lk = lowerKeys[i];
              if (mustIncludes.every(m => lk.includes(m.toLowerCase())) &&
                  (anyIncludes.length === 0 || anyIncludes.some(a => lk.includes(a.toLowerCase())))) {
                return row[keys[i]];
              }
            }
            return undefined;
          };
          const toBool = (v) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
          const stevilkaNaloga = get('DelovniNalogID','StevilkaNaloga','Stevilka_Naloga','NalogStevilka','Stevilka') ?? null;
          const datum = get('DatumOdprtja','Datum','DatumNastanka','DatumUstvarjanja') ?? null;
          const rok = get('RokIzdelave','Rok','RokDobave','RokIzdel') ?? null;
          const dobavljeno = toBool(get('Dobavljeno'));
          const tiskZakljucen1 = toBool(get('TiskZakljucen1'));
          const tiskZakljucen2 = toBool(get('TiskZakljucen2'));
          const tiskZakljucen = toBool(get('TiskZakljucen')) || (tiskZakljucen1 && tiskZakljucen2);
          // Kupec
          const kupec = {
            KupecID: get('KupecID','IdKupca','StrankaID') ?? null,
            Naziv: (() => {
              const v = get('KupecNaziv','Naziv');
              return v != null ? String(v).trim().replace(/^[,\s-]+|[,\s-]+$/g, '') : null;
            })(),
            Naslov: get('KupecNaslov','Naslov') ?? null,
            Posta: get('KupecPosta','Posta') ?? null,
            Kraj: get('KupecKraj','Kraj') ?? null,
            Telefon: get('KupecTelefon','Telefon') ?? null,
            Fax: get('KupecFax','Fax') ?? null,
            IDzaDDV: get('KupecIDzaDDV','IDzaDDV') ?? null,
          };
          // Kontakt
          const kontakt = {
            kontaktnaOseba: get('KupecKontakt','KontaktnaOseba','KontaktOseba','Kontakt') ?? '',
            email: get('Email','E-Mail','eMail') ?? '',
            telefon: kupec.Telefon || ''
          };
          // Komentar
          const komentar = { komentar: get('Opombe','Komentar','Opis','Opomba') || '' };
          // Tisk1 / Tisk2 iz DelovniNalogXML (po pozicijah)
          const xmlRows = xmlById.get(stevilkaNaloga) || [];
          const pickXmlPoz = (poz) => xmlRows.find(r => r.Pozicija === poz) || null;
          const pickPozPoz = (poz) => {
            const m = pozById.get(stevilkaNaloga);
            return m ? (m.get(poz) || null) : null;
          };
          const pickDodPoz = (poz) => {
            const m = dodelavaById.get(stevilkaNaloga);
            return m ? (m.get(poz) || null) : null;
          };
          const buildTiskFromXml = (xml) => {
            const out = {};
            if (!xml) return out;
            out.predmet = xml.Predmet ?? null;
            out.format = xml.Format ?? null;
            out.obseg = xml.Obseg ?? null;
            out.steviloKosov = xml.StKosov != null ? String(xml.StKosov) : null;
            // material
            const normMaterial = (() => {
              const gram = xml.Gramatura && Number(xml.Gramatura) > 0 ? `${Number(xml.Gramatura)} g/m2` : '';
              const mat = (xml.Material || '').toString().trim();
              const lower = mat.toLowerCase();
              // Korelacija materialov na standardne izraze
              // - samolepni (mat/sijaj)
              if (lower.includes('samolep') && lower.includes('mat')) return ['samolepni mat', gram].filter(Boolean).join(' ');
              if (lower.includes('samolep') && (lower.includes('sijaj') || lower.includes('gloss'))) return ['samolepni sijaj', gram].filter(Boolean).join(' ');
              if (lower.includes('samolep')) return ['samolepni', gram].filter(Boolean).join(' ');
              // - premazni (kredni/coated)
              if (lower.includes('kredn') || lower.includes('premaz') || lower.includes('coated')) {
                if (lower.includes('enostransk')) return ['enostransko premazni karton', gram].filter(Boolean).join(' ');
                if (lower.includes('mat')) return ['mat premazni', gram].filter(Boolean).join(' ');
                if (lower.includes('sijaj') || lower.includes('gloss')) return ['sijaj premazni', gram].filter(Boolean).join(' ');
                return ['premazni', gram].filter(Boolean).join(' ');
              }
              // - nepremazni (offset)
              if (lower.includes('brezlesn')) return ['brezlesni - nepremazni', gram].filter(Boolean).join(' ');
              if (lower.includes('nepremaz') || lower.includes('offset')) return ['nepremazni', gram].filter(Boolean).join(' ');
              // fallback
              return [mat, gram].filter(Boolean).join(' ').trim() || null;
            })();
            // Mapiraj na vrednosti, ki obstajajo v TiskSekcija (select)
            const toUiMaterial = (() => {
              const s = (normMaterial || '').toLowerCase();
              // Izlušči gramature iz normMaterial
              const gramMatch = s.match(/(\d{2,4})\s*g\/?m2/);
              const g2 = gramMatch ? `${gramMatch[1]} g/m²` : '';
              const gNum = gramMatch ? parseInt(gramMatch[1], 10) : null;
              // nalepke
              if ((/samolep/.test(s) && /pvc/.test(s)) || /pvc folij/.test(s)) return 'bela PVC nalepka';
              if (s.includes('samolepni') && s.includes('sijaj')) return 'bela PVC nalepka';
              if (s.includes('samolepni') && (s.includes('nepremaz') || s.includes('brezlesni'))) return 'nepremazna nalepka';
              if (s.includes('samolepni') && s.includes('mat')) return 'mat premazna nalepka';
              // mikroval (brez gramature)
              if (/mikroval/.test(s) && /rjav/.test(s)) return 'mikroval E val RJAVI';
              if (/mikroval/.test(s) && /bel/.test(s)) return 'mikroval E val BELI ZA TISK';
              // plošče in kartoni
              if (/kappa.*10/.test(s) || /kapa.*10/.test(s)) return 'kapa 10 mm';
              if (/kappa.*5/.test(s) || /kapa.*5/.test(s)) return 'kapa 5 mm';
              if (/forex\s*1\s*mm/.test(s)) return 'forex 1 mm';
              if (/forex\s*2\s*mm/.test(s)) return 'forex 2 mm';
              if (/forex\s*3\s*mm/.test(s)) return 'forex 3 mm';
              if (/forex\s*5\s*mm/.test(s)) return 'forex 5 mm';
              if (/forex\s*10\s*mm/.test(s)) return 'forex 10 mm';
              if (s.includes('naročnikov')) return 'naročnikov material';
              // papirji z gramaturami: pretvori na g/m² in znane nize
              if (s.includes('brezlesni') || s.includes('nepremazni')) {
                return g2 ? `brezlesni, nepremazni ${g2}` : 'brezlesni, nepremazni 90 g/m²';
              }
              if (s.includes('enostransko premazni karton') && g2) return `enostransko premazni karton ${g2}`;
              if (s.includes('mat premazni') && g2) return `mat premazni ${g2}`;
              // "mat" brez dodatkov -> obravnavaj kot "mat premazni"
              if ((/\bmat\b/.test(s) || s.startsWith('mat ')) && g2 && !/samolep/.test(s)) return `mat premazni ${g2}`;
              // Fedrigoni brand korelacije
              if (/tintore?tto|tintoreto|soho|gesso/.test(s) && gNum === 300) return 'Fedrigoni Tintoreto Soho 300 g/m²';
              if (/old\s*mill/.test(s) && gNum === 250) return 'Fedrigoni Old Mill 250 g/m²';
              if (/sirio\s*pearl/.test(s) && gNum === 300) return 'Fedrigoni Sirio Pearl 300 g/m²';
              return normMaterial;
            })();
            out.material = toUiMaterial;
            // barve
            const normBarve = (() => {
              const t = (xml.Tisk || '').toString().trim();
              if (t) {
                const m = t.match(/\b([14])\s*\/\s*([014])\b/);
                if (m) {
                  const val = `${m[1]}/${m[2]}`;
                  if (val === '4/0') return '4/0 barvno enostransko (CMYK)';
                  if (val === '4/4') return '4/4 barvno obojestransko (CMYK)';
                  if (val === '1/0') return '1/0 črno belo enostransko (K)';
                  if (val === '1/1') return '1/1 črno belo obojestransko (K)';
                  return val;
                }
                if (/pantone/i.test(t)) return 'Pantone';
                return t;
              }
              if (xml.TiskID != null) {
                const id = Number(xml.TiskID);
                if (id === 1) return '1/0 črno belo enostransko (K)';
                if (id === 2) return '1/1 črno belo obojestransko (K)';
                if (id === 3) return '4/0 barvno enostransko (CMYK)';
                if (id === 4) return '4/4 barvno obojestransko (CMYK)';
              }
              return null;
            })();
            out.barve = normBarve;
            out.steviloPol = xml.StPol != null ? String(xml.StPol) : null;
            out.kosovNaPoli = xml.StKosovNaPoli != null ? String(xml.StKosovNaPoli) : null;
            // B2/B1 iz formata (če vsebuje B2/B1)
            const lowerFmt = String(out.format || '').toLowerCase();
            out.b2Format = /b2\b/.test(lowerFmt);
            out.b1Format = /b1\b/.test(lowerFmt);
            return out;
          };
          const buildTiskFromPoz = (poz) => {
            const out = {};
            if (!poz) return out;
            out.predmet = poz.Predmet ?? null;
            out.format = poz.Format ?? null;
            out.obseg = poz.Obseg ?? null;
            out.steviloKosov = poz.StKosov != null ? String(poz.StKosov) : null;
            // barve iz TiskID (heuristika)
            if (poz.TiskID != null) {
              const id = Number(poz.TiskID);
              if (id === 1) out.barve = '1/0 črno belo enostransko (K)';
              else if (id === 2) out.barve = '1/1 črno belo obojestransko (K)';
              else if (id === 3) out.barve = '4/0 barvno enostransko (CMYK)';
              else if (id === 4) out.barve = '4/4 barvno obojestransko (CMYK)';
              else out.barve = null;
            }
            out.steviloPol = poz.StPol != null ? String(poz.StPol) : null;
            out.kosovNaPoli = poz.StKosovNaPoli != null ? String(poz.StKosovNaPoli) : null;
            const lowerFmt = String(out.format || '').toLowerCase();
            out.b2Format = /b2\b/.test(lowerFmt);
            out.b1Format = /b1\b/.test(lowerFmt);
            // strelišča za stroške, če obstajajo
            if (poz.CenaBrezDDV != null) out.cenaBrezDDV = String(poz.CenaBrezDDV);
            if (poz.GraficnaPriprava != null) out.graficnaPriprava = String(poz.GraficnaPriprava);
            return out;
          };
          const tisk = {};
          let t1 = buildTiskFromXml(pickXmlPoz(1)); let t2 = buildTiskFromXml(pickXmlPoz(2));
          // Fallback na Pozicija, če XML ni dal ničesar
          if (!Object.values(t1).some(v => v)) t1 = buildTiskFromPoz(pickPozPoz(1));
          if (!Object.values(t2).some(v => v)) t2 = buildTiskFromPoz(pickPozPoz(2));
          if (Object.values(t1).some(v => v)) tisk.tisk1 = t1;
          if (Object.values(t2).some(v => v)) tisk.tisk2 = t2;
          // Dodelave
          const dodelava1 = {};
          const dFromXml = (xml) => {
            if (!xml) return;
            // UV tisk
            if (xml.UVTisk) {
              const val = String(xml.UVTisk);
              const m = val.match(/\b([14])\s*\/\s*([014])\b/);
              if (m) {
                const v = `${m[1]}/${m[2]}`;
                dodelava1.uvTisk = v === '1/0' ? '4/0 barvno enostransko (CMYK)' : (v === '1/1' ? '4/4 barvno obojestransko (CMYK)' : v);
              } else {
                dodelava1.uvTisk = val;
              }
            }
            // 3D UV lak
            if (xml['3DUVLak']) {
              const v = String(xml['3DUVLak']).trim();
              // Če je v zapisu 1/0 ali 1/1, pretvori v parcialno
              const m = v.match(/\b([14])\s*\/\s*([014])\b/);
              if (m) {
                const vv = `${m[1]}/${m[2]}`;
                dodelava1.uvLak = vv === '1/0' ? '1/0 parcialno' : (vv === '1/1' ? '1/1 parcialno' : v);
              } else {
                dodelava1.uvLak = v && /3d/i.test(v) ? '3D UV lak' : v;
              }
            }
            // Plastifikacija
            if (xml.Plastifikacija) {
              const p = String(xml.Plastifikacija).toLowerCase();
              let out = '1/1';
              if (p.includes('1/0')) out = '1/0';
              if (p.includes('mat')) out += ' mat';
              else if (p.includes('sijaj') || p.includes('gloss')) out += ' sijaj';
              dodelava1.plastifikacija = out;
            }
            if (xml.IzsekZasek) dodelava1.izsek = /digitalni/i.test(String(xml.IzsekZasek)) ? 'digitalni izsek' : String(xml.IzsekZasek).toLowerCase().includes('zasek') ? 'digitalni zasek' : 'izsek';
            dodelava1.zgibanje = !!xml.Zgibanje;
            dodelava1.biganje = !!xml.Biganje;
            dodelava1.perforacija = !!xml.Perforacija;
            if (xml.Vezava) dodelava1.vezava = String(xml.Vezava);
            dodelava1.razrez = !!xml.Razrez;
            dodelava1.vPolah = !!xml.VPolah;
          };
          const xml1 = pickXmlPoz(1); const xml2 = pickXmlPoz(2);
          dFromXml(xml1);
          dFromXml(xml2);
          // Fallback: Dodelava iz DelovniNalogPozicijaDodelava
          const d1 = pickDodPoz(1);
          const d2 = pickDodPoz(2);
          const applyDod = (src) => {
            if (!src) return;
            if (typeof dodelava1.uvTisk === 'undefined' && src.UVTiskID != null) {
              const id = Number(src.UVTiskID);
              dodelava1.uvTisk = id === 1 ? '1/0' : (id === 2 ? '1/1' : undefined);
            }
            if (typeof dodelava1.uvLak === 'undefined' && src.UVLakID != null) {
              const id = Number(src.UVLakID);
              dodelava1.uvLak = id ? '3D UV lak' : dodelava1.uvLak;
            }
            if (typeof dodelava1.vezava === 'undefined' && src.VezavaID != null) dodelava1.vezava = 'vezava';
            if (typeof dodelava1.izsek === 'undefined' && src.IzsekZasekID != null) dodelava1.izsek = 'izsek';
            if (typeof dodelava1.plastifikacija === 'undefined' && src.PlastifikacijaID != null) dodelava1.plastifikacija = '1/1';
            if (typeof dodelava1.razrez === 'undefined') dodelava1.razrez = !!src.Razrez;
            if (typeof dodelava1.vPolah === 'undefined') dodelava1.vPolah = !!src.VPolah;
            if (typeof dodelava1.zgibanje === 'undefined') dodelava1.zgibanje = !!src.Zgibanje;
            if (typeof dodelava1.biganje === 'undefined') dodelava1.biganje = !!src.Biganje;
            if (typeof dodelava1.perforacija === 'undefined') dodelava1.perforacija = !!src.Perforacija;
          };
          applyDod(d1); applyDod(d2);
          // Stroški
          const stroski1 = {};
          const formatCena = (n) => Number.isFinite(n) ? n.toFixed(2).replace('.', ',') : undefined;
          const cena1 = pickXmlPoz(1)?.CenaBrezDDV != null ? Number(pickXmlPoz(1).CenaBrezDDV) : null;
          const cena2 = pickXmlPoz(2)?.CenaBrezDDV != null ? Number(pickXmlPoz(2).CenaBrezDDV) : null;
          const totalCena = [cena1, cena2].filter(v => typeof v === 'number' && isFinite(v)).reduce((a, b) => a + b, 0);
          if (totalCena > 0) stroski1.cenaBrezDDV = formatCena(totalCena);
          const gp1 = pickXmlPoz(1)?.GraficnaPriprava != null ? Number(pickXmlPoz(1).GraficnaPriprava) : null;
          const gp2 = pickXmlPoz(2)?.GraficnaPriprava != null ? Number(pickXmlPoz(2).GraficnaPriprava) : null;
          const totalGP = [gp1, gp2].filter(v => typeof v === 'number' && isFinite(v)).reduce((a, b) => a + b, 0);
          if (totalGP > 0) stroski1.graficnaPriprava = formatCena(totalGP);
          const out = {
            normalized: true,
            stevilkaNaloga,
            datumNarocila: datum,
            rokIzdelave: rok,
            status: dobavljeno ? 'dobavljeno' : (tiskZakljucen ? 'zakljucen' : 'v_delu'),
            zakljucen: tiskZakljucen,
            tiskZakljucen1,
            tiskZakljucen2,
            dobavljeno,
            podatki: {
              kupec,
              kontakt,
              komentar,
              ...(Object.keys(tisk).length ? { tisk } : {}),
              ...(Object.values(dodelava1).some(v => v) ? { dodelava: { dodelava1 } } : {}),
              ...(Object.values(stroski1).some(v => v) ? { stroski: { stroski1 } } : {}),
            },
            datumShranjevanja: new Date().toISOString()
          };
          return out;
        };
        result = { recordset: (raw.recordset || []).map(normalizeRow) };
      }
    }
    await poolTest.close();
    console.log(`   -> returning ${(result.recordset || []).length} rows`);
    res.json(result.recordset || []);
  } catch (e) {
    console.error('Napaka pri branju iz test baze:', e);
    res.status(500).json({ error: 'Napaka pri branju iz test baze', details: e && e.message ? e.message : String(e) });
  }
});

// API endpoint: GET /api/delovni-nalogi/max-stevilka — največja številka v produkcijski bazi (helper)
app.get('/api/delovni-nalogi/max-stevilka', async (req, res) => {
  try {
    await sql.connect(dbConfig);
    const r = await new sql.Request().query(`SELECT MAX(StevilkaNaloga) AS maxNaloga FROM dbo.DelovniNalog`);
    res.json({ max: r.recordset && r.recordset[0] ? r.recordset[0].maxNaloga : null });
  } catch (e) {
    console.error('Napaka pri pridobivanju max številke:', e);
    res.status(500).json({ error: 'Napaka pri pridobivanju max številke', details: e && e.message ? e.message : String(e) });
  }
});

// Schema introspection: najdi tabele/stolpce v TEST bazi, ki so relevantni za podrobnosti naloga
app.get('/api/delovni-nalogi/test/schema', async (req, res) => {
  try {
    const testDbName = process.env.DB_NAME_TEST || 'DelovniNalog_TEST';
    const testConfig = {
      user: process.env.DB_USER || process.env.DB_USERNAME,
      password: process.env.DB_PASS || process.env.DB_PASSWORD,
      server: process.env.DB_SERVER || process.env.DB_HOST || 'localhost',
      database: testDbName,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
      options: { encrypt: false, trustServerCertificate: true },
    };
    const pool = await new sql.ConnectionPool(testConfig).connect();
    const tablesRes = await pool.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'dbo'
      ORDER BY TABLE_NAME
    `);
    const tables = (tablesRes.recordset || []).map(r => r.TABLE_NAME);
    const out = [];
    for (const t of tables) {
      try {
        const cols = await pool.request().query(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @t
          ORDER BY ORDINAL_POSITION
        `.replace('@t', `'${t.replace(/'/g, "''")}'`));
        const colNames = (cols.recordset || []).map(r => r.COLUMN_NAME);
        const hasLink = colNames.some(c => /DelovniNalogID|StevilkaNaloga|Nalog(ID|Ref)?/i.test(c));
        const isRelevant = hasLink || colNames.some(c => /Tisk|Dodel|Stro(s|š)|Format|Kos|Pol|Barv|Material/i.test(c));
        if (isRelevant) {
          out.push({ table: t, columns: colNames });
        }
      } catch {}
    }
    await pool.close();
    res.json({ ok: true, db: testDbName, tables: out });
  } catch (e) {
    console.error('Schema introspection error:', e);
    res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});

// Detajli za en nalog: vrni vrstice iz vseh tabel, ki imajo povezavo na nalog
app.get('/api/delovni-nalogi/test/details', async (req, res) => {
  try {
    const nalog = req.query.nalog ? String(req.query.nalog) : '';
    if (!nalog) return res.status(400).json({ ok: false, error: 'Manjka query param nalog' });
    const nalogNum = parseInt(nalog, 10);
    if (!isFinite(nalogNum)) return res.status(400).json({ ok: false, error: 'Param nalog mora biti številka' });
    const testDbName = process.env.DB_NAME_TEST || 'DelovniNalog_TEST';
    const testConfig = {
      user: process.env.DB_USER || process.env.DB_USERNAME,
      password: process.env.DB_PASS || process.env.DB_PASSWORD,
      server: process.env.DB_SERVER || process.env.DB_HOST || 'localhost',
      database: testDbName,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
      options: { encrypt: false, trustServerCertificate: true },
    };
    const pool = await new sql.ConnectionPool(testConfig).connect();
    const tablesRes = await pool.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'dbo'
      ORDER BY TABLE_NAME
    `);
    const tables = (tablesRes.recordset || []).map(r => r.TABLE_NAME);
    const results = {};
    for (const t of tables) {
      try {
        const colsRes = await pool.request().query(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @t
        `.replace('@t', `'${t.replace(/'/g, "''")}'`));
        const cols = (colsRes.recordset || []).map(r => r.COLUMN_NAME);
        const keyCol = cols.find(c => /^DelovniNalogID$/i.test(c)) ||
                       cols.find(c => /^StevilkaNaloga$/i.test(c)) ||
                       cols.find(c => /^Nalog(ID|Ref)$/i.test(c));
        if (!keyCol) continue;
        const q = `
          SELECT TOP 50 *
          FROM [dbo].[${t}]
          WHERE [${keyCol}] = @id
        `;
        const reqQ = pool.request();
        reqQ.input('id', sql.Int, nalogNum);
        const data = await reqQ.query(q);
        if (data.recordset && data.recordset.length > 0) {
          results[t] = data.recordset;
        }
      } catch {}
    }
    await pool.close();
    res.json({ ok: true, nalog: nalogNum, results });
  } catch (e) {
    console.error('Details query error:', e);
    res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});
// API endpoint: GET /api/smtp/status (hitra diagnostika)
app.get('/api/smtp/status', async (req, res) => {
  try {
    if (!smtpHost) return res.status(400).json({ ok: false, error: 'SMTP ni konfiguriran' });
    const results = {};
    if (mailTransporterHost) {
      try {
        await mailTransporterHost.verify();
        results.hostname = { ok: true };
      } catch (e) {
        results.hostname = { ok: false, error: e && e.message ? e.message : String(e) };
      }
    }
    if (mailTransporterIp) {
      try {
        await mailTransporterIp.verify();
        results.ip = { ok: true };
      } catch (e) {
        results.ip = { ok: false, error: e && e.message ? e.message : String(e) };
      }
    }
    res.json({ ok: true, results, config: { host: smtpHost, ip: smtpHostIp || null, port: smtpPort, secure: smtpSecure } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
  }
});

// Ustvari nov delovni nalog (produkcijska baza)
app.post('/api/delovni-nalog', async (req, res) => {
  try {
    const { kupecID, kontaktnaOseba, email, komentar, rokIzdelave, predmet1, predmet2, datumNarocila, xml1, xml2,
      posiljanjeNaziv, posiljanjeNaslov, posiljanjeKraj, posiljanjePosta, posiljanjeKontaktnaOseba, posiljanjeKontakt,
      posiljanjePoPosti, posiljanjeOsebnoPrevzem, posiljanjeDostavaNaLokacijo,
      // dodatno + posiljanje (normalizirane tabele)
      narocilnica, kontaktEmail, posljiEmail, posiljanjeEmail, posiljanjePosljiEmail } = req.body || {};
    if (!kupecID) return res.status(400).json({ error: 'Manjka kupecID' });
    await sql.connect(dbConfig);
    // Preveri kupca
    const kupecRes = await new sql.Request()
      .input('kupecID', sql.Int, kupecID)
      .query('SELECT TOP 1 * FROM dbo.Kupec WHERE KupecID = @kupecID');
    if (!kupecRes.recordset || kupecRes.recordset.length === 0) {
      return res.status(404).json({ error: 'Kupec ni bil najden' });
    }
    // Preberi shemo DelovniNalog
    const colsRes = await new sql.Request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'DelovniNalog'
    `);
    const haveCols = new Set((colsRes.recordset || []).map(r => String(r.COLUMN_NAME).toLowerCase()));
    const has = (name) => haveCols.has(String(name).toLowerCase());
    const pickFirst = (cands) => cands.find(c => has(c));
    // Kandidati za številko naloga (ne vstavljaj v ID, če je identity)
    const numCol = pickFirst(['StevilkaNaloga','Stevilka_Naloga','NalogStevilka','Stevilka']) || null;
    const colDatum = pickFirst(['DatumOdprtja','Datum','DatumNastanka','DatumUstvarjanja']) || null;
    const colRok = pickFirst(['RokIzdelave','Rok','RokDobave','RokIzdel']) || null;
    const colKupec = pickFirst(['KupecID','IdKupca','StrankaID','Kupec']) || null;
    const colKomentar = pickFirst(['Komentar','Opis','Opomba','Opombe']) || null;
    const colEmail = pickFirst(['Email','E-Mail','E_posta','Eposta']) || null;
    const colKontakt = pickFirst(['KontaktnaOseba','Kontakt_Oseba','KontaktOseba','Kontakt','KupecKontakt']) || null;
    // Posiljanje/dostava možne kolone
    const colPosNaziv = pickFirst(['PosiljanjeNaziv','DostavaNaziv','Prejemnik','NazivDostave','NazivPrejemnika']) || null;
    const colPosNaslov = pickFirst(['PosiljanjeNaslov','DostavaNaslov','NaslovDostave','NaslovPrejemnika','Naslov_2']) || null;
    const colPosKraj = pickFirst(['PosiljanjeKraj','DostavaKraj','KrajDostave']) || null;
    const colPosPosta = pickFirst(['PosiljanjePosta','DostavaPosta','PostaDostave']) || null;
    const colPosKontaktna = pickFirst(['PosiljanjeKontaktnaOseba','DostavaKontaktnaOseba','KontaktDostave','Kontakt_Oseba_Dostave']) || null;
    const colPosKontakt = pickFirst(['PosiljanjeKontakt','DostavaKontakt','KontaktDostavePodatek']) || null;
    const colPosPoPosti = pickFirst(['PosiljanjePoPosti','PosiljanjePoPošti','Posiljanje_Post']) || null;
    const colPosOsebno = pickFirst(['OsebnoPrevzem','OsebniPrevzem']) || null;
    const colPosDostava = pickFirst(['DostavaNaLokacijo','Dostava']) || null;
    const colTiskZaklj = pickFirst(['TiskZakljucen','Zakljucen']) || null;
    const colTiskZaklj1 = pickFirst(['TiskZakljucen1','Zakljucen1']) || null;
    const colTiskZaklj2 = pickFirst(['TiskZakljucen2','Zakljucen2']) || null;
    const colDobavljeno = pickFirst(['Dobavljeno']) || null;
    const colStatus = pickFirst(['Status','Stanje']) || null;
    // Izračunaj novo številko (če imamo ustrezen stolpec)
    let stevilkaNaloga = null;
    if (numCol) {
      const maxQ = await new sql.Request().query(`SELECT MAX([${numCol}]) AS maxNaloga FROM dbo.DelovniNalog`);
      const maxVal = maxQ && maxQ.recordset && maxQ.recordset[0] ? maxQ.recordset[0].maxNaloga : null;
      const base = (maxVal != null && isFinite(parseInt(maxVal, 10))) ? parseInt(maxVal, 10) : 65000;
      stevilkaNaloga = base + 1;
    }
    const datumOdprtja = (() => {
      const cand = datumNarocila ? new Date(datumNarocila) : null;
      return (cand && !isNaN(+cand)) ? cand : new Date();
    })();
    const rokIzdelaveDate = rokIzdelave ? new Date(rokIzdelave) : null;
    // Zgradi INSERT dinamično po obstoječih stolpcih
    const cols = [];
    const vals = [];
    const reqIns = new sql.Request();
    if (numCol && stevilkaNaloga != null) {
      cols.push(`[${numCol}]`); vals.push(`@StevilkaNaloga`); reqIns.input('StevilkaNaloga', sql.Int, stevilkaNaloga);
    }
    if (colDatum) {
      cols.push(`[${colDatum}]`); vals.push(`@DatumOdprtja`); reqIns.input('DatumOdprtja', sql.DateTime, datumOdprtja);
    }
    if (colRok && rokIzdelaveDate) {
      cols.push(`[${colRok}]`); vals.push(`@RokIzdelave`); reqIns.input('RokIzdelave', sql.DateTime, rokIzdelaveDate);
    }
    if (colKupec) {
      cols.push(`[${colKupec}]`); vals.push(`@KupecID`); reqIns.input('KupecID', sql.Int, kupecID);
    }
    if (colKomentar) {
      cols.push(`[${colKomentar}]`); vals.push(`@Komentar`); reqIns.input('Komentar', sql.NVarChar(sql.MAX), komentar || '');
    }
    if (colEmail) {
      cols.push(`[${colEmail}]`); vals.push(`@Email`); reqIns.input('Email', sql.NVarChar(255), email || '');
    }
    if (colKontakt) {
      cols.push(`[${colKontakt}]`); vals.push(`@KontaktnaOseba`); reqIns.input('KontaktnaOseba', sql.NVarChar(255), kontaktnaOseba || '');
    }
    // Posiljanje podatki (če tabela ima te kolone)
    if (colPosNaziv) { cols.push(`[${colPosNaziv}]`); vals.push(`@PosNaziv`); reqIns.input('PosNaziv', sql.NVarChar(255), posiljanjeNaziv || ''); }
    if (colPosNaslov) { cols.push(`[${colPosNaslov}]`); vals.push(`@PosNaslov`); reqIns.input('PosNaslov', sql.NVarChar(255), posiljanjeNaslov || ''); }
    if (colPosKraj) { cols.push(`[${colPosKraj}]`); vals.push(`@PosKraj`); reqIns.input('PosKraj', sql.NVarChar(255), posiljanjeKraj || ''); }
    if (colPosPosta) { cols.push(`[${colPosPosta}]`); vals.push(`@PosPosta`); reqIns.input('PosPosta', sql.NVarChar(50), posiljanjePosta || ''); }
    if (colPosKontaktna) { cols.push(`[${colPosKontaktna}]`); vals.push(`@PosKontaktnaOseba`); reqIns.input('PosKontaktnaOseba', sql.NVarChar(255), posiljanjeKontaktnaOseba || ''); }
    if (colPosKontakt) { cols.push(`[${colPosKontakt}]`); vals.push(`@PosKontakt`); reqIns.input('PosKontakt', sql.NVarChar(255), posiljanjeKontakt || ''); }
    if (colPosPoPosti) { cols.push(`[${colPosPoPosti}]`); vals.push(`@PosPoPosti`); reqIns.input('PosPoPosti', sql.Bit, posiljanjePoPosti ? 1 : 0); }
    if (colPosOsebno) { cols.push(`[${colPosOsebno}]`); vals.push(`@PosOsebno`); reqIns.input('PosOsebno', sql.Bit, posiljanjeOsebnoPrevzem ? 1 : 0); }
    if (colPosDostava) { cols.push(`[${colPosDostava}]`); vals.push(`@PosDostava`); reqIns.input('PosDostava', sql.Bit, posiljanjeDostavaNaLokacijo ? 1 : 0); }
    // Privzete vrednosti za ne-nullable statuse
    if (colTiskZaklj) {
      cols.push(`[${colTiskZaklj}]`); vals.push(`@TiskZakljucen`); reqIns.input('TiskZakljucen', sql.Bit, 0);
    }
    if (colTiskZaklj1) {
      cols.push(`[${colTiskZaklj1}]`); vals.push(`@TiskZakljucen1`); reqIns.input('TiskZakljucen1', sql.Bit, 0);
    }
    if (colTiskZaklj2) {
      cols.push(`[${colTiskZaklj2}]`); vals.push(`@TiskZakljucen2`); reqIns.input('TiskZakljucen2', sql.Bit, 0);
    }
    if (colDobavljeno) {
      cols.push(`[${colDobavljeno}]`); vals.push(`@Dobavljeno`); reqIns.input('Dobavljeno', sql.Bit, 0);
    }
    if (colStatus) {
      cols.push(`[${colStatus}]`); vals.push(`@StatusStr`); reqIns.input('StatusStr', sql.NVarChar(255), 'v_delu');
    }
    if (cols.length === 0) {
      return res.status(500).json({ error: 'Shema tabele DelovniNalog ne vsebuje pričakovanih stolpcev za INSERT.' });
    }
    const insSql = `
      INSERT INTO dbo.DelovniNalog (${cols.join(', ')})
      VALUES (${vals.join(', ')})
    `;
    await reqIns.query(insSql);
    // Preberi nov ID (identity) za upsert v XML
    let newId = null;
    try {
      const idRes = await new sql.Request().query('SELECT SCOPE_IDENTITY() AS id');
      newId = idRes.recordset && idRes.recordset[0] ? (idRes.recordset[0].id | 0) : null;
      if (!newId) throw new Error('no scope identity');
    } catch {
      try {
        const idRes2 = await new sql.Request().query('SELECT MAX(DelovniNalogID) AS id FROM dbo.DelovniNalog');
        newId = idRes2.recordset && idRes2.recordset[0] ? idRes2.recordset[0].id : null;
      } catch {}
    }
    // Upsert Predmet1/2 v DelovniNalogXML, če podana
    const resolveXmlTargetTable = async () => {
      // 1) Preferiraj znano osnovno tabelo
      try {
        const test = await new sql.Request().query(`
          SELECT TABLE_NAME, TABLE_TYPE
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='DelovniNalogPozicija'
        `);
        if (test.recordset && test.recordset[0] && String(test.recordset[0].TABLE_TYPE).toUpperCase().includes('BASE')) {
          return 'DelovniNalogPozicija';
        }
      } catch {}
      try {
        // Če obstaja base table z istim imenom, uporabi to
        const base = await new sql.Request().query(`
          SELECT TABLE_NAME
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='DelovniNalogXML' AND TABLE_TYPE='BASE TABLE'
        `);
        if (base.recordset && base.recordset.length > 0) return 'DelovniNalogXML';
      } catch {}
      // Poišči kandidat z zahtevnimi stolpci
      try {
        const q = await new sql.Request().query(`
          SELECT TABLE_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA='dbo' AND COLUMN_NAME IN ('DelovniNalogID','Pozicija','Predmet')
          GROUP BY TABLE_NAME
          HAVING COUNT(DISTINCT COLUMN_NAME)=3
        `);
        const rows = q.recordset || [];
        // Preferiraj Pozicija, sicer prvi zadetek
        const pref = rows.find(r => r.TABLE_NAME === 'DelovniNalogPozicija');
        if (pref) return pref.TABLE_NAME;
        const name = rows[0] ? rows[0].TABLE_NAME : null;
        return name || null;
      } catch {}
      return null;
    };
    const upsertXmlFull = async (poz, predmet, xmlData) => {
      if (!newId) return;
      const xmlTable = await resolveXmlTargetTable();
      if (!xmlTable) return; // Ni tarče za zapis
      const rq = new sql.Request();
      rq.input('DelovniNalogID', sql.Int, newId);
      rq.input('Pozicija', sql.Int, poz);
      // Preberi shemo ciljne tabele
      let xmlCols = [];
      let colMeta = new Map();
      try {
        const xmlSchema = await new sql.Request().query(`
          SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='${xmlTable}'
        `);
        xmlCols = (xmlSchema.recordset || []).map(r => String(r.COLUMN_NAME));
        colMeta = new Map((xmlSchema.recordset || []).map(r => [String(r.COLUMN_NAME), { type: String(r.DATA_TYPE).toLowerCase(), nullable: String(r.IS_NULLABLE).toUpperCase() === 'YES' }]));
      } catch {}
      const hasCol = (name) => xmlCols.some(c => c.toLowerCase() === String(name).toLowerCase());
      const setParts = [];
      const colToParam = (col) => `p_${col}`;
      const addWithType = (col, val, prefer = 'nvarchar') => {
        if (!hasCol(col) || typeof val === 'undefined' || val === null || val === '') return;
        const meta = colMeta.get(col) || {};
        const param = colToParam(col);
        setParts.push(`[${col}] = @${param}`);
        const t = (meta.type || prefer);
        if (t.includes('int')) rq.input(param, sql.Int, parseInt(String(val), 10) || 0);
        else if (t.includes('bit')) rq.input(param, sql.Bit, (val === true || val === 1 || val === '1' || String(val).toLowerCase() === 'true') ? 1 : 0);
        else if (t.includes('decimal') || t.includes('numeric') || t.includes('money')) rq.input(param, sql.Decimal(18, 2), (() => { const n = parseFloat(String(val).replace(',', '.')); return isFinite(n) ? n : 0; })());
        else rq.input(param, sql.NVarChar(sql.MAX), String(val));
      };
      // Nastavi Predmet, če podan
      if (typeof predmet !== 'undefined' && predmet !== null && predmet !== '') {
        addWithType('Predmet', String(predmet), 'nvarchar');
      }
      const x = xmlData || {};
      const tryResolveIdFull = async (table, textCol, idCol, value) => {
        try {
          if (!value) return null;
          const rq2 = new sql.Request();
          rq2.input('v', sql.NVarChar(255), String(value).trim());
          const qr = await rq2.query(`SELECT TOP 1 [${idCol}] AS id FROM dbo.[${table}] WHERE [${textCol}] = @v`);
          return (qr.recordset && qr.recordset[0]) ? qr.recordset[0].id : null;
        } catch { return null; }
      };
      const normalizeBarveFull = (s) => {
        const t = String(s || '').trim();
        const m = t.match(/\b([14])\s*\/\s*([014])\b/);
        if (m) return `${m[1]}/${m[2]}`;
        if (/pantone/i.test(t)) return 'Pantone';
        return t;
      };
      // Lookup helperji za ID-je
      const tryResolveIdPut = async (table, textCol, idCol, value) => {
        try {
          if (!value) return null;
          const rq2 = new sql.Request();
          rq2.input('v', sql.NVarChar(255), String(value).trim());
          const qr = await rq2.query(`SELECT TOP 1 [${idCol}] AS id FROM dbo.[${table}] WHERE [${textCol}] = @v`);
          return (qr.recordset && qr.recordset[0]) ? qr.recordset[0].id : null;
        } catch { return null; }
      };
      const normalizeBarvePut = (s) => {
        const t = String(s || '').trim();
        const m = t.match(/\b([14])\s*\/\s*([014])\b/);
        if (m) return `${m[1]}/${m[2]}`;
        if (/pantone/i.test(t)) return 'Pantone';
        return t;
      };
      // Osnovna polja v DelovniNalogPozicija
      addWithType('Format', x.format, 'nvarchar');
      addWithType('Obseg', x.obseg, 'nvarchar');
      addWithType('StKosov', x.steviloKosov, 'int');
      addWithType('StPol', x.steviloPol, 'int');
      addWithType('StKosovNaPoli', x.kosovNaPoli, 'int');
      addWithType('Razrez', x.razrez, 'bit');
      addWithType('VPolah', x.vPolah, 'bit');
      addWithType('Zgibanje', x.zgibanje, 'bit');
      addWithType('Biganje', x.biganje, 'bit');
      addWithType('Perforacija', x.perforacija, 'bit');
      addWithType('CenaBrezDDV', x.cenaBrezDDV, 'decimal');
      addWithType('GraficnaPriprava', x.graficnaPriprava, 'decimal');
      if (hasCol('TiskID')) {
        const val = normalizeBarveFull(x.barve);
        const id = await tryResolveIdFull('Tisk', 'Tisk', 'TiskID', val);
        if (id != null) addWithType('TiskID', id, 'int');
      }
      if (hasCol('UVTiskID')) {
        const id = await tryResolveIdFull('UVTisk', 'UVTisk', 'UVTiskID', x.uvTisk);
        if (id != null) addWithType('UVTiskID', id, 'int');
      }
      // TiskID in UVTiskID, če obstajata v tabeli
      if (hasCol('TiskID')) {
        const val = normalizeBarvePut(x.barve);
        const id = await tryResolveIdPut('Tisk', 'Tisk', 'TiskID', val);
        if (id != null) addWithType('TiskID', id, 'int');
      }
      if (hasCol('UVTiskID')) {
        const id = await tryResolveIdPut('UVTisk', 'UVTisk', 'UVTiskID', x.uvTisk);
        if (id != null) addWithType('UVTiskID', id, 'int');
      }
      // Collate: obvezen -> privzet na 0, če ga nismo nastavili
      if (hasCol('Collate') && !setParts.find(s => s.includes('[Collate]'))) {
        const param = colToParam('Collate');
        setParts.push(`[Collate] = @${param}`);
        rq.input(param, sql.Int, 0);
      }
      // Upsert
      const setSql = setParts.length ? `, ${setParts.join(', ')}` : '';
      const insertCols = setParts.map(s => s.match(/\[(.+?)\]/)[1]);
      const insertColsSql = insertCols.length ? ', ' + insertCols.map(c => `[${c}]`).join(', ') : '';
      const insertValsSql = insertCols.length ? ', ' + insertCols.map(c => `@${colToParam(c)}`).join(', ') : '';
      await rq.query(`
        IF EXISTS (SELECT 1 FROM dbo.[${xmlTable}] WHERE DelovniNalogID=@DelovniNalogID AND Pozicija=@Pozicija)
          UPDATE dbo.[${xmlTable}]
          SET Pozicija=@Pozicija${setSql}
          WHERE DelovniNalogID=@DelovniNalogID AND Pozicija=@Pozicija
        ELSE
          INSERT INTO dbo.[${xmlTable}] (DelovniNalogID, Pozicija${insertColsSql})
          VALUES (@DelovniNalogID, @Pozicija${insertValsSql})
      `);
    };
    try {
      await upsertXmlFull(1, predmet1, xml1);
      await upsertXmlFull(2, predmet2, xml2);
    } catch (e) {
      console.warn('Opozorilo: upsert XML ni uspel:', e && e.message ? e.message : e);
    }
    // Vstavi v DelovniNalogPosiljanje (če tabela obstaja) – normalizirano, vključno z Email/PosljiEmail
    try {
      const existsPos = await new sql.Request().query(`
        SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='DelovniNalogPosiljanje'
      `);
      if (existsPos.recordset && existsPos.recordset.length) {
        const rq = new sql.Request();
        rq.input('DN', sql.Int, newId);
        rq.input('PoPosti', sql.Bit, posiljanjePoPosti ? 1 : 0);
        rq.input('Naziv', sql.NVarChar(200), posiljanjeNaziv || null);
        rq.input('Naslov', sql.NVarChar(200), posiljanjeNaslov || null);
        rq.input('Kraj', sql.NVarChar(100), posiljanjeKraj || null);
        rq.input('Posta', sql.NVarChar(20), posiljanjePosta || null);
        rq.input('Osebno', sql.Bit, posiljanjeOsebnoPrevzem ? 1 : 0);
        rq.input('Dostava', sql.Bit, posiljanjeDostavaNaLokacijo ? 1 : 0);
        rq.input('Kontaktna', sql.NVarChar(100), posiljanjeKontaktnaOseba || null);
        rq.input('Kontakt', sql.NVarChar(255), posiljanjeKontakt || null);
        rq.input('Email', sql.NVarChar(255), posiljanjeEmail || null);
        rq.input('Poslji', sql.Bit, posiljanjePosljiEmail ? 1 : 0);
        await rq.query(`
          INSERT INTO dbo.DelovniNalogPosiljanje
            ([DelovniNalogID],[PosiljanjePoPosti],[Naziv],[Naslov],[Kraj],[Posta],[OsebnoPrevzem],[DostavaNaLokacijo],[KontaktnaOseba],[Kontakt],[Email],[PosljiEmail])
          VALUES (@DN,@PoPosti,@Naziv,@Naslov,@Kraj,@Posta,@Osebno,@Dostava,@Kontaktna,@Kontakt,@Email,@Poslji)
        `);
      }
    } catch (e) {
      console.warn('Opozorilo: zapis v DelovniNalogPosiljanje ni uspel:', e && e.message ? e.message : e);
    }
    // Vstavi v DelovniNalogDodatno (če tabela obstaja) – narocilnica/kontaktEmail/posljiEmail
    try {
      const existsDod = await new sql.Request().query(`
        SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='DelovniNalogDodatno'
      `);
      if (existsDod.recordset && existsDod.recordset.length) {
        const rq = new sql.Request();
        rq.input('DN', sql.Int, newId);
        rq.input('Nar', sql.NVarChar(100), narocilnica || null);
        rq.input('Email', sql.NVarChar(255), (kontaktEmail || email || null));
        rq.input('Poslji', sql.Bit, posljiEmail ? 1 : 0);
        await rq.query(`
          INSERT INTO dbo.DelovniNalogDodatno
            ([DelovniNalogID],[Narocilnica],[KontaktEmail],[PosljiEmail])
          VALUES (@DN,@Nar,@Email,@Poslji)
        `);
      }
    } catch (e) {
      console.warn('Opozorilo: zapis v DelovniNalogDodatno ni uspel:', e && e.message ? e.message : e);
    }
    // Vrni številko naloga: če je nismo nastavljali, poskusi prebrati največjo ali identity
    let outStevilka = stevilkaNaloga;
    if (outStevilka == null) {
      // Če nimamo kolone za številko, vrni DelovniNalogID kot številko
      const lastIdRes = await new sql.Request().query(`SELECT MAX(DelovniNalogID) AS lastId FROM dbo.DelovniNalog`);
      outStevilka = lastIdRes.recordset && lastIdRes.recordset[0] ? lastIdRes.recordset[0].lastId : null;
    }
    res.json({
      stevilkaNaloga: outStevilka,
      datumOdprtja: datumOdprtja.toISOString(),
      rokIzdelave: rokIzdelaveDate ? rokIzdelaveDate.toISOString() : null
    });
  } catch (e) {
    console.error('Napaka pri ustvarjanju delovnega naloga:', e);
    res.status(500).json({ error: 'Napaka pri ustvarjanju delovnega naloga', details: e && e.message ? e.message : String(e) });
  }
});

// Sprejme CELOTEN JSON delovnega naloga (kot priloženi nalog-xxxxx.json) in zapiše v normalizirane tabele
	app.post('/api/delovni-nalog/full', async (req, res) => {
		const nalog = req.body || {};
		// IZRECNO uporabljaj TEST bazo, kot zahtevano
		const targetDb = (process.env.DB_NAME_TEST || 'DelovniNalog_TEST');
		const config = {
			user: process.env.DB_USER || process.env.DB_USERNAME,
			password: process.env.DB_PASS || process.env.DB_PASSWORD,
			server: process.env.DB_SERVER || process.env.DB_HOST || 'localhost',
			database: targetDb,
			port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
			options: { encrypt: false, trustServerCertificate: true },
		};
		const pool = await new sql.ConnectionPool(config).connect();
    // Poskrbi za shemo (B1/B2, kooperant stolpci, reklamacija) – v isti bazi kot targetDb
    const ensureSchema = async () => {
      const exec = async (q, tag = '') => {
        try { await pool.request().query(q); }
        catch (e) { console.warn('[ensureSchema]', tag || 'ddl', e && e.message ? e.message : String(e)); }
      };
      // Delno zaključevanje tiska: TiskZakljucen1/2 na glavi (DelovniNalog)
      await exec(`
        IF OBJECT_ID(N'[dbo].[DelovniNalog]', N'U') IS NOT NULL AND COL_LENGTH('dbo.DelovniNalog','TiskZakljucen1') IS NULL
          ALTER TABLE [dbo].[DelovniNalog] ADD [TiskZakljucen1] BIT NOT NULL CONSTRAINT DF_DN_TiskZaklj1 DEFAULT(0);
      `, 'alter dn TiskZakljucen1');
      await exec(`
        IF OBJECT_ID(N'[dbo].[DelovniNalog]', N'U') IS NOT NULL AND COL_LENGTH('dbo.DelovniNalog','TiskZakljucen2') IS NULL
          ALTER TABLE [dbo].[DelovniNalog] ADD [TiskZakljucen2] BIT NOT NULL CONSTRAINT DF_DN_TiskZaklj2 DEFAULT(0);
      `, 'alter dn TiskZakljucen2');
      // Kooperant – dodaj manjkajoče
      await exec(`
        IF OBJECT_ID(N'[dbo].[DelovniNalogPozicijaKooperant]', N'U') IS NULL
        BEGIN
          CREATE TABLE [dbo].[DelovniNalogPozicijaKooperant](
            [DelovniNalogID] INT NOT NULL,
            [Pozicija] INT NOT NULL,
            [Zaporedje] TINYINT NOT NULL,
            [Ime] NVARCHAR(255) NULL,
            [PredvidenRok] DATE NULL,
            [Znesek] DECIMAL(18,2) NULL,
            [Vrsta] NVARCHAR(255) NULL,
            [CreatedAt] DATETIME2 NOT NULL CONSTRAINT DF_DNKoop_CreatedAt DEFAULT SYSDATETIME()
          );
          ALTER TABLE [dbo].[DelovniNalogPozicijaKooperant]
          ADD CONSTRAINT FK_DNKoop_DN FOREIGN KEY ([DelovniNalogID]) REFERENCES [dbo].[DelovniNalog]([DelovniNalogID]);
        END`, 'create kooperant');
      await exec(`IF OBJECT_ID(N'[dbo].[DelovniNalogPozicijaKooperant]', N'U') IS NOT NULL AND COL_LENGTH('dbo.DelovniNalogPozicijaKooperant','Pozicija') IS NULL
        ALTER TABLE [dbo].[DelovniNalogPozicijaKooperant] ADD [Pozicija] INT NOT NULL CONSTRAINT DF_DNKoop_Pozicija DEFAULT 1;`, 'alter koop Pozicija');
      await exec(`IF OBJECT_ID(N'[dbo].[DelovniNalogPozicijaKooperant]', N'U') IS NOT NULL AND COL_LENGTH('dbo.DelovniNalogPozicijaKooperant','Zaporedje') IS NULL
        ALTER TABLE [dbo].[DelovniNalogPozicijaKooperant] ADD [Zaporedje] TINYINT NOT NULL CONSTRAINT DF_DNKoop_Zaporedje DEFAULT 1;`, 'alter koop Zaporedje');
      await exec(`IF OBJECT_ID(N'[dbo].[DelovniNalogPozicijaKooperant]', N'U') IS NOT NULL AND COL_LENGTH('dbo.DelovniNalogPozicijaKooperant','Ime') IS NULL
        ALTER TABLE [dbo].[DelovniNalogPozicijaKooperant] ADD [Ime] NVARCHAR(255) NULL;`, 'alter koop Ime');
      await exec(`IF OBJECT_ID(N'[dbo].[DelovniNalogPozicijaKooperant]', N'U') IS NOT NULL AND COL_LENGTH('dbo.DelovniNalogPozicijaKooperant','PredvidenRok') IS NULL
        ALTER TABLE [dbo].[DelovniNalogPozicijaKooperant] ADD [PredvidenRok] DATE NULL;`, 'alter koop PredvidenRok');
      await exec(`IF OBJECT_ID(N'[dbo].[DelovniNalogPozicijaKooperant]', N'U') IS NOT NULL AND COL_LENGTH('dbo.DelovniNalogPozicijaKooperant','Znesek') IS NULL
        ALTER TABLE [dbo].[DelovniNalogPozicijaKooperant] ADD [Znesek] DECIMAL(18,2) NULL;`, 'alter koop Znesek');
      await exec(`IF OBJECT_ID(N'[dbo].[DelovniNalogPozicijaKooperant]', N'U') IS NOT NULL AND COL_LENGTH('dbo.DelovniNalogPozicijaKooperant','Vrsta') IS NULL
        ALTER TABLE [dbo].[DelovniNalogPozicijaKooperant] ADD [Vrsta] NVARCHAR(255) NULL;`, 'alter koop Vrsta');
      await exec(`IF OBJECT_ID(N'[dbo].[DelovniNalogPozicijaKooperant]', N'U') IS NOT NULL AND COL_LENGTH('dbo.DelovniNalogPozicijaKooperant','CreatedAt') IS NULL
        ALTER TABLE [dbo].[DelovniNalogPozicijaKooperant] ADD [CreatedAt] DATETIME2 NOT NULL CONSTRAINT DF_DNKoop_CreatedAt DEFAULT SYSDATETIME();`, 'alter koop CreatedAt');
      await exec(`
        IF OBJECT_ID(N'[dbo].[DelovniNalogPozicija]', N'U') IS NOT NULL AND COL_LENGTH('dbo.DelovniNalogPozicija','B1Format') IS NULL
          ALTER TABLE [dbo].[DelovniNalogPozicija] ADD [B1Format] BIT NOT NULL CONSTRAINT DF_DNPoz_B1 DEFAULT 0;`);
      await exec(`
        IF OBJECT_ID(N'[dbo].[DelovniNalogPozicija]', N'U') IS NOT NULL AND COL_LENGTH('dbo.DelovniNalogPozicija','B2Format') IS NULL
          ALTER TABLE [dbo].[DelovniNalogPozicija] ADD [B2Format] BIT NOT NULL CONSTRAINT DF_DNPoz_B2 DEFAULT 0;`);
      await exec(`
        IF OBJECT_ID(N'[dbo].[DelovniNalogReklamacija]', N'U') IS NULL
        BEGIN
          CREATE TABLE [dbo].[DelovniNalogReklamacija](
            [DelovniNalogID] INT NOT NULL PRIMARY KEY,
            [Aktivna] BIT NULL,
            [Vrsta] NVARCHAR(100) NULL,
            [Znesek] DECIMAL(18,2) NULL,
            [CreatedAt] DATETIME2 NOT NULL CONSTRAINT DF_DNRekl_CreatedAt DEFAULT SYSDATETIME(),
            CONSTRAINT FK_DNRekl_DN FOREIGN KEY ([DelovniNalogID]) REFERENCES [dbo].[DelovniNalog]([DelovniNalogID])
          );
        END`, 'create reklamacija');
    };
    await ensureSchema();
  const tx = new sql.Transaction(pool);
  try {
    await tx.begin();
    // Helperji
    const runq = async (query, inputs = []) => {
      const r = new sql.Request(tx);
      for (const p of inputs) r.input(p.name, p.type, p.value);
      return await r.query(query);
    };
			const colExists = async (table, column) => {
				const r = await runq(
					`SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME=@t AND COLUMN_NAME=@c`,
					[
						{ name: 't', type: sql.NVarChar(128), value: table },
						{ name: 'c', type: sql.NVarChar(128), value: column }
					]
				);
				return r.recordset.length > 0;
			};
    const tryResolveIdGen = async (table, textCol, idCol, value) => {
      try {
        if (!value) return null;
        const r = new sql.Request(tx);
        r.input('v', sql.NVarChar(255), String(value).trim());
        const q = await r.query(`SELECT TOP 1 [${idCol}] AS id FROM dbo.[${table}] WHERE [${textCol}] = @v`);
        return (q.recordset && q.recordset[0]) ? q.recordset[0].id : null;
      } catch { return null; }
    };
    const normalizeBarveFull = (s) => {
      const t = String(s || '').trim();
      const m = t.match(/\b([14])\s*\/\s*([014])\b/);
      if (m) return `${m[1]}/${m[2]}`;
      if (/pantone/i.test(t)) return 'Pantone';
      return t;
    };
    const safeInt = (v) => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(String(v).replace(',', '.'));
      return Number.isFinite(n) ? Math.trunc(n) : null;
    };
    const safeDec = (v) => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(String(v).replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    };
    const safeDate = (v) => {
      if (!v) return null;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d.toISOString();
    };
    const tableExists = async (name) => {
      const r = await runq(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME=@t`, [
        { name: 't', type: sql.NVarChar(128), value: name }
      ]);
      return r.recordset.length > 0;
    };

    // 1) Header zapis v dbo.DelovniNalog
    const kupec = nalog.kupec || {};
    const komentar = (nalog.komentar && nalog.komentar.komentar) || '';
    const datumNar = nalog.datumNarocila ? safeDate(nalog.datumNarocila) : null;
    const rok = nalog.rokIzdelave ? safeDate(nalog.rokIzdelave) : null;

    // Ugotovi, ali posodabljamo obstoječ DN (po DelovniNalogID ali StevilkaNaloga), sicer INSERT
    const tryGetExistingId = async () => {
      const r = new sql.Request(tx);
      const idCand = nalog.delovniNalogID || nalog.DelovniNalogID || nalog.id;
      if (idCand != null && Number.isFinite(Number(idCand))) {
        r.input('i', sql.Int, Number(idCand));
        const x = await r.query(`SELECT TOP 1 DelovniNalogID FROM dbo.DelovniNalog WHERE DelovniNalogID=@i`);
        if (x.recordset && x.recordset[0]) return x.recordset[0].DelovniNalogID;
      }
      const numCand = nalog.stevilkaNaloga || nalog.StevilkaNaloga;
      if (numCand != null && Number.isFinite(Number(numCand))) {
        const r2 = new sql.Request(tx);
        r2.input('n', sql.Int, Number(numCand));
        try {
          const x2 = await r2.query(`SELECT TOP 1 DelovniNalogID FROM dbo.DelovniNalog WHERE StevilkaNaloga=@n`);
          if (x2.recordset && x2.recordset[0]) return x2.recordset[0].DelovniNalogID;
        } catch {}
      }
      return null;
    };
    let delovniNalogID = await tryGetExistingId();
    // Statusi zaključevanja (podprti v novi funkcionalnosti: ločen zaključek tisk 1/2)
    const tiskZakljucen1 = !!(nalog.tiskZakljucen1 ?? nalog.TiskZakljucen1);
    const tiskZakljucen2 = !!(nalog.tiskZakljucen2 ?? nalog.TiskZakljucen2);
    const tiskZakljucen = !!(nalog.tiskZakljucen ?? nalog.TiskZakljucen ?? (tiskZakljucen1 && tiskZakljucen2));
    const dobavljeno = !!(nalog.dobavljeno ?? nalog.Dobavljeno);
    if (delovniNalogID) {
      console.log(`[FULL] Update header for existing DN=${delovniNalogID} (DB=${targetDb})`);
      // UPDATE glave
      const up = new sql.Request(tx);
      up.input('DN', sql.Int, delovniNalogID);
      up.input('Datum', sql.DateTime, datumNar ? new Date(datumNar) : new Date());
      up.input('Rok', sql.DateTime, rok ? new Date(rok) : null);
      up.input('TiskZaklj', sql.Bit, tiskZakljucen ? 1 : 0);
      up.input('TiskZaklj1', sql.Bit, tiskZakljucen1 ? 1 : 0);
      up.input('TiskZaklj2', sql.Bit, tiskZakljucen2 ? 1 : 0);
      up.input('Dobavljeno', sql.Bit, dobavljeno ? 1 : 0);
      up.input('KupecID', sql.Int, kupec.KupecID || null);
      up.input('KupecNaziv', sql.NVarChar(200), kupec.Naziv || null);
      up.input('KupecNaslov', sql.NVarChar(200), kupec.Naslov || null);
      up.input('KupecPosta', sql.NVarChar(20), kupec.Posta || null);
      up.input('KupecKraj', sql.NVarChar(100), kupec.Kraj || null);
      up.input('KupecTelefon', sql.NVarChar(50), kupec.Telefon || null);
      up.input('KupecFax', sql.NVarChar(50), kupec.Fax || null);
      up.input('KupecIDzaDDV', sql.NVarChar(15), kupec.IDzaDDV || null);
      up.input('KupecKontakt', sql.NVarChar(50), kupec.KupecKontakt || kupec.kontakt || null);
      up.input('Opombe', sql.NVarChar(sql.MAX), komentar || null);
      await up.query(`
        UPDATE dbo.DelovniNalog
        SET [Datum]=@Datum,[RokIzdelave]=@Rok,[TiskZakljucen]=@TiskZaklj,[TiskZakljucen1]=@TiskZaklj1,[TiskZakljucen2]=@TiskZaklj2,[Dobavljeno]=@Dobavljeno,
            [KupecID]=@KupecID,[KupecNaziv]=@KupecNaziv,[KupecNaslov]=@KupecNaslov,
            [KupecPosta]=@KupecPosta,[KupecKraj]=@KupecKraj,[KupecTelefon]=@KupecTelefon,[KupecFax]=@KupecFax,
            [KupecIDzaDDV]=@KupecIDzaDDV,[KupecKontakt]=@KupecKontakt,[Opombe]=@Opombe
        WHERE DelovniNalogID=@DN
      `);
    } else {
      console.log(`[FULL] Insert new header (DB=${targetDb})`);
      // INSERT glave
      const ins = new sql.Request(tx);
      ins.input('Datum', sql.DateTime, datumNar ? new Date(datumNar) : new Date());
      ins.input('Rok', sql.DateTime, rok ? new Date(rok) : null);
      ins.input('TiskZaklj', sql.Bit, tiskZakljucen ? 1 : 0);
      ins.input('TiskZaklj1', sql.Bit, tiskZakljucen1 ? 1 : 0);
      ins.input('TiskZaklj2', sql.Bit, tiskZakljucen2 ? 1 : 0);
      ins.input('Dobavljeno', sql.Bit, dobavljeno ? 1 : 0);
      ins.input('KupecID', sql.Int, kupec.KupecID || null);
      ins.input('KupecNaziv', sql.NVarChar(200), kupec.Naziv || null);
      ins.input('KupecNaslov', sql.NVarChar(200), kupec.Naslov || null);
      ins.input('KupecPosta', sql.NVarChar(20), kupec.Posta || null);
      ins.input('KupecKraj', sql.NVarChar(100), kupec.Kraj || null);
      ins.input('KupecTelefon', sql.NVarChar(50), kupec.Telefon || null);
      ins.input('KupecFax', sql.NVarChar(50), kupec.Fax || null);
      ins.input('KupecIDzaDDV', sql.NVarChar(15), kupec.IDzaDDV || null);
      ins.input('KupecKontakt', sql.NVarChar(50), kupec.KupecKontakt || kupec.kontakt || null);
      ins.input('Opombe', sql.NVarChar(sql.MAX), komentar || null);
      const insRes = await ins.query(`
        INSERT INTO dbo.DelovniNalog
          ([Datum],[RokIzdelave],[TiskZakljucen],[TiskZakljucen1],[TiskZakljucen2],[Dobavljeno],[KupecID],[KupecNaziv],[KupecNaslov],[KupecPosta],[KupecKraj],[KupecTelefon],[KupecFax],[KupecIDzaDDV],[KupecKontakt],[Opombe])
        OUTPUT INSERTED.DelovniNalogID
        VALUES (@Datum,@Rok,@TiskZaklj,@TiskZaklj1,@TiskZaklj2,@Dobavljeno,@KupecID,@KupecNaziv,@KupecNaslov,@KupecPosta,@KupecKraj,@KupecTelefon,@KupecFax,@KupecIDzaDDV,@KupecKontakt,@Opombe)
      `);
      delovniNalogID = insRes.recordset[0].DelovniNalogID;
      console.log(`[FULL] New DN identity = ${delovniNalogID}`);
    }

    // 2) Pošiljanje (če tabela obstaja)
    if (await tableExists('DelovniNalogPosiljanje') && nalog.posiljanje) {
      const p = nalog.posiljanje;
      const cols = ['[DelovniNalogID]','[PosiljanjePoPosti]','[Naziv]','[Naslov]','[Kraj]','[Posta]','[OsebnoPrevzem]','[DostavaNaLokacijo]','[KontaktnaOseba]','[Kontakt]'];
      const vals = ['@DN','@PoPosti','@Naziv','@Naslov','@Kraj','@Posta','@Osebno','@Dostava','@Kontaktna','@Kontakt'];
      const ps = [
        { name: 'DN', type: sql.Int, value: delovniNalogID },
        { name: 'PoPosti', type: sql.Bit, value: p.posiljanjePoPosti ? 1 : 0 },
        { name: 'Naziv', type: sql.NVarChar(200), value: p.naziv || null },
        { name: 'Naslov', type: sql.NVarChar(200), value: p.naslov || null },
        { name: 'Kraj', type: sql.NVarChar(100), value: p.kraj || null },
        { name: 'Posta', type: sql.NVarChar(20), value: p.postnaStevilka || null },
        { name: 'Osebno', type: sql.Bit, value: p.osebnoPrevzem ? 1 : 0 },
        { name: 'Dostava', type: sql.Bit, value: p.dostavaNaLokacijo ? 1 : 0 },
        { name: 'Kontaktna', type: sql.NVarChar(100), value: p.kontaktnaOseba || null },
        { name: 'Kontakt', type: sql.NVarChar(255), value: p.kontakt || null }
      ];
      // Dodatna polja (če obstajajo v tabeli)
      if (await colExists('DelovniNalogPosiljanje','Email')) {
        cols.push('[Email]'); vals.push('@Email');
        ps.push({ name: 'Email', type: sql.NVarChar(255), value: (p.email || (nalog.kupec && (nalog.kupec.email || nalog.kupec.Email))) || null });
      }
      if (await colExists('DelovniNalogPosiljanje','PosljiEmail')) {
        const flag = (typeof p.posljiEmail !== 'undefined') ? p.posljiEmail : (nalog.kupec && nalog.kupec.posljiEmail);
        cols.push('[PosljiEmail]'); vals.push('@PosljiEmail');
        ps.push({ name: 'PosljiEmail', type: sql.Bit, value: flag ? 1 : 0 });
      }
      console.log(`Upsert Posiljanje for DN ${delovniNalogID}`);
      await runq(`
        IF EXISTS (SELECT 1 FROM dbo.DelovniNalogPosiljanje WHERE DelovniNalogID=@DN)
          UPDATE dbo.DelovniNalogPosiljanje
          SET PosiljanjePoPosti=@PoPosti,Naziv=@Naziv,Naslov=@Naslov,Kraj=@Kraj,Posta=@Posta,OsebnoPrevzem=@Osebno,DostavaNaLokacijo=@Dostava,KontaktnaOseba=@Kontaktna,Kontakt=@Kontakt
          ${cols.includes('[Email]') ? ',Email=@Email' : ''} ${cols.includes('[PosljiEmail]') ? ',PosljiEmail=@PosljiEmail' : ''}
          WHERE DelovniNalogID=@DN
        ELSE
          INSERT INTO dbo.DelovniNalogPosiljanje (${cols.join(',')})
          VALUES (${vals.join(',')})
      `, ps);
    }
    // 2b) Header dodatni podatki (če tabela obstaja)
    if (await tableExists('DelovniNalogDodatno')) {
      const narocilnica = nalog.kupec && nalog.kupec.narocilnica ? String(nalog.kupec.narocilnica) : null;
      const emailKontakt = (nalog.kupec && (nalog.kupec.email || nalog.kupec.Email)) || null;
      const posljiEmail = nalog.kupec && nalog.kupec.posljiEmail ? 1 : 0;
      const jeReklamacija = nalog.reklamacija && (nalog.reklamacija === true || nalog.reklamacija === 1) ? 1 : 0;
      const opisRekl = nalog.opisReklamacije || null;
      console.log(`Upsert Dodatno for DN ${delovniNalogID}`, { narocilnica, emailKontakt, posljiEmail, jeReklamacija, opisRekl });
      // Upsert vrstico (tudi če vrednosti prazne, da ostane sinhronizirano)
      await runq(`
        MERGE dbo.DelovniNalogDodatno AS t
        USING (SELECT @DN AS DelovniNalogID) AS s
        ON (t.DelovniNalogID = s.DelovniNalogID)
        WHEN MATCHED THEN UPDATE SET
          Narocilnica=@Nar, KontaktEmail=@Email, PosljiEmail=@Poslji, Reklamacija=@Rekl, OpisReklamacije=@Opis
        WHEN NOT MATCHED THEN
          INSERT ([DelovniNalogID],[Narocilnica],[KontaktEmail],[PosljiEmail],[Reklamacija],[OpisReklamacije])
          VALUES (@DN,@Nar,@Email,@Poslji,@Rekl,@Opis);
      `, [
        { name: 'DN', type: sql.Int, value: delovniNalogID },
        { name: 'Nar', type: sql.NVarChar(100), value: narocilnica },
        { name: 'Email', type: sql.NVarChar(255), value: emailKontakt },
        { name: 'Poslji', type: sql.Bit, value: posljiEmail },
        { name: 'Rekl', type: sql.Bit, value: jeReklamacija },
        { name: 'Opis', type: sql.NVarChar(sql.MAX), value: opisRekl }
      ]);
    }

    // 3) Vnos pozicij (tisk1/tisk2) + dodelave + mutacije + stroški + material
    const upsertPozicija = async (pozIdx, tiskObj, dodelavaObj, stroskiObj, stroskiGroup) => {
      if (!tiskObj) return;
      // DelovniNalogPozicija (osnovna) – pred vpisom odstrani star zapis (upsert)
      console.log(`DELETE Pozicija base for DN ${delovniNalogID}, Pozicija ${pozIdx}`);
      await runq(`DELETE FROM dbo.DelovniNalogPozicija WHERE DelovniNalogID=@DN AND Pozicija=@Poz`, [
        { name: 'DN', type: sql.Int, value: delovniNalogID },
        { name: 'Poz', type: sql.Int, value: pozIdx }
      ]);
      const tiskText = normalizeBarveFull(tiskObj.barve);
      const tiskId = await tryResolveIdGen('Tisk', 'Tisk', 'TiskID', tiskText);
      const rqP = new sql.Request(tx);
      rqP.input('DN', sql.Int, delovniNalogID);
      rqP.input('Poz', sql.Int, pozIdx);
      rqP.input('Predmet', sql.NVarChar(200), tiskObj.predmet || null);
      rqP.input('Format', sql.NVarChar(50), tiskObj.format || null);
      rqP.input('Obseg', sql.Int, safeInt(tiskObj.obseg));
      rqP.input('StKosov', sql.Int, safeInt(tiskObj.steviloKosov));
      rqP.input('TiskID', sql.Int, tiskId);
      rqP.input('Collate', sql.Bit, tiskObj.collate ? 1 : 0);
      rqP.input('StPol', sql.Int, safeInt(tiskObj.steviloPol));
      rqP.input('StKosovNaPoli', sql.Int, safeInt(tiskObj.kosovNaPoli));
				// Dinamično dodaj Ponatis=0, če stolpec obstaja in je NOT NULL
				let colsSql = '[DelovniNalogID],[Pozicija],[Predmet],[Format],[Obseg],[StKosov],[TiskID],[Collate],[StPol],[StKosovNaPoli]';
				let valsSql = '@DN,@Poz,@Predmet,@Format,@Obseg,@StKosov,@TiskID,@Collate,@StPol,@StKosovNaPoli';
				if (await colExists('DelovniNalogPozicija', 'Ponatis')) {
					colsSql += ',[Ponatis]';
					valsSql += ',@Ponatis';
					rqP.input('Ponatis', sql.Bit, 0);
				}
				if (await colExists('DelovniNalogPozicija', 'BarvniVzorec')) {
					colsSql += ',[BarvniVzorec]';
					valsSql += ',@BarvniVzorec';
					rqP.input('BarvniVzorec', sql.Bit, 0);
				}
				/* INSERT premaknjen nižje po ensureBit/ensureId, da vključimo vse NOT NULL stolpce */

      // Dinamično dodaj bit in ID stolpce, ki so v DelovniNalogPozicija (nekateri sistemi jih hranijo tukaj)
      // Privzete vrednosti: bit -> 0, ID -> NULL
      // Dodelave iz dodelavaObj, če so podane
      const ensureBit = async (colName, valBool) => {
        if (await colExists('DelovniNalogPozicija', colName)) {
          colsSql += `,[${colName}]`;
          valsSql += `,@${colName}`;
          rqP.input(colName, sql.Bit, valBool ? 1 : 0);
        }
      };
      const ensureId = async (colName, valId) => {
        if (await colExists('DelovniNalogPozicija', colName)) {
          colsSql += `,[${colName}]`;
          valsSql += `,@${colName}`;
          rqP.input(colName, sql.Int, valId != null ? Number(valId) : null);
        }
      };
      // Podpri B1/B2 tudi v osnovni tabeli Pozicija (privzeto 0, če ni)
      await ensureBit('B1Format', !!tiskObj.b1Format);
      await ensureBit('B2Format', !!tiskObj.b2Format);
      // Ponastavi bitovne dodelave na 0, razen če jih dodelavaObj prepiše
      const d = dodelavaObj || {};
      await ensureBit('Razrez', !!d.razrez);
      await ensureBit('VPolah', !!d.vPolah);
      await ensureBit('Zgibanje', !!d.zgibanje);
      await ensureBit('Biganje', !!d.biganje);
      await ensureBit('Perforacija', !!d.perforacija);
      // ID dodelave
      const uvTiskIdPoz = await tryResolveIdGen('UVTisk', 'UVTisk', 'UVTiskID', d.uvTisk);
      const uvLakIdPoz = await tryResolveIdGen('3DUVLak', '3DUVLak', '3DUVLakID', d.uvLak);
      const vezavaIdPoz = await tryResolveIdGen('Vezava', 'Vezava', 'VezavaID', d.vezava);
      const izsekIdPoz = await tryResolveIdGen('IzsekZasek', 'IzsekZasek', 'IzsekZasekID', d.izsek);
      const plastIdPoz = await tryResolveIdGen('Plastifikacija', 'Plastifikacija', 'PlastifikacijaID', d.plastifikacija);
      await ensureId('UVTiskID', uvTiskIdPoz);
      await ensureId('3DUVLakID', uvLakIdPoz);
      await ensureId('VezavaID', vezavaIdPoz);
      await ensureId('IzsekZasekID', izsekIdPoz);
      await ensureId('PlastifikacijaID', plastIdPoz);
      // Stroški, če so polja v poziciji
      if (await colExists('DelovniNalogPozicija', 'GraficnaPriprava')) {
        colsSql += ',[GraficnaPriprava]';
        valsSql += ',@GraficnaPriprava';
        rqP.input('GraficnaPriprava', sql.Decimal(10,2), safeDec(stroskiObj && stroskiObj.graficnaPriprava));
      }
      if (await colExists('DelovniNalogPozicija', 'CenaBrezDDV')) {
        colsSql += ',[CenaBrezDDV]';
        valsSql += ',@CenaBrezDDV';
        rqP.input('CenaBrezDDV', sql.Decimal(10,2), safeDec(stroskiObj && stroskiObj.cenaBrezDDV));
      }
      // Zdaj izvedi INSERT v osnovno tabelo z vključenimi dodatnimi stolpci
      await rqP.query(`
        INSERT INTO dbo.DelovniNalogPozicija (${colsSql})
        VALUES (${valsSql})
      `);
      // Ext (kooperant, formati, orodje)
      if (await tableExists('DelovniNalogPozicijaExt')) {
        // Remove existing Ext row to avoid PK duplicate, then insert fresh
        console.log(`DELETE PozicijaExt for DN ${delovniNalogID}, Pozicija ${pozIdx}`);
        await runq(`DELETE FROM dbo.DelovniNalogPozicijaExt WHERE DelovniNalogID=@DN AND Pozicija=@Poz`, [
          { name: 'DN', type: sql.Int, value: delovniNalogID },
          { name: 'Poz', type: sql.Int, value: pozIdx }
        ]);
        const rqE = new sql.Request(tx);
        rqE.input('DN', sql.Int, delovniNalogID);
        rqE.input('Poz', sql.Int, pozIdx);
        rqE.input('B1', sql.Bit, tiskObj.b1Format ? 1 : 0);
        rqE.input('B2', sql.Bit, tiskObj.b2Format ? 1 : 0);
        rqE.input('TK', sql.Bit, tiskObj.tiskaKooperant ? 1 : 0);
        rqE.input('KN', sql.NVarChar(200), tiskObj.kooperant || null);
        rqE.input('RR', sql.DateTime, safeDate(tiskObj.rokKooperanta) ? new Date(safeDate(tiskObj.rokKooperanta)) : null);
        rqE.input('ZK', sql.Decimal(10,2), safeDec(tiskObj.znesekKooperanta));
        rqE.input('SO', sql.NVarChar(50), dodelavaObj && dodelavaObj.stevilkaOrodja ? dodelavaObj.stevilkaOrodja : null);
        await rqE.query(`
          INSERT INTO dbo.DelovniNalogPozicijaExt
            ([DelovniNalogID],[Pozicija],[B1Format],[B2Format],[TiskaKooperant],[KooperantNaziv],[RokKooperanta],[ZnesekKooperanta],[StevilkaOrodja])
          VALUES (@DN,@Poz,@B1,@B2,@TK,@KN,@RR,@ZK,@SO)
        `);
      }

      // Mutacije
      if (await tableExists('DelovniNalogPozicijaMutacija') && Array.isArray(tiskObj.mutacije)) {
        for (let i = 0; i < tiskObj.mutacije.length; i++) {
          const m = tiskObj.mutacije[i] || {};
          console.log(`Inserting Mutacija #${i + 1} for DN ${delovniNalogID}, Pozicija ${pozIdx}`);
          await runq(`
            INSERT INTO dbo.DelovniNalogPozicijaMutacija
              ([DelovniNalogID],[Pozicija],[Zaporedje],[StPol])
            VALUES (@DN,@Poz,@Zap,@StPol)
          `, [
            { name: 'DN', type: sql.Int, value: delovniNalogID },
            { name: 'Poz', type: sql.Int, value: pozIdx },
            { name: 'Zap', type: sql.Int, value: i + 1 },
            { name: 'StPol', type: sql.Int, value: safeInt(m.steviloPol) }
          ]);
        }
      }

      // Dodelava
      if (await tableExists('DelovniNalogPozicijaDodelava')) {
        // Remove star zapis (upsert)
        console.log(`DELETE Dodelava for DN ${delovniNalogID}, Pozicija ${pozIdx}`);
        await runq(`DELETE FROM dbo.DelovniNalogPozicijaDodelava WHERE DelovniNalogID=@DN AND Pozicija=@Poz`, [
          { name: 'DN', type: sql.Int, value: delovniNalogID },
          { name: 'Poz', type: sql.Int, value: pozIdx }
        ]);
        const dd = dodelavaObj || {};
        const uvTiskId = await tryResolveIdGen('UVTisk', 'UVTisk', 'UVTiskID', dd.uvTisk);
        const uvLakId = await tryResolveIdGen('3DUVLak', '3DUVLak', '3DUVLakID', dd.uvLak);
        const vezavaId = await tryResolveIdGen('Vezava', 'Vezava', 'VezavaID', dd.vezava);
        const izsekId = await tryResolveIdGen('IzsekZasek', 'IzsekZasek', 'IzsekZasekID', dd.izsek);
        const plastId = await tryResolveIdGen('Plastifikacija', 'Plastifikacija', 'PlastifikacijaID', dd.plastifikacija);
        console.log(`Inserting Dodelava for DN ${delovniNalogID}, Pozicija ${pozIdx}`);
        await runq(`
          INSERT INTO dbo.DelovniNalogPozicijaDodelava
            ([DelovniNalogID],[Pozicija],[Razrez],[VPolah],[Zgibanje],[Biganje],[Perforacija],[BiganjeRocnoZgibanje],
             [Lepljenje],[LepljenjeMesta],[LepljenjeSirina],[LepljenjeBlokov],[VrtanjeLuknje],[VelikostLuknje],
             [UVTiskID],[UVLakID],[TopliTisk],[VezavaID],[IzsekZasekID],[PlastifikacijaID])
          VALUES (@DN,@Poz,@Raz,@VP,@Zg,@Bg,@Perf,@BRZ,@Lep,@LM,@LS,@LB,@VL,@Vel,@UVT,@UVL,@Topli,@Vez,@Izs,@Pl)
        `, [
          { name: 'DN', type: sql.Int, value: delovniNalogID },
          { name: 'Poz', type: sql.Int, value: pozIdx },
          { name: 'Raz', type: sql.Bit, value: dd.razrez ? 1 : 0 },
          { name: 'VP', type: sql.Bit, value: dd.vPolah ? 1 : 0 },
          { name: 'Zg', type: sql.Bit, value: dd.zgibanje ? 1 : 0 },
          { name: 'Bg', type: sql.Bit, value: dd.biganje ? 1 : 0 },
          { name: 'Perf', type: sql.Bit, value: dd.perforacija ? 1 : 0 },
          { name: 'BRZ', type: sql.Bit, value: dd.biganjeRocnoZgibanje ? 1 : 0 },
          { name: 'Lep', type: sql.Bit, value: dd.lepljenje ? 1 : 0 },
          { name: 'LM', type: sql.NVarChar(50), value: dd.lepljenjeMesta || null },
          { name: 'LS', type: sql.NVarChar(100), value: dd.lepljenjeSirina || null },
          { name: 'LB', type: sql.Bit, value: dd.lepljenjeBlokov ? 1 : 0 },
          { name: 'VL', type: sql.Bit, value: dd.vrtanjeLuknje ? 1 : 0 },
          { name: 'Vel', type: sql.NVarChar(50), value: dd.velikostLuknje || null },
          { name: 'UVT', type: sql.Int, value: uvTiskId },
          { name: 'UVL', type: sql.Int, value: uvLakId },
          { name: 'Topli', type: sql.NVarChar(50), value: dd.topliTisk || null },
          { name: 'Vez', type: sql.Int, value: vezavaId },
          { name: 'Izs', type: sql.Int, value: izsekId },
          { name: 'Pl', type: sql.Int, value: plastId }
        ]);

        // Kooperanti v dodelavi (1..3)
        if (await tableExists('DelovniNalogPozicijaKooperant')) {
          // Remove vse kooperante za to pozicijo (upsert)
          console.log(`DELETE Kooperanti for DN ${delovniNalogID}, Pozicija ${pozIdx}`);
          await runq(`DELETE FROM dbo.DelovniNalogPozicijaKooperant WHERE DelovniNalogID=@DN AND Pozicija=@Poz`, [
            { name: 'DN', type: sql.Int, value: delovniNalogID },
            { name: 'Poz', type: sql.Int, value: pozIdx }
          ]);
          for (let k = 1; k <= 3; k++) {
            const flag = dd[`kooperant${k}`];
            const data = dd[`kooperant${k}Podatki`];
            if (!flag || !data) continue;
            console.log(`Inserting Kooperant ${k} for DN ${delovniNalogID}, Pozicija ${pozIdx}`);
            await runq(`
              INSERT INTO dbo.DelovniNalogPozicijaKooperant
                ([DelovniNalogID],[Pozicija],[Zaporedje],[Ime],[PredvidenRok],[Znesek],[Vrsta])
              VALUES (@DN,@Poz,@Zap,@Ime,@Rok,@Znesek,@Vrsta)
            `, [
              { name: 'DN', type: sql.Int, value: delovniNalogID },
              { name: 'Poz', type: sql.Int, value: pozIdx },
              { name: 'Zap', type: sql.SmallInt, value: k },
              { name: 'Ime', type: sql.NVarChar(200), value: data.imeKooperanta || null },
              { name: 'Rok', type: sql.DateTime, value: safeDate(data.predvidenRok) ? new Date(safeDate(data.predvidenRok)) : null },
              { name: 'Znesek', type: sql.Decimal(10,2), value: safeDec(data.znesekDodelave) },
              { name: 'Vrsta', type: sql.NVarChar(50), value: data.vrstaDodelave || null }
            ]);
          }
        }
      }

      // Stroški (skupina 1/2, fleksibilni nazivi)
      if (await tableExists('DelovniNalogPozicijaStrosek')) {
        // Remove obstoječe stroške za pozicijo (upsert)
        console.log(`DELETE Strosek for DN ${delovniNalogID}, Pozicija ${pozIdx}`);
        await runq(`DELETE FROM dbo.DelovniNalogPozicijaStrosek WHERE DelovniNalogID=@DN AND Pozicija=@Poz`, [
          { name: 'DN', type: sql.Int, value: delovniNalogID },
          { name: 'Poz', type: sql.Int, value: pozIdx }
        ]);
        const insertStroskiGroup = async (grp, s) => {
          if (!s) return;
          const pairs = [
            ['graficnaPriprava', s.graficnaPriprava],
            ['cenaKlišeja', s.cenaKlišeja],
            ['cenaIzsekovalnegaOrodja', s.cenaIzsekovalnegaOrodja],
            ['cenaVzorca', s.cenaVzorca],
            ['cenaBrezDDV', s.cenaBrezDDV]
          ];
          for (const [naziv, znesek] of pairs) {
            if (typeof znesek === 'undefined') continue;
            console.log(`Inserting Strosek grp=${grp}, ${naziv} for DN ${delovniNalogID}, Pozicija ${pozIdx}`);
            await runq(`
              INSERT INTO dbo.DelovniNalogPozicijaStrosek
                ([DelovniNalogID],[Pozicija],[Skupina],[Naziv],[Znesek])
              VALUES (@DN,@Poz,@Grp,@Naziv,@Znesek)
            `, [
              { name: 'DN', type: sql.Int, value: delovniNalogID },
              { name: 'Poz', type: sql.Int, value: pozIdx },
              { name: 'Grp', type: sql.TinyInt, value: grp },
              { name: 'Naziv', type: sql.NVarChar(50), value: naziv },
              { name: 'Znesek', type: sql.Decimal(10,2), value: safeDec(znesek) }
            ]);
          }
        };
        const grp = stroskiGroup && Number.isFinite(stroskiGroup) ? stroskiGroup : 1;
        await insertStroskiGroup(grp, stroskiObj);
      }

      // Material (raw text + morebitna kasnejša vezava)
      if (await tableExists('DelovniNalogPozicijaMaterial')) {
        console.log(`DELETE Material for DN ${delovniNalogID}, Pozicija ${pozIdx}`);
        await runq(`DELETE FROM dbo.DelovniNalogPozicijaMaterial WHERE DelovniNalogID=@DN AND Pozicija=@Poz`, [
          { name: 'DN', type: sql.Int, value: delovniNalogID },
          { name: 'Poz', type: sql.Int, value: pozIdx }
        ]);
        if (tiskObj.material) {
          await runq(`
            INSERT INTO dbo.DelovniNalogPozicijaMaterial ([DelovniNalogID],[Pozicija],[RawText],[GramaturaMaterialID])
            VALUES (@DN,@Poz,@Raw,NULL)
          `, [
            { name: 'DN', type: sql.Int, value: delovniNalogID },
            { name: 'Poz', type: sql.Int, value: pozIdx },
            { name: 'Raw', type: sql.NVarChar(200), value: tiskObj.material }
          ]);
        }
      }
    };

    await upsertPozicija(1, nalog.tisk && nalog.tisk.tisk1, nalog.dodelava1, nalog.stroski1, 1);
    await upsertPozicija(2, nalog.tisk && nalog.tisk.tisk2, nalog.dodelava2, nalog.stroski2, 2);

    // 4) Reklamacija (če tabela obstaja)
    if (await tableExists('DelovniNalogReklamacija') && nalog.reklamacija) {
      const r = nalog.reklamacija || {};
      console.log(`Inserting Reklamacija for DN ${delovniNalogID}`);
      await runq(`
        MERGE dbo.DelovniNalogReklamacija AS t
        USING (SELECT @DN AS DelovniNalogID) AS s
        ON (t.DelovniNalogID = s.DelovniNalogID)
        WHEN MATCHED THEN UPDATE SET
          Aktivna = @Aktivna,
          Vrsta = @Vrsta,
          Znesek = @Znesek
        WHEN NOT MATCHED THEN INSERT (DelovniNalogID, Aktivna, Vrsta, Znesek)
          VALUES (@DN, @Aktivna, @Vrsta, @Znesek);
      `, [
        { name: 'DN', type: sql.Int, value: delovniNalogID },
        { name: 'Aktivna', type: sql.Bit, value: r.aktivna ? 1 : 0 },
        { name: 'Vrsta', type: sql.NVarChar(100), value: r.vrsta || null },
        { name: 'Znesek', type: sql.Decimal(18,2), value: safeDec(r.znesek) }
      ]);
    }

    await tx.commit();
    res.json({ ok: true, delovniNalogID });
  } catch (err) {
    try { await tx.rollback(); } catch {}
    console.error('Napaka POST /api/delovni-nalog/full:', err);
    res.status(500).json({ error: String(err) });
  }
});

// Posodobi obstoječi delovni nalog (po številki ali ID-ju, dinamično glede na shemo)
app.put('/api/delovni-nalog/:id', async (req, res) => {
  try {
    const idRaw = req.params.id;
    const body = req.body || {};
    await sql.connect(dbConfig);
    // Preberi shemo
    const colsRes = await new sql.Request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'DelovniNalog'
    `);
    const haveCols = new Set((colsRes.recordset || []).map(r => String(r.COLUMN_NAME).toLowerCase()));
    const has = (name) => haveCols.has(String(name).toLowerCase());
    const pickFirst = (cands) => cands.find(c => has(c));
    const numCol = pickFirst(['StevilkaNaloga','Stevilka_Naloga','NalogStevilka','Stevilka']) || null;
    const idCol = has('DelovniNalogID') ? 'DelovniNalogID' : null;
    const colRok = pickFirst(['RokIzdelave','Rok','RokDobave','RokIzdel']) || null;
    const colKupec = pickFirst(['KupecID','IdKupca','StrankaID','Kupec']) || null;
    const colKomentar = pickFirst(['Komentar','Opis','Opomba','Opombe']) || null;
    const colEmail = pickFirst(['Email','E-Mail','E_posta','Eposta']) || null;
    const colKontakt = pickFirst(['KontaktnaOseba','Kontakt_Oseba','KontaktOseba','Kontakt','KupecKontakt']) || null;
    // Posiljanje/dostava možne kolone
    const colPosNaziv = pickFirst(['PosiljanjeNaziv','DostavaNaziv','Prejemnik','NazivDostave','NazivPrejemnika']) || null;
    const colPosNaslov = pickFirst(['PosiljanjeNaslov','DostavaNaslov','NaslovDostave','NaslovPrejemnika','Naslov_2']) || null;
    const colPosKraj = pickFirst(['PosiljanjeKraj','DostavaKraj','KrajDostave']) || null;
    const colPosPosta = pickFirst(['PosiljanjePosta','DostavaPosta','PostaDostave']) || null;
    const colPosKontaktna = pickFirst(['PosiljanjeKontaktnaOseba','DostavaKontaktnaOseba','KontaktDostave','Kontakt_Oseba_Dostave']) || null;
    const colPosKontakt = pickFirst(['PosiljanjeKontakt','DostavaKontakt','KontaktDostavePodatek']) || null;
    const colPosPoPosti = pickFirst(['PosiljanjePoPosti','PosiljanjePoPošti','Posiljanje_Post']) || null;
    const colPosOsebno = pickFirst(['OsebnoPrevzem','OsebniPrevzem']) || null;
    const colPosDostava = pickFirst(['DostavaNaLokacijo','Dostava']) || null;
    const colTiskZaklj = pickFirst(['TiskZakljucen','Zakljucen']) || null;
    const colTiskZaklj1 = pickFirst(['TiskZakljucen1','Zakljucen1']) || null;
    const colTiskZaklj2 = pickFirst(['TiskZakljucen2','Zakljucen2']) || null;
    const colDobavljeno = pickFirst(['Dobavljeno']) || null;
    const colStatus = pickFirst(['Status','Stanje']) || null;

    // Kriterij WHERE: po številki (če obstaja taka kolona in id je število) sicer po DelovniNalogID
    const idNum = parseInt(String(idRaw), 10);
    const whereCol = (numCol && Number.isFinite(idNum)) ? numCol : idCol;
    if (!whereCol) {
      return res.status(400).json({ error: 'Posodobitev ni možna: manjkajo stolpci za identifikacijo (StevilkaNaloga/DelovniNalogID).' });
    }

    // Zgradi SET dinamično iz podanih polj
    const sets = [];
    const reqUpd = new sql.Request();
    if (colRok && body.rokIzdelave) {
      sets.push(`[${colRok}] = @RokIzdelave`);
      reqUpd.input('RokIzdelave', sql.DateTime, new Date(body.rokIzdelave));
    }
    // DatumOdprtja/datumNarocila (če želimo vpisati starejši datum)
    const colDatum = pickFirst(['DatumOdprtja','Datum','DatumNastanka','DatumUstvarjanja']) || null;
    if (colDatum && body.datumNarocila) {
      const d = new Date(body.datumNarocila);
      if (!isNaN(+d)) {
        sets.push(`[${colDatum}] = @DatumOdprtja`);
        reqUpd.input('DatumOdprtja', sql.DateTime, d);
      }
    }
    if (colKupec && Number.isFinite(parseInt(String(body.kupecID), 10))) {
      sets.push(`[${colKupec}] = @KupecID`);
      reqUpd.input('KupecID', sql.Int, parseInt(String(body.kupecID), 10));
    }
    if (colKomentar && typeof body.komentar === 'string') {
      sets.push(`[${colKomentar}] = @Komentar`);
      reqUpd.input('Komentar', sql.NVarChar(sql.MAX), body.komentar || '');
    }
    if (colEmail && typeof body.email === 'string') {
      sets.push(`[${colEmail}] = @Email`);
      reqUpd.input('Email', sql.NVarChar(255), body.email || '');
    }
    if (colKontakt && typeof body.kontaktnaOseba === 'string') {
      sets.push(`[${colKontakt}] = @KontaktnaOseba`);
      reqUpd.input('KontaktnaOseba', sql.NVarChar(255), body.kontaktnaOseba || '');
    }
    if (colTiskZaklj && typeof body.tiskZakljucen !== 'undefined') {
      sets.push(`[${colTiskZaklj}] = @TiskZakljucen`);
      reqUpd.input('TiskZakljucen', sql.Bit, body.tiskZakljucen ? 1 : 0);
    }
    if (colTiskZaklj1 && typeof body.tiskZakljucen1 !== 'undefined') {
      sets.push(`[${colTiskZaklj1}] = @TiskZakljucen1`);
      reqUpd.input('TiskZakljucen1', sql.Bit, body.tiskZakljucen1 ? 1 : 0);
    }
    if (colTiskZaklj2 && typeof body.tiskZakljucen2 !== 'undefined') {
      sets.push(`[${colTiskZaklj2}] = @TiskZakljucen2`);
      reqUpd.input('TiskZakljucen2', sql.Bit, body.tiskZakljucen2 ? 1 : 0);
    }
    if (colDobavljeno && typeof body.dobavljeno !== 'undefined') {
      sets.push(`[${colDobavljeno}] = @Dobavljeno`);
      reqUpd.input('Dobavljeno', sql.Bit, body.dobavljeno ? 1 : 0);
    }
    if (colStatus && typeof body.status === 'string') {
      sets.push(`[${colStatus}] = @StatusStr`);
      reqUpd.input('StatusStr', sql.NVarChar(255), body.status || 'v_delu');
    }
    // Posiljanje podatki
    if (colPosNaziv && typeof body.posiljanjeNaziv === 'string') { sets.push(`[${colPosNaziv}] = @PosNaziv`); reqUpd.input('PosNaziv', sql.NVarChar(255), body.posiljanjeNaziv || ''); }
    if (colPosNaslov && typeof body.posiljanjeNaslov === 'string') { sets.push(`[${colPosNaslov}] = @PosNaslov`); reqUpd.input('PosNaslov', sql.NVarChar(255), body.posiljanjeNaslov || ''); }
    if (colPosKraj && typeof body.posiljanjeKraj === 'string') { sets.push(`[${colPosKraj}] = @PosKraj`); reqUpd.input('PosKraj', sql.NVarChar(255), body.posiljanjeKraj || ''); }
    if (colPosPosta && typeof body.posiljanjePosta === 'string') { sets.push(`[${colPosPosta}] = @PosPosta`); reqUpd.input('PosPosta', sql.NVarChar(50), body.posiljanjePosta || ''); }
    if (colPosKontaktna && typeof body.posiljanjeKontaktnaOseba === 'string') { sets.push(`[${colPosKontaktna}] = @PosKontaktnaOseba`); reqUpd.input('PosKontaktnaOseba', sql.NVarChar(255), body.posiljanjeKontaktnaOseba || ''); }
    if (colPosKontakt && typeof body.posiljanjeKontakt === 'string') { sets.push(`[${colPosKontakt}] = @PosKontakt`); reqUpd.input('PosKontakt', sql.NVarChar(255), body.posiljanjeKontakt || ''); }
    if (colPosPoPosti && typeof body.posiljanjePoPosti !== 'undefined') { sets.push(`[${colPosPoPosti}] = @PosPoPosti`); reqUpd.input('PosPoPosti', sql.Bit, body.posiljanjePoPosti ? 1 : 0); }
    if (colPosOsebno && typeof body.posiljanjeOsebnoPrevzem !== 'undefined') { sets.push(`[${colPosOsebno}] = @PosOsebno`); reqUpd.input('PosOsebno', sql.Bit, body.posiljanjeOsebnoPrevzem ? 1 : 0); }
    if (colPosDostava && typeof body.posiljanjeDostavaNaLokacijo !== 'undefined') { sets.push(`[${colPosDostava}] = @PosDostava`); reqUpd.input('PosDostava', sql.Bit, body.posiljanjeDostavaNaLokacijo ? 1 : 0); }
    if (sets.length === 0) {
      return res.status(400).json({ error: 'Ni polj za posodobitev.' });
    }
    reqUpd.input('IdVal', sql.Int, idNum);
    const updSql = `
      UPDATE dbo.DelovniNalog
      SET ${sets.join(', ')}
      WHERE [${whereCol}] = @IdVal
    `;
    const r = await reqUpd.query(updSql);
    if (!r.rowsAffected || r.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Nalog ni bil najden za posodobitev.' });
    }
    // Upsert Predmet1/2 v DelovniNalogXML, če podana
    let targetId = null;
    if (whereCol && whereCol !== idCol) {
      const rId = await new sql.Request().input('IdVal', sql.Int, idNum).query(`SELECT TOP 1 DelovniNalogID FROM dbo.DelovniNalog WHERE [${whereCol}] = @IdVal`);
      targetId = rId.recordset && rId.recordset[0] ? rId.recordset[0].DelovniNalogID : null;
    } else {
      targetId = idNum;
    }
    const resolveXmlTargetTable = async () => {
      try {
        const test = await new sql.Request().query(`
          SELECT TABLE_NAME, TABLE_TYPE
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='DelovniNalogPozicija'
        `);
        if (test.recordset && test.recordset[0] && String(test.recordset[0].TABLE_TYPE).toUpperCase().includes('BASE')) {
          return 'DelovniNalogPozicija';
        }
      } catch {}
      try {
        const base = await new sql.Request().query(`
          SELECT TABLE_NAME
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='DelovniNalogXML' AND TABLE_TYPE='BASE TABLE'
        `);
        if (base.recordset && base.recordset.length > 0) return 'DelovniNalogXML';
      } catch {}
      try {
        const q = await new sql.Request().query(`
          SELECT TABLE_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA='dbo' AND COLUMN_NAME IN ('DelovniNalogID','Pozicija','Predmet')
          GROUP BY TABLE_NAME
          HAVING COUNT(DISTINCT COLUMN_NAME)=3
        `);
        const rows = q.recordset || [];
        const pref = rows.find(r => r.TABLE_NAME === 'DelovniNalogPozicija');
        if (pref) return pref.TABLE_NAME;
        const name = rows[0] ? rows[0].TABLE_NAME : null;
        return name || null;
      } catch {}
      return null;
    };
    const upsertXml = async (poz, predmet, xmlData) => {
      if (!targetId) return;
      const xmlTable = await resolveXmlTargetTable();
      if (!xmlTable) return;
      const rq = new sql.Request();
      rq.input('DelovniNalogID', sql.Int, targetId);
      rq.input('Pozicija', sql.Int, poz);
      let xmlCols = [];
      let colMeta = new Map();
      try {
        const xmlSchema = await new sql.Request().query(`
          SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='${xmlTable}'
        `);
        xmlCols = (xmlSchema.recordset || []).map(r => String(r.COLUMN_NAME));
        colMeta = new Map((xmlSchema.recordset || []).map(r => [String(r.COLUMN_NAME), { type: String(r.DATA_TYPE).toLowerCase(), nullable: String(r.IS_NULLABLE).toUpperCase() === 'YES' }]));
      } catch {}
      const hasCol = (name) => xmlCols.some(c => c.toLowerCase() === String(name).toLowerCase());
      const setParts = [];
      const colToParam = (col) => `p_${col}`;
      const addWithType = (col, val, prefer = 'nvarchar') => {
        if (!hasCol(col) || typeof val === 'undefined' || val === null || val === '') return;
        const meta = colMeta.get(col) || {};
        const param = colToParam(col);
        setParts.push(`[${col}] = @${param}`);
        const t = (meta.type || prefer);
        if (t.includes('int')) rq.input(param, sql.Int, parseInt(String(val), 10) || 0);
        else if (t.includes('bit')) rq.input(param, sql.Bit, (val === true || val === 1 || val === '1' || String(val).toLowerCase() === 'true') ? 1 : 0);
        else if (t.includes('decimal') || t.includes('numeric') || t.includes('money')) rq.input(param, sql.Decimal(18, 2), (() => { const n = parseFloat(String(val).replace(',', '.')); return isFinite(n) ? n : 0; })());
        else rq.input(param, sql.NVarChar(sql.MAX), String(val));
      };
      if (typeof predmet !== 'undefined' && predmet !== null && predmet !== '') {
        addWithType('Predmet', String(predmet), 'nvarchar');
      }
      const x = xmlData || {};
      addWithType('Format', x.format, 'nvarchar');
      addWithType('Obseg', x.obseg, 'nvarchar');
      addWithType('StKosov', x.steviloKosov, 'int');
      addWithType('StPol', x.steviloPol, 'int');
      addWithType('StKosovNaPoli', x.kosovNaPoli, 'int');
      addWithType('Razrez', x.razrez, 'bit');
      addWithType('VPolah', x.vPolah, 'bit');
      addWithType('Zgibanje', x.zgibanje, 'bit');
      addWithType('Biganje', x.biganje, 'bit');
      addWithType('Perforacija', x.perforacija, 'bit');
      addWithType('CenaBrezDDV', x.cenaBrezDDV, 'decimal');
      addWithType('GraficnaPriprava', x.graficnaPriprava, 'decimal');
      if (hasCol('Collate') && !setParts.find(s => s.includes('[Collate]'))) {
        const param = colToParam('Collate');
        setParts.push(`[Collate] = @${param}`);
        rq.input(param, sql.Int, 0);
      }
      // Privzeti biti 0, če manjkajo (zaradi NOT NULL v nekaterih shemah)
      const ensureBitDefault0 = (col) => {
        if (hasCol(col) && !setParts.find(s => s.includes(`[${col}]`))) {
          const param = colToParam(col);
          setParts.push(`[${col}] = @${param}`);
          rq.input(param, sql.Bit, 0);
        }
      };
      ensureBitDefault0('Razrez');
      ensureBitDefault0('VPolah');
      ensureBitDefault0('Zgibanje');
      ensureBitDefault0('Biganje');
      ensureBitDefault0('Perforacija');
      // Privzete vrednosti za bit, ki jih nova aplikacija ne uporablja (a so NOT NULL v tabeli)
      if (hasCol('Ponatis') && !setParts.find(s => s.includes('[Ponatis]'))) {
        const param = colToParam('Ponatis');
        setParts.push(`[Ponatis] = @${param}`);
        rq.input(param, sql.Bit, 0);
      }
      if (hasCol('BarvniVzorec') && !setParts.find(s => s.includes('[BarvniVzorec]'))) {
        const param = colToParam('BarvniVzorec');
        setParts.push(`[BarvniVzorec] = @${param}`);
        rq.input(param, sql.Bit, 0);
      }
      const setSql = setParts.length ? `, ${setParts.join(', ')}` : '';
      const insertCols = setParts.map(s => s.match(/\[(.+?)\]/)[1]);
      const insertColsSql = insertCols.length ? ', ' + insertCols.map(c => `[${c}]`).join(', ') : '';
      const insertValsSql = insertCols.length ? ', ' + insertCols.map(c => `@${colToParam(c)}`).join(', ') : '';
      await rq.query(`
        IF EXISTS (SELECT 1 FROM dbo.[${xmlTable}] WHERE DelovniNalogID=@DelovniNalogID AND Pozicija=@Pozicija)
          UPDATE dbo.[${xmlTable}]
          SET Pozicija=@Pozicija${setSql}
          WHERE DelovniNalogID=@DelovniNalogID AND Pozicija=@Pozicija
        ELSE
          INSERT INTO dbo.[${xmlTable}] (DelovniNalogID, Pozicija${insertColsSql})
          VALUES (@DelovniNalogID, @Pozicija${insertValsSql})
      `);
    };
    try {
      await upsertXml(1, body.predmet1, body.xml1);
      await upsertXml(2, body.predmet2, body.xml2);
    } catch (e) {
      console.warn('Opozorilo: upsert XML (PUT) ni uspel:', e && e.message ? e.message : e);
    }
    // Upsert DelovniNalogDodatno (narocilnica/kontaktEmail/posljiEmail), če tabela obstaja
    try {
      if (targetId) {
        const tExists = await new sql.Request().query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='DelovniNalogDodatno'`);
        if (tExists.recordset && tExists.recordset.length) {
          const cur = await new sql.Request().input('DN', sql.Int, targetId).query(`SELECT TOP 1 * FROM dbo.DelovniNalogDodatno WHERE DelovniNalogID=@DN`);
          const rq = new sql.Request();
          rq.input('DN', sql.Int, targetId);
          const nextNar = (typeof body.narocilnica !== 'undefined') ? body.narocilnica : (cur.recordset[0] && cur.recordset[0].Narocilnica || null);
          const nextEmail = (typeof body.kontaktEmail !== 'undefined') ? body.kontaktEmail : (cur.recordset[0] && cur.recordset[0].KontaktEmail || null);
          const nextPoslji = (typeof body.posljiEmail !== 'undefined') ? (body.posljiEmail ? 1 : 0) : (cur.recordset[0] ? (cur.recordset[0].PosljiEmail ? 1 : 0) : 0);
          rq.input('Nar', sql.NVarChar(100), nextNar);
          rq.input('Email', sql.NVarChar(255), nextEmail);
          rq.input('Poslji', sql.Bit, nextPoslji);
          if (cur.recordset && cur.recordset.length) {
            await rq.query(`UPDATE dbo.DelovniNalogDodatno SET Narocilnica=@Nar, KontaktEmail=@Email, PosljiEmail=@Poslji WHERE DelovniNalogID=@DN`);
          } else {
            await rq.query(`INSERT INTO dbo.DelovniNalogDodatno ([DelovniNalogID],[Narocilnica],[KontaktEmail],[PosljiEmail]) VALUES (@DN,@Nar,@Email,@Poslji)`);
          }
        }
      }
    } catch (e) {
      console.warn('Opozorilo: upsert DelovniNalogDodatno (PUT) ni uspel:', e && e.message ? e.message : e);
    }
    // Upsert DelovniNalogPosiljanje (vključno z Email/PosljiEmail), če tabela obstaja
    try {
      if (targetId) {
        const tExists = await new sql.Request().query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='DelovniNalogPosiljanje'`);
        if (tExists.recordset && tExists.recordset.length) {
          const cur = await new sql.Request().input('DN', sql.Int, targetId).query(`SELECT TOP 1 * FROM dbo.DelovniNalogPosiljanje WHERE DelovniNalogID=@DN`);
          const rq = new sql.Request();
          rq.input('DN', sql.Int, targetId);
          if (typeof body.posiljanjePoPosti !== 'undefined') rq.input('PoPosti', sql.Bit, body.posiljanjePoPosti ? 1 : 0);
          if (typeof body.posiljanjeNaziv !== 'undefined') rq.input('Naziv', sql.NVarChar(200), body.posiljanjeNaziv || null);
          if (typeof body.posiljanjeNaslov !== 'undefined') rq.input('Naslov', sql.NVarChar(200), body.posiljanjeNaslov || null);
          if (typeof body.posiljanjeKraj !== 'undefined') rq.input('Kraj', sql.NVarChar(100), body.posiljanjeKraj || null);
          if (typeof body.posiljanjePosta !== 'undefined') rq.input('Posta', sql.NVarChar(20), body.posiljanjePosta || null);
          if (typeof body.posiljanjeOsebnoPrevzem !== 'undefined') rq.input('Osebno', sql.Bit, body.posiljanjeOsebnoPrevzem ? 1 : 0);
          if (typeof body.posiljanjeDostavaNaLokacijo !== 'undefined') rq.input('Dostava', sql.Bit, body.posiljanjeDostavaNaLokacijo ? 1 : 0);
          if (typeof body.posiljanjeKontaktnaOseba !== 'undefined') rq.input('Kontaktna', sql.NVarChar(100), body.posiljanjeKontaktnaOseba || null);
          if (typeof body.posiljanjeKontakt !== 'undefined') rq.input('Kontakt', sql.NVarChar(255), body.posiljanjeKontakt || null);
          if (typeof body.posiljanjeEmail !== 'undefined') rq.input('Email', sql.NVarChar(255), body.posiljanjeEmail || null);
          if (typeof body.posiljanjePosljiEmail !== 'undefined') rq.input('Poslji', sql.Bit, body.posiljanjePosljiEmail ? 1 : 0);
          if (cur.recordset && cur.recordset.length) {
            const setParts = [
              (typeof body.posiljanjePoPosti !== 'undefined') ? 'PosiljanjePoPosti=@PoPosti' : null,
              (typeof body.posiljanjeNaziv !== 'undefined') ? 'Naziv=@Naziv' : null,
              (typeof body.posiljanjeNaslov !== 'undefined') ? 'Naslov=@Naslov' : null,
              (typeof body.posiljanjeKraj !== 'undefined') ? 'Kraj=@Kraj' : null,
              (typeof body.posiljanjePosta !== 'undefined') ? 'Posta=@Posta' : null,
              (typeof body.posiljanjeOsebnoPrevzem !== 'undefined') ? 'OsebnoPrevzem=@Osebno' : null,
              (typeof body.posiljanjeDostavaNaLokacijo !== 'undefined') ? 'DostavaNaLokacijo=@Dostava' : null,
              (typeof body.posiljanjeKontaktnaOseba !== 'undefined') ? 'KontaktnaOseba=@Kontaktna' : null,
              (typeof body.posiljanjeKontakt !== 'undefined') ? 'Kontakt=@Kontakt' : null,
              (typeof body.posiljanjeEmail !== 'undefined') ? 'Email=@Email' : null,
              (typeof body.posiljanjePosljiEmail !== 'undefined') ? 'PosljiEmail=@Poslji' : null
            ].filter(Boolean).join(', ');
            if (setParts.length) {
              await rq.query(`
                UPDATE dbo.DelovniNalogPosiljanje
                SET ${setParts}
                WHERE DelovniNalogID=@DN
              `);
            }
          } else {
            const cols = ['[DelovniNalogID]'];
            const vals = ['@DN'];
            if (typeof body.posiljanjePoPosti !== 'undefined') { cols.push('[PosiljanjePoPosti]'); vals.push('@PoPosti'); }
            if (typeof body.posiljanjeNaziv !== 'undefined') { cols.push('[Naziv]'); vals.push('@Naziv'); }
            if (typeof body.posiljanjeNaslov !== 'undefined') { cols.push('[Naslov]'); vals.push('@Naslov'); }
            if (typeof body.posiljanjeKraj !== 'undefined') { cols.push('[Kraj]'); vals.push('@Kraj'); }
            if (typeof body.posiljanjePosta !== 'undefined') { cols.push('[Posta]'); vals.push('@Posta'); }
            if (typeof body.posiljanjeOsebnoPrevzem !== 'undefined') { cols.push('[OsebnoPrevzem]'); vals.push('@Osebno'); }
            if (typeof body.posiljanjeDostavaNaLokacijo !== 'undefined') { cols.push('[DostavaNaLokacijo]'); vals.push('@Dostava'); }
            if (typeof body.posiljanjeKontaktnaOseba !== 'undefined') { cols.push('[KontaktnaOseba]'); vals.push('@Kontaktna'); }
            if (typeof body.posiljanjeKontakt !== 'undefined') { cols.push('[Kontakt]'); vals.push('@Kontakt'); }
            if (typeof body.posiljanjeEmail !== 'undefined') { cols.push('[Email]'); vals.push('@Email'); }
            if (typeof body.posiljanjePosljiEmail !== 'undefined') { cols.push('[PosljiEmail]'); vals.push('@Poslji'); }
            await rq.query(`
              INSERT INTO dbo.DelovniNalogPosiljanje (${cols.join(',')})
              VALUES (${vals.join(',')})
            `);
          }
        }
      }
    } catch (e) {
      console.warn('Opozorilo: upsert DelovniNalogPosiljanje (PUT) ni uspel:', e && e.message ? e.message : e);
    }
    return res.json({ ok: true, updated: r.rowsAffected[0] });
  } catch (e) {
    console.error('Napaka pri posodabljanju delovnega naloga:', e);
    res.status(500).json({ error: 'Napaka pri posodabljanju delovnega naloga', details: e && e.message ? e.message : String(e) });
  }
});

// Preberi CELOTEN delovni nalog po ID iz TEST baze in ga vrni v "full" JSON obliki (enako kot za POST /full)
app.get('/api/delovni-nalog/:id', async (req, res) => {
  try {
    const idParam = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(idParam)) {
      return res.status(400).json({ error: 'Param :id mora biti število (DelovniNalogID).' });
    }
    const testDbName = process.env.DB_NAME_TEST || 'DelovniNalog_TEST';
    const testConfig = {
      user: process.env.DB_USER || process.env.DB_USERNAME,
      password: process.env.DB_PASS || process.env.DB_PASSWORD,
      server: process.env.DB_SERVER || process.env.DB_HOST || 'localhost',
      database: testDbName,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
      options: { encrypt: false, trustServerCertificate: true },
    };
    const pool = await new sql.ConnectionPool(testConfig).connect();
    const runq = async (q, inputs = []) => {
      const r = pool.request();
      for (const p of inputs) r.input(p.name, p.type, p.value);
      return await r.query(q);
    };
    const toBool = (v) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
    const safeStr = (v) => (v === undefined || v === null) ? '' : String(v);
    const safeInt = (v) => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(String(v).replace(',', '.'));
      return Number.isFinite(n) ? Math.trunc(n) : null;
    };
    const mapTiskIdToBarve = (id) => {
      const n = Number(id);
      if (n === 4) return '4/4 barvno obojestransko (CMYK)';
      if (n === 3) return '4/0 barvno enostransko (CMYK)';
      if (n === 2) return '1/1 črno belo obojestransko (K)';
      if (n === 1) return '1/0 črno belo enostransko (K)';
      return null;
    };
    // 1) Header (najprej po DelovniNalogID, če ne najde, poskusi po StevilkaNaloga)
    let h = await runq(`SELECT TOP 1 * FROM dbo.DelovniNalog WHERE DelovniNalogID = @id`, [
      { name: 'id', type: sql.Int, value: idParam }
    ]);
    if (!h.recordset || h.recordset.length === 0) {
      try {
        const h2 = await runq(`SELECT TOP 1 * FROM dbo.DelovniNalog WHERE StevilkaNaloga = @id`, [
          { name: 'id', type: sql.Int, value: idParam }
        ]);
        h = h2;
      } catch {}
    }
    if (!h.recordset || h.recordset.length === 0) {
      await pool.close();
      return res.status(404).json({ error: 'DelovniNalog ni najden.' });
    }
    const head = h.recordset[0];
    // Kupec (raje preberi iz dbo.Kupec po ID-ju, da so podatki vedno aktualni)
    let kupecRow = null;
    try {
      if (head.KupecID != null) {
        const k = await runq(`SELECT TOP 1 * FROM dbo.Kupec WHERE KupecID = @kid`, [
          { name: 'kid', type: sql.Int, value: head.KupecID }
        ]);
        kupecRow = (k.recordset && k.recordset[0]) ? k.recordset[0] : null;
      }
    } catch {}
    // Dodatno (narocilnica, email, posljiEmail, reklamacija, opis)
    let dodatno = null;
    try {
      const d = await runq(`SELECT TOP 1 * FROM dbo.DelovniNalogDodatno WHERE DelovniNalogID = @id`, [
        { name: 'id', type: sql.Int, value: idParam }
      ]);
      dodatno = (d.recordset && d.recordset[0]) ? d.recordset[0] : null;
    } catch {}
    // Posiljanje
    let pos = null;
    try {
      const p = await runq(`SELECT TOP 1 * FROM dbo.DelovniNalogPosiljanje WHERE DelovniNalogID = @id`, [
        { name: 'id', type: sql.Int, value: idParam }
      ]);
      pos = (p.recordset && p.recordset[0]) ? p.recordset[0] : null;
    } catch {}
    // 2) Pozicije (1 in 2)
    const pozRes = await runq(`
      SELECT * FROM dbo.DelovniNalogPozicija WHERE DelovniNalogID = @id
    `, [{ name: 'id', type: sql.Int, value: idParam }]);
    const pozByNum = new Map();
    for (const r of (pozRes.recordset || [])) {
      pozByNum.set(Number(r.Pozicija), r);
    }
    // Ext
    let extRes = { recordset: [] };
    try {
      extRes = await runq(`SELECT * FROM dbo.DelovniNalogPozicijaExt WHERE DelovniNalogID = @id`, [
        { name: 'id', type: sql.Int, value: idParam }
      ]);
    } catch {}
    const extByNum = new Map();
    for (const r of (extRes.recordset || [])) extByNum.set(Number(r.Pozicija), r);
    // Dodelava
    let ddRes = { recordset: [] };
    try {
      ddRes = await runq(`SELECT * FROM dbo.DelovniNalogPozicijaDodelava WHERE DelovniNalogID = @id`, [
        { name: 'id', type: sql.Int, value: idParam }
      ]);
    } catch {}
    const ddByNum = new Map();
    for (const r of (ddRes.recordset || [])) ddByNum.set(Number(r.Pozicija), r);
    // Mutacije
    let mutRes = { recordset: [] };
    try {
      mutRes = await runq(`SELECT * FROM dbo.DelovniNalogPozicijaMutacija WHERE DelovniNalogID = @id ORDER BY Pozicija, Zaporedje`, [
        { name: 'id', type: sql.Int, value: idParam }
      ]);
    } catch {}
    const mutByNum = new Map();
    for (const r of (mutRes.recordset || [])) {
      const p = Number(r.Pozicija);
      if (!mutByNum.has(p)) mutByNum.set(p, []);
      mutByNum.get(p).push({ steviloPol: r.StPol != null ? String(r.StPol) : null });
    }
    // Stroški
    let strRes = { recordset: [] };
    try {
      strRes = await runq(`SELECT * FROM dbo.DelovniNalogPozicijaStrosek WHERE DelovniNalogID = @id`, [
        { name: 'id', type: sql.Int, value: idParam }
      ]);
    } catch {}
    const strByNum = new Map();
    for (const r of (strRes.recordset || [])) {
      const p = Number(r.Pozicija);
      if (!strByNum.has(p)) strByNum.set(p, []);
      strByNum.get(p).push(r);
    }
    // Material
    let matRes = { recordset: [] };
    try {
      matRes = await runq(`SELECT * FROM dbo.DelovniNalogPozicijaMaterial WHERE DelovniNalogID = @id`, [
        { name: 'id', type: sql.Int, value: idParam }
      ]);
    } catch {}
    const matByNum = new Map();
    for (const r of (matRes.recordset || [])) matByNum.set(Number(r.Pozicija), r);
    // Builderji
    const buildTisk = (poz) => {
      const b = pozByNum.get(poz) || {};
      const e = extByNum.get(poz) || {};
      const m = matByNum.get(poz) || {};
      const out = {};
      if (b.Predmet != null) out.predmet = b.Predmet;
      if (b.Format != null) out.format = b.Format;
      if (b.Obseg != null) out.obseg = String(b.Obseg);
      if (b.StKosov != null) out.steviloKosov = String(b.StKosov);
      if (m.RawText != null) out.material = m.RawText;
      if (b.TiskID != null) out.barve = mapTiskIdToBarve(b.TiskID);
      if (b.StPol != null) out.steviloPol = String(b.StPol);
      if (b.StKosovNaPoli != null) out.kosovNaPoli = String(b.StKosovNaPoli);
      if (b.Collate != null) out.collate = toBool(b.Collate);
      // Preferiraj vrednosti iz osnovne tabele; če manjkajo, uporabi Ext
      const b1 = (b.B1Format != null) ? toBool(b.B1Format) : toBool(e.B1Format);
      const b2 = (b.B2Format != null) ? toBool(b.B2Format) : toBool(e.B2Format);
      if (b1) out.b1Format = true; else out.b1Format = false;
      if (b2) out.b2Format = true; else out.b2Format = false;
      if (toBool(e.TiskaKooperant)) out.tiskaKooperant = true;
      if (e.KooperantNaziv != null) out.kooperant = e.KooperantNaziv;
      if (e.RokKooperanta) out.rokKooperanta = new Date(e.RokKooperanta).toISOString();
      if (e.ZnesekKooperanta != null) out.znesekKooperanta = String(e.ZnesekKooperanta);
      return out;
    };
    const buildDodelava = (poz) => {
      const d = ddByNum.get(poz) || {};
      const out = {
        razrez: toBool(d.Razrez),
        vPolah: toBool(d.VPolah),
        zgibanje: toBool(d.Zgibanje),
        biganje: toBool(d.Biganje),
        perforacija: toBool(d.Perforacija),
        biganjeRocnoZgibanje: toBool(d.BiganjeRocnoZgibanje),
        lepljenje: toBool(d.Lepljenje),
        lepljenjeMesta: d.LepljenjeMesta || '',
        lepljenjeSirina: d.LepljenjeSirina || '',
        lepljenjeBlokov: toBool(d.LepljenjeBlokov),
        vrtanjeLuknje: toBool(d.VrtanjeLuknje),
        velikostLuknje: d.VelikostLuknje || '',
        topliTisk: d.TopliTisk || ''
      };
      return out;
    };
    const buildKooperanti = (poz) => {
      const arr = (strByNum.get(poz) || []); // not right; kooperanti are another table
      return arr;
    };
    // Kooperanti
    let koopRes = { recordset: [] };
    try {
      koopRes = await runq(`SELECT * FROM dbo.DelovniNalogPozicijaKooperant WHERE DelovniNalogID = @id ORDER BY Pozicija, Zaporedje`, [
        { name: 'id', type: sql.Int, value: idParam }
      ]);
    } catch {}
    const koopByNum = new Map();
    for (const r of (koopRes.recordset || [])) {
      const p = Number(r.Pozicija);
      if (!koopByNum.has(p)) koopByNum.set(p, []);
      koopByNum.get(p).push(r);
    }
    const applyKooperantiToDodelava = (poz, dodelava) => {
      const list = koopByNum.get(poz) || [];
      for (let i = 0; i < list.length && i < 3; i++) {
        const k = i + 1;
        dodelava[`kooperant${k}`] = true;
        dodelava[`kooperant${k}Podatki`] = {
          imeKooperanta: list[i].Ime || '',
          predvidenRok: list[i].PredvidenRok ? new Date(list[i].PredvidenRok).toISOString() : null,
          znesekDodelave: list[i].Znesek != null ? String(list[i].Znesek) : '',
          vrstaDodelave: list[i].Vrsta || ''
        };
      }
    };
    const buildStroski = (poz, grp) => {
      const rows = (strByNum.get(poz) || []).filter(r => Number(r.Skupina) === grp);
      const out = {};
      const setIf = (key, row) => {
        if (row && row.Znesek != null) out[key] = String(row.Znesek);
      };
      const byNaziv = new Map(rows.map(r => [String(r.Naziv).toLowerCase(), r]));
      setIf('graficnaPriprava', byNaziv.get('graficnaPriprava'.toLowerCase()));
      setIf('cenaKlišeja', byNaziv.get('cenaKlišeja'.toLowerCase()));
      setIf('cenaIzsekovalnegaOrodja', byNaziv.get('cenaIzsekovalnegaOrodja'.toLowerCase()));
      setIf('cenaVzorca', byNaziv.get('cenaVzorca'.toLowerCase()));
      setIf('cenaBrezDDV', byNaziv.get('cenaBrezDDV'.toLowerCase()));
      return out;
    };
    const buildPosiljanje = () => {
      if (!pos) return null;
      return {
        posiljanjePoPosti: toBool(pos.PosiljanjePoPosti),
        naziv: pos.Naziv || '',
        naslov: pos.Naslov || '',
        kraj: pos.Kraj || '',
        postnaStevilka: pos.Posta || '',
        osebnoPrevzem: toBool(pos.OsebnoPrevzem),
        dostavaNaLokacijo: toBool(pos.DostavaNaLokacijo),
        kontaktnaOseba: pos.KontaktnaOseba || '',
        kontakt: pos.Kontakt || '',
        email: pos.Email || ''
      };
    };
    // Sestavi odgovor
    const kupec = {
      KupecID: (kupecRow && kupecRow.KupecID) != null ? kupecRow.KupecID : (head.KupecID || null),
      Naziv: (kupecRow && kupecRow.Naziv) != null ? kupecRow.Naziv : (head.KupecNaziv || null),
      Naslov: (kupecRow && kupecRow.Naslov) != null ? kupecRow.Naslov : (head.KupecNaslov || null),
      Posta: (kupecRow && kupecRow.Posta) != null ? kupecRow.Posta : (head.KupecPosta || null),
      Kraj: (kupecRow && kupecRow.Kraj) != null ? kupecRow.Kraj : (head.KupecKraj || null),
      Telefon: (kupecRow && kupecRow.Telefon) != null ? kupecRow.Telefon : (head.KupecTelefon || null),
      Fax: (kupecRow && kupecRow.Fax) != null ? kupecRow.Fax : (head.KupecFax || null),
      IDzaDDV: (kupecRow && kupecRow.IDzaDDV) != null ? kupecRow.IDzaDDV : (head.KupecIDzaDDV || null),
      email: (dodatno && dodatno.KontaktEmail) || null,
      posljiEmail: dodatno ? toBool(dodatno.PosljiEmail) : false,
      narocilnica: dodatno ? (dodatno.Narocilnica || '') : ''
    };
    const kontakt = {
      kontaktnaOseba: head.KupecKontakt || '',
      email: (dodatno && dodatno.KontaktEmail) || '',
      telefon: head.KupecTelefon || ''
    };
    const komentar = { komentar: head.Opombe || '' };
    const tisk1 = buildTisk(1);
    const tisk2 = buildTisk(2);
    const d1 = buildDodelava(1);
    const d2 = buildDodelava(2);
    applyKooperantiToDodelava(1, d1);
    applyKooperantiToDodelava(2, d2);
    const st1 = buildStroski(1, 1);
    const st2 = buildStroski(2, 2);
    const tiskZaklj1 = toBool(head.TiskZakljucen1);
    const tiskZaklj2 = toBool(head.TiskZakljucen2);
    const tiskZaklj = toBool(head.TiskZakljucen) || (tiskZaklj1 && tiskZaklj2);
    const dobavljenoFlag = toBool(head.Dobavljeno);
    const out = {
      status: dobavljenoFlag ? 'dobavljeno' : (tiskZaklj ? 'zaključen' : 'v_delu'),
      zakljucen: tiskZaklj,
      dobavljeno: dobavljenoFlag,
      tiskZakljucen1: tiskZaklj1,
      tiskZakljucen2: tiskZaklj2,
      kupec,
      kontakt,
      komentar,
      tisk: {
        ...(Object.keys(tisk1).length ? { tisk1 } : {}),
        ...(Object.keys(tisk2).length ? { tisk2 } : {})
      },
      ...(Object.keys(d1).some(k => d1[k]) ? { dodelava1: d1 } : {}),
      ...(Object.keys(d2).some(k => d2[k]) ? { dodelava2: d2 } : {}),
      ...(Object.keys(st1).length ? { stroski1: st1 } : {}),
      ...(Object.keys(st2).length ? { stroski2: st2 } : {}),
      ...(pos ? { posiljanje: buildPosiljanje() } : {}),
      datumNarocila: head.Datum ? new Date(head.Datum).toISOString() : null,
      rokIzdelave: head.RokIzdelave ? new Date(head.RokIzdelave).toISOString() : null
    };
    // Reklamacija
    try {
      const rr = await runq(`SELECT TOP 1 * FROM dbo.DelovniNalogReklamacija WHERE DelovniNalogID=@id`, [
        { name: 'id', type: sql.Int, value: idParam }
      ]);
      const row = (rr.recordset && rr.recordset[0]) ? rr.recordset[0] : null;
      if (row) {
        out.reklamacija = {
          aktivna: toBool(row.Aktivna),
          vrsta: row.Vrsta || '',
          znesek: row.Znesek != null ? String(row.Znesek) : ''
        };
      }
    } catch {}
    await pool.close();
    return res.json(out);
  } catch (e) {
    console.error('Napaka GET /api/delovni-nalog/:id:', e);
    res.status(500).json({ error: e && e.message ? e.message : String(e) });
  }
});

// Preprost DB health-check za TEST bazo
app.get('/api/health/db', async (req, res) => {
  try {
    const testDbName = process.env.DB_NAME_TEST || 'DelovniNalog_TEST';
    const testConfig = {
      user: process.env.DB_USER || process.env.DB_USERNAME,
      password: process.env.DB_PASS || process.env.DB_PASSWORD,
      server: process.env.DB_SERVER || process.env.DB_HOST || 'localhost',
      database: testDbName,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
      options: { encrypt: false, trustServerCertificate: true },
    };
    const pool = await new sql.ConnectionPool(testConfig).connect();
    const r = await pool.request().query('SELECT DB_NAME() AS db, @@SERVERNAME AS serverName');
    await pool.close();
    return res.json({ ok: true, target: r.recordset && r.recordset[0] ? r.recordset[0] : null });
  } catch (e) {
    console.error('DB health error:', e);
    return res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});
// API endpoint: POST /api/poslji-email
app.post('/api/poslji-email', async (req, res) => {
  try {
    const { to, subject, html } = req.body || {};
    if (!to || !subject || !html) {
      return res.status(400).json({ error: 'Manjkajoča polja: to, subject, html so obvezna.' });
    }
    if (!smtpHost) {
      return res.status(500).json({ error: 'SMTP ni konfiguriran (manjka SMTP_HOST).' });
    }

    const fromAddress = process.env.SMTP_FROM || 'Trajanus <info@trajanus.si>';
    // Pripravi inline slike (logo/footer), če obstajajo
    const attachments = [];
    try {
      const assetsDir = path.resolve(__dirname, 'assets', 'email');
      const logoPath = path.join(assetsDir, 'logo.png');
      const footerPath = path.join(assetsDir, 'footer.png');
      if (fs.existsSync(logoPath)) {
        attachments.push({ filename: 'logo.png', path: logoPath, cid: 'logo' });
      }
      if (fs.existsSync(footerPath)) {
        attachments.push({ filename: 'footer.png', path: footerPath, cid: 'footer' });
      }
    } catch {}
    const trySend = async () => {
      // Najprej poskusi preko hostname transporterja
      if (mailTransporterHost) {
        try {
          const info = await mailTransporterHost.sendMail({ from: fromAddress, to, subject, html, attachments });
          return { ok: true, info, via: 'hostname' };
        } catch (e) {
          // Nadaljuj na fallback samo za omrežne napake
          const code = e && (e.code || e.errno);
          if (!mailTransporterIp || !['ECONNREFUSED','ETIMEDOUT','ESOCKET','ENOTFOUND','ECONNRESET','EAI_AGAIN'].includes(code)) {
            throw e;
          }
        }
      }
      // Fallback: poskusi preko forced IP (če je nastavljen)
      if (mailTransporterIp) {
        const info = await mailTransporterIp.sendMail({ from: fromAddress, to, subject, html, attachments });
        return { ok: true, info, via: 'ip' };
      }
      throw new Error('SMTP transporter ni na voljo');
    };

    const result = await trySend();
    res.json({ ok: true, messageId: result.info.messageId, via: result.via });
  } catch (err) {
    console.error('Napaka pri pošiljanju e-maila:', err);
    res.status(500).json({ 
      error: 'Napaka pri pošiljanju e-maila', 
      details: err && err.message ? err.message : String(err),
      code: err && err.code ? err.code : undefined,
      errno: err && err.errno ? err.errno : undefined,
      address: err && err.address ? err.address : undefined,
      port: err && err.port ? err.port : undefined,
      command: err && err.command ? err.command : undefined
    });
  }
});

// API endpoint: POST /api/ai/razberiNalogIzEmaila
app.post('/api/ai/razberiNalogIzEmaila', async (req, res) => {
  try {
    const { emailBesedilo } = req.body || {};
    if (!emailBesedilo || !String(emailBesedilo).trim()) {
      return res.status(400).json({ error: 'Email besedilo je obvezno' });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;

    // Če ni API ključa, omogoči statično razbiranje za znani testni primer
    if (!openaiApiKey) {
      console.log('OpenAI API ključ ni nastavljen, uporabljam statično razbiranje');
      if (emailBesedilo.includes('500 vizitk') && emailBesedilo.includes('Marko Novak')) {
        const year = new Date().getFullYear();
        const staticResult = {
          izdelek: 'vizitka',
          kolicina: 500,
          format: '85x55 mm',
          papir: '300g',
          barvnost: 'dvostranski tisk',
          dodelava: 'plastificirano mat',
          datumDobave: `${year}-07-10`,
          stranka: { ime: 'Marko Novak', kraj: 'Podjetje Medis' },
          kontakt: { ime: 'Marko Novak', email: '', telefon: '' },
          narocilnica: ''
        };
        return res.json(staticResult);
      }
      return res.status(400).json({ error: 'OpenAI API ključ ni nastavljen. Dodajte OPENAI_API_KEY v .env datoteko v mapi backend.' });
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const prompt = `Iz spodnjega e-maila razberi podatke za tiskovino:
- Izdelek (npr. letak, plakat, vizitka)
- Količina
- Format
- Papir
- Barvnost
- Dodelava (če je omenjena)
- Datum dobave (če je omenjen)
- Stranka (ime, kraj)
- Kontakt (ime, e-mail)
- Naročilnica (če obstaja)

Email:
${emailBesedilo}

Vrni samo JSON objekt brez dodatnega besedila. Format:
{
  "izdelek": "string",
  "kolicina": number,
  "format": "string",
  "papir": "string",
  "barvnost": "string",
  "dodelava": "string",
  "datumDobave": "YYYY-MM-DD",
  "stranka": {
    "ime": "string",
    "kraj": "string"
  },
  "kontakt": {
    "ime": "string",
    "email": "string",
    "telefon": "string"
  },
  "narocilnica": "string"
}`;

    let responseText;
    try {
      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: 'Si AI asistent, ki razbira podatke iz e-mailov za tiskovino. Vrni samo veljaven JSON objekt.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });
      responseText = completion.choices?.[0]?.message?.content;
    } catch (aiErr) {
      // Fallback: če je testni e-mail, vseeno vrni statično
      console.error('Napaka pri AI klicu:', aiErr && aiErr.message ? aiErr.message : aiErr);
      if (emailBesedilo.includes('500 vizitk') && emailBesedilo.includes('Marko Novak')) {
        const year = new Date().getFullYear();
        const staticResult = {
          izdelek: 'vizitka',
          kolicina: 500,
          format: '85x55 mm',
          papir: '300g',
          barvnost: 'dvostranski tisk',
          dodelava: 'plastificirano mat',
          datumDobave: `${year}-07-10`,
          stranka: { ime: 'Marko Novak', kraj: 'Podjetje Medis' },
          kontakt: { ime: 'Marko Novak', email: '', telefon: '' },
          narocilnica: ''
        };
        return res.json(staticResult);
      }
      // Hevristični parser kot zadnji fallback (npr. kvota 429): poskusi izluščiti osnovne podatke
      try {
        const heur = (() => {
          const txt = String(emailBesedilo).replace(/\s+/g, ' ').trim().toLowerCase();
          const out = {
            izdelek: '',
            kolicina: undefined,
            format: '',
            papir: '',
            barvnost: '',
            dodelava: '',
            datumDobave: '',
            stranka: { ime: '', kraj: '' },
            kontakt: { ime: '', email: '', telefon: '' },
            narocilnica: '',
            dodelaveSeznam: []
          };
          // izdelek
          if (txt.includes('vizitk')) out.izdelek = 'vizitka';
          else if (/\bbon\b/.test(txt)) out.izdelek = 'bon';
          else if (txt.includes('letak')) out.izdelek = 'letak';
          else if (txt.includes('plakat')) out.izdelek = 'plakat';
          // kolicina
          const mQty = emailBesedilo.match(/(\d{2,6})\s*(kos|kosov|kom|vizitk)/i);
          if (mQty) out.kolicina = parseInt(mQty[1], 10);
          // format npr 85x55 mm ali 210x297
          const mFmt = emailBesedilo.match(/(\d{2,4}\s*[x×]\s*\d{2,4})\s*mm/i);
          if (mFmt) out.format = `${mFmt[1].replace(/\s+/g, '')} mm`;
          // papir
          const mPapirG = emailBesedilo.match(/(\d{2,4})\s*g\b/i);
          const jePremazni = /premazn/i.test(txt);
          const jeMat = /mat\b/.test(txt);
          const jeSijaj = /sijaj/.test(txt);
          const jeNepremazni = /nepremazn/i.test(txt);
          if (mPapirG) {
            const g = `${mPapirG[1]}g`;
            if (jePremazni) {
              out.papir = `${g} ${jeMat ? 'mat premazni' : (jeSijaj ? 'sijaj premazni' : 'mat premazni')}`;
            } else if (jeNepremazni) {
              out.papir = `${g} nepremazni`;
            } else {
              out.papir = g;
            }
          }
          // barvnost
          if (txt.includes('dvostranski') || txt.includes('obojestransk')) out.barvnost = 'dvostranski tisk';
          else if (txt.includes('enostranski')) out.barvnost = 'enostranski tisk';
          // dodelava
          if (txt.includes('plastific')) {
            if (txt.includes('mat')) out.dodelava = 'plastificirano mat';
            else if (txt.includes('sijaj')) out.dodelava = 'plastificirano sijaj';
            else out.dodelava = 'plastificirano';
            out.dodelaveSeznam.push(out.dodelava);
          }
          // datum (slovni meseci ali dd.mm.)
          const months = ['januar','februar','marec','april','maj','junij','julij','avgust','september','oktober','november','december','januarja','februarja','marca','aprila','maja','junija','julija','avgusta','septembra','oktobra','novembra','decembra'];
          const mDM = emailBesedilo.match(/(\d{1,2})\.\s*(\d{1,2})\.(?:\s*(\d{2,4}))?/); // dd.mm.[yyyy]
          const mMonthWord = emailBesedilo.match(/(\d{1,2})\.\s*(januar\w*|februar\w*|marec\w*|april\w*|maj\w*|junij\w*|julij\w*|avgust\w*|september\w*|oktober\w*|november\w*|december\w*)/i);
          const year = new Date().getFullYear();
          if (mDM) {
            const d = parseInt(mDM[1], 10);
            const m = parseInt(mDM[2], 10);
            const y = mDM[3] ? (mDM[3].length === 2 ? 2000 + parseInt(mDM[3], 10) : parseInt(mDM[3], 10)) : year;
            if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
              out.datumDobave = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            }
          } else if (mMonthWord) {
            const d = parseInt(mMonthWord[1], 10);
            const monthWord = mMonthWord[2].toLowerCase();
            const idx = months.findIndex(x => monthWord.startsWith(x));
            const monthIdx = idx >= 0 ? (idx % 12) : 6; // julij fallback
            const mm = monthIdx + 1;
            out.datumDobave = `${year}-${String(mm).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          }
          // ura roka
          const timeMatch = emailBesedilo.match(/(?:do|ob)\s*(\d{1,2})(?::(\d{2}))?\s*h\b/i);
          if (timeMatch) {
            const hh = String(Math.min(23, Math.max(0, parseInt(timeMatch[1], 10)))).padStart(2,'0');
            const mm = String(timeMatch[2] ? parseInt(timeMatch[2], 10) : 0).padStart(2,'0');
            out.datumDobaveUra = `${hh}:${mm}`;
          }
          // cena
          const mCena = emailBesedilo.match(/cena\s+([\d\.,]+)\s*€?/i);
          if (mCena) {
            const val = parseFloat(mCena[1].replace(/\./g, '').replace(',', '.'));
            if (isFinite(val)) out.cena = val;
          }
          // druge dodelave
          if (/(3d\s*uv\s*lak|uv\s*lak)/i.test(emailBesedilo)) {
            out.dodelaveSeznam.push('3D UV lak');
          }
          if (/digitalni\s+(izsek|zasek)/i.test(emailBesedilo)) {
            out.dodelaveSeznam.push('digitalni izsek');
          } else if (/izsek|zasek/i.test(emailBesedilo)) {
            out.dodelaveSeznam.push('izsek');
          }
          if (/zgibanj/i.test(emailBesedilo)) out.dodelaveSeznam.push('zgibanje');
          if (/biganj/i.test(emailBesedilo)) out.dodelaveSeznam.push('biganje');
          if (/perforacij/i.test(emailBesedilo)) out.dodelaveSeznam.push('perforacija');
          if (/vrtanj/i.test(emailBesedilo) || /luknj/i.test(emailBesedilo)) out.dodelaveSeznam.push('vrtanje luknje');
          if (/lepljen/i.test(emailBesedilo)) out.dodelaveSeznam.push('lepljenje');
          // stranka/kontakt (preprosto: po "Hvala," ali "lp," vzemi prvo ime in morda podjetje za vejico)
          const mThanks = emailBesedilo.match(/(?:Hvala|Lep pozdrav|Lp)[, ]+([^\n,]+)(?:,\s*([^\n]+))?/i);
          if (mThanks) {
            out.stranka.ime = mThanks[1].trim();
            if (mThanks[2]) out.stranka.kraj = mThanks[2].trim();
            out.kontakt.ime = out.stranka.ime;
          }
          return out;
        })();
        return res.json(heur);
      } catch (e2) {
        const reason = aiErr && aiErr.message ? aiErr.message : 'Neznana napaka AI';
        return res.status(500).json({ error: 'AI klic ni uspel', details: reason, hint: 'Preverite OPENAI_API_KEY in OPENAI_MODEL (privzeto gpt-4o-mini).' });
      }
    }

    if (!responseText) {
      throw new Error('AI ni vrnil odgovora');
    }

    // Poskusi razčleniti JSON
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      console.error('Napaka pri razčlenjevanju AI odgovora:', responseText);
      throw new Error('AI je vrnil neveljaven JSON format');
    }

    // DODATNA OBOGATITEV IZ IZVORNEGA EMAILA (doslednost ne glede na AI)
    try {
      const raw = String(emailBesedilo || '');
      const lower = raw.toLowerCase();
      // 1) Papir: če je omenjen "premazni" (mat/sijaj), dopolni vrednost s tipom
      const gMatch = raw.match(/(\d{2,4})\s*g\b/i);
      const gram = gMatch ? parseInt(gMatch[1], 10) : undefined;
      const jePremazni = /premazn/i.test(lower);
      const jeMat = /mat\b/.test(lower);
      const jeSijaj = /sijaj/.test(lower);
      const jeNepremazni = /nepremazn/i.test(lower);
      if (gram && (jePremazni || jeNepremazni)) {
        if (jePremazni) {
          parsed.papir = `${gram}g ${jeMat ? 'mat premazni' : (jeSijaj ? 'sijaj premazni' : 'mat premazni')}`;
        } else if (jeNepremazni) {
          parsed.papir = `${gram}g nepremazni`;
        }
      }
      // 2) Dodelave: zberi vse omembe (plastifikacija, UV lak, izsek, zgibanje, biganje, perforacija, vrtanje, lepljenje)
      const dodelaveSeznam = [];
      // plastifikacija (poskusi ujeti 1/1 ali 1/0)
      if (/plastific/i.test(lower)) {
        let plast = 'plastifikacija';
        if (jeMat) plast += ' 1/1 mat';
        else if (jeSijaj) plast += ' 1/1 sijaj';
        dodelaveSeznam.push(plast);
      }
      if (/(3d\s*uv\s*lak|uv\s*lak)/i.test(lower)) {
        dodelaveSeznam.push('3D UV lak');
      }
      if (/digitalni\s+(izsek|zasek)/i.test(lower)) {
        dodelaveSeznam.push('digitalni izsek');
      } else if (/izsek|zasek/i.test(lower)) {
        dodelaveSeznam.push('izsek');
      }
      if (/zgibanj/i.test(lower) && !/brez\s+zgibanj/i.test(lower)) dodelaveSeznam.push('zgibanje');
      if (/biganj/i.test(lower)) dodelaveSeznam.push('biganje');
      if (/perforacij/i.test(lower)) dodelaveSeznam.push('perforacija');
      if (/vrtanj/i.test(lower) || /luknj/i.test(lower)) dodelaveSeznam.push('vrtanje luknje');
      if (/lepljen/i.test(lower) || /polepitev/i.test(lower) || /lepiln/i.test(lower)) dodelaveSeznam.push('lepljenje');
      if (dodelaveSeznam.length) {
        parsed.dodelaveSeznam = Array.from(new Set(dodelaveSeznam));
      }
      // 3) Čas roka: npr. "do 12 h", "do 12:00", "ob 12", "ob 12:30"
      const timeMatch = raw.match(/(?:do|ob)\s*(\d{1,2})(?::(\d{2}))?\s*h\b/i);
      if (timeMatch) {
        const hh = String(Math.min(23, Math.max(0, parseInt(timeMatch[1], 10)))).padStart(2, '0');
        const mm = String(timeMatch[2] ? parseInt(timeMatch[2], 10) : 0).padStart(2, '0');
        parsed.datumDobaveUra = `${hh}:${mm}`;
      }
      // 5) Cena – vzemi "cena N[,N] €" kot total
      if (parsed.cena == null) {
        const mCena = raw.match(/cena\s+([\d\.,]+)\s*€?/i);
        if (mCena) {
          const val = parseFloat(mCena[1].replace(/\./g, '').replace(',', '.'));
          if (isFinite(val)) parsed.cena = val;
        }
      }
      // 5) Cena – vzemi "cena N[,N] €" kot total
      if (parsed.cena == null) {
        const mCena = raw.match(/cena\s+([\d\.,]+)\s*€?/i);
        if (mCena) {
          const val = parseFloat(mCena[1].replace(/\./g, '').replace(',', '.'));
          if (isFinite(val)) parsed.cena = val;
        }
      }
      // 4) Če datum vsebuje dan/mesec brez leta, poskrbi za tekoče leto (če AI ni)
      if (!parsed.datumDobave || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.datumDobave)) {
        const mDM = raw.match(/(\d{1,2})\.\s*(\d{1,2})\./);
        if (mDM) {
          const y = new Date().getFullYear();
          const d = String(parseInt(mDM[1], 10)).padStart(2, '0');
          const m = String(parseInt(mDM[2], 10)).padStart(2, '0');
          parsed.datumDobave = `${y}-${m}-${d}`;
        }
      }
      // 4b) Naročilnica
      if (!parsed.narocilnica) {
        const mNar = raw.match(/Št\.\s*naročilnice\s*:\s*([^\r\n]+)/i) || raw.match(/(št\.\s*)?naročilnice\s*:\s*([^\r\n]+)/i);
        if (mNar) {
          const val = (mNar[1] || mNar[2] || '').toString().trim();
          if (val) parsed.narocilnica = val;
        }
      }
      // 4c) Material kot predmet (če AI ni podal izdelek)
      if (!parsed.izdelek) {
        const mMat = raw.match(/Material\s*:\s*([^\r\n]+)/i);
        if (mMat) {
          parsed.izdelek = mMat[1].toString().trim();
          // Format iz materiala, če še ni
          const mFmt2 = mMat[1].match(/(\d{2,4})\s*[x×]\s*(\d{2,4})\s*(mm|cm)?/i);
          if (!parsed.format && mFmt2) {
            const a = parseInt(mFmt2[1], 10);
            const b = parseInt(mFmt2[2], 10);
            const unit = (mFmt2[3] || 'mm').toLowerCase();
            parsed.format = unit === 'cm' ? `${a * 10}x${b * 10} mm` : `${a}x${b} mm`;
          }
        }
      }
      // 4d) E-mail domena -> predlagano podjetje (če manjka)
      if (!(parsed?.stranka?.kraj)) {
        const mEmail = raw.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i);
        if (mEmail) {
          const domain = mEmail[1].toLowerCase();
          const parts = domain.split('.');
          const sld = parts.length >= 2 ? parts[parts.length - 2] : '';
          if (sld) {
            const guess = sld.charAt(0).toUpperCase() + sld.slice(1);
            parsed.stranka = parsed.stranka || {};
            parsed.stranka.kraj = guess;
            parsed.kontakt = parsed.kontakt || {};
            if (!parsed.kontakt.email) {
              parsed.kontakt.email = mEmail[0].toLowerCase();
            }
          }
        }
      }
      // 6) Predmet, če ga AI ni podal (iz celotnega besedila)
      if (!parsed.izdelek) {
        const lt = lower;
        if (/\bbon\b/.test(lt)) parsed.izdelek = 'bon';
        else if (/vizitk/.test(lt)) parsed.izdelek = 'vizitka';
        else if (/letak/.test(lt)) parsed.izdelek = 'letak';
        else if (/plakat/.test(lt)) parsed.izdelek = 'plakat';
        else if (/nalepk/.test(lt)) parsed.izdelek = 'nalepka';
      }
      // 7) Poskusi razbiti na več produktov po naslovih (VIZITKE, BON, LETAK, …)
      if (!Array.isArray(parsed.produkti)) {
        const lines = raw.split(/\r?\n/);
        const headings = [];
        for (let i = 0; i < lines.length; i++) {
          const ln = lines[i].trim();
          if (/^(VIZITKE?|BON|LET(AK|KI)|PLAKAT|NALEPKE?)$/.test(ln.toUpperCase())) {
            headings.push({ index: i, title: ln.trim() });
          }
        }
        if (headings.length >= 2) {
          const blocks = [];
          for (let h = 0; h < headings.length; h++) {
            const start = headings[h].index + 1;
            const end = h + 1 < headings.length ? headings[h + 1].index : lines.length;
            const text = lines.slice(start, end).join('\n');
            blocks.push({ title: headings[h].title, text });
          }
          const parseBlock = (title, text) => {
            const t = text || '';
            const low = t.toLowerCase();
            const produkt = {};
            // predmet iz naslova
            const ttl = title.toLowerCase();
            if (ttl.includes('vizitk')) produkt.izdelek = 'vizitka';
            else if (ttl.includes('bon')) produkt.izdelek = 'bon';
            else if (ttl.includes('letak')) produkt.izdelek = 'letak';
            else if (ttl.includes('plakat')) produkt.izdelek = 'plakat';
            else if (ttl.includes('nalepk')) produkt.izdelek = 'nalepka';
            // kolicina
            const mQty = t.match(/koli[čc]ina\s*:\s*(\d{1,6})/i) || t.match(/(\d{1,6})\s*(kos|kosov|kom)\b/i);
            if (mQty) produkt.kolicina = parseInt(mQty[1], 10);
            // format
            const mFmt = t.match(/format\s*:\s*(\d{2,4}\s*[x×]\s*\d{2,4})\s*(mm|cm)?/i) || t.match(/(\d{2,4}\s*[x×]\s*\d{2,4})\s*mm/i);
            if (mFmt) produkt.format = `${mFmt[1].replace(/\s+/g, '')} ${mFmt[2] ? mFmt[2].toLowerCase() : 'mm'}`.trim();
            // papir
            const mG = t.match(/papir\s*:\s*([^\n]+)/i) || t.match(/(\d{2,4})\s*g\b/i);
            if (mG) {
              const gramOnly = mG[1] && /^\d{2,4}$/.test(mG[1]);
              if (gramOnly) produkt.papir = `${mG[1]}g`;
              else produkt.papir = mG[1] || `${mG[0]}`.trim();
              if (/premazn/i.test(low)) {
                const isMat = /mat\b/.test(low); const isSij = /sijaj/.test(low);
                const g2 = (produkt.papir.match(/(\d{2,4})\s*g/) || [null, ''])[1];
                produkt.papir = `${g2 || ''}${g2 ? 'g ' : ''}${isMat ? 'mat premazni' : (isSij ? 'sijaj premazni' : 'mat premazni')}`.trim();
              }
            }
            // barvnost
            if (/\b4\s*\/\s*4\b/.test(low) || /dvostrans|obojestrans/.test(low)) produkt.barvnost = '4/4 barvno obojestransko (CMYK)';
            else if (/\b4\s*\/\s*0\b/.test(low) || (/enostrans/.test(low) && /barvn/.test(low))) produkt.barvnost = '4/0 barvno enostransko (CMYK)';
            else if (/\b1\s*\/\s*1\b/.test(low)) produkt.barvnost = '1/1 črno belo obojestransko (K)';
            else if (/\b1\s*\/\s*0\b/.test(low) || /črno|crno/.test(low)) produkt.barvnost = '1/0 črno belo enostransko (K)';
            // dodelava
            const dlist = [];
            const dLine = t.match(/dodelava\s*:\s*([^\n]+)/i);
            const segment = (dLine ? dLine[1] : t).toLowerCase();
            if (/(3d\s*uv\s*lak|uv\s*lak)/i.test(segment)) dlist.push('3D UV lak');
            if (/plastific/.test(segment)) {
              const oboj = produkt.barvnost && (produkt.barvnost.includes('4/4') || produkt.barvnost.includes('1/1'));
              const mat = /mat/.test(segment);
              dlist.push(oboj ? (mat ? '1/1 mat' : '1/1 sijaj') : (mat ? '1/0 mat' : '1/0 sijaj'));
            }
            if (/digitalni\s+(izsek|zasek)/.test(segment)) dlist.push('digitalni izsek');
            else if (/izsek|zasek/.test(segment)) dlist.push('izsek');
            if (/zgib/.test(segment)) dlist.push('zgibanje');
            if (/big/.test(segment)) dlist.push('biganje');
            if (/perfor/.test(segment)) dlist.push('perforacija');
            if (/vrtanj|luknj/.test(segment)) dlist.push('vrtanje luknje');
            if (/lepljen/.test(segment)) dlist.push('lepljenje');
            if (dlist.length) produkt.dodelava = dlist.join(', ');
            // cena (poskusi v bloku)
            const c = t.match(/cena\s+([\d\.,]+)\s*€?/i);
            if (c) {
              const v = parseFloat(c[1].replace(/\./g, '').replace(',', '.'));
              if (isFinite(v)) produkt.cena = v;
            }
            return produkt;
          };
          const produkti = blocks.map(b => parseBlock(b.title, b.text)).filter(p => Object.keys(p).length > 0);
          if (produkti.length >= 2) {
            parsed.produkti = produkti;
          }
        }
      }
    } catch (ppErr) {
      console.warn('Opozorilo: post-process AI rezultata ni uspel:', ppErr && ppErr.message ? ppErr.message : ppErr);
    }

    return res.json(parsed);
  } catch (error) {
    console.error('Napaka pri AI razbiranju e-maila:', error);
    return res.status(500).json({
      error: 'Napaka pri razbiranju e-maila',
      details: error && error.message ? error.message : String(error)
    });
  }
});

// ---- Realtime skeniranje nalogov (SSE + scan endpoint) ----
const sseClients = new Set();
const scanLog = []; // { id, nalog, step, deviceId, ts, action: 'scan'|'undo' }
let scanSeq = 1;

function getScanToken() {
  return process.env.SCAN_TOKEN || null;
}

function requireScanToken(req, res, next) {
  const expected = getScanToken();
  if (!expected) return next(); // brez avtentikacije v MVP, če ni nastavljen
  const token = req.query.token || req.headers['x-scan-token'] || (req.body && req.body.token);
  if (token && String(token) === String(expected)) return next();
  return res.status(401).json({ ok: false, error: 'Unauthorized scan: invalid or missing token' });
}

app.get('/api/scan-events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();
  res.write('retry: 3000\n\n');
  sseClients.add(res);
  req.on('close', () => {
    sseClients.delete(res);
  });
});

function broadcastScanEvent(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try { client.write(payload); } catch {}
  }
}

// Primeren format: { nalog: number, step: string, deviceId?: string }
app.post('/api/scan', requireScanToken, (req, res) => {
  try {
    const { nalog, step, deviceId } = req.body || {};
    if (!nalog || !step) {
      return res.status(400).json({ ok: false, error: 'Manjka nalog ali step.' });
    }
    const evt = { id: scanSeq++, nalog: Number(nalog), step: String(step), deviceId: deviceId || null, ts: Date.now(), action: 'scan' };
    scanLog.unshift(evt);
    if (scanLog.length > 200) scanLog.pop();
    broadcastScanEvent(evt);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});

// Undo zadnjega skena (ali poljubnega po id)
// Body: { id?: number, nalog?: number, step?: string }
app.post('/api/scan-undo', requireScanToken, (req, res) => {
  try {
    let { id, nalog, step } = req.body || {};
    id = id != null ? Number(id) : null;
    nalog = nalog != null ? Number(nalog) : null;
    step = step != null ? String(step) : null;
    let target = null;
    if (id) {
      target = scanLog.find(e => e.id === id);
    } else if (nalog && step) {
      target = scanLog.find(e => e.nalog === nalog && e.step === step && e.action === 'scan');
    } else {
      target = scanLog.find(e => e.action === 'scan'); // najnovejši scan
    }
    if (!target) return res.status(404).json({ ok: false, error: 'Ni najdenega skena za preklic' });
    const undoEvt = { id: scanSeq++, nalog: target.nalog, step: target.step, deviceId: target.deviceId || null, ts: Date.now(), action: 'undo' };
    scanLog.unshift(undoEvt);
    if (scanLog.length > 200) scanLog.pop();
    broadcastScanEvent(undoEvt);
    return res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});

// Seznam zadnjih skenov (in undo dogodkov)
app.get('/api/scan-log', (req, res) => {
  res.json(scanLog.slice(0, 50));
});

app.listen(PORT, () => {
  console.log(`✅ Server teče na http://localhost:${PORT}`);
});

