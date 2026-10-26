const QUIET_STEP_TYPES = new Set(['user_input', 'unknown', 'agent_response']);
const MAX_DETAIL_CHARS = 160;

function oneLine(text) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > MAX_DETAIL_CHARS ? `${flat.slice(0, MAX_DETAIL_CHARS - 1)}…` : flat;
}

// "run_command: npm test" from a tool step; falls back to the step type.
function describeStep(step) {
  const info = step.tool_info || {};
  const name = step.tool_name || info.name || step.step_type;
  const params = info.parameters && typeof info.parameters === 'object' ? info.parameters : {};
  const detail = Object.values(params).find((value) => typeof value === 'string' && value.trim());
  return detail ? `${name}: ${oneLine(detail)}` : name;
}

function describeDenied(denied) {
  return denied.map((item) => item.display_name || item.action || 'unknown').join(', ');
}

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
      } else if (step.state === 'ERROR') {
        const error = (step.tool_info && step.tool_info.error) || step.error || {};
        const reason = error.message ? ` (${oneLine(error.message.split('\n')[0])})` : '';
        onLog(`[error] ${describeStep(step)}${reason}\n`);
      } else if (step.state === 'DONE' && !QUIET_STEP_TYPES.has(step.step_type)) {
        onLog(`[${step.step_type === 'tool' ? 'tool' : 'step'}] ${describeStep(step)}\n`);
      }
    } else if (event.event === 'result' && event.result) {
      onResult(event.result);
      const denied = Array.isArray(event.result.denied_actions) ? event.result.denied_actions : [];
      if (denied.length) {
        // Headless agy auto-denies anything it cannot prompt for; make that visible instead of a silent empty result.
        onText(`\n[A2A] Antigravity denied these actions: ${describeDenied(denied)}. The task may be incomplete.\n`);
      }
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
