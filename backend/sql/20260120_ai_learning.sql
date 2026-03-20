-- AI learning schema (A+B) for DelovniNalog_TEST
-- Creates:
-- - dbo.AiEmailParseRun
-- - dbo.AiEmailTrainingExample
-- - dbo.AiCustomerProfile

IF OBJECT_ID(N'[dbo].[AiEmailParseRun]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[AiEmailParseRun](
    [AiRunID] BIGINT IDENTITY(1,1) NOT NULL,
    [CreatedAt] DATETIME2 NOT NULL CONSTRAINT DF_AiRun_Created DEFAULT (SYSUTCDATETIME()),
    [PromptVersion] NVARCHAR(32) NULL,
    [Model] NVARCHAR(64) NULL,
    [EmailHash] NVARCHAR(64) NULL,
    [CleanEmail] NVARCHAR(MAX) NOT NULL,
    [AiOutputJson] NVARCHAR(MAX) NOT NULL,
    [KupecID] INT NULL,
    [KupecNaziv] NVARCHAR(255) NULL,
    [DelovniNalogID] INT NULL,
    [FinalizedAt] DATETIME2 NULL,
    CONSTRAINT PK_AiEmailParseRun PRIMARY KEY ([AiRunID])
  );
  CREATE INDEX IX_AiRun_KupecID ON dbo.AiEmailParseRun(KupecID);
  CREATE INDEX IX_AiRun_DelovniNalogID ON dbo.AiEmailParseRun(DelovniNalogID);
  CREATE INDEX IX_AiRun_EmailHash ON dbo.AiEmailParseRun(EmailHash);
END
GO

IF OBJECT_ID(N'[dbo].[AiEmailTrainingExample]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[AiEmailTrainingExample](
    [ExampleID] BIGINT IDENTITY(1,1) NOT NULL,
    [AiRunID] BIGINT NOT NULL,
    [CreatedAt] DATETIME2 NOT NULL CONSTRAINT DF_AiEx_Created DEFAULT (SYSUTCDATETIME()),
    [KupecID] INT NULL,
    [DelovniNalogID] INT NOT NULL,
    [FinalJson] NVARCHAR(MAX) NOT NULL,
    [DiffJson] NVARCHAR(MAX) NOT NULL,
    CONSTRAINT PK_AiEmailTrainingExample PRIMARY KEY ([ExampleID]),
    CONSTRAINT FK_AiEx_Run FOREIGN KEY ([AiRunID]) REFERENCES dbo.AiEmailParseRun([AiRunID])
  );
  CREATE INDEX IX_AiEx_KupecID ON dbo.AiEmailTrainingExample(KupecID);
  CREATE INDEX IX_AiEx_DelovniNalogID ON dbo.AiEmailTrainingExample(DelovniNalogID);
END
GO

IF OBJECT_ID(N'[dbo].[AiCustomerProfile]', N'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[AiCustomerProfile](
    [KupecID] INT NOT NULL,
    [UpdatedAt] DATETIME2 NOT NULL CONSTRAINT DF_AiProf_Updated DEFAULT (SYSUTCDATETIME()),
    [SourceCount] INT NOT NULL CONSTRAINT DF_AiProf_Count DEFAULT(0),
    [ProfileJson] NVARCHAR(MAX) NOT NULL,
    CONSTRAINT PK_AiCustomerProfile PRIMARY KEY ([KupecID])
  );
END
GO

