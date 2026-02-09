/**
 * KRX Open API를 사용한 한국 주식 데이터 수집
 * 
 * 한국거래소(KRX) 공식 Open API 사용
 * https://openapi.krx.co.kr/
 * 
 * 사용 API:
 * - 유가증권 일별매매정보 API
 * - ETF 일별매매정보 API
 * 
 * 장점:
 * - 공식 API (안정적, 법적 리스크 없음)
 * - 무료 사용 가능
 * - 실시간 데이터 제공
 * 
 * 단점:
 * - API 키 발급 필요
 * - 하루 10,000회 제한
 * 
 * Fallback:
 * - KRX API 호출 실패 시 자동으로 네이버 금융 크롤링으로 fallback
 */

import axios from 'axios';
import type { SupplyDemandData } from './finance';

// KRX API 실제 엔드포인트 (캡처 이미지에서 확인)
const KRX_API_BASE_URL = 'https://data-dbg.krx.co.kr/svc/apis';
const KRX_STOCK_ENDPOINT = '/sto/stk_bydd_trd'; // 유가증권 일별매매정보
const KRX_ETF_ENDPOINT = '/etp/etf_bydd_trd'; // ETF 일별매매정보
const KRX_API_KEY = process.env.KRX_API_KEY || '';

/**
 * KRX API 공통 응답 구조
 * 
 * KRX Open API는 일반적으로 OutBlock_1 배열로 응답
 * 실제 응답 구조가 다를 경우 자동으로 fallback 작동
 */
interface KRXResponse<T> {
  OutBlock_1?: T[];
  outBlock_1?: T[]; // 소문자 변형
  data?: T[]; // 다른 구조일 수 있음
  [key: string]: any; // 유연한 구조 지원
}

interface KRXStockTradingInfo {
  ISU_CD: string; // 종목코드
  ISU_NM: string; // 종목명
  TDD_CLSPRC: string; // 종가
  CMPPREVDD_PRC: string; // 대비
  FLUC_RT: string; // 등락률
  TDD_OPNPRC: string; // 시가
  TDD_HGPRC: string; // 고가
  TDD_LWPRC: string; // 저가
  ACC_TRDVOL: string; // 거래량
  ACC_TRDVAL: string; // 거래대금
  MKTCAP: string; // 시가총액
  LIST_SHRS: string; // 상장주식수
}

/**
 * 유가증권 일별매매정보 API 응답 인터페이스
 * 
 * 실제 API 명세서 기반 (캡처 이미지에서 확인)
 * OutBlock_1 (Block, repeat: multi) 구조
 */
interface KRXStockDailyTradingInfo {
  // 기준일자 및 종목 정보
  BAS_DD?: string; // 기준일자 (YYYYMMDD) - 실제 API 필드명
  ISU_CD?: string; // 종목코드
  ISU_NM?: string; // 종목명
  MKT_NM?: string; // 시장구분 (KOSPI, KOSDAQ 등)
  SECT_TP_NM?: string; // 소속부
  
  // 가격 정보
  TDD_CLSPRC?: string; // 종가
  CMPPREVDD_PRC?: string; // 대비
  FLUC_RT?: string; // 등락률
  TDD_OPNPRC?: string; // 시가
  TDD_HGPRC?: string; // 고가
  TDD_LWPRC?: string; // 저가
  
  // 거래 정보
  ACC_TRDVOL?: string; // 거래량
  ACC_TRDVAL?: string; // 거래대금
  MKTCAP?: string; // 시가총액
  LIST_SHRS?: string; // 상장주식수
  
  // 투자자별 매매동향 (실제 API 응답에 포함되지 않음 - 별도 API 필요)
  // ⚠️ 캡처 이미지의 OUTPUT 정보에 투자자별 필드가 없음
  // 네이버 크롤링 fallback 사용 필요
  INSTI_BY_QTY?: string; // 기관 순매수량 (별도 API)
  FRGN_BY_QTY?: string; // 외국인 순매수량 (별도 API)
  PRSN_INBY_QTY?: string; // 개인 순매수량 (별도 API)
  
  // 하위 호환성을 위한 필드명 변형 지원
  STD_DD?: string; // 기준일자 (하위 호환)
  [key: string]: any;
}

/**
 * ETF 일별매매정보 API 응답 인터페이스
 * 
 * 실제 API 명세서 기반 (캡처 이미지에서 확인)
 * OutBlock_1 (Block, repeat: multi) 구조
 */
