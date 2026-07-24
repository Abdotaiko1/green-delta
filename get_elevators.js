import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read env variables manually
const envPath = './.env';
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseAnonKey = env['VITE_SUPABASE_ANON_KEY'];

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log('Fetching elevator schema...');
  // We fetch a single row to see its structure
  const { data, error } = await supabase.from('elevators').select('*').limit(1);
  if (error) {
    console.error('Fetch error:', error);
  } else {
    console.log('Elevators table columns:', data.length > 0 ? Object.keys(data[0]) : 'No data found');
    console.log('Sample row:', data[0]);
  }

  console.log('Fetching building schema...');
  const { data: bData, error: bError } = await supabase.from('buildings').select('*').limit(1);
  if (bError) {
    console.error('Fetch error:', bError);
  } else {
    console.log('Buildings table columns:', bData.length > 0 ? Object.keys(bData[0]) : 'No data found');
    console.log('Sample row:', bData[0]);
  }
}

main();
