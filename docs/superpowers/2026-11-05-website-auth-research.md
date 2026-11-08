# kino.watch website authentication investigation

Own-account probes on November 5, 2026 establish a website-session path to
playlist JSON and issued HLS manifests. They do **not** establish a working
replacement for KinoTV's OAuth flow or a production-ready TV sign-in flow.
The website's `token` cookie is rejected as an OAuth API access token.

**Follow-up finding:** the same cookie authenticates API-shaped requests to
`https://kino.watch/v1/...` when sent as a cookie. See the follow-up findings
below before using the initial architecture assessment: catalog HTML parsing
is no longer the preferred approach.

## Scope and evidence handling

The target is `https://kino.watch`, using the subscriber's own account. The
subscriber enters credentials, 2FA, and email codes directly in a separate
Chrome for Testing window. Cookie values, credentials, codes, full manifest
URLs, and response bodies are excluded from this report. Session material
stays in the running browser; no storage-state export is created.

Evidence below comes from public HTML and scripts, Playwright DOM inspection,
and bounded read-only HTTP probes using Playwright's request context. These
are ordinary tool observations, not REA Evidence records. REA 6.4.0 is
installed, but its OpenCode registration reports configuration drift. Browser
discovery also fails because the launched browser exposes no listener on the
requested CDP port. Registration is not changed during this investigation.

The attempted initial response observer records no login events: its URL
constructor is unavailable in the CLI execution environment. A corrected
observer records subsequent page requests. Consequently, the exact login
challenge endpoints, order, and payloads are **not captured**. The user reports
both 2FA and an email-code step; successful authenticated navigation is
observed after those steps.

## Observed authentication boundaries

The following observations separate website sessions from the documented API.

### E1: Public login form

