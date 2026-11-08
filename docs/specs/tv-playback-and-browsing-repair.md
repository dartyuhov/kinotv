# TV playback and browsing repair

## Problem Statement

I can install KinoTV and sign in on my Samsung Q60C, but series playback
doesn't work. Navigation feels slow, and artwork appears low quality and
reloads visibly when I switch tabs. I can't tell whether images come from
storage or the internet. I also need to choose audio, subtitles, and video
quality while watching.

## Solution

Make the installed TV app play real KinoPub streams through Samsung's native
player, provide usable playback choices, and make repeat browsing responsive
with sharp artwork. Diagnose and verify on the actual TV against the real
service. Use remote inspection where supported and ask the viewer to confirm
picture, sound, subtitle rendering, and perceived responsiveness.

## User Stories

1. As a viewer, I want series episodes to start, so that I can watch them.
2. As a viewer, I want films to keep working, so that repairs don't regress
   other playback.
3. As a viewer, I want playback through the TV's native player, so that the
   app uses the device's supported decoding capabilities.
4. As a viewer, I want resume, seek, pause, and Back to work, so that I can
   control watching with my existing remote.
5. As a viewer, I want the app to recover from a failed stream candidate,
   so that one incompatible variant doesn't prevent playback.
6. As a viewer, I want actionable playback errors and Retry, so that a
   failure doesn't leave an unexplained black screen.
7. As a viewer, I want available audio tracks labeled by language and dubbing
   information when supplied, so that I can select the version I understand.
8. As a viewer, I want audio changes to take effect while watching, so that
   selecting a track has an audible result.
9. As a viewer, I want to select supported embedded or external subtitles,
   so that I can read dialogue.
10. As a viewer, I want subtitles Off, so that I can remove captions.
11. As a viewer, I want Auto and available fixed video resolutions, so that I
    can balance quality and bandwidth.
12. As a viewer, I want 2160p when the source and TV support it, so that I can
    use my 4K screen without being offered unavailable qualities.
13. As a viewer, I want quality switches to preserve position and pause state,
    so that changing quality doesn't restart the episode.
14. As a viewer, I want audio and subtitle choices remembered per series,
    so that the next episode uses my preferred available tracks.
15. As a viewer, I want the quality preference remembered globally, so that I
    don't repeat the same choice for every title.
16. As a viewer, I want playback choices reachable with D-pad, OK, and Back,
    so that I don't need a keyboard or another controller.
17. As a viewer, I want saved progress and lifecycle behavior preserved,
    so that leaving playback doesn't lose my position.
18. As a viewer, I want sharp supplied artwork after loading, so that a
    permanently blurred preview doesn't replace the intended picture.
19. As a viewer, I want fresh cached images reused across tab changes and
    restarts, so that repeat browsing avoids unnecessary downloads.
20. As a viewer, I want fast cached-image presentation, so that avoiding the
    network also improves the visible experience.
21. As a viewer, I want responsive focus and scrolling while images load,
    so that remote navigation doesn't stall.
22. As a viewer, I want bounded cache storage and resource release retained,
    so that speed improvements don't cause unbounded storage or memory use.
23. As a viewer, I want login and preferences preserved during updates and
    cache maintenance, so that repairs don't require repeated setup.
24. As a maintainer, I want measured network, storage, and rendering behavior,
    so that visible image reloads aren't automatically called cache misses.
25. As a maintainer, I want remote TV diagnostics where available, so that I
    can investigate failures without making the viewer perform every step.
26. As a viewer, I want claims about playback and performance backed by real
    TV evidence, so that passing simulated tests isn't presented as success.

## Implementation Decisions

The repair extends the existing player and image-cache boundaries rather
than introducing a companion service or replacing authentication.

- Reuse the existing AVPlay implementation ticket and playback-picker ticket.
  The earlier AVPlay ticket was closed because it was split, not because the
  adapter shipped. The current factory selects only fake or HTML video.
- Select AVPlay when available through the platform boundary; retain the
  desktop fallback. Use current Samsung documentation for state restrictions,
  preparation, display setup, tracks, subtitles, and suspend/restore.
