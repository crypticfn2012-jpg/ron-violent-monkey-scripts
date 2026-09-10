// ==UserScript==
// @name         RON ClipTools
// @namespace    https://ron.cool/userscripts
// @version      3.1.0
// @description  RON ClipTools for BuildNow.GG - screenshots and screen recording
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
        chunks: []
    };

    const settings = {
        screenshot: localStorage.getItem('ronClipToolsScreenshotKey') || 'F8',
        record: localStorage.getItem('ronClipToolsRecordKey') || 'F9',
        panel: localStorage.getItem('ronClipToolsPanelKey') || 'F7'
    };

    const root = document.createElement('div');
    root.id = ID;
    root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';

    const shadow = root.attachShadow ? root.attachShadow({ mode: 'open' }) : root;

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
        if (!blob || !blob.size) return setStatus('Nothing to save');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    function getGameCanvas() {
        const canvases = Array.from(document.querySelectorAll('canvas'));
        canvases.sort((a, b) => (b.width * b.height) - (a.width * a.height));
        return canvases[0] || null;
    }

    function screenshot() {
        const c = getGameCanvas();
        if (!c) return setStatus('No game canvas found');

        try {
            c.toBlob(blob => {
                if (!blob) return setStatus('Screenshot failed');
                download(blob, `RON-Screenshot-${fileTime()}.png`);
                setStatus('Screenshot saved');
            }, 'image/png');
        } catch (err) {
            console.error('[RON ClipTools]', err);
            setStatus('Canvas screenshot unavailable');
        }
    }

    async function startRecording() {
        if (state.recording) return;

        if (!navigator.mediaDevices?.getDisplayMedia || !window.MediaRecorder) {
            return setStatus('Screen recording is not supported here');
        }

        try {
            // Browser security intentionally requires the user to approve the capture.
            state.stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });

            const types = [
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=vp8,opus',
                'video/webm'
            ];
            const mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) || '';

            state.recorder = mimeType
                ? new MediaRecorder(state.stream, { mimeType })
                : new MediaRecorder(state.stream);

            state.chunks = [];

            state.recorder.ondataavailable = event => {
                if (event.data?.size) state.chunks.push(event.data);
            };

            state.recorder.onstop = () => {
                const type = state.recorder?.mimeType || 'video/webm';
                const blob = new Blob(state.chunks, { type });
                download(blob, `RON-Recording-${fileTime()}.webm`);
                cleanupRecording();
                setStatus('Recording saved');
            };

            const track = state.stream.getVideoTracks()[0];
            if (track) {
                track.addEventListener('ended', () => {
                    if (state.recording) stopRecording();
                }, { once: true });
            }

            state.recorder.start(1000);
            state.recording = true;
            updateRecordButton();
            setStatus('Recording...');
        } catch (err) {
            console.log('[RON ClipTools] Capture cancelled', err);
            cleanupRecording();
            setStatus('Recording cancelled');
        }
    }

    function stopRecording() {
        if (!state.recorder) return cleanupRecording();
        if (state.recorder.state !== 'inactive') state.recorder.stop();
    }

    function cleanupRecording() {
        if (state.stream) {
            state.stream.getTracks().forEach(track => track.stop());
        }
        state.stream = null;
        state.recorder = null;
        state.chunks = [];
        state.recording = false;
        updateRecordButton();
    }

    function setStatus(text) {
        const el = shadow.querySelector('#status');
        if (el) el.textContent = text;
    }

    function updateRecordButton() {
        const el = shadow.querySelector('#record');
        if (el) el.textContent = state.recording ? 'Stop Recording' : 'Record Screen';
    }

    function createUI() {
        if (!document.body || shadow.querySelector('#panel')) return;

        const style = document.createElement('style');
        style.textContent = `
            :host { all: initial; }
            #panel {
                position: fixed;
                top: 80px;
                right: 20px;
                width: 290px;
                pointer-events: auto;
                background: #0b0f0d;
                color: #fff;
                border: 1px solid #35ff83;
                border-radius: 14px;
                box-shadow: 0 18px 50px rgba(0,0,0,.55);
                overflow: hidden;
                font: 14px Arial, sans-serif;
            }
            #head { padding: 14px 16px; background: #101712; border-bottom: 1px solid #202b23; cursor: move; user-select:none; }
            #title { color:#35ff83; font-weight:800; font-size:17px; }
            #sub { color:#748078; font-size:11px; margin-top:3px; }
            #body { padding:12px; }
            button { width:100%; border:0; border-radius:9px; padding:11px; margin-bottom:8px; background:#1b241e; color:#fff; font-weight:700; cursor:pointer; }
            button:hover { background:#26362b; }
            #shot { background:#168c46; }
            #shot:hover { background:#1cab58; }
            #settings { border-top:1px solid #202b23; margin-top:8px; padding-top:8px; }
            label { display:flex; align-items:center; justify-content:space-between; gap:8px; color:#aab5ae; font-size:12px; margin:7px 0; }
            input { width:70px; background:#080b09; color:#fff; border:1px solid #303b33; border-radius:6px; padding:5px; text-align:center; }
            #status { color:#6f7b73; text-align:center; font-size:11px; padding-top:3px; min-height:14px; }
        `;
        shadow.appendChild(style);

        const panel = document.createElement('div');
        panel.id = 'panel';
        panel.innerHTML = `
            <div id="head">
                <div id="title">RON ClipTools</div>
                <div id="sub">RON Labs • BuildNow.GG</div>
            </div>
            <div id="body">
                <button id="shot">Screenshot</button>
                <button id="record">Record Screen</button>
                <div id="settings">
                    <label>Screenshot key <input id="shot-key" value="${escapeHTML(settings.screenshot)}"></label>
                    <label>Record key <input id="record-key" value="${escapeHTML(settings.record)}"></label>
                    <label>Panel key <input id="panel-key" value="${escapeHTML(settings.panel)}"></label>
                </div>
                <div id="status">Ready</div>
            </div>
        `;
        shadow.appendChild(panel);

        shadow.querySelector('#shot').addEventListener('click', screenshot);
        shadow.querySelector('#record').addEventListener('click', () => state.recording ? stopRecording() : startRecording());

        const shotKey = shadow.querySelector('#shot-key');
        const recordKey = shadow.querySelector('#record-key');
        const panelKey = shadow.querySelector('#panel-key');

        shotKey.addEventListener('change', () => {
            settings.screenshot = shotKey.value.trim() || 'F8';
            saveSettings();
        });
        recordKey.addEventListener('change', () => {
            settings.record = recordKey.value.trim() || 'F9';
            saveSettings();
        });
        panelKey.addEventListener('change', () => {
            settings.panel = panelKey.value.trim() || 'F7';
            saveSettings();
        });

        makeDraggable(panel, shadow.querySelector('#head'));
    }

    function escapeHTML(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
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

        window.addEventListener('mouseup', () => {
            dragging = false;
        });
    }

    function togglePanel() {
        const panel = shadow.querySelector('#panel');
        if (!panel) return;
        panel.style.display = panel.style.display === 'none' ? '' : 'none';
    }

    function keyMatches(event, configured) {
        return event.key.toLowerCase() === String(configured).toLowerCase();
    }

    document.addEventListener('keydown', event => {
        if (event.defaultPrevented) return;
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target?.isContentEditable) return;
        if (event.repeat) return;

        if (keyMatches(event, settings.screenshot)) {
            event.preventDefault();
            screenshot();
        } else if (keyMatches(event, settings.record)) {
            event.preventDefault();
            state.recording ? stopRecording() : startRecording();
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
