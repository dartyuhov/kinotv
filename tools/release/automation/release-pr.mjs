import { pathToFileURL } from 'node:url';
import { GitHub, Manifest } from 'release-please';

// Release Please's exclude-paths handles directory prefixes. Filter Markdown
// files at the SCM boundary as well, including deleted root-level guides.
export async function releaseManifest(scm, targetBranch = 'main', options = {}) {
  const classified = new Proxy(scm, {
    get(target, key) {
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
