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
    let isDownloading = false;
    let currentAbortController = null;
    let currentItem = null;

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
            console.error('[QuickDownload] ApiClient not available after retries');
        }
    }

    async function fetchItemMetadata(itemId) {
        getApiClient(0, 5, async (client) => {
            try {
                const userId = client.getCurrentUserId();
                const item = await client.getItem(userId, itemId);
                if (itemId !== currentItemId) return;
                currentItem = item;
            } catch (err) {
                console.error('[QuickDownload] Metadata fetch failed:', err);
            }
        });
    }

    function onHashChange() {
        const hash = window.location.hash;
        if (!hash.startsWith('#/details')) return;

        const itemId = extractItemId(hash);
        if (!itemId) return;

        if (currentItemId !== itemId) {
            currentItem = null;
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
        // Jellyfin closes the sheet when any item is clicked via its own listener;
        // nudge it in case our synthetic handler fires before theirs.
        const backdrop = document.querySelector('.actionSheetScrim, .dialogBackdrop, .mdl-overlay');
        if (backdrop) backdrop.click();
    }

    // Watch for Jellyfin's "mehr" menu opening
    const _menuObserver = new MutationObserver(() => {
        const downloadBtn = document.querySelector('.actionSheetMenuItem[data-id="download"]');
        if (downloadBtn) injectMenuItems(downloadBtn);
    });
    _menuObserver.observe(document.body, { childList: true, subtree: true });

    // --- Quality overlay ---

    function showQualitySheet() {
        if (document.getElementById('qd-quality-sheet')) return;

        const item = currentItem;
        const source = item && item.MediaSources && item.MediaSources[0];

        const tiers = source && source.Bitrate
            ? QUALITY_TIERS.filter(t => t.bitrate < source.Bitrate)
            : QUALITY_TIERS;

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

        scrim.appendChild(sheet);
        document.body.appendChild(scrim);
    }

    // --- Download actions ---

    function onTranscodeMenuClick(bitrate, maxHeight) {
        if (!currentItem) return;
        getApiClient(0, 5, (client) => {
            const token = client.accessToken();
            const baseUrl = client.serverAddress() || window.location.origin;
            startTranscodeDownload(baseUrl, currentItemId, token, bitrate, maxHeight, currentItem);
        });
    }

    function startTranscodeDownload(baseUrl, itemId, token, selectedBitrate, maxHeight, item) {
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

        isDownloading = true;
        currentAbortController = new AbortController();
        showStatusBar(filename);

        fetch(url, { signal: currentAbortController.signal })
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return readStream(response.body, estimatedBytes);
            })
            .then(blob => {
                triggerBlobDownload(blob, filename);
                updateProgress(1, estimatedBytes);
                setTimeout(hideStatusBar, 1000);
            })
            .catch(err => {
                if (err.name !== 'AbortError') {
                    console.error('[QuickDownload] Download failed:', err);
                    setStatusText('Download failed.');
                    setTimeout(hideStatusBar, 3000);
                }
            })
            .finally(() => {
                isDownloading = false;
                currentAbortController = null;
            });
    }

    async function readStream(body, estimatedBytes) {
        const reader = body.getReader();
        const chunks = [];
        let received = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.byteLength;
            updateProgress(received / estimatedBytes, estimatedBytes, received);
        }

        return new Blob(chunks, { type: 'video/mp4' });
    }

    function updateProgress(ratio, estimatedBytes, receivedBytes) {
        const pct = Math.min(Math.round(ratio * 100), 100);
        const fill = document.getElementById('qd-status-bar-fill');
        if (fill) fill.style.width = pct + '%';

        const receivedMB = receivedBytes != null ? (receivedBytes / 1_048_576).toFixed(1) : null;
        const estimatedMB = (estimatedBytes / 1_048_576).toFixed(1);
        const text = receivedMB != null
            ? `${receivedMB} MB / ~${estimatedMB} MB · ${pct}%`
            : `~${estimatedMB} MB · ${pct}%`;
        setStatusText(text);
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

    function showStatusBar(filename) {
        const bar = document.getElementById('qd-status-bar');
        if (!bar) return;
        document.getElementById('qd-status-filename').textContent = filename;
        document.getElementById('qd-status-bar-fill').style.width = '0%';
        setStatusText('');
        bar.style.display = 'block';
    }

    function hideStatusBar() {
        const bar = document.getElementById('qd-status-bar');
        if (bar) bar.style.display = 'none';
    }

    function setStatusText(text) {
        const el = document.getElementById('qd-status-text');
        if (el) el.textContent = text;
    }

    function cancelDownload() {
        if (currentAbortController) currentAbortController.abort();
        isDownloading = false;
        currentAbortController = null;
        hideStatusBar();
    }

    function injectStatusBar() {
        if (document.getElementById('qd-status-bar')) return;

        const bar = document.createElement('div');
        bar.id = 'qd-status-bar';
        bar.style.cssText = 'display:none;position:fixed;bottom:16px;right:16px;background:#1a1a1a;border:1px solid #444;border-radius:6px;padding:12px 16px;color:#fff;font-size:13px;min-width:300px;z-index:9999;font-family:monospace;';

        bar.innerHTML = `
        <div id="qd-status-filename" style="margin-bottom:6px;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px;"></div>
        <div id="qd-status-bar-track" style="height:6px;background:#333;border-radius:3px;margin-bottom:6px;">
            <div id="qd-status-bar-fill" style="height:100%;width:0%;background:#00a4dc;border-radius:3px;transition:width 0.2s;"></div>
        </div>
        <div id="qd-status-text" style="margin-bottom:8px;"></div>
        <button id="qd-cancel-btn" style="padding:4px 10px;border-radius:4px;border:1px solid #666;background:#333;color:#fff;cursor:pointer;font-size:12px;">✕ Cancel</button>
    `;

        document.body.appendChild(bar);
        document.getElementById('qd-cancel-btn').addEventListener('click', cancelDownload);
    }

    console.log('[QuickDownload] plugin loaded');
    window.addEventListener('hashchange', onHashChange);

    if (window.location.hash.startsWith('#/details')) {
        onHashChange();
    }

    injectStatusBar();
})();
