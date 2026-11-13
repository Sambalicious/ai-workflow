import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GATE_INPUTS,
  artifactFile,
  artifactProblems,
  designSpecProblems,
  missingArtifacts,
  surfaceCoverageProblems,
  surfacesFromPrd,
} from './artifacts.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

const fakeFs = (entries) => ({
  exists: (path) => entries.includes(path.split('/').pop()),
  readdir: () => entries,
});

const fence = '```';

// A design spec that satisfies every section the design gate requires.
const completeSpec = [
  '# Design spec',
  '',
  '### Screen blueprints',
  '',
  '**Listing form**',
  '- **Goal**: publish one property',
  '- **Primary action**: submit listing',
  '',
  fence,
  '+---------------------------+',
  '| Rent duration  [v]        |',
  '+---------------------------+',
  fence,
  '',
  '### Feedback matrix',
  '',
  '| Event | Pattern | Tone | Weight | Icon | Copy slot ID | Recovery action |',
  '|---|---|---|---|---|---|---|',
  '| Submit rejected | alert panel | danger | strong | alert | listing.form.error | Try again |',
  '',
  '### Copy slots',
  '',
  '| ID | Screen/Component | Situation | Condition | Intent | Budget | Spec case ID |',
  '|---|---|---|---|---|---|---|',
  '| listing.form.label | Listing form | Primary button | Always | Name the action | 3 words | S01_01 |',
  '| listing.form.error | Listing form | Alert panel | Submit rejected | Say what failed | 8 words | S01_02 |',
  '',
  '### Style decisions',
  '',
  'Per DESIGN.md',
  '',
].join('\n');

// The shape FEAT-0004 shipped: headline sections, no blueprint, no matrix, no slots.
const stubSpec = [
  '# UI/UX Design Spec',
  '',
  '## UX Flows',
  '- Owner flow: List property, then submit',
  '',
  '## Component Inventory',
  '- Property Listing Form',
  '',
  '## Style Decisions',
  '- Use clear icons',
  '',
  '## TL;DR',
  'Simple, accessible UI.',
  '',
].join('\n');

const prdText = [
  '# PRD',
  '',
  '### User stories',
  '- S1: As an owner, I want to list a property so that tenants find it.',
  '',
  '### Surfaces',
  '',
  '| Surface | Stories | States | New/Changed |',
  '|---|---|---|---|',
  '| Listing form | S1 | primary, error | New |',
  '',
].join('\n');

const consultText = '# Design consult\n\nNo blockers.\n';

const withFeature = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'artifacts-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
};

const designFeature = (overrides = {}) =>
  withFeature({
    'prd.md': prdText,
    'design-spec.md': completeSpec,
    'design-consult.md': consultText,
    'copy-deck.md': '# Copy deck',
    ...overrides,
  });

