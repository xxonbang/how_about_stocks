const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const svgPath = path.join(projectRoot, 'app/icon.svg');
const appDir = path.join(projectRoot, 'app');

// Read the SVG file
const svgBuffer = fs.readFileSync(svgPath);

async function generateFavicons() {
  try {
    // Generate apple-icon.png (180x180)
    await sharp(svgBuffer)
      .resize(180, 180)
      .png()
      .toFile(path.join(appDir, 'apple-icon.png'));
    console.log('Generated apple-icon.png (180x180)');

    // Generate icon.png (32x32 for general use)
    await sharp(svgBuffer)
      .resize(32, 32)
      .png()
      .toFile(path.join(appDir, 'icon.png'));
    console.log('Generated icon.png (32x32)');

    // Generate favicon.ico (using a 32x32 PNG as base - browsers accept PNG in .ico)
    await sharp(svgBuffer)
      .resize(32, 32)
      .toFormat('png')
      .toFile(path.join(appDir, 'favicon.ico'));
    console.log('Generated favicon.ico (32x32)');

    // Generate opengraph image (1200x630)
    await sharp(svgBuffer)
      .resize(512, 512)
      .extend({
        top: 59,
        bottom: 59,
        left: 344,
        right: 344,
        background: { r: 59, g: 130, b: 246, alpha: 1 }
      })
      .png()
      .toFile(path.join(appDir, 'opengraph-image.png'));
    console.log('Generated opengraph-image.png (1200x630)');

    console.log('\nAll favicons generated successfully!');
  } catch (error) {
    console.error('Error generating favicons:', error);
  }
}

generateFavicons();
