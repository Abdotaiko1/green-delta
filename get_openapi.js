import fetch from 'node-fetch';
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

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseAnonKey = env['VITE_SUPABASE_ANON_KEY'];

async function main() {
  const url = `${supabaseUrl}/rest/v1/`;
  console.log('Fetching OpenAPI schema from:', url);
  const response = await fetch(url, {
    headers: {
      'apikey': supabaseAnonKey
    }
  });

  const schema = await response.json();
  const elevatorsPath = schema.paths['/elevators'];
  const elevatorsPostParams = elevatorsPath.post.parameters[0].schema.properties;
  console.log('\n--- Elevators Table Properties in OpenAPI ---');
  for (const [key, val] of Object.entries(elevatorsPostParams)) {
    console.log(`${key}: type=${val.type}, format=${val.format || 'none'}, description=${val.description || 'none'}`);
  }
}

main().catch(err => console.error(err));
