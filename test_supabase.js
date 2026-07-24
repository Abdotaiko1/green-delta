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

console.log('Supabase URL:', supabaseUrl);
console.log('Using Anon Key:', supabaseAnonKey ? 'Found' : 'Missing');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials in .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runTest() {
  console.log('\n--- starting Supabase DB test ---');
  let buildingId = null;
  let elevatorId = null;

  try {
    // 1. Test building insertion
    console.log('1. Inserting test building...');
    const testBuilding = {
      name: 'مبنى اختبار تلقائي',
      address: 'شارع الملك فهد، الرياض',
      owner: 'شركة الاختبار المحدودة',
      phone: '0501234567',
      elevator_count: 2,
      google_maps_link: 'https://maps.google.com/?q=24.7136,46.6753',
      notes: 'تمت إضافته بواسطة سكريبت الاختبار التلقائي'
    };

    const { data: bData, error: bError } = await supabase
      .from('buildings')
      .insert([testBuilding])
      .select();

    if (bError) {
      console.error('Building insert error:', bError);
      throw bError;
    }

    const insertedBuilding = bData[0];
    buildingId = insertedBuilding.id;
    console.log('Building inserted successfully! ID:', buildingId);
    console.log('Inserted data:', insertedBuilding);

    // 2. Test building fetch
    console.log('\n2. Fetching building list...');
    const { data: fetchBData, error: fetchBError } = await supabase
      .from('buildings')
      .select('*')
      .eq('id', buildingId);

    if (fetchBError) {
      console.error('Building fetch error:', fetchBError);
      throw fetchBError;
    }
    console.log('Fetched building count:', fetchBData.length);

    // 3. Test elevator insertion linked to buildingId
    console.log('\n3. Inserting test elevator...');
    const testElevator = {
      building_id: buildingId,
      elevator_number: 999,
      brand: 'أوتيس (Otis)',
      model: 'Gen2',
      capacity: '800 كجم (10 أشخاص)',
      installation_year: 2024,
      status: 'active',
      notes: 'مصعد تجريبي تم إنشاؤه بواسطة سكريبت الاختبار',
      elevator_name: 'مصعد الاختبار الرئيسي',
      last_maintenance_date: '2026-07-01'
    };

    const { data: eData, error: eError } = await supabase
      .from('elevators')
      .insert([testElevator])
      .select();

    if (eError) {
      console.error('Elevator insert error:', eError);
      throw eError;
    }

    const insertedElevator = eData[0];
    elevatorId = insertedElevator.id;
    console.log('Elevator inserted successfully! ID:', elevatorId);
    console.log('Inserted data:', insertedElevator);

    // 4. Test elevator fetch with building join (used in list views)
    console.log('\n4. Fetching elevators with building join...');
    const { data: fetchEData, error: fetchEError } = await supabase
      .from('elevators')
      .select('*, buildings(name, address)')
      .eq('id', elevatorId);

    if (fetchEError) {
      console.error('Elevator fetch with join error:', fetchEError);
      throw fetchEError;
    }
    console.log('Fetched elevator detailed data:', fetchEData[0]);

    console.log('\n--- All DB Insertion and Fetch tests passed successfully! ---');
  } catch (err) {
    console.error('\nTest failed with error:', err);
  } finally {
    // 5. Cleanup test data
    console.log('\n5. Cleaning up test data...');
    if (elevatorId) {
      const { error: delEError } = await supabase.from('elevators').delete().eq('id', elevatorId);
      if (delEError) console.error('Cleanup elevator error:', delEError);
      else console.log('Test elevator cleaned up successfully.');
    }
    if (buildingId) {
      const { error: delBError } = await supabase.from('buildings').delete().eq('id', buildingId);
      if (delBError) console.error('Cleanup building error:', delBError);
      else console.log('Test building cleaned up successfully.');
    }
    console.log('--- Cleanup complete. ---');
  }
}

runTest();
