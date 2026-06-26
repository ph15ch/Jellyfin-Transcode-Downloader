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

    function findContainer() {
        return (
            document.querySelector('.mainDetailButtons') ||
            document.querySelector('.detailButtons') ||
            document.querySelector('[class*="detailButton"]')
        );
    }

    let _containerObserver = null;

    function waitForContainer(callback) {
        const container = findContainer();
        if (container) { callback(container); return; }

        if (_containerObserver) _containerObserver.disconnect();
        _containerObserver = new MutationObserver(() => {
            const c = findContainer();
            if (c) {
                _containerObserver.disconnect();
                _containerObserver = null;
                callback(c);
            }
        });
        _containerObserver.observe(document.body, { childList: true, subtree: true });
    }

    function ensureUiInjected() {
        if (document.getElementById('qd-download-wrap')) return;

        waitForContainer((container) => {
            if (document.getElementById('qd-download-wrap')) return;

        const wrap = document.createElement('div');
        wrap.id = 'qd-download-wrap';
        wrap.style.cssText = 'display:flex;flex-direction:row;align-items:center;gap:8px;margin-top:8px;';

        const select = document.createElement('select');
        select.id = 'qd-quality-select';
        select.style.cssText = 'padding:6px 8px;border-radius:4px;border:1px solid #555;background:#222;color:#fff;font-size:14px;';

        const btn = document.createElement('button');
        btn.id = 'qd-download-btn';
        btn.textContent = 'Download';
        btn.style.cssText = 'padding:6px 14px;border-radius:4px;border:none;background:#00a4dc;color:#fff;font-size:14px;cursor:pointer;';
        btn.addEventListener('click', () => startDownload());

        wrap.appendChild(select);
        wrap.appendChild(btn);
        container.appendChild(wrap);

        // If metadata already arrived before the UI was ready, populate now
        if (currentItem) populateDropdown(currentItem);
        }); // waitForContainer
    }

    function populateDropdown(item) {
        currentItem = item;

        const select = document.getElementById('qd-quality-select');
        if (!select) return;

        select.innerHTML = '';

        const source = item.MediaSources && item.MediaSources[0];

        const originalLabel = source
            ? `Original · ${(source.Container || 'unknown').toUpperCase()} · ${Math.round((source.Bitrate || 0) / 1_000_000)} Mbps`
            : 'Original';

        const originalOpt = document.createElement('option');
        originalOpt.value = '0';
        originalOpt.textContent = originalLabel;
        select.appendChild(originalOpt);

        if (source && source.Bitrate) {
            for (const tier of QUALITY_TIERS) {
                if (tier.bitrate < source.Bitrate) {
                    const opt = document.createElement('option');
                    opt.value = JSON.stringify({ bitrate: tier.bitrate, maxHeight: tier.maxHeight });
                    opt.textContent = tier.label;
                    select.appendChild(opt);
                }
            }
        }
    }

    function showDropdownError() {
        const select = document.getElementById('qd-quality-select');
        if (!select) return;
        select.innerHTML = '';
        const opt = document.createElement('option');
        opt.textContent = 'Error';
        select.appendChild(opt);
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

                // Guard against stale response arriving after user navigated away
                if (itemId !== currentItemId) return;

                populateDropdown(item);
            } catch (err) {
                console.error('[QuickDownload] Metadata fetch failed:', err);
                if (itemId === currentItemId) showDropdownError();
            }
        });
    }

    function onHashChange() {
        const hash = window.location.hash;
        if (!hash.startsWith('#/details')) {
            if (_containerObserver) { _containerObserver.disconnect(); _containerObserver = null; }
            return;
        }

        const itemId = extractItemId(hash);
        if (!itemId) return;

        if (currentItemId !== itemId) {
            currentItem = null;
            // Remove stale UI so it gets re-injected in the new view
            const stale = document.getElementById('qd-download-wrap');
            if (stale) stale.remove();
        }
        currentItemId = itemId;
        ensureUiInjected();
        fetchItemMetadata(itemId);
    }

    function startDownload() {
        if (isDownloading) {
            return;
        }
        const select = document.getElementById('qd-quality-select');
        const item = currentItem;
        if (!item) return;

        getApiClient(0, 5, (client) => {
            const token = client.accessToken();
            const itemId = currentItemId;
            const baseUrl = client.serverAddress() || window.location.origin;

            if (select.value === '0') {
                startOriginalDownload(baseUrl, itemId, token);
            } else {
                const { bitrate, maxHeight } = JSON.parse(select.value);
                startTranscodeDownload(baseUrl, itemId, token, bitrate, maxHeight, item);
            }
        });
    }

    function startOriginalDownload(baseUrl, itemId, token) {
        const url = `${baseUrl}/Items/${itemId}/Download?api_key=${token}`;
        showStatusBar('Downloading original…');
        setStatusText('Browser download manager will handle this.');
        const a = document.createElement('a');
        a.href = url;
        a.download = '';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(hideStatusBar, 3000);
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
                if (err.name === 'AbortError') {
                    // user cancelled — already cleaned up in cancelDownload()
                } else {
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
        if (currentAbortController) {
            currentAbortController.abort();
        }
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

    // Handle the case where the page loads directly on a detail route
    if (window.location.hash.startsWith('#/details')) {
        onHashChange();
    }

    injectStatusBar();
})();
