/**
 * Python 스크립트를 사용한 주식 데이터 수집
 * 
 * Vercel 환경: Serverless Functions (Python Runtime)
 * 로컬 환경: child_process로 Python 스크립트 직접 실행
 * 
 * 장점:
 * - 별도 서버 불필요
 * - yfinance-cache + FinanceDataReader 사용
 * - Rate limit 문제 해결
 */

import type { StockData } from './finance';
import { spawn } from 'child_process';
import { join } from 'path';
import { normalizeStockSymbolHybrid } from './korea-stock-mapper';
import { validateStockData } from './data-validator';
import { metrics } from './data-metrics';
import { logger, toAppError } from './utils';
import { findPythonCommand } from './python-utils';

/**
 * Python 스크립트를 실행하여 주식 데이터 수집
 * @param symbol 주식 티커 (예: "AAPL", "005930.KS")
 * @param period 분석 기간 (예: "1m", "3m", "1y")
 */
interface PythonScriptResult {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  rsi: number;
  movingAverages: {
    ma5: number;
    ma20: number;
    ma60: number;
    ma120: number;
  };
  disparity: number;
  historicalData: Array<{
    date: string;
    close: number;
    volume: number;
    high?: number;
    low?: number;
    open?: number;
  }>;
  error?: string;
}

// Python 명령어 캐시 (한 번만 찾고 재사용)
let cachedPythonCommand: string | null = null;

async function getPythonCommand(): Promise<string> {
  if (cachedPythonCommand) {
    return cachedPythonCommand;
  }
  
  try {
    const { command } = await findPythonCommand();
    cachedPythonCommand = command;
    return command;
  } catch (error) {
    const appError = toAppError(error, 'Python command not found');
    logger.error('[Python] Failed to find Python command:', appError.message);
    throw appError;
  }
}

async function runPythonScript(symbol: string, period: string = '1m'): Promise<PythonScriptResult> {
  return new Promise(async (resolve, reject) => {
    try {
      const pythonCommand = await getPythonCommand();
      const scriptPath = join(process.cwd(), 'scripts', 'test_python_stock.py');
      const pythonProcess = spawn(pythonCommand, [scriptPath, symbol, period]);

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      // stderr는 무시 (경고 메시지 등)
      errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
      // stderr에 경고만 있고 실제 오류가 아닐 수 있으므로 JSON이 있으면 성공으로 처리
      const hasJson = output.includes('{') && output.includes('}');
      
      if (code !== 0 && !hasJson) {
        reject(new Error(`Python script failed with code ${code}: ${errorOutput.substring(0, 500)}`));
        return;
      }

      try {
        // JSON 출력 찾기
        // Python 스크립트는 한 줄 JSON을 출력
        // 하지만 stderr 경고가 섞일 수 있으므로 { 부터 } 까지 추출
        
        // 모든 줄에서 JSON 찾기
        const lines = output.split('\n');
        let jsonText = '';
        
        // 뒤에서부터 찾기 (마지막에 출력된 JSON이 실제 결과)
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (line.startsWith('{')) {
            // 이 줄부터 시작해서 마지막 } 찾기
            const startIdx = output.lastIndexOf(line);
            const endIdx = output.lastIndexOf('}') + 1;
            if (startIdx !== -1 && endIdx > startIdx) {
              jsonText = output.substring(startIdx, endIdx);
              break;
            }
          }
        }

        // 위 방법이 실패하면 첫 { 부터 마지막 } 까지
        if (!jsonText) {
          const jsonStart = output.indexOf('{');
          const jsonEnd = output.lastIndexOf('}') + 1;
          if (jsonStart !== -1 && jsonEnd > jsonStart) {
            jsonText = output.substring(jsonStart, jsonEnd);
          }
        }

        if (!jsonText) {
          reject(new Error(`No JSON found in output. Output length: ${output.length}, Preview: ${output.substring(0, 500)}`));
          return;
        }

        // JSON 파싱
        const result = JSON.parse(jsonText);
        
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result);
        }
      } catch (e) {
        // 디버깅을 위해 전체 출력 포함
        const errorMsg = e instanceof Error ? e.message : String(e);
        reject(new Error(`Failed to parse Python output: ${errorMsg}. Output length: ${output.length}, Preview: ${output.substring(0, 1000)}`));
      }
    });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Vercel Serverless Function 또는 Python 스크립트를 통해 주식 데이터 수집
 * @param symbol 주식 티커 (예: "AAPL", "005930.KS")
 * @param period 분석 기간 (예: "1m", "3m", "1y")
 */
