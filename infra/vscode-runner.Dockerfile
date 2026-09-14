# syntax=docker/dockerfile:1

# Real VS Code (code-server), not a clone - see docs/cloud-runtime.md's session-broker section
# for why. Pre-installs exactly the five languages the PUBLIC demo offers (Java, Python,
# Node.js/TS, Bun, C++) - a self-hoster running infra/docker-compose.yml's plain code-server
# service instead of this image gets a stock code-server with none of these constraints, matching
# "self-hosting has no restrictions" from the product decision this image encodes.
FROM codercom/code-server:4.96.4

USER root

RUN apt-get update && apt-get install -y --no-install-recommends \
      openjdk-17-jdk-headless \
      python3 \
      python3-pip \
      python3-venv \
      build-essential \
      gdb \
      clangd \
      curl \
      unzip \
      ca-certificates \
      gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Bun installed system-wide (BUN_INSTALL), not into a per-user home directory - this image
# runs as the non-root "coder" user, and a per-user install would need PATH wiring that
# breaks the moment the container's user changes.
ENV BUN_INSTALL=/usr/local
RUN curl -fsSL https://bun.sh/install | bash

# Language support from Open VSX (code-server's default marketplace - Microsoft's own
# marketplace terms don't allow redistributing their own extensions here, so this is a
# deliberately smaller set than Microsoft-hosted VS Code would offer). VS Code OSS already
# ships TextMate grammars for Java/Python/JS/TS/C++ out of the box (syntax highlighting works
# with zero extensions) - redhat.java and llvm-vs-code-extensions.vscode-clangd are the two
# confirmed Open VSX listings that add real language server features (autocomplete,
# go-to-definition) on top of that, for Java and C++ respectively; clangd itself (the binary the
# extension shells out to) comes from the apt install above. Deliberately not guessing at further
# extension IDs here - verify on open-vsx.org before adding any more, a wrong id fails this build
# outright rather than degrading gracefully.
USER coder
RUN code-server --install-extension redhat.java \
    && code-server --install-extension llvm-vs-code-extensions.vscode-clangd

USER root
WORKDIR /home/coder/project
RUN chown -R coder:coder /home/coder/project
COPY vscode-entrypoint.sh /usr/local/bin/vscode-entrypoint.sh
RUN chmod +x /usr/local/bin/vscode-entrypoint.sh

USER coder
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/vscode-entrypoint.sh"]
