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

console.log('=== Supabase 연결 테스트 ===');
console.log('URL:', supabaseUrl ? supabaseUrl.substring(0, 35) + '...' : 'NOT SET');
console.log('Service Role Key:', supabaseKey ? supabaseKey.substring(0, 20) + '...' : 'NOT SET');

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 환경변수가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  try {
    // 1. metrics 테이블 테스트
    console.log('\n[1] metrics 테이블 테스트...');
    const { error: metricsError } = await supabase
      .from('metrics')
      .select('id')
      .limit(1);

    if (metricsError) throw new Error('metrics: ' + metricsError.message);
    console.log('✅ metrics 테이블 접근 성공');

    // 2. alerts 테이블 테스트
    console.log('[2] alerts 테이블 테스트...');
    const { error: alertsError } = await supabase
      .from('alerts')
      .select('id')
      .limit(1);

    if (alertsError) throw new Error('alerts: ' + alertsError.message);
    console.log('✅ alerts 테이블 접근 성공');

    // 3. analysis_history 테이블 테스트
    console.log('[3] analysis_history 테이블 테스트...');
    const { error: historyError } = await supabase
      .from('analysis_history')
      .select('id')
      .limit(1);

    if (historyError) throw new Error('analysis_history: ' + historyError.message);
    console.log('✅ analysis_history 테이블 접근 성공');

    // 4. INSERT 테스트 (metrics)
    console.log('\n[4] metrics INSERT 테스트...');
    const testMetric = {
      symbol: 'TEST',
      data_source: 'connection_test',
      metric_type: 'success',
      message: 'Supabase 연결 테스트 성공',
      metadata: { test: true, timestamp: new Date().toISOString() }
    };

    const { data: insertData, error: insertError } = await supabase
      .from('metrics')
      .insert(testMetric)
      .select();

    if (insertError) throw new Error('INSERT: ' + insertError.message);
    console.log('✅ INSERT 성공:', insertData[0]?.id);

    // 5. 테스트 데이터 삭제
    console.log('[5] 테스트 데이터 정리...');
    const { error: deleteError } = await supabase
      .from('metrics')
      .delete()
      .eq('data_source', 'connection_test');

    if (deleteError) throw new Error('DELETE: ' + deleteError.message);
    console.log('✅ 테스트 데이터 삭제 완료');

    console.log('\n=============================');
    console.log('🎉 Supabase 연동 테스트 완료!');
    console.log('=============================');

  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
    process.exit(1);
  }
}

testConnection();
