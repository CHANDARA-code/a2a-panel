const { oneLine } = require('./agy-stream');

function createStreamParser({ onText, onLog, onInit, onResult, onRateLimit }) {
  let buffer = '';
  const toolCalls = new Map();
  let lastRateLimitInfo = null;

  const handleEvent = (event) => {
    if (event.type === 'rate_limit_event') {
      lastRateLimitInfo = event.rate_limit_info || event;
      if (onRateLimit) onRateLimit(lastRateLimitInfo);
    } else if (event.type === 'system' && event.subtype === 'init') {
      onInit(event.session_id || null);
    } else if (event.type === 'assistant' && event.message) {
      const content = Array.isArray(event.message.content) ? event.message.content : [];
      for (const item of content) {
        if (item.type === 'text' && item.text) {
          onText(item.text + '\n');
        } else if (item.type === 'tool_use') {
          const input = item.input && typeof item.input === 'object' ? item.input : {};
          const detail = Object.values(input).find((v) => typeof v === 'string' && v.trim());
          const desc = detail ? `${item.name}: ${oneLine(detail)}` : item.name;
          toolCalls.set(item.id, desc);
          onLog(`[tool] ${desc}\n`);
        }
      }
    } else if (event.type === 'user' && event.message) {
      const content = Array.isArray(event.message.content) ? event.message.content : [];
      for (const item of content) {
        if (item.type === 'tool_result' && item.is_error) {
          const desc = toolCalls.get(item.tool_use_id) || 'tool';
          const text = typeof item.content === 'string' ? item.content : JSON.stringify(item.content || '');
          const firstLine = oneLine(text.split('\n')[0]);
          onLog(`[error] ${desc} (${firstLine})\n`);
        }
      }
    } else if (event.type === 'result') {
      const isError = Boolean(event.is_error) || (typeof event.subtype === 'string' && event.subtype !== 'success');
      const u = event.usage || {};
      const rawIn = Number(u.input_tokens) || 0;
      const cacheCreation = Number(u.cache_creation_input_tokens) || 0;
      const cacheRead = Number(u.cache_read_input_tokens) || 0;
      const input_tokens = rawIn + cacheCreation + cacheRead;
      const output_tokens = Number(u.output_tokens) || 0;
      const details = u.output_tokens_details || {};
      const thinking_tokens = Number(details.thinking_tokens) || 0;
      const cache_read_tokens = cacheRead;
      const total_tokens = input_tokens + output_tokens;
      const usage = {
        input_tokens,
        output_tokens,
        thinking_tokens,
        cache_read_tokens,
        total_tokens
      };
      if (event.total_cost_usd !== undefined) {
        usage.cost_usd = event.total_cost_usd;
      }
      let models = null;
      if (event.modelUsage && typeof event.modelUsage === 'object') {
        models = {};
        for (const [mName, mu] of Object.entries(event.modelUsage)) {
          if (!mu || typeof mu !== 'object') continue;
          const inTok = Number(mu.inputTokens) || 0;
          const crTok = Number(mu.cacheReadInputTokens) || 0;
          const ccTok = Number(mu.cacheCreationInputTokens) || 0;
          const outTok = Number(mu.outputTokens) || 0;
          models[mName] = {
            total_tokens: inTok + crTok + ccTok + outTok,
            cost_usd: typeof mu.costUSD === 'number' ? mu.costUSD : (Number(mu.costUSD) || 0)
          };
        }
      }
      const duration_seconds = typeof event.duration_ms === 'number' ? event.duration_ms / 1000 : null;
      onResult({
        status: isError ? 'ERROR' : 'SUCCESS',
        response: typeof event.result === 'string' ? event.result : '',
        conversation_id: event.session_id || null,
        duration_seconds,
        usage,
        models,
        rateLimitInfo: lastRateLimitInfo,
        error: isError ? (event.result || event.subtype || 'Claude execution failed') : null
      });
      const denials = Array.isArray(event.permission_denials) ? event.permission_denials : [];
      if (denials.length) {
        const names = denials.map((d) => d.tool_name || d.name || 'unknown').join(', ');
        onText(`\n[A2A] Claude Code denied these actions: ${names}. The task may be incomplete.\n`);
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
    }
  };
}

module.exports = { createStreamParser };
