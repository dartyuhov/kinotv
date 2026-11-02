// The release gate (spec §7.6). The release workflow runs it before building anything:
//
//   node tools/release/gate.ts
//
// It refuses to publish unless:
// - the project's OWN kino.watch API credentials are set as the repository secrets KP_CLIENT_ID and
//   KP_CLIENT_SECRET (development uses borrowed ones from .env.local, which must never ship);
// - the tag (GITHUB_REF_NAME) is v<package.json version>, so the release, config.xml and the version the
//   app reports for its update check are all the same;
// - package.json's "kinotv": { "githubRepo" } names this repository (GITHUB_REPOSITORY), because the
//   app's update check and the installer download from it.
//
// Problems are printed as GitHub error annotations, so they show on the run's summary page.
import { readProject } from './project.ts';

const SECRETS = ['KP_CLIENT_ID', 'KP_CLIENT_SECRET'] as const;

function problems(env: NodeJS.ProcessEnv): Array<{ title: string; lines: string[] }> {
  const found: Array<{ title: string; lines: string[] }> = [];
  const { version, githubRepo } = readProject();
  const tag = env.GITHUB_REF_NAME ?? '';
  const repository = env.GITHUB_REPOSITORY ?? '';

  const missing = SECRETS.filter((name) => !env[name]?.trim());
  if (missing.length) {
    found.push({
      title: "The project's own kino.watch API credentials are missing.",
      lines: [
        `Missing: ${missing.join(', ')}.`,
        'Releases must ship with KinoTV\'s own API client, never the borrowed development one.',
        `Add ${SECRETS.join(' and ')} as repository secrets on GitHub: Settings → Secrets and variables → Actions → New repository secret.`,
        'Then delete the tag and push it again, or re-run this workflow.',
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
  }
  return found;
}

const found = problems(process.env);
if (found.length === 0) {
  console.log(`✓ Release ${process.env.GITHUB_REF_NAME} can be published: own API credentials are set and versions match.`);
} else {
  for (const { title, lines } of found) {
    // An annotation's message must be one line; %0A is GitHub's escaped newline.
    console.log(`::error title=Release blocked::${title}%0A${lines.join('%0A')}`);
    console.log(`\n✗ Release blocked: ${title}`);
    for (const line of lines) console.log(`  ${line}`);
  }
  process.exitCode = 1;
}
