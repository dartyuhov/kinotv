// The Tizen widget manifest (config.xml), generated at build time so its version always matches
// package.json. Reference: research notes §1 and spec §11.

/** Exactly 10 characters [0-9a-zA-Z]. Never change it: updates must keep the same id. */
export const PACKAGE_ID = 'KinoTV0001';
export const APP_NAME = 'KinoTV';
/** What `tizen run` / `tizen uninstall -p` and `sdb shell 0 debug` take on a TV. */
export const APP_ID = `${PACKAGE_ID}.${APP_NAME}`;
export const ICON_FILE = 'icon.png';

const PRIVILEGES = [
  'http://tizen.org/privilege/internet',
  'http://tizen.org/privilege/tv.inputdevice', // media and channel key registration
  'http://tizen.org/privilege/application.launch',
  'http://tizen.org/privilege/system', // systeminfo platform version
  'http://developer.samsung.com/privilege/productinfo', // TV model for the device name
  'http://developer.samsung.com/privilege/network.public', // connection checks on resume
];

/**
 * Turns a package.json version into a Tizen widget version ([0-255].[0-255].[0-65535]).
 * A pre-release or build suffix is dropped, because Tizen has no way to express it.
 */
export function tizenVersion(packageVersion: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(packageVersion);
  const [major, minor, patch] = match ? match.slice(1).map(Number) : [];
  if (major === undefined || minor === undefined || patch === undefined || major > 255 || minor > 255 || patch > 65535) {
    throw new Error(
      `package.json version "${packageVersion}" can't be a Tizen app version: it must be 0-255.0-255.0-65535 ` +
        '(a -pre-release suffix is allowed and dropped).',
    );
  }
  return `${major}.${minor}.${patch}`;
}

export function renderConfigXml({ version }: { version: string }): string {
  const privileges = PRIVILEGES.map((name) => `  <tizen:privilege name="${name}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="http://kinotv.app/${APP_NAME}" version="${version}" viewmodes="maximized">
  <tizen:application id="${APP_ID}" package="${PACKAGE_ID}" required_version="3.0"/>
  <tizen:profile name="tv"/>
  <name>${APP_NAME}</name>
  <description>Unofficial kino.watch client for Samsung TVs</description>
  <content src="index.html"/>
  <icon src="${ICON_FILE}"/>
  <feature name="http://tizen.org/feature/screen.size.all"/>

  <!-- Tizen blocks all network access unless it is declared. Narrow this to the kino.watch API and
       CDN hosts once they are confirmed (spec §11). -->
  <access origin="*" subdomains="true"/>

${privileges}

  <!-- Don't load the app in the background at TV power-on: it would start before the network and session are ready. -->
  <tizen:metadata key="http://samsung.com/tv/metadata/prelaunch.support" value="false"/>
  <tizen:setting screen-orientation="landscape" context-menu="disable" background-support="disable" encryption="disable" install-location="auto" hwkey-event="enable"/>
</widget>
`;
}
