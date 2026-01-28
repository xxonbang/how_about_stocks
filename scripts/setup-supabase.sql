-- Supabase 테이블 설정 SQL
-- Supabase Dashboard의 SQL Editor에서 실행하세요.

-- 1. metrics 테이블 생성
CREATE TABLE IF NOT EXISTS metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  symbol VARCHAR(20) NOT NULL,
  data_source VARCHAR(100) NOT NULL,
  metric_type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'
);

-- metrics 인덱스
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_symbol ON metrics(symbol);
CREATE INDEX IF NOT EXISTS idx_metrics_data_source ON metrics(data_source);
CREATE INDEX IF NOT EXISTS idx_metrics_metric_type ON metrics(metric_type);

-- 2. alerts 테이블 생성
CREATE TABLE IF NOT EXISTS alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data_source VARCHAR(100) NOT NULL,
  symbol VARCHAR(20),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

-- alerts 인덱스
CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_alerts_data_source ON alerts(data_source);

-- 3. analysis_history 테이블 생성
CREATE TABLE IF NOT EXISTS analysis_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id VARCHAR(100) NOT NULL UNIQUE,
  stocks TEXT[] NOT NULL,
  period VARCHAR(10) NOT NULL,
  historical_period VARCHAR(10) NOT NULL,
  analysis_date DATE NOT NULL,
  indicators JSONB NOT NULL,
  results JSONB NOT NULL,
  data_source JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- analysis_history 인덱스
CREATE INDEX IF NOT EXISTS idx_analysis_history_created_at ON analysis_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_history_analysis_date ON analysis_history(analysis_date DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_history_stocks ON analysis_history USING GIN(stocks);
CREATE INDEX IF NOT EXISTS idx_analysis_history_request_id ON analysis_history(request_id);

-- 4. RLS (Row Level Security) 정책 설정
-- 모든 테이블에 RLS 활성화
ALTER TABLE metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_history ENABLE ROW LEVEL SECURITY;

-- Service Role은 모든 작업 허용 (기본 정책)
-- Anon Key는 읽기만 허용

-- 기존 정책 삭제 후 재생성 (멱등성 보장)
DROP POLICY IF EXISTS "Service role can do everything on metrics" ON metrics;
DROP POLICY IF EXISTS "Anon can read metrics" ON metrics;
DROP POLICY IF EXISTS "Service role can do everything on alerts" ON alerts;
DROP POLICY IF EXISTS "Anon can read alerts" ON alerts;
DROP POLICY IF EXISTS "Service role can do everything on analysis_history" ON analysis_history;
DROP POLICY IF EXISTS "Anon can read analysis_history" ON analysis_history;

-- metrics 정책
CREATE POLICY "Service role can do everything on metrics"
  ON metrics FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Anon can read metrics"
  ON metrics FOR SELECT
  USING (true);

-- alerts 정책
CREATE POLICY "Service role can do everything on alerts"
  ON alerts FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Anon can read alerts"
  ON alerts FOR SELECT
  USING (true);

-- analysis_history 정책
CREATE POLICY "Service role can do everything on analysis_history"
  ON analysis_history FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Anon can read analysis_history"
  ON analysis_history FOR SELECT
  USING (true);

-- 5. 데이터 보존 정책 (옵션)
-- 30일 이상 된 메트릭 자동 삭제 함수
CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS void AS $$
BEGIN
  DELETE FROM metrics WHERE timestamp < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- 90일 이상 된 해결된 알림 자동 삭제 함수
CREATE OR REPLACE FUNCTION cleanup_old_alerts()
RETURNS void AS $$
BEGIN
  DELETE FROM alerts WHERE resolved = TRUE AND resolved_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- 참고: 자동 정리를 위해 Supabase의 pg_cron 확장을 사용하거나
-- 외부에서 주기적으로 이 함수들을 호출할 수 있습니다.
-- 예: SELECT cron.schedule('cleanup-metrics', '0 0 * * *', 'SELECT cleanup_old_metrics()');

-- 완료 메시지
DO $$
BEGIN
  RAISE NOTICE 'Supabase tables created successfully!';
  RAISE NOTICE 'Tables: metrics, alerts, analysis_history';
  RAISE NOTICE 'RLS policies applied for service_role and anon access.';
END $$;
