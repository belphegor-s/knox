# syntax=docker/dockerfile:1

# One of five per-language execution images (see infra/runner-*.Dockerfile) that replaced the
# original single infra/runner.Dockerfile, which bundled all six languages' toolchains (JDK, Go,
# Rust, GCC, Python) into one ~1.9GB image - so a plain `print(1+1)` still had to pull Go and Rust
# and Java on every cold Fargate task before it could run at all. Verified against a real
# knox-execution task: image pull alone was ~29s of a 73s total run for a trivial script, the
# single largest cost by far. Splitting per language means a Python run only ever pulls Python's
# own (much smaller) image. Every toolchain here is real - not a WASM approximation - because it
# only ever runs inside a throwaway, network-isolated, resource-capped container (see
# apps/worker/src/docker-runner.ts and ecs-runner.ts), never on the host directly.
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
      coreutils \
      awscli \
    && rm -rf /var/lib/apt/lists/*

# "Major important packages", scoped to what the single-file execution model (this image's
# knox-run - one source file, no build tool project) can actually use: import works immediately
# for any script, so a real default library set matters here in a way it doesn't for a compiled
# language with no package manager of its own.
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
