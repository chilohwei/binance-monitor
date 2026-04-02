# syntax=docker/dockerfile:1

# --- Build stage: compile TypeScript on the build platform (fast, no QEMU) ---
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=binance-monitor-npm-build,target=/root/.npm,sharing=locked npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Runtime stage: target platform with prod deps only ---
FROM node:22-alpine

LABEL org.opencontainers.image.source="https://github.com/chilohwei/binance-monitor"
LABEL org.opencontainers.image.description="Binance announcement & Alpha token monitor"

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,id=binance-monitor-npm-runtime,target=/root/.npm,sharing=locked \
    npm ci --omit=dev && \
    npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN mkdir -p data && chown node:node data

USER node
EXPOSE 8080

CMD ["node", "dist/index.js"]
