/**
 * 통합 API 상태 확인 엔드포인트
 *
 * GET /api/api-status
 * GET /api/api-status?api=fmp,gemini (특정 API만 확인)
 *
 * 모든 외부 API의 연결 상태를 확인합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

// API 상태 타입
interface APIStatus {
  name: string;
  configured: boolean;
  valid: boolean | null;
  message: string;
  note?: string;
  statusCode?: number;
  latency?: number;
}

interface APIStatusResponse {
  success: boolean;
  timestamp: number;
  apis: Record<string, APIStatus>;
}

// 환경 변수
const KRX_API_KEY = process.env.KRX_API_KEY || '';
const FMP_API_KEY = process.env.FMP_API_KEY || '';
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY || '';
const PUBLIC_DATA_API_KEY = process.env.PUBLIC_DATA_API_KEY || '';
const KIS_APP_KEY = process.env.KIS_APP_KEY || '';
const KIS_APP_SECRET = process.env.KIS_APP_SECRET || '';
const GEMINI_API_KEY_01 = process.env.GEMINI_API_KEY_01 || '';
const GEMINI_API_KEY_02 = process.env.GEMINI_API_KEY_02 || '';
const GEMINI_API_KEY_03 = process.env.GEMINI_API_KEY_03 || '';
const SAVETICKER_EMAIL = process.env.SAVETICKER_EMAIL || '';
const SAVETICKER_PASSWORD = process.env.SAVETICKER_PASSWORD || '';

/**
 * KRX API 검사
 */
async function checkKRX(): Promise<APIStatus> {
  const startTime = Date.now();

  if (!KRX_API_KEY) {
    return {
      name: 'KRX Open API',
      configured: false,
      valid: null,
      message: 'KRX_API_KEY가 설정되지 않았습니다.',
      note: 'https://openapi.krx.co.kr/ 에서 API 키를 발급받으세요.',
    };
  }

  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0].replace(/-/g, '');

    const response = await axios.get(
      `https://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd?AUTH_KEY=${KRX_API_KEY}&basDd=${dateStr}`,
      { timeout: 10000, validateStatus: () => true }
    );

    const latency = Date.now() - startTime;

    if (response.status === 200) {
      return {
        name: 'KRX Open API',
        configured: true,
        valid: true,
        message: 'API 키가 유효합니다.',
        latency,
      };
    } else if (response.status === 401) {
      return {
        name: 'KRX Open API',
        configured: true,
        valid: false,
        message: 'API 키가 유효하지 않습니다.',
        statusCode: 401,
        latency,
      };
    } else {
      return {
        name: 'KRX Open API',
        configured: true,
        valid: false,
        message: `예상치 못한 응답 (${response.status})`,
        statusCode: response.status,
        latency,
      };
    }
  } catch (error) {
    return {
      name: 'KRX Open API',
      configured: true,
      valid: false,
      message: error instanceof Error ? error.message : '연결 오류',
      latency: Date.now() - startTime,
    };
  }
}

/**
 * FMP API 검사
 */
async function checkFMP(): Promise<APIStatus> {
  const startTime = Date.now();

  if (!FMP_API_KEY) {
    return {
      name: 'Financial Modeling Prep (FMP)',
      configured: false,
      valid: null,
      message: 'FMP_API_KEY가 설정되지 않았습니다.',
      note: 'https://financialmodelingprep.com/ 에서 API 키를 발급받으세요.',
    };
  }

  try {
    const response = await axios.get(
      `https://financialmodelingprep.com/stable/quote?symbol=AAPL&apikey=${FMP_API_KEY}`,
      { timeout: 10000, validateStatus: () => true }
    );

    const latency = Date.now() - startTime;

    if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
      return {
        name: 'Financial Modeling Prep (FMP)',
        configured: true,
        valid: true,
        message: 'API 키가 유효합니다.',
        latency,
      };
    } else if (response.status === 401 || response.data?.['Error Message']) {
      return {
        name: 'Financial Modeling Prep (FMP)',
        configured: true,
        valid: false,
        message: 'API 키가 유효하지 않습니다.',
        statusCode: response.status,
        latency,
      };
    } else {
      return {
        name: 'Financial Modeling Prep (FMP)',
        configured: true,
        valid: false,
        message: `예상치 못한 응답 (${response.status})`,
        statusCode: response.status,
        latency,
      };
    }
  } catch (error) {
    return {
      name: 'Financial Modeling Prep (FMP)',
      configured: true,
      valid: false,
      message: error instanceof Error ? error.message : '연결 오류',
      latency: Date.now() - startTime,
    };
  }
}

/**
 * Finnhub API 검사
 */
