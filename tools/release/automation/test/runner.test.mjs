import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('planner subprocess reports every contract without Release Please checkpoint output', () => {
  // Start an independent runner rather than inheriting the outer test worker.
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'test/plan.test.mjs'], {
    cwd: new URL('../', import.meta.url), env, encoding: 'utf8', timeout: 15000,
  });
  const output = result.stdout + result.stderr;
  assert.ifError(result.error);
  assert.equal(result.status, 0, output);
  assert.match(result.stdout, /# tests 9\b/);
  assert.match(result.stdout, /# pass 9\b/);
  assert.match(result.stdout, /# skipped 0\b/);
  // Node 22 can mistake non-ASCII stdout following a runner frame for a
  // serialized message. Check the real isolated planner, not a mocked logger.
  assert.doesNotMatch(output, /[✔❯]/);
});
