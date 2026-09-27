# Podcasts

A podcast player for Light Phone III, built with Ink.

- Search shows through Apple Podcasts.
- Star shows to keep them on the home screen.
- Reopen cached shows offline, with stale episode lists refreshed in the background.
- Stream episodes with background playback, seeking and skip controls.
- Download episodes for local playback. Long-press an episode to download, cancel or remove it.
- Browse saved episodes in Downloaded. Delete downloads manually or automatically when finished.
- Choose playback speed and skip durations.
- Shorten pauses with Smart Speed and even out speech volume with Voice Boost.
- Read episode descriptions and tap timestamps to jump to that point.
- Optionally play the next unfinished episode in the show or Downloaded list you started from.
- Set a sleep timer from the playing screen, for a duration or the end of the episode.
- Restore the current episode and playback position after reopening.

Show and episode data comes from public RSS feeds. Episode lists load 24 at a time as you scroll. The show cache keeps up to 32 shows or 32 MB and refreshes after five minutes.

Uses the neighbouring Ink checkout during development:

```sh
bun install
ink dev
```
