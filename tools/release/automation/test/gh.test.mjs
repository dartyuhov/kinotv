import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ghCli } from '../publication.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const upload = ['api', 'https://uploads.github.com/repos/dartyuhov/kinotv/releases/7/assets?name=KinoTV.wgt',
  '--method', 'POST', '-H', 'Content-Type: application/octet-stream', '--input', '-'];

function environment(values, run) {
  const saved = { ...process.env };
  Object.assign(process.env, values);
  try { return run(); } finally { process.env = saved; }
}

test('real subprocess receives exact binary length, full stdin, and unchanged read arguments', () => {
  const root = mkdtempSync(join(tmpdir(), 'kinotv-gh-'));
  try {
    writeFileSync(join(root, 'gh'), `#!${process.execPath}
const {createHash}=require('node:crypto');
const args=process.argv.slice(2), chunks=[];
process.stdin.on('data', chunk=>chunks.push(chunk));
process.stdin.on('end',()=>{const body=Buffer.concat(chunks);process.stdout.write(JSON.stringify({args,length:body.length,hash:createHash('sha256').update(body).digest('hex'),debug:process.env.GH_DEBUG}));});
`);
    chmodSync(join(root, 'gh'), 0o755);
    environment({ PATH: `${root}:${process.env.PATH}`, GH_DEBUG: 'api' }, () => {
      const input = Buffer.alloc(1024 * 1024, 0xab);
      const result = JSON.parse(ghCli(upload, input));
      assert.deepEqual(result.args, [...upload, '-H', `Content-Length: ${input.length}`]);
      assert.equal(result.length, input.length);
      assert.equal(result.hash, hash(input));
      assert.equal(result.debug, '');
      const read = ['api', 'repos/dartyuhov/kinotv/releases?per_page=100', '--paginate', '--slurp'];
      assert.deepEqual(JSON.parse(ghCli(read)).args, read);
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('early subprocess rejection retains command and stderr alongside EPIPE, without credentials or body', () => {
  const root = mkdtempSync(join(tmpdir(), 'kinotv-gh-error-'));
  try {
    writeFileSync(join(root, 'gh'), `#!${process.execPath}
process.stderr.write('gh: Bad Content-Length (HTTP 400) Authorization: Bearer '+process.env.GH_TOKEN+'\\n');
process.exit(1);
`);
    chmodSync(join(root, 'gh'), 0o755);
    environment({ PATH: `${root}:${process.env.PATH}`, GH_TOKEN: 'private-test-token' }, () => {
      assert.throws(() => ghCli(upload, Buffer.alloc(8 * 1024 * 1024, 0x61)), error => {
        assert.match(error.message, /EPIPE/);
        assert.match(error.message, /Bad Content-Length \(HTTP 400\)/);
        assert.match(error.message, /uploads.github.com.*KinoTV.wgt/);
        assert.match(error.message, /POST/);
        assert.doesNotMatch(error.message, /private-test-token|aaaaaaaaaaaaaaaa/);
        return true;
      });
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('installed gh parser sends fixed-length binary stdin to a loopback HTTP subprocess', async t => {
  if (spawnSync('gh', ['--version']).status !== 0) return t.skip('gh CLI is not installed');
  // Separate process: ghCli is synchronous, so an in-process server would deadlock.
  const server = spawn(process.execPath, ['--input-type=module', '-e', `
    import {createServer} from 'node:http';
    import {createHash} from 'node:crypto';
    const server=createServer((req,res)=>{
      const chunks=[];
      req.on('data',chunk=>chunks.push(chunk));
      req.on('end',()=>{
        const body=Buffer.concat(chunks);
        res.setHeader('Content-Type','application/json');
        res.end(JSON.stringify({method:req.method,length:req.headers['content-length'],chunked:req.headers['transfer-encoding']??null,size:body.length,hash:createHash('sha256').update(body).digest('hex')}));
      });
    });
    server.listen(0,'127.0.0.1',()=>console.log(server.address().port));
  `], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const [port] = await once(server.stdout, 'data');
    const input = Buffer.alloc(600000, 0xab);
    const args = [...upload];
    args[1] = `http://127.0.0.1:${port.toString().trim()}/assets?name=KinoTV.wgt`;
    const result = environment({ GH_TOKEN: 'local-fixture-token', GITHUB_TOKEN: 'local-fixture-token' },
      () => JSON.parse(ghCli(args, input)));
    assert.deepEqual(result, { method: 'POST', length: String(input.length), chunked: null, size: input.length, hash: hash(input) });
  } finally { server.kill(); await once(server, 'exit'); }
});
