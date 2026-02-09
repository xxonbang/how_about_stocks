/**
 * PDF 한글 폰트 로더
 *
 * Noto Sans KR 폰트를 런타임에 fetch하여 base64로 변환.
 * jsPDF에 임베딩하여 한글 렌더링을 지원.
 */

let cachedFontBase64: string | null = null;

export async function loadKoreanFont(): Promise<string> {
  if (cachedFontBase64) return cachedFontBase64;

  const response = await fetch('/fonts/NotoSansKR-Regular.ttf');
  if (!response.ok) {
    throw new Error(`Failed to load Korean font: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // ArrayBuffer → base64 변환 (chunk 단위로 처리하여 stack overflow 방지)
  const chunkSize = 8192;
  let binaryString = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binaryString += String.fromCharCode(...chunk);
  }
  const base64 = btoa(binaryString);

  cachedFontBase64 = base64;
  return base64;
}
