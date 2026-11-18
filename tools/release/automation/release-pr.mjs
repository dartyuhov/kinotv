import { pathToFileURL } from 'node:url';
import { GitHub, Manifest } from 'release-please';
import { GitHub as ReleaseAPI } from './publication.mjs';

// Release Please's exclude-paths handles directory prefixes. Filter Markdown
// files at the SCM boundary as well, including deleted root-level guides.
export async function releaseManifest(scm, targetBranch = 'main', options = {}, {
  bot = process.env.RELEASE_APP_BOT_LOGIN,
  readPullRequest = number => new ReleaseAPI({ repo: `${scm.repository.owner}/${scm.repository.repo}` }).request(`/pulls/${number}`),
} = {}) {
  const classified = new Proxy(scm, {
    get(target, key) {
      if (key === 'pullRequestIterator') return async function* (...args) {
        for await (const pr of target.pullRequestIterator(...args)) {
          // RP's normalized PR omits author/repository identity. Only its merged
          // pending-label blocker needs raw REST verification. Preserve tagged
          // history, other labels, and all commit/PR metadata used for notes.
          if ((args[1] ?? 'MERGED') === 'MERGED' && pr.labels.includes('autorelease: pending')) {
            if (!bot || !/^[\w-]+\[bot\]$/.test(bot)) throw new Error('Configure RELEASE_APP_BOT_LOGIN; see docs/releases.md');
            const raw = await readPullRequest(pr.number);
            const repo = `${scm.repository.owner}/${scm.repository.repo}`;
            const trusted = raw.merged && raw.user?.login === bot &&
              raw.head?.ref === 'release-please--branches--main--components--kinotv' &&
              raw.head.repo?.full_name === repo && raw.base?.ref === targetBranch && raw.base.repo?.full_name === repo;
            if (!trusted) {
              yield { ...pr, labels: pr.labels.filter(label => label !== 'autorelease: pending') };
              continue;
            }
          }
          yield pr;
        }
      };
      if (key === 'mergeCommitIterator') return async function* (...args) {
        for await (const commit of target.mergeCommitIterator(...args)) {
          yield { ...commit, files: commit.files?.filter(file => !/\.(md|markdown|mdown|mkd|mdx)$/i.test(file)) };
        }
      };
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return Manifest.fromManifest(classified, targetBranch, undefined, undefined, options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [owner, repo] = (process.env.GH_REPO || '').split('/');
  if (`${owner}/${repo}` !== 'dartyuhov/kinotv' || !process.env.GH_TOKEN) throw new Error('Expected KinoTV repository and App token');
  const scm = await GitHub.create({ owner, repo, token: process.env.GH_TOKEN });
  // Deliberately never call createReleases: merging the release PR is approval.
  await (await releaseManifest(scm)).createPullRequests();
}
