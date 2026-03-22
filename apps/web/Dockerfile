FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps --network-timeout=120000

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Ensure native better-sqlite3 binary is from our Alpine build (not prebuilt)
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/bindings ./node_modules/bindings
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/prebuild-install ./node_modules/prebuild-install

# Entrypoint script to fix volume permissions at runtime
RUN printf '#!/bin/sh\nchown -R nextjs:nodejs /data\nexec su-exec nextjs node server.js\n' > /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

RUN apk add --no-cache su-exec

EXPOSE 3000

CMD ["/app/entrypoint.sh"]
