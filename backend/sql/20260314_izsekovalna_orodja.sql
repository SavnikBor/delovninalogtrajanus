-- Uporabite DelovniNalog_TEST (če ni privzeto)
-- USE [DelovniNalog_TEST];

IF OBJECT_ID(N'[dbo].[IzsekovalnoOrodje]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[IzsekovalnoOrodje] (
    [OrodjeID] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_IzsekovalnoOrodje] PRIMARY KEY,
    [ZaporednaStevilka] INT NOT NULL,
    [StevilkaNaloga] INT NULL,
    [Opis] NVARCHAR(500) NULL,
    [VelikostKoncnegaProdukta] NVARCHAR(100) NULL,
    [LetoIzdelave] INT NULL,
    [KupecID] INT NULL,
    [StrankaNaziv] NVARCHAR(255) NULL,
    [Komentar] NVARCHAR(MAX) NULL,
    [CreatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_IzsekovalnoOrodje_CreatedAt] DEFAULT (SYSUTCDATETIME()),
    [UpdatedAt] DATETIME2 NULL
  );
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'UX_IzsekovalnoOrodje_Zaporedna'
    AND object_id = OBJECT_ID(N'[dbo].[IzsekovalnoOrodje]')
)
BEGIN
  CREATE UNIQUE INDEX [UX_IzsekovalnoOrodje_Zaporedna]
  ON [dbo].[IzsekovalnoOrodje]([ZaporednaStevilka]);
END
GO