async function checkFinnhub(): Promise<APIStatus> {
  const startTime = Date.now();

  if (!FINNHUB_API_KEY) {
    return {
      name: 'Finnhub',
      configured: false,
      valid: null,
      message: 'FINNHUB_API_KEY가 설정되지 않았습니다.',
      note: 'https://finnhub.io/ 에서 API 키를 발급받으세요.',
    };
  }

  try {
    const response = await axios.get(
      `https://finnhub.io/api/v1/quote?symbol=AAPL&token=${FINNHUB_API_KEY}`,
      { timeout: 10000, validateStatus: () => true }
    );

    const latency = Date.now() - startTime;

    if (response.status === 200 && response.data?.c !== undefined) {
      return {
        name: 'Finnhub',
        configured: true,
        valid: true,
        message: 'API 키가 유효합니다.',
        latency,
      };
    } else if (response.status === 401 || response.status === 403) {
      return {
        name: 'Finnhub',
        configured: true,
        valid: false,
        message: 'API 키가 유효하지 않습니다.',
        statusCode: response.status,
        latency,
      };
    } else {
      return {
        name: 'Finnhub',
        configured: true,
        valid: false,
        message: `예상치 못한 응답 (${response.status})`,
        statusCode: response.status,
        latency,
      };
    }
  } catch (error) {
    return {
      name: 'Finnhub',
      configured: true,
      valid: false,
      message: error instanceof Error ? error.message : '연결 오류',
      latency: Date.now() - startTime,
    };
  }
}

/**
 * Twelve Data API 검사
 */
async function checkTwelveData(): Promise<APIStatus> {
  const startTime = Date.now();

  if (!TWELVE_DATA_API_KEY) {
    return {
      name: 'Twelve Data',
      configured: false,
      valid: null,
      message: 'TWELVE_DATA_API_KEY가 설정되지 않았습니다.',
      note: 'https://twelvedata.com/ 에서 API 키를 발급받으세요.',
    };
  }

  try {
    const response = await axios.get(
      `https://api.twelvedata.com/quote?symbol=AAPL&apikey=${TWELVE_DATA_API_KEY}`,
      { timeout: 10000, validateStatus: () => true }
    );

    const latency = Date.now() - startTime;

    if (response.status === 200 && response.data?.symbol) {
      return {
        name: 'Twelve Data',
        configured: true,
        valid: true,
        message: 'API 키가 유효합니다.',
        latency,
      };
    } else if (response.data?.code === 401 || response.data?.status === 'error') {
      return {
        name: 'Twelve Data',
        configured: true,
        valid: false,
        message: response.data?.message || 'API 키가 유효하지 않습니다.',
        statusCode: 401,
        latency,
      };
    } else {
      return {
        name: 'Twelve Data',
        configured: true,
        valid: false,
        message: `예상치 못한 응답`,
        statusCode: response.status,
        latency,
      };
    }
  } catch (error) {
    return {
      name: 'Twelve Data',
      configured: true,
      valid: false,
      message: error instanceof Error ? error.message : '연결 오류',
      latency: Date.now() - startTime,
    };
  }
}

/**
 * 공공데이터포털 API 검사
 */
async function checkPublicData(): Promise<APIStatus> {
  const startTime = Date.now();

  if (!PUBLIC_DATA_API_KEY) {
    return {
      name: '공공데이터포털',
      configured: false,
      valid: null,
      message: 'PUBLIC_DATA_API_KEY가 설정되지 않았습니다.',
      note: 'https://www.data.go.kr/ 에서 API 키를 발급받으세요.',
    };
  }

  try {
    // 금융위원회 주식시세 API 테스트
    const response = await axios.get(
      `https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo?serviceKey=${PUBLIC_DATA_API_KEY}&numOfRows=1&resultType=json`,
      { timeout: 10000, validateStatus: () => true }
    );

    const latency = Date.now() - startTime;

    if (response.status === 200 && response.data?.response?.header?.resultCode === '00') {
      return {
        name: '공공데이터포털',
        configured: true,
        valid: true,
        message: 'API 키가 유효합니다.',
        latency,
      };
    } else if (response.data?.response?.header?.resultCode) {
      const resultCode = response.data.response.header.resultCode;
      const resultMsg = response.data.response.header.resultMsg || '';
      return {
        name: '공공데이터포털',
        configured: true,
        valid: false,
        message: `오류 (${resultCode}): ${resultMsg}`,
        statusCode: parseInt(resultCode),
        latency,
      };
    } else {
      return {
        name: '공공데이터포털',
        configured: true,
        valid: false,
        message: `예상치 못한 응답 (${response.status})`,
        statusCode: response.status,
        latency,
      };
    }
  } catch (error) {
    return {
      name: '공공데이터포털',
      configured: true,
      valid: false,
      message: error instanceof Error ? error.message : '연결 오류',
      latency: Date.now() - startTime,
    };
  }
}

/**
 * KIS (한국투자증권) API 검사
 */
