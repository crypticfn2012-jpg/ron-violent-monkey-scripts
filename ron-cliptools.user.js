// ==UserScript==
// @name         RON ClipTools
// @namespace    https://ron.cool/userscripts
// @version      3.0.0
// @description  RON ClipTools for BuildNow.GG - screenshots and screen recording
// @author       Ron
// @homepageURL  https://crypticfn2012-jpg.github.io/ron-violent-monkey-scripts/
// @supportURL   https://github.com/crypticfn2012-jpg/ron-violent-monkey-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-cliptools.user.js
// @updateURL    https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-cliptools.user.js
// @match        *://buildnow.gg/*
// @match        *://*.buildnow.gg/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const ID = 'ron-cliptools';

    if (window.top !== window.self) return;
    if (document.getElementById(ID)) return;

    const state = {
        recording: false,
        recorder: null,
        stream: null,
        chunks: []
    };

    const settings = {
        screenshot: localStorage.getItem('ronClipToolsScreenshotKey') || 'F8',
        record: localStorage.getItem('ronClipToolsRecordKey') || 'F9',
        panel: localStorage.getItem('ronClipToolsPanelKey') || 'F7'
    };

    function saveSettings() {
        localStorage.setItem('ronClipToolsScreenshotKey', settings.screenshot);
        localStorage.setItem('ronClipToolsRecordKey', settings.record);
        localStorage.setItem('ronClipToolsPanelKey', settings.panel);
    }

    function fileTime() {
        const d = new Date();
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
    }

    function download(blob, name) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
    }

    function canvas() {
        const list = Array.from(document.querySelectorAll('canvas'));
        list.sort((a, b) => (b.width * b.height) - (a.width * a.height));
        return list[0] || null;
    }

    function screenshot() {
        const c = canvas();
        if (!c) return setStatus('No game canvas found');

        try {
            c.toBlob(blob => {
                if (!blob) return setStatus('Screenshot failed');
                download(blob, `RON-Screenshot-${fileTime()}.png`);
                setStatus('Screenshot saved');
            }, 'image/png');
        } catch (e) {
            console.error('[RON ClipTools]', e);
            setStatus('Screenshot unavailable');
        }
    }

    async function startRecording() {
        if (state.recording) return;

        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia || !window.MediaRecorder) {
            setStatus('Screen recording is not supported');
            return;
        }

        try {
            state.stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });

            const types = [
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=vp8,opus',
                'video/webm'
            ];

            const type = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
            state.recorder = type ? new MediaRecorder(state.stream, { mimeType: type }) : new MediaRecorder(state.stream);
            state.chunks = [];

            state.recorder.ondataavailable = e => {
                if (e.data && e.data.size) state.chunks.push(e.data);
            };

            state.recorder.onstop = () => {
                const blob = new Blob(state.chunks, { type: state.recorder.mimeType || 'video/webm' });
                download(blob, `RON-Recording-${fileTime()}.webm`);
                cleanupRecording();
                setStatus('Recording saved');
            };

            const track = state.stream.getVideoTracks()[0];
            if (track) track.addEventListener('ended', () => {
                if (state.recording) stopRecording();
            });

            state.recorder.start(1000);
            state.recording = true;
            updateRecordButton();
            setStatus('Recording...');
        } catch (e) {
            console.log('[RON ClipTools] Recording cancelled or unavailable', e);
            cleanupRecording();
            setStatus('Recording cancelled');
        }
    }

    function stopRecording() {
        if (!state.recorder) return cleanupRecording();
        if (state.recorder.state !== 'inactive') state.recorder.stop();
    }

    function cleanupRecording() {
        if (state.stream) state.stream.getTracks().forEach(t => t.stop());
        state.stream = null;
        state.recorder = null;
        state.chunks = [];
        state.recording = false;
        updateRecordButton();
    }

    function setStatus(text) {
        const el = document.getElementById(`${ID}-status`);
        if (el) el.textContent = text;
    }

    function updateRecordButton() {
        const el = document.getElementById(`${ID}-record`);
        if (el) el.textContent = state.recording ? 'Stop Recording' : 'Record Screen';
    }

    function addStyle() {
        const style = document.createElement('style');
        style.textContent = `
            #${ID} { position:fixed; top:80px; right:20px; width:290px; z-index:2147483647; background:#0b0f0d; color:#fff; border:1px solid #2cff78; border-radius:14px; box-shadow:0 18px 50px rgba(0,0,0,.5); font:14px Arial,sans-serif; overflow:hidden; }
            #${ID} * { box-sizing:border-box; }
            #${ID}-head { padding:14px 16px; background:#101712; border-bottom:1px solid #202b23; cursor:move; }
            #${ID}-title { color:#35ff83; font-weight:800; font-size:17px; }
            #${ID}-sub { color:#748078; font-size:11px; margin-top:3px; }
            #${ID}-body { padding:12px; }
            #${ID} button { width:100%; border:0; border-radius:9px; padding:11px; margin-bottom:8px; background:#1b241e; color:#fff; font-weight:700; cursor:pointer; }
            #${ID} button:hover { background:#26362b; }
            #${ID} .green { background:#168c46; }
            #${ID} .green:hover { background:#1cab58; }
            #${ID}-settings { border-top:1px solid #202b23; margin-top:8px; padding-top:8px; }
            #${ID} label { display:flex; align-items:center; justify-content:space-between; gap:8px; color:#aab5ae; font-size:12px; margin:7px 0; }
            #${ID} input { width:70px; background:#080b09; color:#fff; border:1px solid #303b33; border-radius:6px; padding:5px; text-align:center; }
            #${ID}-status { color:#6f7b73; text-align:center; font-size:11px; padding-top:3px; }
        `;
        document.documentElement.appendChild(style);
    }

    function makeDraggable(panel, head) {
        let dragging = false;
        let ox = 0;
        let oy = 0;

        head.addEventListener('mousedown', e => {
            dragging = true;
            const r = panel.getBoundingClientRect();
            ox = e.clientX - r.left;
            oy = e.clientY - r.top;
            panel.style.left = `${r.left}px`;
            panel.style.top = `${r.top}px`;
            panel.style.right = 'auto';
        });

        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            panel.style.left = `${e.clientX - ox}px`;
            panel.style.top = `${e.clientY - oy}px`;
        });

        document.addEventListener('mouseup', () => dragging = false);
    }

    function create() {
        if (!document.body || document.getElementById(ID)) return;

        addStyle();

        const panel = document.createElement('div');
        panel.id = ID;
        panel.innerHTML = `
            <div id="${ID}-head">
                <div id="${ID}-title">RON ClipTools</div>
                <div id="${ID}-sub">RON Labs • BuildNow.GG</div>
            </div>
            <div id="${ID}-body">
                <button class="green" id="${ID}-shot">Screenshot</button>
                <button id="${ID}-record">Record Screen</button>
                <div id="${ID}-settings">
                    <label>Screenshot key <input id="${ID}-shot-key" value="${settings.screenshot}"></label>
                    <label>Record key <input id="${ID}-record-key" value="${settings.record}"></label>
                    <label>Panel key <input id="${ID}-panel-key" value="${settings.panel}"></label>
                </div>
                <div id="${ID}-status">Ready</div>
            </div>
        `;

        document.body.appendChild(panel);

        document.getElementById(`${ID}-shot`).onclick = screenshot;
        document.getElementById(`${ID}-record`).onclick = () => state.recording ? stopRecording() : startRecording();

        const shotKey = document.getElementById(`${ID}-shot-key`);
        const recordKey = document.getElementById(`${ID}-record-key`);
        const panelKey = document.getElementById(`${ID}-panel-key`);

        shotKey.onchange = () => { settings.screenshot = shotKey.value.trim() || 'F8'; saveSettings(); };
        recordKey.onchange = () => { settings.record = recordKey.value.trim() || 'F9'; saveSettings(); };
        panelKey.onchange = () => { settings.panel = panelKey.value.trim() || 'F7'; saveSettings(); };

        makeDraggable(panel, document.getElementById(`${ID}-head`));
    }

    document.addEventListener('keydown', e => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

        const key = e.key.toLowerCase();

        if (key === settings.screenshot.toLowerCase()) {
            e.preventDefault();
            screenshot();
        } else if (key === settings.record.toLowerCase()) {
            e.preventDefault();
            state.recording ? stopRecording() : startRecording();
        } else if (key === settings.panel.toLowerCase()) {
            e.preventDefault();
            const panel = document.getElementById(ID);
            if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', create, { once: true });
    } else {
        create();
    }
})();
