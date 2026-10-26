#!/usr/bin/env node

const readline = require('readline');
const path = require('path');
const fs = require('fs');
const { getAgentCard, runAgyTask, cancelTask, activeTasks } = require('./dispatcher');
const presets = require('./presets');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

const LEADER_OUTPUT_LIMIT = parseInt(process.env.A2A_LEADER_OUTPUT_LIMIT || '2500', 10);

function tailForLeader(taskRecord) {
  const out = taskRecord.output || '';
  if (!out.trim()) return '(No output returned)';
  if (out.length <= LEADER_OUTPUT_LIMIT) return out;
  return `[output truncated to last ${LEADER_OUTPUT_LIMIT} of ${taskRecord.outputChars || out.length} chars; full log: ${taskRecord.logFile}]\n` + out.slice(-LEADER_OUTPUT_LIMIT);
}

function formatUsage(usage) {
  if (!usage) return null;
  const parts = [`${usage.total_tokens ?? 0} total`];
  if (usage.input_tokens != null) parts.push(`${usage.input_tokens} in`);
  if (usage.output_tokens != null) parts.push(`${usage.output_tokens} out`);
  if (usage.cache_read_tokens) parts.push(`${usage.cache_read_tokens} cached`);
  return `Antigravity tokens (not billed to Claude): ${parts.join(', ')}`;
}

function resultFooter(taskRecord) {
  const lines = [];
  if (taskRecord.preset || (taskRecord.preferenceFiles && taskRecord.preferenceFiles.length)) {
    const files = (taskRecord.preferenceFiles || []).map((file) => (file.source === 'workspace' ? `${file.name} (workspace)` : file.name));
    lines.push(`Preset: ${taskRecord.preset || 'none'}${files.length ? ` (${files.join(', ')})` : ''}`);
  }
  const verification = taskRecord.verification;
  if (verification) {
    const seconds = Math.round(verification.durationMs / 1000);
    lines.push(`Verification run by the bridge (not the agent): ${verification.passed ? 'PASSED' : 'FAILED'}, exit ${verification.exitCode}${verification.timedOut ? ' (timed out)' : ''}, ${seconds}s\n  command: ${verification.command}`);
    if (!verification.passed) lines.push(`  output tail:\n${verification.outputTail.slice(-1500)}`);
  }
  const usage = formatUsage(taskRecord.usage);
  if (usage) lines.push(usage);
  if (taskRecord.conversationId) lines.push(`Conversation: ${taskRecord.conversationId} (pass as conversation_id to continue it)`);
  if (taskRecord.changes) lines.push(`Workspace changes:\n${taskRecord.changes}`);
  return lines.length ? '\n\n' + lines.join('\n') : '';
}

function workspaceError(workspace) {
  if (workspace && !require('fs').existsSync(workspace)) return 'Workspace does not exist: ' + workspace;
  return null;
}

function sendRpcResponse(id, result, error = null) {
  const msg = {
    jsonrpc: '2.0',
    id
  };
  if (error) {
    msg.error = error;
  } else {
    msg.result = result;
  }
  process.stdout.write(JSON.stringify(msg) + '\n');
}

