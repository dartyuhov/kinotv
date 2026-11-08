# Bounded persistent image cache

## Problem Statement

When I browse KinoTV, revisiting screens must feel quick without repeatedly
downloading the same thumbnails and pictures. My TV has limited storage and
memory, so a growing cache or excessive image decoding is also unacceptable.
I want this to work automatically on the TV without a Mac, server, or cache
configuration.

## Solution

KinoTV automatically saves recently used artwork in a persistent image cache
with a 50 MiB managed-file limit. It prioritizes visible images, reuses fresh
artwork across restarts, refreshes stale artwork efficiently, and removes
least-recently-used images when necessary. Settings shows usage and offers a
clear action that preserves the saved login and preferences.

## User Stories

1. As a viewer, I want recently downloaded posters reused when I revisit a
   screen, so that browsing feels fast and uses less bandwidth.
2. As a viewer, I want cached artwork retained across app restarts, so that
   reopening KinoTV doesn't download every picture again.
3. As a viewer, I want the image cache bounded to 50 MiB, so that artwork
   doesn't consume excessive TV storage.
4. As a viewer, I want old, rarely used artwork removed automatically, so that
   I don't need to manage storage myself.
5. As a viewer, I want visible artwork loaded before speculative images, so
   that the screen I am browsing becomes useful quickly.
6. As a viewer, I want only a few nearby cards prefetched, so that navigation
   feels responsive without downloading the whole catalog.
7. As a viewer, I want large backdrop downloads delayed while I move quickly,
   so that rapid navigation doesn't waste bandwidth.
8. As a viewer, I want the backdrop to match the currently focused title, so
   that a slow obsolete download doesn't show the wrong artwork.
9. As a viewer, I want small supplied images used for small cards and blurred
   previews, so that decoding and transfer costs stay low.
10. As a viewer, I want the same image shared across components, so that it
    isn't downloaded repeatedly for different parts of a screen.
11. As a viewer, I want cached artwork displayed immediately when permitted,
    so that refreshes don't create unnecessary blank screens.
12. As a viewer, I want artwork changes detected efficiently, so that cached
    pictures don't remain outdated indefinitely.
13. As a viewer, I want unchanged pictures validated without another body
    download when the server supports it, so that refreshes stay lightweight.
14. As a viewer, I want existing artwork retained during a failed refresh
    when server rules permit it, so that brief network failures are unobtrusive.
15. As a viewer, I want title placeholders when an image is unavailable, so
    that missing artwork doesn't prevent navigation.
16. As a viewer, I want browsing to continue when cache storage is full or
    unavailable, so that a cache failure doesn't break the app.
17. As a viewer, I want corrupt cached files recovered automatically, so that
    one bad download doesn't leave a permanently broken image.
18. As a viewer, I want interrupted downloads cleaned up after restart, so
    that incomplete files don't accumulate.
19. As a viewer, I want speculative image downloading paused during playback,
    so that it doesn't compete with watching a film.
20. As a viewer, I want offscreen image resources released, so that long
    browsing sessions don't retain unnecessary decoded images.
21. As a viewer, I want Settings to show image-cache usage, so that I can see
    how much managed storage artwork uses.
22. As a viewer, I want to clear the image cache with the remote, so that I
    can reclaim its space easily.
23. As a viewer, I want clearing images to preserve my login and preferences,
    so that cleanup doesn't force me to configure the app again.
24. As a viewer, I want clearing during a download to stay effective, so that
    an old completion doesn't immediately repopulate the cache.
25. As a viewer, I want all caching to run inside KinoTV, so that no companion
    system or manual cache settings are required.
26. As a maintainer, I want local tests to verify reuse and storage bounds,
    so that regressions are caught without access to a TV.
27. As a maintainer, I want storage and network failures tested locally, so
    that the cache remains a reliable optimization rather than a dependency.
28. As a viewer reporting a problem, I want cache diagnostics without secrets
    or full image URLs, so that troubleshooting doesn't expose account data.

## Implementation Decisions

The cache is one shared module behind the image-loading boundary. It owns
request coordination, freshness, leases, usage accounting, and eviction.
Asynchronous platform storage adapters provide private files on Tizen and
transactional blobs in IndexedDB for browser development. Components do not
manage storage directly.

- The hard logical-file limit is 52,428,800 bytes, including payloads,
  metadata, and temporary download/replacement files. This is not a promise
  about total app disk allocation, browser caches, or decoded graphics memory.
- Reserve capacity before writing and serialize budget mutations. Unknown
  response lengths acquire additional reservations as bounded chunks arrive.
- Begin least-recently-used cleanup when admission would exceed 45 MiB,
  targeting 40 MiB or enough room for the write, whichever removes more.
