// ==UserScript==
// @name         RON ClipTools
// @namespace    https://ron.cool/userscripts/cliptools
// @version      18.0.0
// @description  RON ClipTools - instant 15 second replay clips for BuildNow.GG
// @author       Ron
// @homepageURL  https://crypticfn2012-jpg.github.io/ron-violent-monkey-scripts/
// @supportURL   https://github.com/crypticfn2012-jpg/ron-violent-monkey-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-cliptools.user.js
// @updateURL    https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-cliptools.user.js
// @match        *://buildnow.gg/*
// @match        *://*.buildnow.gg/*
// @match        *://buildnow-gg.game-files.crazygames.com/*
// @run-at       document-end
// @grant        GM_addElement
// @grant        GM_getResourceURL
// @grant        GM_getResourceText
// @grant        unsafeWindow
// @resource     mediabunny https://cdn.jsdelivr.net/npm/mediabunny@1.56.1/dist/bundles/mediabunny.cjs
// ==/UserScript==
(function () {
    'use strict';

    var IS_TOP = window.top === window;
    var ID = '__RON_CLIPTOOLS_V1800__';
    var CLIP_SECONDS = 15, KEEP_SECONDS = 20, FPS = 30, BITRATE = 5000000;

    if (!IS_TOP) {
        window.addEventListener('keydown', function (e) {
            var k = e.code || '';
            if (/^F(?:7|8|9)$/.test(k)) {
                try { window.top.postMessage({ __ronClipTools: k }, '*'); } catch (_) {}
            }
        }, true);
        return;
    }

    var M = null, panel = null, settingsPanel = null;
    var output = null, source = null, stream = null, track = null;
    var running = false, starting = false, header = null, segments = [];
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
        var e = panel.querySelector('.ron-status'); if (!e) return;
        e.textContent = text;
        if (temporary) { clearTimeout(status.timer); status.timer = setTimeout(function () { e.textContent = 'Ready'; }, 1800); }
    }
    function fileName(prefix, ext) {
        var d = new Date(); function p(n) { return String(n).padStart(2, '0'); }
        return prefix + d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + '-' + p(d.getMinutes()) + '-' + p(d.getSeconds()) + ext;
    }
    function download(blob, filename) {
        if (!blob || !blob.size) throw new Error('empty');
        var url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }
    function gameCanvas() {
        var all = document.getElementsByTagName('canvas'), best = null, area = 0;
        for (var i = 0; i < all.length; i++) {
            var c = all[i], r = c.getBoundingClientRect(), a = Math.max(0, r.width) * Math.max(0, r.height);
            if (a > area && r.width > 32 && r.height > 32) { area = a; best = c; }
        }
        return best;
    }
    function gameFrame() {
        var all = document.getElementsByTagName('iframe'), best = null, area = 0;
        for (var i = 0; i < all.length; i++) {
            var f = all[i], r = f.getBoundingClientRect(), a = Math.max(0, r.width) * Math.max(0, r.height);
            if (a > area && r.width > 200 && r.height > 150) {
                var s = getComputedStyle(f);
                if (s.display !== 'none' && s.visibility !== 'hidden') { area = a; best = f; }
            }
        }
        return best;
    }
    function captureTarget() { return gameCanvas() || gameFrame() || document.body; }
    function screenshot() {
        var c = gameCanvas();
        if (!c) return status('Screenshot unavailable', true);
        try { c.toBlob(function (b) { try { if (!b) throw 0; download(b, fileName('RON-Screenshot-', '.png')); status('Saved', true); } catch (_) { status('Screenshot failed', true); } }, 'image/png'); }
        catch (_) { status('Screenshot failed', true); }
    }
    function loadMediabunny() {
        if (M) return Promise.resolve(M);
        return new Promise(function (resolve, reject) {
            var done = false, timer = setTimeout(function () { if (!done) { done = true; reject(new Error('Mediabunny timed out')); } }, 15000);
            function check() {
                var api = unsafeWindow && unsafeWindow.Mediabunny;
                if (api && !done) { done = true; clearTimeout(timer); M = api; resolve(api); return true; }
                return !!api;
            }
            function textFallback() {
                if (done || check()) return;
                try {
                    var text = GM_getResourceText('mediabunny'); if (!text) throw 0;
                    GM_addElement(document.documentElement, 'script', { textContent: text });
                    setTimeout(function () { if (!check() && !done) { done = true; clearTimeout(timer); reject(new Error('Mediabunny unavailable')); } }, 3000);
                } catch (_) { if (!done) { done = true; clearTimeout(timer); reject(new Error('Mediabunny unavailable')); } }
            }
            var url = ''; try { url = GM_getResourceURL('mediabunny'); } catch (_) {}
            if (!url) return textFallback();
            try {
                var s = GM_addElement(document.documentElement, 'script', { src: url });
                var fb = setTimeout(function () { if (!check() && !done) textFallback(); }, 5000);
                s.onload = function () { clearTimeout(fb); setTimeout(function () { if (!check() && !done) textFallback(); }, 100); };
                s.onerror = function () { clearTimeout(fb); textFallback(); };
            } catch (_) { textFallback(); }
        });
    }
    function clearBuffer() { segments = []; header = null; }
    function bytes(x) { return new Uint8Array(x); }
    function trim() {
        if (!segments.length) return;
        var cutoff = segments[segments.length - 1].time - KEEP_SECONDS;
        while (segments.length && segments[0].time < cutoff) segments.shift();
    }
    async function stopCapture() {
        running = false;
        var s = source, o = output, t = track, st = stream;
        source = null; output = null; track = null; stream = null;
        try { if (s && s.close) s.close(); } catch (_) {}
        try { if (o && o.cancel) await o.cancel(); } catch (_) {}
        try { if (t) t.stop(); } catch (_) {}
        try { if (st) st.getTracks().forEach(function (x) { x.stop(); }); } catch (_) {}
    }
    async function cropStreamTrack(t, target) {
        if (!target || target === document.body) return false;
        try {
            if (typeof RestrictionTarget !== 'undefined' && typeof RestrictionTarget.fromElement === 'function' && typeof t.restrictTo === 'function') {
                var rt = await RestrictionTarget.fromElement(target); await t.restrictTo(rt); return true;
            }
        } catch (_) {}
        try {
            if (typeof CropTarget !== 'undefined' && typeof CropTarget.fromElement === 'function' && typeof t.cropTo === 'function') {
                var ct = await CropTarget.fromElement(target); await t.cropTo(ct); return true;
            }
        } catch (_) {}
        return false;
    }
    function manualCrop(target, t) {
        try {
            if (!target || target === document.body) return null;
            var r = target.getBoundingClientRect(), ts = t.getSettings(), vw = Math.max(1, innerWidth), vh = Math.max(1, innerHeight);
            var sw = ts.width || vw, sh = ts.height || vh;
            var left = Math.max(0, Math.round(r.left / vw * sw)), top = Math.max(0, Math.round(r.top / vh * sh));
            var width = Math.min(sw - left, Math.round(r.width / vw * sw)), height = Math.min(sh - top, Math.round(r.height / vh * sh));
            if (width > 32 && height > 32) return { left: left, top: top, width: width, height: height };
        } catch (_) {}
        return null;
    }
    async function requestCapture() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) throw new Error('Screen capture unavailable');
        var s = await navigator.mediaDevices.getDisplayMedia({
            video: { displaySurface: 'browser', frameRate: { ideal: FPS, max: FPS } },
            audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude'
        });
        var t = s.getVideoTracks()[0]; if (!t) throw new Error('No capture track');
        var target = captureTarget(), restricted = await cropStreamTrack(t, target), crop = restricted ? null : manualCrop(target, t);
        t.addEventListener('ended', function () { if (running) { running = false; status('Capture ended', true); } });
        return { stream: s, track: t, crop: crop };
    }
    async function startCapture() {
        if (running || starting) return true;
        starting = true; status('Allow capture', false);
        try {
            var cap = await requestCapture(), api = await loadMediabunny();
            if (!api || !api.Output || !api.MediaStreamVideoTrackSource || !api.Mp4OutputFormat || !api.NullTarget || !api.Quality) throw new Error('Mediabunny unavailable');
            var ts = cap.track.getSettings(), width = ts.width || 1280, height = ts.height || 720, quality = new api.Quality({ bitrate: BITRATE });
            if (api.canEncodeVideo) {
                var supported = await api.canEncodeVideo('avc', { width: width, height: height, quality: quality, frameRate: FPS, latencyMode: 'realtime' });
                if (!supported) throw new Error('AVC encoder unavailable');
            }
            clearBuffer();
            var localMoof = null;
            var format = new api.Mp4OutputFormat({
                fastStart: 'fragmented', minimumFragmentDuration: 1,
                onFtyp: function (d) { header = { ftyp: bytes(d), moov: null }; },
                onMoov: function (d) { if (!header) header = { ftyp: null, moov: null }; header.moov = bytes(d); },
                onMoof: function (d, pos, time) { localMoof = { data: bytes(d), time: Number(time) || 0 }; },
                onMdat: function (d) {
                    if (!localMoof) return;
                    var m = bytes(d), joined = new Uint8Array(localMoof.data.length + m.length);
                    joined.set(localMoof.data, 0); joined.set(m, localMoof.data.length);
                    segments.push({ time: localMoof.time, data: joined }); trim(); localMoof = null;
                }
            });
            var out = new api.Output({ format: format, target: new api.NullTarget() });
            var cfg = { codec: 'avc', quality: quality, latencyMode: 'realtime', hardwareAcceleration: 'prefer-hardware', keyFrameInterval: 1, alpha: 'discard' };
            if (cap.crop) cfg.transform = { crop: cap.crop, frameRate: FPS };
            var src = new api.MediaStreamVideoTrackSource(cap.track, cfg);
            if (src.errorPromise) src.errorPromise.catch(function (e) { console.error('[RON ClipTools] source error:', e); if (running) { running = false; status('Capture ended', true); } });
            out.addVideoTrack(src, { frameRate: FPS }); await out.start();
            stream = cap.stream; track = cap.track; output = out; source = src; running = true; starting = false; status('Ready', false); return true;
        } catch (e) {
            console.error('[RON ClipTools] capture start failed:', e); starting = false;
            try { if (track) track.stop(); } catch (_) {} try { if (stream) stream.getTracks().forEach(function (x) { x.stop(); }); } catch (_) {}
            track = null; stream = null; source = null; output = null;
            var name = e && e.name ? e.name : ''; status(name === 'NotAllowedError' ? 'Capture blocked' : name === 'AbortError' ? 'Capture cancelled' : 'Capture failed', true); return false;
        }
    }
    function saveClip() {
        if (!running || !header || !header.ftyp || !header.moov || segments.length < 2) return status('Getting ready', true);
        try {
            var end = segments[segments.length - 1].time + 1, target = end - CLIP_SECONDS, first = 0;
            while (first < segments.length && segments[first].time < target) first++; if (first > 0) first--;
            var chosen = segments.slice(first); if (!chosen.length) throw new Error('No segments');
            var total = header.ftyp.length + header.moov.length; chosen.forEach(function (x) { total += x.data.length; });
            var file = new Uint8Array(total), off = 0; file.set(header.ftyp, off); off += header.ftyp.length; file.set(header.moov, off); off += header.moov.length;
            chosen.forEach(function (x) { file.set(x.data, off); off += x.data.length; });
            download(new Blob([file], { type: 'video/mp4' }), fileName('RON-Clip-15s-', '.mp4')); status('Saved', true);
        } catch (e) { console.error('[RON ClipTools] save failed:', e); status('Could not save', true); }
    }
    function key(e) { if (e.code && /^F(?:[1-9]|1[0-2])$/.test(e.code)) return e.code; return e.key ? String(e.key).toUpperCase() : ''; }
    function toggleSettings() { if (settingsPanel) settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none'; }

    function buildUI() {
        if (!document.body || document.getElementById(ID)) return;
        panel = document.createElement('div'); panel.id = ID;
        panel.innerHTML = '<div class="head"><div><div class="title">RON ClipTools</div><div class="sub">BuildNow instant replay</div></div><button class="close">×</button></div>' +
            '<button class="action clip"><span>Clip last 15s</span><kbd class="clip-key">' + settings.clip + '</kbd></button>' +
            '<button class="action shot"><span>Screenshot</span><kbd class="shot-key">' + settings.shot + '</kbd></button>' +
            '<button class="settings">Settings</button><div class="status ron-status">Ready</div>';
        var style = document.createElement('style');
        style.textContent = '#' + ID + '{position:fixed!important;right:18px!important;top:76px!important;width:270px!important;z-index:2147483647!important;padding:11px!important;background:rgba(12,16,14,.97)!important;color:#f4f7f5!important;border:1px solid rgba(65,255,132,.24)!important;border-radius:16px!important;box-shadow:0 18px 55px rgba(0,0,0,.5)!important;backdrop-filter:blur(16px)!important;font:13px Arial,sans-serif!important}' +
            '#' + ID + ' *{box-sizing:border-box!important}' + '#' + ID + ' .head{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:4px 5px 11px!important}' +
            '#' + ID + ' .title{font-size:16px!important;font-weight:800!important}' + '#' + ID + ' .sub{margin-top:3px!important;color:#7d8982!important;font-size:10px!important}' + '#' + ID + ' button{font:inherit!important}' +
            '#' + ID + ' .close{border:0!important;background:transparent!important;color:#8d9891!important;font-size:21px!important;cursor:pointer!important;width:28px!important;height:28px!important;border-radius:8px!important;display:flex!important;align-items:center!important;justify-content:center!important}' +
            '#' + ID + ' .close:hover{background:rgba(255,255,255,.07)!important;color:#fff!important}' + '#' + ID + ' .action,#' + ID + ' .settings{width:100%!important;border:1px solid rgba(255,255,255,.07)!important;background:rgba(255,255,255,.035)!important;color:#eef2ef!important;border-radius:11px!important;min-height:40px!important;margin:5px 0!important;padding:0 10px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;cursor:pointer!important}' +
            '#' + ID + ' .action:hover,#' + ID + ' .settings:hover{background:rgba(255,255,255,.07)!important;border-color:rgba(65,255,132,.18)!important}' + '#' + ID + ' kbd{font:600 10px Arial,sans-serif!important;color:#9ba69f!important;background:rgba(255,255,255,.06)!important;border:1px solid rgba(255,255,255,.08)!important;border-radius:6px!important;padding:4px 6px!important}' +
            '#' + ID + ' .settings{justify-content:center!important;min-height:34px!important;color:#aeb8b1!important}' + '#' + ID + ' .status{text-align:center!important;color:#69746d!important;font-size:10px!important;padding:6px 2px 2px!important}' +
            '#' + ID + ' .ron-settings{margin-top:6px!important;border-top:1px solid rgba(255,255,255,.06)!important;padding-top:9px!important}' + '#' + ID + ' .ron-settings label{display:block!important;color:#8e9992!important;font-size:10px!important;margin:7px 0 4px!important}' +
            '#' + ID + ' .ron-settings input{width:100%!important;height:32px!important;border-radius:8px!important;border:1px solid rgba(255,255,255,.08)!important;background:rgba(0,0,0,.25)!important;color:#fff!important;padding:0 9px!important;outline:none!important}' +
            '#' + ID + ' .ron-save{width:100%!important;margin-top:9px!important;height:34px!important;border:0!important;border-radius:9px!important;background:rgba(65,255,132,.12)!important;color:#aaffc2!important;cursor:pointer!important}';
        document.head.appendChild(style); document.body.appendChild(panel);
        settingsPanel = document.createElement('div'); settingsPanel.className = 'ron-settings'; settingsPanel.style.display = 'none';
        settingsPanel.innerHTML = '<label>Clip hotkey</label><input class="in-clip" value="' + settings.clip + '"><label>Screenshot hotkey</label><input class="in-shot" value="' + settings.shot + '"><label>Panel hotkey</label><input class="in-panel" value="' + settings.panel + '"><button class="ron-save">Save</button>';
        panel.appendChild(settingsPanel);
        panel.querySelector('.close').onclick = function () { panel.style.display = 'none'; };
        panel.querySelector('.clip').onclick = function () { if (!running) startCapture().then(function (ok) { if (ok) status('Recording', true); }); else saveClip(); };
        panel.querySelector('.shot').onclick = screenshot; panel.querySelector('.settings').onclick = toggleSettings;
        panel.querySelector('.ron-save').onclick = function () {
            var a = panel.querySelector('.in-clip').value.trim().toUpperCase(), b = panel.querySelector('.in-shot').value.trim().toUpperCase(), c = panel.querySelector('.in-panel').value.trim().toUpperCase();
            if (a) settings.clip = a; if (b) settings.shot = b; if (c) settings.panel = c; saveSettings();
            panel.querySelector('.clip-key').textContent = settings.clip; panel.querySelector('.shot-key').textContent = settings.shot; status('Saved', true);
        };
    }

    window.addEventListener('message', function (e) {
        var k = e.data && e.data.__ronClipTools; if (!k) return;
        if (k === settings.panel) { if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; }
        else if (k === settings.shot) screenshot();
        else if (k === settings.clip && running) saveClip();
    });
    document.addEventListener('keydown', function (e) {
        var k = key(e);
        if (k === settings.panel) { if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; e.preventDefault(); }
        else if (k === settings.shot) { screenshot(); e.preventDefault(); }
        else if (k === settings.clip && running) { saveClip(); e.preventDefault(); }
    }, true);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI, { once: true }); else buildUI();
})();
