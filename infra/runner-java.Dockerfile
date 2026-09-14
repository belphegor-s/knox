# syntax=docker/dockerfile:1

# One of five per-language execution images - see infra/runner-python.Dockerfile's header for why
# these were split out of the original single infra/runner.Dockerfile. Pinned to
# openjdk-17-jdk-headless (not the "default-jdk-headless" metapackage the original image used) to
# match infra/vscode-runner.Dockerfile's own JDK choice - one version to reason about across the
# whole product, not two independently-drifting "whatever Debian defaults to" installs.
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      openjdk-17-jdk-headless \
      coreutils \
      awscli \
    && rm -rf /var/lib/apt/lists/*

COPY runner/knox-run /usr/local/bin/knox-run
RUN chmod +x /usr/local/bin/knox-run

WORKDIR /workspace
RUN chmod 1777 /workspace
ENTRYPOINT ["/usr/local/bin/knox-run"]