- Admit at most 2,000 entries and persist at most 5 MiB for one image.
  Protected visible leases never cause the budget to expand.
- Use temporary writes and an adapter commit operation. Reconcile metadata,
  missing files, and unfinished writes on startup. Batch access-time updates.
- Use the full source URL as identity, including query parameters, and a
  digest as the storage filename. Deduplicate identical sources across roles.
- Respect response cache directives, age, ETag, and Last-Modified. Use seven
  days as fallback freshness only when no explicit lifetime applies.
- Show stale cached artwork immediately only when response directives permit
  it; otherwise validate first. Never persist no-store responses or invalid
  image/HTML error bodies.
- Run at most two image downloads concurrently. Visible images outrank
  refreshes and prefetches. Cancel queued work without consumers; releasing
  one lease doesn't cancel a request another consumer needs.
- Prefetch at most two nearby cards in the navigation direction while idle.
  Suspend prefetch offline and during playback.
- Wait 200 ms after focus settles before requesting a sharp backdrop. Ignore
  obsolete completions and retain at most outgoing and incoming sharp
  backdrops during a transition.
- Reuse supplied fixed artwork variants. Prefer medium posters, small blurred
  previews, and episode thumbnails. Do not invent CDN resizing parameters or
  add image transcoding. Share the supplied wide source when no smaller wide
  variant exists.
- Release object URLs and retained references when leases end. Do not add a
  decoded offscreen image cache or store base64 images in localStorage.
- Retry failed storage admission once after cleanup, then use transient
  display and report persistence unavailable. Never delete unrelated data.
- Clearing uses a generation boundary so old downloads cannot repopulate
  persisted storage. Visible leases can remain until released. Preserve login
  state and preferences.
- Settings uses existing remote-focus and localization patterns, displaying
  usage against 50 MiB and a clear action without advanced tuning controls.
- The cancellable image transport supports bounded bytes and conditional
  responses. Use ordinary artwork fetching when supported and allow the
  separately designed on-TV HTTPS transport behind that contract. Never send
  subscriber authentication to artwork hosts.

## Testing Decisions

Good tests verify visible behavior, image network traffic, persistent usage,
and externally observable recovery. They don't assert private queues, store
internals, hook calls, or the chosen module layout.

The primary seam is the existing whole-app remote-driven browser harness with
its fake API and fake CDN. Extend its artwork fixtures to control freshness,
validators, payload sizes, delays, and failures. Observe application-managed
reuse rather than accidentally relying on the browser HTTP cache.

Use a controllable storage adapter only where browser tests cannot naturally
exercise disk exhaustion, interrupted writes, and corruption. Run the same
storage-contract checks against the browser adapter and a local Tizen API
simulation. These tests do not establish actual TV filesystem behavior.

Local acceptance covers:

1. Fresh-image reuse on revisit and app reload without another body download.
2. One download for concurrent consumers of the same URL.
3. Bounded logical usage under concurrent downloads and replacements, with a
   small injected budget for deterministic least-recently-used eviction.
4. A 304 without payload replacement, changed artwork updates, and correct
   no-store, no-cache, and must-revalidate behavior.
5. Rapid remote navigation without stale backdrop replacement or unbounded
   speculative requests.
6. Full storage, corrupt payloads/indexes, and interrupted writes without
   breaking browsing or deleting unrelated data.
7. Clear during in-flight work without old completions repopulating storage
   or removing session state.
8. Rejection of oversized bodies, invalid images, and HTML responses.
9. Resource release and bounded backdrop retention through repeated navigation.
10. Accessible, localized usage and clear controls operated with the remote.

All agent-owned verification is local. The user performs TV checks, including
power-cycle persistence and actual device performance. Agent completion does
not require connecting to or controlling the TV. Report locally verified
behavior separately from user-owned device acceptance.

## Out of Scope

This spec excludes video/media caching, subtitle caching, persistent API-data
caching, authentication implementation, password or cookie storage, hosted
bridges, image transcoding, arbitrary CDN resize support, cache-size tuning,
and TV-store distribution. It does not claim an exact process-memory ceiling.
Live subscriber authentication testing is not required for deterministic
image-cache acceptance.

## Further Notes

The approved user policy is automatic caching with a 50 MiB managed-file
budget. The written design contains the rationale and detailed recovery rules.
This feature belongs to the existing KinoTV v1 effort and must preserve its
standalone everyday-use requirement.

The separate authentication investigation has explicit user permission for
local testing and retrieval of the relevant login email code through the
Google Workspace CLI when needed. Credentials, codes, and session values must
not appear in tickets or research reports. That permission is not a request
to perform live login as part of this spec publication.
