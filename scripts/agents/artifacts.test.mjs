import test from 'node:test';
import assert from 'node:assert/strict';
import { GATE_INPUTS, missingArtifacts } from './artifacts.mjs';

const fakeFs = (entries) => ({
  exists: (path) => entries.includes(path.split('/').pop()),
  readdir: () => entries,
});

test('a complete epic has no missing artifacts for any gate', () => {
  const entries = [
    'prd.r1.md',
    'specs',
    'architecture.md',
    'design-spec.r2.md',
    'copy-deck.md',
    'api-contract.md',
    'threat-model.md',
    'security-review.md',
  ];
  for (const gate of Object.keys(GATE_INPUTS)) {
    assert.deepEqual(missingArtifacts('/epic', gate, fakeFs(entries).exists, fakeFs(entries).readdir), [], gate);
  }
});

test('the security gate fails when the threat model is absent', () => {
  const entries = ['prd.md', 'specs', 'architecture.md', 'design-spec.md', 'api-contract.md'];
  assert.deepEqual(missingArtifacts('/epic', 'security', fakeFs(entries).exists, fakeFs(entries).readdir), [
    'threat-model',
  ]);
});

test('a revised artifact satisfies the requirement', () => {
  const entries = ['prd.r1.md', 'gherkin', 'api-contract.md'];
  assert.deepEqual(missingArtifacts('/epic', 'qa', fakeFs(entries).exists, fakeFs(entries).readdir), []);
});

test('a legacy gherkin folder satisfies the spec input, and neither folder fails it', () => {
  const legacy = ['prd.md', 'gherkin', 'api-contract.md'];
  assert.deepEqual(missingArtifacts('/epic', 'qa', fakeFs(legacy).exists, fakeFs(legacy).readdir), []);
  const none = ['prd.md', 'api-contract.md'];
  assert.deepEqual(missingArtifacts('/epic', 'qa', fakeFs(none).exists, fakeFs(none).readdir), ['specs']);
});

test('an unknown gate is a usage error, not a pass', () => {
  assert.throws(() => missingArtifacts('/epic', 'deploy'), /unknown gate "deploy"/);
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
