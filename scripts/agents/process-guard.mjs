#!/usr/bin/env node
// Claude Code PreToolUse hook for Bash.
// Blocks name-based and blanket process kills: `pkill`, `killall`, `kill -1` and
// `pgrep ... | xargs kill`. Those reach every matching process on the machine,
// including another session's dev backend, so a session stops only the PIDs it
// started. Reads the hook JSON from stdin; exit 2 blocks the tool call and shows stderr.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const NAME_KILLS = new Set(['pkill', 'killall']);
const PREFIX_WORDS = new Set(['sudo', 'command', 'exec', 'builtin', 'nohup', 'time', 'env']);
const PREFIX_FLAGS_WITH_VALUE = new Set(['-u', '-g', '-p', '-h', '-C', '-T', '-U', '-r', '-t']);

/** Split a shell command into pipeline stages, keeping the operator that follows each one. */
function scan(command) {
  const parts = [];
  let current = '';
  let quote = null;
  const text = String(command);
  const push = (after) => {
    if (current.trim()) parts.push({ text: current.trim(), after });
    current = '';
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      current += char;
      if (char === '\\' && quote === '"' && index + 1 < text.length) current += text[(index += 1)];
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '\\' && index + 1 < text.length) {
      current += char + text[(index += 1)];
      continue;
    }
    if (char === ';' || char === '|' || char === '&' || char === '\n') {
      let operator = char;
      if (index + 1 < text.length && /[;&|]/.test(text[index + 1])) operator += text[(index += 1)];
      if (operator.startsWith('|')) operator = '|';
      push(operator);
      continue;
    }
    current += char;
  }
  push(null);
  return parts;
}

/** Split a shell command on unquoted `;`, `|`, `&` and newlines, so each pipeline stage is checked. */
export function segments(command) {
  return scan(command).map((part) => part.text);
}

/** Shell words with quotes removed, so a quoted command name is still the command name. */
export function words(segment) {
  const result = [];
  let current = '';
  let quote = null;
  const text = String(segment);
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) {
        quote = null;
        continue;
      }
      if (char === '\\' && quote === '"' && index + 1 < text.length) {
        current += text[(index += 1)];
        continue;
      }
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === '\\' && index + 1 < text.length) {
      current += text[(index += 1)];
      continue;
    }
    if (/\s/.test(char)) {
      if (current) result.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current) result.push(current);
  return result;
}

/** The command words, after `sudo`, `env` assignments and their flags. */
export function commandWords(segment) {
  const rest = words(segment);
  while (rest.length > 0) {
    const word = rest[0].replace(/^[({$`]+/, '').replace(/[)}]+$/, '');
    if (PREFIX_WORDS.has(word)) {
      rest.shift();
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(rest[0])) {
      rest.shift();
      continue;
    }
    if (PREFIX_FLAGS_WITH_VALUE.has(rest[0]) && rest.length > 1) {
      rest.splice(0, 2);
      continue;
    }
    if (/^-[A-Za-z]+$/.test(rest[0]) && rest.length > 1) {
      rest.shift();
      continue;
    }
    return [word, ...rest.slice(1)];
  }
  return rest;
}

const LOOKUP = /\$\(\s*(?:pgrep|pidof)\b|`\s*(?:pgrep|pidof)\b/i;

/** The reason this pipeline stage kills by name or kills everything, or null when it is scoped. */
export function violation(segment) {
  const argv = commandWords(segment);
  if (argv.length === 0) return null;
  const command = argv[0];
  if (NAME_KILLS.has(command)) return `${command} kills every process with that name`;
  if (command === 'kill') {
    const args = argv.slice(1);
    // `kill -9 -1` targets every process: `-1` with no numeric PID beside it. `kill -1 1234`
    // is SIGHUP to one PID and stays allowed.
    if (args.includes('-1') && !args.some((word) => /^\d+$/.test(word))) return 'kill -1 signals every process on the machine';
    if (LOOKUP.test(args.join(' '))) return 'kill driven by a process-name lookup';
  }
  return null;
}

const UPSTREAM_LOOKUP = /\b(?:pgrep|pidof|ps)\b/;

/** The first reason in the command, or null when every stage is scoped. */
export function check(command) {
  if (typeof command !== 'string' || !command.trim()) return null;
  const parts = scan(command);
  for (let index = 0; index < parts.length; index += 1) {
    const reason = violation(parts[index].text);
    if (reason) return reason;
    const argv = commandWords(parts[index].text);
    if (argv[0] !== 'xargs') continue;
    const target = argv.slice(1).find((word) => !word.startsWith('-'));
    if (target && NAME_KILLS.has(target)) return `xargs ${target} kills every process with that name`;
    if (target !== 'kill') continue;
    // `pgrep ... | xargs kill` kills by name. `lsof -ti tcp:3000 | xargs kill` stays
    // scoped to the port this session started, so only a name lookup upstream blocks.
    const upstream = [];
    for (let before = index - 1; before >= 0 && parts[before].after === '|'; before -= 1) {
      upstream.push(parts[before].text);
    }
    if (upstream.some((text) => UPSTREAM_LOOKUP.test(text))) {
      return 'xargs kill after a process-name lookup kills processes you did not start';
    }
  }
  return null;
}

export const MESSAGE = (reason) =>
  `Blocked: stop processes by the PID you started. ${reason}. pkill, killall, kill -1 and pgrep | xargs kill ` +
  'reach every matching process, including another session\'s dev backend. Record the PID when you start a ' +
  'process (`cmd & echo $!`), or read your own port (`lsof -ti tcp:3000`), then `kill <pid>`. Ask the user ' +
  'before killing a process this session did not start.';

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  let hook;
  try {
    hook = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return 0;
  }
  if (!hook || hook.tool_name !== 'Bash') return 0;
  const reason = check(hook?.tool_input?.command);
  if (reason === null) return 0;
  process.stderr.write(`${MESSAGE(reason)}\n`);
  return 2;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