The public [login page](https://kino.watch/user/login) contains a conventional
server-rendered form:

- `POST /user/login`.
- Fields `_csrf`, `login-form[rememberMe]`, `login-form[login]`, and
  `login-form[password]`.
- A CSRF token in a meta element and hidden form field.
- Shipped jQuery, Yii, Bootstrap, and `ui.js`; no OAuth client configuration
  is observed in this page.

The public [UI script](https://kino.watch/assets/e813a6d4/ui.js) contains
email-code resend handling and 2FA/backup-code form handling. These are static
observations; they don't establish the subscriber's executed challenge order.

### E2: Authenticated cookie metadata

After interactive login, the browser reaches `/` without a login form and
can navigate to `/device` and a title page. The following metadata is observed;
cookie values are omitted:

| Cookie | HttpOnly | Secure | SameSite | Expiration |
| --- | --- | --- | --- | --- |
| `PHPSESSID` | Yes | No | Lax | Session |
| `_csrf` | Yes | No | Lax | Session |
| `_identity` | Yes | No | Lax | Approximately one year |
| `token` | Yes | Yes | Lax | Approximately one year |

All four cookies use host `kino.watch` and path `/`. LocalStorage and
sessionStorage initially contain no keys after sign-in. Cookie expiration
does not prove that the server accepts the session for that entire period.

### E3: Website token versus OAuth token

A read-only probe sends the website `token` cookie value as the documented
`access_token` query parameter to `https://api.service-kp.com/v1/user`. Both
the unauthenticated baseline and this candidate return HTTP 401 with
`error: unauthorized`. Values stay inside the request context.

This rejects that specific interchangeability hypothesis. It doesn't prove
that no other website-to-API exchange exists. No such exchange is observed.

### E4: Website device page

The authenticated `/device` page displays an activation-code form, registered
devices, and browsers. Its public [device script](https://kino.watch/scripts/device.js)
uses `POST /device/activate` and `GET /device/wait-by-code`. These endpoints
approve an existing device code; this script does not show how to issue an
OAuth code without application credentials. No device is activated or removed.

## Observed playlist and media path

One authenticated title page provides a concrete read path independent of the
documented OAuth API. Coverage is limited to this title and season.

### E5: Server-provided player state

The title page embeds `PLAYER_ITEM_ID`, `PLAYER_PLAYLIST`,
`PLAYER_START_INDEX`, `PLAYER_SEASONS`, and `PLAYER_CURRENT_SEASON`.
Episode records include:

```text
manifest, id, media_id, title, episode_title, poster, thumb, duration,
season, episode, yeaer, completed, marktime
```

`yeaer` is the observed spelling. Manifest paths contain capability-like
material and are intentionally not retained here.

The shipped [player script](https://kino.watch/shark/player.min.js) declares
`PLAYLIST_ENDPOINT = /item/playlist`. Its season loader performs a
credentialed GET with `id` and `season` query parameters. A matching
authenticated probe returns HTTP 200 JSON with keys:

```text
success, season, episodes, firstUnwatchedIndex
```

The observed response has `success: true` and two episode records with the
fields listed above.

### E6: Cookie-isolation probes

Fresh browser contexts receive selected cookies in memory, then request the
same `/item/playlist?id=…&season=…` resource without following redirects:

| Cookies supplied | Result |
| --- | --- |
| None | HTTP 302 to login |
| `token` | HTTP 302 to login |
| `PHPSESSID` | HTTP 200, but no episode JSON |
| `_identity` | HTTP 200, but no episode JSON |
| All four cookies | HTTP 200 JSON, `success: true`, two episodes |
| `_identity` + `token` | HTTP 200 JSON, `success: true`, two episodes |
| `PHPSESSID` + `token` | HTTP 302, no episode JSON |
| `PHPSESSID` + `_identity` | HTTP 200 HTML, no episode JSON |

Only the successful JSON responses establish usable playlist access. An HTTP
200 alone is insufficient. Individual-cookie failures don't uniquely identify
each cookie's internal role or prove permanent sufficiency of the working pair.

### E7: Issued HLS manifest

The first issued website manifest returns HTTP 200 with
`application/vnd.apple.mpegurl`. Its body starts with `#EXTM3U` and contains
three stream variants, 15 audio rendition declarations, and five subtitle
rendition declarations. Resolution attributes include 1920×800, 1280×534, and
720×300. This particular probe does not establish 4K availability.

The same already-issued URL returns HTTP 200 from a fresh context with no
cookies. This establishes cookie-free retrieval of that issued manifest at
the time of the probe, not anonymous catalog access or indefinite URL validity.
Media segments, DRM requirements, actual desktop playback, and AVPlay playback
are not validated.

### E8: Progress writes and browser constraints

Static player code names `/item/media-marktime` and `/item/update-watching`.
It uses form-encoded POST bodies, credentialed requests, and a CSRF header
when available. These writes are not executed, so progress synchronization
remains unverified.

Observed website HTML, playlist JSON, and manifest responses advertise
`Access-Control-Allow-Origin: *` without
`Access-Control-Allow-Credentials`. That response configuration does not
support a normal credentialed cross-origin browser fetch. Cookies are also
HttpOnly and SameSite=Lax. Playwright's request context is not subject to
browser CORS and therefore does not prove that a desktop Vite page or packaged
Tizen app can make equivalent requests.

## Implications for KinoTV

The current implementation in `src/core/auth/oauth.ts` obtains and refreshes
OAuth access/refresh tokens using application credentials. Its documented API
client cannot consume a website cookie pair as a drop-in replacement.

The evidence supports investigating a computer-assisted session bridge: the
subscriber completes the normal website login, and a local helper maintains
the website session and serves a narrow KinoTV data interface. This is a
candidate design, not an implemented or validated architecture. A direct
TV-only website login path remains unproven.

The website exposes a useful playlist JSON endpoint, but catalog navigation is
server-rendered in the inspected pages. Replacing the backend would require
mapping catalog data, detail data, bookmarks, history, progress writes, and
session errors rather than changing only the sign-in screen.

## Next steps

The remaining questions require bounded follow-up probes:

1. Capture the normal login challenge endpoints and field names during a
   future interactive login, excluding values and preserving the current
   authenticated session until then.
2. Verify session restoration after browser restart and server-side expiry,
   renewal behavior, and logout/revocation semantics.
3. Determine whether a local helper is acceptable before implementing a
   session bridge or changing application authentication.
4. Validate one issued manifest and representative media segments on AVPlay,
   including URL expiry, audio/subtitle selection, and a known 4K HDR title.
5. Map the minimum website catalog and progress contracts, then validate one
   explicitly chosen progress write against the user's account.

Support's refusal is user-reported; its exact wording is not inspected. No
technical conclusion in this report depends on interpreting that refusal.

## Follow-up findings: local transport and API compatibility

Further local probes on November 5, 2026 materially improve the candidate
architecture. The user requests local validation first and TV testing last.
No product implementation or TV runtime probe is performed.

### E9: Session restoration and explicit HTTP requests

A fresh browser context supplied with only `_identity` and `token` restores
website access and retrieves playlist JSON. The server issues a new
`PHPSESSID`. Both persistent cookie values remain unchanged during this
probe, although the `_identity` expiration is extended. A separate context
using a Tizen-style user agent also retrieves playlist JSON successfully.
This changes the user agent, not the actual browser engine or source IP.

An explicit `Cookie` header containing the pair also retrieves playlist JSON
with an initially empty cookie jar and a custom probe user agent. A running
browser is therefore not necessary for that observed read operation. Actual
browser-process restart, source-IP changes, long-term renewal, and revocation
remain untested.

### E10: Desktop browser restrictions reproduced

An isolated page served through a temporary Playwright route at
`http://127.0.0.1:5173/auth-probe` cannot read a credentialed cross-origin
playlist response: `fetch` rejects with `TypeError: Failed to fetch`.
Website responses also advertise `X-Frame-Options: SAMEORIGIN`, which blocks
the straightforward embedded website-login iframe approach in a normal
browser. No security setting is disabled during these probes.

Samsung's [WebSetting API][websetting] exposes cookie removal and custom user
agents, not cookie import. The [Download API][download] exposes a public
download privilege, custom HTTP header fields, and a completion file path.
It is a candidate GET transport for an imported session, but accepting a
`Cookie` header on this TV remains untested. Downloading JSON into files also
does not provide a general POST transport or response-cookie management.

Samsung documents [Tizen Sockets Extension][sockets] and a
[cURL sample][curl-sample] using its modified Emscripten toolchain. This is a
candidate general HTTPS transport inside the TV package. It introduces
WebAssembly, worker/thread, TLS trust-store, and toolchain work. Documentation
supports investigating it; it does not prove runtime availability or working
authenticated requests on the Q60C. The manifest's `<access origin="*">` alone
does not establish that ordinary fetch can replace it.

### E11: Cookie-free local playback succeeds

A fresh context without account cookies retrieves the issued master manifest
and a child variant manifest with HTTP 200. The sampled variant contains no
`EXT-X-KEY` declaration. A 1024-byte media-segment range request returns
HTTP 206 and `video/MP2T`.

An isolated local page at `http://127.0.0.1:5173/media-probe` loads the
public HLS library from `kpapp.link/lib/hls.js`, plays for approximately two
seconds, and reports readyState 4, 1920×800 video, five audio tracks, and five
subtitle tracks. It does not execute the website's progress-reporting code.
The temporary context is closed after the probe.

This validates a direct-media design for that issued URL: the candidate
helper need not proxy the video bytes. Actual AVPlay decoding, track
switching, other media formats, and URL expiration remain separate tests.

### E12: Browser 4K capability setting controls issued variants

Three initial titles from `/movie?4k=1` return AVC/SDR manifests up to 1080p.
The current browser entry has 4K disabled. With explicit user approval, the
investigation identifies the unique active browser entry and temporarily
enables its 4K setting.

The form at `GET /device/settings?id=…` is not the save contract. Posting
back to that URL returns HTML without persisting the requested flag. One
initial reset attempt returns HTTP 400; subsequent reads confirm the flag
is still off. The shipped `ui.js` establishes the actual save contract:

```text
POST /v1/device/{id}/settings
streamingType, serverLocation, support4k, _csrf
X-Requested-With: XMLHttpRequest
X-CSRF-Token: [omitted]
```

Using that contract returns JSON status 200. A fresh settings read confirms
4K enabled. Two fresh title manifests then include 3840×2080 and 3828×1596
variants respectively. Their declarations remain AVC and SDR; this is 4K
manifest availability, not verified 4K decoding or HDR support.

The original fields are restored through the same endpoint in `finally`.
The response has HTTP 200 and JSON status 200, and a fresh settings read
confirms the checkbox is off again. The browser settings form exposes
`support4k` but not HEVC or HDR controls in this observation.

### E13: Website API accepts the browser token cookie alone

The settings endpoint suggests a wider same-origin API. Bounded GET probes
confirm API-shaped JSON at `https://kino.watch/v1/...` without OAuth client
credentials. Authentication-isolation results for `/v1/user` are:

| Authentication supplied | Result |
| --- | --- |
| None | HTTP 401, `unauthorized` |
| `_identity` cookie only | HTTP 401, `unauthorized` |
| `token` cookie only | HTTP 200 with user envelope |
| `_identity` + `token` cookies | HTTP 200 with user envelope |
| Website token as `access_token` query | HTTP 401 |
| Website token as `token` query | HTTP 401 |
| Website token as Bearer authorization | HTTP 401 |
| Website token as explicit `Cookie: token=…` header | HTTP 200 |

These are different authentication contracts. The earlier failed probe used
`api.service-kp.com`, not the website host; it remains a valid negative result.

Successful website-host reads include the following existing KinoTV paths:

```text
/v1/user
/v1/items?perpage=1
/v1/items/{id}?nolinks=1
/v1/items/fresh?type=movie&perpage=1
/v1/items/search?q=…&field=title&perpage=1
/v1/items/media-links?mid=…
/v1/watching?id=…
/v1/watching/movies
/v1/watching/serials?subscribed=1
/v1/bookmarks
/v1/collections?perpage=1
/v1/genres
/v1/references/streaming-type
/v1/device
```

Catalog, details, watching, bookmarks, collections, device-list, and media-link
reads are additionally checked with only an explicit `token` cookie header
in a fresh context. They succeed. The media-link response has keys `id`,
`files`, `subtitles`, and `thumbnail`; file records include `codec`, `w`, `h`,
`quality`, `quality_id`, `file`, `url`, and `expires_at`. This response shape
uses `url` as an object with `http`, `hls`, `hls4`, and `hls2` keys in the
sample. KinoTV's `VideoFile` already permits that alias. Sample subtitle
records have `lang`, `shift`, `embed`, `forced`, `file`, and `url` fields.
Full normalization and runtime compatibility still require validation.

`GET /v1/device/settings` returns HTTP 404. Only the observed id-qualified
POST settings route is established. Progress writes, bookmark changes,
device registration, sign-out, and unlink semantics aren't verified by
successful reads and must not be inferred from them.

### E14: Service-listed existing applications

The authenticated [website application list][plugins] links to a
[browser PWA][webapp] at `kpapp.link` and provides
[Media Station X instructions][msx] for Samsung Tizen 3.0 and later. Those
instructions use `cdnservices.link` as the start parameter and the usual
device activation code. This is an existing viewing option, not proof of
its actual playback quality, HDR support, or suitability as KinoTV's backend.

Public `kpapp.link/js/app.min.js` uses the documented OAuth device flow and
ships its own application credentials. Their values are excluded from output
and this report, and are not copied into KinoTV. Merely inspecting that
application creates a pending activation flow; its inspection window is
closed after the user notices the recurring activation screen. The original
subscriber website session remains open. No PWA device is approved.

## Revised recommendation

For developing the custom KinoTV UI, the best-supported **local-first
baseline** is a narrow HTTP bridge to `https://kino.watch/v1`, authenticated
by the website's `token` cookie. Use normal interactive website login for
the password, 2FA, and email-code steps. Keep session handling separate from
OAuth and preserve the existing typed API client wherever response contracts
match. Send issued media URLs directly to the player instead of streaming
video through the helper.

This is the most validated candidate, not an implemented solution. The
bridge's ongoing-host requirement is its main user-experience cost. It need
not run a browser continuously, based on the successful explicit-cookie
HTTP probes. Deployment on a persistent home host would avoid requiring a
Mac to stay awake; no such deployment is created or assumed available.

For a **standalone TV app**, prefer investigating a one-time assisted login
plus an on-TV HTTPS transport before committing to a persistent helper.
Start with the cheaper Download API GET probe, then evaluate the documented
WebAssembly/cURL transport if POST and session management require it. This
path can potentially eliminate the always-on host, but it has more engineering
and unverified device behavior. A pure JavaScript cookie import plus ordinary
fetch is not locally established.

For **watching immediately**, the service-listed Media Station X client has
the lowest apparent setup burden. It is an alternative application, not the
custom KinoTV experience, and has not been tested here.

The decisive remaining local work is to verify the API response contracts,
perform a deliberately selected reversible account write, and capture the
full normal login challenge sequence in a disposable session. Session expiry,
revocation, HDR/HEVC delivery, and restart behavior remain unresolved. Keep
Q60C transport and AVPlay validation as the final stage, per user direction.

[websetting]: https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/websetting-api.html
[download]: https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/download-api.html
[sockets]: https://developer.samsung.com/smarttv/develop/extension-libraries/webassembly/tizen-sockets-extension/tizen-sockets-extension.html
[curl-sample]: https://github.com/SamsungDForum/WebAssemblyDemos/tree/master/sample_curl_app_built_with_tizen_studio
[plugins]: https://kino.watch/plugin
[webapp]: https://kino.watch/plugin/webapp
[msx]: https://kino.watch/plugin/mediastation

## Standalone requirement and additional research

The user's clarified requirement supersedes the local-bridge recommendation:
KinoTV must work without a Mac, home server, or other companion system during
everyday use, with minimal user configuration. A persistent bridge does not
meet this requirement and is no longer the target architecture.

### E15: On-TV HTTPS has a documented implementation route

Samsung's [WebAssembly overview][wasm-overview] documents support from Tizen
5.5 onward. The [cURL CLI tutorial][curl-cli] explicitly demonstrates HTTPS,
the Tizen socket extension, OpenSSL, a bundled CA certificate store, execution
in a worker, and packaging everything into a normal signed widget. Its
internet privilege is public. SDK and compiler tools are developer build-time
requirements, not software the viewer must install or run while watching.

The independent [Moonlight Tizen project][moonlight] provides additional source
evidence: `wasm/http.cpp` bridges JavaScript calls to worker-dispatched HTTP
requests using cURL. Its documented client requirement is Tizen 5.5 or later.
Its gaming host is intrinsic to game streaming, not evidence that the socket
or HTTPS transport needs a companion host. This is source and documentation
corroboration, not a KinoTV/Q60C runtime test.

The [Moonlight build file][moonlight-build] also reveals maintenance costs:
Samsung's modified Emscripten toolchain, an old bundled OpenSSL version,
upstream download fixes, and a generated-code patch. A KinoTV transport must
be purpose-built and dependency-reviewed rather than copying the entire
Moonlight application. Nothing is installed or compiled during this research.

### E16: Direct TV login is a candidate, not an observed full flow

A fresh public login request still exposes a normal CSRF-protected POST form
with username, password, and remember-me fields. No CAPTCHA marker or external
identity-provider link appears in that inspected response. The user's login
requires 2FA and email-code challenges; those executed contracts have not yet
been captured.

An on-TV HTTPS module with a cookie jar can, in principle, perform the same
HTTP exchanges without browser cross-origin restrictions. KinoTV could render
its own remote-friendly forms for the observed challenges. This would avoid
cookie export, manual token entry, a computer-assisted browser, and a persistent
bridge. Whether every challenge can be handled this way remains unverified.
Do not treat absence of a CAPTCHA marker in one response as a guarantee that
the service never requires one.

A phone-only QR approval flow does not follow automatically from a working
website login. Browser JavaScript cannot extract an HttpOnly cookie from the
service, and no credential-free website session-transfer endpoint is observed.
The existing device-approval page accepts codes issued by registered OAuth
applications; it does not issue KinoTV codes on its own.

### E17: Existing standalone TV client uses registered OAuth

Public static inspection of `cdnservices.link/static/js/main.efaba7e4.chunk.js`
shows device-code issuance, polling, refresh-token exchange, and persistent
token handling through an OAuth client abstraction. Application credential
values are not extracted into reports or reused. This demonstrates a different
registered-client architecture, not a credential-free login path for KinoTV.

The service-linked [Tizen installation article][existing-install] offers a
widget download but requires a computer for installation. The Media Station X
route installs a host application from the TV store and configures a start
parameter. Neither route proves KinoTV itself can be installed from the TV
store, and neither is needed as a runtime bridge for the proposed standalone
KinoTV transport.

### E18: Cookie lifetime remains an unresolved contract

A later metadata check observes approximately 90 days remaining on the
website `token` cookie, differing from the initial approximately one-year
observation. A paired `/v1/user` request neither rotates its value nor extends
its expiration; it sets a CSRF cookie instead. The cause of the earlier
lifetime difference is not established. Do not promise year-long sign-in or
automatic renewal based on the initial cookie expiration.

### Standalone recommendation and next validation

The best candidate for the custom app under this requirement is:

1. Bundle a narrow, certificate-validating HTTPS client using Samsung's
   socket extension inside the existing Tizen widget.
2. Authenticate directly through the normal website login and observed
   challenges, using a remote-friendly KinoTV sign-in screen.
3. Keep the cookie jar and persistent session on the TV. Do not retain the
   password after login. Validate platform-provided protected storage before
   choosing the persistence implementation.
4. Call `https://kino.watch/v1` directly, retaining compatible existing API
   methods and adapting authentication, errors, and media normalization.
5. Send issued media URLs directly to AVPlay.

This is a research recommendation, not an approved implementation design or a
working standalone client. The user-facing goal is install, sign in once,
complete both challenges, and watch without server addresses, API keys, cookie
copying, or a running companion computer. Reauthentication must remain a
supported flow because session renewal is not established.

The next local probe is a disposable normal login with metadata-only capture
of redirects, form fields, challenge order, and cookie issuance. Keep the
existing authenticated session separate. Then validate an equivalent local
HTTP-client flow, cookie persistence, failure recovery, and a reversible API
write. Build the transport only after approving that bounded feasibility
probe; actual Samsung socket behavior and AVPlay remain final device checks.

If the requirement also excludes using a computer even once for installation,
the current developer-signed sideloading process does not meet it. TV-store
distribution or an independently validated TV-hosted distribution route would
be a separate requirement; authentication research does not solve installation.

[wasm-overview]: https://developer.samsung.com/smarttv/develop/extension-libraries/webassembly/webassembly.html
[curl-cli]: https://developer.samsung.com/smarttv/develop/extension-libraries/webassembly/tizen-sockets-extension/building-curl-applications-using-cli-tools.html
[moonlight]: https://github.com/brightcraft/moonlight-tizen/blob/master/wasm/http.cpp
[moonlight-build]: https://github.com/brightcraft/moonlight-tizen/blob/master/Dockerfile
[existing-install]: https://teletype.in/@puh.i.toska/tizen
