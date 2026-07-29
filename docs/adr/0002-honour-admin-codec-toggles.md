# Honour the administrator's HEVC/AV1 encoding toggles

`EncodingOptions.AllowHevcEncoding` and `AllowAv1Encoding` (Dashboard → Playback, both **off**
by default) are only consulted by Jellyfin's `ShiftVideoCodecsIfNeeded`, which reorders a
multi-codec list and returns early for a single codec — so a direct `VideoCodec=av1` request
bypasses them entirely. The plugin nonetheless treats them as binding: a codec the administrator
has turned off is reported as not allowed by `GET /TranscodeDownloader/Codecs` and rendered
disabled in the picker.

Being technically able to route around a server-wide policy toggle is not a reason to do it. An
administrator who disables AV1 encoding to protect a small CPU means it for downloads too.

## Consequences

Disabled codecs are shown greyed out with the reason ("disabled by the server administrator" /
"not supported by this server's FFmpeg") rather than hidden, so the fix is self-service: the
user can see the toggle exists and ask for it, instead of wondering why a codec they read about
isn't there. This costs a little UI space and is the reason the capability endpoint reports
`IsSupported` and `IsAllowedByAdmin` separately rather than a single boolean.
