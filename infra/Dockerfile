# syntax=docker/dockerfile:1

# --- deps + build -----------------------------------------------------------
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /repo

# Copy manifests first so dependency install is cached independently of source changes.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/filesystem/package.json packages/filesystem/package.json
COPY packages/editor/package.json packages/editor/package.json
COPY packages/git/package.json packages/git/package.json
COPY packages/terminal/package.json packages/terminal/package.json
COPY packages/runtime/package.json packages/runtime/package.json
COPY packages/search/package.json packages/search/package.json
COPY packages/ai/package.json packages/ai/package.json

RUN pnpm install --frozen-lockfile

COPY apps/web apps/web
COPY packages/shared packages/shared
COPY packages/filesystem packages/filesystem
COPY packages/editor packages/editor
COPY packages/git packages/git
COPY packages/terminal packages/terminal
COPY packages/runtime packages/runtime
COPY packages/search packages/search
COPY packages/ai packages/ai

RUN pnpm --filter @knox/web build

# --- runtime -----------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
# Template, not a static file: the base image's own entrypoint (20-envsubst-on-templates.sh)
# envsubst's every *.template under /etc/nginx/templates/ into /etc/nginx/conf.d/ at container
# start, substituting real environment variables - lets KNOX_API_UPSTREAM be overridden per
# deployment (e.g. a separately-deployed api/worker app's public URL) without a rebuild, while
# defaulting to the Docker-DNS name the self-hosted docker-compose.yml path actually resolves.
# Safe against nginx's own $request_uri-style variables: those are lowercase, environment
# variables are conventionally uppercase, so envsubst (which substitutes by variable NAME) never
# touches them as long as nothing uppercase happens to collide.
COPY infra/nginx.conf /etc/nginx/templates/default.conf.template
ENV KNOX_API_UPSTREAM=http://api:8081
# Empty by default on purpose: a self-hosted instance has no session broker deployed at all
# (self-hosting already means unrestricted, direct access to the `vscode` service - see
# infra/docker-compose.yml), so "Open Knox" on the bundled landing page should never try to
# reach anyone else's session broker. Only knox.procd.cc's own Coolify deployment overrides
# this, to its own session-broker app's public URL.
ENV KNOX_SESSION_API_UPSTREAM=
# Sign-in gate for the in-browser IDE at /app/ (see nginx.conf's /__knox/auth) - off for a
# self-hosted container, which has no account service to check against. knox.procd.cc sets
# KNOX_REQUIRE_AUTH=true and points KNOX_SIGN_IN_URL at apps/api's public /auth/github.
ENV KNOX_REQUIRE_AUTH=false
ENV KNOX_SIGN_IN_URL=/

# Coolify/most PaaS route by container port; 8080 avoids requiring root for port 80.
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