export async function fetchStockDataVercel(symbol: string, period: string = '1m'): Promise<StockData> {
  const startTime = Date.now();
  
  try {
    let data: PythonScriptResult;

    // Vercel 환경에서는 Serverless Function 사용
    if (process.env.VERCEL) {
      const response = await fetch(`/api/stock/${symbol}`);
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `Failed to fetch data for ${symbol}`);
      }
      
      data = await response.json();
    } else {
      // 로컬 환경에서는 Python 스크립트 직접 실행
      data = await runPythonScript(symbol, period);
    }
    
    // 응답을 StockData 형식으로 변환 및 검증
    try {
      const validatedData = await validateStockData(data);
      const responseTime = Date.now() - startTime;
      metrics.success(symbol, 'Python (Vercel)', responseTime, {
        period,
        historicalDataPoints: validatedData.historicalData.length,
      });
      return validatedData;
    } catch (validationError) {
      const appError = toAppError(validationError, 'Invalid stock data received');
      metrics.error(symbol, 'Python (Vercel)', appError.message, { period });
      logger.error(`[Data Validation] Failed to validate stock data for ${symbol}:`, appError.message);
      throw appError;
    }
  } catch (error) {
    const appError = toAppError(error, `Failed to fetch stock data for ${symbol}`);
    metrics.error(symbol, 'Python (Vercel)', appError.message);
    logger.error(`Error fetching Python data for ${symbol}:`, appError);
    throw appError;
  }
}

/**
 * 여러 종목의 데이터를 배치로 수집
 * @param symbols 종목 리스트
 * @param period 분석 기간 (예: "1m", "3m", "1y")
 */
