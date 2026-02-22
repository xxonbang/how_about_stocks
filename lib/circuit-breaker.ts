/**
 * Circuit Breaker 패턴 구현
 *
 * 외부 API 호출 실패가 반복되면 일시적으로 호출을 차단하여
 * 불필요한 대기와 리소스 낭비를 방지합니다.
 *
 * 상태: CLOSED (정상) → OPEN (차단) → HALF_OPEN (시험)
 */

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  /** 연속 실패 임계값 (기본: 5) */
  failureThreshold?: number;
  /** OPEN → HALF_OPEN 전환 대기 시간 ms (기본: 60초) */
  resetTimeout?: number;
  /** 서킷 이름 (로깅용) */
  name?: string;
}

class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: CircuitState = 'CLOSED';
  private readonly threshold: number;
  private readonly resetTimeout: number;
  private readonly name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.threshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 60000;
    this.name = options.name ?? 'unnamed';
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error(
          `[CircuitBreaker:${this.name}] Circuit is OPEN. Retry after ${Math.ceil((this.resetTimeout - (Date.now() - this.lastFailureTime)) / 1000)}s`
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      console.warn(
        `[CircuitBreaker:${this.name}] Circuit OPEN after ${this.failures} failures. Will retry after ${this.resetTimeout / 1000}s`
      );
    }
  }
}

/** Named circuit breaker registry */
const registry = new Map<string, CircuitBreaker>();

/**
 * 이름으로 Circuit Breaker 가져오기 (없으면 생성)
 */
export function getCircuitBreaker(
  name: string,
  options?: Omit<CircuitBreakerOptions, 'name'>
): CircuitBreaker {
  let breaker = registry.get(name);
  if (!breaker) {
    breaker = new CircuitBreaker({ ...options, name });
    registry.set(name, breaker);
  }
  return breaker;
}
