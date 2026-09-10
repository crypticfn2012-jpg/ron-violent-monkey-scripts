// ==UserScript==
// @name         RON ClipTools
// @namespace    https://ron.cool/userscripts/cliptools
// @version      16.0.0
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

    var ID = '__RON_CLIPTOOLS_V1600__';
    var CLIP_SECONDS = 15;
    var KEEP_SECONDS = 20;
    var FPS = 30;
    var BITRATE = 5000000;

    var M = null;
    var panel = null;
    var settingsPanel = null;
    var output = null;
    var source = null;
    var running = false;
    var starting = false;
    var generation = 0;
    var retryTimer = null;
    var frame = 0;
    var header = null;
    var pendingMoof = null;
    var segments = [];
    var lastSegmentTime = -Infinity;

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

    function canvas() {
        var all = document.getElementsByTagName('canvas');
        var best = null;
        var area = 0;
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            var a = (c.width || 0) * (c.height || 0);
            if (a > area) { area = a; best = c; }
        }
        return best;
    }

    function name(prefix, ext) {
        var d = new Date();
        function p(n) { return String(n).padStart(2, '0'); }
        return prefix + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + '-' + p(d.getMinutes()) + '-' + p(d.getSeconds()) + ext;
    }

    function setStatus(text, temp) {
        if (!panel) return;
        var e = panel.querySelector('.ron-status');
        if (!e) return;
        e.textContent = text;
        if (temp) {
            clearTimeout(setStatus.timer);
            setStatus.timer = setTimeout(function () { e.textContent = 'Ready'; }, 1800);
        }
    }

    function download(blob, filename) {
        if (!blob || !blob.size) throw new Error('empty file');
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }

    function screenshot() {
        var c = canvas();
        if (!c) return setStatus('Screenshot unavailable', true);
        try {
            c.toBlob(function (blob) {
                try {
                    if (!blob) throw new Error('png');
                    download(blob, name('RON-Screenshot-', '.png'));
                    setStatus('Saved', true);
                } catch (_) { setStatus('Screenshot failed', true); }
            }, 'image/png');
        } catch (_) { setStatus('Screenshot failed', true); }
    }

    function loadMediabunny() {
        if (M) return Promise.resolve(M);
        return new Promise(function (resolve, reject) {
            var done = false;
            var timer = setTimeout(function () {
                if (!done) { done = true; reject(new Error('Mediabunny')); }
            }, 15000);

            function check() {
                var api = unsafeWindow && unsafeWindow.Mediabunny;
                if (api && !done) {
                    done = true;
                    clearTimeout(timer);
                    M = api;
                    resolve(api);
                    return true;
                }
                return !!api;
            }

            function fallbackText() {
                if (done || check()) return;
                try {
                    var text = GM_getResourceText('mediabunny');
                    if (!text) throw new Error();
                    GM_addElement(document.documentElement, 'script', { textContent: text });
                    setTimeout(function () {
                        if (!check() && !done) {
                            done = true;
                            clearTimeout(timer);
                            reject(new Error('Mediabunny'));
                        }
                    }, 2500);
                } catch (_) {
                    if (!done) { done = true; clearTimeout(timer); reject(new Error('Mediabunny')); }
                }
            }

            var url = '';
            try { url = GM_getResourceURL('mediabunny'); } catch (_) {}
            if (!url) return fallbackText();

            try {
                var script = GM_addElement(document.documentElement, 'script', { src: url });
                var fallback = setTimeout(function () { if (!check() && !done) fallbackText(); }, 4000);
                script.onload = function () {
                    clearTimeout(fallback);
                    setTimeout(function () { if (!check() && !done) fallbackText(); }, 50);
                };
                script.onerror = function () { clearTimeout(fallback); fallbackText(); };
            } catch (_) { fallbackText(); }
        });
    }

    function clearBuffer() {
        segments = [];
        header = null;
        pendingMoof = null;
        lastSegmentTime = -Infinity;
    }

    function copyBytes(data) {
        return new Uint8Array(data);
    }

    function trimSegments() {
        if (!segments.length) return;
        var newest = segments[segments.length - 1].time;
        var cutoff = newest - KEEP_SECONDS;
        var first = 0;
        while (first < segments.length && segments[first].time < cutoff) first++;
        if (first) segments.splice(0, first);
    }

    async function stopEncoder() {
        running = false;
        generation++;
        var s = source;
        var o = output;
        source = null;
        output = null;
        try { if (s) s.close(); } catch (_) {}
        try { if (o) await o.cancel(); } catch (_) {}
    }

    function retry() {
        if (retryTimer || running || starting) return;
        retryTimer = setTimeout(function () {
            retryTimer = null;
            start();
        }, 1200);
    }

    async function feed(c, myGeneration) {
        frame = 0;
        while (running && source && myGeneration === generation) {
            var started = performance.now();
            try {
                await source.add(frame / FPS, 1 / FPS);
                frame++;
            } catch (error) {
                console.error('[RON ClipTools] capture stopped:', error);
                await stopEncoder();
                retry();
                return;
            }
            var delay = Math.max(0, 1000 / FPS - (performance.now() - started));
            if (delay) await new Promise(function (r) { setTimeout(r, delay); });
        }
    }

    async function start() {
        if (running || starting) return;
        starting = true;
        try {
            var c = canvas();
            if (!c || !c.width || !c.height) throw new Error('canvas');
            if (!window.VideoEncoder || !window.VideoFrame) throw new Error('video');

            var api = await loadMediabunny();
            if (!api || !api.Output || !api.CanvasSource || !api.Mp4OutputFormat || !api.NullTarget || !api.Quality) throw new Error('media');

            var quality = new api.Quality({ bitrate: BITRATE });
            if (api.canEncodeVideo) {
                var supported = await api.canEncodeVideo('avc', {
                    width: c.width,
                    height: c.height,
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
                onFtyp: function (data) {
                    header = { ftyp: copyBytes(data), moov: null };
                },
                onMoov: function (data) {
                    if (!header) header = { ftyp: null, moov: null };
                    header.moov = copyBytes(data);
                },
                onMoof: function (data, position, timestamp) {
                    localMoof = { data: copyBytes(data), time: Number(timestamp) || 0 };
                },
                onMdat: function (data) {
                    if (!localMoof) return;
                    var mdat = copyBytes(data);
                    var joined = new Uint8Array(localMoof.data.length + mdat.length);
                    joined.set(localMoof.data, 0);
                    joined.set(mdat, localMoof.data.length);
                    segments.push({ time: localMoof.time, data: joined });
                    lastSegmentTime = localMoof.time;
                    trimSegments();
                    localMoof = null;
                }
            });

            var out = new api.Output({ format: format, target: new api.NullTarget() });
            var src = new api.CanvasSource(c, {
                codec: 'avc',
                quality: quality,
                latencyMode: 'realtime',
                hardwareAcceleration: 'prefer-hardware',
                keyFrameInterval: 1,
                alpha: 'discard'
            });

            out.addVideoTrack(src, { frameRate: FPS });
            await out.start();

            output = out;
            source = src;
            running = true;
            starting = false;
            var myGeneration = ++generation;
            setStatus('Ready', false);
            feed(c, myGeneration);
        } catch (error) {
            console.error('[RON ClipTools] start failed:', error);
            starting = false;
            running = false;
            setStatus('Getting ready', false);
            retry();
        }
    }

    function saveClip() {
        if (!running || !header || !header.ftyp || !header.moov || segments.length < 2) {
            setStatus('Getting ready', true);
            return;
        }

        var end = segments[segments.length - 1].time + 1;
        var target = end - CLIP_SECONDS;
        var first = 0;

        while (first < segments.length && segments[first].time < target) first++;
        if (first > 0) first--;
        if (first >= segments.length) first = Math.max(0, segments.length - 1);

        var chosen = segments.slice(first);
        if (!chosen.length) {
            setStatus('Getting ready', true);
            return;
        }

        try {
            var total = header.ftyp.length + header.moov.length;
            for (var i = 0; i < chosen.length; i++) total += chosen[i].data.length;
            var file = new Uint8Array(total);
            var offset = 0;
            file.set(header.ftyp, offset); offset += header.ftyp.length;
            file.set(header.moov, offset); offset += header.moov.length;
            for (var j = 0; j < chosen.length; j++) {
                file.set(chosen[j].data, offset);
                offset += chosen[j].data.length;
            }

            download(new Blob([file], { type: 'video/mp4' }), name('RON-Clip-15s-', '.mp4'));
            setStatus('Saved', true);
        } catch (error) {
            console.error('[RON ClipTools] save failed:', error);
            setStatus('Could not save', true);
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
            '<div class="status ron-status">Getting ready</div>';

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
            '#' + ID + ' .action:hover{background:rgba(65,255,132,.10)!important;border-color:rgba(65,255,132,.28)!important}' +
            '#' + ID + ' kbd{padding:3px 6px!important;border-radius:6px!important;background:rgba(255,255,255,.09)!important;color:#aeb8b1!important;font-size:10px!important}' +
            '#' + ID + ' .settings{width:100%!important;margin-top:4px!important;padding:9px!important;border:0!important;border-radius:9px!important;background:transparent!important;color:#7f8a83!important;cursor:pointer!important}' +
            '#' + ID + ' .settings:hover{background:rgba(255,255,255,.05)!important;color:#fff!important}' +
            '#' + ID + ' .status{padding:8px 4px 2px!important;color:#65e88d!important;font-size:10px!important;text-align:center!important}' +
            '#' + ID + ' .ron-settings{margin-top:8px!important;padding-top:10px!important;border-top:1px solid rgba(255,255,255,.08)!important}' +
            '#' + ID + ' .row{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;margin:8px 0!important;color:#aab3ad!important;font-size:11px!important}' +
            '#' + ID + ' .row input{width:75px!important;padding:7px!important;border:1px solid rgba(255,255,255,.10)!important;border-radius:8px!important;background:rgba(255,255,255,.06)!important;color:#fff!important;text-align:center!important;outline:none!important}' +
            '#' + ID + ' .save-settings{width:100%!important;margin-top:5px!important;padding:8px!important;border:0!important;border-radius:8px!important;background:#3df078!important;color:#07100a!important;font-weight:800!important;cursor:pointer!important}';

        document.head && document.head.appendChild(style);
        document.body.appendChild(panel);

        panel.querySelector('.close').onclick = function () { panel.style.display = 'none'; };
        panel.querySelector('.clip').onclick = saveClip;
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
            var c = settingsPanel.querySelector('.set-clip').value.trim().toUpperCase();
            var s = settingsPanel.querySelector('.set-shot').value.trim().toUpperCase();
            var p = settingsPanel.querySelector('.set-panel').value.trim().toUpperCase();
            if (c) settings.clip = c;
            if (s) settings.shot = s;
            if (p) settings.panel = p;
            saveSettings();
            panel.querySelector('.clip-key').textContent = settings.clip;
            panel.querySelector('.shot-key').textContent = settings.shot;
            settingsPanel.querySelector('.set-clip').value = settings.clip;
            settingsPanel.querySelector('.set-shot').value = settings.shot;
            settingsPanel.querySelector('.set-panel').value = settings.panel;
            setStatus('Saved', true);
        };
    }

    function keyboard(e) {
        if (!panel) return;
        var k = key(e);
        if (!k) return;
        if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
        if (k === settings.clip) { e.preventDefault(); saveClip(); return; }
        if (k === settings.shot) { e.preventDefault(); screenshot(); return; }
        if (k === settings.panel) { e.preventDefault(); panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; return; }
    }

    document.addEventListener('keydown', keyboard, true);

    function boot() {
        buildUI();
        start();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();

    setInterval(function () {
        if (!running && !starting) start();
        if (!panel && document.body) buildUI();
    }, 3000);
})();
