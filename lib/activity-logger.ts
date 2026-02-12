/**
 * 클라이언트 사이드 활동 로깅 유틸리티
 *
 * fire-and-forget 패턴: 에러가 발생해도 사용자 경험을 방해하지 않음
 */

export function logActivity(
  actionType: string,
  actionDetail?: Record<string, string>,
): void {
  fetch('/api/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actionType, actionDetail: actionDetail ?? {} }),
  }).catch(() => {
    // 에러 무시 — 로깅 실패가 사용자 경험을 방해해서는 안 됨
  });
}
