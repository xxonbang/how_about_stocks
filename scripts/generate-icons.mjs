import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const svg = readFileSync(resolve(root, 'app/icon.svg'));

async function generateIcons() {
  // icon.png (32x32) - used in metadata
  await sharp(svg).resize(32, 32).png().toFile(resolve(root, 'app/icon.png'));
  console.log('Generated app/icon.png (32x32)');

  // apple-icon.png (180x180)
  await sharp(svg).resize(180, 180).png().toFile(resolve(root, 'app/apple-icon.png'));
  console.log('Generated app/apple-icon.png (180x180)');

  // logo.png for navigation (used at 28x28, generate at 256x256 for quality)
  await sharp(svg).resize(256, 256).png().toFile(resolve(root, 'public/logo.png'));
  console.log('Generated public/logo.png (256x256)');

  // PWA icons
  await sharp(svg).resize(192, 192).png().toFile(resolve(root, 'public/icon-192.png'));
  console.log('Generated public/icon-192.png (192x192)');

  await sharp(svg).resize(512, 512).png().toFile(resolve(root, 'public/icon-512.png'));
  console.log('Generated public/icon-512.png (512x512)');

  // favicon.ico (create from 32x32 PNG)
  // ICO format: just use a 32x32 PNG since modern browsers handle it
  const png32 = await sharp(svg).resize(32, 32).png().toBuffer();
  const png16 = await sharp(svg).resize(16, 16).png().toBuffer();

  // Simple ICO file builder (single 32x32 PNG)
  const ico = buildIco([
    { size: 16, data: png16 },
    { size: 32, data: png32 },
  ]);
  writeFileSync(resolve(root, 'app/favicon.ico'), ico);
  console.log('Generated app/favicon.ico (16x16 + 32x32)');

  console.log('\nAll icons generated successfully!');
}

// Build a minimal ICO file from PNG buffers
function buildIco(images) {
  const headerSize = 6;
  const entrySize = 16;
  const dataOffset = headerSize + entrySize * images.length;

  // ICO header
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);           // Reserved
  header.writeUInt16LE(1, 2);           // Type: ICO
  header.writeUInt16LE(images.length, 4); // Image count

  // Directory entries + image data
  const entries = [];
  const dataBuffers = [];
  let currentOffset = dataOffset;

  for (const img of images) {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(img.size === 256 ? 0 : img.size, 0); // Width
    entry.writeUInt8(img.size === 256 ? 0 : img.size, 1); // Height
    entry.writeUInt8(0, 2);               // Color palette
    entry.writeUInt8(0, 3);               // Reserved
    entry.writeUInt16LE(1, 4);            // Color planes
    entry.writeUInt16LE(32, 6);           // Bits per pixel
    entry.writeUInt32LE(img.data.length, 8);  // Data size
    entry.writeUInt32LE(currentOffset, 12);   // Data offset

    entries.push(entry);
    dataBuffers.push(img.data);
    currentOffset += img.data.length;
  }

  return Buffer.concat([header, ...entries, ...dataBuffers]);
}

generateIcons().catch(console.error);
