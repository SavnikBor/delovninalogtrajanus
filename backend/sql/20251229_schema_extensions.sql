-- Razširitve TEST sheme (DelovniNalog_TEST)
-- A) DelovniNalogPozicijaKooperant – dodaj manjkajoče stolpce
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
END
ELSE
BEGIN
	IF COL_LENGTH('dbo.DelovniNalogPozicijaKooperant','Pozicija') IS NULL
		ALTER TABLE [dbo].[DelovniNalogPozicijaKooperant] ADD [Pozicija] INT NOT NULL CONSTRAINT DF_DNKoop_Pozicija DEFAULT 1;
	IF COL_LENGTH('dbo.DelovniNalogPozicijaKooperant','Zaporedje') IS NULL
		ALTER TABLE [dbo].[DelovniNalogPozicijaKooperant] ADD [Zaporedje] TINYINT NOT NULL CONSTRAINT DF_DNKoop_Zaporedje DEFAULT 1;
	IF COL_LENGTH('dbo.DelovniNalogPozicijaKooperant','Ime') IS NULL
		ALTER TABLE [dbo].[DelovniNalogPozicijaKooperant] ADD [Ime] NVARCHAR(255) NULL;
	IF COL_LENGTH('dbo.DelovniNalogPozicijaKooperant','PredvidenRok') IS NULL
		ALTER TABLE [dbo].[DelovniNalogPozicijaKooperant] ADD [PredvidenRok] DATE NULL;
	IF COL_LENGTH('dbo.DelovniNalogPozicijaKooperant','Znesek') IS NULL
		ALTER TABLE [dbo].[DelovniNalogPozicijaKooperant] ADD [Znesek] DECIMAL(18,2) NULL;
	IF COL_LENGTH('dbo.DelovniNalogPozicijaKooperant','Vrsta') IS NULL
		ALTER TABLE [dbo].[DelovniNalogPozicijaKooperant] ADD [Vrsta] NVARCHAR(255) NULL;
	IF COL_LENGTH('dbo.DelovniNalogPozicijaKooperant','CreatedAt') IS NULL
		ALTER TABLE [dbo].[DelovniNalogPozicijaKooperant] ADD [CreatedAt] DATETIME2 NOT NULL CONSTRAINT DF_DNKoop_CreatedAt DEFAULT SYSDATETIME();
	-- FK na DelovniNalog
	IF NOT EXISTS (
		SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_DNKoop_DN' AND parent_object_id = OBJECT_ID('dbo.DelovniNalogPozicijaKooperant')
	)
		ALTER TABLE [dbo].[DelovniNalogPozicijaKooperant]
		ADD CONSTRAINT FK_DNKoop_DN FOREIGN KEY ([DelovniNalogID]) REFERENCES [dbo].[DelovniNalog]([DelovniNalogID]);
END

-- B) DelovniNalogPozicija – dodaj B1Format, B2Format (BIT NOT NULL DEFAULT 0), če manjkajo
IF OBJECT_ID(N'[dbo].[DelovniNalogPozicija]', N'U') IS NOT NULL
BEGIN
	IF COL_LENGTH('dbo.DelovniNalogPozicija','B1Format') IS NULL
		ALTER TABLE [dbo].[DelovniNalogPozicija] ADD [B1Format] BIT NOT NULL CONSTRAINT DF_DNPoz_B1 DEFAULT 0;
	IF COL_LENGTH('dbo.DelovniNalogPozicija','B2Format') IS NULL
		ALTER TABLE [dbo].[DelovniNalogPozicija] ADD [B2Format] BIT NOT NULL CONSTRAINT DF_DNPoz_B2 DEFAULT 0;
END

-- C) Reklamacija – nova tabela
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
END

