# Bounded image cache for KinoTV

KinoTV reuses downloaded artwork across browsing sessions while keeping its
managed image-cache files within 50 MiB. The cache works entirely on the TV,
requires no configuration, and remains separate from the saved login session.
This document records the approved policy and proposes the implementation
design for review. Implementation has not started.

## Goals and scope

You can revisit screens and restart KinoTV without downloading unchanged,
freshly cached artwork again. Cache maintenance must not interrupt remote
navigation or video playback.

- Cache posters, episode thumbnails, blurred previews, and backdrops.
- Bound persistent storage and application-retained image resources.
- Prioritize visible content and limit speculative downloading.
- Recover automatically from storage exhaustion or corrupt cache files.
- Show cache usage and provide **Clear image cache** in Settings.

Video, audio, subtitles, authenticated API responses, passwords, and session
cookies are outside this cache. Existing catalog-query freshness rules remain
separate. Standalone authentication and its HTTPS transport require their own
design and validation.

## Current behavior

`src/ui/components/Card.tsx` loads card URLs directly with lazy loading and
asynchronous decoding. `Backdrop.tsx` loads a small blurred image and a sharp
backdrop directly. There is no application-managed persistent image budget.
The browser may cache responses, but KinoTV does not control that cache.

`artwork.ts` selects fixed API variants: small, medium, big, and wide. The
current landscape-card selection can use the same large wide image as a
backdrop. The API does not expose a documented arbitrary resizing parameter.

## Architecture

A single image-cache module owns download coordination, freshness, storage
accounting, and eviction. UI components request an image and release their
interest when they unmount or change source. Platform adapters own persistent
storage; components do not call filesystem APIs.

The proposed boundaries are:

- `core/images`: cache policy, request deduplication, priority queue, leases,
  freshness, eviction, and usage reporting.
- `core/platform`: a Tizen private-file store and a browser IndexedDB store
  behind the same asynchronous image-store contract.
- `ui/components`: a shared image-loading hook/component used by cards,
  frosted images, and backdrops.
- Settings: usage display and clear action through the cache's public API.

The image fetch contract returns status, cache headers, MIME type, and a
bounded byte stream. It must support cancellation and conditional requests.
Use ordinary fetch for artwork hosts when it works; allow the separately
designed on-TV HTTPS transport to implement the same contract if required.
Do not send account cookies or authorization headers to artwork hosts.

The cache exposes these operations conceptually:

```text
acquire(source, displayRole, priority, cancellation) -> image lease
release(lease)
usage() -> managed bytes, entry count, persistence availability
clear() -> completion
```

A lease publishes a display URL and, after successful background validation,
may publish a replacement. Releasing one consumer does not cancel a shared
request while another visible consumer still needs it.

## Storage budget and eviction

The hard application-managed logical-file limit is 52,428,800 bytes, including
image payloads, the metadata index, and temporary download/replacement files.
Reserve space before writing. Unknown-length responses grow their reservation
as chunks arrive; abort caching before exceeding the limit. Serialize budget
reservations and index mutations to avoid concurrent admission races.

Start eviction when admitting a write would exceed 45 MiB. Remove the
least-recently-used entries until existing usage reaches 40 MiB or enough
space is available for the reserved write, whichever requires more removal.
Reject persistent admission if the remaining entries cannot make enough room.
Allow at most 2,000 entries and cap any one persisted image at 5 MiB. These
additional bounds prevent tiny-file metadata growth and oversized backdrops
from exhausting the budget.

Visible leases are protected during ordinary eviction. When their resources
prevent admission, display the new image transiently rather than expanding the
disk budget. Batch last-used metadata updates instead of writing on every
focus movement. Never store image bytes as base64 in localStorage.

The 50 MiB limit covers KinoTV-managed logical files, not filesystem allocation
overhead, browser-managed HTTP caches, the installed application, or decoded
graphics memory. Settings must label it **Image cache**, not total app storage.

Use an app-private cache directory on Tizen. Write to a temporary file, validate
the response and image, then publish the entry atomically using the adapter's
commit operation. Keep an index with byte size, last use, freshness metadata,
MIME type, and payload identity. On startup, remove unfinished temporary files
and reconcile index entries with actual files before admitting writes.

For browser development, store blobs and metadata transactionally in IndexedDB.
Apply the same logical accounting; browser quota failures trigger the same
fallback behavior. This adapter does not prove Tizen filesystem behavior.

## Image identity and freshness

Use the complete source URL as the logical source identity and a digest as the
filename. Preserve query parameters: do not strip signatures or assume that
two URLs with different parameters identify the same image. Display role does
not create another download when the source bytes and URL are identical.
Do not expose full source URLs in diagnostics.

