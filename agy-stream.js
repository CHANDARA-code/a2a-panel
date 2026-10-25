const QUIET_STEP_TYPES = new Set(['user_input', 'unknown', 'agent_response']);

function createStreamParser({ onText, onLog, onInit, onResult }) {
  let buffer = '';

  const handleEvent = (event) => {
    if (event.event === 'init') {
      const init = event.init || {};
      onInit(event.conversation_id || init.conversation_id || null);
    } else if (event.event === 'step_update' && event.step_update) {
      const step = event.step_update;
      if (step.step_type === 'agent_response' && step.text_delta) {
        onText(step.text_delta);
      } else if (step.state === 'DONE' && !QUIET_STEP_TYPES.has(step.step_type)) {
        onLog(`[step] ${step.step_type}\n`);
      }
    } else if (event.event === 'result' && event.result) {
      onResult(event.result);
    }
  };

  const handleLine = (line) => {
    if (!line.trim()) return;
    let event = null;
    try {
      event = JSON.parse(line);
    } catch (err) {
      event = null;
    }
    if (event && typeof event === 'object' && typeof event.event === 'string') {
      handleEvent(event);
    } else {
      onText(line + '\n');
    }
  };

  return {
    push(chunk) {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        handleLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
      }
    },
    end() {
      if (buffer) handleLine(buffer);
      buffer = '';
    }
  };
}

module.exports = { createStreamParser };
