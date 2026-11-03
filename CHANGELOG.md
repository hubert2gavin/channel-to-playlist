# Changelog

## 1.0.0 — 2026-11-02
- First release.
- Scans the loaded videos on a channel's Videos, Live or Shorts tab in page order (current lockup markup and older rich-grid markup; ads and non-video tiles skipped; duplicates removed).
- Optional auto-scroll that loads videos until the count stops growing.
- Creates a playlist (title defaults to the channel name; Unlisted, Private or Public) and adds videos one at a time with delay, jitter, retries and backoff.
- Pause and resume across popup closes, tab reloads and browser restarts. Verify order. Activity log.
- Light and dark themes.
