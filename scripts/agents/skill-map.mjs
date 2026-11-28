#!/usr/bin/env node
// Which role owns each shared skill, and the trigger for loading it. Role files and
// AGENTS.md name the same skills for interactive sessions; skill-map.test.mjs fails
// when a skill has no owner or an owner's file does not name it.
// Usage: node scripts/agents/skill-map.mjs <role>...   prints the block to paste into a brief
import { realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FACTORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// A key matches .agents/<key>.md. "lead" is the orchestrator (AGENTS.md) and
// "code-reviewer" has no role file: the code-review skill defines it.
// [skill, trigger, file inside the skill folder when it is not SKILL.md]
export const ROLE_SKILLS = {
  lead: [
    ['dispatch-worker', 'implementation begins, or a worker result needs a rewrite'],
    ['factory-loop', 'coordinating a bounded implementation or repair run'],
    ['triage', 'a feature request, bug report or failure with an unknown cause'],
    ['retro', 'a retrospective on a finished run'],
    ['hand-off', 'another session has to continue this one'],
    ['writing-for-agents', 'editing a skill, AGENTS.md or CLAUDE.md'],
    ['company-brain', 'building a knowledge base around one recurring workflow'],
    ['principle-guard-the-context-window', 'context is filling up, or work is about to fan out'],
    ['principle-sequence-verifiable-units', 'planning multi-step work or stacked pull requests'],
    ['principle-build-the-lever', 'non-trivial edits, migrations or checks'],
    ['show-me-your-work', 'an unattended or multi-phase run that a human reviews later'],
    ['technical-writing', 'writing or reviewing docs, READMEs or PR descriptions'],
    ['wizard', 'a human has steps that only they can perform'],
    ['resolving-merge-conflicts', 'a merge or rebase has conflicts'],
    ['unslop', 'writing reports, handoffs or PR text'],
  ],
  'product-manager': [
    ['grilling', 'the user asks to stress-test an idea or plan'],
  ],
  architect: [
    ['codebase-design', 'drawing module boundaries or interfaces'],
    ['domain-modeling', 'naming domain concepts, or writing CONTEXT.md or an ADR'],
    ['principle-separate-before-serializing-shared-state', 'two actors can write the same data, file or key'],
    ['prototype', 'a state model or logic question that only running code can answer'],
  ],
  designer: [
    ['impeccable', 'planning or critiquing a screen; read the reference files your role file names'],
    ['emil-design-eng', 'deciding which interactions deserve motion; sections The Animation Decision Framework and Spring Animations'],
    ['apple-design', 'the surface has gestures, sheets or drag interactions'],
    ['break-ui', 'a data component needs worst-case data; sections Hard Rules and Workflow'],
    ['web-design-guidelines', 'review mode: checking built UI code'],
    ['find-animation-opportunities', 'asked where motion is missing'],
    ['improve-animations', 'asked to audit existing motion'],
    ['agent-browser', 'looking at a running screen'],
    ['unslop', 'writing slot intents and the TL;DR'],
  ],
  'backend-engineer': [
    ['clean-code', 'writing or reviewing code'],
    ['clean-code-principles', 'designing or refactoring modules'],
    ['tdd', 'new behavior or a regression test'],
    ['diagnosing-bugs', 'the cause of a failure is unknown'],
    ['blast-radius', 'changing shared code, contracts or schemas'],
    ['typescript-best-practices', 'reading or editing TypeScript'],
    ['principle-type-system-discipline', 'designing types or function signatures'],
    ['nestjs-best-practices', 'the project uses NestJS'],
    ['nestjs-professional-software-engineering', 'a NestJS design, refactor or version-specific syntax question'],
    ['nestjs-code-audit', 'asked to audit a NestJS codebase (read-only)'],
    ['nestjs-feature-audit', 'asked to audit a NestJS feature against its roadmap (read-only)'],
    ['principle-build-the-lever', 'non-trivial edits, migrations or checks'],
    ['resolving-merge-conflicts', 'a merge or rebase has conflicts'],
    ['principle-prove-it-works', 'before reporting completion'],
    ['unslop', 'writing reports, handoffs or PR text'],
  ],
  'frontend-engineer': [
    ['clean-code', 'writing or reviewing code'],
    ['tdd', 'new behavior or a regression test'],
    ['typescript-best-practices', 'reading or editing TypeScript'],
    ['vercel-react-best-practices', 'the project uses React or Next.js and the change touches components or data fetching'],
    ['msw', 'the project mocks APIs with MSW, or you add a mock'],
    ['impeccable', 'before any UI edit', 'reference/craft-floor.md'],
    ['impeccable', 'one pass on finished screens', 'reference/polish.md'],
    ['impeccable', 'one pass on finished screens', 'reference/audit.md'],
    ['emil-design-eng', 'implementing motion the spec calls for; sections Spring Animations, CSS Transform Mastery, Performance Rules and Accessibility'],
    ['animate', 'building an animation the spec calls for'],
    ['animation-performance', 'an animation drops frames'],
    ['animation-vocabulary', 'a motion effect is described without its name'],
    ['review-animations', 'before reporting motion work complete'],
    ['mobile-native', 'the UI must work on phones; sections The Symptom Table and The Fixes'],
    ['pick-ui-library', 'before hand-rolling a component the design system lacks'],
    ['ask-sonner', 'the project uses Sonner, or you add toasts with it'],
    ['prototype-picker', 'the user asks to compare several UI variants'],
    ['break-ui', 'before reporting completion on a data component; sections Workflow and Required Output Format'],
    ['agent-browser', 'checking a screen in a real browser'],
    ['resolving-merge-conflicts', 'a merge or rebase has conflicts'],
    ['principle-prove-it-works', 'before reporting completion'],
    ['unslop', 'writing reports and handoffs'],
  ],
  qa: [
    ['playwright-testing', 'writing or fixing Playwright tests'],
    ['msw', 'tests mock APIs with MSW'],
    ['agent-browser', 'verifying behavior in a real browser'],
    ['diagnosing-bugs', 'isolating a failure'],
    ['blast-radius', 'looking for regressions beyond the diff'],
    ['principle-prove-it-works', 'verifying against the real artifact'],
    ['unslop', 'writing reports'],
  ],
  security: [
    ['owasp-security', 'a threat model or candidate review; read only the sections for the surfaces in scope'],
  ],
  devops: [
    ['wizard', 'provisioning, credentials or a cutover needs a human'],
    ['principle-build-the-lever', 'non-trivial infrastructure edits or migrations'],
    ['principle-sequence-verifiable-units', 'a multi-step rollout or migration'],
    ['technical-writing', 'writing runbooks'],
  ],
  copywriter: [
    ['unslop', 'every string'],
  ],
  'code-reviewer': [
    ['code-review', 'every review'],
    ['blast-radius', 'the diff touches shared code, contracts or schemas'],
  ],
};

// Skills whose trigger applies to every session of the role. Runners halt a run whose
// report does not list them.
const BUILDER_REQUIRED = ['tdd', 'clean-code', 'principle-prove-it-works', 'unslop'];
export const REQUIRED = {
  'backend-engineer': BUILDER_REQUIRED,
  'frontend-engineer': BUILDER_REQUIRED,
  qa: ['principle-prove-it-works', 'unslop'],
  security: ['owasp-security'],
  'code-reviewer': ['code-review'],
};

const entriesFor = (role, only) => {
  if (!ROLE_SKILLS[role]) throw new Error(`no skills are mapped to role "${role}"`);
  return ROLE_SKILLS[role].filter(([skill]) => !only || only.includes(skill));
};
const isRequired = (role, skill) => (REQUIRED[role] ?? []).includes(skill);

// "<skill>/<file>" for each file the session must read, without duplicates across roles.
export function requiredSkills(roles, only = null) {
  const files = roles.flatMap((role) => entriesFor(role, only)
    .filter(([skill]) => isRequired(role, skill))
    .map(([skill, , file = 'SKILL.md']) => `${skill}/${file}`));
  return [...new Set(files)];
}

const BULLET = /^\s*(?:[-*+•]|\d+[.)])\s+/;
// A bare word, or an absolute path to a markdown file that may contain spaces.
const isReference = (item) => !/\s/.test(item) || (item.startsWith('/') && item.endsWith('.md') && !/\s\//.test(item));

// The file references on one line of a list. A ";"-separated part that says anything
// else ("skipped tdd", "tdd: not applicable") contributes nothing.
function references(line) {
  const text = line.replace(BULLET, '').replace(/\([^()]*\)/g, '').replace(/[*`"'[\]]|__/g, '');
  return text.split(';').flatMap((part) => {
    const items = part.split(/,|\s+and\s+/).map((item) => item.trim().replace(/^and\s+/, '').replace(/\.$/, '')).filter(Boolean);
    return items.every(isReference) ? items : [];
  });
}

// A SKILL.md also counts when only the skill's name or folder is given.
function names(reference, file) {
  if (reference === file || reference.endsWith(`/${file}`)) return true;
  const [skill, ...rest] = file.split('/');
  return rest.join('/') === 'SKILL.md' && (reference === skill || reference.endsWith(`/skills/${skill}`));
}

// What the report's last "Skills read" statement lists: that line, then each following
// bullet or line of file references, up to the first line that is something else.
function skillsListed(report, required) {
  const last = [...report.matchAll(/skills read[*_`]*(?:\s*\([^)\n]*\))?[*_`]*\s*:/gi)].pop();
  if (!last) return [];
  const [head, ...below] = report.slice(last.index + last[0].length).split('\n');
  const listed = references(head);
  if (listed[0]?.toLowerCase() === 'none') return [];
  for (const line of below) {
    if (/^\s*(?:```\w*|[*_]*)\s*$/.test(line)) continue;
    const found = references(line);
    const isList = found.length && found.every((ref) => ref.includes('/') || required.some((file) => names(ref, file)));
    if (!BULLET.test(line) && !isList) break;
    listed.push(...found);
  }
  return listed;
}

