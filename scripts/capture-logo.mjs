import { chromium } from 'playwright';
import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 512, height: 512 },
    deviceScaleFactor: 2,
  });

  const htmlPath = resolve(__dirname, 'draw-logo.html');
  await page.goto(`file://${htmlPath}`);
  await page.waitForFunction(() => document.title === 'DONE', { timeout: 10000 });

  // Extract canvas as PNG via toDataURL
  const dataUrl = await page.evaluate(() => {
    return document.getElementById('c').toDataURL('image/png');
  });
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const screenshotBuffer = Buffer.from(base64, 'base64');
  console.log(`Canvas captured (${screenshotBuffer.length} bytes)`);

  await browser.close();

  const targets = [
    { path: 'public/icon-512.png', size: 512 },
    { path: 'public/icon-192.png', size: 192 },
    { path: 'public/logo.png', size: 256 },
    { path: 'app/apple-icon.png', size: 180 },
    { path: 'app/icon.png', size: 32 },
  ];

  for (const t of targets) {
    await sharp(screenshotBuffer)
      .resize(t.size, t.size, { kernel: 'lanczos3' })
      .png()
      .toFile(resolve(root, t.path));
    console.log(`Generated ${t.path} (${t.size}x${t.size})`);
  }

  const png16 = await sharp(screenshotBuffer).resize(16, 16, { kernel: 'lanczos3' }).png().toBuffer();
  const png32 = await sharp(screenshotBuffer).resize(32, 32, { kernel: 'lanczos3' }).png().toBuffer();
  writeFileSync(resolve(root, 'app/favicon.ico'), buildIco([
    { size: 16, data: png16 },
    { size: 32, data: png32 },
  ]));
  console.log('Generated app/favicon.ico');

  console.log('\nAll icons generated!');
}

function buildIco(images) {
  const headerSize = 6;
  const entrySize = 16;
  const dataOffset = headerSize + entrySize * images.length;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  const dataBuffers = [];
  let currentOffset = dataOffset;
  for (const img of images) {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(img.size === 256 ? 0 : img.size, 0);
    entry.writeUInt8(img.size === 256 ? 0 : img.size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(img.data.length, 8);
    entry.writeUInt32LE(currentOffset, 12);
    entries.push(entry);
    dataBuffers.push(img.data);
    currentOffset += img.data.length;
  }
  return Buffer.concat([header, ...entries, ...dataBuffers]);
}

main().catch(console.error);
