'use strict';

// MSSQL povezava (povzeto iz .env datoteke)
// Podpri več imen ključev za združljivost (DB_PASS/DB_PASSWORD, DB_SERVER/DB_HOST, DB_PORT)
// Podpri tudi named instance:
// - če je DB_SERVER v obliki "HOST\\INSTANCE", ga pusti pri miru (node-mssql/tedious zna to).
// - če imaš instanco posebej, uporabi DB_INSTANCE/DB_INSTANCE_NAME.

function buildDbConfig(dbName) {
  const rawServer = process.env.DB_SERVER || process.env.DB_HOST || 'localhost';
  const fromEnvInstance = process.env.DB_INSTANCE || process.env.DB_INSTANCE_NAME;
  // Pomembno: NE razbijaj "HOST\\INSTANCE", ker pri tebi to že deluje.
  const server = rawServer;
  const instanceName = rawServer.includes('\\') ? undefined : (fromEnvInstance || undefined);
  const options = { encrypt: false, trustServerCertificate: true };
  if (instanceName) options.instanceName = instanceName;
  return {
    user: process.env.DB_USER || process.env.DB_USERNAME,
    password: process.env.DB_PASS || process.env.DB_PASSWORD,
    server,
    database: dbName,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
    options,
    connectionTimeout: 5000,
    requestTimeout: 30000,
  };
}

module.exports = { buildDbConfig };
