#!/usr/bin/env node
// A gate must not run without its inputs. The behavioural spec is a specs/ folder;
// A legacy gherkin/ folder still counts for installed projects that have not moved to
// specs yet. The factory itself no longer writes one.
// Usage: node scripts/agents/artifacts.mjs --run <epic dir> --gate <qa|design|security|code-review>
import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GATE_INPUTS = {
  qa: ['prd', 'specs', 'api-contract'],
  design: ['prd', 'design-spec', 'copy-deck'],
  security: ['prd', 'architecture', 'design-spec', 'api-contract', 'threat-model'],
  'code-review': ['prd', 'architecture', 'api-contract', 'design-spec', 'specs', 'security-review'],
};

export function missingArtifacts(dir, gate, exists = existsSync, readdir = readdirSync) {
  const inputs = GATE_INPUTS[gate];
  if (!inputs) throw new Error(`unknown gate "${gate}". Known: ${Object.keys(GATE_INPUTS).join(', ')}`);
  let entries = [];
  try {
    entries = readdir(dir);
  } catch {
    return inputs;
  }
  const has = (name) =>
    exists(join(dir, `${name}.md`)) || entries.some((entry) => new RegExp(`^${name}\\.r\\d+\\.md$`).test(entry));
  const hasSpecs = entries.includes('specs') || entries.includes('gherkin');
  return inputs.filter((name) => (name === 'specs' ? !hasSpecs : !has(name)));
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const at = args.indexOf(name);
    return at === -1 ? null : args[at + 1];
  };
  const dir = flag('--run');
  const gate = flag('--gate');
  if (!dir || !gate) {
    process.stderr.write(
      'usage: node scripts/agents/artifacts.mjs --run <epic dir> --gate <qa|design|security|code-review>\n',
    );
    process.exit(1);
  }
  let missing;
  try {
    missing = missingArtifacts(dir, gate);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
  if (missing.length === 0) {
    process.stdout.write(`Artifacts for ${gate}: complete.\n`);
    process.exit(0);
  }
  process.stderr.write(`Artifacts for ${gate}: ${missing.length} missing in ${dir}\n`);
  for (const name of missing) process.stderr.write(`  - ${name}\n`);
  process.exit(1);
}
