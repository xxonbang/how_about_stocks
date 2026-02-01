/**
 * API Credentials 저장/조회 테스트
 *
 * 실행: node scripts/test-api-credentials.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// .env.local 수동 파싱
function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local');
  const content = readFileSync(envPath, 'utf-8');
  const env = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      env[key] = value;
    }
  }

  return env;
}

const envVars = loadEnv();

const supabaseUrl = envVars.SUPABASE_URL;
const supabaseServiceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// KIS 키 (.env.local에서 가져옴)
const KIS_APP_KEY = envVars.KIS_APP_KEY;
const KIS_APP_SECRET = envVars.KIS_APP_SECRET;

console.log('='.repeat(60));
console.log('Supabase API Credentials 테스트');
console.log('='.repeat(60));
console.log(`Supabase URL: ${supabaseUrl}`);
console.log('');

async function testApiCredentials() {
  try {
    // 1. 테이블 존재 확인
    console.log('📋 1. api_credentials 테이블 확인...');
    const { data: tables, error: tablesError } = await supabase
      .from('api_credentials')
      .select('id')
      .limit(1);

    if (tablesError) {
      if (tablesError.code === '42P01') {
        console.log('❌ api_credentials 테이블이 존재하지 않습니다.');
        console.log('   Supabase Dashboard > SQL Editor에서 다음 파일을 실행하세요:');
        console.log('   scripts/setup-api-credentials.sql');
        return false;
      }
      // RLS 에러일 수 있음 - 테이블은 존재
      if (tablesError.code === 'PGRST301') {
        console.log('⚠️  RLS 정책으로 인해 조회 실패 - 테이블은 존재할 수 있음');
      } else {
        throw tablesError;
      }
    }
    console.log('✅ 테이블 확인 완료');

    // 2. KIS API 키 저장
    console.log('');
    console.log('📝 2. KIS API 키 저장...');

    if (!KIS_APP_KEY || !KIS_APP_SECRET) {
      console.log('⚠️  KIS_APP_KEY 또는 KIS_APP_SECRET이 .env.local에 없습니다.');
      return false;
    }

    // app_key 저장
    const { error: keyError } = await supabase
      .from('api_credentials')
      .upsert({
        service_name: 'kis',
        credential_type: 'app_key',
        credential_value: KIS_APP_KEY,
        environment: 'production',
        description: '한국투자증권 앱 키',
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'service_name,credential_type,environment',
      });

    if (keyError) {
      console.error('❌ app_key 저장 실패:', keyError);
      return false;
    }
    console.log('✅ KIS app_key 저장 완료');

    // app_secret 저장
    const { error: secretError } = await supabase
      .from('api_credentials')
      .upsert({
        service_name: 'kis',
        credential_type: 'app_secret',
        credential_value: KIS_APP_SECRET,
        environment: 'production',
        description: '한국투자증권 앱 시크릿',
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'service_name,credential_type,environment',
      });

    if (secretError) {
      console.error('❌ app_secret 저장 실패:', secretError);
      return false;
    }
    console.log('✅ KIS app_secret 저장 완료');

    // 3. 저장된 키 조회
    console.log('');
    console.log('🔍 3. 저장된 KIS 키 조회...');

    const { data: credentials, error: queryError } = await supabase
      .from('api_credentials')
      .select('service_name, credential_type, credential_value, is_active, updated_at')
      .eq('service_name', 'kis')
      .eq('is_active', true);

    if (queryError) {
      console.error('❌ 조회 실패:', queryError);
      return false;
    }

    console.log('');
    console.log('📊 조회 결과:');
    console.log('-'.repeat(60));

    for (const cred of credentials) {
      const maskedValue = cred.credential_value.substring(0, 10) + '...' +
                          cred.credential_value.substring(cred.credential_value.length - 5);
      console.log(`  서비스: ${cred.service_name}`);
      console.log(`  타입: ${cred.credential_type}`);
      console.log(`  값: ${maskedValue}`);
      console.log(`  활성: ${cred.is_active}`);
      console.log(`  업데이트: ${cred.updated_at}`);
      console.log('-'.repeat(60));
    }

    // 4. 검증
    console.log('');
    console.log('✔️  4. 검증...');

    const appKey = credentials.find(c => c.credential_type === 'app_key');
    const appSecret = credentials.find(c => c.credential_type === 'app_secret');

    if (appKey?.credential_value === KIS_APP_KEY) {
      console.log('✅ app_key 검증 성공');
    } else {
      console.log('❌ app_key 검증 실패');
      return false;
    }

    if (appSecret?.credential_value === KIS_APP_SECRET) {
      console.log('✅ app_secret 검증 성공');
    } else {
      console.log('❌ app_secret 검증 실패');
      return false;
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('🎉 모든 테스트 통과!');
    console.log('='.repeat(60));
    return true;

  } catch (error) {
    console.error('❌ 테스트 실패:', error);
    return false;
  }
}

testApiCredentials().then(success => {
  process.exit(success ? 0 : 1);
});
