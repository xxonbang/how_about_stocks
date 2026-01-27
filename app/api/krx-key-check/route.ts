/**
 * KRX API 키 유효성 검사 엔드포인트
 *
 * GET /api/krx-key-check
 *
 * KRX Open API 키의 유효성을 확인합니다.
 * 실제 API 호출을 통해 키가 유효한지 테스트합니다.
 */

import { NextResponse } from 'next/server';
import axios from 'axios';

// KRX API 설정
const KRX_API_BASE_URL = 'https://data-dbg.krx.co.kr/svc/apis';
const KRX_STOCK_ENDPOINT = '/sto/stk_bydd_trd';
const KRX_API_KEY = process.env.KRX_API_KEY || '';

interface KRXKeyCheckResponse {
  success: boolean;
  valid: boolean;
  message?: string;
  error?: string;
  statusCode?: number;
  note?: string;
}

export async function GET(): Promise<NextResponse<KRXKeyCheckResponse>> {
  // 1. 환경 변수 확인
  if (!KRX_API_KEY) {
    return NextResponse.json({
      success: true,
      valid: false,
      error: 'KRX_API_KEY 환경 변수가 설정되지 않았습니다.',
      note: 'KRX Open API(https://openapi.krx.co.kr/)에서 API 키를 발급받아 .env.local에 설정해주세요.',
    });
  }

  // 2. 실제 API 호출로 키 유효성 테스트
  try {
    // 최근 날짜로 테스트 (오늘 또는 최근 거래일)
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0].replace(/-/g, '');

    const url = `${KRX_API_BASE_URL}${KRX_STOCK_ENDPOINT}`;
    const queryParams = new URLSearchParams({
      AUTH_KEY: KRX_API_KEY,
      basDd: todayStr,
    });

    const response = await axios.get(`${url}?${queryParams.toString()}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
      validateStatus: (status) => true, // 모든 상태 코드 허용 (401, 403 포함)
    });

    // 상태 코드별 처리
    if (response.status === 200) {
      // 성공 - 응답 데이터 확인
      const data = response.data;

      if (data && (data.OutBlock_1 || data.outBlock_1 || data.data || Array.isArray(data))) {
        return NextResponse.json({
          success: true,
          valid: true,
          message: 'API 키가 유효합니다. KRX Open API를 정상적으로 사용할 수 있습니다.',
        });
      } else {
        // 빈 응답 (주말/공휴일일 수 있음)
        return NextResponse.json({
          success: true,
          valid: true,
          message: 'API 키가 유효합니다. (오늘 거래 데이터가 없을 수 있습니다 - 주말/공휴일)',
          note: '주말이나 공휴일에는 거래 데이터가 없을 수 있습니다.',
        });
      }
    }

    if (response.status === 401) {
      return NextResponse.json({
        success: true,
        valid: false,
        error: 'API 키가 유효하지 않습니다.',
        statusCode: 401,
        note: 'API 키가 만료되었거나 잘못되었습니다. KRX Open API에서 새 키를 발급받아주세요.',
      });
    }

    if (response.status === 403) {
      return NextResponse.json({
        success: true,
        valid: false,
        error: 'API 사용 권한이 없습니다.',
        statusCode: 403,
        note: 'API 사용 신청이 아직 승인되지 않았거나, 해당 API에 대한 접근 권한이 없습니다.',
      });
    }

    if (response.status === 429) {
      return NextResponse.json({
        success: true,
        valid: true, // 키 자체는 유효
        message: 'API 키는 유효하지만 일일 요청 한도를 초과했습니다.',
        statusCode: 429,
        note: 'KRX API는 하루 10,000회 요청 제한이 있습니다. 내일 다시 시도해주세요.',
      });
    }

    // 기타 상태 코드
    return NextResponse.json({
      success: true,
      valid: false,
      error: `예상치 못한 응답 (상태 코드: ${response.status})`,
      statusCode: response.status,
      note: 'KRX API 서버에서 예상치 못한 응답이 반환되었습니다.',
    });
  } catch (error) {
    // 네트워크 오류 또는 타임아웃
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('timeout')) {
      return NextResponse.json({
        success: false,
        valid: false,
        error: 'KRX API 서버 응답 시간 초과',
        note: 'KRX API 서버가 응답하지 않습니다. 잠시 후 다시 시도해주세요.',
      });
    }

    return NextResponse.json({
      success: false,
      valid: false,
      error: `API 검사 중 오류 발생: ${errorMessage}`,
      note: '네트워크 문제 또는 KRX API 서버 문제일 수 있습니다.',
    });
  }
}
