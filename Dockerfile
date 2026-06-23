
FROM node:20-alpine AS base

RUN apk add --no-cache dumb-init curl openssl

WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001

FROM base AS build

ARG CACHE_BUST=1

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# postinstall runs prisma generate; build-time DB URL is only for schema tooling
ENV POSTGRES_URI=postgresql://build:build@127.0.0.1:5432/build

RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
RUN echo "Cache bust: ${CACHE_BUST}" > /dev/null
COPY src ./src

RUN npm run build && npm prune --omit=dev

FROM base AS production

# All config is supplied at runtime via CapRover env vars (no baked defaults).

COPY --from=build --chown=nodeuser:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodeuser:nodejs /app/dist ./dist
COPY --from=build --chown=nodeuser:nodejs /app/package.json ./
COPY --from=build --chown=nodeuser:nodejs /app/prisma ./prisma
COPY --from=build --chown=nodeuser:nodejs /app/prisma.config.ts ./

RUN mkdir -p logs && chown -R nodeuser:nodejs logs

USER nodeuser

EXPOSE 4010

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:4010/api/v1/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
