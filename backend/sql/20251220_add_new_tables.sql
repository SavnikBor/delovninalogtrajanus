-- Uporabite DelovniNalog_TEST (če ni privzeto)
-- USE [DelovniNalog_TEST];

-- 1) Pošiljanje (1:1 z DelovniNalog)
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[DelovniNalogPosiljanje]') AND type = N'U')
BEGIN
	CREATE TABLE [dbo].[DelovniNalogPosiljanje](
		[DelovniNalogID] INT NOT NULL,
		[PosiljanjePoPosti] BIT NOT NULL CONSTRAINT DF_DNPosiljanje_PoPosti DEFAULT(0),
		[Naziv] NVARCHAR(200) NULL,
		[Naslov] NVARCHAR(200) NULL,
		[Kraj] NVARCHAR(100) NULL,
		[Posta] NVARCHAR(20) NULL,
		[OsebnoPrevzem] BIT NOT NULL CONSTRAINT DF_DNPosiljanje_Osebno DEFAULT(0),
		[DostavaNaLokacijo] BIT NOT NULL CONSTRAINT DF_DNPosiljanje_Dostava DEFAULT(0),
		[KontaktnaOseba] NVARCHAR(100) NULL,
		[Kontakt] NVARCHAR(255) NULL,
		[CreatedAt] DATETIME2 NOT NULL CONSTRAINT DF_DNPosiljanje_Created DEFAULT (SYSUTCDATETIME()),
		CONSTRAINT PK_DNPosiljanje PRIMARY KEY ([DelovniNalogID])
	);
	ALTER TABLE [dbo].[DelovniNalogPosiljanje]
	ADD CONSTRAINT FK_DNPosiljanje_DN FOREIGN KEY ([DelovniNalogID]) REFERENCES [dbo].[DelovniNalog]([DelovniNalogID]) ON DELETE CASCADE;
END
GO

-- 2) Razširjene informacije pozicije (kooperant, formati, orodje)
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[DelovniNalogPozicijaExt]') AND type = N'U')
BEGIN
	CREATE TABLE [dbo].[DelovniNalogPozicijaExt](
		[DelovniNalogID] INT NOT NULL,
		[Pozicija] INT NOT NULL,
		[B1Format] BIT NULL,
		[B2Format] BIT NULL,
		[TiskaKooperant] BIT NULL,
		[KooperantNaziv] NVARCHAR(200) NULL,
		[RokKooperanta] DATETIME NULL,
		[ZnesekKooperanta] DECIMAL(10,2) NULL,
		[StevilkaOrodja] NVARCHAR(50) NULL,
		[CreatedAt] DATETIME2 NOT NULL CONSTRAINT DF_DNPozExt_Created DEFAULT (SYSUTCDATETIME()),
		CONSTRAINT PK_DNPozExt PRIMARY KEY ([DelovniNalogID],[Pozicija])
	);
	ALTER TABLE [dbo].[DelovniNalogPozicijaExt]
	ADD CONSTRAINT FK_DNPozExt_DNPoz FOREIGN KEY ([DelovniNalogID]) REFERENCES [dbo].[DelovniNalog]([DelovniNalogID]) ON DELETE CASCADE;
END
GO

-- 3) Mutacije pozicije (več vnosov)
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[DelovniNalogPozicijaMutacija]') AND type = N'U')
BEGIN
	CREATE TABLE [dbo].[DelovniNalogPozicijaMutacija](
		[DelovniNalogID] INT NOT NULL,
		[Pozicija] INT NOT NULL,
		[Zaporedje] INT NOT NULL,
		[StPol] INT NULL,
		[CreatedAt] DATETIME2 NOT NULL CONSTRAINT DF_DNPozMut_Created DEFAULT (SYSUTCDATETIME()),
		CONSTRAINT PK_DNPozMut PRIMARY KEY ([DelovniNalogID],[Pozicija],[Zaporedje])
	);
	ALTER TABLE [dbo].[DelovniNalogPozicijaMutacija]
	ADD CONSTRAINT FK_DNPozMut_DNPoz FOREIGN KEY ([DelovniNalogID]) REFERENCES [dbo].[DelovniNalog]([DelovniNalogID]) ON DELETE CASCADE;
