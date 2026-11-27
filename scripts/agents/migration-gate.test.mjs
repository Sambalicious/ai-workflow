import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { definedFunctions, findCopyBase, migrationFiles, parseFunctions } from './migration-gate.mjs';

const SCRIPT = fileURLToPath(new URL('./migration-gate.mjs', import.meta.url));
const runIn = (cwd, args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd });
const git = (cwd, args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });

async function put(dir, path, content) {
  await mkdir(dirname(join(dir, path)), { recursive: true });
  await writeFile(join(dir, path), content);
}

function commit(cwd, message) {
  git(cwd, ['add', '-A']);
  const result = git(cwd, ['commit', '-q', '-m', message]);
  if (result.status !== 0) throw new Error(`git commit failed: ${result.stderr || result.stdout}`);
}

const SWEEP = `
-- Copied from the 120 sweep: re-creates the cleanup function.
CREATE OR REPLACE FUNCTION "public"."delete_stale_offers"() RETURNS void AS $$
BEGIN
  DELETE FROM offers WHERE created_at < now() - interval '90 days';
END;
$$ LANGUAGE plpgsql;
`;

async function repo() {
  const dir = await mkdtemp(join(tmpdir(), 'migration-gate-'));
  git(dir, ['init', '-q']);
  git(dir, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  git(dir, ['config', 'user.email', 'qa@example.com']);
  git(dir, ['config', 'user.name', 'QA']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  await put(dir, 'apps/backend/migrations/120_offers_sweep.sql', SWEEP);
  await put(dir, 'apps/backend/migrations/121_reviews.sql', 'create function purge_reviews() returns void as $$ begin end; $$ language plpgsql;\n');
  commit(dir, 'migrations');
  return dir;
}

test('a free number and a function last defined by its copy base pass', async () => {
  const dir = await repo();
  try {
    const result = runIn(dir, ['--ref', 'main', '--number', '129', '--function', 'delete_stale_offers=120']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /129 is free/);
    assert.match(result.stdout, /delete_stale_offers last defined in 120_offers_sweep\.sql/);
    assert.match(result.stdout, /delete_stale_offers last defined/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a taken number and a newer definition of a copied function both fail with the files named', async () => {
  const dir = await repo();
  try {
    await put(
      dir,
      'apps/backend/migrations/129_manual_orders.sql',
      'CREATE OR REPLACE FUNCTION public.delete_stale_offers() RETURNS void AS $$ BEGIN DELETE FROM offers; END; $$ LANGUAGE plpgsql;\n',
    );
    commit(dir, 'main adds 129');
    const result = runIn(dir, ['--ref', 'main', '--number', '129', '--name', 'manual-orders', '--function', 'delete_stale_offers=120']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /129 is taken by 129_manual_orders\.sql/);
    assert.match(result.stderr, /latest definition is 129_manual_orders\.sql, not the declared copy base 120_offers_sweep\.sql/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a shared --copy-base and a later migration with an unrelated function pass', async () => {
  const dir = await repo();
  try {
    const result = runIn(dir, [
      '--ref', 'main',
      '--number', '130',
      '--copy-base', '120_offers_sweep.sql',
      '--function', 'delete_stale_offers',
      '--function', 'purge_reviews=121',
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /purge_reviews last defined in 121_reviews\.sql/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an unknown copy base, a missing definition, and a wrong directory fail', async () => {
  const dir = await repo();
  try {
    const unknownBase = runIn(dir, ['--ref', 'main', '--number', '130', '--function', 'delete_stale_offers=999']);
    assert.equal(unknownBase.status, 1);
    assert.match(unknownBase.stderr, /copy base 999 is not one migration/);

    const missing = runIn(dir, ['--ref', 'main', '--number', '130', '--function', 'never_defined=120']);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /no migration .* defines it/);

    const wrongDir = runIn(dir, ['--ref', 'main', '--migrations', 'db/migrations', '--number', '130']);
    assert.equal(wrongDir.status, 1);
    assert.match(wrongDir.stderr, /no numbered \.sql migrations found in db\/migrations/);

    const noBase = runIn(dir, ['--ref', 'main', '--number', '130', '--function', 'delete_stale_offers']);
    assert.equal(noBase.status, 1);
    assert.match(noBase.stderr, /needs a copy base/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the migrations directory is configurable and only the ref is read', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'migration-gate-dir-'));
  try {
    git(dir, ['init', '-q']);
    git(dir, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    git(dir, ['config', 'user.email', 'qa@example.com']);
    git(dir, ['config', 'user.name', 'QA']);
    git(dir, ['config', 'commit.gpgsign', 'false']);
    await put(dir, 'db/migrations/007_offers.sql', 'CREATE FUNCTION update_offers() RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;\n');
    commit(dir, 'custom dir');
    // A working-tree copy that main does not have must not change the verdict.
    await put(dir, 'db/migrations/008_local_only.sql', 'CREATE FUNCTION local_only() RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;\n');

    const result = runIn(dir, ['--ref', 'main', '--migrations', 'db/migrations', '--number', '9', '--function', 'update_offers=7']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /9 is free in main:db\/migrations/);

    const taken = runIn(dir, ['--ref', 'main', '--migrations', 'db/migrations', '--number', '8']);
    assert.equal(taken.status, 0, 'the uncommitted local file is not on main');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('function definitions are read from SQL, not from comments or unrelated text', () => {
  const sql = `
    -- CREATE FUNCTION commented_out() ...
    /* create or replace function block_commented() */
    CREATE OR REPLACE FUNCTION "public"."Delete_Stale_Offers"() RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;
    create function if not exists purge_reviews() returns void as $$ begin end; $$ language plpgsql;
    CREATE FUNCTION archive.old_rows() RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;
  `;
  assert.deepEqual([...definedFunctions(sql)].sort(), ['delete_stale_offers', 'old_rows', 'purge_reviews']);
});

test('migrations sort by number and a copy base resolves by number or filename', async () => {
  const dir = await repo();
  try {
    const migrations = migrationFiles({ ref: 'main', dir: 'apps/backend/migrations', cwd: dir });
    assert.deepEqual(migrations.map((migration) => migration.file), ['120_offers_sweep.sql', '121_reviews.sql']);
    assert.equal(findCopyBase(migrations, '120')?.file, '120_offers_sweep.sql');
    assert.equal(findCopyBase(migrations, '120_offers_sweep')?.file, '120_offers_sweep.sql');
    assert.equal(findCopyBase(migrations, '120_offers_sweep.sql')?.file, '120_offers_sweep.sql');
    assert.equal(findCopyBase(migrations, '999'), null);
    assert.deepEqual(parseFunctions(['a=120', 'b'], '121'), [
      { name: 'a', base: '120' },
      { name: 'b', base: '121' },
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
