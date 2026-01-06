-- Delno zaključevanje tiska (tisk 1 / tisk 2)
-- Dodaj stolpca na dbo.DelovniNalog (TEST ali PROD, odvisno katero bazo izvajaš).
-- Varno: uporablja IF COL_LENGTH guards.

IF OBJECT_ID(N'[dbo].[DelovniNalog]', N'U') IS NOT NULL
BEGIN
	IF COL_LENGTH('dbo.DelovniNalog','TiskZakljucen1') IS NULL
		ALTER TABLE [dbo].[DelovniNalog]
		ADD [TiskZakljucen1] BIT NOT NULL CONSTRAINT DF_DN_TiskZaklj1 DEFAULT(0);

	IF COL_LENGTH('dbo.DelovniNalog','TiskZakljucen2') IS NULL
		ALTER TABLE [dbo].[DelovniNalog]
		ADD [TiskZakljucen2] BIT NOT NULL CONSTRAINT DF_DN_TiskZaklj2 DEFAULT(0);
END

