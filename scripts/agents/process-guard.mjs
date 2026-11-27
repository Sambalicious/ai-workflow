#!/usr/bin/env node
// Claude Code PreToolUse hook for Bash.
// Blocks name-based and blanket process kills: `pkill`, `killall`, `kill -1`,
// `kill $(pgrep …)`, `pgrep … | xargs kill` and a `kill` of a PID read from a variable.
// Those reach every matching process on the machine, including another session's dev
// backend, so a session stops only the PIDs it started. Reads the hook JSON from stdin;
// exit 2 blocks the tool call and shows stderr.
//
// The check runs on the command word after absolute paths, wrappers (`sudo`, `env`,
// `command -p`, `time -p`, `nice`, `timeout`, `nohup`, `doas`, `xargs`) and shell
// keywords (`{`, `if`, `do`, `!`). A `bash -c` or `eval` payload is checked as its own
// command, because the wrapper is not an escape hatch.
import { basename } from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const NAME_KILLS = new Set(['pkill', 'killall']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
const KEYWORDS = new Set(['{', '(', '!', 'if', 'then', 'elif', 'else', 'do', 'while', 'until', '}']);
// Wrapper commands and the flags that consume the next word. `command -p` and `time -p`
// take no value, so the command that follows must not be read as their value.
const WRAPPERS = new Map([
  ['sudo', { valueFlags: ['-u', '-g', '-p', '-h', '-C', '-T', '-U', '-r', '-t', '-D'] }],
  ['doas', { valueFlags: ['-u', '-C'] }],
  ['command', { valueFlags: [] }],
  ['builtin', { valueFlags: [] }],
  ['exec', { valueFlags: ['-a'] }],
  ['time', { valueFlags: ['-f', '-o'] }],
  ['nice', { valueFlags: ['-n'] }],
  ['nohup', { valueFlags: [] }],
  ['env', { valueFlags: ['-u', '-C', '-P'] }],
  ['timeout', { valueFlags: ['-s', '-k'], positional: 1 }],
]);

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

/** Drops a wrapper, its flags and the values they take, returning the command it wraps. */
function stripWrapper(rest, { valueFlags = [], positional = 0 }) {
  let index = 1;
  while (index < rest.length) {
    const word = rest[index];
    if (word === '--') {
      index += 1;
      break;
    }
    if (!word.startsWith('-') || word === '-') break;
    index += valueFlags.includes(word) && index + 1 < rest.length ? 2 : 1;
  }
  return rest.slice(index + positional);
}

/** The command words, after absolute paths, keywords, `sudo`, `env` assignments and their flags. */
export function commandWords(segment) {
  let rest = words(segment);
  for (;;) {
    if (rest.length === 0) return rest;
    const first = rest[0];
    const bare = first.replace(/^[$({!]+/, '').replace(/[)}]+$/, '');
    if (bare !== first) {
      rest = bare === '' ? rest.slice(1) : [bare, ...rest.slice(1)];
      continue;
    }
    if (KEYWORDS.has(first)) {
      rest = rest.slice(1);
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(first)) {
      rest = rest.slice(1);
      continue;
    }
    const wrapper = WRAPPERS.get(basename(first));
    if (wrapper) {
      rest = stripWrapper(rest, wrapper);
      continue;
    }
    return rest;
  }
}

const LITERAL_PID = /^\d+$/;
const SELF_PID = /^\$(?:\{!\}|!)$/;
const LOOKUP_COMMANDS = new Set(['pgrep', 'pidof', 'ps']);

/** The command substitutions in a `kill` argument that list processes by name. */
function lookupReason(text) {
  for (const match of text.matchAll(/\$\(([^)]*)|`([^`]*)`/g)) {
    const inner = (match[1] ?? match[2] ?? '').trim();
    if (!inner) continue;
    const argv = inner.split(/\s+/);
    const command = basename(argv[0]);
    if (LOOKUP_COMMANDS.has(command)) return 'kill driven by a process-name lookup';
    if (command === 'lsof' && argv.slice(1).some((word) => /^-[A-Za-z]*c/.test(word))) {
      return 'kill driven by an lsof command-name lookup';
    }
  }
  return null;
}

/** True when `$NAME` was assigned in this command from `$!` or from an lsof port lookup. */
function assignedFromScopedPid(operand, fullCommand) {
  const name = operand.replace(/^\$\{?/, '').replace(/\}?$/, '');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return false;
  const pattern = new RegExp(`(?:^|[;&|\\s])${name}=(.*?)(?:[;&|\\n]|$)`, 'g');
  for (const match of String(fullCommand ?? '').matchAll(pattern)) {
    const value = match[1].trim();
    if (/^\$!$/.test(value)) return true;
    if (/^\$\(\s*lsof\b[^)]*\btcp:/i.test(value)) return true;
  }
  return false;
}

/** The PID operands of `kill`, after its signal option (`-9`, `-s 9`, `-KILL`, `--`). */
function killOperands(args) {
  let index = 0;
  while (index < args.length) {
    const word = args[index];
    if (word === '--') {
      index += 1;
      break;
    }
    if (word === '-s' || word === '-n') {
      index += 2;
      continue;
    }
    if (word === '-l') return null;
    if (/^-[A-Za-z][A-Za-z0-9]*$/.test(word)) {
      index += 1;
      continue;
    }
    // A numeric signal counts only as the first word: after `-9`, a `-1` is a PID
    // operand that signals every process.
    if (index === 0 && /^-\d+$/.test(word)) {
      index += 1;
      continue;
    }
    break;
  }
  return args.slice(index);
}

/** Why this `kill` reaches beyond one PID, or null when every operand is a literal PID. */
function killReason(args, fullCommand) {
  const operands = killOperands(args);
  if (operands === null) return null;
  // `kill -9 -1 1234`, `kill -s 9 -1` and `kill -- -1` all signal every process.
  if (operands.includes('-1')) return 'kill -1 signals every process on the machine';
  const lookup = lookupReason(operands.join(' '));
  if (lookup) return lookup;
  for (const operand of operands) {
    if (LITERAL_PID.test(operand) || SELF_PID.test(operand)) continue;
    if (operand.startsWith('$') && assignedFromScopedPid(operand, fullCommand)) continue;
    return `kill ${operand} is not a literal PID this session started`;
  }
  return null;
}

/** The payload of a `bash -c` style invocation, or null when the shell runs a script file. */
function shellPayload(argv) {
  for (let index = 1; index < argv.length; index += 1) {
    const word = argv[index];
    if (word === '--') continue;
    if (/^-[A-Za-z]*c[A-Za-z]*$/.test(word)) return argv.slice(index + 1).join(' ') || null;
    if (word === '-o' || word === '+o' || word === '--rcfile' || word === '--init-file') {
      index += 1;
      continue;
    }
    if (word.startsWith('-')) continue;
    return null;
  }
  return null;
}

/** The reason this pipeline stage kills by name or kills everything, or null when it is scoped. */
export function violation(segment, fullCommand = segment) {
  const argv = commandWords(segment);
  if (argv.length === 0) return null;
  const command = basename(argv[0]);
  if (NAME_KILLS.has(command)) return `${command} kills every process with that name`;
  if (command === 'kill') return killReason(argv.slice(1), fullCommand);
  if (SHELLS.has(command)) {
    const payload = shellPayload(argv);
    if (payload !== null) return check(payload);
  }
  if (command === 'eval' && argv.length > 1) return check(argv.slice(1).join(' '));
  return null;
}

const XARGS_VALUE_FLAGS = new Set(['-n', '-I', '-L', '-P', '-s', '-d', '-E', '-a']);
const UPSTREAM_LOOKUP = /\b(?:pgrep|pidof|ps)\b|\blsof\b[^|]*\s-c\b/;

/** The command `xargs` runs, after its own flags and the values they take. */
function xargsTarget(argv) {
  let index = 1;
  while (index < argv.length) {
    const word = argv[index];
    if (word === '--') {
      index += 1;
      break;
    }
    if (XARGS_VALUE_FLAGS.has(word)) {
      index += 2;
      continue;
    }
    if (word.startsWith('-')) {
      index += 1;
      continue;
    }
    break;
  }
  return argv[index];
}

/** The first reason in the command, or null when every stage is scoped. */
export function check(command) {
  if (typeof command !== 'string' || !command.trim()) return null;
  const parts = scan(command);
  for (let index = 0; index < parts.length; index += 1) {
    const reason = violation(parts[index].text, command);
    if (reason) return reason;
    const argv = commandWords(parts[index].text);
    if (basename(argv[0] ?? '') !== 'xargs') continue;
    const target = xargsTarget(argv);
    if (target && NAME_KILLS.has(basename(target))) return `xargs ${basename(target)} kills every process with that name`;
    if (basename(target ?? '') !== 'kill') continue;
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
  `Blocked: stop processes by the PID you started. ${reason}. A name kill (pkill, killall), ` +
  '`kill -1`, a kill of a PID read from a variable or a process-name lookup, and a `kill` through ' +
  "a wrapper or `bash -c` all reach every matching process, including another session's dev " +
  'backend. Record the PID when you start a process (`cmd & echo $!`), or read your own port ' +
  '(`lsof -ti tcp:3000`), then `kill <pid>`. Ask the user before killing a process this session ' +
  'did not start.';

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
