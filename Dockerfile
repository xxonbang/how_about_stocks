# Node.js + Python 멀티스테이지 빌드
FROM node:20-slim AS base

# Python 설치
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Playwright 브라우저 의존성 설치
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python 가상환경 생성 및 패키지 설치
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY api/requirements.txt ./api/
RUN pip install --no-cache-dir -r api/requirements.txt

# Node.js 의존성 설치
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# 빌드 단계
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Playwright 브라우저 설치
RUN npx playwright install chromium

# Next.js 빌드
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 프로덕션 단계
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Python 가상환경 복사
COPY --from=base /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# 필요한 파일만 복사
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/api ./api
COPY --from=builder /app/data ./data

# Playwright 브라우저 복사 (캐시 디렉토리)
COPY --from=builder /root/.cache/ms-playwright /root/.cache/ms-playwright

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
