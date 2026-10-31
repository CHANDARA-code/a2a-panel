#!/bin/sh
if [ "$1" = "root" ] && [ "$2" = "-g" ]; then
  echo "$FAKE_NPM_ROOT"
  exit 0
fi
if [ -n "$FAKE_NPM_LOG" ]; then
  echo "ARGV: $*" >> "$FAKE_NPM_LOG"
fi
if [ "$1" = "install" ]; then
  echo "added 1 package in 1s"
  exit "${FAKE_NPM_EXIT:-0}"
fi
exit 0
