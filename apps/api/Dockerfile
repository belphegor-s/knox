# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /repo

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
RUN pnpm --filter @knox/api build
# pnpm's workspace node_modules are symlinks into a shared store - `deploy` resolves that into
# a real, self-contained directory (prod deps only) that can be copied into a slim image alone.
RUN pnpm --filter @knox/api deploy --prod --legacy /deploy/api

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /deploy/api ./

EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8081/health || exit 1

CMD ["node", "dist/server.js"]
