// ==UserScript==
// @name         RON ClipTools
// @namespace    https://ron.cool/userscripts
// @version      7.0.0
// @description  RON ClipTools for BuildNow.GG - native MP4 rolling clips and screenshots
// @author       Ron
// @homepageURL  https://crypticfn2012-jpg.github.io/ron-violent-monkey-scripts/
// @supportURL   https://github.com/crypticfn2012-jpg/ron-violent-monkey-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-cliptools.user.js
// @updateURL    https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-cliptools.user.js
// @match        *://buildnow.gg/*
// @match        *://*.buildnow.gg/*
// @match        *://buildnow-gg.game-files.crazygames.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const ID = 'ron-cliptools';
    if (document.getElementById(ID)) return;

    const state = {
        recording: false,
        recorder: null,
        stream: null,
        chunks: [],
        times: [],
        initChunk: null,
        mimeType: '',
        started: 0
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
    const shadow = root.attachShadow ? root.attachShadow({mode:'open'}) : root;

    const saveSettings = () => {
        localStorage.setItem('ronClipToolsScreenshotKey', settings.screenshot);
        localStorage.setItem('ronClipToolsRecordKey', settings.clip);
        localStorage.setItem('ronClipToolsPanelKey', settings.panel);
        localStorage.setItem('ronClipToolsDuration', String(settings.duration));
    };

    const timeName = () => {
        const d = new Date(), p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
    };

    const status = text => {
        const e = shadow.querySelector('#status');
        if (e) e.textContent = text;
    };

    function getCanvas() {
        const list = [...document.querySelectorAll('canvas')].filter(c => c.width > 0 && c.height > 0);
        list.sort((a, b) => (b.width * b.height) - (a.width * a.height));
        return list[0] || null;
    }

    function download(blob, filename) {
        if (!blob || !blob.size) return status('Nothing to save');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        status(`Saved ${filename}`);
    }

    function screenshot() {
        const c = getCanvas();
        if (!c) return status('No BuildNow canvas found');
        try {
            c.toBlob(blob => {
                if (blob) download(blob, `RON-Screenshot-${timeName()}.png`);
                else status('Screenshot failed');
            }, 'image/png');
        } catch (e) {
            console.error('[RON ClipTools] Screenshot:', e);
            status('Screenshot unavailable');
        }
    }

    // Prefer a REAL MP4/H.264 recording. Never rename WebM to .mp4.
    function getMP4Mime() {
        if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
        const types = [
            'video/mp4;codecs="avc1.42E01E"',
            'video/mp4;codecs=avc1.42E01E',
            'video/mp4'
        ];
        return types.find(type => MediaRecorder.isTypeSupported(type)) || '';
    }

    function trimBuffer() {
        const keepMs = Math.max(125000, settings.duration * 1000 + 5000);
        const cutoff = Date.now() - keepMs;
        while (state.times.length > 1 && state.times[1] < cutoff) {
            state.times.shift();
            state.chunks.shift();
        }
    }

    function updateUI() {
        const b = shadow.querySelector('#buffer');
        const c = shadow.querySelector('#clip');
        const t = shadow.querySelector('#record-timer');
        if (b) b.textContent = state.recording ? 'Clip Buffer: ON' : 'Start Clip Buffer';
        if (c) c.disabled = !state.recording;
        if (t) t.textContent = state.recording ? 'Recording recent gameplay • MP4' : 'Buffer is off';
    }

    function startBuffer() {
        if (state.recording) return;

        const c = getCanvas();
        if (!c) return status('BuildNow canvas not ready yet');
        if (!c.captureStream || !window.MediaRecorder) {
            return status('This browser cannot record the game canvas');
        }

        const mp4 = getMP4Mime();
        if (!mp4) {
            return status('This browser cannot create real MP4 files');
        }

        try {
            state.stream = c.captureStream(60);
            state.mimeType = mp4;
            state.recorder = new MediaRecorder(state.stream, {
                mimeType: mp4,
                videoBitsPerSecond: 8000000
            });

            state.chunks = [];
            state.times = [];
            state.initChunk = null;
            state.started = Date.now();

            state.recorder.ondataavailable = e => {
                if (!e.data || !e.data.size) return;

                // The first MP4 blob contains the initialization data.
                // Keep it permanently while rotating only the later media fragments.
                if (!state.initChunk) {
                    state.initChunk = e.data;
                    return;
                }

                state.chunks.push(e.data);
                state.times.push(Date.now());
                trimBuffer();
            };

            state.recorder.onerror = e => {
                console.error('[RON ClipTools] MediaRecorder:', e);
                status('MP4 recorder error');
            };

            state.recorder.onstop = () => {
                state.stream?.getTracks().forEach(track => track.stop());
            };

            state.recorder.start(500);
            state.recording = true;
            updateUI();
            status(`MP4 buffer ON — collecting last ${settings.duration}s`);
        } catch (e) {
            console.error('[RON ClipTools] Start:', e);
            state.stream?.getTracks().forEach(track => track.stop());
            state.stream = null;
            state.recorder = null;
            state.recording = false;
            state.initChunk = null;
            updateUI();
            status('Could not start MP4 recording');
        }
    }

    function stopBuffer() {
        try {
            if (state.recorder && state.recorder.state !== 'inactive') state.recorder.stop();
        } catch (_) {}

        state.stream?.getTracks().forEach(track => track.stop());
        state.stream = null;
        state.recorder = null;
        state.recording = false;
        state.chunks = [];
        state.times = [];
        state.initChunk = null;
        state.mimeType = '';
        updateUI();
        status('Buffer OFF');
    }

    function saveLastClip() {
        if (!state.recording || !state.recorder) return status('Start Clip Buffer first');
        if (!state.initChunk || !state.chunks.length) return status('Buffer warming up — wait a few seconds');

        const cutoff = Date.now() - settings.duration * 1000;
        let start = 0;

        for (let i = 0; i < state.times.length; i++) {
            if (state.times[i] >= cutoff) {
                start = i;
                break;
            }
            start = i;
        }

        const selected = state.chunks.slice(start);
        if (!selected.length) return status('Not enough footage yet');

        // Native Chromium MP4 MediaRecorder produces an ISO-BMFF initialization
        // fragment followed by media fragments. Preserve the init fragment and
        // append only the recent fragments so the saved file remains real MP4.
        const blob = new Blob([state.initChunk, ...selected], { type: 'video/mp4' });
        if (!blob.size) return status('MP4 clip was empty');

        download(blob, `RON-Clip-${settings.duration}s-${timeName()}.mp4`);
    }

    function togglePanel() {
        const p = shadow.querySelector('#panel');
        if (p) p.style.display = p.style.display === 'none' ? '' : 'none';
    }

    function keyMatches(e, key) {
        return String(e.key).toLowerCase() === String(key).toLowerCase();
    }

    function escapeHTML(v) {
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function drag(panel, handle) {
        let moving = false, ox = 0, oy = 0;
        handle.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            moving = true;
            const r = panel.getBoundingClientRect();
            ox = e.clientX - r.left;
            oy = e.clientY - r.top;
            panel.style.left = r.left + 'px';
            panel.style.top = r.top + 'px';
            panel.style.right = 'auto';
        });
        window.addEventListener('mousemove', e => {
            if (!moving) return;
            panel.style.left = (e.clientX - ox) + 'px';
            panel.style.top = (e.clientY - oy) + 'px';
        });
        window.addEventListener('mouseup', () => moving = false);
    }

    function buildUI() {
        if (!document.body) return;

        const style = document.createElement('style');
        style.textContent = `
        #panel{position:fixed;top:80px;right:20px;width:320px;pointer-events:auto;background:#0b0f0d;color:#fff;border:1px solid #35ff83;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.55);overflow:hidden;font:14px Arial,sans-serif}
        #head{padding:14px 16px;background:#101712;border-bottom:1px solid #202b23;cursor:move;user-select:none}
        #title{color:#35ff83;font-weight:800;font-size:17px}#sub{color:#748078;font-size:11px;margin-top:3px}#body{padding:12px}
        button{width:100%;border:0;border-radius:9px;padding:11px;margin-bottom:8px;background:#1b241e;color:#fff;font-weight:700;cursor:pointer}
        button:hover{background:#26362b}button:disabled{opacity:.4;cursor:not-allowed}#shot,#clip{background:#168c46}#buffer{background:#214d32}#website{background:#35ff83;color:#061008}
        #settings{border-top:1px solid #202b23;margin-top:8px;padding-top:8px}.row{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#aab5ae;font-size:12px;margin:8px 0}
        input,select{width:110px;box-sizing:border-box;background:#080b09;color:#fff;border:1px solid #303b33;border-radius:6px;padding:6px;text-align:center}select{text-align:left}
        #record-timer{color:#35ff83;text-align:center;font-size:11px;margin:-2px 0 8px;min-height:13px}#status{color:#6f7b73;text-align:center;font-size:11px;padding-top:3px;min-height:28px;line-height:14px}
        .small{color:#657168;font-size:10px;line-height:1.4;margin:4px 0 8px}
        `;
        shadow.appendChild(style);

        const p = document.createElement('div');
        p.id = 'panel';
        p.innerHTML = `<div id="head"><div id="title">RON ClipTools</div><div id="sub">RON Labs • BuildNow.GG</div></div><div id="body">
        <button id="shot">Screenshot</button>
        <button id="buffer">Start Clip Buffer</button>
        <button id="clip" disabled>Save Last ${settings.duration}s MP4</button>
        <div id="record-timer">Buffer is off</div>
        <button id="website">RON Labs Clips</button>
        <div class="small">Real MP4/H.264 clips from the BuildNow game canvas. Start the buffer once, play normally, then press your clip key to save the latest selected seconds. No screen-share picker.</div>
        <div id="settings">
            <div class="row"><span>Clip length</span><select id="duration"><option value="5">5 seconds</option><option value="10">10 seconds</option><option value="15">15 seconds</option><option value="30">30 seconds</option><option value="60">60 seconds</option><option value="120">120 seconds</option></select></div>
            <div class="row"><span>Screenshot key</span><input id="shot-key" value="${escapeHTML(settings.screenshot)}"></div>
            <div class="row"><span>Clip key</span><input id="clip-key" value="${escapeHTML(settings.clip)}"></div>
            <div class="row"><span>Window key</span><input id="panel-key" value="${escapeHTML(settings.panel)}"></div>
        </div>
        <div id="status">Ready</div></div>`;
        shadow.appendChild(p);

        const d = shadow.querySelector('#duration');
        d.value = String(settings.duration);
        d.addEventListener('change', () => {
            settings.duration = Number(d.value) || 15;
            saveSettings();
            const b = shadow.querySelector('#clip');
            if (b) b.textContent = `Save Last ${settings.duration}s MP4`;
            status(`Clip length: ${settings.duration}s`);
        });

        shadow.querySelector('#shot').addEventListener('click', screenshot);
        shadow.querySelector('#buffer').addEventListener('click', () => state.recording ? stopBuffer() : startBuffer());
        shadow.querySelector('#clip').addEventListener('click', saveLastClip);
        shadow.querySelector('#website').addEventListener('click', () => window.open('https://ron.cool/clips', '_blank', 'noopener,noreferrer'));

        const sk = shadow.querySelector('#shot-key');
        const ck = shadow.querySelector('#clip-key');
        const pk = shadow.querySelector('#panel-key');
        sk.addEventListener('change', () => { settings.screenshot = sk.value.trim() || 'F8'; saveSettings(); });
        ck.addEventListener('change', () => { settings.clip = ck.value.trim() || 'F9'; saveSettings(); });
        pk.addEventListener('change', () => { settings.panel = pk.value.trim() || 'F7'; saveSettings(); });

        drag(p, shadow.querySelector('#head'));
        updateUI();
    }

    document.addEventListener('keydown', e => {
        if (e.defaultPrevented || e.repeat) return;
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target?.isContentEditable) return;

        if (keyMatches(e, settings.screenshot)) {
            e.preventDefault();
            screenshot();
        } else if (keyMatches(e, settings.clip)) {
            e.preventDefault();
            saveLastClip();
        } else if (keyMatches(e, settings.panel)) {
            e.preventDefault();
            togglePanel();
        }
    }, false);

    function mount() {
        if (!document.body || document.getElementById(ID)) return;
        document.body.appendChild(root);
        buildUI();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount, {once:true});
    } else {
        mount();
    }
})();