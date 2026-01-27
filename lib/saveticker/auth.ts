/**
 * Saveticker 인증 모듈
 *
 * 이메일 로그인을 통한 자동 토큰 발급 및 갱신
 * - Playwright를 사용한 브라우저 자동화
 * - JWT 토큰 자동 갱신 (만료 1일 전)
 * - 메모리 캐싱으로 불필요한 로그인 방지
 */

import { chromium, type Browser } from 'playwright';

const SAVETICKER_LOGIN_URL = 'https://www.saveticker.com/login';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 토큰 캐시
interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix timestamp (ms)
  userId: string;
  username: string;
}

let cachedToken: CachedToken | null = null;
let browser: Browser | null = null;

/**
 * 환경변수 확인
 */
export function isSavetickerConfigured(): boolean {
  return !!(
    process.env.SAVETICKER_EMAIL &&
    process.env.SAVETICKER_PASSWORD &&
    process.env.SAVETICKER_EMAIL.length > 0 &&
    process.env.SAVETICKER_PASSWORD.length > 0
  );
}

/**
 * JWT 페이로드 디코딩
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
  return JSON.parse(payload);
}

/**
 * 브라우저 인스턴스 가져오기 (싱글톤)
 */
async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
  }
  return browser;
}

/**
 * 브라우저 종료
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

/**
 * 이메일 로그인으로 토큰 발급
 */
export async function loginWithEmail(): Promise<CachedToken> {
  const email = process.env.SAVETICKER_EMAIL;
  const password = process.env.SAVETICKER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'SAVETICKER_EMAIL 또는 SAVETICKER_PASSWORD 환경변수가 설정되지 않았습니다'
    );
  }

  console.log('[Saveticker Auth] 이메일 로그인 시작...');
  const startTime = Date.now();

  const browserInstance = await getBrowser();
  const context = await browserInstance.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  try {
    // 1. 로그인 페이지 이동
    await page.goto(SAVETICKER_LOGIN_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // 2. "이메일로 로그인" 버튼 클릭
    const emailLoginButton = page.locator('text=이메일로 로그인');
    await emailLoginButton.waitFor({ state: 'visible', timeout: 10000 });
    await emailLoginButton.click();
    await page.waitForTimeout(1500);

    // 3. 이메일 입력
    const emailInput = page.locator('input[type="email"]');
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.fill(email);

    // 4. 비밀번호 입력
    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
    await passwordInput.fill(password);

    await page.waitForTimeout(500);

    // 5. 로그인 버튼 클릭
    // React Native Web에서는 버튼이 div로 렌더링됨
    // 입력 필드 아래의 "로그인" 텍스트를 가진 클릭 가능한 요소 찾기
    await page.waitForTimeout(1000);

    // 여러 셀렉터 시도
    const loginButtonSelectors = [
      'div:has-text("로그인"):not(:has-text("이메일로"))',
      '[class*="button"]:has-text("로그인")',
      'text=로그인 >> nth=1', // 두 번째 "로그인" 텍스트 (첫 번째는 제목)
    ];

    let clicked = false;
    for (const selector of loginButtonSelectors) {
      try {
        const btn = page.locator(selector).last();
        if (await btn.isVisible({ timeout: 2000 })) {
          await btn.click();
          clicked = true;
          console.log(`[Saveticker Auth] 로그인 버튼 클릭 성공: ${selector}`);
          break;
        }
      } catch {
        continue;
      }
    }

    // 폴백: 좌표 기반 클릭 (버튼이 화면 하단 중앙에 위치)
    if (!clicked) {
      console.log('[Saveticker Auth] 셀렉터 실패 - 좌표 기반 클릭 시도');
      // 비밀번호 입력 필드 아래 버튼 클릭
      const passwordBox = await passwordInput.boundingBox();
      if (passwordBox) {
        const buttonY = passwordBox.y + passwordBox.height + 80; // 버튼은 입력 필드 아래 약 80px
        const buttonX = 640; // 화면 중앙
        await page.mouse.click(buttonX, buttonY);
        clicked = true;
      }
    }

    if (!clicked) {
      throw new Error('로그인 버튼을 찾을 수 없습니다');
    }

    // 6. 로그인 완료 대기 (localStorage에 토큰이 저장될 때까지)
    console.log('[Saveticker Auth] 로그인 처리 중...');

    let accessToken: string | null = null;
    let retries = 0;
    const maxRetries = 20;

    while (!accessToken && retries < maxRetries) {
      await page.waitForTimeout(500);
      accessToken = await page.evaluate(() => {
        return localStorage.getItem('access_token');
      });
      retries++;
    }

    if (!accessToken) {
      // 에러 메시지 확인
      const errorText = await page.evaluate(() => {
        const errorEl = document.querySelector('[class*="error"], [class*="Error"]');
        return errorEl?.textContent || null;
      });

      if (errorText) {
        throw new Error(`로그인 실패: ${errorText}`);
      }
      throw new Error('토큰 획득 실패 - 로그인 응답 없음');
    }

    // 7. 사용자 정보 추출
    const userInfo = await page.evaluate(() => {
      const userInfoStr = localStorage.getItem('user_info');
      if (userInfoStr) {
        try {
          return JSON.parse(userInfoStr);
        } catch {
          return null;
        }
      }
      return null;
    });

    // 8. JWT 디코딩하여 만료 시간 확인
    const payload = decodeJwtPayload(accessToken);
    const expiresAt = (payload.exp as number) * 1000;

    const result: CachedToken = {
      accessToken,
      expiresAt,
      userId: (userInfo?.id as string) || (payload.sub as string) || '',
      username: (userInfo?.username as string) || (payload.name as string) || '',
    };

    const elapsed = Date.now() - startTime;
    const expiresDate = new Date(expiresAt);
    console.log(`[Saveticker Auth] 로그인 성공! (${elapsed}ms)`);
    console.log(`[Saveticker Auth] 사용자: ${result.username}`);
    console.log(`[Saveticker Auth] 토큰 만료: ${expiresDate.toLocaleString('ko-KR')}`);

    return result;
  } catch (error) {
    // 디버깅용 스크린샷
    try {
      await page.screenshot({ path: '/tmp/saveticker-login-error.png' });
      console.error('[Saveticker Auth] 에러 스크린샷: /tmp/saveticker-login-error.png');
    } catch {}

    throw error;
  } finally {
    await context.close();
  }
}

