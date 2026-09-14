# syntax=docker/dockerfile:1

# One of five per-language execution images - see infra/runner-python.Dockerfile's header for why
# these were split out of the original single infra/runner.Dockerfile. Handles both "c" and "cpp"
# (knox-run's language dispatch), not two separate images - gcc and g++ both come from the same
# build-essential package, so splitting them further would just duplicate the identical toolchain
# under two names for no size or latency benefit.
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      coreutils \
      awscli \
      libcurl4-openssl-dev \
      libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY runner/knox-run /usr/local/bin/knox-run
RUN chmod +x /usr/local/bin/knox-run

WORKDIR /workspace
RUN chmod 1777 /workspace
ENTRYPOINT ["/usr/local/bin/knox-run"]
