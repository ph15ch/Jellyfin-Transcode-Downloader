# Jellyfin QuickDownload

A Jellyfin **server plugin** that adds a quality-selection download button to item detail
pages. Pick a transcoded quality (H.264/AAC) or download the original file straight from
the movie/episode page.

## How it works

The plugin embeds a small client script and serves it from a plugin API endpoint
(`GET /QuickDownload/ClientScript`). It then injects a single `<script>` tag into the
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

## Installing QuickDownload

1. Add this plugin's repository (the `repo/manifest.json` raw URL) under
   **Dashboard → Plugins → Repositories**.
2. Install **QuickDownload** from the catalog.
3. Restart Jellyfin.

After restart, open a movie or episode detail page — the download button appears next to
the other detail buttons. (`[QuickDownload] plugin loaded` prints in the browser console.)

## Building from source

```
dotnet publish src/JellyfinQuickDownload.csproj -c Release -o publish/ -p:Version=1.2.3
```

The output `Jellyfin.Plugin.QuickDownload.dll` is the entire plugin (the client script is
an embedded resource). Releases are produced automatically by pushing an annotated
`vX.Y.Z` tag — see `.github/workflows/release.yml`.
