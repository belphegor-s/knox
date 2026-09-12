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
      awscli \
    && rm -rf /var/lib/apt/lists/*

COPY runner/knox-run /usr/local/bin/knox-run
RUN chmod +x /usr/local/bin/knox-run

WORKDIR /workspace
# Locally (docker-runner.ts), --tmpfs mounts /workspace at 1777 regardless of the image's own
# permissions, so this line is a no-op for that path. ECS Fargate has no equivalent of --tmpfs
# (EC2 launch type only), so on ECS this directory's actual on-image permissions are what the
# non-root --user 1000:1000 gets - and WORKDIR alone leaves it root-owned, unwritable by 1000.
RUN chmod 1777 /workspace
ENTRYPOINT ["/usr/local/bin/knox-run"]
