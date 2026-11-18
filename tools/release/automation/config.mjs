const names = ['RELEASE_APP_CLIENT_ID', 'RELEASE_APP_PRIVATE_KEY', 'RELEASE_APP_BOT_LOGIN'];
const missing = names.filter(name => !process.env[name]?.trim());
for (const name of names) console.log(`${name}: ${missing.includes(name) ? 'missing' : 'present'}`);
if (missing.length) {
  console.error(`Configure ${missing.join(', ')} and install the release App on KinoTV; see docs/releases.md. Values are never printed.`);
  process.exitCode = 1;
}