interface KRXETFDailyTradingInfo {
  // 기준일자 및 종목 정보
  BAS_DD?: string; // 기준일자 (YYYYMMDD) - 실제 API 필드명
  ISU_CD?: string; // 종목코드
  ISU_NM?: string; // 종목명
  
  // 가격 정보
  TDD_CLSPRC?: string; // 종가
  CMPPREVDD_PRC?: string; // 대비
  FLUC_RT?: string; // 등락률
  NAV?: string; // 순자산가치(NAV) - ETF 전용
  TDD_OPNPRC?: string; // 시가
  TDD_HGPRC?: string; // 고가
  TDD_LWPRC?: string; // 저가
  
  // 거래 정보
  ACC_TRDVOL?: string; // 거래량
  ACC_TRDVAL?: string; // 거래대금
  MKTCAP?: string; // 시가총액
  INVSTASST_NETASST_TOT?: string; // 순자산총액 - ETF 전용
  LIST_SHRS?: string; // 상장좌수
  
  // 기초지수 정보 (ETF 전용)
  IDX_IND_NM?: string; // 기초지수_지수명
  OBJ_STKPRC_IDX?: string; // 기초지수_종가
  CMPPREVDD_IDX?: string; // 기초지수_대비
  FLUC_RT_IDX?: string; // 기초지수_등락률
  
  // 하위 호환성을 위한 필드명 변형 지원
  STD_DD?: string; // 기준일자 (하위 호환)
  [key: string]: any;
}

/**
 * 투자자별 매매동향 정보 (레거시, 실제 API 구조 확인 후 업데이트 필요)
 */
interface KRXInvestorTradingInfo {
  ISU_CD: string; // 종목코드
  ISU_NM: string; // 종목명
  STD_DD: string; // 기준일자
  INSTI_BY_QTY: string; // 기관 순매수량
  FRGN_BY_QTY: string; // 외국인 순매수량
  PRSN_INBY_QTY: string; // 개인 순매수량
}

/**
 * KRX API 호출 헬퍼
 */