/**
 * 유효한 토큰 가져오기 (자동 갱신)
 *
 * - 캐시된 토큰이 있고 유효하면 재사용
 * - 만료 1일 전이면 자동 갱신
 * - 토큰이 없으면 새로 발급
 */
export async function getValidToken(): Promise<string> {
  const now = Date.now();
  const bufferTime = 24 * 60 * 60 * 1000; // 1일 여유

  // 캐시된 토큰이 유효하면 재사용
  if (cachedToken && cachedToken.expiresAt - bufferTime > now) {
    const remainingDays = Math.floor(
      (cachedToken.expiresAt - now) / (24 * 60 * 60 * 1000)
    );
    console.log(`[Saveticker Auth] 캐시된 토큰 사용 (남은 기간: ${remainingDays}일)`);
    return cachedToken.accessToken;
  }

  // 새 토큰 발급
  console.log('[Saveticker Auth] 토큰 갱신 필요 - 새 토큰 발급 중...');
  cachedToken = await loginWithEmail();

  return cachedToken.accessToken;
}

/**
 * 토큰 강제 갱신
 */
export async function refreshToken(): Promise<string> {
  console.log('[Saveticker Auth] 토큰 강제 갱신...');
  cachedToken = await loginWithEmail();
  return cachedToken.accessToken;
}

/**
 * 현재 캐시된 토큰 정보
 */
export function getCachedTokenInfo(): {
  hasToken: boolean;
  expiresAt: Date | null;
  remainingDays: number | null;
  username: string | null;
} {
  if (!cachedToken) {
    return {
      hasToken: false,
      expiresAt: null,
      remainingDays: null,
      username: null,
    };
  }

  const now = Date.now();
  const remainingMs = cachedToken.expiresAt - now;
  const remainingDays = Math.floor(remainingMs / (24 * 60 * 60 * 1000));

  return {
    hasToken: true,
    expiresAt: new Date(cachedToken.expiresAt),
    remainingDays,
    username: cachedToken.username,
  };
}

/**
 * 토큰 캐시 클리어
 */
export function clearTokenCache(): void {
  cachedToken = null;
  console.log('[Saveticker Auth] 토큰 캐시 클리어됨');
}
