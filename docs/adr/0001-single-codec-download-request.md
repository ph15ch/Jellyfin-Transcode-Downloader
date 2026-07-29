# Request a single video codec, never a fallback list

Jellyfin's `/Videos/{id}/stream.{container}` endpoint accepts a comma-separated `VideoCodec`
list and may pick a different entry than the first one; the download UI sends exactly one codec
instead. A list would let the server silently downgrade an AV1 request to H.264 while the picker
still shows AV1 and the estimated file size (`bitrate × duration ÷ 8`) still assumes the AV1
target — a wrong file, with a wrong size, and no visible explanation.

## Consequences

Sending one codec makes an unavailable encoder a hard failure rather than a silent
substitution, so the plugin has to establish availability *before* the download starts. That is
what `GET /TranscodeDownloader/Codecs` exists for: it replicates Jellyfin's own encoder
resolution and additionally probes the software encoder, which Jellyfin itself returns without
checking (`EncodingHelper.GetH26xOrAv1Encoder`). Without that probe, a server whose FFmpeg lacks
`libsvtav1` accepts the request and the transcode then dies mid-stream.
