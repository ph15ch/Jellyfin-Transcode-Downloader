(() => {
    const SUPPORTED_LOCALES = ['en-us', 'de', 'fr', 'es', 'zh-cn', 'nl'];

    // Bitrate rungs, calibrated for H.264. Other codecs scale these by their efficiency
    // factor so a given rung means roughly the same picture quality across codecs.
    const QUALITY_TIERS = [
        { resolution: '2160p', bitrate: 120_000_000 },
        { resolution: '2160p', bitrate:  80_000_000 },
        { resolution: '2160p', bitrate:  60_000_000 },
        { resolution: '2160p', bitrate:  40_000_000 },
        { resolution: '2160p', bitrate:  20_000_000 },
        { resolution: '1440p', bitrate:  15_000_000 },
        { resolution: '1440p', bitrate:  10_000_000 },
        { resolution: '1080p', bitrate:   8_000_000 },
        { resolution: '1080p', bitrate:   6_000_000 },
        { resolution: '720p',  bitrate:   4_000_000 },
        { resolution: '720p',  bitrate:   3_000_000 },
        { resolution: '720p',  bitrate:   1_500_000 },
        { resolution: '480p',  bitrate:     720_000 },
        { resolution: '360p',  bitrate:     420_000 },
    ];

    // --- Codecs ---

    // `factor` scales the H.264-calibrated tiers above to a roughly equivalent quality.
    const VIDEO_CODECS = [
        { id: 'h264', label: 'H.264 (AVC)',  tag: 'H264', factor: 1 },
        { id: 'hevc', label: 'HEVC (H.265)', tag: 'HEVC', factor: 0.65 },
        { id: 'av1',  label: 'AV1',          tag: 'AV1',  factor: 0.5 },
    ];

    const AUDIO_CODECS = [
        { id: 'aac',  label: 'AAC',  tag: 'AAC' },
        { id: 'opus', label: 'Opus', tag: 'Opus' },
    ];

    const DEFAULT_VIDEO_CODEC = 'h264';
    const DEFAULT_AUDIO_CODEC = 'aac';

    const STORAGE_VIDEO_CODEC = 'transcodeDownloader.videoCodec';
    const STORAGE_AUDIO_CODEC = 'transcodeDownloader.audioCodec';

    let selectedVideoCodec = DEFAULT_VIDEO_CODEC;
    let selectedAudioCodec = DEFAULT_AUDIO_CODEC;

    // { video: { h264: { encoder, hardware, supported, allowed }, … }, audio: { … } }
    let codecCapabilities = null;
    // false while unknown and whenever the capability probe failed — the UI then stays on
    // H.264/AAC and hides the selectors rather than guessing what the server can do.
    let codecCapabilitiesResolved = false;
    let codecCapabilitiesPromise = null;

    function findCodec(catalogue, id) {
        return catalogue.find(codec => codec.id === id) || null;
    }

    function codecTag(catalogue, id) {
        const codec = findCodec(catalogue, id);
        return codec ? codec.tag : String(id).toUpperCase();
    }

    function codecLabel(catalogue, id) {
        const codec = findCodec(catalogue, id);
        return codec ? codec.label : String(id).toUpperCase();
    }

    function videoCodecFactor(id) {
        const codec = findCodec(VIDEO_CODECS, id);
        return codec ? codec.factor : 1;
    }

    // Round a scaled bitrate to a readable step so codec-relative labels stay legible.
    // With factor 1 (H.264) every tier round-trips to its original value.
    function scaleBitrate(baseBitrate, factor) {
        const scaled = baseBitrate * factor;
        if (scaled >= 10_000_000) return Math.round(scaled / 1_000_000) * 1_000_000;
        if (scaled >= 1_000_000) return Math.round(scaled / 100_000) * 100_000;
        return Math.round(scaled / 10_000) * 10_000;
    }

    function formatBitrate(bitrate) {
        if (bitrate >= 1_000_000) return `${Number((bitrate / 1_000_000).toFixed(1))} Mbps`;
        return `${Math.round(bitrate / 1000)} kbps`;
    }

    // --- i18n ---

    // Fallback strings used when strings fetch fails or locale is en-us.
    const FALLBACK_STRINGS = {
        ChooseQuality: 'Choose quality',
        LoadingMediaInfo: 'Loading media info…',
        NoTranscodeOptions: 'No transcode options available.',
        ItemNotTranscodable: 'Transcoded downloads are only available for movies and episodes.',
        Waiting: 'Waiting…',
        DownloadTranscode: 'Download (Transcode…)',
        DownloadFailed: 'Download failed.',
        ChooseVideoCodec: 'Video codec',
        ChooseAudioCodec: 'Audio codec',
        CodecUnsupported: "not supported by this server's FFmpeg",
        CodecDisabledByAdmin: 'disabled by the server administrator',
        SoftwareEncodingHint: 'Software encoding — this can take a long time and the file is held in memory until it finishes.',
        DownloadFailedCodec: 'Download failed — the server could not encode with {codec}.',
        DownloadFailedStatus: 'Download failed (HTTP {status}).',
    };

    // Populated by initStrings(); null until loaded.
    let loadedStrings = null;

    function t(key) {
        if (loadedStrings && loadedStrings[key]) return loadedStrings[key];
        return FALLBACK_STRINGS[key] || key;
    }

    // Resolve locale → candidate list with fallback chain: exact → base → en-us
    function resolveLocaleCandidates(locale) {
        const lower = (locale || '').toLowerCase().replace('_', '-');
        const base = lower.split('-')[0];
        const candidates = [];
        if (SUPPORTED_LOCALES.includes(lower)) candidates.push(lower);
        if (base !== lower && SUPPORTED_LOCALES.includes(base)) candidates.push(base);
        if (!candidates.includes('en-us')) candidates.push('en-us');
        return candidates;
    }

    async function fetchStrings(locale) {
        const candidates = resolveLocaleCandidates(locale);
        const base = document.querySelector('script[src*="TranscodeDownloader/ClientScript"]');
        const origin = base
            ? new URL(base.src).origin
            : window.location.origin;
        const basePath = base
            ? new URL(base.src).pathname.replace('/TranscodeDownloader/ClientScript', '')
            : '';

        for (const candidate of candidates) {
            try {
                const res = await fetch(`${origin}${basePath}/TranscodeDownloader/strings/${candidate}.json`);
                if (!res.ok) continue;
                const strings = await res.json();
                return { lang: candidate, strings };
            } catch (_) {
                // try next candidate
            }
        }
        return null;
    }

    // Eagerly load strings; resolves once loaded (or on failure).
    let stringsPromise = null;

    function initStrings() {
        stringsPromise = new Promise((resolve) => {
            function tryLoad(attempt) {
                // globalize sets document.documentElement.lang to the normalized locale
                // (e.g. 'de', 'en-us') during its module init — before any deferred script runs.
                const locale = document.documentElement.lang || null;
                if (locale) {
                    fetchStrings(locale).then(result => {
                        if (result) loadedStrings = result.strings;
                        console.log('[TranscodeDownloader] strings loaded for locale:', locale);
                        resolve();
                    }).catch(() => resolve());
                } else if (attempt < 20) {
                    setTimeout(() => tryLoad(attempt + 1), 250);
                } else {
                    console.warn('[TranscodeDownloader] locale not detected, using fallback strings');
                    resolve();
                }
            }
            tryLoad(0);
        });
    }

    // --- Server settings ---

    // How many downloads may run at the same time. Server-configured (Dashboard → Plugins →
    // Transcode Downloader) and read back over /TranscodeDownloader/Config; until that
    // succeeds the queue behaves exactly as it always did — one download at a time.
    const DEFAULT_MAX_CONCURRENT_DOWNLOADS = 1;
    // Mirrors PluginConfiguration.MaxAllowedConcurrentDownloads. The server already clamps,
    // so this only guards against a response from a newer server than this script.
    const MAX_CONCURRENT_DOWNLOADS_CEILING = 5;

    let maxConcurrentDownloads = DEFAULT_MAX_CONCURRENT_DOWNLOADS;

    function clampConcurrency(value) {
        const limit = Math.floor(Number(value));
        if (!Number.isFinite(limit)) return DEFAULT_MAX_CONCURRENT_DOWNLOADS;
        return Math.min(Math.max(limit, 1), MAX_CONCURRENT_DOWNLOADS_CEILING);
    }

    // Read whenever the quality sheet opens, so raising the limit takes effect without every
    // user reloading the web client. A failure leaves the last known value in place.
    function fetchServerSettings() {
        return new Promise((resolve) => {
            getApiClient(0, 10, async (client) => {
                try {
                    const baseUrl = client.serverAddress() || window.location.origin;
                    const res = await fetch(`${baseUrl}/TranscodeDownloader/Config?api_key=${encodeURIComponent(client.accessToken())}`);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const payload = await res.json();
                    const limit = readField(payload, 'MaxConcurrentDownloads');
                    if (limit !== undefined) {
                        maxConcurrentDownloads = clampConcurrency(limit);
                        // A raised limit has to reach downloads that are already waiting;
                        // otherwise they stay sequential until the queue next changes.
                        pumpQueue();
                    }
                } catch (err) {
                    console.warn('[TranscodeDownloader] Settings unavailable, keeping the download limit at', maxConcurrentDownloads, err);
                }
                resolve();
            }, () => resolve());
        });
    }

    // --- Download queue ---
    // Each entry: { id, filename, estimatedBytes, url, abortController,
    //               status: 'waiting'|'active'|'finished' }
    // Up to maxConcurrentDownloads entries are active at once. Each active entry is also one
    // transcode running on the server: for this plugin a download *is* its transcode.
    const downloadQueue = [];
    let activeDownloads = 0;
    // Entry ids double as DOM ids and as the key the cancel button removes by, so they have to
    // be unique even for two downloads of the same item started in the same millisecond.
    let nextEntrySequence = 0;

    function enqueue(entry) {
        downloadQueue.push(entry);
        renderQueue();
        pumpQueue();
    }

    function removeFromQueue(id) {
        const entry = downloadQueue.find(e => e.id === id);
        if (!entry) return;
        // Aborting an active download frees its slot in runEntry's finally; a waiting one has
        // no request to abort and simply leaves the queue.
        if (entry.abortController) entry.abortController.abort();
        dropEntry(entry);
    }

    function dropEntry(entry) {
        const idx = downloadQueue.indexOf(entry);
        if (idx === -1) return;
        downloadQueue.splice(idx, 1);
        renderQueue();
    }

    // Leaves a finished row on screen long enough to be read, then drops it. The slot it
    // occupied is already free by then, so a lingering row never delays the next download.
    function retireEntry(entry, lingerMs) {
        entry.status = 'finished';
        setTimeout(() => dropEntry(entry), lingerMs);
    }

    // Starts waiting entries until the concurrency limit is reached; called whenever the queue
    // or the number of running downloads changes. runEntry marks its entry active before its
    // first await, so the same entry can never be picked up twice.
    function pumpQueue() {
        while (activeDownloads < maxConcurrentDownloads) {
            const next = downloadQueue.find(e => e.status === 'waiting');
            if (!next) return;

            activeDownloads++;
            runEntry(next).finally(() => {
                activeDownloads--;
                pumpQueue();
            });
        }
    }

    async function runEntry(entry) {
        entry.status = 'active';
        entry.abortController = new AbortController();
        renderQueue();

        try {
            const response = await fetch(entry.url, { signal: entry.abortController.signal });
            if (!response.ok) {
                const httpError = new Error(`HTTP ${response.status}`);
                httpError.status = response.status;
                throw httpError;
            }
            const blob = await readStream(response.body, entry.estimatedBytes, entry);
            triggerBlobDownload(blob, entry.filename);
            updateEntryProgress(entry, 1, entry.estimatedBytes);
            retireEntry(entry, 1000);
        } catch (err) {
            // A cancelled download was already dropped by removeFromQueue; there is nothing
            // left to report and no row to keep on screen.
            if (err.name === 'AbortError') return;

            console.error('[TranscodeDownloader] Download failed:', err);
            updateEntryStatus(entry, describeFailure(entry, err));
            retireEntry(entry, 3000);
        }
    }

    // An HTTP status means the server rejected the request outright, which disproves "the
    // encoder failed to start" — so it always wins over the codec heuristic. Only a request the
    // server accepted and then failed to deliver a single byte for points at an encoder that
    // Jellyfin resolves to but FFmpeg does not actually have.
    function describeFailure(entry, err) {
        if (err && err.status) return t('DownloadFailedStatus').replace('{status}', err.status);
        if (!entry.receivedBytes && entry.videoCodec && entry.videoCodec !== DEFAULT_VIDEO_CODEC) {
            return t('DownloadFailedCodec').replace('{codec}', codecLabel(VIDEO_CODECS, entry.videoCodec));
        }
        return t('DownloadFailed');
    }

    // --- Stream reader ---

    async function readStream(body, estimatedBytes, entry) {
        const reader = body.getReader();
        const chunks = [];
        let received = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.byteLength;
            entry.receivedBytes = received;
            updateEntryProgress(entry, received / estimatedBytes, estimatedBytes, received);
        }

        // A transcode that dies on startup can still return 200 and then close the stream
        // immediately. Without this, the user gets a 0-byte .mp4 reported as a success.
        if (received === 0) throw new Error('Transcode produced no data');

        return new Blob(chunks, { type: 'video/mp4' });
    }

    // --- Queue panel UI ---

    function injectQueuePanel() {
        if (document.getElementById('qd-queue-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'qd-queue-panel';
        panel.style.cssText = 'display:none;position:fixed;bottom:16px;right:16px;background:#1a1a1a;border:1px solid #444;border-radius:6px;color:#fff;font-size:13px;min-width:320px;max-width:400px;z-index:9999;font-family:monospace;overflow:hidden;';

        const list = document.createElement('div');
        list.id = 'qd-queue-list';
        panel.appendChild(list);

        document.body.appendChild(panel);
    }

    function renderQueue() {
        const panel = document.getElementById('qd-queue-panel');
        const list = document.getElementById('qd-queue-list');
        if (!panel || !list) return;

        if (downloadQueue.length === 0) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'block';

        // Remove rows for entries that are no longer in the queue
        Array.from(list.children).forEach(row => {
            const entryId = row.dataset.entryId;
            if (!downloadQueue.find(e => e.id === entryId)) row.remove();
        });

        // Add rows for new entries and update status of existing ones
        downloadQueue.forEach((entry, i) => {
            let row = list.querySelector(`[data-entry-id="${entry.id}"]`);

            if (!row) {
                // Build the row for the first time
                row = document.createElement('div');
                row.dataset.entryId = entry.id;
                row.style.cssText = 'padding:10px 14px;border-bottom:1px solid #2a2a2a;';

                const top = document.createElement('div');
                top.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;';

                const name = document.createElement('div');
                name.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:bold;';
                name.textContent = entry.filename;

                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = '✕';
                cancelBtn.style.cssText = 'padding:2px 8px;border-radius:4px;border:1px solid #666;background:#333;color:#fff;cursor:pointer;font-size:12px;flex-shrink:0;';
                cancelBtn.addEventListener('click', () => removeFromQueue(entry.id));

                top.appendChild(name);
                top.appendChild(cancelBtn);
                row.appendChild(top);

                // Codec + bitrate, so several queued items of the same title stay distinguishable
                if (entry.codecLabel) {
                    const meta = document.createElement('div');
                    meta.style.cssText = 'font-size:11px;color:#888;margin-bottom:4px;';
                    meta.textContent = entry.codecLabel;
                    row.appendChild(meta);
                }

                // Progress bar (always created; hidden for waiting items)
                const track = document.createElement('div');
                track.className = 'qd-track';
                track.style.cssText = 'height:5px;background:#333;border-radius:3px;margin-bottom:4px;display:none;';
                const fill = document.createElement('div');
                fill.id = `qd-fill-${entry.id}`;
                fill.style.cssText = 'height:100%;width:0%;background:#00a4dc;border-radius:3px;transition:width 0.2s;';
                track.appendChild(fill);
                row.appendChild(track);

                const statusEl = document.createElement('div');
                statusEl.id = `qd-status-${entry.id}`;
                statusEl.style.cssText = 'font-size:12px;';
                row.appendChild(statusEl);

                // Insert at correct position
                const sibling = list.children[i];
                if (sibling) list.insertBefore(row, sibling);
                else list.appendChild(row);
            }

            // Update the row's appearance for its current status without touching the fill
            // width. A finished row keeps the text it ended on — its result or its error.
            const track = row.querySelector('.qd-track');
            const statusEl = row.querySelector(`#qd-status-${entry.id}`);
            if (entry.status === 'waiting') {
                if (track) track.style.display = 'none';
                if (statusEl) { statusEl.style.color = '#666'; statusEl.textContent = t('Waiting'); }
            } else {
                if (track) track.style.display = 'block';
                if (statusEl) statusEl.style.color = '#aaa';
            }
        });
    }

    function updateEntryProgress(entry, ratio, estimatedBytes, receivedBytes) {
        const fill = document.getElementById(`qd-fill-${entry.id}`);
        const statusEl = document.getElementById(`qd-status-${entry.id}`);
        if (!fill || !statusEl) return;

        const pct = Math.min(Math.round(ratio * 100), 100);
        fill.style.width = pct + '%';

        const receivedMB = receivedBytes != null ? (receivedBytes / 1_048_576).toFixed(1) : null;
        const estimatedMB = (estimatedBytes / 1_048_576).toFixed(1);
        statusEl.textContent = receivedMB != null
            ? `${receivedMB} MB / ~${estimatedMB} MB · ${pct}%`
            : `~${estimatedMB} MB · ${pct}%`;
    }

    function updateEntryStatus(entry, text) {
        const statusEl = document.getElementById(`qd-status-${entry.id}`);
        if (statusEl) statusEl.textContent = text;
    }

    function triggerBlobDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }

    // --- Item metadata ---

    function extractItemId(hash) {
        const queryStart = hash.indexOf('?');
        if (queryStart === -1) return null;
        const params = new URLSearchParams(hash.slice(queryStart));
        return params.get('id');
    }

    // Item ids are 32 hex digits; menu entries carry a command name in the same attribute
    // (`data-id="download"`), so every candidate has to be shape-checked before it is trusted.
    function isItemId(value) {
        return typeof value === 'string' && /^[0-9a-f]{32}$/i.test(value.replace(/-/g, ''));
    }

    // The item the *next* action sheet will act on, or null when the trigger carried no item.
    let contextMenuItemId = null;

    // An action sheet is not always about the item in the address bar: the episode rows of a
    // season or series page each open one for their own episode, and Jellyfin resolves that
    // item from the closest ancestor carrying data-id (shortcuts.js → getItem). Mirroring that
    // lookup keeps our entry pointed at the same item Jellyfin's own Download entry uses;
    // without it a season page downloads /Videos/{seasonId}/… and the server throws.
    function recordContextMenuTarget(event) {
        const target = event.target;
        const holder = target && typeof target.closest === 'function' ? target.closest('[data-id]') : null;
        const id = holder ? holder.getAttribute('data-id') : null;
        contextMenuItemId = isItemId(id) ? id : null;
    }

    // Consumed on injection: a sheet opened by anything we did not see (so the id would be
    // stale) falls back to the address bar, which is right for detail pages — their More button
    // has no data-id ancestor at all.
    function takeContextMenuItemId() {
        const id = contextMenuItemId;
        contextMenuItemId = null;
        return id;
    }

    function getApiClient(attempt, maxAttempts, callback, onFail) {
        if (window.ApiClient && window.ApiClient.accessToken && window.ApiClient.getCurrentUserId) {
            callback(window.ApiClient);
        } else if (attempt < maxAttempts) {
            setTimeout(() => getApiClient(attempt + 1, maxAttempts, callback, onFail), 500);
        } else {
            console.error('[TranscodeDownloader] ApiClient not available after retries');
            if (onFail) onFail();
        }
    }

    // --- Codec capabilities ---

    // Jellyfin serialises with PascalCase; tolerate camelCase so the contract survives a
    // serializer change without breaking the client.
    function readField(obj, name) {
        if (!obj) return undefined;
        if (obj[name] !== undefined) return obj[name];
        return obj[name.charAt(0).toLowerCase() + name.slice(1)];
    }

    function parseCapabilityList(list) {
        const map = {};
        (list || []).forEach((entry) => {
            const id = readField(entry, 'Codec');
            if (!id) return;
            map[String(id).toLowerCase()] = {
                encoder: readField(entry, 'Encoder') || '',
                hardware: readField(entry, 'IsHardware') === true,
                supported: readField(entry, 'IsSupported') === true,
                allowed: readField(entry, 'IsAllowedByAdmin') === true,
            };
        });
        return map;
    }

    function readStoredCodec(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (_) {
            return null;
        }
    }

    function storeCodec(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch (_) {
            // localStorage can be unavailable (private mode, sandboxed iframe) — preference
            // simply won't stick.
        }
    }

    // Why a codec cannot be used, or null when it can.
    function codecBlockReason(kind, id) {
        if (!codecCapabilities) return null;
        const capability = codecCapabilities[kind][id];
        if (!capability) return 'unsupported';
        if (!capability.allowed) return 'admin';
        if (!capability.supported) return 'unsupported';
        return null;
    }

    function codecReasonText(reason) {
        return reason === 'admin' ? t('CodecDisabledByAdmin') : t('CodecUnsupported');
    }

    function isCodecSelectable(kind, id) {
        const catalogue = kind === 'video' ? VIDEO_CODECS : AUDIO_CODECS;
        return !!findCodec(catalogue, id) && codecBlockReason(kind, id) === null;
    }

    function firstSelectableCodec(kind) {
        const catalogue = kind === 'video' ? VIDEO_CODECS : AUDIO_CODECS;
        const codec = catalogue.find(candidate => isCodecSelectable(kind, candidate.id));
        return codec ? codec.id : null;
    }

    // A stored preference is only honoured if the server still offers that codec.
    function resolveCodecPreference(kind, storageKey, fallback) {
        const stored = readStoredCodec(storageKey);
        if (stored && isCodecSelectable(kind, stored)) return stored;
        if (isCodecSelectable(kind, fallback)) return fallback;
        return firstSelectableCodec(kind) || fallback;
    }

    function selectCodec(kind, id) {
        if (kind === 'video') {
            selectedVideoCodec = id;
            storeCodec(STORAGE_VIDEO_CODEC, id);
        } else {
            selectedAudioCodec = id;
            storeCodec(STORAGE_AUDIO_CODEC, id);
        }
    }

    // Fetched lazily on first quality-sheet open. Only a *successful* probe is memoised for
    // the page session: a failed one drops the cached promise so the next sheet retries,
    // rather than hiding the picker until the tab is reloaded.
    function fetchCodecCapabilities() {
        if (codecCapabilitiesPromise) return codecCapabilitiesPromise;

        let probeFailed = false;

        const probe = new Promise((resolve) => {
            const giveUp = (err) => {
                console.warn('[TranscodeDownloader] Codec capabilities unavailable, falling back to H.264/AAC:', err);
                codecCapabilities = null;
                codecCapabilitiesResolved = false;
                selectedVideoCodec = DEFAULT_VIDEO_CODEC;
                selectedAudioCodec = DEFAULT_AUDIO_CODEC;
                probeFailed = true;
                resolve();
            };

            getApiClient(0, 10, async (client) => {
                try {
                    const baseUrl = client.serverAddress() || window.location.origin;
                    const res = await fetch(`${baseUrl}/TranscodeDownloader/Codecs?api_key=${encodeURIComponent(client.accessToken())}`);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const payload = await res.json();

                    codecCapabilities = {
                        video: parseCapabilityList(readField(payload, 'VideoCodecs')),
                        audio: parseCapabilityList(readField(payload, 'AudioCodecs')),
                    };
                    codecCapabilitiesResolved = true;
                    selectedVideoCodec = resolveCodecPreference('video', STORAGE_VIDEO_CODEC, DEFAULT_VIDEO_CODEC);
                    selectedAudioCodec = resolveCodecPreference('audio', STORAGE_AUDIO_CODEC, DEFAULT_AUDIO_CODEC);
                    resolve();
                } catch (err) {
                    giveUp(err);
                }
            }, () => giveUp(new Error('ApiClient unavailable')));
        });

        codecCapabilitiesPromise = probe;

        // Runs as a microtask, so it is ordered after the assignment above even when the
        // probe fails synchronously inside the executor.
        probe.then(() => {
            if (probeFailed && codecCapabilitiesPromise === probe) codecCapabilitiesPromise = null;
        });

        return probe;
    }

    let currentItemId = null;
    let currentItemPromise = null;

    function fetchItemMetadata(itemId) {
        return new Promise((resolve) => {
            getApiClient(0, 10, async (client) => {
                try {
                    const userId = client.getCurrentUserId();
                    resolve(await client.getItem(userId, itemId));
                } catch (err) {
                    console.error('[TranscodeDownloader] Metadata fetch failed:', err);
                    resolve(null);
                }
            }, () => resolve(null));
        });
    }

    // Prefetched for the item on screen; a sheet opened for any other item fetches its own.
    function itemMetadata(itemId) {
        if (itemId === currentItemId && currentItemPromise) return currentItemPromise;
        return fetchItemMetadata(itemId);
    }

    // A season, a series or a song has no video stream to re-encode. Jellyfin's own Download
    // entry sits next to ours in the same sheet for those items, so the sheet alone is no
    // guarantee that /Videos/{id}/stream.mp4 means anything — a season id makes the server
    // throw while it resolves media sources. An absent MediaType is treated as playable so a
    // sparse DTO never blocks a download that used to work.
    function isTranscodable(item) {
        if (!item || item.IsFolder === true) return false;
        return !item.MediaType || item.MediaType === 'Video';
    }

    function onHashChange() {
        const hash = window.location.hash;
        if (!hash.startsWith('#/details')) return;

        const itemId = extractItemId(hash);
        if (!itemId) return;

        currentItemId = itemId;
        currentItemPromise = fetchItemMetadata(itemId);
    }

    // --- Action sheet menu injection ---

    function makeMenuItem(icon, label, onClick) {
        const btn = document.createElement('button');
        btn.setAttribute('is', 'emby-button');
        btn.setAttribute('type', 'button');
        btn.className = 'listItem listItem-button actionSheetMenuItem emby-button';
        btn.setAttribute('data-id', 'qd-' + label.replace(/\s+/g, '-').toLowerCase());

        const iconSpan = document.createElement('span');
        iconSpan.className = `actionsheetMenuItemIcon listItemIcon listItemIcon-transparent material-icons ${icon}`;
        iconSpan.setAttribute('aria-hidden', 'true');

        const body = document.createElement('div');
        body.className = 'listItemBody actionsheetListItemBody';
        const text = document.createElement('div');
        text.className = 'listItemBodyText actionSheetItemText';
        text.textContent = label;
        body.appendChild(text);

        btn.appendChild(iconSpan);
        btn.appendChild(body);
        btn.addEventListener('click', onClick);
        return btn;
    }

    function injectMenuItems(downloadBtn) {
        if (downloadBtn.parentNode.querySelector('[data-id^="qd-"]')) return;

        // Bound now, while the sheet's trigger is still known — by the time the entry is
        // clicked the click target is the entry itself.
        const itemId = takeContextMenuItemId() || extractItemId(window.location.hash);
        if (!itemId) return;

        const transcodeBtn = makeMenuItem('video_settings', t('DownloadTranscode'), () => {
            closeActiveSheet();
            showQualitySheet(itemId);
        });

        downloadBtn.insertAdjacentElement('afterend', transcodeBtn);
    }

    function closeActiveSheet() {
        const backdrop = document.querySelector('.actionSheetScrim, .dialogBackdrop, .mdl-overlay');
        if (backdrop) backdrop.click();
    }

    // --- Codec selector ---

    function makeCodecChip(kind, codec, onSelect) {
        const reason = codecBlockReason(kind, codec.id);
        const selected = (kind === 'video' ? selectedVideoCodec : selectedAudioCodec) === codec.id;

        const chip = document.createElement('button');
        chip.type = 'button';
        chip.setAttribute('data-id', `qd-codec-${kind}-${codec.id}`);
        chip.textContent = codec.label;
        chip.style.cssText = 'padding:6px 14px;border-radius:16px;font-size:13px;font-family:inherit;color:#fff;'
            + `border:1px solid ${selected ? '#00a4dc' : '#444'};`
            + `background:${selected ? 'rgba(0,164,220,0.2)' : 'transparent'};`
            + (reason ? 'opacity:0.4;cursor:not-allowed;' : 'cursor:pointer;');

        if (reason) {
            chip.disabled = true;
            chip.title = codecReasonText(reason);
        } else {
            chip.setAttribute('aria-pressed', selected ? 'true' : 'false');
            chip.addEventListener('click', () => onSelect(codec.id));
        }

        return chip;
    }

    function buildCodecRow(catalogue, kind, label, onSelect) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'margin-bottom:10px;';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:13px;font-weight:600;color:#fff;opacity:0.7;margin-bottom:6px;';
        title.textContent = label;
        wrap.appendChild(title);

        const chips = document.createElement('div');
        chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';
        catalogue.forEach(codec => chips.appendChild(makeCodecChip(kind, codec, onSelect)));
        wrap.appendChild(chips);

        // Unavailable codecs stay visible with the reason spelled out — a silent absence is
        // impossible for a user to self-diagnose.
        catalogue.forEach((codec) => {
            const reason = codecBlockReason(kind, codec.id);
            if (!reason) return;
            const note = document.createElement('div');
            note.style.cssText = 'font-size:12px;color:#888;margin-top:6px;';
            note.textContent = `${codec.label} — ${codecReasonText(reason)}`;
            wrap.appendChild(note);
        });

        return wrap;
    }

    // Warn when the selected codec resolves to a software encoder. x264 is the status quo and
    // fast enough; libx265 and especially libsvtav1 can run for hours, and the whole file is
    // held in memory until the transcode finishes.
    function buildSoftwareEncodingHint() {
        if (!codecCapabilities || selectedVideoCodec === DEFAULT_VIDEO_CODEC) return null;
        const capability = codecCapabilities.video[selectedVideoCodec];
        if (!capability || capability.hardware) return null;

        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:12px;color:#d0a24c;margin-top:2px;';
        hint.textContent = t('SoftwareEncodingHint');
        return hint;
    }

    function buildCodecSection(onCodecChange) {
        const section = document.createElement('div');
        section.style.cssText = 'padding:8px 20px 4px;';

        const render = () => {
            section.textContent = '';
            const onSelect = (kind) => (id) => {
                selectCodec(kind, id);
                render();
                onCodecChange();
            };
            section.appendChild(buildCodecRow(VIDEO_CODECS, 'video', t('ChooseVideoCodec'), onSelect('video')));
            section.appendChild(buildCodecRow(AUDIO_CODECS, 'audio', t('ChooseAudioCodec'), onSelect('audio')));
            const hint = buildSoftwareEncodingHint();
            if (hint) section.appendChild(hint);
        };

        render();
        return section;
    }

    // --- Quality overlay ---

    async function showQualitySheet(itemId) {
        if (document.getElementById('qd-quality-sheet')) return;

        // Ensure strings are loaded before rendering UI
        if (stringsPromise) await stringsPromise;

        const metadataPromise = itemMetadata(itemId);

        // Runs alongside the metadata fetch; memoised for the rest of the page session.
        const capabilitiesPromise = fetchCodecCapabilities();
        // Re-read on every open, so an administrator raising the download limit reaches users
        // without a client reload.
        const settingsPromise = fetchServerSettings();

        const scrim = document.createElement('div');
        scrim.id = 'qd-quality-sheet';
        scrim.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.5);';
        scrim.addEventListener('click', (e) => { if (e.target === scrim) scrim.remove(); });

        const sheet = document.createElement('div');
        sheet.style.cssText = 'background:#1a1a1a;border-radius:12px 12px 0 0;width:100%;max-width:600px;max-height:80vh;overflow-y:auto;padding:8px 0 24px;';

        const header = document.createElement('div');
        header.style.cssText = 'padding:16px 20px 8px;font-size:15px;font-weight:600;color:#fff;opacity:0.7;';
        header.textContent = t('ChooseQuality');
        sheet.appendChild(header);

        const loadingEl = document.createElement('div');
        loadingEl.style.cssText = 'padding:16px 20px;color:#aaa;font-size:14px;';
        loadingEl.textContent = t('LoadingMediaInfo');
        sheet.appendChild(loadingEl);

        scrim.appendChild(sheet);
        document.body.appendChild(scrim);

        const item = await metadataPromise;
        await capabilitiesPromise;
        await settingsPromise;
        if (!document.getElementById('qd-quality-sheet')) return;

        loadingEl.remove();

        // A sheet can be opened for an item with nothing to transcode (a season, a series);
        // saying so beats firing a request the server can only fail. A metadata fetch that
        // failed outright is reported as "no options" instead of a wrong claim about the type.
        if (!isTranscodable(item)) {
            const notice = document.createElement('div');
            notice.style.cssText = 'padding:16px 20px;color:#aaa;font-size:14px;';
            notice.textContent = item ? t('ItemNotTranscodable') : t('NoTranscodeOptions');
            sheet.appendChild(notice);
            return;
        }

        const source = item && item.MediaSources && item.MediaSources[0];
        // Filtered on the H.264-calibrated base bitrate so the set of rungs on offer stays
        // stable when the codec changes — only their encoder targets move.
        const tiers = source && source.Bitrate
            ? QUALITY_TIERS.filter(tier => tier.bitrate < source.Bitrate)
            : QUALITY_TIERS;

        const tierList = document.createElement('div');

        const renderTiers = () => {
            tierList.textContent = '';
            const factor = videoCodecFactor(selectedVideoCodec);

            for (const tier of tiers) {
                const bitrate = scaleBitrate(tier.bitrate, factor);
                const btn = makeMenuItem('video_settings', `${tier.resolution} · ${formatBitrate(bitrate)}`, () => {
                    scrim.remove();
                    onTranscodeMenuClick(bitrate, item.Id || itemId, item);
                });
                tierList.appendChild(btn);
            }

            if (tiers.length === 0) {
                const empty = document.createElement('div');
                empty.style.cssText = 'padding:16px 20px;color:#aaa;font-size:14px;';
                empty.textContent = t('NoTranscodeOptions');
                tierList.appendChild(empty);
            }
        };

        // Only offered when the server told us what it can encode; otherwise the flow stays
        // exactly as it was, on H.264/AAC.
        if (codecCapabilitiesResolved) {
            sheet.insertBefore(buildCodecSection(renderTiers), header);
        }

        renderTiers();
        sheet.appendChild(tierList);
    }

    // --- Download actions ---

    function onTranscodeMenuClick(bitrate, itemId, item) {
        if (!item) return;
        // Captured now: the sheet is gone, but the selection must not drift before the
        // ApiClient callback runs.
        const videoCodec = selectedVideoCodec;
        const audioCodec = selectedAudioCodec;
        getApiClient(0, 5, (client) => {
            const token = client.accessToken();
            const baseUrl = client.serverAddress() || window.location.origin;
            addToQueue(baseUrl, itemId, token, bitrate, item, videoCodec, audioCodec);
        });
    }

    function addToQueue(baseUrl, itemId, token, selectedBitrate, item, videoCodec, audioCodec) {
        const mediaSourceId = item.MediaSources && item.MediaSources[0] && item.MediaSources[0].Id
            ? item.MediaSources[0].Id
            : itemId;
        // A single codec is sent deliberately: a comma-separated list lets the server silently
        // downgrade while the UI still claims the codec the user picked.
        const url = `${baseUrl}/Videos/${itemId}/stream.mp4?MediaSourceId=${mediaSourceId}&VideoBitrate=${selectedBitrate}&VideoCodec=${videoCodec}&AudioCodec=${audioCodec}&MaxAudioChannels=2&allowVideoStreamCopy=false&allowAudioStreamCopy=false&Static=false&api_key=${token}`;

        const videoTag = codecTag(VIDEO_CODECS, videoCodec);
        const audioTag = codecTag(AUDIO_CODECS, audioCodec);
        const suffix = ` [${videoTag} ${formatBitrate(selectedBitrate).replace(' ', '')} ${audioTag}]`;

        const pad = (n) => String(n).padStart(2, '0');
        let filename;
        if (item.Type === 'Movie') {
            filename = `${item.Name} (${item.ProductionYear})${suffix}.mp4`;
        } else if (item.Type === 'Episode') {
            filename = `${item.SeriesName} S${pad(item.ParentIndexNumber)}E${pad(item.IndexNumber)} - ${item.Name}${suffix}.mp4`;
        } else {
            filename = `download${suffix}.mp4`;
        }

        const durationSeconds = item.RunTimeTicks / 10_000_000;
        const estimatedBytes = (selectedBitrate * durationSeconds) / 8;

        enqueue({
            id: `${itemId}-${nextEntrySequence++}`,
            filename,
            estimatedBytes,
            url,
            videoCodec,
            audioCodec,
            codecLabel: `${videoTag} · ${formatBitrate(selectedBitrate)} · ${audioTag}`,
            receivedBytes: 0,
            abortController: null,
            status: 'waiting',
        });
    }

    // Capture phase, so the trigger is recorded before Jellyfin's own handler opens the sheet.
    document.addEventListener('click', recordContextMenuTarget, true);
    document.addEventListener('contextmenu', recordContextMenuTarget, true);

    const _menuObserver = new MutationObserver(() => {
        const downloadBtn = document.querySelector('.actionSheetMenuItem[data-id="download"]');
        if (downloadBtn) injectMenuItems(downloadBtn);
    });
    _menuObserver.observe(document.body, { childList: true, subtree: true });

    console.log('[TranscodeDownloader] plugin loaded');
    window.addEventListener('hashchange', onHashChange);

    if (window.location.hash.startsWith('#/details')) {
        onHashChange();
    }

    injectQueuePanel();
    initStrings();

    // Re-fetch strings whenever Jellyfin changes the UI language (updates document.documentElement.lang).
    new MutationObserver(() => {
        const locale = document.documentElement.lang;
        if (!locale) return;
        fetchStrings(locale).then(result => {
            if (result) {
                loadedStrings = result.strings;
                console.log('[TranscodeDownloader] strings reloaded for locale:', locale);
            }
        }).catch(() => {});
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
})();
