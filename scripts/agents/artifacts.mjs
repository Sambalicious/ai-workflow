#!/usr/bin/env node
// A gate must not run without its inputs. The behavioural spec is a specs/ folder;
// A legacy gherkin/ folder still counts for installed projects that have not moved to
// specs yet. The factory itself no longer writes one.
//
// A file that exists is not an input. A design spec with headings and no blueprints,
// no feedback matrix and no copy slots is a stub: an engineer handed it invents the
// layout, the states and the strings, and the design gate then reviews the invention
// against nothing. So the design spec is validated for the three sections an
// implementer builds from, on every gate that consumes it.
//
// Usage: node scripts/agents/artifacts.mjs --run <feature dir> --gate <qa|design|security|code-review>
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GATE_INPUTS = {
  qa: ['prd', 'specs', 'api-contract'],
  design: ['prd', 'design-spec', 'design-consult', 'copy-deck'],
  security: ['prd', 'architecture', 'design-spec', 'api-contract', 'threat-model'],
  'code-review': ['prd', 'architecture', 'api-contract', 'design-spec', 'specs', 'security-review'],
};

// Words that carry no identifying weight when comparing a PRD surface name with the
// spec that must cover it. "The listing form screen" and "Listing form" are one surface.
const FILLER = new Set(['the', 'a', 'an', 'of', 'for', 'to', 'and', 'or', 'screen', 'view', 'page', 'app']);

const normalize = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Split markdown into heading -> body. A section's body runs to the next heading of the
// same or a higher level, so nested per-screen headings stay inside their parent
// section instead of truncating it to the first child. Levels 2 to 6 all count.
function sectionMap(source) {
  const lines = source.split('\n');
  const headings = [];
  lines.forEach((line, index) => {
    const match = line.match(/^(#{2,6})\s+(.+?)\s*$/);
    if (match) headings.push({ level: match[1].length, key: normalize(match[2]), index });
  });

  const sections = new Map();
  headings.forEach((heading, at) => {
    const next = headings.slice(at + 1).find((candidate) => candidate.level <= heading.level);
    const body = lines.slice(heading.index + 1, next ? next.index : lines.length);
    const existing = sections.get(heading.key);
    if (existing) existing.push(...body);
    else sections.set(heading.key, body);
  });
  return sections;
}

function sectionFor(sections, needle) {
  for (const [key, lines] of sections) if (key.includes(needle)) return lines;
  return null;
}

// Fenced blocks are wireframes and examples. Their pipes are drawing, not table cells,
// so table parsing runs on the unfenced lines only.
function unfenced(lines) {
  const kept = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && line.trim().startsWith('|')) kept.push(line);
  }
  return kept;
}

function fenced(lines) {
  const blocks = [];
  let block = null;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      if (block) blocks.push(block);
      block = block ? null : [];
      continue;
    }
    if (block) block.push(line);
  }
  return blocks;
}

const splitRow = (line) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

const isSeparator = (cells) => cells.every((cell) => /^:?-{2,}:?$/.test(cell));
const isBlank = (cell) => cell === '' || /^[-—–]+$/.test(cell) || /^n\/?a$/i.test(cell);

// Returns { header, rows } for the first table in a set of lines, or null.
function firstTable(lines) {
  const rows = unfenced(lines);
  if (rows.length < 2) return null;
  const header = splitRow(rows[0]).map(normalize);
  const body = rows
    .slice(1)
    .map(splitRow)
    .filter((cells) => !isSeparator(cells));
  return { header, rows: body };
}

const column = (table, needle) => (table === null ? -1 : table.header.findIndex((cell) => cell.includes(needle)));
const hasColumn = (table, ...needles) => needles.every((needle) => column(table, needle) !== -1);

const WIREFRAME = /[┌┐└┘│─├┤┬┴┼]|\+[-=]{2,}/;
const SLOT_ID = /^[^.\s]+\.[^.\s]+\.[^.\s]+$/;
const NONE = /^\*{0,2}none\*{0,2}\.?\s*$/i;

