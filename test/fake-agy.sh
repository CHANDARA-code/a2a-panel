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
  chatty)
    yes 'line of agent output' | head -n 5000
    exit 0
    ;;
  *)
    sleep 300 &
    wait
    ;;
esac