export async function fetchStocksDataBatchVercel(
  symbols: string[],
  period: string = '1m'
): Promise<Map<string, StockData>> {
  const results = new Map<string, StockData>();

  // 심볼 정규화 (하이브리드 방식: 하드코딩 + 동적 검색)
  // 동적 매핑 사용 여부 확인 (환경 변수 또는 기본값)
  // 기본적으로 동적 매핑 활성화 (USE_DYNAMIC_TICKER_MAPPING=false로 비활성화 가능)
  const useDynamicMapping = process.env.USE_DYNAMIC_TICKER_MAPPING !== 'false';
  
  logger.debug(`[Symbol Normalization] Using ${useDynamicMapping ? 'hybrid (static + dynamic)' : 'static only'} mapping`);
  
  // 심볼 정규화 (통합된 하이브리드 방식 사용)
  const normalizedSymbols = await Promise.all(
    symbols.map(async (symbol) => {
      let normalized: string;
      
      try {
        // 통합된 하이브리드 방식 사용 (정적 + 동적)
        normalized = await normalizeStockSymbolHybrid(symbol, useDynamicMapping);
        
        // 한글 종목명이 티커로 변환되지 않은 경우 에러 발생
        const isKoreanName = /[가-힣]/.test(normalized);
        const isTicker = /^\d{6}$/.test(normalized) || normalized.includes('.KS') || normalized.includes('.KQ');
        
        if (isKoreanName && !isTicker) {
          // 1. 로컬 검색 우선 시도 (안정성 100%)
          try {
            const { findTickerByNameServer } = await import('./local-stock-search-server');
            const localTicker = await findTickerByNameServer(normalized);
            
            if (localTicker) {
              normalized = `${localTicker}.KS`;
              logger.debug(`[Symbol Normalization] Local search found: ${symbol} -> ${normalized}`);
            }
          } catch (localError) {
            logger.debug('[Symbol Normalization] Local search failed, trying dynamic mapping:', localError);
          }
          
          // 2. 로컬 검색 실패 시 동적 매핑 시도
          if (!normalized.includes('.KS') && !normalized.includes('.KQ') && !/^\d{6}$/.test(normalized)) {
            if (useDynamicMapping) {
              try {
                const { searchTickerByName } = await import('./korea-stock-mapper-dynamic');
                let ticker = await searchTickerByName(normalized);
                
                // 동적 검색 실패 시 실시간 네이버 금융 검색 시도
                if (!ticker) {
                  try {
                    logger.debug(`[Symbol Normalization] Trying real-time Naver Finance search for: ${normalized}`);
                    const { findPythonCommand } = await import('./python-utils');
                    const { spawn } = await import('child_process');
                    const { join } = await import('path');
                    
                    const pythonCmd = await findPythonCommand();
                    const scriptPath = join(process.cwd(), 'scripts', 'search_stock_by_name.py');
                    
                    const execPromise = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
                      const proc = spawn(pythonCmd.command, [scriptPath, normalized], {
                        cwd: process.cwd(),
                        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
                      });
                      
                      let stdout = '';
                      let stderr = '';
                      
                      proc.stdout?.on('data', (data) => {
                        stdout += data.toString();
                      });
                      
                      proc.stderr?.on('data', (data) => {
                        stderr += data.toString();
                      });
                      
                      proc.on('close', (code) => {
                        if (code === 0) {
                          resolve({ stdout, stderr });
                        } else {
                          reject(new Error(`Python script exited with code ${code}: ${stderr}`));
                        }
                      });
                      
                      proc.on('error', (error) => {
                        reject(error);
                      });
                    });
                    
                    const { stdout } = await execPromise;
                    const searchResult = JSON.parse(stdout);
                    
                    if (searchResult.success && searchResult.data && searchResult.data.length > 0) {
                      // 검색어와 정확히 일치하는 종목 찾기 (정확한 매칭 우선)
                      const normalizedSearch = normalized.replace(/\s+/g, '').replace('㈜', '').replace('(주)', '');
                      
                      // 1. 정확한 매칭 우선
                      let exactMatch = searchResult.data.find((stock: { Name: string; Symbol: string }) => {
                        const normalizedName = stock.Name.replace(/\s+/g, '').replace('㈜', '').replace('(주)', '');
                        return normalizedName === normalizedSearch;
                      });
                      
                      // 2. 정확한 매칭이 없으면 부분 매칭 시도
                      if (!exactMatch) {
                        exactMatch = searchResult.data.find((stock: { Name: string; Symbol: string }) => {
                          const normalizedName = stock.Name.replace(/\s+/g, '').replace('㈜', '').replace('(주)', '');
                          return normalizedName.includes(normalizedSearch) || normalizedSearch.includes(normalizedName);
                        });
                      }
                      
                      if (exactMatch && exactMatch.Symbol) {
                        ticker = exactMatch.Symbol;
                        logger.debug(`[Symbol Normalization] Real-time search found: ${normalized} -> ${ticker} (${exactMatch.Name})`);
                      } else {
                        logger.warn(`[Symbol Normalization] Real-time search found ${searchResult.data.length} results but no exact match for: ${normalized}`);
                      }
                    } else {
                      logger.warn(`[Symbol Normalization] Real-time search returned no results for: ${normalized}`);
                    }
                  } catch (searchError) {
                    logger.warn(`[Symbol Normalization] Real-time search failed for ${normalized}:`, searchError);
                  }
                }
                
                if (ticker) {
                  normalized = `${ticker}.KS`;
                  logger.debug(`[Symbol Normalization] Dynamic mapping succeeded: ${symbol} -> ${normalized}`);
                } else {
                  throw new Error(`종목 **"${symbol}"**을(를) 찾을 수 없습니다.\n\n정확한 종목명 또는 종목코드(6자리 숫자)를 입력해주세요.\n예: "삼성전자" 또는 "005930"`);
                }
              } catch (dynamicError) {
                const errorMessage = dynamicError instanceof Error ? dynamicError.message : String(dynamicError);
                logger.error(`[Symbol Normalization] Dynamic mapping failed for ${symbol}:`, errorMessage);
                throw new Error(`종목 "${symbol}"을(를) 찾을 수 없습니다. 정확한 종목명 또는 티커를 입력해주세요.`);
              }
            } else {
              throw new Error(`종목 "${symbol}"을(를) 찾을 수 없습니다. 정확한 종목명 또는 티커를 입력해주세요.`);
            }
          }
        }
      } catch (error) {
        // 정규화 실패 시 에러를 그대로 전달 (사용자에게 명확한 메시지 제공)
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`[Symbol Normalization] Failed to normalize ${symbol}:`, errorMessage);
        throw error; // 원본 사용 대신 에러를 전달하여 명확한 메시지 제공
      }
      
      if (normalized !== symbol) {
        logger.debug(`[Symbol Normalization] ${symbol} -> ${normalized}`);
      }
      
      return {
        original: symbol,
        normalized,
      };
    })
  );

  // 병렬 처리로 성능 개선 (Rate limit 고려하여 배치 처리)
  // 배치 크기: 한 번에 최대 5개 종목 처리
  const BATCH_SIZE = 5;
  const BATCH_DELAY = 500; // 배치 간 딜레이 (ms)

  for (let i = 0; i < normalizedSymbols.length; i += BATCH_SIZE) {
    const batch = normalizedSymbols.slice(i, i + BATCH_SIZE);
    
    // 배치 내에서는 병렬 처리
    const batchPromises = batch.map(async ({ original, normalized }) => {
      try {
        // 한글 종목명이 티커로 변환되지 않은 경우 에러 발생
        const isKoreanName = /[가-힣]/.test(normalized);
        const isTicker = /^\d{6}$/.test(normalized) || normalized.includes('.KS') || normalized.includes('.KQ');
        
        if (isKoreanName && !isTicker) {
          throw new Error(`종목 "${original}"을(를) 찾을 수 없습니다. 정확한 종목명 또는 티커를 입력해주세요.`);
        }
        
        const stockData = await fetchStockDataVercel(normalized, period);
        return { original, stockData };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`[fetchStocksDataBatchVercel] Failed to fetch data for ${original} (${normalized}):`, errorMessage);
        // 심볼 정규화 실패인 경우 명확한 에러 메시지 제공
        if (errorMessage.includes('찾을 수 없습니다')) {
          throw error;
        }
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    
    // 성공한 결과만 저장
    for (const result of batchResults) {
      if (result) {
        results.set(result.original, result.stockData);
      }
    }

    // 마지막 배치가 아니면 딜레이 추가 (Rate limit 방지)
    if (i + BATCH_SIZE < normalizedSymbols.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
    }
  }

  // 모든 종목이 실패한 경우 오류 발생
  if (results.size === 0) {
    throw new Error(`모든 종목 데이터 수집에 실패했습니다. 입력한 종목: ${symbols.join(', ')}`);
  }

  return results;
}
