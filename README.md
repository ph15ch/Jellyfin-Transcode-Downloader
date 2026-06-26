# Jellyfin Transcode Downloader

A Jellyfin **server plugin** that adds a quality-selection download button to item detail
pages. Pick a transcoded quality (H.264/AAC) or download the original file straight from
the movie/episode page.

## How it works

The plugin embeds a small client script and serves it from a plugin API endpoint
(`GET /TranscodeDownloader/ClientScript`). It then injects a single `<script>` tag into the
Jellyfin web client's `index.html` — **in memory**, via the File Transformation companion
plugin, so it never writes to Jellyfin's web directory. This is what makes it work on
standard package and Docker installs where the web root is read-only, and it survives
Jellyfin web updates.

## Requirements

- **Jellyfin 10.11.x** (built against the 10.11.8 SDK; ABI floor `10.11.8.0`).
- **File Transformation plugin** (>= **v2.2.1.0**) — a required companion plugin.

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

After restart, open a movie or episode detail page — the download button appears next to
the other detail buttons. (`[QuickDownload] plugin loaded` prints in the browser console.)

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
