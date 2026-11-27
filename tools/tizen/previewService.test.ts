import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { PREVIEW_SERVICE_FILE } from './configXml.ts';

// The preview service runs in the TV's Node.js service runtime with `tizen` and `webapis` globals.
// Run the shipped file the same way, with those globals faked.
function runService(data: Array<{ key: string; value: string[] }>, setPreviewData: (json: string, ok: () => void, fail: (e: Error) => void) => void) {
  const replies: string[] = [];
  let exited = false;
  const module = { exports: {} as Record<string, () => void> };
  const tizen = {
    ApplicationControlData: class { constructor(public key: string, public value: string[]) {} },
    application: { getCurrentApplication: () => ({
      getRequestedAppControl: () => ({ appControl: { data }, replyResult: (fields: Array<{ value: string[] }>) => replies.push(fields[0]!.value[0]!) }),
      exit: () => { exited = true; },
    }) },
  };
  runInNewContext(readFileSync(join(import.meta.dirname, '../../tizen', PREVIEW_SERVICE_FILE), 'utf8'), { module, tizen, webapis: { preview: { setPreviewData } } });
  module.exports.onStart!();
  module.exports.onRequest!();
  return { replies, exited: () => exited };
}

it('sets the preview it is given, replies ok and exits', () => {
  let set: string | undefined;
  const run = runService([{ key: 'caller', value: ['ForegroundApp'] }, { key: 'preview', value: ['{"sections":[]}'] }], (json, ok) => { set = json; ok(); });
  expect(set).toBe('{"sections":[]}');
  expect(run.replies).toEqual(['ok']);
  expect(run.exited()).toBe(true);
});

it('leaves the preview alone when the system starts it without data', () => {
  let called = false;
  const run = runService([], () => { called = true; });
  expect(called).toBe(false);
  expect(run.replies).toEqual(['nothing']);
  expect(run.exited()).toBe(true);
});

it('reports a rejected preview and still exits', () => {
  const run = runService([{ key: 'preview', value: ['{}'] }], (_json, _ok, fail) => fail(Object.assign(new Error('bad tiles'), { name: 'InvalidValuesError' })));
  expect(run.replies).toEqual(['error: InvalidValuesError bad tiles']);
  expect(run.exited()).toBe(true);
});
