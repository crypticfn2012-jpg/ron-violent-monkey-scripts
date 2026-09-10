// ==UserScript==
// @name         RON ClipTools
// @namespace    https://ron.cool/userscripts
// @version      8.0.0
// @description  RON ClipTools for BuildNow.GG - proper H.264 replay buffer and MP4 export
// @author       Ron
// @homepageURL  https://crypticfn2012-jpg.github.io/ron-violent-monkey-scripts/
// @supportURL   https://github.com/crypticfn2012-jpg/ron-violent-monkey-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-cliptools.user.js
// @updateURL    https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-cliptools.user.js
// @require      https://cdn.jsdelivr.net/npm/mediabunny@1.56.1/dist/bundles/mediabunny.cjs
// @match        *://buildnow.gg/*
// @match        *://*.buildnow.gg/*
// @match        *://buildnow-gg.game-files.crazygames.com/*
// @run-at       document-end
// @grant        none
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const ID = 'ron-cliptools';
    if (document.getElementById(ID)) return;

    const MB = globalThis.Mediabunny;
    const MAX_BUFFER_SECONDS = 125;
    const DEFAULT_FPS = 60;
    const BITRATE = 8_000_000;

    const state = {
        recording: false,
        canvas: null,
        stream: null,
        processor: null,
        reader: null,
        fallbackRAF: 0,
        liveOutput: null,
        liveSource: null,
        packets: [],
        decoderConfig: null,
        latestTimestamp: -Infinity,
        firstTimestamp: null,
        bytes: 0,
        saveBusy: false,
        frameCount: 0,
        error: null
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

    function timeName() {
        const d = new Date();
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
    }

    function status(text) {
        const e = shadow.querySelector('#status');
        if (e) e.textContent = text;
    }

    function getCanvas() {
        const canvases = [...document.querySelectorAll('canvas')]
            .filter(c => c.width > 0 && c.height > 0 && c.isConnected);
        canvases.sort((a, b) => (b.width * b.height) - (a.width * a.height));
        return canvases[0] || null;
    }

    function download(blob, filename) {
        if (!blob || !blob.size) {
            status('Nothing to save');
            return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        status(`Saved ${filename}`);
    }

    function screenshot() {
        const canvas = getCanvas();
        if (!canvas) return status('No BuildNow canvas found');

        try {
            canvas.toBlob(blob => {
                if (blob) download(blob, `RON-Screenshot-${timeName()}.png`);
                else status('Screenshot failed');
            }, 'image/png');
        } catch (error) {
            console.error('[RON ClipTools] Screenshot:', error);
            status('Screenshot unavailable');
        }
    }

    function updateUI() {
        const buffer = shadow.querySelector('#buffer');
        const clip = shadow.querySelector('#clip');
        const timer = shadow.querySelector('#record-timer');

        if (buffer) buffer.textContent = state.recording ? 'Stop Clip Buffer' : 'Start Clip Buffer';
        if (clip) clip.disabled = !state.recording || state.saveBusy;
        if (timer) {
            if (!state.recording) {
                timer.textContent = 'Buffer is off';
            } else if (state.saveBusy) {
                timer.textContent = 'Building a valid MP4...';
            } else if (state.latestTimestamp > -Infinity && state.firstTimestamp != null) {
                const seconds = Math.max(0, state.latestTimestamp - state.firstTimestamp);
                timer.textContent = `Replay buffer ON • ${Math.floor(seconds)}s available`;
            } else {
                timer.textContent = 'Replay buffer ON • warming up';
            }
        }
    }

    function trimPackets() {
        if (!state.packets.length || !Number.isFinite(state.latestTimestamp)) return;

        const cutoff = state.latestTimestamp - MAX_BUFFER_SECONDS;
        let firstUseful = 0;
        let found = false;

        for (let i = 0; i < state.packets.length; i++) {
            if (state.packets[i].packet.timestamp >= cutoff) {
                firstUseful = i;
                found = true;
                break;
            }
        }

        if (!found) return;

        // Keep the last key packet before the cutoff so every exported clip
        // can start on a clean random-access frame.
        let keepFrom = firstUseful;
        for (let i = firstUseful; i >= 0; i--) {
            if (state.packets[i].packet.type === 'key') {
                keepFrom = i;
                break;
            }
        }

        if (keepFrom > 0) {
            const removed = state.packets.splice(0, keepFrom);
            for (const item of removed) state.bytes -= item.packet.byteLength || item.packet.data.length;
        }
    }

    function storePacket(packet, meta) {
        if (!packet) return;

        if (!state.decoderConfig && meta?.decoderConfig) {
            const cfg = meta.decoderConfig;
            state.decoderConfig = {
                ...cfg,
                description: cfg.description ? new Uint8Array(cfg.description) : undefined,
                colorSpace: cfg.colorSpace ? { ...cfg.colorSpace } : undefined
            };
        }

        state.packets.push({ packet, meta });
        state.latestTimestamp = Math.max(state.latestTimestamp, packet.timestamp + (packet.duration || 0));
        if (state.firstTimestamp == null) state.firstTimestamp = packet.timestamp;
        state.bytes += packet.byteLength || packet.data.length;
        trimPackets();

        if (state.packets.length % 30 === 0) updateUI();
    }

    async function createLiveEncoder(canvas) {
        if (!MB) throw new Error('Mediabunny failed to load');
        if (!MB.Output || !MB.Mp4OutputFormat || !MB.VideoSampleSource || !MB.NullTarget) {
            throw new Error('Required Mediabunny APIs are unavailable');
        }
        if (!globalThis.VideoFrame) throw new Error('WebCodecs VideoFrame is unavailable');

        state.canvas = canvas;
        state.packets = [];
        state.decoderConfig = null;
        state.latestTimestamp = -Infinity;
        state.firstTimestamp = null;
        state.bytes = 0;
        state.frameCount = 0;
        state.error = null;

        state.liveSource = new MB.VideoSampleSource({
            codec: 'avc',
            bitrate: BITRATE,
            keyFrameInterval: 1,
            latencyMode: 'realtime',
            hardwareAcceleration: 'prefer-hardware',
            transform: { frameRate: DEFAULT_FPS },
            onEncodedPacket(packet, meta) {
                storePacket(packet, meta);
            },
            onEncoderConfig(config) {
                console.debug('[RON ClipTools] Encoder:', config);
            }
        });

        // This output exists only to drive the live encoder. NullTarget throws
        // the generated media away while onEncodedPacket keeps the compressed
        // packets for the replay buffer. Fragmented MP4 avoids building a huge
        // live file in memory.
        state.liveOutput = new MB.Output({
            format: new MB.Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 1 }),
            target: new MB.NullTarget()
        });

        state.liveOutput.addVideoTrack(state.liveSource, {
            frameRate: DEFAULT_FPS,
            group: []
        });

        await state.liveOutput.start();
    }

    async function consumeTrackFrames() {
        const track = state.stream?.getVideoTracks?.()[0];
        if (!track || !globalThis.MediaStreamTrackProcessor) {
            return false;
        }

        state.processor = new MediaStreamTrackProcessor({ track });
        state.reader = state.processor.readable.getReader();

        try {
            while (state.recording && state.reader) {
                const result = await state.reader.read();
                if (result.done) break;

                const frame = result.value;
                if (!frame) continue;

                try {
                    if (!state.recording || !state.liveSource) continue;

                    // VideoEncoder-style backpressure is handled by Mediabunny's
                    // VideoSampleSource. Dropping frames here is only a safety valve
                    // if the browser gives us frames faster than the encoder can use.
                    if (state.liveSource && state.liveSource.output?.state === 'canceled') continue;

                    const timestamp = frame.timestamp / 1_000_000;
                    const duration = frame.duration ? frame.duration / 1_000_000 : 1 / DEFAULT_FPS;
                    const sample = new MB.VideoSample(frame, { timestamp, duration });
                    await state.liveSource.add(sample);
                    sample.close();
                    state.frameCount++;
                } catch (error) {
                    console.error('[RON ClipTools] Frame:', error);
                    state.error = error;
                    status('Encoder error — see console');
                    break;
                } finally {
                    // VideoSample owns the frame and closes it. If construction
                    // failed before ownership was transferred, release it here.
                    // close() is harmless when the frame is already closed.
                    try { frame.close(); } catch (_) {}
                }
            }
        } finally {
            try { state.reader?.releaseLock(); } catch (_) {}
            state.reader = null;
        }

        return true;
    }

    async function fallbackCanvasLoop() {
        if (!globalThis.VideoFrame) return;

        const started = performance.now();
        let next = started;

        const tick = async now => {
            if (!state.recording || !state.liveSource) return;
            state.fallbackRAF = requestAnimationFrame(tick);

            if (now < next) return;
            next = now + 1000 / DEFAULT_FPS;

            const timestamp = (now - started) / 1000;
            let frame = null;
            let sample = null;
            try {
                frame = new VideoFrame(state.canvas, {
                    timestamp: Math.round(timestamp * 1_000_000),
                    duration: Math.round(1_000_000 / DEFAULT_FPS),
                    alpha: 'discard'
                });
                sample = new MB.VideoSample(frame, {
                    timestamp,
                    duration: 1 / DEFAULT_FPS
                });
                await state.liveSource.add(sample);
                state.frameCount++;
            } catch (error) {
                console.error('[RON ClipTools] Fallback encoder:', error);
                state.error = error;
                status('Encoder error — see console');
                stopBuffer();
            } finally {
                try { sample?.close(); } catch (_) {}
                try { frame?.close(); } catch (_) {}
            }
        };

        state.fallbackRAF = requestAnimationFrame(tick);
    }

    async function startBuffer() {
        if (state.recording) return;

        const canvas = getCanvas();
        if (!canvas) return status('BuildNow canvas not ready yet');
        if (!MB) return status('ClipTools media engine failed to load');
        if (!globalThis.VideoFrame) return status('This browser does not support WebCodecs');

        try {
            status('Starting H.264 replay buffer...');
            await createLiveEncoder(canvas);
            state.recording = true;
            updateUI();

            if (canvas.captureStream && globalThis.MediaStreamTrackProcessor) {
                state.stream = canvas.captureStream(DEFAULT_FPS);
                consumeTrackFrames().catch(error => {
                    console.error('[RON ClipTools] Capture loop:', error);
                    if (state.recording) status('Capture error — see console');
                });
            } else {
                await fallbackCanvasLoop();
            }

            status(`H.264 replay buffer ON — last ${settings.duration}s ready after warm-up`);
            updateUI();
        } catch (error) {
            console.error('[RON ClipTools] Start:', error);
            state.error = error;
            await cleanupEncoder();
            state.recording = false;
            updateUI();
            status(`Could not start clip buffer: ${error?.message || 'unknown error'}`);
        }
    }

    async function cleanupEncoder() {
        if (state.reader) {
            try { await state.reader.cancel(); } catch (_) {}
            try { state.reader.releaseLock(); } catch (_) {}
        }
        state.reader = null;

        if (state.fallbackRAF) cancelAnimationFrame(state.fallbackRAF);
        state.fallbackRAF = 0;

        try { state.stream?.getTracks().forEach(track => track.stop()); } catch (_) {}
        state.stream = null;
        state.processor = null;

        try { state.liveSource?.close(); } catch (_) {}
        state.liveSource = null;

        if (state.liveOutput) {
            try { await state.liveOutput.cancel(); } catch (_) {}
        }
        state.liveOutput = null;
    }

    async function stopBuffer() {
        if (!state.recording && !state.liveOutput) return;

        state.recording = false;
        updateUI();
        await cleanupEncoder();

        state.packets = [];
        state.decoderConfig = null;
        state.latestTimestamp = -Infinity;
        state.firstTimestamp = null;
        state.bytes = 0;
        state.canvas = null;
        updateUI();
        status('Buffer OFF');
    }

    function getClipPackets() {
        if (!state.packets.length || !state.decoderConfig) return null;

        const newest = state.latestTimestamp;
        const cutoff = newest - settings.duration;
        let start = -1;

        // Start at the most recent keyframe at or before the requested cutoff.
        // This guarantees the first packet can be decoded without older frames.
        for (let i = state.packets.length - 1; i >= 0; i--) {
            const item = state.packets[i];
            if (item.packet.timestamp <= cutoff && item.packet.type === 'key') {
                start = i;
                break;
            }
        }

        // If the buffer hasn't reached the requested duration yet, use its
        // earliest keyframe instead of manufacturing a broken clip.
        if (start < 0) {
            start = state.packets.findIndex(item => item.packet.type === 'key');
        }
        if (start < 0) return null;

        const selected = state.packets.slice(start);
        if (!selected.length || selected[0].packet.type !== 'key') return null;

        const base = selected[0].packet.timestamp;
        return {
            base,
            packets: selected.map(item => ({
                packet: item.packet.clone({ timestamp: item.packet.timestamp - base }),
                meta: item.meta
            })),
            meta: selected[0].meta,
            duration: Math.max(0, newest - base)
        };
    }

    async function saveLastClip() {
        if (!state.recording) return status('Start Clip Buffer first');
        if (state.saveBusy) return;
        if (!state.packets.length) return status('Buffer warming up — wait a few seconds');
        if (!state.decoderConfig) return status('Encoder metadata not ready yet');

        const clip = getClipPackets();
        if (!clip || clip.packets.length < 2) {
            return status('Not enough encoded footage yet');
        }

        state.saveBusy = true;
        updateUI();
        status('Muxing a fresh MP4...');

        try {
            const source = new MB.EncodedVideoPacketSource('avc');
            const target = new MB.BufferTarget();
            const output = new MB.Output({
                format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }),
                target
            });

            output.addVideoTrack(source, {
                frameRate: DEFAULT_FPS,
                group: []
            });

            await output.start();

            let first = true;
            for (const item of clip.packets) {
                await source.add(item.packet, first ? item.meta : undefined);
                first = false;
            }

            source.close();
            await output.finalize();

            if (!target.buffer || !target.buffer.byteLength) {
                throw new Error('MP4 muxer returned an empty file');
            }

            const blob = new Blob([target.buffer], { type: 'video/mp4' });
            download(blob, `RON-Clip-${settings.duration}s-${timeName()}.mp4`);
        } catch (error) {
            console.error('[RON ClipTools] MP4 export:', error);
            status(`MP4 export failed: ${error?.message || 'unknown error'}`);
        } finally {
            state.saveBusy = false;
            updateUI();
        }
    }

    function togglePanel() {
        const panel = shadow.querySelector('#panel');
        if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
    }

    function keyMatches(event, key) {
        return String(event.key).toLowerCase() === String(key).toLowerCase();
    }

    function escapeHTML(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function drag(panel, handle) {
        let moving = false;
        let ox = 0;
        let oy = 0;

        handle.addEventListener('mousedown', event => {
            if (event.button !== 0) return;
            moving = true;
            const rect = panel.getBoundingClientRect();
            ox = event.clientX - rect.left;
            oy = event.clientY - rect.top;
            panel.style.left = rect.left + 'px';
            panel.style.top = rect.top + 'px';
            panel.style.right = 'auto';
        });

        window.addEventListener('mousemove', event => {
            if (!moving) return;
            panel.style.left = (event.clientX - ox) + 'px';
            panel.style.top = (event.clientY - oy) + 'px';
        });

        window.addEventListener('mouseup', () => {
            moving = false;
        });
    }

    function buildUI() {
        if (!document.body) return;

        const style = document.createElement('style');
        style.textContent = `
            #panel{position:fixed;top:80px;right:20px;width:330px;pointer-events:auto;background:#0b0f0d;color:#fff;border:1px solid #35ff83;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.55);overflow:hidden;font:14px Arial,sans-serif}
            #head{padding:14px 16px;background:#101712;border-bottom:1px solid #202b23;cursor:move;user-select:none}
            #title{color:#35ff83;font-weight:800;font-size:17px}#sub{color:#748078;font-size:11px;margin-top:3px}#body{padding:12px}
            button{width:100%;border:0;border-radius:9px;padding:11px;margin-bottom:8px;background:#1b241e;color:#fff;font-weight:700;cursor:pointer}
            button:hover{background:#26362b}button:disabled{opacity:.4;cursor:not-allowed}#shot,#clip{background:#168c46}#buffer{background:#214d32}#website{background:#35ff83;color:#061008}
            #settings{border-top:1px solid #202b23;margin-top:8px;padding-top:8px}.row{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#aab5ae;font-size:12px;margin:8px 0}
            input,select{width:115px;box-sizing:border-box;background:#080b09;color:#fff;border:1px solid #303b33;border-radius:6px;padding:6px;text-align:center}select{text-align:left}
            #record-timer{color:#35ff83;text-align:center;font-size:11px;margin:-2px 0 8px;min-height:13px}#status{color:#6f7b73;text-align:center;font-size:11px;padding-top:3px;min-height:28px;line-height:14px}
            .small{color:#657168;font-size:10px;line-height:1.4;margin:4px 0 8px}
        `;
        shadow.appendChild(style);

        const panel = document.createElement('div');
        panel.id = 'panel';
        panel.innerHTML = `<div id="head"><div id="title">RON ClipTools</div><div id="sub">RON Labs • BuildNow.GG</div></div><div id="body">
            <button id="shot">Screenshot</button>
            <button id="buffer">Start Clip Buffer</button>
            <button id="clip" disabled>Save Last ${settings.duration}s MP4</button>
            <div id="record-timer">Buffer is off</div>
            <button id="website">RON Labs Clips</button>
            <div class="small">Browser-level H.264 replay buffer. It continuously keeps encoded video in memory and creates a new, properly muxed MP4 when you save. No screen-share picker and no BuildNow internal game data.</div>
            <div id="settings">
                <div class="row"><span>Clip length</span><select id="duration"><option value="5">5 seconds</option><option value="10">10 seconds</option><option value="15">15 seconds</option><option value="30">30 seconds</option><option value="60">60 seconds</option><option value="120">120 seconds</option></select></div>
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
            if (clip) clip.textContent = `Save Last ${settings.duration}s MP4`;
            status(`Clip length: ${settings.duration}s`);
        });

        shadow.querySelector('#shot').addEventListener('click', screenshot);
        shadow.querySelector('#buffer').addEventListener('click', () => {
            if (state.recording) stopBuffer();
            else startBuffer();
        });
        shadow.querySelector('#clip').addEventListener('click', saveLastClip);
        shadow.querySelector('#website').addEventListener('click', () => {
            window.open('https://ron.cool/clips', '_blank', 'noopener,noreferrer');
        });

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

        drag(panel, shadow.querySelector('#head'));
        updateUI();
    }

    document.addEventListener('keydown', event => {
        if (event.defaultPrevented || event.repeat) return;
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target?.isContentEditable) return;

        if (keyMatches(event, settings.screenshot)) {
            event.preventDefault();
            screenshot();
        } else if (keyMatches(event, settings.clip)) {
            event.preventDefault();
            saveLastClip();
        } else if (keyMatches(event, settings.panel)) {
            event.preventDefault();
            togglePanel();
        }
    }, false);

    const mount = () => {
        if (!document.body) return requestAnimationFrame(mount);
        document.body.appendChild(root);
        buildUI();

        if (!MB) {
            status('Mediabunny did not load — update/reinstall ClipTools');
            console.error('[RON ClipTools] Mediabunny global missing.');
        }
    };

    mount();
})();
