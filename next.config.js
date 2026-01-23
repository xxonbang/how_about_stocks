/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker 배포를 위한 standalone 출력 모드
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // Puppeteer/Playwright 및 관련 패키지를 서버 외부 패키지로 설정 (webpack 번들링 제외)
    serverComponentsExternalPackages: [
      'puppeteer',
      'puppeteer-extra',
      'puppeteer-extra-plugin-stealth',
      'puppeteer-core',
      '@puppeteer/browsers',
      'playwright',
      'playwright-core',
    ],
  },
  webpack: (config, { isServer }) => {
    // 클라이언트 번들에서 Node.js 전용 모듈 제외
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        'fs/promises': false,
        path: false,
        child_process: false,
      };
    }

    // 서버 사이드에서 Puppeteer 관련 패키지 외부화
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        'puppeteer': 'commonjs puppeteer',
        'puppeteer-extra': 'commonjs puppeteer-extra',
        'puppeteer-extra-plugin-stealth': 'commonjs puppeteer-extra-plugin-stealth',
        'puppeteer-core': 'commonjs puppeteer-core',
      });
    }

    return config;
  },
}

module.exports = nextConfig
