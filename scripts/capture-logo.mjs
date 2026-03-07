import { chromium } from 'playwright';
import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const MIME = { '.html': 'text/html', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };

async function main() {
  // Start local HTTP server for font loading
  const server = createServer((req, res) => {
    const filePath = resolve(__dirname, req.url.slice(1));
    try {
      const data = readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  console.log(`Local server on port ${port}`);

  console.log('Launching browser...');
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 512, height: 512 },
    deviceScaleFactor: 2,
  });

  await page.goto(`http://127.0.0.1:${port}/draw-logo.html`);
  await page.waitForFunction(() => document.title === 'DONE', { timeout: 10000 });

  // Extract canvas as PNG via toDataURL
  const dataUrl = await page.evaluate(() => {
    return document.getElementById('c').toDataURL('image/png');
  });
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  const screenshotBuffer = Buffer.from(base64, 'base64');
  console.log(`Canvas captured (${screenshotBuffer.length} bytes)`);

  await browser.close();
  server.close();

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

  // ===== OG IMAGE =====
  console.log('\nGenerating OG image...');
  const browser2 = await chromium.launch();
  const ogPage = await browser2.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 2,
  });

  const server2 = createServer((req, res) => {
    const filePath = resolve(__dirname, req.url.slice(1));
    try {
      const data = readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server2.listen(0, '127.0.0.1', r));
  const port2 = server2.address().port;

  await ogPage.goto(`http://127.0.0.1:${port2}/draw-og-image.html`);
  await ogPage.waitForFunction(() => document.title === 'DONE', { timeout: 10000 });

  const ogDataUrl = await ogPage.evaluate(() => {
    return document.getElementById('c').toDataURL('image/png');
  });
  const ogBase64 = ogDataUrl.replace(/^data:image\/png;base64,/, '');
  const ogBuffer = Buffer.from(ogBase64, 'base64');

  await sharp(ogBuffer)
    .resize(1200, 630, { kernel: 'lanczos3' })
    .png()
    .toFile(resolve(root, 'app/opengraph-image.png'));
  console.log('Generated app/opengraph-image.png (1200x630)');

  await browser2.close();
  server2.close();

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
