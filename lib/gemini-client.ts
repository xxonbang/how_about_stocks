/**
 * Gemini API 클라이언트 유틸리티
 * 여러 API 키에 대한 fallback 지원 + 스마트 키 관리
 *
 * 개선사항:
 * - 한 번 성공한 키는 세션 동안 계속 사용
 * - 실패한 키는 세션 동안 건너뜀
 * - 불필요한 대기시간 제거
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

// ============================================
// 세션 레벨 키 상태 관리 (모듈 싱글톤)
// ============================================

interface KeyState {
  currentKeyIndex: number;      // 현재 사용 중인 키 인덱스
  failedKeyIndices: Set<number>; // 실패한 키 인덱스 목록
  lastSuccessKeyIndex: number;  // 마지막으로 성공한 키 인덱스
}

// 세션 동안 유지되는 키 상태
const keyState: KeyState = {
  currentKeyIndex: 0,
  failedKeyIndices: new Set(),
  lastSuccessKeyIndex: -1,
};

/**
 * 키 상태 초기화 (테스트 또는 수동 리셋용)
 */
export function resetKeyState(): void {
  keyState.currentKeyIndex = 0;
  keyState.failedKeyIndices.clear();
  keyState.lastSuccessKeyIndex = -1;
  console.log('[Gemini] 키 상태가 초기화되었습니다.');
}

/**
 * 현재 키 상태 조회 (디버깅용)
 */
export function getKeyState(): { current: number; failed: number[]; lastSuccess: number } {
  return {
    current: keyState.currentKeyIndex,
    failed: Array.from(keyState.failedKeyIndices),
    lastSuccess: keyState.lastSuccessKeyIndex,
  };
}

// ============================================
// API 키 관리
// ============================================

/**
 * Gemini API 키 목록 가져오기
 * 지원 형식:
 * - GEMINI_API_KEY_01, GEMINI_API_KEY_02, GEMINI_API_KEY_03, ... (동적)
 * - GEMINI_API_KEY (하위 호환성, GEMINI_API_KEY_*가 없을 때만 사용)
 */
export function getGeminiApiKeys(): string[] {
  const keys: string[] = [];
  const keyNames: string[] = [];

  // GEMINI_API_KEY_01, _02, _03, ... 동적 탐색 (최대 10개)
  for (let i = 1; i <= 10; i++) {
    const keyNum = i.toString().padStart(2, '0');
    const envKey = `GEMINI_API_KEY_${keyNum}`;
    const keyValue = process.env[envKey]?.trim();

    if (keyValue) {
      keys.push(keyValue);
      keyNames.push(envKey);
    }
  }

  // GEMINI_API_KEY_*가 없으면 GEMINI_API_KEY (단일 키) 사용
  if (keys.length === 0) {
    const legacyKey = process.env.GEMINI_API_KEY?.trim();
    if (legacyKey) {
      keys.push(legacyKey);
      keyNames.push('GEMINI_API_KEY');
    }
  }

  // 키 상태 로깅
  if (keys.length === 0) {
    console.warn('[Gemini] 환경 변수에서 API 키를 찾을 수 없습니다.');
  } else {
    console.log(`[Gemini] ${keys.length}개의 API 키 로드됨: ${keyNames.join(', ')}`);
  }

  return keys;
}

// ============================================
// 스마트 Fallback API 호출
// ============================================

/**
 * Gemini API 호출 (스마트 키 관리)
 *
 * 동작 방식:
 * 1. 마지막 성공 키가 있으면 해당 키로 바로 시도
 * 2. 실패한 키는 건너뜀
 * 3. 성공하면 해당 키를 기억하고 계속 사용
 * 4. 모든 키 실패 시 에러
 */
