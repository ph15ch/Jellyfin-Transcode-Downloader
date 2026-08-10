# Kill the transcoding job after a download instead of relying on the server

A finished transcoded download left its `.mp4` behind in Jellyfin's transcode folder. Jellyfin
deletes a progressive transcode's temp file in exactly one place — `TranscodeManager.KillTranscodingJob`,
via `DeletePartialStreamFiles` — and a completed download never reaches it:

- the client's request ends, so `OnTranscodeEndRequest` drops `ActiveRequestCount` to 0 and calls
  `PingTimer`;
- `PingTimer` opens with `if (job.HasExited) { job.StopKillTimer(); return; }`, so it never arms the
  kill timer;
- `OnFfMpegProcessExited` only sets `HasExited` and disposes the process — it deletes nothing, and it
  does not remove the job from `_activeTranscodingJobs` either.

A download that runs to completion always ends with ffmpeg already exited, so the file leaked every
time. It survived until the next server start, where the `TranscodeManager` constructor's
`DeleteEncodedMediaCache()` wipes the folder. A *cancelled* download was never affected: ffmpeg is
still running, so the kill timer arms and cleans up ~10s later.

The one cleanup path left is `DELETE /Videos/ActiveEncodings?deviceId=&playSessionId=`
(`HlsSegmentController.StopEncodingProcess`), which calls `KillTranscodingJobs(…, _ => true)` —
and it still finds the job, precisely because an exited job is never removed from the active list.
So `web/plugin.js` now sends a `PlaySessionId`/`DeviceId` pair with the stream request and fires
that DELETE when the download ends — completed, failed, aborted, or interrupted by `pagehide`.

Verified against `release-10.11.z`: `MediaBrowser.MediaEncoding/Transcoding/TranscodeManager.cs`
and `Jellyfin.Api/Controllers/HlsSegmentController.cs`.

## Consequences

Both ids are per-download and synthetic. They are not cosmetic: `StreamingHelpers.GetOutputFilePath`
hashes `{mediaPath}-{userAgent}-{deviceId}-{playSessionId}` into the temp filename, so a fresh pair
per download means each download transcodes into its own file. Previously every download of the same
item shared one path, and `FileStreamResponseHelpers.GetTranscodedFile` serves an existing file
rather than re-encoding — which, with the leak above, meant a repeat download was quietly served the
leftover file, and a download started inside a cancelled one's 10s kill window could be served a
partial file that was then deleted underneath it.

The device id is our own (`transcode-downloader-{id}`) rather than the client's. `ReportTranscodingProgress`
pushes `ReportTranscodingInfo(deviceId, …)` and `OnTranscodeFailedToStart` calls
`ClearTranscodingInfo(deviceId)`; sending the real device id would let a background download
overwrite or clear the transcoding info of an actual playback session on the same device in the
dashboard. An unrecognised device id simply matches no session. Killing by `playSessionId` takes
priority over `deviceId` in `KillTranscodingJobs`, so the DELETE stays exact either way.

The DELETE is fire-and-forget with `keepalive`, and a failure is a console warning only: the
download itself has already succeeded by then, and the worst case is the leak we had before.
