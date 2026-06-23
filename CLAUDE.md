# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Jellyfin **Web Plugin** (JavaScript only — no C#, no server plugin, no build step, no npm) that adds a quality-selection download button to item detail pages. Jellyfin handles transcoding server-side; this plugin is purely UX.

See `jellyfin-quickdownload-plan.md` for the full phased plan (written in German).

## File Structure

```
jellyfin-quickdownload/
├── plugin.json   — manifest (Name, GUID, version, entry point)
└── plugin.js     — all logic (button injection, download, progress)
```

Jellyfin Web Plugins consist of exactly these two files. No compilation, no bundler.

## Architecture

### Download URL logic

- **Transcoded quality** (`selectedBitrate > 0`):
  `/Videos/{itemId}/stream.mp4?MaxStreamingBitrate={bitrate}&VideoCodec=h264&AudioCodec=aac&MaxAudioChannels=2&Static=false&api_key={token}`
- **Original file** (`selectedBitrate === 0`):
  `/Items/{itemId}/Download?api_key={token}`

### Filename logic (built from `/Users/{userId}/Items/{itemId}`)

- Movie: `"{Name} ({ProductionYear}).mp4"`
- Episode: `"{SeriesName} S{SeasonNumber padded}E{EpisodeNumber padded} - {Name}.mp4"`

### Progress estimation

```js
const durationSeconds = item.RunTimeTicks / 10_000_000;
const estimatedBytes = ((selectedBitrate + 128_000) * durationSeconds) / 8; // transcode
const originalBytes = item.MediaSources[0].Size; // original download
```

Accuracy is ±10–15% due to H.264 VBR — show `~` prefix in the UI.

### Download flow

`fetch()` + `response.body.getReader()` (ReadableStream) to accumulate chunks → progress bar → `Blob` → `URL.createObjectURL()` → `<a download>` trigger → `revokeObjectURL()`. Use `AbortController` for cancel support.

For original-file downloads, use a direct `<a href>` instead of Blob (avoids large RAM usage).

### UI injection

Inject into `.itemDetailButtons` / `.detailButtons`. Try multiple selectors as a fallback chain since CSS class names may change between Jellyfin versions.

### Quality options

Use `qualityoptions.getVideoQualityOptions()` from Jellyfin's own module. Keep a static fallback profile list in case the module name changes across versions.

### Plugin registration

Register on the `viewshow` event of item detail pages. Use `pageTests` in `plugin.json` to scope to detail pages only.

## Agent skills

### Issue tracker

Issues live in GitHub Issues; use the `gh` CLI. External PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Known Pitfalls

| Issue | Mitigation |
|---|---|
| `qualityoptions` module name may change | Static fallback profile list |
| Button injection selectors may change | Try multiple selectors in sequence |
| VBR bitrate variance | Show `~` in UI; ±10–15% is acceptable for a progress bar |
| Blob for large files uses RAM | Use direct `<a href>` for original downloads; transcoded quality targets 300–500 MB |
| CORS | Non-issue — plugin runs in the same origin as the Jellyfin web client |
