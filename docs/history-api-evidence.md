# History API evidence and mapping

History uses `/v1/history`, independently of Continue Watching. This note
records the response evidence checked on November 13, 2026, and the limits of
that evidence. No authenticated account requests or mutations were used.

## Sources

Context7 was queried first for the kino.watch API. It returned unrelated watch
and cryptocurrency APIs, so research continued with these public sources:

- [Service history documentation](https://kinoapi.com/api_history.html),
  including its [source text](https://kinoapi.com/_sources/api_history.rst.txt):
  `history[]` contains `time`, `counter`, `first_seen`, `last_seen`, `item`, and
  `media`. Times are seconds; `last_seen` is Unix time. Pagination accepts
  `page` and `perpage` (default 20, maximum 50).
- [Service video documentation](https://kinoapi.com/api_video.html): item
  summaries contain title identity and posters; item detail contains film
  `videos` or series `seasons[].episodes`. Media duration is seconds. Watching
  status is `-1`, `0`, or `1`. Media links accept the media identifier `mid`.
- [Public webOS client response types at commit 1d18773](https://github.com/ValeraGin/kinopub.webos/blob/1d18773dcb18da59b7e32a700cc1f7de539669dd/src/api/typings.ts):
  the implementation's `HistoryItem` maps nested `item` to `Item` and `media`
  to `Video`, including `id`, `number`, `snumber`, and `duration`.
- [The same client's history renderer](https://github.com/ValeraGin/kinopub.webos/blob/1d18773dcb18da59b7e32a700cc1f7de539669dd/src/components/historyList/historyList.tsx)
  uses `media.snumber` and `media.number` for historical episode playback.

The service docs are authoritative for the endpoint envelope but leave nested
objects empty. The client repository is primary evidence of that client's
mapping, not a service guarantee or a captured current-account response.

## Mapping and ordering

The adapter reads only nested `item.id`, catalog display fields, `media.id`,
`media.duration`, `time`, and `last_seen`. Numeric strings are normalized.
Missing media remains an unavailable entry rather than guessing an episode.
Missing posters use the existing artwork fallback. Invalid title identity or
timestamp cannot establish ordering and is omitted.

No source establishes global server ordering or a history `sort` parameter, and
a real account's pages were observed out of `last_seen` order (November 2026).
The app therefore fetches **all pages** before publishing a result, sorts by
`last_seen` descending, and retains the latest row per `item.id`. Ties use title
ID for stable display. A failed page fails the query; the UI offers Retry.
The safety bound is 200 pages of 50 rows. Larger or invalid pagination produces
an error instead of presenting a truncated list as complete history.

Page 1 reports the page count; the remaining pages are requested in parallel,
at most six at a time, and merged in page order. A long history is dozens of
pages: on a 2021 TV (Tizen 6.0) one account's 54 pages took about 190 ms each,
over 10 s when read one after another. A page beyond a total that shrank during
the read contributes nothing rather than failing the query.

History isn't refetched every time its tab shows. The query stays fresh for
five minutes and is kept for thirty after the tab closes; progress writes and
watched changes invalidate it, so playback from this app updates it at once.
Each successful read is also saved in local storage (`kinotv:history`, only the
fields the cards show), and the next launch starts from that copy at its age,
refreshing behind it once stale. A failed refresh keeps the list on screen; only
a history never read shows the error and Retry. Sign-out removes the copy.

On OK, current item detail resolves the historical **media ID** to its exact
episode or film part. Fresh watching status establishes explicit completion.
The saved history time supplies resume position; completed media replays from
zero. The existing app completion threshold of 90% also applies when status
doesn't mark completion. Missing matching media or failed metadata/progress
reads keeps the viewer on History with a visible message and usable focus.

Progress writes and manual watched changes invalidate History. Returning from
playback refetches all pages, updating saved position and ordering.

## Remaining verification

Current service nested response compatibility, changes during multi-page reads,
and service consistency immediately after writes remain unverified. Pagination
doesn't document a snapshot token, so no client can promise a transactional
history snapshot across concurrent account activity. There is no guessed
server-order guarantee. Native playback, real-account persistence, remote
readability, and focus on the TV belong to the coordinated device acceptance
ticket `kinotv-91o.26.13`.
