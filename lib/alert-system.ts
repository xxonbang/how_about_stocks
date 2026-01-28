/**
 * 알림 시스템
 *
 * 데이터 품질 문제 발생 시 알림을 생성하고 관리
 * Supabase 연동으로 알림 영속화 지원
 */

import { metricsCollector, type DataSourceMetrics } from './data-metrics';
import { sendExternalNotifications } from './alert-notifiers';
import type { AlertInsert, AlertType, AlertSeverity } from './supabase/types';

/**
 * Supabase에 알림 저장 (비동기, 비블로킹)
 */
async function saveAlertToSupabase(alert: Alert): Promise<void> {
  try {
    // 동적 import로 서버 전용 모듈 로드
    const { supabaseServer, isSupabaseServerEnabled } = await import('./supabase/server');

    if (!isSupabaseServerEnabled() || !supabaseServer) {
      return; // Supabase 미설정 시 건너뜀
    }

    const alertInsert: AlertInsert = {
      type: alert.type as AlertType,
      severity: alert.severity as AlertSeverity,
      title: alert.title,
      message: alert.message,
      data_source: alert.dataSource,
      symbol: alert.symbol || null,
      resolved: alert.resolved,
      metadata: alert.metadata || {},
    };

    const { error } = await supabaseServer.from('alerts').insert(alertInsert);

    if (error) {
      console.error('[AlertSystem] Supabase save failed:', error.message);
    }
  } catch (err) {
    // Supabase 저장 실패해도 인메모리 로직은 계속 진행
    console.error('[AlertSystem] Supabase save error:', err instanceof Error ? err.message : err);
  }
}

/**
 * Supabase에서 알림 해결 상태 업데이트 (비동기, 비블로킹)
 */
async function updateAlertResolvedInSupabase(alertId: string, resolvedAt: number): Promise<void> {
  try {
    const { supabaseServer, isSupabaseServerEnabled } = await import('./supabase/server');

    if (!isSupabaseServerEnabled() || !supabaseServer) {
      return;
    }

    // alertId에서 timestamp 추출하여 매칭 (id 형식: alert-{timestamp}-{random})
    const timestampMatch = alertId.match(/^alert-(\d+)-/);
    if (!timestampMatch) {
      return;
    }

    const timestamp = parseInt(timestampMatch[1], 10);
    const timestampStr = new Date(timestamp).toISOString();

    // timestamp로 알림 찾아서 업데이트
    const { error } = await supabaseServer
      .from('alerts')
      .update({
        resolved: true,
        resolved_at: new Date(resolvedAt).toISOString(),
      })
      .eq('timestamp', timestampStr);

    if (error) {
      console.error('[AlertSystem] Supabase update failed:', error.message);
    }
  } catch (err) {
    console.error('[AlertSystem] Supabase update error:', err instanceof Error ? err.message : err);
  }
}

export interface Alert {
  id: string;
  type: 'consistency_failure' | 'error_rate_threshold' | 'validation_failure' | 'data_source_down' | 'api_key_invalid';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  dataSource: string;
  symbol?: string;
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
  metadata?: Record<string, any>;
}

interface AlertThresholds {
  errorRate: number; // 오류율 임계값 (%)
  consistencyFailure: boolean; // 정합성 검사 실패 시 즉시 알림
  validationFailure: boolean; // 검증 실패 시 즉시 알림
  dataSourceDown: number; // 연속 실패 횟수 (데이터 소스 다운 알림)
  dataSourceDownTimeout: number; // 데이터 소스 다운 타임아웃 (밀리초)
}

class AlertSystem {
  private alerts: Alert[] = [];
  private maxAlerts = 500;
  
  /**
   * 환경 변수에서 임계값 로드 (기본값 사용)
   */
  private getAlertThresholds(): AlertThresholds {
    return {
      errorRate: parseFloat(process.env.ALERT_ERROR_RATE_THRESHOLD || '10'),
      consistencyFailure: process.env.ALERT_CONSISTENCY_FAILURE !== 'false',
      validationFailure: process.env.ALERT_VALIDATION_FAILURE !== 'false',
      dataSourceDown: parseInt(process.env.ALERT_DATA_SOURCE_DOWN_COUNT || '5', 10),
      dataSourceDownTimeout: parseInt(process.env.ALERT_DATA_SOURCE_DOWN_TIMEOUT || '300000', 10), // 5분 기본값
    };
  }
  
