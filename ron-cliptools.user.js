// ==UserScript==
// @name         RON ClipTools
// @namespace    https://ron.cool/userscripts
// @version      5.0.0
// @description  RON ClipTools for BuildNow.GG - rolling clips, screenshots and Save As downloads
// @author       Ron
// @homepageURL  https://crypticfn2012-jpg.github.io/ron-violent-monkey-scripts/
// @supportURL   https://github.com/crypticfn2012-jpg/ron-violent-monkey-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-cliptools.user.js
// @updateURL    https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-cliptools.user.js
// @match        *://buildnow.gg/*
// @match        *://*.buildnow.gg/*
// @match        *://buildnow-gg.game-files.crazygames.com/*
// @run-at       document-end
// @grant        GM_download
// ==/UserScript==

(function () {
    'use strict';

    const ID = 'ron-cliptools';
    if (document.getElementById(ID)) return;

    const CLIPS_WEBSITE = 'https://ron.cool/clips';
    const CHUNK_MS = 250;
    const MAX_BUFFER_SECONDS = 125;

    const state = {
        buffering: false,
        recorder: null,
        stream: null,
        chunks: [],
        chunkTimes: [],
        startedAt: 0,
        stopping: false
    };

    const settings = {
        screenshot: localStorage.getItem('ronClipToolsScreenshotKey') || 'F8',
        clip: localStorage.getItem('ronClipToolsRecordKey') || 'F9',
        panel: localStorage.getItem('ronClipToolsPanelKey') || 'F7',
        duration: Number(localStorage.getItem('ronClipToolsDuration')) || 15
    };

    const root = document.createElement('div');
    root.id = ID;
    root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    const shadow = root.attachShadow ? root.attachShadow({ mode: 'open' }) : root;

    function saveSettings() {
        localStorage.setItem('ronClipToolsScreenshotKey', settings.screenshot);
        localStorage.setItem('ronClipToolsRecordKey', settings.clip);
        localStorage.setItem('ronClipToolsPanelKey', settings.panel);
        localStorage.setItem('ronClipToolsDuration', String(settings.duration));
    }

    function fileTime() {
        const d = new Date();
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
    }

    function setStatus(text) {
        const e = shadow.querySelector('#status');
        if (e) e.textContent = text;
    }

    function escapeHTML(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function getGameCanvas() {
        const canvases = Array.from(document.querySelectorAll('canvas'));
        canvases.sort((a, b) => (b.width * b.height) - (a.width * a.height));
        return canvases[0] || null;
    }

    function downloadBlob(blob, name) {
        if (!blob || !blob.size) {
            setStatus('Nothing to save');
            return;
        }

        const url = URL.createObjectURL(blob);
        let usedGM = false;

        try {
            if (typeof GM_download === 'function') {
                usedGM = true;
                GM_download({
                    url,
                    name,
                    saveAs: true,
                    onload: () => {
                        setStatus(`Saved ${name}`);
                        setTimeout(() => URL.revokeObjectURL(url), 3000);
                    },
                    onerror: error => {
                        console.warn('[RON ClipTools] GM_download failed:', error);
                        setStatus('Save dialog failed - using browser download');
                        fallbackDownload(url, name);
                    },
                    ontimeout: () => {
                        setStatus('Save dialog timed out - using browser download');
                        fallbackDownload(url, name);
                    }
                });
            }
        } catch (error) {
            console.warn('[RON ClipTools] GM_download unavailable:', error);
            usedGM = false;
        }

        if (!usedGM) fallbackDownload(url, name);
    }

    function fallbackDownload(url, name) {
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 15000);
        setStatus(`Downloaded ${name}`);
    }

    function screenshot() {
        const canvas = getGameCanvas();
        if (!canvas) {
            setStatus('No game canvas found');
            return;
        }

        try {
            canvas.toBlob(blob => {
                if (!blob) {
                    setStatus('Screenshot failed');
                    return;
                }
                downloadBlob(blob, `RON-Screenshot-${fileTime()}.png`);
            }, 'image/png');
        } catch (error) {
            console.error('[RON ClipTools] Screenshot:', error);
            setStatus('Canvas screenshot unavailable');
        }
    }

    function getSupportedMimeType() {
        if (!window.MediaRecorder) return '';
        return [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm'
        ].find(type => MediaRecorder.isTypeSupported(type)) || '';
    }

    function trimBuffer() {
        const cutoff = Date.now() - (MAX_BUFFER_SECONDS * 1000);
        while (state.chunkTimes.length > 1 && state.chunkTimes[1] < cutoff) {
            state.chunkTimes.shift();
            state.chunks.shift();
        }
    }

    function updateBufferUI() {
        const button = shadow.querySelector('#buffer');
        const clipButton = shadow.querySelector('#clip');
        const timer = shadow.querySelector('#record-timer');

        if (button) button.textContent = state.buffering ? 'Clip Buffer: ON' : 'Start Clip Buffer';
        if (clipButton) clipButton.disabled = !state.buffering;
        if (timer) timer.textContent = state.buffering ? 'Capturing in background' : 'Buffer is off';
    }

    async function startBuffer() {
        if (state.buffering) return;

        if (!navigator.mediaDevices?.getDisplayMedia || !window.MediaRecorder) {
            setStatus('Screen recording is not supported here');
            return;
        }

        try {
            // This must happen directly from the button/hotkey user action.
            state.stream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: { ideal: 60, max: 60 } },
                audio: true
            });

            const type = getSupportedMimeType();
            state.recorder = type
                ? new MediaRecorder(state.stream, { mimeType: type })
                : new MediaRecorder(state.stream);

            state.chunks = [];
            state.chunkTimes = [];
            state.startedAt = Date.now();
            state.stopping = false;

            state.recorder.ondataavailable = event => {
                if (!event.data || !event.data.size) return;
                state.chunks.push(event.data);
                state.chunkTimes.push(Date.now());
                trimBuffer();
                updateBufferUI();
            };

            state.recorder.onerror = event => {
                console.error('[RON ClipTools] MediaRecorder error:', event);
                setStatus('Recorder error - restart buffer');
            };

            const track = state.stream.getVideoTracks()[0];
            if (track) {
                track.addEventListener('ended', () => {
                    stopBuffer('Screen capture ended');
                }, { once: true });
            }

            // Timeslices create a rolling set of small chunks instead of one huge recording.
            state.recorder.start(CHUNK_MS);
            state.buffering = true;
            updateBufferUI();
            setStatus(`Clip buffer active - ${settings.duration}s ready after warm-up`);
        } catch (error) {
            console.warn('[RON ClipTools] Capture:', error);
            state.buffering = false;
            state.stream?.getTracks().forEach(track => track.stop());
            state.stream = null;
            state.recorder = null;

            if (error?.name === 'NotAllowedError') {
                setStatus('Screen capture was cancelled or blocked');
            } else {
                setStatus('Could not start screen capture');
            }
            updateBufferUI();
        }
    }

    function stopBuffer(message = 'Buffer stopped') {
        if (state.recorder && state.recorder.state !== 'inactive') {
            try { state.recorder.stop(); } catch (_) {}
        }
        state.stream?.getTracks().forEach(track => track.stop());
        state.stream = null;
        state.recorder = null;
        state.buffering = false;
        state.chunks = [];
        state.chunkTimes = [];
        state.startedAt = 0;
        updateBufferUI();
        setStatus(message);
    }

    function buildRollingClip() {
        if (!state.buffering || !state.recorder) {
            setStatus('Start Clip Buffer first');
            return;
        }

        if (state.chunks.length < 2) {
            setStatus('Buffer is warming up - try again in a few seconds');
            return;
        }

        const wantedMs = settings.duration * 1000;
        const now = Date.now();
        const cutoff = now - wantedMs;

        // Keep the first WebM chunk because it contains the container initialization,
        // then append the chunks that fall inside the selected rolling time window.
        let startIndex = 0;
        for (let i = 1; i < state.chunkTimes.length; i++) {
            if (state.chunkTimes[i] >= cutoff) {
                startIndex = Math.max(0, i - 1);
                break;
            }
            startIndex = i - 1;
        }

        const selected = state.chunks.slice(startIndex);
        if (!selected.length) {
            setStatus('Not enough buffered footage yet');
            return;
        }

        const mime = state.recorder.mimeType || 'video/webm';
        const blob = new Blob(selected, { type: mime });
        downloadBlob(blob, `RON-Clip-${settings.duration}s-${fileTime()}.webm`);
        setStatus(`Clip saved: last ${settings.duration}s`);
    }

    function toggleBuffer() {
        if (state.buffering) stopBuffer();
        else startBuffer();
    }

    function togglePanel() {
        const panel = shadow.querySelector('#panel');
        if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
    }

    function keyMatches(event, key) {
        return event.key.toLowerCase() === String(key).toLowerCase();
    }

    function makeDraggable(panel, handle) {
        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        handle.addEventListener('mousedown', event => {
            if (event.button !== 0) return;
            dragging = true;
            const rect = panel.getBoundingClientRect();
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;
            panel.style.left = `${rect.left}px`;
            panel.style.top = `${rect.top}px`;
            panel.style.right = 'auto';
        });

        window.addEventListener('mousemove', event => {
            if (!dragging) return;
            panel.style.left = `${event.clientX - offsetX}px`;
            panel.style.top = `${event.clientY - offsetY}px`;
        });

        window.addEventListener('mouseup', () => { dragging = false; });
    }

    function createUI() {
        if (!document.body || shadow.querySelector('#panel')) return;

        const style = document.createElement('style');
        style.textContent = `
            :host{all:initial}
            #panel{position:fixed;top:80px;right:20px;width:320px;pointer-events:auto;background:#0b0f0d;color:#fff;border:1px solid #35ff83;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.55);overflow:hidden;font:14px Arial,sans-serif}
            #head{padding:14px 16px;background:#101712;border-bottom:1px solid #202b23;cursor:move;user-select:none}
            #title{color:#35ff83;font-weight:800;font-size:17px}#sub{color:#748078;font-size:11px;margin-top:3px}
            #body{padding:12px}button{width:100%;border:0;border-radius:9px;padding:11px;margin-bottom:8px;background:#1b241e;color:#fff;font-weight:700;cursor:pointer}
            button:hover{background:#26362b}button:disabled{opacity:.45;cursor:not-allowed}#shot{background:#168c46}#shot:hover{background:#1cab58}
            #buffer{background:#214d32}#clip{background:#168c46}#website{background:#35ff83;color:#061008}#buffer.on{background:#b42d2d}
            #settings{border-top:1px solid #202b23;margin-top:8px;padding-top:8px}.row{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#aab5ae;font-size:12px;margin:8px 0}
            input,select{width:110px;box-sizing:border-box;background:#080b09;color:#fff;border:1px solid #303b33;border-radius:6px;padding:6px;text-align:center}select{text-align:left}
            #record-timer{color:#35ff83;text-align:center;font-size:11px;margin:-2px 0 8px;min-height:13px}
            #status{color:#6f7b73;text-align:center;font-size:11px;padding-top:3px;min-height:28px;line-height:14px}.small{color:#657168;font-size:10px;line-height:1.4;margin:4px 0 8px}
        `;
        shadow.appendChild(style);

        const panel = document.createElement('div');
        panel.id = 'panel';
        panel.innerHTML = `
            <div id="head"><div id="title">RON ClipTools</div><div id="sub">RON Labs • BuildNow.GG</div></div>
            <div id="body">
                <button id="shot">Screenshot</button>
                <button id="buffer">Start Clip Buffer</button>
                <button id="clip" disabled>Save Last ${settings.duration}s Clip</button>
                <div id="record-timer">Buffer is off</div>
                <button id="website">RON Labs Clips</button>
                <div class="small">Start the buffer once after opening BuildNow. It keeps the selected amount of recent gameplay in memory. Press the clip hotkey whenever something happens and only the recent footage is saved.</div>
                <div id="settings">
                    <div class="row"><span>Clip length</span><select id="duration">
                        <option value="5">5 seconds</option><option value="10">10 seconds</option><option value="15">15 seconds</option><option value="30">30 seconds</option><option value="60">60 seconds</option><option value="120">120 seconds</option>
                    </select></div>
                    <div class="row"><span>Screenshot key</span><input id="shot-key" value="${escapeHTML(settings.screenshot)}"></div>
                    <div class="row"><span>Clip key</span><input id="clip-key" value="${escapeHTML(settings.clip)}"></div>
                    <div class="row"><span>Window key</span><input id="panel-key" value="${escapeHTML(settings.panel)}"></div>
                </div>
                <div id="status">Ready</div>
            </div>`;

        shadow.appendChild(panel);

        const duration = shadow.querySelector('#duration');
        duration.value = String(settings.duration);
        duration.addEventListener('change', () => {
            settings.duration = Number(duration.value) || 15;
            saveSettings();
            const clip = shadow.querySelector('#clip');
            if (clip) clip.textContent = `Save Last ${settings.duration}s Clip`;
            setStatus(`Clip length set to ${settings.duration}s`);
        });

        shadow.querySelector('#shot').addEventListener('click', screenshot);
        shadow.querySelector('#buffer').addEventListener('click', toggleBuffer);
        shadow.querySelector('#clip').addEventListener('click', buildRollingClip);
        shadow.querySelector('#website').addEventListener('click', () => window.open(CLIPS_WEBSITE, '_blank', 'noopener,noreferrer'));

        const shotKey = shadow.querySelector('#shot-key');
        const clipKey = shadow.querySelector('#clip-key');
        const panelKey = shadow.querySelector('#panel-key');

        shotKey.addEventListener('change', () => {
            settings.screenshot = shotKey.value.trim() || 'F8';
            saveSettings();
        });
        clipKey.addEventListener('change', () => {
            settings.clip = clipKey.value.trim() || 'F9';
            saveSettings();
        });
        panelKey.addEventListener('change', () => {
            settings.panel = panelKey.value.trim() || 'F7';
            saveSettings();
        });

        makeDraggable(panel, shadow.querySelector('#head'));
        updateBufferUI();
    }

    document.addEventListener('keydown', event => {
        if (event.defaultPrevented || event.repeat) return;
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target?.isContentEditable) return;

        if (keyMatches(event, settings.screenshot)) {
            event.preventDefault();
            screenshot();
        } else if (keyMatches(event, settings.clip)) {
            event.preventDefault();
            buildRollingClip();
        } else if (keyMatches(event, settings.panel)) {
            event.preventDefault();
            togglePanel();
        }
    }, false);

    function mount() {
        if (!document.body || document.getElementById(ID)) return;
        document.body.appendChild(root);
        createUI();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
        mount();
    }
})();