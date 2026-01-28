/**
 * 데이터 품질 메트릭 수집 시스템
 *
 * 데이터 수집 과정에서 발생하는 메트릭을 수집하고 분석
 * Supabase 연동으로 메트릭 영속화 지원
 */

import type { MetricInsert, MetricType } from './supabase/types';

interface DataQualityMetric {
  timestamp: number;
  symbol: string;
  dataSource: string;
  metricType: 'success' | 'error' | 'warning' | 'validation_failure' | 'consistency_check';
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

/**
 * Supabase에 메트릭 저장 (비동기, 비블로킹)
 */
async function saveMetricToSupabase(metric: DataQualityMetric): Promise<void> {
  try {
    // 동적 import로 서버 전용 모듈 로드
    const { supabaseServer, isSupabaseServerEnabled } = await import('./supabase/server');

    if (!isSupabaseServerEnabled() || !supabaseServer) {
      return; // Supabase 미설정 시 건너뜀
    }

    const metricInsert: MetricInsert = {
      symbol: metric.symbol,
      data_source: metric.dataSource,
      metric_type: metric.metricType as MetricType,
      message: metric.message,
      metadata: metric.metadata || {},
    };

    const { error } = await supabaseServer.from('metrics').insert(metricInsert);

    if (error) {
      console.error('[Metrics] Supabase save failed:', error.message);
    }
  } catch (err) {
    // Supabase 저장 실패해도 인메모리 로직은 계속 진행
    console.error('[Metrics] Supabase save error:', err instanceof Error ? err.message : err);
  }
}

export interface DataSourceMetrics {
  source: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  warningCount: number;
  averageResponseTime: number;
  lastSuccessTime?: number;
  lastErrorTime?: number;
}

class MetricsCollector {
  private metrics: DataQualityMetric[] = [];
  private maxMetrics = 1000; // 최대 저장 메트릭 수

  /**
   * 메트릭 추가
   */
  addMetric(metric: Omit<DataQualityMetric, 'timestamp'>): void {
    const fullMetric: DataQualityMetric = {
      ...metric,
      timestamp: Date.now(),
    };

    this.metrics.push(fullMetric);

    // 최대 개수 초과 시 오래된 메트릭 제거
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // 콘솔 로깅 (개발 환경)
    if (process.env.NODE_ENV === 'development') {
      const logLevel = metric.metricType === 'error' ? 'error' : metric.metricType === 'warning' ? 'warn' : 'log';
      console[logLevel](`[Metrics] ${metric.metricType}: ${metric.symbol} (${metric.dataSource}) - ${metric.message}`);
    }

    // Supabase 비동기 저장 (비블로킹)
    if (typeof window === 'undefined') {
      saveMetricToSupabase(fullMetric).catch(() => {
        // 이미 함수 내부에서 에러 로깅하므로 여기서는 무시
      });
    }
  }

  /**
   * 성공 메트릭 추가
   */
  recordSuccess(symbol: string, dataSource: string, responseTime?: number, metadata?: Record<string, any>): void {
    this.addMetric({
      symbol,
      dataSource,
      metricType: 'success',
      message: `Data fetched successfully${responseTime ? ` (${responseTime}ms)` : ''}`,
      metadata: {
        ...metadata,
        responseTime,
      },
    });
  }

  /**
   * 오류 메트릭 추가
   */
  recordError(symbol: string, dataSource: string, error: Error | string, metadata?: Record<string, any>): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.addMetric({
      symbol,
      dataSource,
      metricType: 'error',
      message: errorMessage,
      metadata,
    });
  }

  /**
   * 경고 메트릭 추가
   */
  recordWarning(symbol: string, dataSource: string, message: string, metadata?: Record<string, any>): void {
    this.addMetric({
      symbol,
      dataSource,
      metricType: 'warning',
      message,
      metadata,
    });
  }

  /**
   * 검증 실패 메트릭 추가
   */
  recordValidationFailure(symbol: string, dataSource: string, field: string, value: any, reason: string): void {
    this.addMetric({
      symbol,
      dataSource,
      metricType: 'validation_failure',
      message: `Validation failed for ${field}: ${reason}`,
      metadata: {
        field,
        value,
        reason,
      },
    });
  }

