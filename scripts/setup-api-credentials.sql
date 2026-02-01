-- API 키 공유 테이블 설정 SQL
-- Supabase Dashboard의 SQL Editor에서 실행하세요.

-- 1. api_credentials 테이블 생성
CREATE TABLE IF NOT EXISTS api_credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_name VARCHAR(50) NOT NULL,        -- kis, finnhub, fmp, twelvedata, gemini
  credential_type VARCHAR(50) NOT NULL,     -- app_key, app_secret, api_key, account_no
  credential_value TEXT NOT NULL,           -- 암호화된 값 또는 평문
  environment VARCHAR(20) DEFAULT 'production', -- production, development, test
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,                   -- API 키 만료일 (선택)
  metadata JSONB DEFAULT '{}',

  UNIQUE(service_name, credential_type, environment)
);

-- 2. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_api_credentials_service ON api_credentials(service_name);
CREATE INDEX IF NOT EXISTS idx_api_credentials_active ON api_credentials(is_active);
CREATE INDEX IF NOT EXISTS idx_api_credentials_env ON api_credentials(environment);

-- 3. RLS 정책 설정
ALTER TABLE api_credentials ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 (멱등성 보장)
DROP POLICY IF EXISTS "Service role only on api_credentials" ON api_credentials;

-- Service Role만 접근 가능 (보안 강화)
CREATE POLICY "Service role only on api_credentials"
  ON api_credentials FOR ALL
  USING (auth.role() = 'service_role');

-- 4. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_api_credentials_updated_at ON api_credentials;

CREATE TRIGGER update_api_credentials_updated_at
  BEFORE UPDATE ON api_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 5. API 키 조회 함수 (편의 기능)
CREATE OR REPLACE FUNCTION get_api_credential(
  p_service_name VARCHAR,
  p_credential_type VARCHAR,
  p_environment VARCHAR DEFAULT 'production'
)
RETURNS TEXT AS $$
DECLARE
  v_value TEXT;
BEGIN
  SELECT credential_value INTO v_value
  FROM api_credentials
  WHERE service_name = p_service_name
    AND credential_type = p_credential_type
    AND environment = p_environment
    AND is_active = true;

  RETURN v_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. 완료 메시지
DO $$
BEGIN
  RAISE NOTICE 'api_credentials table created successfully!';
  RAISE NOTICE 'RLS policy: Service Role only (secure)';
  RAISE NOTICE 'Function: get_api_credential(service, type, env) available';
END $$;

-- ============================================
-- 아래는 실제 API 키 저장 예시 (주석 처리)
-- 실행 전 실제 값으로 교체하세요
-- ============================================

/*
-- KIS API 키 저장
INSERT INTO api_credentials (service_name, credential_type, credential_value, description)
VALUES
  ('kis', 'app_key', 'YOUR_KIS_APP_KEY', '한국투자증권 앱 키'),
  ('kis', 'app_secret', 'YOUR_KIS_APP_SECRET', '한국투자증권 앱 시크릿'),
  ('kis', 'account_no', 'YOUR_ACCOUNT_NO', '한국투자증권 계좌번호')
ON CONFLICT (service_name, credential_type, environment)
DO UPDATE SET
  credential_value = EXCLUDED.credential_value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Finnhub API 키
INSERT INTO api_credentials (service_name, credential_type, credential_value, description)
VALUES ('finnhub', 'api_key', 'YOUR_FINNHUB_KEY', 'Finnhub API 키')
ON CONFLICT (service_name, credential_type, environment)
DO UPDATE SET credential_value = EXCLUDED.credential_value, updated_at = NOW();

-- Twelve Data API 키
INSERT INTO api_credentials (service_name, credential_type, credential_value, description)
VALUES ('twelvedata', 'api_key', 'YOUR_TWELVEDATA_KEY', 'Twelve Data API 키')
ON CONFLICT (service_name, credential_type, environment)
DO UPDATE SET credential_value = EXCLUDED.credential_value, updated_at = NOW();

-- Gemini API 키 (다중)
INSERT INTO api_credentials (service_name, credential_type, credential_value, description, metadata)
VALUES
  ('gemini', 'api_key_1', 'YOUR_GEMINI_KEY_1', 'Google Gemini API 키 1', '{"priority": 1}'),
  ('gemini', 'api_key_2', 'YOUR_GEMINI_KEY_2', 'Google Gemini API 키 2 (Fallback)', '{"priority": 2}')
ON CONFLICT (service_name, credential_type, environment)
DO UPDATE SET credential_value = EXCLUDED.credential_value, updated_at = NOW();
*/

-- 저장된 API 키 확인
-- SELECT service_name, credential_type, is_active, updated_at FROM api_credentials ORDER BY service_name;