END
GO

-- 4) Dodelave na poziciji (1:1)
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[DelovniNalogPozicijaDodelava]') AND type = N'U')
BEGIN
	CREATE TABLE [dbo].[DelovniNalogPozicijaDodelava](
		[DelovniNalogID] INT NOT NULL,
		[Pozicija] INT NOT NULL,
		[Razrez] BIT NULL,
		[VPolah] BIT NULL,
		[Zgibanje] BIT NULL,
		[Biganje] BIT NULL,
		[Perforacija] BIT NULL,
		[BiganjeRocnoZgibanje] BIT NULL,
		[Lepljenje] BIT NULL,
		[LepljenjeMesta] NVARCHAR(50) NULL,
		[LepljenjeSirina] NVARCHAR(100) NULL,
		[LepljenjeBlokov] BIT NULL,
		[VrtanjeLuknje] BIT NULL,
		[VelikostLuknje] NVARCHAR(50) NULL,
		[UVTiskID] INT NULL,
		[UVLakID] INT NULL,
		[TopliTisk] NVARCHAR(50) NULL,
		[VezavaID] INT NULL,
		[IzsekZasekID] INT NULL,
		[PlastifikacijaID] INT NULL,
		[CreatedAt] DATETIME2 NOT NULL CONSTRAINT DF_DNPozDod_Created DEFAULT (SYSUTCDATETIME()),
		CONSTRAINT PK_DNPozDod PRIMARY KEY ([DelovniNalogID],[Pozicija])
	);
	ALTER TABLE [dbo].[DelovniNalogPozicijaDodelava]
	ADD CONSTRAINT FK_DNPozDod_DNPoz FOREIGN KEY ([DelovniNalogID]) REFERENCES [dbo].[DelovniNalog]([DelovniNalogID]) ON DELETE CASCADE;

	-- FK v slovarske tabele (če obstajajo)
	IF OBJECT_ID(N'[dbo].[UVTisk]', N'U') IS NOT NULL
		ALTER TABLE [dbo].[DelovniNalogPozicijaDodelava] WITH NOCHECK
		ADD CONSTRAINT FK_DNPozDod_UVTisk FOREIGN KEY ([UVTiskID]) REFERENCES [dbo].[UVTisk]([UVTiskID]);

	IF OBJECT_ID(N'[dbo].[3DUVLak]', N'U') IS NOT NULL
		ALTER TABLE [dbo].[DelovniNalogPozicijaDodelava] WITH NOCHECK
		ADD CONSTRAINT FK_DNPozDod_3DUVLak FOREIGN KEY ([UVLakID]) REFERENCES [dbo].[3DUVLak]([3DUVLakID]);

	IF OBJECT_ID(N'[dbo].[Vezava]', N'U') IS NOT NULL
		ALTER TABLE [dbo].[DelovniNalogPozicijaDodelava] WITH NOCHECK
		ADD CONSTRAINT FK_DNPozDod_Vezava FOREIGN KEY ([VezavaID]) REFERENCES [dbo].[Vezava]([VezavaID]);

	IF OBJECT_ID(N'[dbo].[IzsekZasek]', N'U') IS NOT NULL
		ALTER TABLE [dbo].[DelovniNalogPozicijaDodelava] WITH NOCHECK
		ADD CONSTRAINT FK_DNPozDod_IzsekZasek FOREIGN KEY ([IzsekZasekID]) REFERENCES [dbo].[IzsekZasek]([IzsekZasekID]);

	IF OBJECT_ID(N'[dbo].[Plastifikacija]', N'U') IS NOT NULL
		ALTER TABLE [dbo].[DelovniNalogPozicijaDodelava] WITH NOCHECK
		ADD CONSTRAINT FK_DNPozDod_Plastifikacija FOREIGN KEY ([PlastifikacijaID]) REFERENCES [dbo].[Plastifikacija]([PlastifikacijaID]);
