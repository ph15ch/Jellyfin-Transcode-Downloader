# Concurrent downloads are an administrator setting, defaulting to one

The download queue ran strictly one item at a time. A server with headroom can encode several
streams at once, and a fast connection can carry several downloads, so the queue now runs up to
`MaxConcurrentDownloads` entries in parallel ([ph15ch#22]).

**One knob, not two.** The issue asks for concurrent transcodes *and* concurrent downloads. In
this plugin they are the same thing: a queue entry is a single `GET /Videos/{id}/stream.mp4`
request that Jellyfin transcodes as it streams. There is no transcode to schedule apart from
the download that consumes it, so a second setting could only ever be a duplicate of the first.

**The number lives on the server.** The concurrency ceiling is a property of the machine doing
the encoding, not of the browser asking for it, and the load falls on an administrator who
never sees the download UI. It is therefore a plugin configuration setting
(Dashboard → Plugins → Transcode Downloader) rather than a per-browser preference like the
codec choice — the FFmpeg processes are the scarce resource, and per-user opt-in would let a
handful of users multiply the load past whatever the server can take.

Ordinary users still need to read it, and Jellyfin's own `/Plugins/{id}/Configuration` requires
elevation, so the client reads it from `GET /TranscodeDownloader/Config`, which exposes the
client-relevant fields and nothing else. It is re-read every time the quality sheet opens, so
raising the limit reaches users without asking them to reload the web client.

**Default 1.** Upgrading changes nothing until an administrator says otherwise. Concurrency
multiplies FFmpeg load on the server and browser memory on the client — every download is held
in memory as a `Blob` until it completes — so it is not a safe default for the small boxes this
plugin also runs on.

**Ceiling 5.** Browsers allow six connections per origin on HTTP/1.1. Beyond that the extra
downloads would not run any sooner; they would sit in the browser's own connection queue while
looking active in the panel, and the web client's API calls would queue behind them. Five keeps
one connection free for the UI. The limit is clamped in
`PluginConfiguration.MaxConcurrentDownloads`'s setter rather than only in the settings form, so
a hand-edited XML file cannot exceed it, and the client clamps the value it reads as well.

## Consequences

The limit is advisory: it governs the plugin's own queue, and nothing stops a crafted client
from opening more streams against Jellyfin's endpoints directly. Enforcing it server-side would
mean policing `/Videos/{id}/stream.mp4`, which the plugin does not own. Jellyfin's own
transcoding limits (Dashboard → Playback) remain the real backstop.

A finished or failed entry releases its slot immediately and its row lingers on screen only to
be read, so a queue with N slots keeps N downloads running rather than N minus the ones waiting
to be dismissed. Cancelling one active download no longer affects its siblings.

Saving several files at once makes browsers prompt for permission the first time; that is a
one-off per site and is called out in the settings page.

[ph15ch#22]: https://github.com/ph15ch/Jellyfin-Transcode-Downloader/issues/22