Honor `Cache-Control: no-store` by avoiding persistent admission. Respect
`no-cache`, `must-revalidate`, response age, and explicit freshness lifetime.
Use ETag and Last-Modified validators when available. A 304 updates metadata
without downloading another payload. Without explicit freshness headers, use
a seven-day fallback freshness period.

For stale images whose response directives permit stale reuse, show the
cached image immediately and validate in the background. Keep the existing
image if a refresh fails. When directives require validation before reuse,
show the lightweight placeholder until validation succeeds. Never treat a
failed response or login HTML as a cacheable image.

Changed source URLs naturally create new entries; the old files are removed
by eviction. Keep validators and source metadata with the entry across restarts.

## Loading and memory behavior

Visible images outrank background refreshes, which outrank prefetches. Run at
most two image downloads concurrently. Deduplicate identical in-flight
requests and promote an existing prefetch when it becomes visible. Cancel
queued work when no consumer needs it.

Load the visible virtualized window first. Prefetch at most two cards in the
current navigation direction while idle. Do not fetch entire rows, catalog
pages, or bookmark folders merely to populate the image cache. Suspend
prefetch during playback and network-offline periods.

For focus-driven backdrops, wait 200 ms after focus settles before requesting
the sharp image. Keep the existing backdrop or small preview while navigating
quickly. Cancel obsolete queued requests and discard obsolete completions
without replacing the current backdrop.

Use the medium poster for ordinary poster cards and the small variant for
blurred previews. Use supplied episode thumbnails for episode cards. Prefer
a suitably sized supplied wide variant for landscape cards; if only a large
wide image exists, retain it as one shared source rather than inventing CDN
resize parameters or downloading separate copies for each role. Do not add
on-device image transcoding in this iteration.

Keep persistent compressed bytes separate from decoded resources. Release
object URLs and image references when their leases end. Do not retain decoded
offscreen images in a separate application memory cache. During a backdrop
transition, retain at most the outgoing and incoming sharp backdrops, then
release the outgoing resource. The browser controls its own decoder and GPU
cache, so an exact process-memory ceiling cannot be guaranteed by this module.

## Failures and cleanup

The cache is an optimization, not a prerequisite for browsing. On storage
errors, evict unleased entries and retry admission once. If persistence still
fails, serve images transiently for the session and report persistence as
unavailable. Never retry writes indefinitely or delete unrelated app data.

Remove corrupt payloads and recover through a fresh bounded download. Keep
existing component title/placeholder fallbacks when the network also fails.
Run disk cleanup asynchronously and avoid synchronous filesystem work on the
UI thread. Missing free-space telemetry must not disable byte accounting.

Clearing the cache invalidates queued refreshes and in-flight writes using a
generation boundary, removes persisted entries and metadata, and releases
unleased resources. Visible images may remain until their leases end, but
must not repopulate the cleared cache from an old completion. Subsequent
navigation can download images normally. Saved login state and preferences
remain intact.

## Settings and diagnostics

Provide a compact Settings section using the existing focus and localization
patterns. It displays **Image cache: X MiB / 50 MiB** and **Clear image cache**.
The clear action reports completion or an actionable storage failure without
changing sign-in state. No size slider or advanced tuning is needed.

Diagnostics can include hit/miss counts, downloaded byte totals, eviction
counts, and persistence availability. Exclude credentials, full image URLs,
and personally identifying API response content.

## Verification and acceptance

Verify externally visible behavior and network/storage effects rather than
the internal queue or component state. Use deterministic artwork fixtures and
a small injected budget for eviction tests.

1. Revisit a screen and restart the app: fresh persisted artwork is reused
   with no additional body download.
2. Display the same URL in several components: only one network download
   occurs, and removing one consumer does not break another.
3. Exceed the injected budget, including temporary replacements: logical
   usage stays bounded and least-recently-used unleased images are removed.
4. Validate stale artwork: a 304 reuses bytes, a changed image replaces them,
   and cache-control directives govern stale reuse.
5. Navigate rapidly: obsolete backdrops do not replace the focused title's
   image, and speculative requests stay bounded.
6. Inject a full disk or damaged index: browsing remains usable, cleanup
   stays within the cache store, and restart repairs incomplete writes.
7. Clear during a download: usage clears, old completions do not repopulate
   storage, and the saved session survives.
8. Reject oversized responses, HTML, and invalid image data without creating
   persistent cache entries.

Run all agent-owned verification locally, including repeat-browse traffic,
restart persistence, storage-adapter contracts, and failure injection. The
user owns Q60C checks for persistence across power cycles, usage accounting,
clear behavior, and smooth navigation while downloading and evicting. Agent
completion must not depend on access to the TV. Local browser results do not
establish device performance; report that boundary explicitly.

## Review and next step

Review this written design before implementation planning. The approved policy
is a 50 MiB automatically managed image cache; the detailed module, storage,
and acceptance design above remains subject to review. Implementation planning
must account for the standalone HTTPS transport dependency without introducing
a persistent external helper.
