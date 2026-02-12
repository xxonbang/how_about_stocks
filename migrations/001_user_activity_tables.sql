-- user_history: 사용자별 마지막 접속 시각 (시스템당 1행, upsert)
CREATE TABLE IF NOT EXISTS user_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  email text NOT NULL DEFAULT '',
  system_name varchar(50) NOT NULL,
  accessed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, system_name)
);

-- user_activity_log: 상세 활동 로그 (append-only)
CREATE TABLE IF NOT EXISTS user_activity_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  email text NOT NULL DEFAULT '',
  system_name varchar(50) NOT NULL,
  action_type varchar(50) NOT NULL,
  action_detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_system ON user_activity_log(user_id, system_name);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON user_activity_log(created_at DESC);
