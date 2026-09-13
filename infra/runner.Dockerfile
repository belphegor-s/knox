# syntax=docker/dockerfile:1

# Self-contained execution image for Knox's cloud execution worker (apps/worker). Every
# toolchain here is real - not a WASM approximation - because it only ever runs inside a
# throwaway, network-isolated, resource-capped container (see apps/worker/src/docker-runner.ts),
# never on the host directly.
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      python3 \
      python3-pip \
      default-jdk-headless \
      golang-go \
      rustc \
      coreutils \
      awscli \
      libcurl4-openssl-dev \
      libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# "Major important packages" per language, scoped to what the single-file execution model
# (infra/runner/knox-run - one source file, no build tool project) can actually use:
#   - Python: import works immediately for any script, so a real default library set matters.
#   - C/C++: libcurl4-openssl-dev/libssl-dev above are dev headers, so #include <curl/curl.h>
#     and #include <openssl/...> compile - the equivalent of a "package" for a compiled language
#     with no package manager of its own.
#   - Java/Go/Rust get none here on purpose: javac/go run/rustc all compile a single file with
#     no project manifest, so there is no dependency mechanism to pre-populate at all (Go
#     modules and Cargo crates both require a go.mod/Cargo.toml this model doesn't have) -
#     rather than silently do nothing, this is a real, documented scope boundary.
RUN pip3 install --no-cache-dir --break-system-packages \
      requests \
      numpy \
      pandas

COPY runner/knox-run /usr/local/bin/knox-run
RUN chmod +x /usr/local/bin/knox-run

WORKDIR /workspace
# Locally (docker-runner.ts), --tmpfs mounts /workspace at 1777 regardless of the image's own
# permissions, so this line is a no-op for that path. ECS Fargate has no equivalent of --tmpfs
# (EC2 launch type only), so on ECS this directory's actual on-image permissions are what the
# non-root --user 1000:1000 gets - and WORKDIR alone leaves it root-owned, unwritable by 1000.
RUN chmod 1777 /workspace
ENTRYPOINT ["/usr/local/bin/knox-run"]
