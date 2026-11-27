// The Tizen widget manifest (config.xml), generated at build time so its version always matches
// package.json. Reference: research notes §1 and spec §11.
import { SaxesParser } from 'saxes';

/** Exactly 10 characters [0-9a-zA-Z]. Never change it: updates must keep the same id. */
export const PACKAGE_ID = 'KinoTV0001';
export const APP_NAME = 'KinoTV';
/** What `tizen run` / `tizen uninstall -p` and `sdb shell 0 debug` take on a TV. */
export const APP_ID = `${PACKAGE_ID}.${APP_NAME}`;
export const ICON_FILE = 'icon.png';
/** The Smart Hub preview service (tizen/service/service.js): `<package>.<name>`, as Tizen requires. */
export const PREVIEW_SERVICE_ID = `${PACKAGE_ID}.service`;
export const PREVIEW_SERVICE_FILE = 'service/service.js';

const PRIVILEGES = [
  'http://tizen.org/privilege/internet',
  'http://developer.samsung.com/privilege/avplay',
  'http://tizen.org/privilege/filesystem.read',
  'http://tizen.org/privilege/filesystem.write',
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

/** Read a well-formed KinoTV manifest without rewriting the bytes used for signing. */
export function kinoTvManifestVersion(xml: string): string {
  const invalid = () => { throw new Error('Invalid KinoTV manifest.'); };
  const parser = new SaxesParser({ xmlns: true });
  let depth = 0;
  let applications = 0;
  let version: string | undefined;
  // No DTDs: identity must not depend on entities or default attributes declared elsewhere.
  parser.on('doctype', invalid);
  parser.on('xmldecl', (declaration) => {
    if (declaration.version !== '1.0' ||
        (declaration.encoding && declaration.encoding.toUpperCase() !== 'UTF-8')) invalid();
  });
  parser.on('opentag', (tag) => {
    depth++;
    const attribute = (name: string) => {
      const attr = tag.attributes[name];
      return attr?.uri === '' ? attr.value : undefined;
    };
    if (depth === 1) {
      if (tag.local !== 'widget' || tag.uri !== 'http://www.w3.org/ns/widgets') invalid();
      version = attribute('version');
    } else if (tag.local === 'widget') invalid();
    if (tag.local === 'application') {
      if (depth !== 2 || tag.uri !== 'http://tizen.org/ns/widgets' || ++applications !== 1 ||
          attribute('id') !== APP_ID || attribute('package') !== PACKAGE_ID) invalid();
    }
  });
  parser.on('closetag', () => { depth--; });
  // With no error handler saxes throws on every well-formedness/namespace error, including
  // duplicate attributes, undeclared prefixes, multiple roots and an incomplete document.
  parser.write(xml).close();
  if (applications !== 1 || !version || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) ||
      tizenVersion(version) !== version) return invalid();
  return version;
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

  <!-- Smart Hub preview: the latest History titles above the app on the Home bar, set by a service. -->
  <tizen:metadata key="http://samsung.com/tv/metadata/use.preview" value="bg_service"/>
  <tizen:service id="${PREVIEW_SERVICE_ID}" auto-restart="false">
    <tizen:content src="${PREVIEW_SERVICE_FILE}"/>
    <tizen:name>service</tizen:name>
    <tizen:category name="http://tizen.org/category/service"/>
  </tizen:service>
  <!-- A preview tile opens the app with its action data; a running app gets it without reloading. -->
  <tizen:app-control>
    <tizen:src name="index.html" reload="disable"/>
    <tizen:operation name="http://samsung.com/appcontrol/operation/eden_resume"/>
  </tizen:app-control>
  <tizen:setting screen-orientation="landscape" context-menu="disable" background-support="disable" encryption="disable" install-location="auto" hwkey-event="enable"/>
</widget>
`;
}
