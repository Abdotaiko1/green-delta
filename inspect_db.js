import pg from 'pg';
import fs from 'fs';

const envPath = './.env';
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const connectionString = env['SUPABASE_DB_URL'];

if (!connectionString) {
  console.error('Missing SUPABASE_DB_URL in .env');
  process.exit(1);
}

const client = new pg.Client({
  connectionString
});

async function main() {
  await client.connect();
  console.log('Connected to PostgreSQL database.');

  // Describe buildings table columns
  console.log('\n--- Columns of public.buildings ---');
  const bRes = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'buildings'
    ORDER BY ordinal_position;
  `);
  bRes.rows.forEach(row => {
    console.log(`${row.column_name}: ${row.data_type} (Nullable: ${row.is_nullable}, Default: ${row.column_default})`);
  });

  // Describe elevators table columns
  console.log('\n--- Columns of public.elevators ---');
  const eRes = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'elevators'
    ORDER BY ordinal_position;
  `);
  eRes.rows.forEach(row => {
    console.log(`${row.column_name}: ${row.data_type} (Nullable: ${row.is_nullable}, Default: ${row.column_default})`);
  });

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
