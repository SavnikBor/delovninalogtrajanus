-- ObstojeciKlise v DelovniNalogPozicijaDodelava (za topli tisk/reliefni/globoki)
IF OBJECT_ID(N'[dbo].[DelovniNalogPozicijaDodelava]', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.DelovniNalogPozicijaDodelava', 'ObstojeciKlise') IS NULL
    ALTER TABLE [dbo].[DelovniNalogPozicijaDodelava] ADD [ObstojeciKlise] BIT NOT NULL CONSTRAINT DF_DNPozDod_ObstojeciKlise DEFAULT(0);
END;

-- SkupnaCena v DelovniNalogDodatno (checkbox: cena obeh nalogov v enem polju)
IF OBJECT_ID(N'[dbo].[DelovniNalogDodatno]', N'U') IS NOT NULL
BEGIN
  IF COL_LENGTH('dbo.DelovniNalogDodatno', 'SkupnaCena') IS NULL
    ALTER TABLE [dbo].[DelovniNalogDodatno] ADD [SkupnaCena] BIT NOT NULL CONSTRAINT DF_DNDodatno_SkupnaCena DEFAULT(0);
END;
