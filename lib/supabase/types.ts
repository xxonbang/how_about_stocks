/**
 * Supabase 타입 정의
 */

// 메트릭 타입
export type MetricType = 'success' | 'error' | 'warning' | 'validation_failure' | 'consistency_check';

// 알림 타입
export type AlertType = 'consistency_failure' | 'error_rate_threshold' | 'validation_failure' | 'data_source_down' | 'api_key_invalid';

// 알림 심각도
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

// 메트릭 테이블 타입
export interface MetricRow {
  id: string;
  timestamp: string;
  symbol: string;
  data_source: string;
  metric_type: MetricType;
  message: string;
  metadata: Record<string, unknown>;
}

// 메트릭 삽입 타입
export interface MetricInsert {
  symbol: string;
  data_source: string;
  metric_type: MetricType;
  message: string;
  metadata?: Record<string, unknown>;
}

// 알림 테이블 타입
export interface AlertRow {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  data_source: string;
  symbol: string | null;
  timestamp: string;
  resolved: boolean;
  resolved_at: string | null;
  metadata: Record<string, unknown>;
}

// 알림 삽입 타입
export interface AlertInsert {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  data_source: string;
  symbol?: string | null;
  resolved?: boolean;
  metadata?: Record<string, unknown>;
}

// 분석 히스토리 테이블 타입
export interface AnalysisHistoryRow {
  id: string;
  request_id: string;
  stocks: string[];
  period: string;
  historical_period: string;
  analysis_date: string;
  indicators: Record<string, boolean>;
  results: Record<string, unknown>;
  data_source: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// 분석 히스토리 삽입 타입
export interface AnalysisHistoryInsert {
  request_id: string;
  stocks: string[];
  period: string;
  historical_period: string;
  analysis_date: string;
  indicators: Record<string, boolean>;
  results: Record<string, unknown>;
  data_source?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

// Supabase Database 타입
export interface Database {
  public: {
    Tables: {
      metrics: {
        Row: MetricRow;
        Insert: MetricInsert;
        Update: Partial<MetricInsert>;
      };
      alerts: {
        Row: AlertRow;
        Insert: AlertInsert;
        Update: Partial<AlertInsert & { resolved: boolean; resolved_at: string }>;
      };
      analysis_history: {
        Row: AnalysisHistoryRow;
        Insert: AnalysisHistoryInsert;
        Update: Partial<AnalysisHistoryInsert>;
      };
    };
  };
}
