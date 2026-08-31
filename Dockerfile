FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3400
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 community
COPY --from=builder --chown=community:nodejs /app/.next/standalone ./
COPY --from=builder --chown=community:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=community:nodejs /app/public ./public
USER community
EXPOSE 3400
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD wget -qO- http://127.0.0.1:3400/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