async function krxRequest<T>(
  endpoint: string,
  params: Record<string, string>
): Promise<T[]> {
  // 동적 import를 사용하여 순환 참조 방지
  let alertSystem: any = null;
  if (!KRX_API_KEY) {
    throw new Error('KRX_API_KEY가 설정되지 않았습니다. 환경 변수에 KRX_API_KEY를 설정해주세요.');
  }

  // 실제 API 엔드포인트 URL 구성
  const url = `${KRX_API_BASE_URL}${endpoint}`;
  
  // 실제 API 파라미터 구조 (캡처 이미지에서 확인)
  // InBlock_1 구조로 전달해야 하며, basDd (기준일자) 파라미터 사용
  const queryParams = new URLSearchParams({
    AUTH_KEY: KRX_API_KEY,
    ...params,
  });

  try {
    const response = await axios.get<KRXResponse<T>>(`${url}?${queryParams.toString()}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    // 다양한 응답 구조 지원
    if (response.data) {
      if (response.data.OutBlock_1 && Array.isArray(response.data.OutBlock_1)) {
        return response.data.OutBlock_1;
      }
      if (response.data.outBlock_1 && Array.isArray(response.data.outBlock_1)) {
        return response.data.outBlock_1;
      }
      if (response.data.data && Array.isArray(response.data.data)) {
        return response.data.data;
      }
      // 배열 자체가 응답인 경우
      if (Array.isArray(response.data)) {
        return response.data;
      }
    }

    return [];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        // API 키 무효 알림 생성 (비동기, 실패해도 계속 진행)
        try {
          if (!alertSystem) {
            const alertModule = await import('./alert-system');
            alertSystem = alertModule.alertSystem;
          }
        await alertSystem.alertApiKeyInvalid(
          'KRX API',
          '401 Unauthorized 오류가 발생했습니다. API 키가 만료되었거나 유효하지 않을 수 있습니다.',
          {
            statusCode: 401,
            endpoint,
            timestamp: Date.now(),
            note: 'KRX API 키는 1년 유효기간이 있습니다. 만료된 경우 새 키를 발급받아야 합니다.',
          }
        );
        } catch (alertError) {
          // 알림 생성 실패는 무시
          console.warn('[KRX API] Failed to create alert:', alertError);
        }
        throw new Error('KRX API 키가 유효하지 않습니다. API 키가 만료되었거나 유효하지 않을 수 있습니다. KRX Open API(https://openapi.krx.co.kr/)에서 새 키를 발급받아주세요.');
      }
      if (error.response?.status === 403) {
        // 403 오류는 권한 없음 (엔드포인트 오류일 수도 있음)
        throw new Error('KRX API 접근 권한이 없습니다. API 엔드포인트 또는 권한을 확인해주세요.');
      }
      if (error.response?.status === 429) {
        throw new Error('KRX API 요청 한도 초과. 하루 10,000회 제한을 초과했습니다.');
      }
      throw new Error(`KRX API 오류: ${error.message}`);
    }
    throw error;
  }
}

/**
 * KRX Open API를 사용하여 한국 주식 수급 데이터 수집
 * 
 * 사용 API: 유가증권 일별매매정보 API
 * 
 * @param symbol 한국 주식 티커 (예: "005930")
 * @returns 수급 데이터 또는 null (실패 시, 자동으로 네이버 크롤링으로 fallback)
 */
export async function fetchKoreaSupplyDemandKRX(
  symbol: string
): Promise<SupplyDemandData | null> {
  const startTime = Date.now();
  const { metrics } = await import('./data-metrics');

  try {
    if (!KRX_API_KEY) {
      console.warn('[KRX API] API 키가 설정되지 않아 네이버 금융 크롤링으로 fallback');
      return null;
    }

    // 최근 거래일 조회 (오늘 또는 가장 최근 거래일)
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const todayStr = today.toISOString().split('T')[0].replace(/-/g, '');
    
    // 유가증권 일별매매정보 API 호출
    // 실제 엔드포인트: /sto/stk_bydd_trd
    // 실제 파라미터: basDd (기준일자, string(8))
    const tradingInfo = await krxRequest<KRXStockDailyTradingInfo>(
      KRX_STOCK_ENDPOINT,
      {
        basDd: todayStr, // 실제 API 파라미터명
      }
    );

    if (tradingInfo.length === 0) {
      // 어제 데이터로 재시도
      const yesterdayStr = yesterday.toISOString().split('T')[0].replace(/-/g, '');
      const tradingInfoYesterday = await krxRequest<KRXStockDailyTradingInfo>(
        KRX_STOCK_ENDPOINT,
        {
          basDd: yesterdayStr, // 실제 API 파라미터명
        }
      );

      if (tradingInfoYesterday.length === 0) {
        console.warn(`[KRX API] No trading data found for ${symbol}, falling back to Naver`);
        return null;
      }

      const data = tradingInfoYesterday[0];
      
      // ⚠️ 실제 API 응답에 투자자별 매매동향 필드가 포함되지 않음 (캡처 이미지 확인)
      // OUTPUT 정보에 INSTI_BY_QTY, FRGN_BY_QTY, PRSN_INBY_QTY 필드가 없음
      // 네이버 크롤링으로 fallback
      console.warn(`[KRX API] Investor trading data not available in daily trading info API for ${symbol}, falling back to Naver`);
      return null;
    }

    // ⚠️ 실제 API 응답에 투자자별 매매동향 필드가 포함되지 않음 (캡처 이미지 확인)
    // OUTPUT 정보에 INSTI_BY_QTY, FRGN_BY_QTY, PRSN_INBY_QTY 필드가 없음
    // 네이버 크롤링으로 fallback
    console.warn(`[KRX API] Investor trading data not available in daily trading info API for ${symbol}, falling back to Naver`);
    return null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    metrics.error(symbol, 'KRX API', errorMessage);
    
    // 401 오류는 이미 알림이 생성되었으므로 별도 처리
    if (errorMessage.includes('401') || errorMessage.includes('유효하지 않습니다')) {
      console.warn(`[KRX API] API key invalid for ${symbol}, falling back to Naver (alert already created)`);
    } else {
      console.warn(`[KRX API] Error fetching supply/demand for ${symbol}, falling back to Naver:`, errorMessage);
    }
    
    // 오류 발생 시 null 반환 (fallback으로 네이버 크롤링 사용)
    return null;
  }
}

/**
 * KRX Open API를 사용하여 한국 주식 기본 정보 수집
 * 
 * 사용 API: 유가증권 일별매매정보 API
 * 
 * @param symbol 한국 주식 티커 (예: "005930")
 * @returns 주식 기본 정보 또는 null (실패 시)
 */
export async function fetchKoreaStockInfoKRX(symbol: string): Promise<{
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
} | null> {
  try {
    if (!KRX_API_KEY) {
      return null;
    }

    // 최근 5일까지 탐색 (주말+공휴일 커버)
    const MAX_DAYS_BACK = 5;
    for (let daysBack = 0; daysBack < MAX_DAYS_BACK; daysBack++) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - daysBack);
      const dateStr = targetDate.toISOString().split('T')[0].replace(/-/g, '');

      const stockInfo = await krxRequest<KRXStockDailyTradingInfo>(
        KRX_STOCK_ENDPOINT,
        { basDd: dateStr }
      );

      if (stockInfo.length === 0) continue;

      const data = stockInfo[0];
      const name = data.ISU_NM || '';
      const closePrice = data.TDD_CLSPRC || '0';
      const change = data.CMPPREVDD_PRC || '0';
      const changePercent = data.FLUC_RT || '0';
      const volume = data.ACC_TRDVOL || '0';

      return {
        name,
        price: parseFloat(String(closePrice).replace(/,/g, '')) || 0,
        change: parseFloat(String(change).replace(/[+,]/g, '')) || 0,
        changePercent: parseFloat(String(changePercent).replace(/[+,%]/g, '')) || 0,
        volume: parseInt(String(volume).replace(/,/g, '')) || 0,
      };
    }

    return null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[KRX API] Error fetching stock info for ${symbol}, falling back:`, errorMessage);
    return null;
  }
}

