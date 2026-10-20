# syntax=docker/dockerfile:1
# Multi-stage build: deps → build (Next standalone) → a small non-root runtime.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data
RUN addgroup -S jollyos && adduser -S jollyos -G jollyos \
    && mkdir -p /data && chown jollyos:jollyos /data
COPY --from=build --chown=jollyos:jollyos /app/.next/standalone ./
COPY --from=build --chown=jollyos:jollyos /app/.next/static ./.next/static
COPY --from=build --chown=jollyos:jollyos /app/public ./public
# Fictional sample exports for "Try with sample data" (demo mode); read from disk at runtime.
COPY --from=build --chown=jollyos:jollyos /app/demo/samples ./demo/samples
USER jollyos
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