// The design spec must carry the three sections an implementer builds from. Output
// format for each lives in .agents/skills/designer.md; this checks substance, not the
// prose, so a designer cannot pass by writing the heading and moving on.
export function designSpecProblems(source, file = 'design-spec') {
  const problems = [];
  const add = (message) => problems.push(`${file}: ${message}`);
  const sections = sectionMap(source);

  const blueprints = sectionFor(sections, 'blueprint');
  if (!blueprints) {
    add('missing section "Screen blueprints"');
  } else {
    const body = blueprints.join('\n');
    const wireframes = fenced(blueprints).filter((block) => block.some((line) => WIREFRAME.test(line)));
    if (wireframes.length === 0) add('Screen blueprints: no ASCII wireframe (fenced block with a frame)');
    if (!/goal/i.test(body)) add('Screen blueprints: no "Goal" line');
    if (!/primary action/i.test(body)) add('Screen blueprints: no "Primary action" line');
  }

  const feedback = sectionFor(sections, 'feedback matrix');
  if (!feedback) {
    add('missing section "Feedback matrix"');
  } else if (NONE.test(feedback.join('\n').trim())) {
    add('Feedback matrix: "None" — every state change or failure needs a row');
  } else {
    const table = firstTable(feedback);
    if (!hasColumn(table, 'pattern', 'tone')) {
      add('Feedback matrix: no table with "Pattern" and "Tone" columns');
    } else {
      const event = 0;
      const pattern = column(table, 'pattern');
      const tone = column(table, 'tone');
      const rows = table.rows.filter((cells) => !isBlank(cells[event] ?? ''));
      if (rows.length === 0) add('Feedback matrix: table has no event rows');
      for (const cells of rows) {
        if (isBlank(cells[pattern] ?? '') || isBlank(cells[tone] ?? '')) {
          add(`Feedback matrix: event "${cells[event]}" has no pattern or tone`);
        }
      }
    }
  }

  const slots = sectionFor(sections, 'copy slot');
  if (!slots) {
    add('missing section "Copy slots"');
  } else if (NONE.test(slots.join('\n').trim())) {
    // Allowed: the designer states None when the change adds or changes no string.
  } else {
    const table = firstTable(slots);
    if (!hasColumn(table, 'id', 'intent')) {
      add('Copy slots: no table with "ID" and "Intent" columns');
    } else {
      const idAt = column(table, 'id');
      const intentAt = column(table, 'intent');
      const rows = table.rows.filter((cells) => !isBlank(cells[idAt] ?? ''));
      if (rows.length === 0) add('Copy slots: table has no slot rows');
      for (const cells of rows) {
        const id = cells[idAt];
        if (!SLOT_ID.test(id)) add(`Copy slots: id "${id}" is not screen.element.state`);
        if (isBlank(cells[intentAt] ?? '')) add(`Copy slots: ${id} has no intent`);
      }
    }
  }

  // The style basis is where DESIGN.md enters. An empty section is how a product ends
  // up with per-feature typography and per-feature status tones.
  const style = sectionFor(sections, 'style decision');
  if (!style) {
    add('missing section "Style decisions"');
  } else {
    const body = style.join('\n').trim();
    if (body === '') add('Style decisions: empty — state Per DESIGN.md or the tokens');
    else if (NONE.test(body)) add('Style decisions: "None" — a UI change must have a style basis');
  }

  return problems;
}

function readdirSafe(dir, readdir) {
  try {
    return readdir(dir);
  } catch {
    return [];
  }
}