  /**
   * 정합성 검사 메트릭 추가
   */
  recordConsistencyCheck(
    symbol: string,
    dataSource: string,
    warnings: string[],
    errors: string[],
    metadata?: Record<string, any>
  ): void {
    if (warnings.length > 0 || errors.length > 0) {
      this.addMetric({
        symbol,
        dataSource,
        metricType: 'consistency_check',
        message: `${errors.length} error(s), ${warnings.length} warning(s)`,
        metadata: {
          warnings,
          errors,
          ...metadata,
        },
      });
    }
  }

  /**
   * 데이터 소스별 메트릭 집계
   */
  getDataSourceMetrics(source?: string): DataSourceMetrics[] {
    const filtered = source
      ? this.metrics.filter((m) => m.dataSource === source)
      : this.metrics;

    const sourceMap = new Map<string, DataSourceMetrics>();

    filtered.forEach((metric) => {
      if (!sourceMap.has(metric.dataSource)) {
        sourceMap.set(metric.dataSource, {
          source: metric.dataSource,
          totalRequests: 0,
          successCount: 0,
          errorCount: 0,
          warningCount: 0,
          averageResponseTime: 0,
        });
      }

      const stats = sourceMap.get(metric.dataSource)!;
      stats.totalRequests++;

      switch (metric.metricType) {
        case 'success':
          stats.successCount++;
          if (metric.metadata?.responseTime) {
            const currentAvg = stats.averageResponseTime;
            const count = stats.successCount;
            stats.averageResponseTime = (currentAvg * (count - 1) + metric.metadata.responseTime) / count;
          }
          stats.lastSuccessTime = metric.timestamp;
          break;
        case 'error':
          stats.errorCount++;
          stats.lastErrorTime = metric.timestamp;
          break;
        case 'warning':
        case 'validation_failure':
        case 'consistency_check':
          stats.warningCount++;
          break;
      }
    });

    return Array.from(sourceMap.values());
  }

  /**
   * 최근 메트릭 조회
   */
  getRecentMetrics(limit: number = 50): DataQualityMetric[] {
    return this.metrics.slice(-limit);
  }

  /**
   * 특정 심볼의 메트릭 조회
   */
  getSymbolMetrics(symbol: string): DataQualityMetric[] {
    return this.metrics.filter((m) => m.symbol === symbol);
  }

  /**
   * 메트릭 초기화
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * 전체 메트릭 조회
   */
  getAllMetrics(): DataQualityMetric[] {
    return [...this.metrics];
  }
}

// 싱글톤 인스턴스
export const metricsCollector = new MetricsCollector();

/**
 * 메트릭 수집 헬퍼 함수들
 */
export const metrics = {
  success: (symbol: string, dataSource: string, responseTime?: number, metadata?: Record<string, any>) => {
    metricsCollector.recordSuccess(symbol, dataSource, responseTime, metadata);
  },
  error: (symbol: string, dataSource: string, error: Error | string, metadata?: Record<string, any>) => {
    metricsCollector.recordError(symbol, dataSource, error, metadata);
  },
  warning: (symbol: string, dataSource: string, message: string, metadata?: Record<string, any>) => {
    metricsCollector.recordWarning(symbol, dataSource, message, metadata);
  },
  validationFailure: (symbol: string, dataSource: string, field: string, value: any, reason: string) => {
    metricsCollector.recordValidationFailure(symbol, dataSource, field, value, reason);
  },
  consistencyCheck: (
    symbol: string,
    dataSource: string,
    warnings: string[],
    errors: string[],
    metadata?: Record<string, any>
  ) => {
    metricsCollector.recordConsistencyCheck(symbol, dataSource, warnings, errors, metadata);
  },
  getDataSourceMetrics: (source?: string) => metricsCollector.getDataSourceMetrics(source),
  getRecentMetrics: (limit?: number) => metricsCollector.getRecentMetrics(limit),
  getSymbolMetrics: (symbol: string) => metricsCollector.getSymbolMetrics(symbol),
};
