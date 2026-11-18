import { appendFile, readFile } from 'node:fs/promises';
import { GitHub, approve, publish, check } from './publication.mjs';

try {
  const api = new GitHub({ repo: process.env.GH_REPO });
  const approval = await approve(api, { sourceSha: process.env.SOURCE_SHA || undefined,
    prNumber: process.env.RELEASE_PR || undefined, bot: process.env.RELEASE_APP_BOT_LOGIN });
  if (process.argv[2] === 'prepare') {
    const output = approval ? { approved: 'true', source_sha: approval.sha,
      version: approval.version, release_pr: String(approval.prNumber) } : { approved: 'false' };
    await appendFile(process.env.GITHUB_OUTPUT, Object.entries(output).map(([k, v]) => `${k}=${v}\n`).join(''));
  } else if (process.argv[2] === 'publish') {
    check(approval, 'No approved release');
    const artifact = JSON.parse(await readFile('candidate/dist-release/source.json'));
    check(artifact.sha === approval.sha && artifact.version === approval.version, 'Artifact/source mismatch');
    const { unlink } = await import('node:fs/promises');
    await unlink('candidate/dist-release/source.json');
    console.log(JSON.stringify(await publish(api, approval, { root: 'candidate' })));
  } else throw new Error('Usage: publish.mjs prepare | publish');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
