# worker/Dockerfile — Headless Browser Auto-Submit Worker
# AS-1: Playwright + Chromium on Node 20
# Fly.io deployment target

FROM mcr.microsoft.com/playwright:v1.42.1-jammy

WORKDIR /app

# Copy package files first for Docker layer caching
COPY worker/package.json worker/package-lock.json* ./

RUN npm ci --production

# Copy worker source
COPY worker/ ./

# No dev deps, no test files in production image
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

EXPOSE 8080

CMD ["node", "index.js"]
