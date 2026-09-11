// ==UserScript==
// @name         ClipTools [RON LABS]
// @namespace    https://roncool.cc.cd/
// @version      2.4.3
// @description  Clip Your Buildnow GG clips in style
// @match        *://buildnow.gg/*
// @match        *://*.buildnow.gg/*
// @match        *://*.crazygames.com/game/buildnow-gg*
// @match        *://buildnow-gg.game-files.crazygames.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const ID = '__CLIPTOOLS_V240__';
    if (window[ID]) return;
    window[ID] = true;

    const isGameFrame = location.hostname === 'buildnow-gg.game-files.crazygames.com';
    const isCrazyGamesShell = window.top === window.self &&
        location.hostname.indexOf('crazygames.com') !== -1 &&
        location.pathname.indexOf('/game/buildnow-gg') === 0;

    // ===== Real Quality Settings =====
    const CLIP_SECONDS   = 15;
    const NUM_SLOTS      = 3;            // lower = better performance
    const SLOT_INTERVAL  = 5000;
    const CAPTURE_FPS    = 60;
    const TARGET_WIDTH   = 1920;
    const TARGET_HEIGHT  = 1080;
    const BITRATE        = 18_000_000;   // 16 Mbps

    // ===== State =====
    let panel = null;
    let settingsPanel = null;
    let gameCanvas = null;
    let recordCanvas = null;
    let recordCtx = null;
    let canvasStream = null;
    let mimeType = '';
    let isSaving = false;
    let slots = [];
    let head = 0;
    let slotTimer = null;
    let drawTimer = null;
    let canvasRetryTimer = null;

    let settings = { clip: 'F9', shot: 'F8', panel: 'F7' };
    try {
        settings.clip  = localStorage.getItem('ct_clip_key')  || 'F9';
        settings.shot  = localStorage.getItem('ct_shot_key')  || 'F8';
        settings.panel = localStorage.getItem('ct_panel_key') || 'F7';
    } catch (_) {}

    function saveSettings() {
        try {
            localStorage.setItem('ct_clip_key',  settings.clip);
            localStorage.setItem('ct_shot_key',  settings.shot);
            localStorage.setItem('ct_panel_key', settings.panel);
        } catch (_) {}
    }

    function updateStatus(text, temporary) {
        if (!panel) return;
        const el = panel.querySelector('.ct-status');
        if (!el) return;
        el.textContent = text;
        if (temporary) {
            clearTimeout(updateStatus.timer);
            updateStatus.timer = setTimeout(() => {
                el.textContent = canvasStream ? 'Recording ● 1080p60' : 'Ready';
            }, 2500);
        }
    }

    function getFileName(prefix, ext) {
        const d = new Date();
        const p = v => String(v).padStart(2, '0');
        return `${prefix}${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}${ext}`;
    }

    function downloadFile(blob, name) {
        if (!blob || !blob.size) throw new Error('Empty blob');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }

    function getGameCanvas() {
        const canvases = document.getElementsByTagName('canvas');
        let best = null, maxArea = 0;
        for (let i = 0; i < canvases.length; i++) {
            const c = canvases[i];
            const r = c.getBoundingClientRect();
            const area = Math.max(0, r.width) * Math.max(0, r.height);
            if (area > maxArea && r.width > 120 && r.height > 120) {
                maxArea = area;
                best = c;
            }
        }
        return best;
    }

    function selectMimeType() {
        const candidates = [
            'video/mp4;codecs=avc1.640028',
            'video/mp4;codecs=avc1.4D4028',
            'video/mp4;codecs=avc1.42E01E',
            'video/mp4;codecs=avc1',
            'video/mp4',
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm'
        ];
        for (const t of candidates) {
            if (MediaRecorder.isTypeSupported(t)) return t;
        }
        return '';
    }

    function setupRecordCanvas(source) {
        if (!recordCanvas) {
            recordCanvas = document.createElement('canvas');
            recordCanvas.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
            document.body.appendChild(recordCanvas);
            recordCtx = recordCanvas.getContext('2d', { alpha: false });
        }

        // Force 1080p output
        let targetW = TARGET_WIDTH;
        let targetH = TARGET_HEIGHT;

        // Keep even
        targetW = targetW - (targetW % 2);
        targetH = targetH - (targetH % 2);

        if (recordCanvas.width !== targetW || recordCanvas.height !== targetH) {
            recordCanvas.width = targetW;
            recordCanvas.height = targetH;
        }

        recordCtx.imageSmoothingEnabled = true;
        recordCtx.imageSmoothingQuality = 'high';

        return { w: targetW, h: targetH };
    }

    function startDrawLoop() {
        if (drawTimer) return;

        const interval = 1000 / CAPTURE_FPS;
        let last = 0;

        function tick(now) {
            if (!gameCanvas || !recordCtx) {
                drawTimer = requestAnimationFrame(tick);
                return;
            }

            if (now - last >= interval - 0.5) {
                last = now;
                try {
                    // Scale the game canvas into 1080p cleanly
                    recordCtx.imageSmoothingEnabled = true;
                    recordCtx.imageSmoothingQuality = 'high';
                    recordCtx.drawImage(gameCanvas, 0, 0, recordCanvas.width, recordCanvas.height);
                } catch (_) {}
            }
            drawTimer = requestAnimationFrame(tick);
        }
        drawTimer = requestAnimationFrame(tick);
    }

    function stopDrawLoop() {
        if (drawTimer) {
            cancelAnimationFrame(drawTimer);
            drawTimer = null;
        }
    }

    function createSlot() {
        if (!canvasStream) return null;

        const chunks = [];
        let recorder;
        try {
            recorder = new MediaRecorder(canvasStream, {
                mimeType,
                videoBitsPerSecond: BITRATE
            });
        } catch (e) {
            console.error('ClipTools: MediaRecorder create failed', e);
            return null;
        }

        recorder.ondataavailable = e => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        recorder.onerror = e => console.error('ClipTools recorder error', e);

        try {
            recorder.start();
        } catch (err) {
            console.error('ClipTools start failed', err);
            return null;
        }

        return { recorder, startTime: Date.now(), chunks };
    }

    function stopSlot(slot) {
        return new Promise(resolve => {
            if (!slot || !slot.recorder || slot.recorder.state === 'inactive') {
                resolve(null);
                return;
            }
            const rec = slot.recorder;
            rec.onstop = () => {
                const blob = new Blob(slot.chunks, { type: mimeType });
                resolve(blob.size > 2000 ? blob : null);
            };
            try { rec.stop(); } catch (_) { resolve(null); }
        });
    }

    function startRolling() {
        if (slotTimer) return;

        slots = [];
        for (let i = 0; i < NUM_SLOTS; i++) {
            const s = createSlot();
            if (s) slots.push(s);
        }
        head = 0;

        slotTimer = setInterval(() => {
            const old = slots[head];
            if (old) {
                try {
                    if (old.recorder && old.recorder.state !== 'inactive') {
                        old.recorder.stop();
                    }
                } catch (_) {}
            }

            const fresh = createSlot();
            if (fresh) slots[head] = fresh;
            head = (head + 1) % slots.length;
        }, SLOT_INTERVAL);

        updateStatus('Recording ● ');
        console.log('RON ClipTools');
    }

    function stopRolling() {
        if (slotTimer) {
            clearInterval(slotTimer);
            slotTimer = null;
        }
        slots.forEach(s => {
            try {
                if (s.recorder && s.recorder.state !== 'inactive') s.recorder.stop();
            } catch (_) {}
        });
        slots = [];
    }

    async function saveClip() {
        if (isSaving) {
            updateStatus('Already saving…', true);
            return;
        }
        if (!canvasStream || slots.length === 0) {
            updateStatus('Not recording yet', true);
            return;
        }

        isSaving = true;
        updateStatus('Saving 1080p60 clip…');

        try {
            let best = null;
            let bestAge = 0;
            const now = Date.now();

            for (const s of slots) {
                if (!s || !s.recorder) continue;
                const age = (now - s.startTime) / 1000;
                if (age > bestAge) {
                    bestAge = age;
                    best = s;
                }
            }

            if (!best || bestAge < 4) {
                updateStatus('Wait a few more seconds', true);
                isSaving = false;
                return;
            }

            const blob = await stopSlot(best);
            if (!blob) {
                updateStatus('Empty clip – try again', true);
                isSaving = false;
                return;
            }

            const idx = slots.indexOf(best);
            if (idx !== -1) slots[idx] = createSlot();

            const ext = mimeType.startsWith('video/mp4') ? '.mp4' : '.webm';
            downloadFile(blob, getFileName('clip-1080p60-', ext));
            updateStatus(`1080p60 Clip saved (${Math.round(bestAge)}s)`, true);
        } catch (err) {
            console.error('ClipTools saveClip', err);
            updateStatus('Save failed', true);
        }

        isSaving = false;
    }

    function captureScreenshot() {
        const canvas = getGameCanvas();
        if (!canvas) {
            updateStatus('Canvas not found', true);
            return;
        }
        try {
            canvas.toBlob(blob => {
                if (!blob) throw new Error('toBlob failed');
                downloadFile(blob, getFileName('screenshot-', '.png'));
                updateStatus('Screenshot saved', true);
            }, 'image/png');
        } catch (e) {
            console.error(e);
            updateStatus('Screenshot failed', true);
        }
    }

    function startStream(retryCount = 0) {
        if (canvasStream) return;

        gameCanvas = getGameCanvas();
        if (!gameCanvas) {
            if (retryCount < 25) {
                canvasRetryTimer = setTimeout(() => startStream(retryCount + 1), 400);
            } else {
                updateStatus('No canvas found', true);
            }
            return;
        }

        mimeType = selectMimeType();
        if (!mimeType) {
            updateStatus('No supported codec', true);
            return;
        }

        try {
            const size = setupRecordCanvas(gameCanvas);
            startDrawLoop();

            canvasStream = recordCanvas.captureStream(CAPTURE_FPS);

            canvasStream.getVideoTracks().forEach(t => {
                t.onended = () => {
                    console.warn('ClipTools: track ended – restarting');
                    stopEverything();
                    setTimeout(() => startStream(0), 1000);
                };
            });

            startRolling();
            console.log(`ClipTools 1080p60 ready → ${mimeType} | ${size.w}x${size.h} @ ${CAPTURE_FPS}fps | ${BITRATE/1e6}Mbps`);
        } catch (err) {
            console.error('ClipTools startStream', err);
            updateStatus('Start failed', true);
            canvasStream = null;
        }
    }

    function stopEverything() {
        stopRolling();
        stopDrawLoop();
        if (canvasStream) {
            canvasStream.getTracks().forEach(t => t.stop());
            canvasStream = null;
        }
        if (canvasRetryTimer) {
            clearTimeout(canvasRetryTimer);
            canvasRetryTimer = null;
        }
    }

    // ===== UI only inside the real game =====
    function buildInterface() {
        if (!isGameFrame) return;
        if (!document.body || document.getElementById(ID)) return;

        panel = document.createElement('div');
        panel.id = ID;
        panel.innerHTML = `
            <div class="ct-header">
                <div class="ct-title">ClipTools [RON LABS]</div>
                <button class="ct-close">×</button>
            </div>
            <button class="ct-btn ct-clip"><span>Clip (15s)</span><kbd>${settings.clip}</kbd></button>
            <button class="ct-btn ct-shot"><span>Screenshot</span><kbd>${settings.shot}</kbd></button>
            <button class="ct-btn ct-settings">Settings</button>
            <div class="ct-status">Starting…</div>
        `;

        const style = document.createElement('style');
        style.textContent = `
            #${ID}{position:fixed!important;right:16px!important;top:80px!important;width:260px!important;z-index:2147483647!important;padding:10px!important;background:rgba(20,20,20,.95)!important;color:#e0e0e0!important;border:1px solid rgba(100,200,150,.25)!important;border-radius:12px!important;box-shadow:0 8px 32px rgba(0,0,0,.55)!important;font:12px system-ui,sans-serif!important}
            #${ID} *{box-sizing:border-box!important;margin:0!important;padding:0!important}
            #${ID} .ct-header{display:flex!important;justify-content:space-between!important;align-items:center!important;padding-bottom:8px!important;border-bottom:1px solid rgba(100,200,150,.15)!important;margin-bottom:6px!important}
            #${ID} .ct-title{font-size:14px!important;font-weight:700!important}
            #${ID} .ct-close{background:transparent!important;color:#666!important;font-size:20px!important;cursor:pointer!important;border:none!important;width:24px!important;height:24px!important;display:flex!important;align-items:center!important;justify-content:center!important}
            #${ID} .ct-close:hover{color:#aaa!important}
            #${ID} .ct-btn,#${ID} .ct-settings{width:100%!important;border:1px solid rgba(255,255,255,.08)!important;background:rgba(255,255,255,.03)!important;color:#d0d0d0!important;border-radius:8px!important;min-height:38px!important;margin:5px 0!important;padding:8px 10px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;cursor:pointer!important;font:12px system-ui,sans-serif!important;transition:all .12s!important}
            #${ID} .ct-btn:hover,#${ID} .ct-settings:hover{background:rgba(100,200,150,.12)!important;border-color:rgba(100,200,150,.35)!important}
            #${ID} .ct-btn span{flex:1!important;text-align:left!important}
            #${ID} kbd{font:600 9px monospace!important;color:#888!important;background:rgba(0,0,0,.35)!important;border:1px solid rgba(255,255,255,.08)!important;border-radius:4px!important;padding:3px 6px!important;margin-left:6px!important}
            #${ID} .ct-settings{justify-content:center!important;font-weight:600!important;color:#aaa!important}
            #${ID} .ct-status{text-align:center!important;color:#666!important;font-size:10px!important;padding:6px 0!important;min-height:16px!important}
            #${ID} .ct-settings-panel{display:none!important;margin-top:8px!important;border-top:1px solid rgba(255,255,255,.06)!important;padding-top:8px!important}
            #${ID} .ct-settings-panel.active{display:block!important}
            #${ID} .ct-settings-panel label{display:block!important;color:#777!important;font-size:9px!important;margin:6px 0 3px!important;font-weight:600!important;text-transform:uppercase!important}
            #${ID} .ct-settings-panel input{width:100%!important;height:30px!important;border-radius:6px!important;border:1px solid rgba(255,255,255,.1)!important;background:rgba(0,0,0,.3)!important;color:#fff!important;padding:0 8px!important;font:11px monospace!important}
            #${ID} .ct-settings-panel input:focus{outline:none!important;border-color:rgba(100,200,150,.4)!important}
            #${ID} .ct-save{width:100%!important;margin-top:8px!important;height:32px!important;border:0!important;border-radius:7px!important;background:rgba(100,200,150,.15)!important;color:#88cc99!important;cursor:pointer!important;font:11px system-ui,sans-serif!important;font-weight:700!important}
            #${ID} .ct-save:hover{background:rgba(100,200,150,.22)!important}
        `;
        document.head.appendChild(style);
        document.body.appendChild(panel);

        settingsPanel = document.createElement('div');
        settingsPanel.className = 'ct-settings-panel';
        settingsPanel.innerHTML = `
            <label>Clip Key</label><input class="ct-in-clip" value="${settings.clip}" maxlength="3">
            <label>Screenshot Key</label><input class="ct-in-shot" value="${settings.shot}" maxlength="3">
            <label>Panel Key</label><input class="ct-in-panel" value="${settings.panel}" maxlength="3">
            <button class="ct-save">Save</button>
        `;
        panel.appendChild(settingsPanel);

        panel.querySelector('.ct-close').onclick = () => panel.style.display = 'none';
        panel.querySelector('.ct-clip').onclick = () => saveClip();
        panel.querySelector('.ct-shot').onclick = () => captureScreenshot();
        panel.querySelector('.ct-settings').onclick = () => settingsPanel.classList.toggle('active');
        panel.querySelector('.ct-save').onclick = () => {
            const nc = validateKey(panel.querySelector('.ct-in-clip').value);
            const ns = validateKey(panel.querySelector('.ct-in-shot').value);
            const np = validateKey(panel.querySelector('.ct-in-panel').value);
            if (nc) settings.clip = nc;
            if (ns) settings.shot = ns;
            if (np) settings.panel = np;
            saveSettings();
            panel.querySelector('.ct-clip kbd').textContent = settings.clip;
            panel.querySelector('.ct-shot kbd').textContent = settings.shot;
            updateStatus('Keys saved', true);
        };
    }

    function validateKey(v) {
        const k = String(v || '').trim().toUpperCase();
        return /^F(?:[1-9]|1[0-2])$/.test(k) ? k : '';
    }

    function togglePanel() {
        if (!panel) return;
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }

    function sendToFrame(key) {
        const frames = document.querySelectorAll('iframe');
        for (const f of frames) {
            if (f.src && f.src.indexOf('buildnow-gg.game-files.crazygames.com') !== -1) {
                try {
                    f.contentWindow.postMessage({ __ctKey: key }, '*');
                    return true;
                } catch (e) {}
            }
        }
        return false;
    }

    // Keyboard
    document.addEventListener('keydown', e => {
        if (isCrazyGamesShell) return;

        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

        const key = String(e.key || '').toUpperCase();
        if (key === settings.panel) {
            togglePanel();
            e.preventDefault();
        } else if (key === settings.shot) {
            captureScreenshot();
            e.preventDefault();
        } else if (key === settings.clip) {
            saveClip();
            e.preventDefault();
        }
    }, true);

    if (isCrazyGamesShell) {
        document.addEventListener('keydown', e => {
            const key = String(e.key || '').toUpperCase();
            if (key === settings.panel || key === settings.shot || key === settings.clip) {
                if (sendToFrame(key)) e.preventDefault();
            }
        }, true);
    }

    window.addEventListener('message', e => {
        const key = e.data && e.data.__ctKey;
        if (!isGameFrame || !key) return;
        if (key === settings.panel) togglePanel();
        else if (key === settings.shot) captureScreenshot();
        else if (key === settings.clip) saveClip();
    });

    function initialize() {
        if (!document.body) {
            setTimeout(initialize, 40);
            return;
        }

        if (isGameFrame) {
            buildInterface();
            setTimeout(() => startStream(0), 700);
        }

        console.log('ClipTools 1080p60 ready');
    }

    initialize();
})();
