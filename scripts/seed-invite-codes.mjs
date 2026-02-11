import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// .env.local 파일 수동 파싱
const envFile = readFileSync('.env.local', 'utf-8');
envFile.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && !key.startsWith('#')) {
    process.env[key.trim()] = valueParts.join('=').trim();
  }
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedInviteCodes() {
  console.log('=== 초대코드 시드 데이터 삽입 ===\n');

  const codes = [
    { code: 'xxonbang84', is_active: true },
  ];

  for (const codeData of codes) {
    const { data, error } = await supabase
      .from('invite_codes')
      .upsert(codeData, { onConflict: 'code' })
      .select();

    if (error) {
      console.error(`초대코드 '${codeData.code}' 삽입 실패:`, error.message);
    } else {
      console.log(`초대코드 '${codeData.code}' 삽입 완료:`, data[0]?.id);
    }
  }

  console.log('\n시드 데이터 삽입 완료');
}

seedInviteCodes();
