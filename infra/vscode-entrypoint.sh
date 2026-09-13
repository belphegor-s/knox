#!/bin/sh
# code-server has no "disabled if empty" behavior for --auth password - an empty $PASSWORD
# isn't the same as no auth gate, and self-hosting is supposed to have no auth gate by
# default (see infra/docker-compose.yml). The session broker's ECS container override always
# sets a real per-session PASSWORD, so this picks the right mode for both callers of the same
# image rather than needing two separate entrypoints.
set -eu

if [ -n "${PASSWORD:-}" ]; then
  exec code-server --bind-addr 0.0.0.0:8080 --auth password
else
  exec code-server --bind-addr 0.0.0.0:8080 --auth none
fi