/**
 * KRX Open API를 사용하여 ETF 정보 수집
 * 
 * 사용 API: ETF 일별매매정보 API
 * 
 * @param symbol ETF 티커 (예: "069500")
 * @returns ETF 정보 또는 null (실패 시)
 */
export async function fetchKoreaETFInfoKRX(symbol: string): Promise<{
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  nav?: number; // NAV (순자산가치)
} | null> {
  try {
    if (!KRX_API_KEY) {
      return null;
    }

    // symbol과 일치하는 ETF 찾기
    // ISU_CD는 ISIN 형식(KR7396500006) 또는 단축코드(396500)일 수 있음
    const findETF = (items: KRXETFDailyTradingInfo[]) => {
      // 1) 정확한 ISU_CD 매칭
      const exact = items.find((item) => item.ISU_CD === symbol);
      if (exact) return exact;
      // 2) ISIN 코드 내 단축코드 포함 매칭 (KR7XXXXXX... 형식)
      const byIsin = items.find((item) =>
        item.ISU_CD && item.ISU_CD.includes(symbol)
      );
      if (byIsin) return byIsin;
      // 3) ISU_SRT_CD (단축코드) 필드 매칭 (API가 지원하는 경우)
      const byShort = items.find((item) =>
        (item as Record<string, unknown>).ISU_SRT_CD === symbol
      );
      return byShort || null;
    };

    const parseETFData = (data: KRXETFDailyTradingInfo) => {
      const name = data.ISU_NM || '';
      const closePrice = data.TDD_CLSPRC || '0';
      const change = data.CMPPREVDD_PRC || '0';
      const changePercent = data.FLUC_RT || '0';
      const volume = data.ACC_TRDVOL || '0';
      const nav = data.NAV ? parseFloat(String(data.NAV).replace(/,/g, '')) : undefined;

      if (!nav || nav === 0) {
        console.warn(`[KRX API] ETF ${symbol} found (${name}) but NAV is missing or 0`);
        return null;
      }

      return {
        name,
        price: parseFloat(String(closePrice).replace(/,/g, '')) || 0,
        change: parseFloat(String(change).replace(/[+,]/g, '')) || 0,
        changePercent: parseFloat(String(changePercent).replace(/[+,%]/g, '')) || 0,
        volume: parseInt(String(volume).replace(/,/g, '')) || 0,
        nav,
      };
    };

    // 최근 5일까지 탐색 (주말+공휴일 커버)
    const MAX_DAYS_BACK = 5;
    for (let daysBack = 0; daysBack < MAX_DAYS_BACK; daysBack++) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - daysBack);
      const dateStr = targetDate.toISOString().split('T')[0].replace(/-/g, '');

      const etfData = await krxRequest<KRXETFDailyTradingInfo>(
        KRX_ETF_ENDPOINT,
        { basDd: dateStr }
      );

      if (etfData.length === 0) continue;

      const matchingETF = findETF(etfData);
      if (!matchingETF) continue;

      const parsed = parseETFData(matchingETF);
      if (parsed) return parsed;
    }

    return null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[KRX API] Error fetching ETF info for ${symbol}, falling back:`, errorMessage);
    return null;
  }
}
