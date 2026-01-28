import postgres from 'postgres';
import { readFileSync } from 'fs';

// .env.local 파일 수동 파싱
const envFile = readFileSync('.env.local', 'utf-8');
envFile.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && !key.startsWith('#')) {
    process.env[key.trim()] = valueParts.join('=').trim();
  }
});

const databaseUrl = process.env.DATABASE_URL;

console.log('=== Drizzle ORM 연결 테스트 ===');
console.log('DATABASE_URL:', databaseUrl ? databaseUrl.substring(0, 40) + '...' : 'NOT SET');

if (!databaseUrl) {
  console.error('❌ DATABASE_URL이 설정되지 않았습니다.');
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

async function testDrizzle() {
  try {
    // 간단한 쿼리 테스트 (postgres.js 직접 사용)
    console.log('\n[1] 기본 연결 테스트...');
    const result = await sql`SELECT NOW() as current_time`;
    console.log('✅ 연결 성공! 서버 시간:', result[0].current_time);

    // 테이블 존재 확인
    console.log('\n[2] 테이블 확인...');
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('metrics', 'alerts', 'analysis_history')
    `;
    console.log('✅ 발견된 테이블:', tables.map(t => t.table_name).join(', '));

    // 레코드 수 확인
    console.log('\n[3] 레코드 수 확인...');
    const metricsCount = await sql`SELECT COUNT(*) as count FROM metrics`;
    const alertsCount = await sql`SELECT COUNT(*) as count FROM alerts`;
    const historyCount = await sql`SELECT COUNT(*) as count FROM analysis_history`;
    console.log('   - metrics:', metricsCount[0].count, '건');
    console.log('   - alerts:', alertsCount[0].count, '건');
    console.log('   - analysis_history:', historyCount[0].count, '건');

    console.log('\n=============================');
    console.log('🎉 Drizzle/PostgreSQL 연결 테스트 완료!');
    console.log('=============================');

    await sql.end();
  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
    await sql.end();
    process.exit(1);
  }
}

testDrizzle();
