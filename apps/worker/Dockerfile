# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /repo

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
RUN pnpm install --frozen-lockfile

COPY apps/worker apps/worker
RUN pnpm --filter @knox/worker build
RUN pnpm --filter @knox/worker deploy --prod --legacy /deploy/worker

FROM node:20-alpine AS runtime
# The `docker` CLI, not a daemon - this container talks to the HOST's Docker daemon over the
# socket mounted at /var/run/docker.sock (see infra/docker-compose.yml). It never runs a
# daemon of its own; every container it starts (via docker-runner.ts) is a sibling of this
# one on the host, not nested inside it.
RUN apk add --no-cache docker-cli
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /deploy/worker ./

EXPOSE 8082
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8082/health || exit 1

CMD ["node", "dist/server.js"]
