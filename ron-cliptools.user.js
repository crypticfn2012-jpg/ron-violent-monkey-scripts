// ==UserScript==
// @name         RON ClipTools
// @namespace    https://ron.cool/userscripts/cliptools
// @version      17.0.0
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

    var ID = '__RON_CLIPTOOLS_V1700__';
    var CLIP_SECONDS = 15;
    var KEEP_SECONDS = 20;
    var FPS = 30;
    var BITRATE = 5000000;

    var M = null, panel = null, settingsPanel = null;
    var output = null, source = null, stream = null, track = null;
    var running = false, starting = false;
    var header = null, segments = [];

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
        var e = panel.querySelector('.ron-status');
        if (!e) return;
        e.textContent = text;
        if (temporary) {
            clearTimeout(status.timer);
            status.timer = setTimeout(function () { e.textContent = 'Ready'; }, 1800);
        }
    }

    function gameCanvas() {
        var all = document.getElementsByTagName('canvas'), best = null, area = 0;
        for (var i = 0; i < all.length; i++) {
            var c = all[i], a = (c.width || 0) * (c.height || 0);
            if (a > area) { area = a; best = c; }
        }
        return best;
    }

    function fileName(prefix, ext) {
        var d = new Date();
        function p(n) { return String(n).padStart(2, '0'); }
        return prefix + d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + '-' + p(d.getMinutes()) + '-' + p(d.getSeconds()) + ext;
    }

    function download(blob, filename) {
        if (!blob || !blob.size) throw new Error('empty');
        var url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }

    function screenshot() {
        var c = gameCanvas();
        if (!c) return status('Screenshot unavailable', true);
        try {
            c.toBlob(function (b) {
                try { if (!b) throw 0; download(b, fileName('RON-Screenshot-', '.png')); status('Saved', true); }
                catch (_) { status('Screenshot failed', true); }
            }, 'image/png');
        } catch (_) { status('Screenshot failed', true); }
    }

    function loadMediabunny() {
        if (M) return Promise.resolve(M);
        return new Promise(function (resolve, reject) {
            var done = false;
            var timer = setTimeout(function () { if (!done) { done = true; reject(new Error('Mediabunny')); } }, 15000);
            function check() {
                var api = unsafeWindow && unsafeWindow.Mediabunny;
                if (api && !done) { done = true; clearTimeout(timer); M = api; resolve(api); return true; }
                return !!api;
            }
            function textFallback() {
                if (done || check()) return;
                try {
                    var text = GM_getResourceText('mediabunny');
                    if (!text) throw 0;
                    GM_addElement(document.documentElement, 'script', { textContent: text });
                    setTimeout(function () { if (!check() && !done) { done = true; clearTimeout(timer); reject(new Error('Mediabunny')); } }, 2500);
                } catch (_) { if (!done) { done = true; clearTimeout(timer); reject(new Error('Mediabunny')); } }
            }
            var url = '';
            try { url = GM_getResourceURL('mediabunny'); } catch (_) {}
            if (!url) return textFallback();
            try {
                var s = GM_addElement(document.documentElement, 'script', { src: url });
                var fb = setTimeout(function () { if (!check() && !done) textFallback(); }, 4000);
                s.onload = function () { clearTimeout(fb); setTimeout(function () { if (!check() && !done) textFallback(); }, 50); };
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
        try { if (s) s.close(); } catch (_) {}
        try { if (o) await o.cancel(); } catch (_) {}
        try { if (t) t.stop(); } catch (_) {}
        try { if (st) st.getTracks().forEach(function (x) { x.stop(); }); } catch (_) {}
    }

    async function requestCapture() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) throw new Error('capture');
        var s = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: { ideal: FPS, max: FPS } },
            audio: false,
            preferCurrentTab: true,
            selfBrowserSurface: 'include',
            surfaceSwitching: 'exclude'
        });
        var t = s.getVideoTracks()[0];
        if (!t) throw new Error('track');

        var c = gameCanvas();
        var cropped = false;
        try {
            if (c && typeof CropTarget !== 'undefined' && typeof t.cropTo === 'function') {
                var target = await CropTarget.fromElement(c);
                await t.cropTo(target);
                cropped = true;
            }
        } catch (_) {}
        try {
            if (!cropped && c && typeof RestrictionTarget !== 'undefined' && typeof t.restrictTo === 'function') {
                var rt = await RestrictionTarget.fromElement(c);
                await t.restrictTo(rt);
                cropped = true;
            }
        } catch (_) {}

        var crop = null;
        if (!cropped && c) {
            var rect = c.getBoundingClientRect(), ts = t.getSettings();
            var vw = window.innerWidth || rect.width, vh = window.innerHeight || rect.height;
            var sw = ts.width || vw, sh = ts.height || vh;
            var left = Math.max(0, rect.left / vw * sw);
            var top = Math.max(0, rect.top / vh * sh);
            var width = Math.min(sw - left, rect.width / vw * sw);
            var height = Math.min(sh - top, rect.height / vh * sh);
            if (width > 16 && height > 16) crop = { left: left, top: top, width: width, height: height };
        }
        t.addEventListener('ended', function () {
            if (running) { running = false; status('Capture ended', true); }
        });
        return { stream: s, track: t, crop: crop };
    }

    async function startFromGesture() {
        if (running || starting) return true;
        starting = true;
        try {
            status('Allow capture', false);
            var cap = await requestCapture();
            var api = await loadMediabunny();
            if (!api || !api.Output || !api.MediaStreamVideoTrackSource || !api.Mp4OutputFormat || !api.NullTarget || !api.Quality) throw new Error('media');
            var ts = cap.track.getSettings();
            var quality = new api.Quality({ bitrate: BITRATE });
            if (api.canEncodeVideo) {
                var supported = await api.canEncodeVideo('avc', {
                    width: ts.width || 1280,
                    height: ts.height || 720,
                    quality: quality,
                    framerate: FPS,
                    latencyMode: 'realtime'
                });
                if (!supported) throw new Error('codec');
            }

            clearBuffer();
            var localMoof = null;
            var format = new api.Mp4OutputFormat({
                fastStart: 'fragmented',
                minimumFragmentDuration: 1,
                onFtyp: function (d) { header = { ftyp: bytes(d), moov: null }; },
                onMoov: function (d) { if (!header) header = { ftyp: null, moov: null }; header.moov = bytes(d); },
                onMoof: function (d, pos, time) { localMoof = { data: bytes(d), time: Number(time) || 0 }; },
                onMdat: function (d) {
                    if (!localMoof) return;
                    var m = bytes(d), joined = new Uint8Array(localMoof.data.length + m.length);
                    joined.set(localMoof.data, 0); joined.set(m, localMoof.data.length);
                    segments.push({ time: localMoof.time, data: joined });
                    trim(); localMoof = null;
                }
            });
            var out = new api.Output({ format: format, target: new api.NullTarget() });
            var cfg = {
                codec: 'avc', quality: quality, latencyMode: 'realtime',
                hardwareAcceleration: 'prefer-hardware', keyFrameInterval: 1, alpha: 'discard'
            };
            if (cap.crop) cfg.transform = { crop: cap.crop, frameRate: FPS };
            var src = new api.MediaStreamVideoTrackSource(cap.track, cfg);
            if (src.errorPromise) src.errorPromise.catch(function (e) {
                console.error('[RON ClipTools] capture source error:', e);
                if (running) { running = false; status('Capture ended', true); }
            });
            out.addVideoTrack(src, { frameRate: FPS });
            await out.start();
            stream = cap.stream; track = cap.track; output = out; source = src;
            running = true; starting = false;
            status('Ready', false);
            return true;
        } catch (e) {
            console.error('[RON ClipTools] capture start failed:', e);
            starting = false;
            try { if (track) track.stop(); } catch (_) {}
            try { if (stream) stream.getTracks().forEach(function (x) { x.stop(); }); } catch (_) {}
            track = null; stream = null;
            status('Capture needed', true);
            return false;
        }
    }

    function saveClip() {
        if (!running || !header || !header.ftyp || !header.moov || segments.length < 2) {
            status('Getting ready', true);
            return;
        }
        var end = segments[segments.length - 1].time + 1;
        var target = end - CLIP_SECONDS, first = 0;
        while (first < segments.length && segments[first].time < target) first++;
        if (first > 0) first--;
        var chosen = segments.slice(first);
        try {
            var total = header.ftyp.length + header.moov.length;
            chosen.forEach(function (x) { total += x.data.length; });
            var file = new Uint8Array(total), off = 0;
            file.set(header.ftyp, off); off += header.ftyp.length;
            file.set(header.moov, off); off += header.moov.length;
            chosen.forEach(function (x) { file.set(x.data, off); off += x.data.length; });
            download(new Blob([file], { type: 'video/mp4' }), fileName('RON-Clip-15s-', '.mp4'));
            status('Saved', true);
        } catch (e) {
            console.error('[RON ClipTools] save failed:', e);
            status('Could not save', true);
        }
    }

    function key(e) {
        if (e.code && /^F(?:[1-9]|1[0-2])$/.test(e.code)) return e.code;
        return e.key ? String(e.key).toUpperCase() : '';
    }

    function toggleSettings() {
        if (!settingsPanel) return;
        settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
    }

    function buildUI() {
        if (!document.body || document.getElementById(ID)) return;
        panel = document.createElement('div');
        panel.id = ID;
        panel.innerHTML =
            '<div class="head"><div><div class="title">RON ClipTools</div><div class="sub">BuildNow instant replay</div></div><button class="close">×</button></div>' +
            '<button class="action clip"><span>Clip last 15s</span><kbd class="clip-key">' + settings.clip + '</kbd></button>' +
            '<button class="action shot"><span>Screenshot</span><kbd class="shot-key">' + settings.shot + '</kbd></button>' +
            '<button class="settings">Settings</button>' +
            '<div class="status ron-status">Ready</div>';
        var style = document.createElement('style');
        style.textContent =
            '#' + ID + '{position:fixed!important;right:18px!important;top:76px!important;width:270px!important;z-index:2147483647!important;padding:11px!important;background:rgba(12,16,14,.97)!important;color:#f4f7f5!important;border:1px solid rgba(65,255,132,.24)!important;border-radius:16px!important;box-shadow:0 18px 55px rgba(0,0,0,.5)!important;backdrop-filter:blur(16px)!important;font:13px Arial,sans-serif!important}' +
            '#' + ID + ' *{box-sizing:border-box!important}' +
            '#' + ID + ' .head{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:4px 5px 11px!important}' +
            '#' + ID + ' .title{font-size:16px!important;font-weight:800!important}' +
            '#' + ID + ' .sub{margin-top:3px!important;color:#7d8982!important;font-size:10px!important}' +
            '#' + ID + ' button{font:inherit!important}' +
            '#' + ID + ' .close{border:0!important;background:transparent!important;color:#8d9891!important;font-size:21px!important;cursor:pointer!important;width:28px!important;height:28px!important;border-radius:8px!important}' +
            '#' + ID + ' .close:hover{background:rgba(255,255,255,.07)!important;color:#fff!important}' +
            '#' + ID + ' .action{width:100%!important;display:flex!important;align-items:center!important;justify-content:space-between!important;margin:7px 0!important;padding:11px 12px!important;border:1px solid rgba(255,255,255,.08)!important;border-radius:11px!important;background:rgba(255,255,255,.045)!important;color:#fff!important;cursor:pointer!important;text-align:left!important}' +
            '#' + ID + ' .action:hover{background:rgba(65,255,132,.10)!important;border-color:rgba(65,255,132,.24)!important}' +
            '#' + ID + ' kbd{padding:3px 7px!important;border-radius:6px!important;background:rgba(255,255,255,.08)!important;color:#a9b5ad!important;font-size:10px!important}' +
            '#' + ID + ' .settings{width:100%!important;border:0!important;background:transparent!important;color:#8d9891!important;padding:8px!important;cursor:pointer!important}' +
            '#' + ID + ' .settings:hover{color:#fff!important}' +
            '#' + ID + ' .status{text-align:center!important;color:#7d8982!important;font-size:10px!important;padding:6px 0 2px!important}' +
            '#' + ID + ' .ron-settings{margin-top:7px!important;padding-top:9px!important;border-top:1px solid rgba(255,255,255,.07)!important}' +
            '#' + ID + ' .row{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;margin:7px 0!important;color:#aeb8b1!important;font-size:11px!important}' +
            '#' + ID + ' .row input{width:58px!important;padding:6px!important;border:1px solid rgba(255,255,255,.1)!important;border-radius:7px!important;background:rgba(255,255,255,.05)!important;color:#fff!important;text-align:center!important;outline:none!important}' +
            '#' + ID + ' .save-settings{width:100%!important;margin-top:6px!important;padding:8px!important;border:0!important;border-radius:8px!important;background:rgba(65,255,132,.12)!important;color:#baffcd!important;cursor:pointer!important}';
        document.head.appendChild(style); document.body.appendChild(panel);

        panel.querySelector('.close').onclick = function () { panel.style.display = 'none'; };
        panel.querySelector('.clip').onclick = function () {
            if (!running && !starting) startFromGesture().then(function (ok) { if (ok) setTimeout(saveClip, 250); });
            else saveClip();
        };
        panel.querySelector('.shot').onclick = screenshot;
        panel.querySelector('.settings').onclick = toggleSettings;

        settingsPanel = document.createElement('div');
        settingsPanel.className = 'ron-settings';
        settingsPanel.style.display = 'none';
        settingsPanel.innerHTML =
            '<div class="row"><span>Clip hotkey</span><input class="set-clip" value="' + settings.clip + '" maxlength="8"></div>' +
            '<div class="row"><span>Screenshot hotkey</span><input class="set-shot" value="' + settings.shot + '" maxlength="8"></div>' +
            '<div class="row"><span>Panel hotkey</span><input class="set-panel" value="' + settings.panel + '" maxlength="8"></div>' +
            '<button class="save-settings">Save</button>';
        panel.appendChild(settingsPanel);
        settingsPanel.querySelector('.save-settings').onclick = function () {
            settings.clip = settingsPanel.querySelector('.set-clip').value.trim().toUpperCase() || 'F9';
            settings.shot = settingsPanel.querySelector('.set-shot').value.trim().toUpperCase() || 'F8';
            settings.panel = settingsPanel.querySelector('.set-panel').value.trim().toUpperCase() || 'F7';
            saveSettings();
            panel.querySelector('.clip-key').textContent = settings.clip;
            panel.querySelector('.shot-key').textContent = settings.shot;
            toggleSettings();
        };
    }

    function keyboard(e) {
        var k = key(e);
        if (k === settings.clip) {
            e.preventDefault(); e.stopPropagation();
            if (!running && !starting) startFromGesture().then(function (ok) { if (ok) setTimeout(saveClip, 250); });
            else saveClip();
        } else if (k === settings.shot) {
            e.preventDefault(); e.stopPropagation(); screenshot();
        } else if (k === settings.panel) {
            e.preventDefault(); e.stopPropagation();
            if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }
    }

    function boot() {
        buildUI();
        document.addEventListener('keydown', keyboard, true);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
