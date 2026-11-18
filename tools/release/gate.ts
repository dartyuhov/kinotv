// The release gate (spec §7.6). The release workflow runs it before building anything:
//
//   node tools/release/gate.ts
//
// It refuses to publish unless:
// - app client configuration is present in KP_CLIENT_ID and KP_CLIENT_SECRET. The release build
//   passes these to VITE_KP_CLIENT_ID and VITE_KP_CLIENT_SECRET. Presence does not establish client
//   ownership or upstream authorization; per-user sessions are never build inputs;
// - the tag (GITHUB_REF_NAME) is v<package.json version>, so the release, config.xml and the version the
//   app reports for its update check are all the same;
// - package.json's "kinotv": { "githubRepo" } names this repository (GITHUB_REPOSITORY), because the
//   app's update check and the installer download from it.
//
// Problems are printed as GitHub error annotations, so they show on the run's summary page.
import { readProject, RELEASE_REPOSITORY, releaseProjectProblems } from './project.ts';

const SECRETS = ['KP_CLIENT_ID', 'KP_CLIENT_SECRET'] as const;

function problems(env: NodeJS.ProcessEnv): Array<{ title: string; lines: string[] }> {
  const found: Array<{ title: string; lines: string[] }> = [];
  const project = readProject();
  const { version, githubRepo } = project;
  const tag = env.GITHUB_REF_NAME ?? '';
  const repository = env.GITHUB_REPOSITORY ?? '';

  for (const title of releaseProjectProblems(project)) found.push({ title, lines: [] });

  const missing = SECRETS.filter((name) => !env[name]?.trim());
  if (missing.length) {
    found.push({
      title: 'kino.watch app client configuration is missing.',
      lines: [
        `Missing: ${missing.join(', ')}.`,
        `Add ${SECRETS.join(' and ')} as repository secrets on GitHub: Settings → Secrets and variables → Actions → New repository secret.`,
        'Then re-run this workflow. This check verifies presence only.',
      ],
    });
  }

  if (tag !== `v${version}`) {
    found.push({
      title: `The tag ${tag || '(none)'} does not match the package.json version ${version}.`,
      lines: [`Tag the release as v${version}, or set "version" in package.json to ${tag.replace(/^v/, '') || 'the new version'} first.`],
    });
  }

  if (!githubRepo) {
    found.push({
      title: 'The GitHub repo for updates and the installer is not set.',
      lines: [`Set "kinotv": { "githubRepo" } in package.json to ${repository || '<owner>/<repo>'}.`],
    });
  } else if (repository && githubRepo.toLowerCase() !== repository.toLowerCase()) {
    found.push({
      title: `package.json points the app and installer at ${githubRepo}, but this release is for ${repository}.`,
      lines: [`Set "kinotv": { "githubRepo" } in package.json to ${repository}.`],
    });
  } else if (githubRepo.toLowerCase() !== RELEASE_REPOSITORY || repository.toLowerCase() !== RELEASE_REPOSITORY) {
    found.push({
      title: `Release repository must be ${RELEASE_REPOSITORY}.`,
      lines: ['Set GITHUB_REPOSITORY and package.json kinotv.githubRepo to the intended publishing repository.'],
    });
  }
  return found;
}

const found = problems(process.env);
if (found.length === 0) {
  console.log(`✓ Release ${process.env.GITHUB_REF_NAME} can be published: app client configuration is present and source versions match. Presence does not verify client ownership or upstream authorization.`);
} else {
  for (const { title, lines } of found) {
    // An annotation's message must be one line; %0A is GitHub's escaped newline.
    console.log(`::error title=Release blocked::${title}%0A${lines.join('%0A')}`);
    console.log(`\n✗ Release blocked: ${title}`);
    for (const line of lines) console.log(`  ${line}`);
  }
  process.exitCode = 1;
}
