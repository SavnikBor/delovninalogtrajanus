'use strict';

const express = require('express');
const sql = require('mssql');
const {
  isValidMonthStr,
  monthStrToDateStart,
  dateToMonthStr,
  isValidDateStr,
} = require('../lib/dates');

function createAnalyticsRouter(dbConfig) {
  const router = express.Router();

// ---- Analitika: KPRI Prihodek (mesečno) ----
let dnColsCache = null;
let dnColsCacheAt = 0;
async function getDelovniNalogCols() {
  const now = Date.now();
  if (dnColsCache && (now - dnColsCacheAt) < 5 * 60 * 1000) return dnColsCache;
  const r = await new sql.Request().query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='DelovniNalog'
  `);
  dnColsCache = new Set((r.recordset || []).map(x => String(x.COLUMN_NAME || '').toLowerCase()));
  dnColsCacheAt = now;
  return dnColsCache;
}

function pickFirstCol(haveColsSet, candidates) {
  for (const c of candidates) {
    if (haveColsSet.has(String(c).toLowerCase())) return c;
  }
  return null;
}

router.get('/api/analitika/kpri-prihodek/range', async (req, res) => {
  try {
    await sql.connect(dbConfig);
    const cols = await getDelovniNalogCols();
    const dateCol = pickFirstCol(cols, ['DatumOdprtja', 'Datum', 'DatumNastanka', 'DatumUstvarjanja']);
    if (!dateCol) {
      const now = new Date();
      return res.json({ minMonth: `${now.getFullYear()}-01`, maxMonth: dateToMonthStr(now) });
    }
    const r = await new sql.Request().query(`
      SELECT 
        MIN(dn.[${dateCol}]) AS MinDatum,
        MAX(dn.[${dateCol}]) AS MaxDatum
      FROM dbo.DelovniNalog dn
      WHERE dn.[${dateCol}] IS NOT NULL
    `);
    const row = (r.recordset && r.recordset[0]) ? r.recordset[0] : null;
    const now = new Date();
    const fallbackMin = `${now.getFullYear()}-01`;
    const fallbackMax = dateToMonthStr(now);
    if (!row || !row.MinDatum || !row.MaxDatum) {
      return res.json({ minMonth: fallbackMin, maxMonth: fallbackMax });
    }
    const minMonth = dateToMonthStr(new Date(row.MinDatum));
    const maxMonth = dateToMonthStr(new Date(row.MaxDatum));
    return res.json({ minMonth, maxMonth });
  } catch (e) {
    console.error('Napaka /api/analitika/kpri-prihodek/range:', e);
    return res.status(500).json({ error: 'Napaka pri branju obsega analitike', details: e && e.message ? e.message : String(e) });
  }
});

// Query: /api/analitika/kpri-prihodek?from=YYYY-MM&to=YYYY-MM (inkluzivno)
router.get('/api/analitika/kpri-prihodek', async (req, res) => {
  try {
    const from = (req.query.from || '').toString();
    const to = (req.query.to || '').toString();
    if (!isValidMonthStr(from) || !isValidMonthStr(to)) {
      return res.status(400).json({ error: 'Manjka ali je neveljaven from/to (YYYY-MM)' });
    }
    const fromDate = monthStrToDateStart(from);
    const toDate = monthStrToDateStart(to);
    // toDateExclusive = 1. dan naslednjega meseca
    const toDateExclusive = new Date(toDate.getFullYear(), toDate.getMonth() + 1, 1);

    await sql.connect(dbConfig);
    const cols = await getDelovniNalogCols();
    const dateCol = pickFirstCol(cols, ['DatumOdprtja', 'Datum', 'DatumNastanka', 'DatumUstvarjanja']);
    if (!dateCol) return res.status(500).json({ error: 'DelovniNalog: ni najden stolpec datuma (DatumOdprtja/Datum/...)' });
    const result = await new sql.Request()
      .input('from', sql.DateTime, fromDate)
      .input('to', sql.DateTime, toDateExclusive)
      .query(`
        DECLARE @hasStrosek BIT = CASE WHEN OBJECT_ID(N'dbo.DelovniNalogPozicijaStrosek', N'U') IS NULL THEN 0 ELSE 1 END;
        DECLARE @hasPoz BIT = CASE WHEN OBJECT_ID(N'dbo.DelovniNalogPozicija', N'U') IS NULL THEN 0 ELSE 1 END;
        DECLARE @hasXml BIT = CASE WHEN OBJECT_ID(N'dbo.DelovniNalogXML', N'U') IS NULL THEN 0 ELSE 1 END;

        IF (@hasPoz = 0 AND @hasXml = 0 AND @hasStrosek = 0)
        BEGIN
          SELECT TOP 0
            CAST(NULL AS char(7)) AS Mesec,
            CAST(0 AS DECIMAL(18,2)) AS graficnaPriprava,
            CAST(0 AS DECIMAL(18,2)) AS cenaKlišeja,
            CAST(0 AS DECIMAL(18,2)) AS cenaIzsekovalnegaOrodja,
            CAST(0 AS DECIMAL(18,2)) AS cenaVzorca,
            CAST(0 AS DECIMAL(18,2)) AS cenaBrezDDV;
          RETURN;
        END

        ;WITH StrosekAgg AS (
          SELECT
            s.DelovniNalogID,
            MAX(CASE WHEN s.Naziv = N'graficnaPriprava' THEN 1 ELSE 0 END) AS has_graficnaPriprava,
            MAX(CASE WHEN s.Naziv = N'cenaKlišeja' THEN 1 ELSE 0 END) AS has_cenaKlišeja,
            MAX(CASE WHEN s.Naziv = N'cenaIzsekovalnegaOrodja' THEN 1 ELSE 0 END) AS has_cenaIzsekovalnegaOrodja,
            MAX(CASE WHEN s.Naziv = N'cenaVzorca' THEN 1 ELSE 0 END) AS has_cenaVzorca,
            MAX(CASE WHEN s.Naziv = N'cenaBrezDDV' THEN 1 ELSE 0 END) AS has_cenaBrezDDV,
            SUM(CASE WHEN s.Naziv = N'graficnaPriprava' THEN ISNULL(s.Znesek, 0) ELSE 0 END) AS graficnaPriprava,
            SUM(CASE WHEN s.Naziv = N'cenaKlišeja' THEN ISNULL(s.Znesek, 0) ELSE 0 END) AS cenaKlišeja,
            SUM(CASE WHEN s.Naziv = N'cenaIzsekovalnegaOrodja' THEN ISNULL(s.Znesek, 0) ELSE 0 END) AS cenaIzsekovalnegaOrodja,
            SUM(CASE WHEN s.Naziv = N'cenaVzorca' THEN ISNULL(s.Znesek, 0) ELSE 0 END) AS cenaVzorca,
            SUM(CASE WHEN s.Naziv = N'cenaBrezDDV' THEN ISNULL(s.Znesek, 0) ELSE 0 END) AS cenaBrezDDV
          FROM dbo.DelovniNalogPozicijaStrosek s
          WHERE @hasStrosek = 1
            AND s.Pozicija IN (1, 2)
            AND s.Skupina IN (1, 2)
            AND s.Naziv IN (N'graficnaPriprava', N'cenaKlišeja', N'cenaIzsekovalnegaOrodja', N'cenaVzorca', N'cenaBrezDDV')
          GROUP BY s.DelovniNalogID
        ),
        PozAgg AS (
          SELECT
            t.DelovniNalogID,
            SUM(ISNULL(t.GraficnaPriprava, 0)) AS graficnaPriprava,
            SUM(ISNULL(t.CenaBrezDDV, 0)) AS cenaBrezDDV
          FROM (
            SELECT p.DelovniNalogID, p.GraficnaPriprava, p.CenaBrezDDV
            FROM dbo.DelovniNalogPozicija p
            WHERE @hasPoz = 1
              AND p.Pozicija IN (1, 2)
            UNION ALL
            SELECT x.DelovniNalogID, x.GraficnaPriprava, x.CenaBrezDDV
            FROM dbo.DelovniNalogXML x
            WHERE @hasXml = 1
              AND x.Pozicija IN (1, 2)
          ) t
          GROUP BY t.DelovniNalogID
        )
        SELECT
          CONVERT(char(7), dn.[${dateCol}], 120) AS Mesec,
          SUM(CASE WHEN sa.has_graficnaPriprava = 1 THEN sa.graficnaPriprava ELSE ISNULL(pa.graficnaPriprava, 0) END) AS graficnaPriprava,
          SUM(CASE WHEN sa.has_cenaKlišeja = 1 THEN sa.cenaKlišeja ELSE 0 END) AS cenaKlišeja,
          SUM(CASE WHEN sa.has_cenaIzsekovalnegaOrodja = 1 THEN sa.cenaIzsekovalnegaOrodja ELSE 0 END) AS cenaIzsekovalnegaOrodja,
          SUM(CASE WHEN sa.has_cenaVzorca = 1 THEN sa.cenaVzorca ELSE 0 END) AS cenaVzorca,
          SUM(CASE WHEN sa.has_cenaBrezDDV = 1 THEN sa.cenaBrezDDV ELSE ISNULL(pa.cenaBrezDDV, 0) END) AS cenaBrezDDV
        FROM dbo.DelovniNalog dn
        LEFT JOIN StrosekAgg sa ON sa.DelovniNalogID = dn.DelovniNalogID
        LEFT JOIN PozAgg pa ON pa.DelovniNalogID = dn.DelovniNalogID
        WHERE dn.[${dateCol}] >= @from AND dn.[${dateCol}] < @to
        GROUP BY CONVERT(char(7), dn.[${dateCol}], 120)
        ORDER BY Mesec;
      `);

    return res.json(result.recordset || []);
  } catch (e) {
    console.error('Napaka /api/analitika/kpri-prihodek:', e);
    return res.status(500).json({ error: 'Napaka pri branju KPRI prihodka', details: e && e.message ? e.message : String(e) });
  }
});

// ---- Analitika: KPI Tehnologi (dnevno + vrednosti) ----
router.get('/api/analitika/tehnologi-kpi', async (req, res) => {
  try {
    const from = (req.query.from || '').toString();
    const to = (req.query.to || '').toString();
    if (!isValidDateStr(from) || !isValidDateStr(to)) {
      return res.status(400).json({ error: 'Manjka from/to (YYYY-MM-DD)' });
    }
    await sql.connect(dbConfig);
    const cols = await getDelovniNalogCols();
    const dateCol = pickFirstCol(cols, ['DatumOdprtja', 'Datum', 'DatumNastanka', 'DatumUstvarjanja']);
    // Pomembno: v tej bazi so imena tehnologov praviloma v "Opombe" (ne v "Opis")
    const komentarCol = pickFirstCol(cols, ['Opombe', 'Komentar', 'Opomba', 'Opis']);
    if (!dateCol) return res.status(500).json({ error: 'DelovniNalog: ni najden stolpec datuma (DatumOdprtja/Datum/...)' });
    if (!komentarCol) return res.status(500).json({ error: 'DelovniNalog: ni najden stolpec komentarja/opisa (Komentar/Opis/...)' });

    const fromDate = new Date(from);
    const toDate = new Date(to);
    // inclusive -> exclusive +1 dan
    const toExclusive = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1);

    const r = await new sql.Request()
      .input('from', sql.DateTime, fromDate)
      .input('to', sql.DateTime, toExclusive)
      .query(`
        WITH StrosekTot AS (
          SELECT
            s.DelovniNalogID,
            COUNT(1) AS Cnt,
            SUM(ISNULL(s.Znesek, 0)) AS Total
          FROM dbo.DelovniNalogPozicijaStrosek s
          WHERE s.Pozicija IN (1, 2)
            AND s.Skupina IN (1, 2)
            AND s.Naziv IN (N'graficnaPriprava', N'cenaKlišeja', N'cenaIzsekovalnegaOrodja', N'cenaVzorca', N'cenaBrezDDV')
          GROUP BY s.DelovniNalogID
        ),
        FallbackTot AS (
          SELECT
            t.DelovniNalogID,
            SUM(ISNULL(t.GraficnaPriprava, 0) + ISNULL(t.CenaBrezDDV, 0)) AS Total
          FROM (
            SELECT DelovniNalogID, Pozicija, GraficnaPriprava, CenaBrezDDV
            FROM dbo.DelovniNalogPozicija
            WHERE Pozicija IN (1, 2)
            UNION ALL
            SELECT DelovniNalogID, Pozicija, GraficnaPriprava, CenaBrezDDV
            FROM dbo.DelovniNalogXML
            WHERE Pozicija IN (1, 2)
          ) t
          GROUP BY t.DelovniNalogID
        ),
        Base AS (
          SELECT
            dn.DelovniNalogID,
            CONVERT(date, dn.[${dateCol}]) AS Dan,
            LOWER(REPLACE(REPLACE(REPLACE(COALESCE(CONVERT(nvarchar(max), dn.[${komentarCol}]), N''), N' ', N''), CHAR(9), N''), CHAR(10), N'')) COLLATE Latin1_General_CI_AI AS K,
            CASE
              WHEN LOWER(REPLACE(REPLACE(REPLACE(COALESCE(CONVERT(nvarchar(max), dn.[${komentarCol}]), N''), N' ', N''), CHAR(9), N''), CHAR(10), N'')) COLLATE Latin1_General_CI_AI LIKE N'%rok%' THEN N'Rok'
              WHEN (LOWER(REPLACE(REPLACE(REPLACE(COALESCE(CONVERT(nvarchar(max), dn.[${komentarCol}]), N''), N' ', N''), CHAR(9), N''), CHAR(10), N'')) COLLATE Latin1_General_CI_AI LIKE N'%bor%'
                    OR LOWER(REPLACE(REPLACE(REPLACE(COALESCE(CONVERT(nvarchar(max), dn.[${komentarCol}]), N''), N' ', N''), CHAR(9), N''), CHAR(10), N'')) COLLATE Latin1_General_CI_AI LIKE N'%rob%') THEN N'Bor'
              WHEN (LOWER(REPLACE(REPLACE(REPLACE(COALESCE(CONVERT(nvarchar(max), dn.[${komentarCol}]), N''), N' ', N''), CHAR(9), N''), CHAR(10), N'')) COLLATE Latin1_General_CI_AI LIKE N'%tomaz%'
                    OR LOWER(REPLACE(REPLACE(REPLACE(COALESCE(CONVERT(nvarchar(max), dn.[${komentarCol}]), N''), N' ', N''), CHAR(9), N''), CHAR(10), N'')) COLLATE Latin1_General_CI_AI LIKE N'%tomas%') THEN N'Tomaž'
              WHEN (LOWER(REPLACE(REPLACE(REPLACE(COALESCE(CONVERT(nvarchar(max), dn.[${komentarCol}]), N''), N' ', N''), CHAR(9), N''), CHAR(10), N'')) COLLATE Latin1_General_CI_AI LIKE N'%stane%'
                    OR LOWER(REPLACE(REPLACE(REPLACE(COALESCE(CONVERT(nvarchar(max), dn.[${komentarCol}]), N''), N' ', N''), CHAR(9), N''), CHAR(10), N'')) COLLATE Latin1_General_CI_AI LIKE N'%stan%'
                    OR LOWER(REPLACE(REPLACE(REPLACE(COALESCE(CONVERT(nvarchar(max), dn.[${komentarCol}]), N''), N' ', N''), CHAR(9), N''), CHAR(10), N'')) COLLATE Latin1_General_CI_AI LIKE N'%tane%') THEN N'Stane'
              ELSE NULL
            END AS Tech
          FROM dbo.DelovniNalog dn
          WHERE dn.[${dateCol}] >= @from AND dn.[${dateCol}] < @to
        )
        SELECT
          b.Dan,
          SUM(CASE WHEN b.Tech = N'Rok' THEN 1 ELSE 0 END) AS RokCount,
          SUM(CASE WHEN b.Tech = N'Bor' THEN 1 ELSE 0 END) AS BorCount,
          SUM(CASE WHEN b.Tech = N'Tomaž' THEN 1 ELSE 0 END) AS TomazCount,
          SUM(CASE WHEN b.Tech = N'Stane' THEN 1 ELSE 0 END) AS StaneCount,
          SUM(CASE WHEN b.Tech = N'Rok' THEN CAST(CASE WHEN st.Cnt IS NOT NULL AND st.Cnt > 0 THEN st.Total ELSE ISNULL(fb.Total, 0) END AS DECIMAL(18,2)) ELSE 0 END) AS RokValue,
          SUM(CASE WHEN b.Tech = N'Bor' THEN CAST(CASE WHEN st.Cnt IS NOT NULL AND st.Cnt > 0 THEN st.Total ELSE ISNULL(fb.Total, 0) END AS DECIMAL(18,2)) ELSE 0 END) AS BorValue,
          SUM(CASE WHEN b.Tech = N'Tomaž' THEN CAST(CASE WHEN st.Cnt IS NOT NULL AND st.Cnt > 0 THEN st.Total ELSE ISNULL(fb.Total, 0) END AS DECIMAL(18,2)) ELSE 0 END) AS TomazValue,
          SUM(CASE WHEN b.Tech = N'Stane' THEN CAST(CASE WHEN st.Cnt IS NOT NULL AND st.Cnt > 0 THEN st.Total ELSE ISNULL(fb.Total, 0) END AS DECIMAL(18,2)) ELSE 0 END) AS StaneValue
        FROM Base b
        LEFT JOIN StrosekTot st ON st.DelovniNalogID = b.DelovniNalogID
        LEFT JOIN FallbackTot fb ON fb.DelovniNalogID = b.DelovniNalogID
        WHERE b.Tech IS NOT NULL
        GROUP BY b.Dan
        ORDER BY b.Dan;
      `);

    return res.json(r.recordset || []);
  } catch (e) {
    console.error('Napaka /api/analitika/tehnologi-kpi:', e);
    return res.status(500).json({ error: 'Napaka pri analitiki tehnologov', details: e && e.message ? e.message : String(e) });
  }
});

// ---- Analitika: KPI Produkti (dnevno + vrednost) ----
router.get('/api/analitika/produkti-kpi', async (req, res) => {
  try {
    const from = (req.query.from || '').toString();
    const to = (req.query.to || '').toString();
    if (!isValidDateStr(from) || !isValidDateStr(to)) {
      return res.status(400).json({ error: 'Manjka from/to (YYYY-MM-DD)' });
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const toExclusive = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1);

    await sql.connect(dbConfig);
    const cols = await getDelovniNalogCols();
    const dateCol = pickFirstCol(cols, ['DatumOdprtja', 'Datum', 'DatumNastanka', 'DatumUstvarjanja']);
    if (!dateCol) return res.status(500).json({ error: 'DelovniNalog: ni najden stolpec datuma (DatumOdprtja/Datum/...)' });

    const r = await new sql.Request()
      .input('from', sql.DateTime, fromDate)
      .input('to', sql.DateTime, toExclusive)
      .query(`
        WITH
        PredmetXml AS (
          SELECT DelovniNalogID, Pozicija, Predmet
          FROM dbo.DelovniNalogXML
          WHERE Pozicija IN (1, 2)
        ),
        PredmetPoz AS (
          SELECT DelovniNalogID, Pozicija, Predmet
          FROM dbo.DelovniNalogPozicija
          WHERE Pozicija IN (1, 2)
        ),
        StrosekTot AS (
          SELECT
            s.DelovniNalogID,
            COUNT(1) AS Cnt,
            SUM(ISNULL(s.Znesek, 0)) AS Total
          FROM dbo.DelovniNalogPozicijaStrosek s
          WHERE s.Pozicija IN (1, 2)
            AND s.Skupina IN (1, 2)
            AND s.Naziv IN (N'graficnaPriprava', N'cenaKlišeja', N'cenaIzsekovalnegaOrodja', N'cenaVzorca', N'cenaBrezDDV')
          GROUP BY s.DelovniNalogID
        ),
        FallbackTot AS (
          SELECT
            t.DelovniNalogID,
            SUM(ISNULL(t.GraficnaPriprava, 0) + ISNULL(t.CenaBrezDDV, 0)) AS Total
          FROM (
            SELECT DelovniNalogID, Pozicija, GraficnaPriprava, CenaBrezDDV
            FROM dbo.DelovniNalogPozicija
            WHERE Pozicija IN (1, 2)
            UNION ALL
            SELECT DelovniNalogID, Pozicija, GraficnaPriprava, CenaBrezDDV
            FROM dbo.DelovniNalogXML
            WHERE Pozicija IN (1, 2)
          ) t
          GROUP BY t.DelovniNalogID
        )
        SELECT
          CONVERT(date, dn.[${dateCol}]) AS Dan,
          COALESCE(x1.Predmet, p1.Predmet, N'') AS Predmet1,
          COALESCE(x2.Predmet, p2.Predmet, N'') AS Predmet2,
          CAST(
            CASE WHEN st.Cnt IS NOT NULL AND st.Cnt > 0 THEN st.Total ELSE ISNULL(fb.Total, 0) END
            AS DECIMAL(18,2)
          ) AS TotalValue
        FROM dbo.DelovniNalog dn
        LEFT JOIN PredmetXml x1 ON x1.DelovniNalogID = dn.DelovniNalogID AND x1.Pozicija = 1
        LEFT JOIN PredmetXml x2 ON x2.DelovniNalogID = dn.DelovniNalogID AND x2.Pozicija = 2
        LEFT JOIN PredmetPoz p1 ON p1.DelovniNalogID = dn.DelovniNalogID AND p1.Pozicija = 1
        LEFT JOIN PredmetPoz p2 ON p2.DelovniNalogID = dn.DelovniNalogID AND p2.Pozicija = 2
        LEFT JOIN StrosekTot st ON st.DelovniNalogID = dn.DelovniNalogID
        LEFT JOIN FallbackTot fb ON fb.DelovniNalogID = dn.DelovniNalogID
        WHERE dn.[${dateCol}] >= @from AND dn.[${dateCol}] < @to
        ORDER BY Dan;
      `);

    return res.json(r.recordset || []);
  } catch (e) {
    console.error('Napaka /api/analitika/produkti-kpi:', e);
    return res.status(500).json({ error: 'Napaka pri analitiki produktov', details: e && e.message ? e.message : String(e) });
  }
});

// ---- Analitika: KPI Reklamacije (po vrsti + vrednost) ----
router.get('/api/analitika/reklamacije-kpi', async (req, res) => {
  try {
    const from = (req.query.from || '').toString();
    const to = (req.query.to || '').toString();
    if (!isValidDateStr(from) || !isValidDateStr(to)) {
      return res.status(400).json({ error: 'Manjka from/to (YYYY-MM-DD)' });
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const toExclusive = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1);

    await sql.connect(dbConfig);

    // Če tabela ne obstaja, vrni prazno (da UI ne pada na starejših shemah)
    const tExists = await new sql.Request().query(`
      SELECT 1
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='DelovniNalogReklamacija'
    `);
    if (!tExists.recordset || tExists.recordset.length === 0) {
      return res.json({ byType: [], totalCount: 0, totalValue: 0 });
    }

    const r = await new sql.Request()
      .input('from', sql.DateTime, fromDate)
      .input('to', sql.DateTime, toExclusive)
      .query(`
        SELECT
          COALESCE(NULLIF(LTRIM(RTRIM(r.Vrsta)), ''), N'(neznano)') AS Vrsta,
          COUNT(1) AS StReklamacij,
          CAST(SUM(ISNULL(r.Znesek, 0)) AS DECIMAL(18,2)) AS SkupnaVrednost
        FROM dbo.DelovniNalogReklamacija r
        WHERE r.CreatedAt >= @from AND r.CreatedAt < @to
        GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(r.Vrsta)), ''), N'(neznano)')
        ORDER BY StReklamacij DESC, Vrsta
      `);
    const byType = r.recordset || [];
    const totalCount = byType.reduce((a, x) => a + Number(x.StReklamacij || 0), 0);
    const totalValue = byType.reduce((a, x) => a + Number(x.SkupnaVrednost || 0), 0);
    return res.json({ byType, totalCount, totalValue });
  } catch (e) {
    console.error('Napaka /api/analitika/reklamacije-kpi:', e);
    return res.status(500).json({ error: 'Napaka pri analitiki reklamacij', details: e && e.message ? e.message : String(e) });
  }
});

// ---- Analitika: KPI Kooperanti (tisk vs dodelava) ----
router.get('/api/analitika/kooperanti-kpi', async (req, res) => {
  try {
    const from = (req.query.from || '').toString();
    const to = (req.query.to || '').toString();
    if (!isValidDateStr(from) || !isValidDateStr(to)) {
      return res.status(400).json({ error: 'Manjka from/to (YYYY-MM-DD)' });
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const toExclusive = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1);

    await sql.connect(dbConfig);
    const cols = await getDelovniNalogCols();
    const dateCol = pickFirstCol(cols, ['DatumOdprtja', 'Datum', 'DatumNastanka', 'DatumUstvarjanja']);
    if (!dateCol) return res.status(500).json({ error: 'DelovniNalog: ni najden stolpec datuma (DatumOdprtja/Datum/...)' });

    // Top kooperanti (tisk): DelovniNalogPozicijaExt
    const tiskTopRes = await new sql.Request()
      .input('from', sql.DateTime, fromDate)
      .input('to', sql.DateTime, toExclusive)
      .query(`
        IF OBJECT_ID(N'dbo.DelovniNalogPozicijaExt', N'U') IS NULL
        BEGIN
          SELECT TOP 0 CAST(NULL AS nvarchar(200)) AS Kooperant, CAST(0 AS int) AS StVnosov, CAST(0 AS decimal(18,2)) AS Skupaj;
          RETURN;
        END
        SELECT TOP 10
          COALESCE(NULLIF(LTRIM(RTRIM(e.KooperantNaziv)), ''), N'(neznano)') AS Kooperant,
          COUNT(1) AS StVnosov,
          CAST(SUM(ISNULL(e.ZnesekKooperanta, 0)) AS DECIMAL(18,2)) AS Skupaj
        FROM dbo.DelovniNalog dn
        JOIN dbo.DelovniNalogPozicijaExt e ON e.DelovniNalogID = dn.DelovniNalogID
        WHERE dn.[${dateCol}] >= @from AND dn.[${dateCol}] < @to
          AND ISNULL(e.TiskaKooperant, 0) = 1
          AND e.KooperantNaziv IS NOT NULL
          AND ISNULL(e.ZnesekKooperanta, 0) > 0
        GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(e.KooperantNaziv)), ''), N'(neznano)')
        ORDER BY Skupaj DESC;
      `);

    // Top kooperanti (dodelava): DelovniNalogPozicijaKooperant
    const dodTopRes = await new sql.Request()
      .input('from', sql.DateTime, fromDate)
      .input('to', sql.DateTime, toExclusive)
      .query(`
        IF OBJECT_ID(N'dbo.DelovniNalogPozicijaKooperant', N'U') IS NULL
        BEGIN
          SELECT TOP 0 CAST(NULL AS nvarchar(255)) AS Kooperant, CAST(0 AS int) AS StVnosov, CAST(0 AS decimal(18,2)) AS Skupaj;
          RETURN;
        END
        SELECT TOP 10
          COALESCE(NULLIF(LTRIM(RTRIM(k.Ime)), ''), N'(neznano)') AS Kooperant,
          COUNT(1) AS StVnosov,
          CAST(SUM(ISNULL(k.Znesek, 0)) AS DECIMAL(18,2)) AS Skupaj
        FROM dbo.DelovniNalog dn
        JOIN dbo.DelovniNalogPozicijaKooperant k ON k.DelovniNalogID = dn.DelovniNalogID
        WHERE dn.[${dateCol}] >= @from AND dn.[${dateCol}] < @to
          AND k.Ime IS NOT NULL
          AND ISNULL(k.Znesek, 0) > 0
        GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(k.Ime)), ''), N'(neznano)')
        ORDER BY Skupaj DESC;
      `);

    // Dodelava po vrsti
    const dodVrstaRes = await new sql.Request()
      .input('from', sql.DateTime, fromDate)
      .input('to', sql.DateTime, toExclusive)
      .query(`
        IF OBJECT_ID(N'dbo.DelovniNalogPozicijaKooperant', N'U') IS NULL
        BEGIN
          SELECT TOP 0 CAST(NULL AS nvarchar(255)) AS Vrsta, CAST(0 AS int) AS StVnosov, CAST(0 AS decimal(18,2)) AS Skupaj;
          RETURN;
        END
        SELECT
          COALESCE(NULLIF(LTRIM(RTRIM(k.Vrsta)), ''), N'(neznano)') AS Vrsta,
          COUNT(1) AS StVnosov,
          CAST(SUM(ISNULL(k.Znesek, 0)) AS DECIMAL(18,2)) AS Skupaj
        FROM dbo.DelovniNalog dn
        JOIN dbo.DelovniNalogPozicijaKooperant k ON k.DelovniNalogID = dn.DelovniNalogID
        WHERE dn.[${dateCol}] >= @from AND dn.[${dateCol}] < @to
          AND ISNULL(k.Znesek, 0) > 0
        GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(k.Vrsta)), ''), N'(neznano)')
        ORDER BY Skupaj DESC, Vrsta;
      `);

    // Trend (dnevno): skupni stroški tisk vs dodelava
    const trendRes = await new sql.Request()
      .input('from', sql.DateTime, fromDate)
      .input('to', sql.DateTime, toExclusive)
      .query(`
        ;WITH Tisk AS (
          SELECT
            dn.DelovniNalogID,
            CONVERT(date, dn.[${dateCol}]) AS Dan,
            SUM(ISNULL(e.ZnesekKooperanta, 0)) AS TiskZnesek
          FROM dbo.DelovniNalog dn
          JOIN dbo.DelovniNalogPozicijaExt e ON e.DelovniNalogID = dn.DelovniNalogID
          WHERE dn.[${dateCol}] >= @from AND dn.[${dateCol}] < @to
            AND ISNULL(e.TiskaKooperant, 0) = 1
            AND ISNULL(e.ZnesekKooperanta, 0) > 0
          GROUP BY dn.DelovniNalogID, CONVERT(date, dn.[${dateCol}])
        ),
        Dod AS (
          SELECT
            dn.DelovniNalogID,
            CONVERT(date, dn.[${dateCol}]) AS Dan,
            SUM(ISNULL(k.Znesek, 0)) AS DodZnesek
          FROM dbo.DelovniNalog dn
          JOIN dbo.DelovniNalogPozicijaKooperant k ON k.DelovniNalogID = dn.DelovniNalogID
          WHERE dn.[${dateCol}] >= @from AND dn.[${dateCol}] < @to
            AND ISNULL(k.Znesek, 0) > 0
          GROUP BY dn.DelovniNalogID, CONVERT(date, dn.[${dateCol}])
        )
        SELECT
          d.Dan,
          CAST(SUM(ISNULL(t.TiskZnesek, 0)) AS DECIMAL(18,2)) AS TiskZnesek,
          CAST(SUM(ISNULL(o.DodZnesek, 0)) AS DECIMAL(18,2)) AS DodelavaZnesek
        FROM (
          SELECT Dan FROM Tisk
          UNION
          SELECT Dan FROM Dod
        ) d
        LEFT JOIN Tisk t ON t.Dan = d.Dan
        LEFT JOIN Dod o ON o.Dan = d.Dan
        GROUP BY d.Dan
        ORDER BY d.Dan;
      `);

    return res.json({
      tiskByKooperant: tiskTopRes.recordset || [],
      dodelavaByKooperant: dodTopRes.recordset || [],
      dodelavaByVrsta: dodVrstaRes.recordset || [],
      trend: trendRes.recordset || [],
    });
  } catch (e) {
    console.error('Napaka /api/analitika/kooperanti-kpi:', e);
    return res.status(500).json({ error: 'Napaka pri analitiki kooperantov', details: e && e.message ? e.message : String(e) });
  }
});

// ---- Analitika: Prihodki po kupcih (TOP 10 + trend) ----
router.get('/api/analitika/prihodki-kupci', async (req, res) => {
  try {
    const from = (req.query.from || '').toString();
    const to = (req.query.to || '').toString();
    if (!isValidDateStr(from) || !isValidDateStr(to)) {
      return res.status(400).json({ error: 'Manjka from/to (YYYY-MM-DD)' });
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const toExclusive = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1);

    await sql.connect(dbConfig);
    const cols = await getDelovniNalogCols();
    const dateCol = pickFirstCol(cols, ['DatumOdprtja', 'Datum', 'DatumNastanka', 'DatumUstvarjanja']);
    if (!dateCol) return res.status(500).json({ error: 'DelovniNalog: ni najden stolpec datuma (DatumOdprtja/Datum/...)' });

    // Total vrednost naloga: stroški, če obstajajo; sicer fallback iz Pozicija/XML (GraficnaPriprava + CenaBrezDDV)
    const topRes = await new sql.Request()
      .input('from', sql.DateTime, fromDate)
      .input('to', sql.DateTime, toExclusive)
      .query(`
        WITH StrosekTot AS (
          SELECT s.DelovniNalogID, COUNT(1) AS Cnt, SUM(ISNULL(s.Znesek,0)) AS Total
          FROM dbo.DelovniNalogPozicijaStrosek s
          WHERE s.Pozicija IN (1,2) AND s.Skupina IN (1,2)
            AND s.Naziv IN (N'graficnaPriprava', N'cenaKlišeja', N'cenaIzsekovalnegaOrodja', N'cenaVzorca', N'cenaBrezDDV')
          GROUP BY s.DelovniNalogID
        ),
        FallbackTot AS (
          SELECT t.DelovniNalogID, SUM(ISNULL(t.GraficnaPriprava,0) + ISNULL(t.CenaBrezDDV,0)) AS Total
          FROM (
            SELECT DelovniNalogID, Pozicija, GraficnaPriprava, CenaBrezDDV
            FROM dbo.DelovniNalogPozicija WHERE Pozicija IN (1,2)
            UNION ALL
            SELECT DelovniNalogID, Pozicija, GraficnaPriprava, CenaBrezDDV
            FROM dbo.DelovniNalogXML WHERE Pozicija IN (1,2)
          ) t
          GROUP BY t.DelovniNalogID
        ),
        PerJob AS (
          SELECT
            dn.DelovniNalogID,
            dn.KupecID,
            CAST(CASE WHEN st.Cnt IS NOT NULL AND st.Cnt > 0 THEN st.Total ELSE ISNULL(fb.Total,0) END AS DECIMAL(18,2)) AS TotalValue
          FROM dbo.DelovniNalog dn
          LEFT JOIN StrosekTot st ON st.DelovniNalogID = dn.DelovniNalogID
          LEFT JOIN FallbackTot fb ON fb.DelovniNalogID = dn.DelovniNalogID
          WHERE dn.[${dateCol}] >= @from AND dn.[${dateCol}] < @to
        )
        SELECT TOP 10
          p.KupecID,
          k.Naziv AS KupecNaziv,
          COUNT(1) AS StNalogov,
          CAST(SUM(p.TotalValue) AS DECIMAL(18,2)) AS Skupaj
        FROM PerJob p
        LEFT JOIN dbo.Kupec k ON k.KupecID = p.KupecID
        GROUP BY p.KupecID, k.Naziv
        ORDER BY Skupaj DESC;
      `);

    const dailyRes = await new sql.Request()
      .input('from', sql.DateTime, fromDate)
      .input('to', sql.DateTime, toExclusive)
      .query(`
        WITH StrosekTot AS (
          SELECT s.DelovniNalogID, COUNT(1) AS Cnt, SUM(ISNULL(s.Znesek,0)) AS Total
          FROM dbo.DelovniNalogPozicijaStrosek s
          WHERE s.Pozicija IN (1,2) AND s.Skupina IN (1,2)
            AND s.Naziv IN (N'graficnaPriprava', N'cenaKlišeja', N'cenaIzsekovalnegaOrodja', N'cenaVzorca', N'cenaBrezDDV')
          GROUP BY s.DelovniNalogID
        ),
        FallbackTot AS (
          SELECT t.DelovniNalogID, SUM(ISNULL(t.GraficnaPriprava,0) + ISNULL(t.CenaBrezDDV,0)) AS Total
          FROM (
            SELECT DelovniNalogID, Pozicija, GraficnaPriprava, CenaBrezDDV
            FROM dbo.DelovniNalogPozicija WHERE Pozicija IN (1,2)
            UNION ALL
            SELECT DelovniNalogID, Pozicija, GraficnaPriprava, CenaBrezDDV
            FROM dbo.DelovniNalogXML WHERE Pozicija IN (1,2)
          ) t
          GROUP BY t.DelovniNalogID
        ),
        PerJob AS (
          SELECT
            dn.DelovniNalogID,
            CONVERT(date, dn.[${dateCol}]) AS Dan,
            dn.KupecID,
            CAST(CASE WHEN st.Cnt IS NOT NULL AND st.Cnt > 0 THEN st.Total ELSE ISNULL(fb.Total,0) END AS DECIMAL(18,2)) AS TotalValue
          FROM dbo.DelovniNalog dn
          LEFT JOIN StrosekTot st ON st.DelovniNalogID = dn.DelovniNalogID
          LEFT JOIN FallbackTot fb ON fb.DelovniNalogID = dn.DelovniNalogID
          WHERE dn.[${dateCol}] >= @from AND dn.[${dateCol}] < @to
        ),
        TopKupci AS (
          SELECT TOP 10
            KupecID
          FROM PerJob
          GROUP BY KupecID
          ORDER BY SUM(TotalValue) DESC
        )
        SELECT
          p.Dan,
          p.KupecID,
          CAST(SUM(p.TotalValue) AS DECIMAL(18,2)) AS Skupaj
        FROM PerJob p
        JOIN TopKupci t ON t.KupecID = p.KupecID
        GROUP BY p.Dan, p.KupecID
        ORDER BY p.Dan;
      `);

    return res.json({ top: topRes.recordset || [], daily: dailyRes.recordset || [] });
  } catch (e) {
    console.error('Napaka /api/analitika/prihodki-kupci:', e);
    return res.status(500).json({ error: 'Napaka pri analitiki prihodkov po kupcih', details: e && e.message ? e.message : String(e) });
  }
});

// ---- Analitika: Povprečen čas od odprtja do dobave ----
router.get('/api/analitika/cas-dobave', async (req, res) => {
  try {
    const from = (req.query.from || '').toString();
    const to = (req.query.to || '').toString();
    if (!isValidDateStr(from) || !isValidDateStr(to)) {
      return res.status(400).json({ error: 'Manjka from/to (YYYY-MM-DD)' });
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const toExclusive = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1);

    await sql.connect(dbConfig);
    const cols = await getDelovniNalogCols();
    const dateCol = pickFirstCol(cols, ['DatumOdprtja', 'Datum', 'DatumNastanka', 'DatumUstvarjanja']);
    const rokCol = pickFirstCol(cols, ['RokIzdelave', 'Rok', 'RokDobave', 'RokIzdel']);
    if (!dateCol) return res.status(500).json({ error: 'DelovniNalog: ni najden stolpec datuma (DatumOdprtja/Datum/...)' });
    if (!rokCol) return res.status(500).json({ error: 'DelovniNalog: ni najden stolpec roka (RokIzdelave/...)' });

    const existsDod = await new sql.Request().query(`
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='DelovniNalogDodatno'
    `);
    if (!existsDod.recordset || existsDod.recordset.length === 0) {
      return res.json({ summary: null, daily: [] });
    }

    const summaryRes = await new sql.Request()
      .input('from', sql.DateTime, fromDate)
      .input('to', sql.DateTime, toExclusive)
      .query(`
        SELECT
          COUNT(1) AS StDobav,
          AVG(CAST(DATEDIFF(minute, dn.[${dateCol}], dd.DobavljenoAt) AS float)) AS AvgLeadMin,
          AVG(CAST(DATEDIFF(minute, dn.[${dateCol}], dn.[${rokCol}]) AS float)) AS AvgPlannedMin,
          AVG(CAST(DATEDIFF(minute, dn.[${rokCol}], dd.DobavljenoAt) AS float)) AS AvgVsDeadlineMin
        FROM dbo.DelovniNalog dn
        JOIN dbo.DelovniNalogDodatno dd ON dd.DelovniNalogID = dn.DelovniNalogID
        WHERE dn.[${dateCol}] >= @from AND dn.[${dateCol}] < @to
          AND dd.DobavljenoAt IS NOT NULL
      `);

    const dailyRes = await new sql.Request()
      .input('from', sql.DateTime, fromDate)
      .input('to', sql.DateTime, toExclusive)
      .query(`
        SELECT
          CONVERT(date, dn.[${dateCol}]) AS Dan,
          COUNT(1) AS StDobav,
          AVG(CAST(DATEDIFF(minute, dn.[${dateCol}], dd.DobavljenoAt) AS float)) AS AvgLeadMin,
          AVG(CAST(DATEDIFF(minute, dn.[${rokCol}], dd.DobavljenoAt) AS float)) AS AvgVsDeadlineMin
        FROM dbo.DelovniNalog dn
        JOIN dbo.DelovniNalogDodatno dd ON dd.DelovniNalogID = dn.DelovniNalogID
        WHERE dn.[${dateCol}] >= @from AND dn.[${dateCol}] < @to
          AND dd.DobavljenoAt IS NOT NULL
        GROUP BY CONVERT(date, dn.[${dateCol}])
        ORDER BY Dan;
      `);

    return res.json({
      summary: (summaryRes.recordset && summaryRes.recordset[0]) ? summaryRes.recordset[0] : null,
      daily: dailyRes.recordset || [],
    });
  } catch (e) {
    console.error('Napaka /api/analitika/cas-dobave:', e);
    return res.status(500).json({ error: 'Napaka pri analitiki časa dobave', details: e && e.message ? e.message : String(e) });
  }
});

  return router;
}

module.exports = { createAnalyticsRouter };
