# Take the download target from the action sheet, not from the address bar

The transcode entry is injected into Jellyfin's own action sheet, next to its `download`
command — and that sheet is not always about the item in the address bar. Every episode row
of a season or series page opens one for its own episode while the URL still reads
`#/details?id={seasonId}`. Reading the id from the hash therefore sent
`/Videos/{seasonId}/stream.mp4`, and Jellyfin threw
`InvalidCastException: Unable to cast … Season to … IHasMediaSources` while resolving media
sources — surfacing as a bare "Download failed" ([ph15ch#29]).

Jellyfin resolves the item a context menu acts on from the closest ancestor carrying
`data-id` (`shortcuts.js` → `getItem`, fed by the `data-id` that `cardBuilder` and `listView`
emit on every card and row). The plugin now mirrors that lookup: a capture-phase click
listener records the id of the clicked element's nearest `[data-id]` ancestor, and the id is
bound into the injected entry at injection time — by the time the entry is clicked, the click
target is the entry itself. Nothing in the sheet's own DOM identifies the item: `actionSheet`
puts the *command* name in `data-id` (`data-id="download"`), and the `positionTo` element is
used for layout only and never stored.

## Consequences

Ids are validated by shape (32 hex digits) before they are trusted, because the same attribute
carries command names inside the sheet. A sheet whose trigger was not observed falls back to
the address bar, which is exactly right for detail pages: their More button has no `data-id`
ancestor at all, and the item lives only in jellyfin-web's closure scope.

The fallback can still land on a folder, so the quality sheet checks the resolved item before
offering anything and says transcoded downloads are for movies and episodes rather than
firing a request the server can only fail. An absent `MediaType` is treated as playable — a
sparse DTO must never block a download that used to work.

[ph15ch#29]: https://github.com/ph15ch/Jellyfin-Transcode-Downloader/issues/29