const withDir = (files, run) => {
  const dir = withFeature(files);
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('a complete feature has no missing artifacts for any gate', () => {
  const entries = [
    'prd.r1.md',
    'specs',
    'architecture.md',
    'design-spec.r2.md',
    'design-consult.md',
    'copy-deck.md',
    'api-contract.md',
    'threat-model.md',
    'security-review.md',
  ];
  for (const gate of Object.keys(GATE_INPUTS)) {
    assert.deepEqual(missingArtifacts('/feature', gate, fakeFs(entries).exists, fakeFs(entries).readdir), [], gate);
  }
});

test('the security gate fails when the threat model is absent', () => {
  const entries = ['prd.md', 'specs', 'architecture.md', 'design-spec.md', 'api-contract.md'];
  assert.deepEqual(missingArtifacts('/feature', 'security', fakeFs(entries).exists, fakeFs(entries).readdir), [
    'threat-model',
  ]);
});

test('a revised artifact satisfies the requirement', () => {
  const entries = ['prd.r1.md', 'gherkin', 'api-contract.md'];
  assert.deepEqual(missingArtifacts('/feature', 'qa', fakeFs(entries).exists, fakeFs(entries).readdir), []);
});

test('a legacy gherkin folder satisfies the spec input, and neither folder fails it', () => {
  const legacy = ['prd.md', 'gherkin', 'api-contract.md'];
  assert.deepEqual(missingArtifacts('/feature', 'qa', fakeFs(legacy).exists, fakeFs(legacy).readdir), []);
  const none = ['prd.md', 'api-contract.md'];
  assert.deepEqual(missingArtifacts('/feature', 'qa', fakeFs(none).exists, fakeFs(none).readdir), ['specs']);
});

test('an unknown gate is a usage error, not a pass', () => {
  assert.throws(() => missingArtifacts('/feature', 'deploy'), /unknown gate "deploy"/);
});

test('a missing directory reports every input rather than throwing', () => {
  assert.deepEqual(
    missingArtifacts(
      '/nope',
      'qa',
      () => false,
      () => {
        throw new Error('ENOENT');
      },
    ),
    GATE_INPUTS.qa,
  );
});

test('the highest revision wins over the base file', () => {
  const entries = ['design-spec.md', 'design-spec.r2.md', 'design-spec.r10.md', 'design-spec.r1.md'];
  const fs = fakeFs(entries);
  assert.equal(artifactFile('/feature', 'design-spec', fs.exists, fs.readdir), 'design-spec.r10.md');
  const baseOnly = fakeFs(['design-spec.md']);
  assert.equal(artifactFile('/feature', 'design-spec', baseOnly.exists, baseOnly.readdir), 'design-spec.md');
  assert.equal(artifactFile('/feature', 'design-spec', fakeFs([]).exists, fakeFs([]).readdir), null);
});

test('a spec with blueprints, a feedback matrix and copy slots passes', () => {
  assert.deepEqual(designSpecProblems(completeSpec), []);
});

test('a headline-only spec fails on the sections that carry the build', () => {
  const problems = designSpecProblems(stubSpec);
  for (const section of ['Screen blueprints', 'Feedback matrix', 'Copy slots']) {
    assert.ok(
      problems.some((problem) => problem.includes(`missing section "${section}"`)),
      `expected a missing-section problem for ${section} in:\n${problems.join('\n')}`,
    );
  }
});

test('headings without substance still fail', () => {
  const hollow = [
    '# Design spec',
    '## Screen blueprints',
    'The form is simple.',
    '## Feedback matrix',
    '| Event | Pattern | Tone |',
    '|---|---|---|',
    '## Copy slots',
    '| ID | Intent |',
    '|---|---|',
  ].join('\n');
  const problems = designSpecProblems(hollow);
  assert.ok(problems.some((problem) => /no ASCII wireframe/.test(problem)), problems.join('\n'));
  assert.ok(problems.some((problem) => /no "Goal" line/.test(problem)), problems.join('\n'));
  assert.ok(problems.some((problem) => /no event rows/.test(problem)), problems.join('\n'));
  assert.ok(problems.some((problem) => /no slot rows/.test(problem)), problems.join('\n'));
});

test('a copy slot id that is not screen.element.state is rejected', () => {
  const problems = designSpecProblems(completeSpec.replace('listing.form.label', 'SubmitButton'));
  assert.ok(problems.some((problem) => /not screen\.element\.state/.test(problem)), problems.join('\n'));
});

test('a copy slot with no intent is rejected', () => {
  const source = completeSpec.replace(
    '| listing.form.label | Listing form | Primary button | Always | Name the action |',
    '| listing.form.label | Listing form | Primary button | Always | - |',
  );
  assert.ok(
    designSpecProblems(source).some((problem) => /has no intent/.test(problem)),
    designSpecProblems(source).join('\n'),
  );
});

test('the designer may state None for copy slots when no string changes', () => {
  const source = completeSpec.replace(
    /### Copy slots[\s\S]*?(?=### Style decisions)/,
    '### Copy slots\n\nNone.\n\n',
  );
  assert.deepEqual(designSpecProblems(source), []);
});

test('the feedback matrix may not be waived with None', () => {
  const source = completeSpec.replace(
    /### Feedback matrix[\s\S]*?(?=### Copy slots)/,
    '### Feedback matrix\n\nNone.\n\n',
  );
  assert.ok(
    designSpecProblems(source).some((problem) => /every state change or failure needs a row/.test(problem)),
    designSpecProblems(source).join('\n'),
  );
});

test('the style basis may be DESIGN.md or the tokens, never empty', () => {
  const empty = completeSpec.replace('Per DESIGN.md', '');
  assert.ok(designSpecProblems(empty).some((problem) => /Style decisions: empty/.test(problem)));
  const none = completeSpec.replace('Per DESIGN.md', 'None.');
  assert.ok(designSpecProblems(none).some((problem) => /style basis/.test(problem)));
  const tokens = completeSpec.replace('Per DESIGN.md', 'Body 16/1.5 Inter; spacing 4px; accent #2563eb');
  assert.deepEqual(designSpecProblems(tokens), []);
});

test('a wireframe fence is not read as table rows', () => {
  const source = completeSpec.replace('| Rent duration  [v]        |', '| a | b | c | d |');
  assert.deepEqual(designSpecProblems(source), []);
});

test('nested per-screen headings stay inside their section', () => {
  const nested = [
    '# Design spec',
    '## Screen blueprints',
    '### Listing form',
    '- **Goal**: publish one property',
    '- **Primary action**: submit listing',
    fence,
    '+---------------------------+',
    '| Rent duration  [v]        |',
    '+---------------------------+',
    fence,
    '## Feedback matrix',
    '| Event | Pattern | Tone |',
    '|---|---|---|',
    '| Submit rejected | alert panel | danger |',
    '## Copy slots',
    '| ID | Intent |',
    '|---|---|',
    '| listing.form.label | Name the action |',
    '## Style decisions',
    'Per DESIGN.md',
  ].join('\n');
  assert.deepEqual(designSpecProblems(nested), []);
});

test('the PRD surfaces table is parsed into surfaces and states', () => {
  assert.deepEqual(surfacesFromPrd(prdText), [{ name: 'Listing form', states: ['primary', 'error'] }]);
  assert.equal(surfacesFromPrd('# PRD\n\n## User stories\n- nothing\n'), null);
  assert.deepEqual(surfacesFromPrd('# PRD\n\n## Surfaces\n\nNone.\n'), []);
});

test('a surface the PRD names but the spec omits is a problem', () => {
  const prd = prdText.replace('| Listing form | S1 | primary, error | New |', '| Listing form | S1 | primary, error | New |\n| Tenant search | S1 | primary, empty | New |');
  const problems = surfaceCoverageProblems(prd, completeSpec);
  assert.ok(problems.some((problem) => /surface "Tenant search" is not covered/.test(problem)), problems.join('\n'));
  assert.ok(problems.some((problem) => /state "empty" is not addressed/.test(problem)), problems.join('\n'));
});

test('a state the PRD names but the spec never mentions is a problem', () => {
  const prd = prdText.replace('primary, error', 'primary, loading');
  const problems = surfaceCoverageProblems(prd, completeSpec);
  assert.ok(problems.some((problem) => /state "loading" is not addressed/.test(problem)), problems.join('\n'));
});

test('a PRD with no surfaces table is a problem, and a stated None is not', () => {
  const problems = surfaceCoverageProblems('# PRD\n\n## Goals\n- ship\n', completeSpec);
  assert.ok(problems.some((problem) => /no "Surfaces" section/.test(problem)), problems.join('\n'));
  assert.deepEqual(surfaceCoverageProblems('# PRD\n\n## Surfaces\n\nNone.\n', completeSpec), []);
});

test('surface matching tolerates filler words and plural forms', () => {
  const prd = '# PRD\n\n## Surfaces\n\n| Surface | States |\n|---|---|\n| The listing form | |\n| Empty state | |\n';
  const spec = '## Screen blueprints\n\n**Listing form** empty state\n';
  assert.deepEqual(surfaceCoverageProblems(prd, spec), []);
});

test('the design gate fails a stub spec even though every input file exists', () => {
  withDir({ 'prd.md': prdText, 'design-spec.md': stubSpec, 'design-consult.md': consultText, 'copy-deck.md': '# Deck' }, (dir) => {
    const { missing, invalid } = artifactProblems(dir, 'design');
    assert.deepEqual(missing, []);
    // Three sections the build depends on, plus the two states the PRD names and the
    // stub never addresses.
    assert.equal(invalid.length, 5, invalid.join('\n'));
    assert.ok(invalid.some((problem) => /state "error" is not addressed/.test(problem)), invalid.join('\n'));
  });
});

test('the design gate passes a complete feature', () => {
  withDir(
    {
      'prd.md': prdText,
      'design-spec.md': completeSpec,
      'design-consult.md': consultText,
      'copy-deck.md': '# Copy deck',
    },
    (dir) => assert.deepEqual(artifactProblems(dir, 'design'), { missing: [], invalid: [] }),
  );
});

test('the design gate requires the advisor consult', () => {
  withDir(
    { 'prd.md': prdText, 'design-spec.md': completeSpec, 'copy-deck.md': '# Copy deck' },
    (dir) => {
      const { missing } = artifactProblems(dir, 'design');
      assert.deepEqual(missing, ['design-consult']);
    },
  );
});

test('a stub revision invalidates a complete base spec', () => {
  withDir({ 'prd.md': prdText, 'design-spec.r1.md': completeSpec, 'design-spec.r2.md': stubSpec }, (dir) => {
    const { invalid } = artifactProblems(dir, 'design');
    assert.ok(invalid.some((problem) => problem.startsWith('design-spec.r2.md:')), invalid.join('\n'));
  });
});

test('gates that consume the design spec validate it too', () => {
  withDir(
    {
      'prd.md': prdText,
      'architecture.md': '# Architecture',
      'api-contract.md': '# Contract',
      'design-spec.md': stubSpec,
      'threat-model.md': '# Threat model',
      'security-review.md': '# Security',
      specs: '',
    },
    (dir) => {
      // specs is a directory in practice; the fake file is enough for the input check.
      assert.ok(artifactProblems(dir, 'security').invalid.length > 0);
      assert.deepEqual(artifactProblems(dir, 'qa').invalid, []);
    },
  );
});

test('a missing design spec is reported once, not also as unusable', () => {
  withDir({ 'prd.md': prdText }, (dir) => {
    const { missing, invalid } = artifactProblems(dir, 'design');
    assert.deepEqual(missing, ['design-spec', 'design-consult', 'copy-deck']);
    assert.deepEqual(invalid, []);
  });
});

test('the DESIGN.md template is shipped and the designer points at it', () => {
  const template = readFileSync(join(root, '.agents/templates/DESIGN.md'), 'utf8');
  for (const section of [
    '## Typography',
    '## Spacing and layout',
    '## Colour',
    '## Status tones',
    '## Components',
    '## Motion',
    '## Breakpoints',
    '## Accessibility baseline',
  ]) {
    assert.ok(template.includes(section), `template is missing ${section}`);
  }
  const designer = readFileSync(join(root, '.agents/skills/designer.md'), 'utf8');
  assert.ok(designer.includes('.agents/templates/DESIGN.md'), 'the designer role does not reference the template');
});
