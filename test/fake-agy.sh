#!/bin/sh
case "$FAKE_AGY_MODE" in
  stubborn)
    sh -c 'trap "" TERM; sleep 300' &
    wait
    ;;
  detached-child)
    sleep 300 &
    exit 0
    ;;
  *)
    sleep 300 &
    wait
    ;;
esac
