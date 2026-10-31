function createStreamParser({ onText, onLog, onInit, onResult, onRateLimit }) {
  let buffer = '';
  let conversationId = null;
  let lastAgentMessage = '';
  let seenTurnCompleted = false;
  let seenTurnFailed = false;
  let seenError = false;
  let lastError = null;
  let emittedResult = false;
  let lastRateLimits = null;

  let totalInputTokens = 0;
  let totalCachedInputTokens = 0;
  let totalOutputTokens = 0;
  let totalReasoningTokens = 0;

  const handleEvent = (event) => {
    if (event.type === 'thread.started') {
      conversationId = event.thread_id || null;
      onInit(conversationId);
    } else if (event.type === 'item.completed' && event.item) {
      const item = event.item;
      if (item.type === 'agent_message' && typeof item.text === 'string') {
        lastAgentMessage = item.text;
        onText(item.text + '\n');
      } else if (item.type === 'command_execution') {
        if (item.exit_code === 0) {
          onLog(`[tool] shell: ${item.command}\n`);
        } else {
          onLog(`[error] shell: ${item.command} (exit ${item.exit_code})\n`);
        }
      } else if (item.type === 'file_change') {
        const paths = (item.changes || []).map((c) => c.path).filter(Boolean).join(', ');
        onLog(`[tool] edit: ${paths}\n`);
      } else if (item.type === 'mcp_tool_call') {
        onLog(`[tool] ${item.server}.${item.tool}\n`);
      } else if (item.type === 'web_search') {
        onLog(`[tool] web_search: ${item.query}\n`);
      }
    } else if (event.type === 'turn.completed') {
      seenTurnCompleted = true;
      const u = event.usage || {};
      totalInputTokens += Number(u.input_tokens) || 0;
      totalCachedInputTokens += Number(u.cached_input_tokens) || 0;
      totalOutputTokens += Number(u.output_tokens) || 0;
      totalReasoningTokens += Number(u.reasoning_output_tokens) || 0;
    } else if (event.type === 'turn.failed') {
      seenTurnFailed = true;
      lastError = (event.error && event.error.message) || 'Turn failed';
    } else if (event.type === 'error') {
      seenError = true;
      lastError = event.message || 'Error occurred';
    }
    const rl = event.rate_limits || (event.payload && event.payload.rate_limits) || null;
    if (rl) {
      lastRateLimits = rl;
      if (onRateLimit) onRateLimit(lastRateLimits);
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
    if (event && typeof event === 'object' && typeof event.type === 'string') {
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
      if (!emittedResult) {
        emittedResult = true;
        const isSuccess = seenTurnCompleted && !seenTurnFailed && !seenError;
        const input_tokens = Math.max(0, totalInputTokens - totalCachedInputTokens);
        const output_tokens = totalOutputTokens;
        const thinking_tokens = totalReasoningTokens;
        const cache_read_tokens = totalCachedInputTokens;
        const total_tokens = input_tokens + output_tokens;
        const usage = (seenTurnCompleted || totalInputTokens || totalOutputTokens) ? {
          input_tokens,
          output_tokens,
          thinking_tokens,
          cache_read_tokens,
          total_tokens
        } : null;
        onResult({
          status: isSuccess ? 'SUCCESS' : 'ERROR',
          response: lastAgentMessage,
          conversation_id: conversationId,
          duration_seconds: null,
          usage,
          rateLimits: lastRateLimits,
          error: isSuccess ? null : (lastError || 'Turn failed')
        });
      }
    }
  };
}

module.exports = { createStreamParser };
