// ==UserScript==
// @name         RON ClipTools
// @namespace    https://ron.cool/userscripts
// @version      4.0.0
// @description  RON ClipTools for BuildNow.GG - screenshots, configurable clips and recording
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

    const CLIPS_WEBSITE = 'https://ron.cool/clips';
    const DB_NAME = 'ron-cliptools-db';
    const DB_VERSION = 1;
    const DB_STORE = 'settings';

    const state = {
        recording: false,
        recorder: null,
        stream: null,
        chunks: [],
        timer: null,
        startedAt: 0,
        folderHandle: null
    };

    const settings = {
        screenshot: localStorage.getItem('ronClipToolsScreenshotKey') || 'F8',
        record: localStorage.getItem('ronClipToolsRecordKey') || 'F9',
        panel: localStorage.getItem('ronClipToolsPanelKey') || 'F7',
        duration: Number(localStorage.getItem('ronClipToolsDuration')) || 15
    };

    const root = document.createElement('div');
    root.id = ID;
    root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    const shadow = root.attachShadow ? root.attachShadow({ mode: 'open' }) : root;

    function saveSettings() {
        localStorage.setItem('ronClipToolsScreenshotKey', settings.screenshot);
        localStorage.setItem('ronClipToolsRecordKey', settings.record);
        localStorage.setItem('ronClipToolsPanelKey', settings.panel);
        localStorage.setItem('ronClipToolsDuration', String(settings.duration));
    }

    function fileTime() {
        const d = new Date();
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
    }

    function setStatus(text) {
        const el = shadow.querySelector('#status');
        if (el) el.textContent = text;
    }

    function escapeHTML(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function openDatabase() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) return resolve(null);
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(DB_STORE)) {
                    request.result.createObjectStore(DB_STORE);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        });
    }

    async function saveFolderHandle(handle) {
        state.folderHandle = handle;
        try {
            const db = await openDatabase();
            if (!db) return;
            await new Promise(resolve => {
                const tx = db.transaction(DB_STORE, 'readwrite');
                tx.objectStore(DB_STORE).put(handle, 'folder');
                tx.oncomplete = resolve;
                tx.onerror = resolve;
            });
            db.close();
        } catch (_) {}
    }

    async function loadFolderHandle() {
        if (state.folderHandle) return state.folderHandle;
        try {
            const db = await openDatabase();
            if (!db) return null;
            const handle = await new Promise(resolve => {
                const tx = db.transaction(DB_STORE, 'readonly');
                const request = tx.objectStore(DB_STORE).get('folder');
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => resolve(null);
            });
            db.close();
            state.folderHandle = handle;
            return handle;
        } catch (_) {
            return null;
        }
    }

    async function ensureFolderPermission(handle) {
        if (!handle) return false;
        try {
            if (handle.queryPermission) {
                const current = await handle.queryPermission({ mode: 'readwrite' });
                if (current === 'granted') return true;
            }
            if (handle.requestPermission) {
                return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
            }
        } catch (_) {}
        return false;
    }

    async function chooseSaveFolder() {
        if (!window.showDirectoryPicker) {
            setStatus('Folder saving is not supported - downloads will be used');
            return;
        }

        try {
            const handle = await window.showDirectoryPicker({
                id: 'ron-cliptools',
                mode: 'readwrite',
                startIn: 'downloads'
            });

            if (!(await ensureFolderPermission(handle))) {
                setStatus('Folder permission was not granted');
                return;
            }

            await saveFolderHandle(handle);
            const name = handle.name || 'selected folder';
            const el = shadow.querySelector('#folder-name');
            if (el) el.textContent = name;
            setStatus(`Saving to ${name}`);
        } catch (err) {
            if (err?.name !== 'AbortError') setStatus('Could not choose folder');
        }
    }

    async function saveBlob(blob, name) {
        if (!blob || !blob.size) {
            setStatus('Nothing to save');
            return;
        }

        const handle = await loadFolderHandle();
        if (handle && await ensureFolderPermission(handle)) {
            try {
                const fileHandle = await handle.getFileHandle(name, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                setStatus(`Saved ${name}`);
                return;
            } catch (err) {
                console.warn('[RON ClipTools] Folder save failed, using browser download.', err);
            }
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        setStatus(`Downloaded ${name}`);
    }

    async function restoreFolderLabel() {
        const handle = await loadFolderHandle();
        const label = shadow.querySelector('#folder-name');
        if (label && handle?.name) label.textContent = handle.name;
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
                saveBlob(blob, `RON-Screenshot-${fileTime()}.png`);
            }, 'image/png');
        } catch (err) {
            console.error('[RON ClipTools]', err);
            setStatus('Canvas screenshot unavailable');
        }
    }

    function getSupportedMimeType() {
        const types = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm'
        ];
        return types.find(type => MediaRecorder.isTypeSupported(type)) || '';
    }

    async function startRecording() {
        if (state.recording) return;

        if (!navigator.mediaDevices?.getDisplayMedia || !window.MediaRecorder) {
            return setStatus('Screen recording is not supported here');
        }

        try {
            state.stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });

            const mimeType = getSupportedMimeType();
            state.recorder = mimeType
                ? new MediaRecorder(state.stream, { mimeType })
                : new MediaRecorder(state.stream);

            state.chunks = [];
            state.startedAt = Date.now();

            state.recorder.ondataavailable = event => {
                if (event.data?.size) state.chunks.push(event.data);
            };

            state.recorder.onstop = async () => {
                const recorder = state.recorder;
                const type = recorder?.mimeType || 'video/webm';
                const blob = new Blob(state.chunks, { type });
                const name = `RON-Clip-${fileTime()}.webm`;
                clearClipTimer();
                cleanupRecording(false);
                await saveBlob(blob, name);
            };

            const track = state.stream.getVideoTracks()[0];
            if (track) {
                track.addEventListener('ended', () => {
                    if (state.recording) stopRecording();
                }, { once: true });
            }

            state.recorder.start(250);
            state.recording = true;
            updateRecordButton();
            setStatus(`Recording ${settings.duration}s clip...`);

            state.timer = setTimeout(() => {
                if (state.recording) stopRecording();
            }, settings.duration * 1000);
        } catch (err) {
            console.log('[RON ClipTools] Capture cancelled', err);
            cleanupRecording(true);
            setStatus('Recording cancelled');
        }
    }

    function clearClipTimer() {
        if (state.timer) clearTimeout(state.timer);
        state.timer = null;
    }

    function stopRecording() {
        clearClipTimer();
        if (!state.recorder) return cleanupRecording(true);
        if (state.recorder.state !== 'inactive') {
            state.recorder.stop();
        } else {
            cleanupRecording(true);
        }
    }

    function cleanupRecording(cancelled) {
        clearClipTimer();
        if (state.stream) {
            state.stream.getTracks().forEach(track => track.stop());
        }
        state.stream = null;
        state.recorder = null;
        state.chunks = [];
        state.recording = false;
        state.startedAt = 0;
        updateRecordButton();
        if (cancelled) setStatus('Ready');
    }

    function updateRecordButton() {
        const el = shadow.querySelector('#record');
        if (el) el.textContent = state.recording ? 'Stop Clip' : `Record ${settings.duration}s Clip`;
        const timer = shadow.querySelector('#record-timer');
        if (timer) timer.textContent = state.recording ? 'Recording...' : 'Ready';
    }

    function togglePanel() {
        const panel = shadow.querySelector('#panel');
        if (!panel) return;
        panel.style.display = panel.style.display === 'none' ? '' : 'none';
    }

    function keyMatches(event, configured) {
        return event.key.toLowerCase() === String(configured).toLowerCase();
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

    function createUI() {
        if (!document.body || shadow.querySelector('#panel')) return;

        const style = document.createElement('style');
        style.textContent = `
            :host { all: initial; }
            #panel {
                position: fixed;
                top: 80px;
                right: 20px;
                width: 310px;
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
            #record { background:#214d32; }
            #folder { background:#151d18; }
            #website { background:#35ff83; color:#061008; }
            #settings { border-top:1px solid #202b23; margin-top:8px; padding-top:8px; }
            .row { display:flex; align-items:center; justify-content:space-between; gap:10px; color:#aab5ae; font-size:12px; margin:8px 0; }
            input, select { width:94px; box-sizing:border-box; background:#080b09; color:#fff; border:1px solid #303b33; border-radius:6px; padding:6px; text-align:center; }
            select { text-align:left; }
            #folder-name { display:block; color:#35ff83; font-size:11px; margin:2px 0 8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            #record-timer { color:#35ff83; text-align:center; font-size:11px; margin:-2px 0 8px; min-height:13px; }
            #status { color:#6f7b73; text-align:center; font-size:11px; padding-top:3px; min-height:14px; }
            .small { color:#657168; font-size:10px; line-height:1.4; margin:4px 0 8px; }
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
                <button id="record">Record ${settings.duration}s Clip</button>
                <div id="record-timer">Ready</div>
                <button id="folder">Choose Save Folder</button>
                <span id="folder-name">Browser Downloads</span>
                <button id="website">RON Labs Clips</button>
                <div class="small">Choose a folder once and clips/screenshots will be written there when your browser allows it.</div>
                <div id="settings">
                    <div class="row">Clip length <select id="duration">
                        <option value="5">5 seconds</option>
                        <option value="10">10 seconds</option>
                        <option value="15">15 seconds</option>
                        <option value="30">30 seconds</option>
                        <option value="60">60 seconds</option>
                        <option value="120">120 seconds</option>
                    </select></div>
                    <div class="row">Screenshot key <input id="shot-key" value="${escapeHTML(settings.screenshot)}"></div>
                    <div class="row">Record key <input id="record-key" value="${escapeHTML(settings.record)}"></div>
                    <div class="row">Window key <input id="panel-key" value="${escapeHTML(settings.panel)}"></div>
                </div>
                <div id="status">Ready</div>
            </div>
        `;
        shadow.appendChild(panel);

        const duration = shadow.querySelector('#duration');
        duration.value = String(settings.duration);
        duration.addEventListener('change', () => {
            settings.duration = Number(duration.value) || 15;
            saveSettings();
            updateRecordButton();
            setStatus(`Clip length set to ${settings.duration}s`);
        });

        shadow.querySelector('#shot').addEventListener('click', screenshot);
        shadow.querySelector('#record').addEventListener('click', () => state.recording ? stopRecording() : startRecording());
        shadow.querySelector('#folder').addEventListener('click', chooseSaveFolder);
        shadow.querySelector('#website').addEventListener('click', () => window.open(CLIPS_WEBSITE, '_blank', 'noopener,noreferrer'));

        const shotKey = shadow.querySelector('#shot-key');
        const recordKey = shadow.querySelector('#record-key');
        const panelKey = shadow.querySelector('#panel-key');

        shotKey.addEventListener('change', () => {
            settings.screenshot = shotKey.value.trim() || 'F8';
            shotKey.value = settings.screenshot;
            saveSettings();
        });
        recordKey.addEventListener('change', () => {
            settings.record = recordKey.value.trim() || 'F9';
            recordKey.value = settings.record;
            saveSettings();
        });
        panelKey.addEventListener('change', () => {
            settings.panel = panelKey.value.trim() || 'F7';
            panelKey.value = settings.panel;
            saveSettings();
        });

        makeDraggable(panel, shadow.querySelector('#head'));
        restoreFolderLabel();
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