# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /repo

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY apps/session-broker/package.json apps/session-broker/package.json
RUN pnpm install --frozen-lockfile

COPY apps/session-broker apps/session-broker
RUN pnpm --filter @knox/session-broker build
RUN pnpm --filter @knox/session-broker deploy --prod --legacy /deploy/session-broker

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /deploy/session-broker ./

EXPOSE 8083
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8083/health || exit 1

CMD ["node", "dist/server.js"]
