import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('missing release App settings fail actionably without displaying configured values', () => {
  const configured = { RELEASE_APP_CLIENT_ID: 'fixture-private-id', RELEASE_APP_PRIVATE_KEY: 'fixture-private-key',
    RELEASE_APP_BOT_LOGIN: 'fixture-release[bot]' };
  for (const missing of Object.keys(configured)) {
    const result = spawnSync(process.execPath, [new URL('../config.mjs', import.meta.url).pathname], {
      encoding: 'utf8', env: { ...process.env, ...configured, [missing]: '  ' },
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, new RegExp(`${missing}: missing`));
    assert.match(result.stderr, /docs\/releases.md/);
    for (const value of Object.values(configured)) assert.ok(!`${result.stdout}${result.stderr}`.includes(value));
  }
  const result = spawnSync(process.execPath, [new URL('../config.mjs', import.meta.url).pathname], {
    encoding: 'utf8', env: { ...process.env, ...configured },
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.split('present').length - 1, 3);
});
