// 세션 관리: 8시간 절대 만료 + 1시간 비활성 타이머 + admin 면제
// Supabase 세션 자체는 건드리지 않고, localStorage 타임스탬프 기반으로 만료 판단 후 signOut() 호출

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8시간 절대 만료
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1시간 비활성 로그아웃
const ACTIVITY_THROTTLE_MS = 30 * 1000; // 30초 쓰로틀

const SESSION_LOGIN_AT = '__session_login_at__';
const SESSION_LAST_ACTIVITY = '__session_last_activity__';

export type SessionExpiredReason = 'session_expired' | 'inactivity' | null;

export class SessionManager {
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActivityUpdate = 0;
  private running = false;

  isExempt = false;
  onExpired: ((reason: SessionExpiredReason) => void) | null = null;

  private handleActivity = () => {
    if (this.isExempt || !this.running) return;

    const now = Date.now();
    if (now - this.lastActivityUpdate < ACTIVITY_THROTTLE_MS) return;

    this.lastActivityUpdate = now;
    try {
      localStorage.setItem(SESSION_LAST_ACTIVITY, String(now));
    } catch {
      // localStorage 접근 불가 시 무시
    }

    this.resetInactivityTimer();
  };

  private handleVisibilityChange = () => {
    if (this.isExempt || !this.running) return;
    if (document.visibilityState === 'visible') {
      const reason = this.checkExpiry();
      if (reason) {
        this.onExpired?.(reason);
      } else {
        this.resetInactivityTimer();
      }
    }
  };

  start() {
    if (this.isExempt) return;

    const now = Date.now();
    try {
      localStorage.setItem(SESSION_LOGIN_AT, String(now));
      localStorage.setItem(SESSION_LAST_ACTIVITY, String(now));
    } catch {
      // localStorage 접근 불가 시 무시
    }

    this.running = true;
    this.lastActivityUpdate = now;
    this.resetInactivityTimer();
    this.addListeners();
  }

  restore() {
    if (this.isExempt) return;

    const loginAt = this.getTimestamp(SESSION_LOGIN_AT);
    if (!loginAt) {
      this.start();
      return;
    }

    const reason = this.checkExpiry();
    if (reason) {
      this.onExpired?.(reason);
      return;
    }

    this.running = true;
    this.lastActivityUpdate = Date.now();
    try {
      localStorage.setItem(SESSION_LAST_ACTIVITY, String(this.lastActivityUpdate));
    } catch {
      // localStorage 접근 불가 시 무시
    }
    this.resetInactivityTimer();
    this.addListeners();
  }

  stop() {
    this.running = false;
    this.clearInactivityTimer();
    this.removeListeners();

    try {
      localStorage.removeItem(SESSION_LOGIN_AT);
      localStorage.removeItem(SESSION_LAST_ACTIVITY);
    } catch {
      // localStorage 접근 불가 시 무시
    }
  }

  checkExpiry(): SessionExpiredReason {
    if (this.isExempt) return null;

    const now = Date.now();
    const loginAt = this.getTimestamp(SESSION_LOGIN_AT);
    const lastActivity = this.getTimestamp(SESSION_LAST_ACTIVITY);

    if (loginAt && now - loginAt >= SESSION_DURATION_MS) {
      return 'session_expired';
    }

    if (lastActivity && now - lastActivity >= INACTIVITY_TIMEOUT_MS) {
      return 'inactivity';
    }

    return null;
  }

  private getTimestamp(key: string): number | null {
    try {
      const val = localStorage.getItem(key);
      if (!val) return null;
      const num = Number(val);
      return Number.isFinite(num) ? num : null;
    } catch {
      return null;
    }
  }

  private resetInactivityTimer() {
    this.clearInactivityTimer();
    this.inactivityTimer = setTimeout(() => {
      if (!this.running || this.isExempt) return;
      const reason = this.checkExpiry();
      if (reason) {
        this.onExpired?.(reason);
      } else {
        // 다른 탭에서 활동이 있었으므로 타이머 재시작
        this.resetInactivityTimer();
      }
    }, INACTIVITY_TIMEOUT_MS);
  }

  private clearInactivityTimer() {
    if (this.inactivityTimer !== null) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  private addListeners() {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;
    for (const event of events) {
      window.addEventListener(event, this.handleActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private removeListeners() {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;
    for (const event of events) {
      window.removeEventListener(event, this.handleActivity);
    }
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }
}
