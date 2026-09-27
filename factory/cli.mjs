#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { initialize, load, apply } from './store.mjs';
import { report } from './controller.mjs';

const usage = 'Usage: node factory/cli.mjs init <state.json> <input.json|-> | show <state.json> | apply <state.json> <event.json|->';
if (process.argv.length === 3 && ['--help', '-h'].includes(process.argv[2])) {
  process.stdout.write(`${usage}\nLocal attestations only; this controller does not launch agents or execute tests.\n`);
  process.exit(0);
}

async function json(path) {
  if (path !== '-') return JSON.parse(await readFile(path, 'utf8'));
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return JSON.parse(data);
}
try {
  const [command, path, input, ...extra] = process.argv.slice(2);
  if (extra.length || !path || !['init', 'show', 'apply'].includes(command)
    || (command === 'show' ? input !== undefined : !input)) {
    throw new Error(usage);
  }
  const state = command === 'init' ? await initialize(path, await json(input))
    : command === 'apply' ? await apply(path, await json(input)) : await load(path);
  process.stdout.write(`${JSON.stringify(report(state), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
  process.exitCode = 1;
}
