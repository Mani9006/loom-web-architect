FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    APPLYPASS_WORKER_CONCURRENCY=4 \
    APPLYPASS_WORKER_POLL_MS=2500 \
    APPLYPASS_AUTO_SUBMIT=false

COPY infra/applypass-worker/package.json infra/applypass-worker/package-lock.json ./

RUN npm ci --omit=dev --ignore-scripts \
    && npx --no-install patchright install --with-deps chromium \
    && npm cache clean --force

COPY --chown=node:node scripts/applypass-browser-worker.mjs ./scripts/applypass-browser-worker.mjs
COPY --chown=node:node scripts/ats-url-policy.mjs ./scripts/ats-url-policy.mjs
COPY --chown=node:node scripts/ats-adapters ./scripts/ats-adapters

USER node

CMD ["node", "scripts/applypass-browser-worker.mjs"]
