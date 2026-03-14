-- Izsekovalna orodja (štance) - tabela v DelovniNalog_TEST
-- Uporabite DelovniNalog_TEST (če ni privzeto)
-- USE [DelovniNalog_TEST];

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[IzsekovalnoOrodje]') AND type = N'U')
BEGIN
    CREATE TABLE [dbo].[IzsekovalnoOrodje](
        [IzsekovalnoOrodjeID] INT IDENTITY(1,1) NOT NULL,
        [ZaporednaStevilka] INT NOT NULL,
        [StevilkaNaloga] INT NOT NULL,
        [Opis] NVARCHAR(500) NULL,
        [VelikostProdukta] NVARCHAR(200) NULL,
        [LetoIzdelave] INT NULL,
        [StrankaNaziv] NVARCHAR(255) NULL,
        [KupecID] INT NULL,
        [Komentar] NVARCHAR(500) NULL,
        [CreatedAt] DATETIME2 NOT NULL CONSTRAINT DF_IzsekovalnoOrodje_Created DEFAULT (SYSUTCDATETIME()),
        [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT DF_IzsekovalnoOrodje_Updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_IzsekovalnoOrodje PRIMARY KEY ([IzsekovalnoOrodjeID])
    );

    CREATE UNIQUE INDEX IX_IzsekovalnoOrodje_ZaporednaStevilka ON [dbo].[IzsekovalnoOrodje]([ZaporednaStevilka]);

    IF OBJECT_ID(N'[dbo].[Kupec]', N'U') IS NOT NULL
        ALTER TABLE [dbo].[IzsekovalnoOrodje] WITH NOCHECK
        ADD CONSTRAINT FK_IzsekovalnoOrodje_Kupec FOREIGN KEY ([KupecID]) REFERENCES [dbo].[Kupec]([KupecID]);
END
GO
