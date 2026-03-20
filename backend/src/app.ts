import express, { Request, Response } from 'express'; // <-- popravljeno
import cors from 'cors';
import { poolPromise } from './db';
import sql from 'mssql';

// OpenAI API za AI funkcionalnost
import OpenAI from 'openai';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { parseEmailWithAI, normalizeParsedEmail, parseEmailToRazbraniWithAI } from './services/parseEmail';
import { ParsedEmailFormPrefill } from './types/parsedEmail';
import { RazbraniPodatkiEnvelope } from './types/razbraniPodatki';

// LEGACY: ta Express aplikacija ni kanonični backend. Za API v dev/prod uporabljaj backend/server.js (glej backend/README.md).

// Funkcija za formatiranje časa iz ur v minute
const formatirajCas = (ure: number): number => {
  return Math.round(ure * 60); // Pretvori ure v minute in zaokroži
};

const app = express();
app.use(cors());
app.use(express.json());

// Nodemailer transporter (SMTP)
// Podpri tudi datoteko process.env (poleg .env)
try {
  const altEnvPath = path.resolve(__dirname, '../../process.env');
  if (fs.existsSync(altEnvPath)) {
    const content = fs.readFileSync(altEnvPath, 'utf-8');
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
} catch (e) {
  console.warn('Opozorilo: branje process.env ni uspelo:', e);
}
const smtpHost = process.env.SMTP_HOST;
const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465;
const smtpSecure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : smtpPort === 465;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

const mailTransporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
});