async function checkKIS(): Promise<APIStatus> {
  const startTime = Date.now();

  if (!KIS_APP_KEY || !KIS_APP_SECRET) {
    return {
      name: '한국투자증권 (KIS)',
      configured: false,
      valid: null,
      message: 'KIS_APP_KEY 또는 KIS_APP_SECRET이 설정되지 않았습니다.',
      note: 'https://apiportal.koreainvestment.com/ 에서 앱 키를 발급받으세요.',
    };
  }

  try {
    // 토큰 발급 테스트
    const response = await axios.post(
      'https://openapi.koreainvestment.com:9443/oauth2/tokenP',
      {
        grant_type: 'client_credentials',
        appkey: KIS_APP_KEY,
        appsecret: KIS_APP_SECRET,
      },
      {
        timeout: 10000,
        validateStatus: () => true,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const latency = Date.now() - startTime;

    if (response.status === 200 && response.data?.access_token) {
      return {
        name: '한국투자증권 (KIS)',
        configured: true,
        valid: true,
        message: 'API 키가 유효합니다.',
        latency,
      };
    } else if (response.data?.error_code) {
      return {
        name: '한국투자증권 (KIS)',
        configured: true,
        valid: false,
        message: `오류: ${response.data.error_description || response.data.error_code}`,
        statusCode: response.status,
        latency,
      };
    } else {
      return {
        name: '한국투자증권 (KIS)',
        configured: true,
        valid: false,
        message: `예상치 못한 응답 (${response.status})`,
        statusCode: response.status,
        latency,
      };
    }
  } catch (error) {
    return {
      name: '한국투자증권 (KIS)',
      configured: true,
      valid: false,
      message: error instanceof Error ? error.message : '연결 오류',
      latency: Date.now() - startTime,
    };
  }
}

/**
 * Gemini API 검사
 */
async function checkGemini(): Promise<APIStatus> {
  const startTime = Date.now();
  const geminiKeys = [GEMINI_API_KEY_01, GEMINI_API_KEY_02, GEMINI_API_KEY_03].filter(Boolean);

  if (geminiKeys.length === 0) {
    return {
      name: 'Google Gemini',
      configured: false,
      valid: null,
      message: 'GEMINI_API_KEY가 설정되지 않았습니다.',
      note: 'https://aistudio.google.com/app/apikey 에서 API 키를 발급받으세요.',
    };
  }

  try {
    // 첫 번째 키로 테스트
    const testKey = geminiKeys[0];
    const response = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${testKey}`,
      { timeout: 10000, validateStatus: () => true }
    );

    const latency = Date.now() - startTime;

    if (response.status === 200 && response.data?.models) {
      return {
        name: 'Google Gemini',
        configured: true,
        valid: true,
        message: `API 키가 유효합니다. (${geminiKeys.length}개 키 설정됨)`,
        latency,
      };
    } else if (response.status === 400 || response.status === 403) {
      return {
        name: 'Google Gemini',
        configured: true,
        valid: false,
        message: response.data?.error?.message || 'API 키가 유효하지 않습니다.',
        statusCode: response.status,
        latency,
      };
    } else {
      return {
        name: 'Google Gemini',
        configured: true,
        valid: false,
        message: `예상치 못한 응답 (${response.status})`,
        statusCode: response.status,
        latency,
      };
    }
  } catch (error) {
    return {
      name: 'Google Gemini',
      configured: true,
      valid: false,
      message: error instanceof Error ? error.message : '연결 오류',
      latency: Date.now() - startTime,
    };
  }
}

/**
 * Saveticker 계정 검사
 */
async function checkSaveticker(): Promise<APIStatus> {
  if (!SAVETICKER_EMAIL || !SAVETICKER_PASSWORD) {
    return {
      name: 'Saveticker',
      configured: false,
      valid: null,
      message: 'SAVETICKER_EMAIL 또는 SAVETICKER_PASSWORD가 설정되지 않았습니다.',
      note: 'https://www.saveticker.com/ 에서 계정을 생성하세요.',
    };
  }

  // Saveticker는 브라우저 자동화가 필요하므로 설정 여부만 확인
  return {
    name: 'Saveticker',
    configured: true,
    valid: true,
    message: '계정 정보가 설정되어 있습니다. (로그인 테스트는 분석 시 수행)',
    note: '실제 로그인 테스트는 분석 요청 시 수행됩니다.',
  };
}

/**
 * 모든 API 상태 확인
 */
export async function GET(request: NextRequest): Promise<NextResponse<APIStatusResponse>> {
  const searchParams = request.nextUrl.searchParams;
  const specificApis = searchParams.get('api')?.split(',').map((s) => s.trim().toLowerCase());

  const checkFunctions: Record<string, () => Promise<APIStatus>> = {
    krx: checkKRX,
    fmp: checkFMP,
    finnhub: checkFinnhub,
    twelvedata: checkTwelveData,
    publicdata: checkPublicData,
    kis: checkKIS,
    gemini: checkGemini,
    saveticker: checkSaveticker,
  };

  const apisToCheck = specificApis
    ? Object.entries(checkFunctions).filter(([key]) => specificApis.includes(key))
    : Object.entries(checkFunctions);

  // 병렬로 모든 API 확인
  const results = await Promise.all(
    apisToCheck.map(async ([key, checkFn]) => {
      const result = await checkFn();
      return [key, result] as const;
    })
  );

  const apis: Record<string, APIStatus> = {};
  for (const [key, result] of results) {
    apis[key] = result;
  }

  return NextResponse.json({
    success: true,
    timestamp: Date.now(),
    apis,
  });
}
