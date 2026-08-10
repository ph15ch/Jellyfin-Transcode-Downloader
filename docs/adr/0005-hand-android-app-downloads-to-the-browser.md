# Hand downloads to the system browser inside the Jellyfin Android app

Inside the Jellyfin Android app a transcoded download streamed to 100% and then produced no file:
no error, no entry in Android's `DownloadManager`, nothing written under `/storage/emulated/0/Download/`
or the app's own data directories. The same download through Chrome on the same device worked.

The cause is not ours and not the server's. `web/plugin.js` ends every download the standard way —
`Blob` → `URL.createObjectURL()` → `<a download>` → `click()`. In an Android WebView that click is
routed to `WebView.setDownloadListener(…)`, and **if no `DownloadListener` is registered the WebView
silently discards the download.** `org.jellyfin.mobile` registers none:

- `setDownloadListener` / `onDownloadStart` / `DownloadListener` appear **nowhere** in
  `jellyfin/jellyfin-android` (GitHub code search, 0 results each);
- `webapp/WebViewFragment.kt` sets up the WebView with `settings.applyDefault()` and four
  `addJavascriptInterface` calls, and no download wiring;
- `webapp/JellyfinWebViewClient.kt` overrides only `shouldInterceptRequest`, `onReceivedHttpError`,
  `onReceivedError` and `onReceivedSslError` — there is no `shouldOverrideUrlLoading`;
- `webapp/JellyfinWebChromeClient.kt` has no `onCreateWindow` and multi-window support is never
  enabled, so `window.open()` is dropped as well.

The app's own Download button works because it never uses a WebView download at all: it goes through
the JS bridge — `NativeShell.downloadFile()` → `NativeInterface.downloadFiles(args)` →
`ActivityEvent.DownloadItems` → `downloads/FileDownloader.kt`. That bridge accepts **item ids only**
and resolves the URL natively, so it cannot be handed a transcode URL.

That leaves `NativeShell.openUrl(url)` → `NativeInterface.openUrl` → `ActivityEvent.OpenUrl` →
`Intent(Intent.ACTION_VIEW, uri)`, which launches the system browser. The browser then downloads the
URL exactly as Chrome already did by hand. So inside the app the quality/codec picker still builds
the same stream URL, and the download is handed to the browser instead of fetched into a blob.

Detection requires all three of `NativeShell.openUrl`, `NativeInterface.openUrl` and an Android user
agent: the desktop shell also defines `NativeShell`, and blob downloads work perfectly well there.
If detection ever fails the behaviour is exactly what it is today — no worse.

Verified against `jellyfin/jellyfin-android` `master`.

## Consequences

Handing the URL over ends the page's involvement in the transfer, which costs everything the queue
gave us — for this route only:

- **No progress, no cancel, no queue entry.** The transient notice is the only feedback, so the hint
  in the quality sheet is shown *before* a tier is picked; a surprise browser launch has already cost
  the server a transcode.
- **No filename of ours.** Jellyfin's `/Videos/{id}/stream.mp4` sends no `Content-Disposition`, so
  the browser names the file from the request path: `stream.mp4`, not
  `Show S01E01 - Title [H264 4Mbps AAC].mp4`. Getting our name back would mean proxying the bytes
  through the plugin's own controller purely to set a header — not worth it.
- **The `api_key` is handed to another app** and lands in the browser's history. The token is already
  in the page URL of every download; this widens where it is visible, not what it grants.
- **ADR 0004's cleanup cannot fire on completion**, because there is no completion signal. The job's
  `baseUrl`/`deviceId`/`playSessionId` are recorded in `localStorage` instead and the
  `DELETE /Videos/ActiveEncodings` is sent on a later page load, once the entry is at least 6 hours
  old. By then ffmpeg has certainly exited and the DELETE only deletes the leftover temp file. The
  age threshold is the whole point: firing it early would kill a transcode the browser is still
  streaming, and leaving a temp file a few hours longer is much the cheaper mistake. The token is
  deliberately *not* stored — it can expire between handoff and flush, so the stop is rebuilt with
  whatever token the session holds at that point.

The proper fix belongs upstream in `jellyfin-android` (register a `DownloadListener`), but even
there a `blob:` URL cannot be passed to Android's `DownloadManager`, which accepts only HTTP(S) —
the app would have to read the blob back out through JS. This handoff does not depend on any of that.
