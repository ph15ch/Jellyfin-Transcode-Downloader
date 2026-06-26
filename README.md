# Jellyfin Transcode Downloader

![Transcode Downloader](logo.png)

A Jellyfin **server plugin** that adds a quality-selection download option to the More menu
on item detail pages. Pick a transcoded quality (H.264/AAC) or download the original file
straight from the movie/episode page.

## How to download

After installing the plugin, open any **movie or episode detail page** in the Jellyfin web
client. Open the **"More" menu** (the `⋯` / kebab menu on the detail page) — a
**"Download (Transcode…)"** entry appears at the bottom of the list.

Selecting it opens a quality picker. Choose a bitrate tier to transcode on the fly, or
pick **Original** to grab the unmodified source file.

### What happens in the background

| Mode | What Jellyfin does |
|---|---|
| **Transcoded** (e.g. 4 Mbps) | Jellyfin encodes the video server-side to H.264/AAC at the selected bitrate and streams the result. The plugin downloads the stream chunk by chunk, shows a live progress bar with an estimated file size, and saves it as an `.mp4` once complete. |
| **Original** | A direct download link is opened — no transcoding, no buffering into RAM. The browser saves whatever format Jellyfin has on disk. |

The estimated file size shown during a transcoded download is calculated from the selected
bitrate and the item's runtime (`~size = (bitrate + 128 kbps audio) × duration ÷ 8`). It
carries a `~` prefix because VBR encoding means the real size can vary by ±10–15%.

Cancelling mid-download aborts the in-progress request cleanly; no partial file is saved.

## How it works

The plugin embeds a small client script and serves it from a plugin API endpoint
(`GET /TranscodeDownloader/ClientScript`). It then injects a single `<script>` tag into the
Jellyfin web client's `index.html` — **in memory**, via the File Transformation companion
plugin, so it never writes to Jellyfin's web directory. This is what makes it work on
standard package and Docker installs where the web root is read-only, and it survives
Jellyfin web updates.

## Requirements

- **Jellyfin 10.11.x** (built against the 10.11.8 SDK; ABI floor `10.11.8.0`).
- **File Transformation plugin** (>= **v2.2.1.0**) — strongly recommended (see below).

### Installing File Transformation (one-time)

1. In Jellyfin: **Dashboard → Plugins → Repositories → Add**, then add the File
   Transformation plugin repository.
2. **Dashboard → Plugins → Catalog**, install **File Transformation**.
3. Restart Jellyfin.

> Without File Transformation, the plugin falls back to patching `index.html` on disk.
> On most installs that directory is **read-only**, so the fallback fails and the button
> will not appear — the server log will say so and recommend installing File Transformation.
> **No filesystem permission changes are needed** when File Transformation is installed.

## Installing Transcode Downloader

1. Add this plugin's repository URL under **Dashboard → Plugins → Repositories**:
   ```
   https://raw.githubusercontent.com/ph15ch/Jellyfin-Transcode-Downloader/main/repo/manifest.json
   ```
2. Install **Transcode Downloader** from the catalog.
3. Restart Jellyfin.

After restart, open a movie or episode detail page and open the More menu — **"Download (Transcode…)"** appears in the list. (`[TranscodeDownloader] plugin loaded` prints in the browser console.)

## Building from source

```
dotnet publish src/JellyfinTranscodeDownloader.csproj -c Release -o publish/ -p:Version=1.2.3
```

The output `Jellyfin.Plugin.TranscodeDownloader.dll` is the entire plugin (the client
script is an embedded resource).

## Creating a release

Releases are fully tag-driven — no manual edits to the manifest or workflow inputs needed.

1. **Write the changelog** as the message of an annotated git tag:
   ```
   git tag -a v1.2.3 -m "Short description of what changed"
   git push origin v1.2.3
   ```

2. **The `Release` workflow fires automatically** and:
   - Validates the tag is annotated (lightweight tags are rejected)
   - Builds with `dotnet publish -p:Version=1.2.3` (drives the assembly version and the
     JS cache-bust `?v=` query)
   - Zips `Jellyfin.Plugin.TranscodeDownloader.dll` → `jellyfin-transcode-downloader_1.2.3.zip`
   - Computes the MD5 checksum
   - Switches to `main`, prepends a new version entry to `repo/manifest.json`, commits,
     and pushes (rebasing to survive concurrent runs)
   - Creates a GitHub release named `Transcode Downloader 1.2.3` and uploads the zip

> **Versions are immutable** — pushing a tag whose version already exists in the manifest
> will hard-fail the workflow. Cut a new tag to re-release.