  private get alertThresholds(): AlertThresholds {
    return this.getAlertThresholds();
  }

  /**
   * 알림 생성
   */
  async createAlert(alert: Omit<Alert, 'id' | 'timestamp' | 'resolved'>): Promise<void> {
    const newAlert: Alert = {
      ...alert,
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      resolved: false,
    };

    this.alerts.push(newAlert);

    // 최대 개수 초과 시 오래된 알림 제거
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(-this.maxAlerts);
    }

    // 콘솔 로깅
    const severityEmoji = {
      low: 'ℹ️',
      medium: '⚠️',
      high: '🔴',
      critical: '🚨',
    };

    console[alert.severity === 'critical' || alert.severity === 'high' ? 'error' : 'warn'](
      `[Alert] ${severityEmoji[alert.severity]} ${alert.title}: ${alert.message}`
    );

    // 외부 알림 전송 (비동기, 실패해도 계속 진행)
    sendExternalNotifications(newAlert).catch((error) => {
      console.error('[Alert] Failed to send external notifications:', error);
    });

    // Supabase 비동기 저장 (비블로킹)
    if (typeof window === 'undefined') {
      saveAlertToSupabase(newAlert).catch(() => {
        // 이미 함수 내부에서 에러 로깅하므로 여기서는 무시
      });
    }
  }

  /**
   * 알림 해결
   */
  resolveAlert(alertId: string): void {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();

      // Supabase 비동기 업데이트 (비블로킹)
      if (typeof window === 'undefined') {
        updateAlertResolvedInSupabase(alertId, alert.resolvedAt).catch(() => {
          // 이미 함수 내부에서 에러 로깅하므로 여기서는 무시
        });
      }
    }
  }

  /**
   * 데이터 소스 메트릭을 분석하여 알림 생성
   */
  async checkDataSourceMetrics(metrics: DataSourceMetrics[]): Promise<void> {
    for (const source of metrics) {
      // 오류율 임계값 체크
      const errorRate =
        source.totalRequests > 0
          ? (source.errorCount / source.totalRequests) * 100
          : 0;

      if (errorRate >= this.alertThresholds.errorRate && source.totalRequests >= 10) {
        // 이미 생성된 알림이 있는지 확인
        const existingAlert = this.alerts.find(
          (a) =>
            a.type === 'error_rate_threshold' &&
            a.dataSource === source.source &&
            !a.resolved
        );

        if (!existingAlert) {
          await this.createAlert({
            type: 'error_rate_threshold',
            severity: errorRate >= 50 ? 'critical' : errorRate >= 30 ? 'high' : 'medium',
            title: `${source.source} 오류율 임계값 초과`,
            message: `${source.source}의 오류율이 ${errorRate.toFixed(1)}%로 임계값(${this.alertThresholds.errorRate}%)을 초과했습니다.`,
            dataSource: source.source,
            metadata: {
              errorRate,
              totalRequests: source.totalRequests,
              errorCount: source.errorCount,
            },
          });
        }
      }

      // 데이터 소스 다운 체크 (최근 연속 실패)
      if (
        source.lastErrorTime &&
        source.lastSuccessTime &&
        source.lastErrorTime > source.lastSuccessTime &&
        source.errorCount >= this.alertThresholds.dataSourceDown
      ) {
        const timeSinceLastSuccess = Date.now() - source.lastSuccessTime;
        // 타임아웃 이상 성공이 없고 오류가 연속 발생하면 다운으로 간주
        if (timeSinceLastSuccess > this.alertThresholds.dataSourceDownTimeout) {
          const existingAlert = this.alerts.find(
            (a) =>
              a.type === 'data_source_down' &&
              a.dataSource === source.source &&
              !a.resolved
          );

          if (!existingAlert) {
            await this.createAlert({
              type: 'data_source_down',
              severity: 'critical',
              title: `${source.source} 데이터 소스 다운`,
              message: `${source.source}가 ${Math.round(timeSinceLastSuccess / 1000 / 60)}분 이상 응답하지 않습니다.`,
              dataSource: source.source,
              metadata: {
                lastSuccessTime: source.lastSuccessTime,
                lastErrorTime: source.lastErrorTime,
                errorCount: source.errorCount,
              },
            });
          }
        }
      }
    }
  }

  /**
   * 정합성 검사 실패 알림
   */
  async alertConsistencyFailure(
    symbol: string,
    dataSource: string,
    errors: string[],
    warnings: string[]
  ): Promise<void> {
    if (errors.length > 0) {
      await this.createAlert({
        type: 'consistency_failure',
        severity: errors.length >= 3 ? 'high' : 'medium',
        title: `${symbol} 데이터 정합성 검사 실패`,
        message: `${errors.length}개의 오류와 ${warnings.length}개의 경고가 발견되었습니다.`,
        dataSource,
        symbol,
        metadata: {
          errors,
          warnings,
        },
      });
    }
  }

  /**
   * 검증 실패 알림
   */
  async alertValidationFailure(
    symbol: string,
    dataSource: string,
    field: string,
    reason: string
  ): Promise<void> {
    await this.createAlert({
      type: 'validation_failure',
      severity: 'medium',
      title: `${symbol} 데이터 검증 실패`,
      message: `${field} 필드 검증 실패: ${reason}`,
      dataSource,
      symbol,
      metadata: {
        field,
        reason,
      },
    });
  }

  /**
   * API 키 무효 알림
   */
  async alertApiKeyInvalid(
    apiName: string,
    reason: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    // 이미 동일한 API 키 무효 알림이 있는지 확인 (중복 방지)
    const existingAlert = this.alerts.find(
      (a) =>
        a.type === 'api_key_invalid' &&
        a.dataSource === apiName &&
        !a.resolved
    );

    if (existingAlert) {
      // 이미 알림이 있으면 업데이트하지 않음 (중복 방지)
      return;
    }

    await this.createAlert({
      type: 'api_key_invalid',
      severity: 'critical', // API 키 무효는 Critical
      title: `${apiName} API 키가 유효하지 않습니다`,
      message: `${apiName} API 키가 만료되었거나 유효하지 않습니다. ${reason} API 키를 갱신해주세요.`,
      dataSource: apiName,
      metadata: {
        reason,
        apiName,
        ...metadata,
      },
    });
  }

  /**
   * 활성 알림 조회
   */
  getActiveAlerts(severity?: Alert['severity']): Alert[] {
    let filtered = this.alerts.filter((a) => !a.resolved);

    if (severity) {
      filtered = filtered.filter((a) => a.severity === severity);
    }

    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 모든 알림 조회
   */
  getAllAlerts(limit?: number): Alert[] {
    const sorted = this.alerts.sort((a, b) => b.timestamp - a.timestamp);
    return limit ? sorted.slice(0, limit) : sorted;
  }

  /**
   * 알림 통계
   */
  getAlertStats(): {
    total: number;
    active: number;
    resolved: number;
    bySeverity: Record<Alert['severity'], number>;
    byType: Record<Alert['type'], number>;
  } {
    const active = this.alerts.filter((a) => !a.resolved);
    const resolved = this.alerts.filter((a) => a.resolved);

    const bySeverity: Record<Alert['severity'], number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    const byType: Record<Alert['type'], number> = {
      consistency_failure: 0,
      error_rate_threshold: 0,
      validation_failure: 0,
      data_source_down: 0,
      api_key_invalid: 0,
    };

    active.forEach((alert) => {
      bySeverity[alert.severity]++;
      byType[alert.type]++;
    });

    return {
      total: this.alerts.length,
      active: active.length,
      resolved: resolved.length,
      bySeverity,
      byType,
    };
  }

  /**
   * 알림 초기화
   */
  clear(): void {
    this.alerts = [];
  }
}

// 싱글톤 인스턴스
export const alertSystem = new AlertSystem();

/**
 * 주기적으로 메트릭을 체크하고 알림 생성
 */
export function startAlertMonitoring(intervalMs: number = 30000): () => void {
  const interval = setInterval(async () => {
    const metrics = metricsCollector.getDataSourceMetrics();
    await alertSystem.checkDataSourceMetrics(metrics);
  }, intervalMs);

  return () => clearInterval(interval);
}
