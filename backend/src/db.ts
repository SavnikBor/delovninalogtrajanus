import sql from 'mssql';
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config();

const config: sql.config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

export const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('Connected to MSSQL');
    return pool;
  })
  .catch(err => {
    console.error('Database Connection Failed! Bad Config: ', err);
    // Ne prekini celotne aplikacije — omogoči delovanje endpointov brez DB (npr. AI)
    // Klicatelji naj preverijo, ali je pool na voljo.
    return null as unknown as sql.ConnectionPool;
  });

export default sql; 