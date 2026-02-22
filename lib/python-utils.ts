/**
 * Python 관련 유틸리티 함수
 * 서버 사이드에서만 사용됩니다.
 */

import { spawn } from 'child_process';
import { logger, AppError } from './utils';

/**
 * Python 버전 체크 결과
 */
interface PythonVersionCheck {
  command: string;
  version: string | null;
  major: number;
  minor: number;
  isValid: boolean;
}

/**
 * Python 명령어의 버전을 체크
 */
function checkPythonVersion(command: string): Promise<PythonVersionCheck> {
  return new Promise((resolve) => {
    const pythonProcess = spawn(command, ['--version']);
    let output = '';
    let errorOutput = '';

    const timeoutId = setTimeout(() => {
      pythonProcess.kill();
      resolve({
        command,
        version: null,
        major: 0,
        minor: 0,
        isValid: false,
      });
    }, 5000);

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
      clearTimeout(timeoutId);
      const versionOutput = output || errorOutput;
      const versionMatch = versionOutput.match(/Python (\d+)\.(\d+)\.(\d+)/);
      
      if (code === 0 && versionMatch) {
        const major = parseInt(versionMatch[1], 10);
        const minor = parseInt(versionMatch[2], 10);
        const isValid = major > 3 || (major === 3 && minor >= 10);
        
        resolve({
          command,
          version: versionMatch[0],
          major,
          minor,
          isValid,
        });
      } else {
        resolve({
          command,
          version: null,
          major: 0,
          minor: 0,
          isValid: false,
        });
      }
    });

    pythonProcess.on('error', () => {
      clearTimeout(timeoutId);
      resolve({
        command,
        version: null,
        major: 0,
        minor: 0,
        isValid: false,
      });
    });
  });
}

/**
 * 사용 가능한 Python 명령어를 찾고 버전을 체크
 * 우선순위: PYTHON_PATH 환경 변수 > python3.11 > python3.10 > python3 > python
 * 
 * @returns 사용 가능한 Python 명령어와 버전 정보
 */
export async function findPythonCommand(): Promise<{ command: string; version: string }> {
  // 1. 환경 변수에서 Python 경로 확인
  const pythonPath = process.env.PYTHON_PATH?.trim();
  if (pythonPath) {
    const check = await checkPythonVersion(pythonPath);
    if (check.isValid) {
      logger.debug(`[Python] Using PYTHON_PATH: ${pythonPath} (${check.version})`);
      return { command: pythonPath, version: check.version || 'unknown' };
    } else {
      logger.warn(`[Python] PYTHON_PATH (${pythonPath}) is invalid or version is too old. Trying alternatives...`);
    }
  }

  // 2. python3.11 시도
  const python311Check = await checkPythonVersion('python3.11');
  if (python311Check.isValid) {
    logger.debug(`[Python] Using python3.11 (${python311Check.version})`);
    return { command: 'python3.11', version: python311Check.version || 'unknown' };
  }

  // 3. python3.10 시도
  const python310Check = await checkPythonVersion('python3.10');
  if (python310Check.isValid) {
    logger.debug(`[Python] Using python3.10 (${python310Check.version})`);
    return { command: 'python3.10', version: python310Check.version || 'unknown' };
  }

  // 4. python3 시도
  const python3Check = await checkPythonVersion('python3');
  if (python3Check.isValid) {
    logger.debug(`[Python] Using python3 (${python3Check.version})`);
    return { command: 'python3', version: python3Check.version || 'unknown' };
  }

  // 5. python 시도
  const pythonCheck = await checkPythonVersion('python');
  if (pythonCheck.isValid) {
    logger.debug(`[Python] Using python (${pythonCheck.version})`);
    return { command: 'python', version: pythonCheck.version || 'unknown' };
  }

  // 모든 시도 실패
  const errorMessage = `Python 3.10 이상이 필요합니다. 다음 중 하나를 설치하세요:
- Python 3.11.10 (권장): pyenv install 3.11.10
- Python 3.10 이상

또는 환경 변수 PYTHON_PATH에 Python 3.10 이상의 경로를 설정하세요.
예: PYTHON_PATH=/usr/local/bin/python3.11

현재 시도한 명령어:
${pythonPath ? `- PYTHON_PATH=${pythonPath} (실패)` : ''}
- python3.11 (${python311Check.version || '없음'})
- python3.10 (${python310Check.version || '없음'})
- python3 (${python3Check.version || '없음'})
- python (${pythonCheck.version || '없음'})`;

  throw new AppError(errorMessage, 'PYTHON_NOT_FOUND', 500);
}
