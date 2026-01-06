-- Extend TEST schema with additional tables/columns for new app fields
-- Target DB: DelovniNalog_TEST (ensure your connection uses this DB)
-- Safe: Uses IF NOT EXISTS guards.

-- 1) Add optional e-mail and PosljiEmail flags to DelovniNalogPosiljanje (custom table from 20251220 script)
IF OBJECT_ID(N'[dbo].[DelovniNalogPosiljanje]', N'U') IS NOT NULL
BEGIN
	IF COL_LENGTH('dbo.DelovniNalogPosiljanje', 'Email') IS NULL
		ALTER TABLE [dbo].[DelovniNalogPosiljanje] ADD [Email] NVARCHAR(255) NULL;
	IF COL_LENGTH('dbo.DelovniNalogPosiljanje', 'PosljiEmail') IS NULL
		ALTER TABLE [dbo].[DelovniNalogPosiljanje] ADD [PosljiEmail] BIT NOT NULL CONSTRAINT DF_DNPosiljanje_Poslji DEFAULT(0);
END
GO

-- 2) Create DelovniNalogDodatno for header-level optional fields not present in base table
IF OBJECT_ID(N'[dbo].[DelovniNalogDodatno]', N'U') IS NULL
BEGIN
	CREATE TABLE [dbo].[DelovniNalogDodatno](
		[DelovniNalogID] INT NOT NULL,
		[Narocilnica] NVARCHAR(100) NULL,
		[KontaktEmail] NVARCHAR(255) NULL,
		[PosljiEmail] BIT NOT NULL CONSTRAINT DF_DNDodatno_Poslji DEFAULT(0),
		[Reklamacija] BIT NOT NULL CONSTRAINT DF_DNDodatno_Reklamacija DEFAULT(0),
		[OpisReklamacije] NVARCHAR(MAX) NULL,
		[CreatedAt] DATETIME2 NOT NULL CONSTRAINT DF_DNDodatno_Created DEFAULT (SYSUTCDATETIME()),
		CONSTRAINT PK_DN_Dodatno PRIMARY KEY ([DelovniNalogID]),
		CONSTRAINT FK_DN_Dodatno_DN FOREIGN KEY ([DelovniNalogID]) REFERENCES [dbo].[DelovniNalog]([DelovniNalogID]) ON DELETE CASCADE
	);
END
GO