END
GO

-- 5) Kooperanti na poziciji (več vnosov)
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[DelovniNalogPozicijaKooperant]') AND type = N'U')
BEGIN
	CREATE TABLE [dbo].[DelovniNalogPozicijaKooperant](
		[DelovniNalogID] INT NOT NULL,
		[Pozicija] INT NOT NULL,
		[Zaporedje] SMALLINT NOT NULL,
		[Ime] NVARCHAR(200) NULL,
		[PredvidenRok] DATETIME NULL,
		[Znesek] DECIMAL(10,2) NULL,
		[Vrsta] NVARCHAR(50) NULL,
		[CreatedAt] DATETIME2 NOT NULL CONSTRAINT DF_DNPozKoop_Created DEFAULT (SYSUTCDATETIME()),
		CONSTRAINT PK_DNPozKoop PRIMARY KEY ([DelovniNalogID],[Pozicija],[Zaporedje])
	);
	ALTER TABLE [dbo].[DelovniNalogPozicijaKooperant]
	ADD CONSTRAINT FK_DNPozKoop_DNPoz FOREIGN KEY ([DelovniNalogID]) REFERENCES [dbo].[DelovniNalog]([DelovniNalogID]) ON DELETE CASCADE;
END
GO

-- 6) Stroški na poziciji (fleksibilno, več vnosov)
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[DelovniNalogPozicijaStrosek]') AND type = N'U')
BEGIN
	CREATE TABLE [dbo].[DelovniNalogPozicijaStrosek](
		[DelovniNalogID] INT NOT NULL,
		[Pozicija] INT NOT NULL,
		[Skupina] TINYINT NOT NULL, -- 1 ali 2 (stroski1/stroski2)
		[Naziv] NVARCHAR(50) NOT NULL,
		[Znesek] DECIMAL(10,2) NULL,
		[CreatedAt] DATETIME2 NOT NULL CONSTRAINT DF_DNPozStr_Created DEFAULT (SYSUTCDATETIME()),
		CONSTRAINT PK_DNPozStr PRIMARY KEY ([DelovniNalogID],[Pozicija],[Skupina],[Naziv])
	);
	ALTER TABLE [dbo].[DelovniNalogPozicijaStrosek]
	ADD CONSTRAINT FK_DNPozStr_DNPoz FOREIGN KEY ([DelovniNalogID]) REFERENCES [dbo].[DelovniNalog]([DelovniNalogID]) ON DELETE CASCADE;
END
GO

-- 7) Material na poziciji (shranimo, če ne moremo mapirati na GramaturaMaterialID)
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[DelovniNalogPozicijaMaterial]') AND type = N'U')
BEGIN
	CREATE TABLE [dbo].[DelovniNalogPozicijaMaterial](
		[DelovniNalogID] INT NOT NULL,
		[Pozicija] INT NOT NULL,
		[RawText] NVARCHAR(200) NULL,
		[GramaturaMaterialID] INT NULL,
		[CreatedAt] DATETIME2 NOT NULL CONSTRAINT DF_DNPozMat_Created DEFAULT (SYSUTCDATETIME()),
		CONSTRAINT PK_DNPozMat PRIMARY KEY ([DelovniNalogID],[Pozicija])
	);
	ALTER TABLE [dbo].[DelovniNalogPozicijaMaterial]
	ADD CONSTRAINT FK_DNPozMat_DNPoz FOREIGN KEY ([DelovniNalogID]) REFERENCES [dbo].[DelovniNalog]([DelovniNalogID]) ON DELETE CASCADE;

	IF OBJECT_ID(N'[dbo].[GramaturaMaterial]', N'U') IS NOT NULL
		ALTER TABLE [dbo].[DelovniNalogPozicijaMaterial] WITH NOCHECK
		ADD CONSTRAINT FK_DNPozMat_GramMat FOREIGN KEY ([GramaturaMaterialID]) REFERENCES [dbo].[GramaturaMaterial]([GramaturaMaterialID]);
END
GO