app.get('/api/kupec', async (req: Request, res: Response) => {
  try {
    const pool = await poolPromise;
    if (!pool) {
      return res.status(503).json({ error: 'Baza ni na voljo (DB povezava ni uspela)' });
    }
    const result = await pool.request().query(`
      SELECT KupecID, Naziv, Naslov, Posta, Kraj, Telefon, Fax, IDzaDDV FROM dbo.Kupec
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Napaka pri pridobivanju kupcev', details: err });
  }
});

// Pošiljanje e-maila
app.post('/api/poslji-email', async (req: Request, res: Response) => {
  try {
    const { to, subject, html } = req.body || {};

    if (!to || !subject || !html) {
      return res.status(400).json({ error: 'Manjkajoča polja: to, subject, html so obvezna.' });
    }

    if (!smtpHost) {
      return res.status(500).json({ error: 'SMTP ni konfiguriran (manjka SMTP_HOST).' });
    }

    const fromAddress = process.env.SMTP_FROM || 'Trajanus <info@trajanus.si>';

    const info = await mailTransporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html,
    });

    res.json({ ok: true, messageId: info.messageId });
  } catch (err: any) {
    console.error('Napaka pri pošiljanju e-maila:', err);
    res.status(500).json({ error: 'Napaka pri pošiljanju e-maila', details: err?.message || String(err) });
  }
});

app.post('/api/delovni-nalog', async function (req: any, res: any) {
  try {
    const { kupecID, kontaktnaOseba, email, komentar, rokIzdelave } = req.body;
    const pool = await poolPromise;
    if (!pool) {
      return res.status(503).json({ error: 'Baza ni na voljo (DB povezava ni uspela)' });
    }

    // Preveri, če kupec obstaja
    const kupecResult = await pool.request()
      .input('kupecID', sql.Int, kupecID)
      .query('SELECT * FROM dbo.Kupec WHERE KupecID = @kupecID');
    const kupec = kupecResult.recordset[0];
    if (!kupec) {
      return res.status(404).json({ error: 'Kupec ni bil najden' });
    }

    // Najdi največjo številko naloga
    const maxNalogaResult = await pool.request().query('SELECT MAX(StevilkaNaloga) as maxNaloga FROM dbo.DelovniNalog');
    let stevilkaNaloga = 65000;
    if (maxNalogaResult.recordset[0].maxNaloga) {
      stevilkaNaloga = parseInt(maxNalogaResult.recordset[0].maxNaloga, 10) + 1;
    }

    const datumOdprtja = new Date();
    // Pretvori rokIzdelave v Date, če je string
    const rokIzdelaveDate = new Date(rokIzdelave);

    // Vstavi nov nalog
    await pool.request()
      .input('StevilkaNaloga', sql.Int, stevilkaNaloga)
      .input('DatumOdprtja', sql.DateTime, datumOdprtja)
      .input('RokIzdelave', sql.DateTime, rokIzdelaveDate)
      .input('KupecID', sql.Int, kupecID)
      .input('Komentar', sql.NVarChar(sql.MAX), komentar)
      .input('Email', sql.NVarChar(255), email)
      .input('KontaktnaOseba', sql.NVarChar(255), kontaktnaOseba)
      .query(`INSERT INTO dbo.DelovniNalog (StevilkaNaloga, DatumOdprtja, RokIzdelave, KupecID, Komentar, Email, KontaktnaOseba)
              VALUES (@StevilkaNaloga, @DatumOdprtja, @RokIzdelave, @KupecID, @Komentar, @Email, @KontaktnaOseba)`);

    // Formatiraj datume evropsko
    const datumOdprtjaFormatted = datumOdprtja.toLocaleDateString('sl-SI') + ' ' + datumOdprtja.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
    const rokIzdelaveFormatted = rokIzdelaveDate.toLocaleDateString('sl-SI') + ' ' + rokIzdelaveDate.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });

    res.json({
      stevilkaNaloga,
      datumOdprtja: datumOdprtjaFormatted,
      rokIzdelave: rokIzdelaveFormatted,
      kupecID,
      komentar,
      email,
      kontaktnaOseba
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Napaka pri obdelavi delovnega naloga', details: err });
  }
});

// AI Email Parser endpoint (strict "razbraniPodatki" shema)
app.post('/api/ai/razberiNalogIzEmaila', async function (req: any, res: any) {
  try {
    const { emailBesedilo } = req.body;
    
    if (!emailBesedilo) {
      return res.status(400).json({ error: 'Email besedilo je obvezno' });
    }

    // Inicializiraj OpenAI (če je API ključ nastavljen)
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      // Če ni API ključa, uporabi statično razbiranje za testni e-mail v STROGI shemi
      console.log('OpenAI API ključ ni nastavljen, uporabljam statično razbiranje');
      
      // Preveri, če je to testni e-mail
      if (emailBesedilo.includes('500 vizitk') && emailBesedilo.includes('Marko Novak')) {
        const statičniRezultat: RazbraniPodatkiEnvelope = {
          razbraniPodatki: {
            stevilkaNaloga: null,
            datumOdprtja: null,
            status: null,
            dobavljeno: null,
            prioritetnaOcena: null,
            emailPoslan: null,
            zakljucekEmailPoslan: null,
            kupec: {
              KupecID: null,
              Naziv: 'Podjetje Medis',
              Naslov: null,
              Posta: null,
              Kraj: null,
              Telefon: null,
              Fax: null,
              IDzaDDV: null,
              email: null,
              narocilnica: null,
              rocniVnos: false,
              posljiEmail: null
            },
            kontakt: {
              kontaktnaOseba: 'Marko Novak',
              email: null,
              telefon: null
            },
            rokIzdelave: '2024-07-10',
            rokIzdelaveUra: null,
            datumNarocila: null,
            tisk: {
              tisk1: {
                predmet: 'vizitka',
                format: '85x55 mm',
                obseg: null,
                steviloKosov: '500',
                material: '300g',
                barve: '4/4',
                steviloPol: null,
                kosovNaPoli: null,
                tiskaKooperant: null,
                kooperant: null,
                rokKooperanta: null,
                znesekKooperanta: null,
                b2Format: null,
                b1Format: null,
                steviloMutacij: null,
                mutacije: []
              },
              tisk2: {
                predmet: null,
                format: null,
                obseg: null,
                steviloKosov: null,
                material: null,
                barve: null,
                steviloPol: null,
                kosovNaPoli: null,
                tiskaKooperant: null,
                kooperant: null,
                rokKooperanta: null,
                znesekKooperanta: null,
                b2Format: null,
                b1Format: null,
                steviloMutacij: null,
                mutacije: []
              }
            },
            dodelava: {
              dodelava1: {
                razrez: null,
                vPolah: null,
                zgibanje: null,
                biganje: null,
                perforacija: null,
                biganjeRocnoZgibanje: null,
                lepljenje: null,
                lepljenjeMesta: null,
                lepljenjeSirina: 'plastificirano mat',
                lepljenjeBlokov: null,
                vrtanjeLuknje: null,
                velikostLuknje: null,
                uvTisk: null,
                uvLak: null,
                topliTisk: null,
                vezava: null,
                izsek: null,
                plastifikacija: '1/0 mat',
                kooperant1: null,
                kooperant1Podatki: { imeKooperanta: null, predvidenRok: null, znesekDodelave: null, vrstaDodelave: null },
                kooperant2: null,
                kooperant2Podatki: { imeKooperanta: null, predvidenRok: null, znesekDodelave: null, vrstaDodelave: null },
                kooperant3: null,
                kooperant3Podatki: { imeKooperanta: null, predvidenRok: null, znesekDodelave: null, vrstaDodelave: null },
                stevilkaOrodja: null
              },
              dodelava2: {
                razrez: null,
                vPolah: null,
                zgibanje: null,
                biganje: null,
                perforacija: null,
                biganjeRocnoZgibanje: null,
                lepljenje: null,
                lepljenjeMesta: null,
                lepljenjeSirina: null,
                lepljenjeBlokov: null,
                vrtanjeLuknje: null,
                velikostLuknje: null,
                uvTisk: null,
                uvLak: null,
                topliTisk: null,
                vezava: null,
                izsek: null,
                plastifikacija: null,
                kooperant1: null,
                kooperant1Podatki: { imeKooperanta: null, predvidenRok: null, znesekDodelave: null, vrstaDodelave: null },
                kooperant2: null,
                kooperant2Podatki: { imeKooperanta: null, predvidenRok: null, znesekDodelave: null, vrstaDodelave: null },
                kooperant3: null,
                kooperant3Podatki: { imeKooperanta: null, predvidenRok: null, znesekDodelave: null, vrstaDodelave: null },
                stevilkaOrodja: null
              }
            },
            stroski: {
              stroski1: {
                graficnaPriprava: null,
                cenaKlišeja: null,
                cenaIzsekovalnegaOrodja: null,
                cenaVzorca: null,
                cenaBrezDDV: null,
                skupaj: null,
                skupajZDDV: null
              },
              stroski2: {
                graficnaPriprava: null,
                cenaKlišeja: null,
                cenaIzsekovalnegaOrodja: null,
                cenaVzorca: null,
                cenaBrezDDV: null,
                skupaj: null,
                skupajZDDV: null
              }
            },
            posiljanje: {
              posiljanjePoPosti: null,
              naziv: null,
              naslov: null,
              kraj: null,
              postnaStevilka: null,
              osebnoPrevzem: null,
              dostavaNaLokacijo: null
            },
            komentar: { komentar: null }
          }
        };
        return res.json(statičniRezultat);
      } else {
        return res.status(400).json({ error: 'OpenAI API ključ ni nastavljen. Dodajte OPENAI_API_KEY v .env datoteko.' });
      }
    }

    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });
    const parsed = await parseEmailToRazbraniWithAI(emailBesedilo, openai);
    res.json(parsed);
  } catch (error) {
    console.error('Napaka pri AI razbiranju e-maila:', error);
    res.status(500).json({ 
      error: 'Napaka pri razbiranju e-maila', 
      details: error instanceof Error ? error.message : 'Neznana napaka'
    });
  }
});

// POST /api/parse-email
// Vhod: { emailText: string }
// Izhod: strukturiran JSON za auto-fill obrazca (strogo JSON, fallback null)
app.post('/api/parse-email', async (req: Request, res: Response) => {
  try {
    const emailText = (req.body as any)?.emailText;
    if (!emailText || typeof emailText !== 'string' || emailText.trim().length === 0) {
      return res.status(400).json({ error: 'Manjka obvezno polje: emailText (string)' });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API ključ ni nastavljen. Dodajte OPENAI_API_KEY.' });
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });
    // 1) AI razbiranje v shemo
    const aiRaw = await parseEmailWithAI(emailText, openai);
    // 2) Validacija/normalizacija in fallbacki -> null
    const normalized: ParsedEmailFormPrefill = normalizeParsedEmail(aiRaw);

    // 3) Lookup kupca po imenu, če imamo ime in DB povezavo
    const pool = await poolPromise;
    const customerName = normalized.customer.name;
    if (pool && customerName) {
      try {
        // exact match (case-insensitive, trimmed)
        const exact = await pool.request()
          .input('naziv', sql.NVarChar(255), customerName.trim().toLowerCase())
          .query(`
            SELECT TOP 1 KupecID, Naziv
            FROM dbo.Kupec
            WHERE LOWER(LTRIM(RTRIM(Naziv))) = @naziv
          `);
        if (exact.recordset && exact.recordset.length > 0) {
          normalized.customer.id = exact.recordset[0].KupecID;
          normalized.customer.lookup.matched = true;
          normalized.customer.lookup.candidates = [];
        } else {
          // candidates via LIKE
          const likeParam = `%${customerName}%`;
          const candidates = await pool.request()
            .input('likeName', sql.NVarChar(255), likeParam)
            .query(`
              SELECT TOP 5 KupecID, Naziv
              FROM dbo.Kupec
              WHERE Naziv LIKE @likeName
              ORDER BY Naziv
            `);
          normalized.customer.id = null;
          normalized.customer.lookup.matched = false;
          normalized.customer.lookup.candidates = (candidates.recordset || []).map((r: any) => ({
            id: r.KupecID,
            Naziv: r.Naziv,
          }));
        }
      } catch (lookupErr) {
        console.warn('Opozorilo: lookup kupca ni uspel:', lookupErr);
        normalized.customer.id = null;
        normalized.customer.lookup.matched = false;
      }
    }

    // 4) Odgovor
    return res.json(normalized);
  } catch (err: any) {
    console.error('Napaka pri /api/parse-email:', err);
    return res.status(500).json({
      error: 'Napaka pri razbiranju e-maila',
      details: err?.message || 'Neznana napaka',
    });
  }
});

// Endpoint za izračun prioritetnih nalogov
app.get('/api/prioritetni-nalogi', async (req: Request, res: Response) => {
  try {
    const pool = await poolPromise;
    if (!pool) {
      return res.status(503).json({ error: 'Baza ni na voljo (DB povezava ni uspela)' });
    }
    const result = await pool.request().query(`
      SELECT 
        dn.StevilkaNaloga,
        dn.DatumOdprtja,
        dn.RokIzdelave,
        dn.Status,
        k.Naziv as KupecNaziv,
        k.Email as KupecEmail
      FROM dbo.DelovniNalog dn
      JOIN dbo.Kupec k ON dn.KupecID = k.KupecID
      WHERE dn.Status = 'v_delu'
      ORDER BY dn.StevilkaNaloga DESC
    `);

    const prioritetniNalogi = result.recordset.map((nalog: any) => {
      // Simuliraj izračun časa (v praksi bi bilo iz baze)
      const casSekcije = {
        tisk: formatirajCas(2.5), // 2.5h -> 150min
        uvTisk: formatirajCas(1.2), // 1.2h -> 72min
        plastifikacija: formatirajCas(0.8), // 0.8h -> 48min
        uvLak: formatirajCas(0.5), // 0.5h -> 30min
        izsek: formatirajCas(1.0), // 1.0h -> 60min
        topliTisk: formatirajCas(0.3), // 0.3h -> 18min
        biganje: formatirajCas(0.4), // 0.4h -> 24min
        zgibanje: formatirajCas(0.6), // 0.6h -> 36min
        lepljenje: formatirajCas(1.5), // 1.5h -> 90min
        vezava: formatirajCas(2.0), // 2.0h -> 120min
        vrtanjeLuknje: formatirajCas(0.2), // 0.2h -> 12min
        perforacija: formatirajCas(0.3), // 0.3h -> 18min
        kooperanti: formatirajCas(8.0), // 8.0h -> 480min
        skupaj: 0
      };
      
      // Izračunaj skupaj
      casSekcije.skupaj = Object.values(casSekcije).reduce((sum: number, val: number) => sum + val, 0) - casSekcije.skupaj;

      // Izračunaj prioriteto
      const rokIzdelave = new Date(nalog.RokIzdelave);
      const danes = new Date();
      const razlikaUre = (rokIzdelave.getTime() - danes.getTime()) / (1000 * 60 * 60);
      
      let prioriteta = 5; // Nizka
      if (razlikaUre < 0) prioriteta = 1; // Kritično
      else if (razlikaUre < 2) prioriteta = 2; // Urgentno
      else if (razlikaUre < 5) prioriteta = 3; // Pomembno
      else if (razlikaUre < 16) prioriteta = 4; // Običajno

      return {
        stevilkaNaloga: nalog.StevilkaNaloga,
        predvideniCas: casSekcije.skupaj,
        casSekcije,
        rokIzdelave: nalog.RokIzdelave,
        prioriteta,
        status: nalog.Status,
        podatki: {
          kupec: { Naziv: nalog.KupecNaziv, Email: nalog.KupecEmail },
          datumNarocila: nalog.DatumOdprtja
        },
        preostaliCasDoRoka: Math.round(razlikaUre * 60) // V minutah
      };
    });

    res.json(prioritetniNalogi);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Napaka pri pridobivanju prioritetnih nalogov', details: err });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

// --------- ANALYTICS ENDPOINTS ----------

// Helper: normalize komentar for tech detection (in SQL we do LOWER and REPLACE patterns)
app.get('/api/analitika/tehnologi', async (req: any, res: any) => {
  try {
    const from = (req.query.from as string) || '';
    const to = (req.query.to as string) || '';
    if (!from || !to) return res.status(400).json({ error: 'Manjka from/to (YYYY-MM-DD)' });
    const pool = await poolPromise;
    if (!pool) return res.status(503).json({ error: 'Baza ni na voljo' });
    // Aggregate by day; detect tehnolog from Komentar (robust variants)
    const result = await pool.request()
      .input('from', sql.Date, new Date(from))
      .input('to', sql.Date, new Date(to))
      .query(`
        SELECT 
          CONVERT(date, dn.DatumOdprtja) AS Dan,
          SUM(CASE 
                WHEN lower(replace(replace(replace(coalesce(dn.Komentar,''),' ',''),char(9),''),char(10),'')) LIKE '%rok%' THEN 1
                ELSE 0
              END) AS Rok,
          SUM(CASE 
                WHEN (lower(replace(replace(replace(coalesce(dn.Komentar,''),' ',''),char(9),''),char(10),'')) LIKE '%bor%' 
                      OR lower(replace(replace(replace(coalesce(dn.Komentar,''),' ',''),char(9),''),char(10),'')) LIKE '%rob%') THEN 1
                ELSE 0
              END) AS Bor,
          SUM(CASE 
                WHEN (lower(replace(replace(replace(coalesce(dn.Komentar,''),' ',''),char(9),''),char(10),'')) LIKE '%tomaz%' 
                      OR lower(replace(replace(replace(coalesce(dn.Komentar,''),' ',''),char(9),''),char(10),'')) LIKE '%tomas%') THEN 1
                ELSE 0
              END) AS Tomaz,
          SUM(CASE 
                WHEN (lower(replace(replace(replace(coalesce(dn.Komentar,''),' ',''),char(9),''),char(10),'')) LIKE '%stane%' 
                      OR lower(replace(replace(replace(coalesce(dn.Komentar,''),' ',''),char(9),''),char(10),'')) LIKE '%stan%' 
                      OR lower(replace(replace(replace(coalesce(dn.Komentar,''),' ',''),char(9),''),char(10),'')) LIKE '%tane%') THEN 1
                ELSE 0
              END) AS Stane
        FROM dbo.DelovniNalog dn
        WHERE CONVERT(date, dn.DatumOdprtja) BETWEEN @from AND @to
        GROUP BY CONVERT(date, dn.DatumOdprtja)
        ORDER BY Dan
      `);
    res.json(result.recordset || []);
  } catch (err) {
    console.error('Napaka /api/analitika/tehnologi:', err);
    res.status(500).json({ error: 'Napaka pri analitiki tehnologov', details: String(err) });
  }
});

// Produkti: klasifikacija iz možnih polj (Opis ali Naziv). Če ni, vrne prazno.
app.get('/api/analitika/produkti', async (req: any, res: any) => {
  try {
    const from = (req.query.from as string) || '';
    const to = (req.query.to as string) || '';
    if (!from || !to) return res.status(400).json({ error: 'Manjka from/to (YYYY-MM-DD)' });
    const pool = await poolPromise;
    if (!pool) return res.status(503).json({ error: 'Baza ni na voljo' });
    // Vrni dnevne vrstice s tekstom, frontend klasificira
    const result = await pool.request()
      .input('from', sql.Date, new Date(from))
      .input('to', sql.Date, new Date(to))
      .query(`
        SELECT 
          CONVERT(date, dn.DatumOdprtja) AS Dan,
          COALESCE(NULLIF(LTRIM(RTRIM(dn.Opis)), ''), NULLIF(LTRIM(RTRIM(dn.Naziv)), ''), '') AS Besedilo
        FROM dbo.DelovniNalog dn
        WHERE CONVERT(date, dn.DatumOdprtja) BETWEEN @from AND @to
        ORDER BY Dan
      `);
    res.json(result.recordset || []);
  } catch (err) {
    console.error('Napaka /api/analitika/produkti:', err);
    res.status(500).json({ error: 'Napaka pri analitiki produktov', details: String(err) });
  }
});
