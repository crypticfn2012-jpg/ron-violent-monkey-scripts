// ==UserScript==
// @name         RON ClipTools
// @namespace    https://ron.cool/userscripts/cliptools
// @version      19.0.0
// @description  BuildNow GG rolling 15 second canvas clips
// @match        *://buildnow.gg/*
// @match        *://*.buildnow.gg/*
// @match        *://*.crazygames.com/game/buildnow-gg*
// @match        *://buildnow-gg.game-files.crazygames.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    var ID = '__RON_CLIPTOOLS_V19.00__';
    if (window[ID]) return;
    window[ID] = true;

    var isGameFrame = location.hostname === 'buildnow-gg.game-files.crazygames.com';
    var isCrazyGamesShell = window.top === window.self && location.hostname.indexOf('crazygames.com') !== -1 && location.pathname.indexOf('/game/buildnow-gg') === 0;

    var CLIP_SECONDS = 15;
    var KEEP_SECONDS = 20;
    var FPS = 60;
    var BITRATE = 5000000;
    var panel = null;
    var settingsPanel = null;
    var recorder = null;
    var canvasStream = null;
    var chunks = [];
    var recording = false;
    var starting = false;
    var settings = { clip: 'F9', shot: 'F8', panel: 'F7' };

    try {
        settings.clip = localStorage.getItem('ron_cliptools_clip') || 'F9';
        settings.shot = localStorage.getItem('ron_cliptools_shot') || 'F8';
        settings.panel = localStorage.getItem('ron_cliptools_panel') || 'F7';
    } catch (_) {}

    function saveSettings() {
        try {
            localStorage.setItem('ron_cliptools_clip', settings.clip);
            localStorage.setItem('ron_cliptools_shot', settings.shot);
            localStorage.setItem('ron_cliptools_panel', settings.panel);
        } catch (_) {}
    }

    function status(text, temporary) {
        if (!panel) return;
        var element = panel.querySelector('.ron-status');
        if (!element) return;
        element.textContent = text;
        if (temporary) {
            clearTimeout(status.timer);
            status.timer = setTimeout(function () { element.textContent = recording ? 'Recording' : 'Ready'; }, 1800);
        }
    }

    function fileName(prefix, extension) {
        var date = new Date();
        function pad(value) { return String(value).padStart(2, '0'); }
        return prefix + date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + '_' + pad(date.getHours()) + '-' + pad(date.getMinutes()) + '-' + pad(date.getSeconds()) + extension;
    }

    function download(blob, name) {
        if (!blob || !blob.size) throw new Error('Empty recording');
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }

    function gameCanvas() {
        var canvases = document.getElementsByTagName('canvas');
        var best = null;
        var largest = 0;
        for (var index = 0; index < canvases.length; index++) {
            var canvas = canvases[index];
            var rect = canvas.getBoundingClientRect();
            var area = Math.max(0, rect.width) * Math.max(0, rect.height);
            if (area > largest && rect.width > 32 && rect.height > 32) {
                largest = area;
                best = canvas;
            }
        }
        return best;
    }

    function screenshot() {
        var canvas = gameCanvas();
        if (!canvas) return status('Canvas unavailable', true);
        try {
            canvas.toBlob(function (blob) {
                try {
                    if (!blob) throw new Error('No image');
                    download(blob, fileName('RON-Screenshot-', '.png'));
                    status('Screenshot saved', true);
                } catch (_) { status('Screenshot failed', true); }
            }, 'image/png');
        } catch (_) { status('Screenshot failed', true); }
    }

    function chooseMime() {
        if (typeof MediaRecorder === 'undefined') return '';
        var types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
        for (var index = 0; index < types.length; index++) {
            if (MediaRecorder.isTypeSupported(types[index])) return types[index];
        }
        return '';
    }

    function stopRecorder() {
        try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch (_) {}
        try { if (canvasStream) canvasStream.getTracks().forEach(function (track) { track.stop(); }); } catch (_) {}
        recorder = null;
        canvasStream = null;
        recording = false;
        starting = false;
    }

    function startRecorder() {
        if (recording || starting) return;
        var canvas = gameCanvas();
        var mime = chooseMime();
        if (!canvas) return status('Game canvas not found', true);
        if (!mime || typeof canvas.captureStream !== 'function') return status('Canvas recording unavailable', true);

        starting = true;
        chunks = [];
        try {
            canvasStream = canvas.captureStream(FPS);
            recorder = new MediaRecorder(canvasStream, { mimeType: mime, videoBitsPerSecond: BITRATE });
            recorder.ondataavailable = function (event) {
                if (!event.data || !event.data.size) return;
                chunks.push({ time: Date.now(), blob: event.data });
                var cutoff = Date.now() - KEEP_SECONDS * 1000;
                while (chunks.length > 1 && chunks[1].time < cutoff) chunks.splice(1, 1);
            };
            recorder.onerror = function () {
                status('Recorder error', true);
                stopRecorder();
            };
            recorder.onstop = function () {
                if (recording) status('Recorder stopped', true);
                recording = false;
            };
            recorder.start(1000);
            recording = true;
            starting = false;
            status('Recording', false);
        } catch (error) {
            console.error('[RON ClipTools] start failed:', error);
            stopRecorder();
            status('Could not start recorder', true);
        }
    }

    function saveClip() {
        if (!recording || !recorder || recorder.state !== 'recording') return status('Press ' + settings.clip + ' to start recording', true);
        if (chunks.length < 2) return status('Recording needs a moment', true);
        var cutoff = Date.now() - CLIP_SECONDS * 1000;
        var recent = chunks.filter(function (chunk, index) { return index === 0 || chunk.time >= cutoff; });
        if (recent.length < 2) return status('Recording needs 15 seconds', true);
        try {
            download(new Blob(recent.map(function (chunk) { return chunk.blob; }), { type: recorder.mimeType || 'video/webm' }), fileName('RON-Clip-15s-', '.webm'));
            status('Clip saved', true);
        } catch (_) { status('Clip failed', true); }
    }

    function normalizeKey(value) {
        var text = String(value || '').trim().toUpperCase();
        return /^F(?:[1-9]|1[0-2])$/.test(text) ? text : '';
    }

    function togglePanel() {
        if (!panel) return;
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }

    function forwardToGameFrame(key) {
        var frames = document.querySelectorAll('iframe');
        for (var index = 0; index < frames.length; index++) {
            if (String(frames[index].src || '').indexOf('buildnow-gg.game-files.crazygames.com') !== -1) {
                try { frames[index].contentWindow.postMessage({ __ronClipTools: key }, '*'); } catch (_) {}
                return true;
            }
        }
        return false;
    }

    function buildUI() {
        if (isCrazyGamesShell || !document.body || document.getElementById(ID)) return;
        panel = document.createElement('div');
        panel.id = ID;
        panel.innerHTML = '<div class="head"><div><div class="title">RON ClipTools</div><div class="sub">BuildNow rolling replay</div></div><button class="close">×</button></div>' +
            '<button class="action clip"><span>Clip last 15s</span><kbd class="clip-key">' + settings.clip + '</kbd></button>' +
            '<button class="action shot"><span>Screenshot</span><kbd class="shot-key">' + settings.shot + '</kbd></button>' +
            '<button class="settings">Settings</button><div class="status ron-status">Ready</div>';
        var style = document.createElement('style');
        style.textContent = '#' + ID + '{position:fixed!important;right:18px!important;top:76px!important;width:270px!important;z-index:2147483647!important;padding:11px!important;background:rgba(12,16,14,.97)!important;color:#f4f7f5!important;border:1px solid rgba(65,255,132,.24)!important;border-radius:16px!important;box-shadow:0 18px 55px rgba(0,0,0,.5)!important;font:13px Arial,sans-serif!important}' +
            '#' + ID + ' *{box-sizing:border-box!important}' + '#' + ID + ' .head{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:4px 5px 11px!important}' +
            '#' + ID + ' .title{font-size:16px!important;font-weight:800!important}' + '#' + ID + ' .sub{margin-top:3px!important;color:#7d8982!important;font-size:10px!important}' +
            '#' + ID + ' button{font:inherit!important}' + '#' + ID + ' .close{border:0!important;background:transparent!important;color:#8d9891!important;font-size:21px!important;cursor:pointer!important;width:28px!important;height:28px!important}' +
            '#' + ID + ' .action,#' + ID + ' .settings{width:100%!important;border:1px solid rgba(255,255,255,.07)!important;background:rgba(255,255,255,.035)!important;color:#eef2ef!important;border-radius:11px!important;min-height:40px!important;margin:5px 0!important;padding:0 10px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;cursor:pointer!important}' +
            '#' + ID + ' kbd{font:600 10px Arial,sans-serif!important;color:#9ba69f!important;background:rgba(255,255,255,.06)!important;border:1px solid rgba(255,255,255,.08)!important;border-radius:6px!important;padding:4px 6px!important}' +
            '#' + ID + ' .settings{justify-content:center!important;min-height:34px!important;color:#aeb8b1!important}' + '#' + ID + ' .status{text-align:center!important;color:#69746d!important;font-size:10px!important;padding:6px 2px 2px!important}' +
            '#' + ID + ' .ron-settings{margin-top:6px!important;border-top:1px solid rgba(255,255,255,.06)!important;padding-top:9px!important}' + '#' + ID + ' .ron-settings label{display:block!important;color:#8e9992!important;font-size:10px!important;margin:7px 0 4px!important}' +
            '#' + ID + ' .ron-settings input{width:100%!important;height:32px!important;border-radius:8px!important;border:1px solid rgba(255,255,255,.08)!important;background:rgba(0,0,0,.25)!important;color:#fff!important;padding:0 9px!important}' +
            '#' + ID + ' .ron-save{width:100%!important;margin-top:9px!important;height:34px!important;border:0!important;border-radius:9px!important;background:rgba(65,255,132,.12)!important;color:#aaffc2!important;cursor:pointer!important}';
        document.head.appendChild(style);
        document.body.appendChild(panel);

        settingsPanel = document.createElement('div');
        settingsPanel.className = 'ron-settings';
        settingsPanel.style.display = 'none';
        settingsPanel.innerHTML = '<label>Clip hotkey</label><input class="in-clip" value="' + settings.clip + '"><label>Screenshot hotkey</label><input class="in-shot" value="' + settings.shot + '"><label>Panel hotkey</label><input class="in-panel" value="' + settings.panel + '"><button class="ron-save">Save</button>';
        panel.appendChild(settingsPanel);
        panel.querySelector('.close').onclick = function () { panel.style.display = 'none'; };
        panel.querySelector('.clip').onclick = function () { if (recording) saveClip(); else startRecorder(); };
        panel.querySelector('.shot').onclick = screenshot;
        panel.querySelector('.settings').onclick = function () { settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none'; };
        panel.querySelector('.ron-save').onclick = function () {
            var clip = normalizeKey(panel.querySelector('.in-clip').value);
            var shot = normalizeKey(panel.querySelector('.in-shot').value);
            var panelKey = normalizeKey(panel.querySelector('.in-panel').value);
            if (clip) settings.clip = clip;
            if (shot) settings.shot = shot;
            if (panelKey) settings.panel = panelKey;
            saveSettings();
            panel.querySelector('.clip-key').textContent = settings.clip;
            panel.querySelector('.shot-key').textContent = settings.shot;
            status('Settings saved', true);
        };
    }

    document.addEventListener('keydown', function (event) {
        if (isCrazyGamesShell) return;
        var target = event.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
        var key = String(event.key || '').toUpperCase();
        if (key === settings.panel) { togglePanel(); event.preventDefault(); }
        else if (key === settings.shot) { screenshot(); event.preventDefault(); }
        else if (key === settings.clip) { if (recording) saveClip(); else startRecorder(); event.preventDefault(); }
    }, true);

    if (isCrazyGamesShell) {
        document.addEventListener('keydown', function (event) {
            var key = String(event.key || '').toUpperCase();
            if (key !== settings.panel && key !== settings.shot && key !== settings.clip) return;
            if (forwardToGameFrame(key)) event.preventDefault();
        }, true);
        window.addEventListener('message', function (event) {
            if (event.data && event.data.__ronClipTools) return;
        });
    }

    window.addEventListener('message', function (event) {
        var key = event.data && event.data.__ronClipTools;
        if (!isGameFrame || !key) return;
        if (key === settings.panel) togglePanel();
        else if (key === settings.shot) screenshot();
        else if (key === settings.clip) { if (recording) saveClip(); else startRecorder(); }
    });

    function boot() {
        if (document.body) buildUI();
        else setTimeout(boot, 50);
    }
    boot();
})();
