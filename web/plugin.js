(() => {
    const QUALITY_TIERS = [
        { label: '2160p · 120 Mbps', bitrate: 120_000_000, maxHeight: 2160 },
        { label: '2160p · 80 Mbps',  bitrate:  80_000_000, maxHeight: 2160 },
        { label: '2160p · 60 Mbps',  bitrate:  60_000_000, maxHeight: 2160 },
        { label: '2160p · 40 Mbps',  bitrate:  40_000_000, maxHeight: 2160 },
        { label: '2160p · 20 Mbps',  bitrate:  20_000_000, maxHeight: 2160 },
        { label: '1440p · 15 Mbps',  bitrate:  15_000_000, maxHeight: 1440 },
        { label: '1440p · 10 Mbps',  bitrate:  10_000_000, maxHeight: 1440 },
        { label: '1080p · 8 Mbps',   bitrate:   8_000_000, maxHeight: 1080 },
        { label: '1080p · 6 Mbps',   bitrate:   6_000_000, maxHeight: 1080 },
        { label: '720p · 4 Mbps',    bitrate:   4_000_000, maxHeight:  720 },
        { label: '720p · 3 Mbps',    bitrate:   3_000_000, maxHeight:  720 },
        { label: '720p · 1.5 Mbps',  bitrate:   1_500_000, maxHeight:  720 },
        { label: '480p · 720 kbps',  bitrate:     720_000, maxHeight:  480 },
        { label: '360p · 420 kbps',  bitrate:     420_000, maxHeight:  360 },
    ];

    let currentItemId = null;
    let currentItem = null;
    let currentItemPromise = null;

    // --- Download queue ---
    // Each entry: { id, filename, estimatedBytes, url, abortController, status: 'waiting'|'active' }
    const downloadQueue = [];
    let queueProcessing = false;

    function enqueue(entry) {
        downloadQueue.push(entry);
        renderQueue();
        if (!queueProcessing) processQueue();
    }

    function removeFromQueue(id) {
        const idx = downloadQueue.findIndex(e => e.id === id);
        if (idx === -1) return;
        const entry = downloadQueue[idx];
        if (entry.status === 'active' && entry.abortController) {
            entry.abortController.abort();
        }
        downloadQueue.splice(idx, 1);
        renderQueue();
        // If we cancelled the active item, processQueue will be called by the fetch .finally
    }

    async function processQueue() {
        if (queueProcessing) return;
        if (downloadQueue.length === 0) return;

        queueProcessing = true;
        while (downloadQueue.length > 0) {
            const entry = downloadQueue[0];
            entry.status = 'active';
            entry.abortController = new AbortController();
            renderQueue();

            try {
                const response = await fetch(entry.url, { signal: entry.abortController.signal });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const blob = await readStream(response.body, entry.estimatedBytes, entry);
                triggerBlobDownload(blob, entry.filename);
                updateEntryProgress(entry, 1, entry.estimatedBytes);
                await new Promise(r => setTimeout(r, 1000));
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('[TranscodeDownloader] Download failed:', err);
                    updateEntryStatus(entry, 'Download failed.');
                    await new Promise(r => setTimeout(r, 3000));
                }
            }

            // Remove this entry (whether done, failed, or aborted)
            const idx = downloadQueue.indexOf(entry);
            if (idx !== -1) downloadQueue.splice(idx, 1);
            renderQueue();
        }
        queueProcessing = false;
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
            updateEntryProgress(entry, received / estimatedBytes, estimatedBytes, received);
        }

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
        list.innerHTML = '';

        downloadQueue.forEach(entry => {
            const row = document.createElement('div');
            row.id = `qd-entry-${entry.id}`;
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

            if (entry.status === 'active') {
                const track = document.createElement('div');
                track.style.cssText = 'height:5px;background:#333;border-radius:3px;margin-bottom:4px;';
                const fill = document.createElement('div');
                fill.id = `qd-fill-${entry.id}`;
                fill.style.cssText = 'height:100%;width:0%;background:#00a4dc;border-radius:3px;transition:width 0.2s;';
                track.appendChild(fill);
                row.appendChild(track);

                const status = document.createElement('div');
                status.id = `qd-status-${entry.id}`;
                status.style.cssText = 'color:#aaa;font-size:12px;';
                row.appendChild(status);
            } else {
                const waiting = document.createElement('div');
                waiting.style.cssText = 'color:#666;font-size:12px;';
                waiting.textContent = 'Waiting…';
                row.appendChild(waiting);
            }

            list.appendChild(row);
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

    function getApiClient(attempt, maxAttempts, callback) {
        if (window.ApiClient && window.ApiClient.accessToken && window.ApiClient.getCurrentUserId) {
            callback(window.ApiClient);
        } else if (attempt < maxAttempts) {
            setTimeout(() => getApiClient(attempt + 1, maxAttempts, callback), 500);
        } else {
            console.error('[TranscodeDownloader] ApiClient not available after retries');
        }
    }

    function fetchItemMetadata(itemId) {
        currentItemPromise = new Promise((resolve) => {
            getApiClient(0, 10, async (client) => {
                try {
                    const userId = client.getCurrentUserId();
                    const item = await client.getItem(userId, itemId);
                    if (itemId === currentItemId) currentItem = item;
                    resolve(item);
                } catch (err) {
                    console.error('[TranscodeDownloader] Metadata fetch failed:', err);
                    resolve(null);
                }
            });
        });
    }

    function onHashChange() {
        const hash = window.location.hash;
        if (!hash.startsWith('#/details')) return;

        const itemId = extractItemId(hash);
        if (!itemId) return;

        if (currentItemId !== itemId) {
            currentItem = null;
            currentItemPromise = null;
        }
        currentItemId = itemId;
        fetchItemMetadata(itemId);
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

        const transcodeBtn = makeMenuItem('video_settings', 'Download (Transcode…)', () => {
            closeActiveSheet();
            showQualitySheet();
        });

        downloadBtn.insertAdjacentElement('afterend', transcodeBtn);
    }

    function closeActiveSheet() {
        const backdrop = document.querySelector('.actionSheetScrim, .dialogBackdrop, .mdl-overlay');
        if (backdrop) backdrop.click();
    }

    const _menuObserver = new MutationObserver(() => {
        const downloadBtn = document.querySelector('.actionSheetMenuItem[data-id="download"]');
        if (downloadBtn) injectMenuItems(downloadBtn);
    });
    _menuObserver.observe(document.body, { childList: true, subtree: true });

    // --- Quality overlay ---

    async function showQualitySheet() {
        if (document.getElementById('qd-quality-sheet')) return;

        const liveItemId = extractItemId(window.location.hash);
        if (liveItemId && liveItemId !== currentItemId) {
            currentItem = null;
            currentItemPromise = null;
            currentItemId = liveItemId;
            fetchItemMetadata(liveItemId);
        }

        const scrim = document.createElement('div');
        scrim.id = 'qd-quality-sheet';
        scrim.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.5);';
        scrim.addEventListener('click', (e) => { if (e.target === scrim) scrim.remove(); });

        const sheet = document.createElement('div');
        sheet.style.cssText = 'background:#1a1a1a;border-radius:12px 12px 0 0;width:100%;max-width:600px;max-height:80vh;overflow-y:auto;padding:8px 0 24px;';

        const header = document.createElement('div');
        header.style.cssText = 'padding:16px 20px 8px;font-size:15px;font-weight:600;color:#fff;opacity:0.7;';
        header.textContent = 'Qualität wählen';
        sheet.appendChild(header);

        const loadingEl = document.createElement('div');
        loadingEl.style.cssText = 'padding:16px 20px;color:#aaa;font-size:14px;';
        loadingEl.textContent = 'Lade Medieninfos…';
        sheet.appendChild(loadingEl);

        scrim.appendChild(sheet);
        document.body.appendChild(scrim);

        const item = currentItem || (currentItemPromise ? await currentItemPromise : null);
        if (!document.getElementById('qd-quality-sheet')) return;

        loadingEl.remove();

        const source = item && item.MediaSources && item.MediaSources[0];
        const tiers = source && source.Bitrate
            ? QUALITY_TIERS.filter(t => t.bitrate < source.Bitrate)
            : QUALITY_TIERS;

        for (const tier of tiers) {
            const btn = makeMenuItem('video_settings', tier.label, () => {
                scrim.remove();
                onTranscodeMenuClick(tier.bitrate, tier.maxHeight);
            });
            sheet.appendChild(btn);
        }

        if (tiers.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:16px 20px;color:#aaa;font-size:14px;';
            empty.textContent = 'Keine Transcode-Optionen verfügbar.';
            sheet.appendChild(empty);
        }
    }

    // --- Download actions ---

    function onTranscodeMenuClick(bitrate, maxHeight) {
        if (!currentItem) return;
        getApiClient(0, 5, (client) => {
            const token = client.accessToken();
            const baseUrl = client.serverAddress() || window.location.origin;
            addToQueue(baseUrl, currentItemId, token, bitrate, maxHeight, currentItem);
        });
    }

    function addToQueue(baseUrl, itemId, token, selectedBitrate, maxHeight, item) {
        const url = `${baseUrl}/Videos/${itemId}/stream.mp4?MaxStreamingBitrate=${selectedBitrate}&MaxHeight=${maxHeight}&VideoCodec=h264&AudioCodec=aac&MaxAudioChannels=2&allowVideoStreamCopy=false&allowAudioStreamCopy=false&Static=false&api_key=${token}`;

        const pad = (n) => String(n).padStart(2, '0');
        let filename;
        if (item.Type === 'Movie') {
            filename = `${item.Name} (${item.ProductionYear}).mp4`;
        } else if (item.Type === 'Episode') {
            filename = `${item.SeriesName} S${pad(item.ParentIndexNumber)}E${pad(item.IndexNumber)} - ${item.Name}.mp4`;
        } else {
            filename = 'download.mp4';
        }

        const durationSeconds = item.RunTimeTicks / 10_000_000;
        const estimatedBytes = (selectedBitrate * durationSeconds) / 8;

        enqueue({
            id: `${itemId}-${Date.now()}`,
            filename,
            estimatedBytes,
            url,
            abortController: null,
            status: 'waiting',
        });
    }

    console.log('[TranscodeDownloader] plugin loaded');
    window.addEventListener('hashchange', onHashChange);

    if (window.location.hash.startsWith('#/details')) {
        onHashChange();
    }

    injectQueuePanel();
})();
