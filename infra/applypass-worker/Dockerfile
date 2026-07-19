FROM mcr.microsoft.com/playwright:v1.55.0-noble

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev --ignore-scripts

COPY scripts/applypass-browser-worker.mjs ./scripts/applypass-browser-worker.mjs

ENV NODE_ENV=production \
    APPLYPASS_WORKER_CONCURRENCY=4 \
    APPLYPASS_WORKER_POLL_MS=2500 \
    APPLYPASS_AUTO_SUBMIT=false

USER pwuser

CMD ["node", "scripts/applypass-browser-worker.mjs"]
