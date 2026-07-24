// seed_test.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('./.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) env[parts[0].trim()] = parts.slice(1).join('=').trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function main() {
  const { data: building, error: bErr } = await supabase
    .from('buildings')
    .insert([{
      name: 'مبنى اختبار تلقائي',
      address: 'شارع الملك فهد، الرياض',
      owner: 'شركة الاختبار المحدودة',
      phone: '0501234567',
      elevator_count: 1,
      google_maps_link: 'https://maps.google.com/?q=24.7136,46.6753',
      notes: 'تمت إضافته بواسطة سكريبت الاختبار التلقائي'
    }])
    .select();

  if (bErr) {
    console.error('Building insert error:', bErr);
    return;
  }
  console.log('Building inserted:', building[0]);

  const { data: elevator, error: eErr } = await supabase
    .from('elevators')
    .insert([{
      building_id: building[0].id,
      elevator_number: 999,
      brand: 'أوتيس (Otis)',
      model: 'Gen2',
      capacity: 800, // تم تصحيحها هنا وإزالة النص العربي لتتوافق مع قاعدة البيانات
      installation_year: 2024,
      status: 'نشط',
      last_maintenance_date: '2026-07-01',
      elevator_name: 'مصعد الاختبار الرئيسي',
      notes: 'مصعد تجريبي تم إنشاؤه بواسطة سكريبت الاختبار'
    }])
    .select();

  if (eErr) {
    console.error('Elevator insert error:', eErr);
    return;
  }
  console.log('Elevator inserted:', elevator[0]);

  const { data: fetchElevator, error: fErr } = await supabase
    .from('elevators')
    .select('*, buildings(name, address)')
    .eq('id', elevator[0].id);

  if (fErr) {
    console.error('Fetch error:', fErr);
    return;
  }
  console.log('Fetched with join:', fetchElevator[0]);
}

main();