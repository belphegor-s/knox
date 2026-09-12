# syntax=docker/dockerfile:1

# Self-contained execution image for Knox's cloud execution worker (apps/worker). Every
# toolchain here is real - not a WASM approximation - because it only ever runs inside a
# throwaway, network-isolated, resource-capped container (see apps/worker/src/docker-runner.ts),
# never on the host directly.
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      python3 \
      default-jdk-headless \
      golang-go \
      rustc \
      coreutils \
    && rm -rf /var/lib/apt/lists/*

COPY runner/knox-run /usr/local/bin/knox-run
RUN chmod +x /usr/local/bin/knox-run

WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/knox-run"]
