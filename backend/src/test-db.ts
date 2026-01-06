import sql from 'mssql';

const config: sql.config = {
  user: 'sa',
  password: 'FormatBManjOdA4.25',
  server: 'trajsrv25',
  database: 'DelovniNalog',
  port: 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function testConnection() {
  try {
    const pool = await sql.connect(config);
    console.log('✅ Povezava uspešna');
    await pool.close();
  } catch (err) {
    console.error('❌ Napaka pri povezavi:', err);
  }
}

testConnection();