// Required files missing from the report's last "Skills read" statement.
export function unreadSkills(report, required) {
  const listed = skillsListed(report ?? '', required);
  return required.filter((file) => !listed.some((reference) => names(reference, file)));
}

export function skillBlock(roles, factoryRoot = FACTORY_ROOT, only = null) {
  const path = (file) => join(factoryRoot, '.agents/skills', file);
  const required = requiredSkills(roles, only);
  // A trigger's "read only ..." limit still applies to a required file.
  const limits = new Map(roles.flatMap((role) => entriesFor(role, only).flatMap(([skill, when, file = 'SKILL.md']) => {
    const limit = when.split('; ').find((part) => part.startsWith('read only'));
    return limit ? [[`${skill}/${file}`, ` (${limit})`]] : [];
  })));
  const first = required.length ? `\nRequired in every session. Read these before you start:\n${required.map((file) => `- ${path(file)}${limits.get(file) ?? ''}`).join('\n')}` : '';
  const sections = roles.flatMap((role) => {
    const lines = entriesFor(role, only)
      .filter(([skill]) => !isRequired(role, skill))
      .map(([skill, when, file = 'SKILL.md']) => `- ${when}: ${path(`${skill}/${file}`)}`);
    return lines.length ? [`${role}:\n${lines.join('\n')}`] : [];
  });
  const choose = roles.length > 1 ? ' Use only the lists for the code you change.' : '';
  const rest = sections.length ? `\nRead when the trigger applies, before that step; skip the rest.${choose}\n${sections.join('\n')}` : '';
  return `Skills. The project's own rules and the approved documents win over a skill.${first}${rest}`;
}

// Runners append this so a skipped skill shows up in the report instead of passing silently.
export const SKILLS_READ = 'End your answer with one line "Skills read: <file paths>", or "Skills read: none (<why no trigger applied>)".';

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const roles = process.argv.slice(2);
  if (!roles.length) {
    process.stderr.write(`usage: node scripts/agents/skill-map.mjs <role>...\nroles: ${Object.keys(ROLE_SKILLS).join(' ')}\n`);
    process.exit(2);
  }
  try {
    process.stdout.write(`${skillBlock(roles)}\n`);
  } catch (error) {
    process.stderr.write(`skill-map: ${error.message}\n`);
    process.exit(1);
  }
}