// The latest artifact for a name: the highest .rN.md revision wins, then the base file.
export function artifactFile(dir, name, exists = existsSync, readdir = readdirSync) {
  const revisions = readdirSafe(dir, readdir)
    .map((entry) => {
      const match = entry.match(new RegExp(`^${name}\\.r(\\d+)\\.md$`));
      return match ? { file: entry, n: Number(match[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.n - a.n);
  if (revisions.length > 0) return revisions[0].file;
  return exists(join(dir, `${name}.md`)) ? `${name}.md` : null;
}

// Pull the PRD's Surfaces table. Returns null when the section is absent, [] when the
// PM stated None, otherwise one entry per surface with its declared states.
export function surfacesFromPrd(source) {
  const body = sectionFor(sectionMap(source), 'surface');
  if (!body) return null;
  if (NONE.test(body.join('\n').trim())) return [];
  const table = firstTable(body);
  if (table === null) return null;
  const stateAt = column(table, 'state');
  return table.rows
    .filter((cells) => !isBlank(cells[0] ?? ''))
    .map((cells) => ({
      name: cells[0],
      states: (stateAt === -1 ? '' : (cells[stateAt] ?? ''))
        .split(',')
        .map((state) => state.trim())
        .filter((state) => state !== '' && !/^n\/?a$/i.test(state)),
    }));
}

const words = (text) =>
  normalize(text)
    .split(' ')
    .filter((word) => word !== '' && !FILLER.has(word));

// The PRD names the surfaces and their states; the spec must cover them. Inventing a
// screen the PRD never mentions, or dropping the one that has the loading state, is the
// drift this catches. Vocabulary stays the PRD's so handoffs can be read side by side.
export function surfaceCoverageProblems(prdSource, specSource, prdFile = 'prd', specFile = 'design-spec') {
  const surfaces = surfacesFromPrd(prdSource);
  if (surfaces === null) return [`${prdFile}: no "Surfaces" section — name the screens and their states`];
  if (surfaces.length === 0) return [];

  const flat = ` ${normalize(specSource)} `;
  const present = new Set(words(specSource).map((word) => word.replace(/s$/, '')));
  const problems = [];

  for (const surface of surfaces) {
    const phrase = words(surface.name).join(' ');
    const named = phrase !== '' && flat.includes(` ${phrase} `);
    const partial = words(surface.name).every((word) => present.has(word.replace(/s$/, '')));
    if (!named && !partial) problems.push(`${specFile}: surface "${surface.name}" is not covered by any blueprint`);
    for (const state of surface.states) {
      const stem = normalize(state).replace(/s$/, '');
      if (stem !== '' && !present.has(stem)) {
        problems.push(`${specFile}: surface "${surface.name}" state "${state}" is not addressed`);
      }
    }
  }
  return problems;
}

// Returns { missing, invalid }: absent inputs, and inputs present but unusable.
export function artifactProblems(dir, gate, deps = {}) {
  const { exists = existsSync, readdir = readdirSync, readFile = readFileSync } = deps;
  const inputs = GATE_INPUTS[gate];
  if (!inputs) throw new Error(`unknown gate "${gate}". Known: ${Object.keys(GATE_INPUTS).join(', ')}`);

  const entries = readdirSafe(dir, readdir);
  const hasSpecs = entries.includes('specs') || entries.includes('gherkin');
  const missing = inputs.filter((name) =>
    name === 'specs' ? !hasSpecs : artifactFile(dir, name, exists, readdir) === null,
  );

  const read = (name) => {
    const file = artifactFile(dir, name, exists, readdir);
    if (file === null) return { file: null, text: '' };
    try {
      return { file, text: String(readFile(join(dir, file), 'utf8')) };
    } catch {
      return { file, text: null };
    }
  };

  const invalid = [];
  if (inputs.includes('design-spec') && !missing.includes('design-spec')) {
    const spec = read('design-spec');
    if (spec.text === null) invalid.push(`${spec.file}: unreadable`);
    else if (spec.text !== '') invalid.push(...designSpecProblems(spec.text, spec.file));

    // The surfaces cross-check belongs to the design gate: it is the gate that reviews
    // the rendered screens against the PRD.
    if (gate === 'design' && spec.text) {
      const prd = read('prd');
      if (prd.text === null) invalid.push(`${prd.file}: unreadable`);
      else if (prd.text !== '') invalid.push(...surfaceCoverageProblems(prd.text, spec.text, prd.file, spec.file));
    }
  }

  return { missing, invalid };
}

export function missingArtifacts(dir, gate, exists = existsSync, readdir = readdirSync) {
  return artifactProblems(dir, gate, { exists, readdir }).missing;
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
      'usage: node scripts/agents/artifacts.mjs --run <feature dir> --gate <qa|design|security|code-review>\n',
    );
    process.exit(1);
  }
  let problems;
  try {
    problems = artifactProblems(dir, gate);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
  const { missing, invalid } = problems;
  if (missing.length === 0 && invalid.length === 0) {
    process.stdout.write(`Artifacts for ${gate}: complete.\n`);
    process.exit(0);
  }
  const counts = [missing.length > 0 && `${missing.length} missing`, invalid.length > 0 && `${invalid.length} unusable`]
    .filter(Boolean)
    .join(', ');
  process.stderr.write(`Artifacts for ${gate}: ${counts} in ${dir}\n`);
  for (const name of missing) process.stderr.write(`  - missing: ${name}\n`);
  for (const problem of invalid) process.stderr.write(`  - ${problem}\n`);
  process.exit(1);
}