export async function callGeminiWithFallback<T>(
  operation: (genAI: GoogleGenerativeAI, modelName?: string) => Promise<T>,
  options?: { model?: string; maxRetryRounds?: number }
): Promise<T> {
  const apiKeys = getGeminiApiKeys();
  const modelName = options?.model || "gemini-2.5-flash";

  if (apiKeys.length === 0) {
    throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
  }

  let lastError: Error | null = null;

  // 시도할 키 인덱스 목록 생성 (스마트 순서)
  const keyIndicesToTry = getSmartKeyOrder(apiKeys.length);

  if (keyIndicesToTry.length === 0) {
    // 모든 키가 실패 상태 - 상태 초기화 후 재시도
    console.log('[Gemini] 모든 키가 실패 상태입니다. 상태 초기화 후 재시도...');
    resetKeyState();
    return callGeminiWithFallback(operation, options);
  }

  // 각 키로 순차적으로 시도
  for (const keyIndex of keyIndicesToTry) {
    const apiKey = apiKeys[keyIndex];
    const keyLabel = `Key ${keyIndex + 1}`;
    const isLastSuccess = keyIndex === keyState.lastSuccessKeyIndex;

    try {
      if (isLastSuccess) {
        console.log(`[Gemini] ${keyLabel} (마지막 성공 키) + ${modelName} 사용...`);
      } else {
        console.log(`[Gemini] ${keyLabel} + ${modelName} 시도...`);
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const result = await operation(genAI, modelName);

      // 성공 - 키 상태 업데이트
      if (keyIndex !== keyState.lastSuccessKeyIndex) {
        console.log(`[Gemini] ${keyLabel} 성공! 이후 이 키를 계속 사용합니다.`);
      }
      keyState.lastSuccessKeyIndex = keyIndex;
      keyState.currentKeyIndex = keyIndex;

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      lastError = error instanceof Error ? error : new Error(errorMessage);

      // 오류 유형 분석
      const isRateLimitError = isRetryableRateLimitError(error);

      console.error(`[Gemini] ${keyLabel} 실패:`, errorMessage.substring(0, 100));

      if (isRateLimitError) {
        // Rate Limit 오류 - 이 키를 실패 목록에 추가
        keyState.failedKeyIndices.add(keyIndex);
        console.log(`[Gemini] ${keyLabel}를 실패 목록에 추가 (Rate Limit). 다음 키로 전환...`);
        continue;
      } else {
        // 다른 오류 (인증 오류 등) - 즉시 throw
        throw lastError;
      }
    }
  }

  // 모든 키 실패
  throw new Error(
    `모든 Gemini API 키가 실패했습니다. 마지막 오류: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * 스마트 키 순서 생성
 * 1. 마지막 성공 키를 먼저
 * 2. 실패하지 않은 키들을 순서대로
 */
function getSmartKeyOrder(totalKeys: number): number[] {
  const order: number[] = [];

  // 마지막 성공 키가 있고 실패 목록에 없으면 먼저 추가
  if (
    keyState.lastSuccessKeyIndex >= 0 &&
    keyState.lastSuccessKeyIndex < totalKeys &&
    !keyState.failedKeyIndices.has(keyState.lastSuccessKeyIndex)
  ) {
    order.push(keyState.lastSuccessKeyIndex);
  }

  // 나머지 키들 중 실패하지 않은 키 추가
  for (let i = 0; i < totalKeys; i++) {
    if (!keyState.failedKeyIndices.has(i) && !order.includes(i)) {
      order.push(i);
    }
  }

  return order;
}

/**
 * Rate Limit 관련 재시도 가능한 오류인지 확인
 */
function isRetryableRateLimitError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorCode = (error as Record<string, unknown>)?.code;
  const statusCode = (error as Record<string, unknown>)?.status ||
                     (error as Record<string, unknown>)?.statusCode;

  return (
    errorCode === 429 ||
    errorCode === 503 ||
    statusCode === 429 ||
    statusCode === 503 ||
    errorMessage.toLowerCase().includes('429') ||
    errorMessage.toLowerCase().includes('quota') ||
    errorMessage.toLowerCase().includes('rate limit') ||
    errorMessage.toLowerCase().includes('resource exhausted') ||
    errorMessage.toLowerCase().includes('exceeded') ||
    errorMessage.toLowerCase().includes('daily limit') ||
    errorMessage.toLowerCase().includes('usage limit')
  );
}

// ============================================
// 편의 함수
// ============================================

/**
 * Gemini 모델 인스턴스 생성 (현재 활성 키 사용)
 */
export async function createGeminiModel(
  modelName: string = "gemini-2.5-flash"
): Promise<{ genAI: GoogleGenerativeAI; model: ReturnType<GoogleGenerativeAI['getGenerativeModel']> }> {
  const apiKeys = getGeminiApiKeys();

  if (apiKeys.length === 0) {
    throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
  }

  // 마지막 성공 키 또는 첫 번째 키 사용
  const keyIndex = keyState.lastSuccessKeyIndex >= 0
    ? keyState.lastSuccessKeyIndex
    : 0;

  const genAI = new GoogleGenerativeAI(apiKeys[keyIndex]);
  const model = genAI.getGenerativeModel({ model: modelName });

  return { genAI, model };
}