- Normalize real media-link and series metadata before selecting sources.
  Unsupported formats and qualities must not appear as working choices.
- Support native audio/subtitle selection and external subtitles where the
  actual platform and source permit them. Map preferences by stable semantic
  identity, not transient track indexes across unrelated episodes.
- Provide remote-focusable playback settings and selected-state feedback.
  Serialize source changes and ignore obsolete asynchronous completions.
- Preserve time and playing/paused state across quality changes. Try a bounded
  fallback chain without repeating progress writes or resuming obsolete media.
- Declare supported device capabilities accurately. Availability of a 4K or
  HDR option is not proof of actual resolution or HDR output.
- Measure cache behavior before changing it: source requests, transferred
  bytes, cache hits, storage reads, image preparation, and presentation delay.
  Capture cold and warm runs with the same navigation sequence and titles.
- Investigate repeated cached-payload validation/decoding, serialized storage
  work, startup enumeration, URL recreation, and blank/blurred transitions as
  hypotheses. They are code observations, not established device root causes.
- Preserve the approved image-cache policy: 50 MiB managed logical-file hard
  limit including metadata and temporary files, cleanup above 45 toward
  40 MiB, LRU, 2,000 entries, 5 MiB images, freshness rules, shared leases,
  two downloads, bounded prefetch, and generation-safe clearing.
- Use supplied artwork variants and verify their actual dimensions. Fix sharp
  load failures without inventing resize parameters or transcoding artwork.
- Retain resource release and avoid a new unbounded decoded offscreen cache.
- Diagnostics exclude credentials, cookies, full signed URLs, and account
  response bodies. Use local development configuration for real-service builds.

## Testing Decisions

The primary seam is the installed app on the Q60C, operated through its real
remote or a verified remote-debugging connection against the real service.
The viewer explicitly chose TV-first work without new local simulations.

- First verify Web Inspector access, supported inspection operations, and
  remote input automation. Do not promise capabilities before establishing
  them. If remote automation is unavailable, combine inspection with a short
  viewer-driven sequence and record the limitation.
- Observe complete user journeys: sign-in retention, series selection, start,
  track selection, quality change, seek, pause, exit, and resume. Confirm films
  as well as series. Use actual supplied streams and artwork.
- Distinguish machine evidence from viewer acceptance. Player state/events
  don't establish audible language, subtitle appearance, HDR, or smoothness.
  The viewer confirms these physical outputs.
- Record before/after cold/warm tab-switch timings and request/body counts
  under the same conditions. Distinguish network, file I/O, decode, and render
  work. Report measurements and unresolved bottlenecks without asserting an
  unmeasured frame-rate target or invented speedup.
- Verify warm reuse and restart persistence, sharp-artwork completion, budget
  accounting, clear behavior, and preservation of login/preferences on TV.
- Use the existing typecheck and production build checks. Existing automated
  checks may be run for regression confidence, but adding a local AVPlay
  simulation, fake API acceptance campaign, or desktop test UI is not required
  by this scope and cannot substitute for TV verification.
- Do not delete the installed app or clear its session to resolve a signing
  problem without asking the viewer. Retain the existing author certificate.

## Out of Scope

This work excludes desktop mouse-navigation redesign, a clickable browser
remote, new local platform simulations, a demo catalog, authentication
replacement, a persistent Mac/server bridge, release publication, unrelated
v1 screens, and new video-download or transcoding functionality.

## Further Notes

The viewer reports successful sign-in on the installed build and specifically
reports series playback failure, slow navigation, and low-quality/reloading
images. Playback failure and cache misses have not yet been reproduced through
device instrumentation. Remote-debugging automation remains to be verified.

This spec supersedes the earlier local-first testing proposal for this repair.
Existing broader v1 tickets may contain local simulation criteria; when reused,
their execution brief must explicitly record this narrower TV-first acceptance
and identify any remaining older requirements rather than silently claiming
those requirements were verified.

This publication authorizes ticket creation only. It doesn't start product
implementation, change the existing parent epics, commit code, or publish a
release.
