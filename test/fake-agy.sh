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
  stream)
    echo '{"event":"init","conversation_id":"conv-12345678","init":{"cwd":"/x"}}'
    echo '{"event":"step_update","step_update":{"step_index":2,"state":"ACTIVE","step_type":"agent_response","text_delta":"Hello "}}'
    echo '{"event":"step_update","step_update":{"step_index":3,"state":"DONE","step_type":"run_command"}}'
    echo '{"event":"step_update","step_update":{"step_index":4,"state":"ACTIVE","step_type":"agent_response","text_delta":"world"}}'
    echo 'plain passthrough line'
    echo '{"event":"result","result":{"conversation_id":"conv-12345678","status":"SUCCESS","response":"Hello world","duration_seconds":1.5,"usage":{"input_tokens":100,"output_tokens":20,"thinking_tokens":0,"cache_read_tokens":50,"total_tokens":120}}}'
    exit 0
    ;;
  failed)
    echo '{"event":"result","result":{"status":"ERROR","response":"","usage":{"total_tokens":5}}}'
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
