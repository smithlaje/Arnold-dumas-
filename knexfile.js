require('dotenv').config();

const url = process.env.DATABASE_URL || '';
const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
const useSSL = process.env.DATABASE_SSL === 'true' ||
  (!isLocal && process.env.DATABASE_SSL !== 'false');

module.exports = {
  client: 'pg',
  connection: {
    connectionString: url,
    ssl: useSSL ? { rejectUnauthorized: false } : false
  },
  migrations: {
    directory: './db/migrations'
  },
  pool: { min: 0, max: 10 }
};