const TOOLS = [
  {
    name: 'a2a_dispatch_to_antigravity',
    description: 'Delegate a coding, testing, debugging, review, or architecture task to a specialized Antigravity Senior Software Developer over the A2A protocol. Antigravity executes headlessly with full tool access (file editing, terminal execution, tests).',
    inputSchema: {
      type: 'object',
      properties: {
        role: {
          type: 'string',
          description: 'The senior specialist developer role to assign.',
          enum: [
            'web-engineer',
            'api-engineer',
            'mobile-engineer',
            'desktop-engineer',
            'test-engineer',
            'bug-triager',
            'security-auditor',
            'code-reviewer',
            'web-performance-auditor',
            'solution-architect',
            'devops-engineer',
            'lead-software-engineer'
          ]
        },
        model: {
          type: 'string',
          description: 'Optional Antigravity model id (see `agy models`). Omit to use the default.'
        },
        preset: {
          type: 'string',
          description: 'User preference preset (coding style, frontend/API libraries, default technology choices) to include in the prompt. Omit to use the default preset; "none" for no preset. See a2a_list_presets. Files in <workspace>/.agy/preferences/ always apply.'
        },
        conversation_id: {
          type: 'string',
          description: 'Continue an earlier Antigravity conversation (the id shown in a previous result) instead of starting fresh, so context is not resent.'
        },
        task_description: {
          type: 'string',
          description: 'Detailed prompt and technical requirements for the developer. Include relevant file paths, constraints, and acceptance criteria.'
        },
        workspace_path: {
          type: 'string',
          description: 'Absolute path to the project repository. Defaults to the current working directory.'
        },
        mode: {
          type: 'string',
          description: 'Antigravity execution mode: "accept-edits" (default, edits files and runs commands), "plan" (dry-run planning). "auto" is unavailable on this account.',
          enum: ['auto', 'accept-edits', 'plan']
        },
        effort: {
          type: 'string',
          description: 'Reasoning effort level for the developer.',
          enum: ['low', 'medium', 'high', 'xhigh', 'max']
        },
        acceptance_criteria: {
          type: 'string',
          description: 'Explicit list of acceptance criteria that the developer must verify before delivery.'
        },
        verification_command: {
          type: 'string',
          description: 'Test or build command (e.g., "npm test", "pytest"). The developer runs it, and the bridge runs it again itself after the task; a failing exit code marks the task failed.'
        },
        is_async: {
          type: 'boolean',
          description: 'If true, dispatches the task to the background and returns a task ID immediately without blocking. Default is false (waits for full completion).'
        }
      },
      required: ['role', 'task_description']
    }
  },
  {
    name: 'a2a_validate_delivery',
    description: 'Formally validate and verify task delivery. Assigns the Antigravity Senior Code Reviewer to inspect file diffs, execute verification test suites, and audit code quality against the acceptance criteria.',
    inputSchema: {
      type: 'object',
      properties: {
        task_summary: {
          type: 'string',
          description: 'Summary of the delivered work and what files were modified.'
        },
        acceptance_criteria: {
          type: 'string',
          description: 'The specific criteria or checklist that must be satisfied.'
        },
        verification_command: {
          type: 'string',
          description: 'Optional command to run automated tests or linter (e.g., "npm test", "flutter test").'
        },
        workspace_path: {
          type: 'string',
          description: 'Absolute path to the repository. Defaults to current working directory.'
        }
      },
      required: ['task_summary', 'acceptance_criteria']
    }
  },
  {
    name: 'a2a_list_expert_agents',
    description: 'List all available Senior Expert Software Developer personas and specialties from the Antigravity A2A Agent Card.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'a2a_list_presets',
    description: 'List the user preference presets (coding style, frontend and API libraries, default technology choices) that can be passed as "preset" to a2a_dispatch_to_antigravity, and which one is the default.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'a2a_get_task_status',
    description: 'Check the status, output, or error of a background task dispatched to an Antigravity developer.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'The unique ID of the task returned by a2a_dispatch_to_antigravity.'
        }
      },
      required: ['task_id']
    }
  },
  {
    name: 'a2a_cancel_task',
    description: 'Cancel an ongoing background task assigned to an Antigravity developer.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'The ID of the task to terminate.'
        }
      },
      required: ['task_id']
    }
  }
];

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let request;
  try {
    request = JSON.parse(trimmed);
  } catch (err) {
    return;
  }

  const { id, method, params } = request;

  // MCP Initialize
  if (method === 'initialize') {
    return sendRpcResponse(id, {
      protocolVersion: params && params.protocolVersion ? params.protocolVersion : '2024-11-05',
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: 'a2a-panel',
        version: '1.0.0'
      }
    });
  }

  // MCP Initialized notification (no response needed)
  if (method === 'notifications/initialized') {
    return;
  }

  // MCP Ping
  if (method === 'ping') {
    return sendRpcResponse(id, {});
  }

  // MCP Tools List
  if (method === 'tools/list') {
    return sendRpcResponse(id, { tools: TOOLS });
  }

  // MCP Tool Call
  if (method === 'tools/call') {
    const toolName = params ? params.name : null;
    const args = params ? params.arguments || {} : {};

    try {
      if (toolName === 'a2a_list_expert_agents') {
        const card = getAgentCard();
        return sendRpcResponse(id, {
          content: [
            {
              type: 'text',
              text: JSON.stringify(card, null, 2)
            }
          ]
        });
      }

      if (toolName === 'a2a_list_presets') {
        const list = presets.listPresets();
        const lines = list.map((preset) => {
          const files = preset.files.map((file) => (file.roles ? `${file.name} [${file.roles.join(', ')}]` : file.name)).join(', ');
          return `- ${preset.id}${preset.isDefault ? ' (default)' : ''}: ${preset.title}${preset.description ? ` - ${preset.description}` : ''}\n  files: ${files || '(none)'}`;
        });
        return sendRpcResponse(id, {
          content: [{
            type: 'text',
            text: list.length
              ? `Presets (pass the id as "preset"; omit it to use the default):\n${lines.join('\n')}`
              : 'No presets yet. Create one in the web panel (Presets) or with "a2a-panel presets new <id> --template <template>".'
          }]
        });
      }

      if (toolName === 'a2a_get_task_status') {
        const task = activeTasks.get(args.task_id);
        if (!task) {
          return sendRpcResponse(id, {
            content: [{ type: 'text', text: `Task "${args.task_id}" not found.` }],
            isError: true
          });
        }
        return sendRpcResponse(id, {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                id: task.id,
                role: task.role,
                status: task.status,
                startedAt: task.startedAt,
                finishedAt: task.finishedAt,
                exitCode: task.exitCode,
                error: task.error || undefined,
                usage: task.usage || undefined,
                verification: task.verification || undefined,
                conversationId: task.conversationId || undefined,
                preset: task.preset || undefined,
                changes: task.changes || undefined,
                outputPreview: task.output.slice(-2000),
                totalLength: task.outputChars || task.output.length
              }, null, 2)
            }
          ]
        });
      }

      if (toolName === 'a2a_cancel_task') {
        const task = activeTasks.get(args.task_id);
        if (!task) {
          return sendRpcResponse(id, {
            content: [{ type: 'text', text: `Task "${args.task_id}" not found.` }],
            isError: true
          });
        }
        if (task.status === 'running') {
          const result = cancelTask(task.id);
          if (!result.ok) {
            return sendRpcResponse(id, {
              content: [{ type: 'text', text: `Could not cancel task "${args.task_id}": ${result.error}` }],
              isError: true
            });
          }
        }
        return sendRpcResponse(id, {
          content: [{ type: 'text', text: `Task "${args.task_id}" has been cancelled.` }]
        });
      }

      if (toolName === 'a2a_validate_delivery') {
        const {
          task_summary,
          acceptance_criteria,
          verification_command,
          workspace_path
        } = args;

        const badValidationWorkspace = workspaceError(workspace_path);
        if (badValidationWorkspace) {
          return sendRpcResponse(id, {
            content: [{ type: 'text', text: '[A2A Validation Error]: ' + badValidationWorkspace }],
            isError: true
          });
        }

        const effectiveWorkspace = workspace_path || process.cwd();
        const validationPrompt = [
          `You are the Antigravity Senior Code Reviewer performing a formal Task Delivery Validation & Verification.`,
          `Task Delivered: ${task_summary}`,
          `Acceptance Criteria to verify:`,
          `${acceptance_criteria}`,
          verification_command ? `Verification Command to run: ${verification_command}` : '',
          `Instructions:`,
          `1. Inspect all files modified in the workspace (use git diff or file inspection).`,
          `2. Check whether each acceptance criterion is satisfied.`,
          verification_command ? `3. Execute \`${verification_command}\` and report the test results.` : '',
          `4. Output a clear Delivery Validation Report:`,
          `   - Verdict: [ACCEPTED | REVISION NEEDED]`,
          `   - Criteria Checklist (Pass/Fail per criterion)`,
          `   - Code Quality & Regressions Assessment`,
          `   - Actionable feedback if anything is missing`
        ].filter(Boolean).join('\n\n');

        return await new Promise((resolve) => {
          runAgyTask({
            role: 'code-reviewer',
            prompt: validationPrompt,
            workspace: effectiveWorkspace,
            mode: 'accept-edits',
            effort: 'high',
            verification_command,
            onDone: (taskRecord) => {
              sendRpcResponse(id, {
                content: [{
                  type: 'text',
                  text: `=== [A2A TASK VALIDATION REPORT] ===\nStatus: ${taskRecord.status.toUpperCase()}\n\n${taskRecord.output}${resultFooter(taskRecord)}`
                }],
                isError: taskRecord.status !== 'completed'
              });
              resolve();
            },
            onError: (err) => {
              sendRpcResponse(id, {
                content: [{ type: 'text', text: `[A2A Validation Error]: ${err.message}` }],
                isError: true
              });
              resolve();
            }
          });
        });
      }

      if (toolName === 'a2a_dispatch_to_antigravity') {
        const {
          role,
          task_description,
          workspace_path,
          mode = 'accept-edits',
          effort = 'high',
          model,
          conversation_id,
          acceptance_criteria,
          verification_command,
          preset,
          is_async = false
        } = args;

        const effectiveWorkspace = workspace_path || process.cwd();

        const badWorkspace = workspaceError(workspace_path);
        if (badWorkspace) {
          return sendRpcResponse(id, {
            content: [{ type: 'text', text: '[A2A Dispatch Error]: ' + badWorkspace }],
            isError: true
          });
        }

        try {
          presets.resolvePresetId(preset);
        } catch (err) {
          return sendRpcResponse(id, {
            content: [{ type: 'text', text: '[A2A Dispatch Error]: ' + err.message }],
            isError: true
          });
        }

        if (typeof task_description !== 'string' || !task_description.trim() || task_description.trim().startsWith('--')) {
          return sendRpcResponse(id, {
            content: [{ type: 'text', text: '[A2A Dispatch Error]: task_description is empty or looks like a CLI flag.' }],
            isError: true
          });
        }

        if (is_async) {
          const { taskId, taskRecord } = runAgyTask({
            role,
            prompt: task_description,
            workspace: effectiveWorkspace,
            mode,
            effort,
            model,
            conversation_id,
            acceptance_criteria,
            verification_command,
            preset
          });

          return sendRpcResponse(id, {
            content: [
              {
                type: 'text',
                text: `[A2A Dispatch] Task started in background.\nTask ID: ${taskId}\nAssigned Role: ${taskRecord.role}\nWorkspace: ${effectiveWorkspace}\nPreset: ${taskRecord.preset || 'none'}\nUse 'a2a_get_task_status' with task_id="${taskId}" to monitor progress.`
              }
            ]
          });
        }

        // Synchronous execution (await result)
        return await new Promise((resolve) => {
          runAgyTask({
            role,
            prompt: task_description,
            workspace: effectiveWorkspace,
            mode,
            effort,
            model,
            conversation_id,
            acceptance_criteria,
            verification_command,
            preset,
            onDone: (taskRecord) => {
              const summary = [
                `==================================================`,
                `[A2A RESULT] Role: ${taskRecord.role} | Status: ${taskRecord.status.toUpperCase()}`,
                `Workspace: ${effectiveWorkspace}`,
                `Duration: ${taskRecord.startedAt} -> ${taskRecord.finishedAt}`,
                `==================================================\n`,
                tailForLeader(taskRecord) + resultFooter(taskRecord)
              ].join('\n');

              sendRpcResponse(id, {
                content: [{ type: 'text', text: summary }],
                isError: taskRecord.status !== 'completed'
              });
              resolve();
            },
            onError: (err) => {
              sendRpcResponse(id, {
                content: [{ type: 'text', text: `[A2A Execution Error]: ${err.message}` }],
                isError: true
              });
              resolve();
            }
          });
        });
      }

      return sendRpcResponse(id, null, {
        code: -32601,
        message: `Unknown tool: ${toolName}`
      });
    } catch (err) {
      return sendRpcResponse(id, {
        content: [{ type: 'text', text: `Error executing tool: ${err.message}` }],
        isError: true
      });
    }
  }

  // Method not found fallback
  if (id !== undefined) {
    return sendRpcResponse(id, null, {
      code: -32601,
      message: `Method not found: ${method}`
    });
  }
});

