// ==UserScript==
// @name         RON ClipTools
// @namespace    https://ron.cool/userscripts/cliptools
// @version      15.0.0
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

    var ID = '__RON_CLIPTOOLS_V1500__';
    var CLIP_SECONDS = 15;
    var BUFFER_SECONDS = 18;
    var FPS = 30;
    var BITRATE = 5000000;

    var panel = null;
    var settingsPanel = null;
    var M = null;
    var liveOutput = null;
    var liveSource = null;
    var packets = [];
    var recording = false;
    var starting = false;
    var generation = 0;
    var restartTimer = null;
    var exportQueue = Promise.resolve();
    var encoderMeta = null;
    var frameIndex = 0;

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
        var el = panel.querySelector('.ron-status');
        if (!el) return;
        el.textContent = text;
        if (temporary) {
            clearTimeout(status.timer);
            status.timer = setTimeout(function () { el.textContent = 'Ready'; }, 1800);
        }
    }

    function canvas() {
        var all = document.getElementsByTagName('canvas');
        var best = null, size = 0;
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            var area = (c.width || 0) * (c.height || 0);
            if (area > size) { size = area; best = c; }
        }
        return best;
    }

    function fileName(prefix, ext) {
        var d = new Date();
        function p(n) { return String(n).padStart(2, '0'); }
        return prefix + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + '-' + p(d.getMinutes()) + '-' + p(d.getSeconds()) + ext;
    }

    function download(blob, name) {
        if (!blob || !blob.size) throw new Error('empty');
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }

    function screenshot() {
        var c = canvas();
        if (!c) return status('Screenshot unavailable', true);
        try {
            c.toBlob(function (b) {
                try {
                    if (!b) throw new Error();
                    download(b, fileName('RON-Screenshot-', '.png'));
                    status('Saved', true);
                } catch (_) { status('Screenshot failed', true); }
            }, 'image/png');
        } catch (_) { status('Screenshot failed', true); }
    }

    function loadMediabunny() {
        if (M) return Promise.resolve(M);
        return new Promise(function (resolve, reject) {
            var existing = unsafeWindow && unsafeWindow.Mediabunny;
            if (existing) { M = existing; resolve(existing); return; }
            var finished = false;
            var timer = setTimeout(function () {
                if (!finished) { finished = true; reject(new Error('media')); }
            }, 12000);
            function check() {
                var api = unsafeWindow && unsafeWindow.Mediabunny;
                if (api && !finished) {
                    finished = true;
                    clearTimeout(timer);
                    M = api;
                    resolve(api);
                    return true;
                }
                return !!api;
            }
            function textFallback() {
                if (finished || check()) return;
                try {
                    var text = GM_getResourceText('mediabunny');
                    if (!text) throw new Error();
                    GM_addElement(document.documentElement, 'script', { textContent: text });
                    setTimeout(function () {
                        if (!check() && !finished) {
                            finished = true;
                            clearTimeout(timer);
                            reject(new Error('media'));
                        }
                    }, 2000);
                } catch (_) {
                    if (!finished) { finished = true; clearTimeout(timer); reject(new Error('media')); }
                }
            }
            var url = '';
            try { url = GM_getResourceURL('mediabunny'); } catch (_) {}
            if (!url) return textFallback();
            try {
                var script = GM_addElement(document.documentElement, 'script', { src: url });
                var fallback = setTimeout(function () { if (!check() && !finished) textFallback(); }, 3500);
                script.onload = function () {
                    clearTimeout(fallback);
                    setTimeout(function () { if (!check() && !finished) textFallback(); }, 0);
                };
                script.onerror = function () { clearTimeout(fallback); textFallback(); };
            } catch (_) { textFallback(); }
        });
    }

    function endTime(item) { return item.p.timestamp + item.p.duration; }

    function newest(list) {
        var n = -Infinity;
        for (var i = 0; i < list.length; i++) n = Math.max(n, endTime(list[i]));
        return n;
    }

    function trim() {
        if (!packets.length) return;
        var cutoff = newest(packets) - BUFFER_SECONDS;
        var first = 0;
        while (first < packets.length && packets[first].p.timestamp < cutoff) first++;
        if (first > 0) {
            while (first > 0 && first < packets.length && packets[first].p.type !== 'key') first--;
            packets.splice(0, first);
        }
    }

    async function stopLive() {
        generation++;
        recording = false;
        var source = liveSource;
        var output = liveOutput;
        liveSource = null;
        liveOutput = null;
        try { if (source) source.close(); } catch (_) {}
        try { if (output) await output.cancel(); } catch (_) {}
    }

    function restartLater(delay) {
        if (restartTimer || recording || starting) return;
        restartTimer = setTimeout(function () {
            restartTimer = null;
            startBuffer();
        }, delay || 500);
    }

    async function capture(c, myGeneration) {
        frameIndex = 0;
        while (recording && liveSource && myGeneration === generation) {
            var started = performance.now();
            try {
                await liveSource.add(frameIndex / FPS, 1 / FPS);
                frameIndex++;
            } catch (_) {
                await stopLive();
                restartLater(500);
                return;
            }
            var wait = Math.max(0, 1000 / FPS - (performance.now() - started));
            if (wait) await new Promise(function (r) { setTimeout(r, wait); });
        }
    }

    async function startBuffer() {
        if (recording || starting) return;
        starting = true;
        try {
            var c = canvas();
            if (!c || !c.width || !c.height) throw new Error('canvas');
            if (!window.VideoEncoder || !window.VideoFrame) throw new Error('video');

            var api = await loadMediabunny();
            if (!api || !api.Output || !api.CanvasSource || !api.EncodedVideoPacketSource || !api.Mp4OutputFormat || !api.BufferTarget || !api.NullTarget || !api.Quality) throw new Error('media');

            var quality = new api.Quality({ bitrate: BITRATE });
            if (api.canEncodeVideo) {
                var can = await api.canEncodeVideo('avc', {
                    width: c.width,
                    height: c.height,
                    quality: quality,
                    framerate: FPS,
                    latencyMode: 'realtime'
                });
                if (!can) throw new Error('codec');
            }

            packets = [];
            encoderMeta = null;

            var output = new api.Output({
                format: new api.Mp4OutputFormat({ fastStart: false }),
                target: new api.NullTarget()
            });

            var source = new api.CanvasSource(c, {
                codec: 'avc',
                quality: quality,
                latencyMode: 'realtime',
                hardwareAcceleration: 'prefer-hardware',
                keyFrameInterval: 0.25,
                alpha: 'discard',
                onEncodedPacket: function (packet, meta) {
                    try {
                        packets.push({ p: packet.clone(), meta: meta || null });
                        if (!encoderMeta && meta && meta.decoderConfig) encoderMeta = meta;
                        trim();
                    } catch (_) {}
                }
            });

            output.addVideoTrack(source, { frameRate: FPS });
            await output.start();
            liveOutput = output;
            liveSource = source;
            recording = true;
            starting = false;
            var myGeneration = ++generation;
            capture(c, myGeneration);
        } catch (_) {
            starting = false;
            recording = false;
            restartLater(1800);
        }
    }

    function clipPackets(snapshot) {
        if (!snapshot.length) return null;
        var end = newest(snapshot);
        var target = end - CLIP_SECONDS;
        var start = -1;
        var best = -Infinity;

        for (var i = 0; i < snapshot.length; i++) {
            var item = snapshot[i];
            if (item.p.type === 'key' && item.p.timestamp <= target && item.p.timestamp > best) {
                best = item.p.timestamp;
                start = i;
            }
        }

        if (start < 0) {
            for (var j = 0; j < snapshot.length; j++) {
                if (snapshot[j].p.type === 'key') { start = j; break; }
            }
        }
        if (start < 0) return null;

        var out = snapshot.slice(start);
        out.sort(function (a, b) {
            var as = typeof a.p.sequenceNumber === 'number' ? a.p.sequenceNumber : 0;
            var bs = typeof b.p.sequenceNumber === 'number' ? b.p.sequenceNumber : 0;
            if (as !== bs) return as - bs;
            return a.p.timestamp - b.p.timestamp;
        });
        return out;
    }

    async function exportClip(snapshot) {
        var chosen = clipPackets(snapshot);
        if (!chosen || chosen.length < 2 || chosen[0].p.type !== 'key') throw new Error('clip');

        var first = chosen[0];
        var meta = first.meta || encoderMeta;
        if (!meta || !meta.decoderConfig) throw new Error('metadata');

        var target = new M.BufferTarget();
        var output = new M.Output({
            format: new M.Mp4OutputFormat({ fastStart: false }),
            target: target
        });
        var source = new M.EncodedVideoPacketSource('avc');
        output.addVideoTrack(source, {
            frameRate: FPS,
            decoderConfig: meta.decoderConfig
        });
        await output.start();

        var base = first.p.timestamp;
        for (var i = 0; i < chosen.length; i++) {
            var item = chosen[i];
            var packet = item.p.clone({ timestamp: Math.max(0, item.p.timestamp - base) });
            await source.add(packet, i === 0 ? meta : undefined);
        }

        source.close();
        await output.finalize();

        var buffer = target.buffer;
        if (!buffer || !buffer.byteLength) throw new Error('empty');

        download(new Blob([buffer], { type: 'video/mp4' }), fileName('RON-Clip-15s-', '.mp4'));
    }

    function clip() {
        if (!recording || !liveSource || packets.length < 2) {
            status('Getting ready', true);
            return;
        }
        var snapshot = packets.slice();
        status('Saving...', false);
        exportQueue = exportQueue.then(function () {
            return exportClip(snapshot);
        }).then(function () {
            status('Saved', true);
        }).catch(function (error) {
            console.error('[RON ClipTools] clip export failed:', error);
            status('Could not save', true);
        });
    }

    function key(e) {
        if (e.code && /^F(?:[1-9]|1[0-2])$/.test(e.code)) return e.code;
        return e.key ? e.key.toUpperCase() : '';
    }

    function toggleSettings() {
        if (!settingsPanel) return;
        settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
    }

    function ui() {
        if (!document.body || document.getElementById(ID)) return;

        panel = document.createElement('div');
        panel.id = ID;
        panel.innerHTML =
            '<div class="head"><div><div class="title">RON ClipTools</div><div class="sub">BuildNow instant replay</div></div><button class="close">×</button></div>' +
            '<button class="action clip"><span>Clip last 15s</span><kbd class="clip-key">' + settings.clip + '</kbd></button>' +
            '<button class="action shot"><span>Screenshot</span><kbd class="shot-key">' + settings.shot + '</kbd></button>' +
            '<button class="settings">Settings</button><div class="status ron-status">Ready</div>';

        var css = document.createElement('style');
        css.textContent =
            '#' + ID + '{position:fixed!important;right:18px!important;top:76px!important;width:270px!important;z-index:2147483647!important;padding:11px!important;background:rgba(12,16,14,.97)!important;color:#f4f7f5!important;border:1px solid rgba(65,255,132,.24)!important;border-radius:16px!important;box-shadow:0 18px 55px rgba(0,0,0,.5)!important;backdrop-filter:blur(16px)!important;font:13px Arial,sans-serif!important}' +
            '#' + ID + ' *{box-sizing:border-box!important}' +
            '#' + ID + ' .head{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:4px 5px 11px!important}' +
            '#' + ID + ' .title{font-size:16px!important;font-weight:800!important}' +
            '#' + ID + ' .sub{margin-top:3px!important;color:#7d8982!important;font-size:10px!important}' +
            '#' + ID + ' .close{border:0!important;background:transparent!important;color:#7d8982!important;font-size:20px!important;cursor:pointer!important}' +
            '#' + ID + ' .action{width:100%!important;display:flex!important;align-items:center!important;justify-content:space-between!important;border-radius:10px!important;padding:11px 12px!important;margin:5px 0!important;cursor:pointer!important;font:inherit!important;text-align:left!important}' +
            '#' + ID + ' .clip{border:0!important;background:#20aa5b!important;color:#fff!important;font-weight:800!important}' +
            '#' + ID + ' .shot{border:1px solid rgba(255,255,255,.08)!important;background:#151c18!important;color:#e6ebe8!important}' +
            '#' + ID + ' kbd{font:10px Arial,sans-serif!important;color:rgba(255,255,255,.65)!important;background:rgba(0,0,0,.18)!important;border-radius:5px!important;padding:3px 5px!important}' +
            '#' + ID + ' .settings{display:block!important;margin:8px auto 1px!important;border:0!important;background:transparent!important;color:#68756d!important;font:10px Arial,sans-serif!important;cursor:pointer!important}' +
            '#' + ID + ' .status{text-align:center!important;height:18px!important;padding-top:7px!important;color:#748078!important;font-size:10px!important}' +
            '#' + ID + '_settings{position:fixed!important;right:300px!important;top:76px!important;width:245px!important;z-index:2147483647!important;padding:14px!important;background:rgba(12,16,14,.98)!important;color:#f4f7f5!important;border:1px solid rgba(255,255,255,.1)!important;border-radius:14px!important;box-shadow:0 18px 55px rgba(0,0,0,.5)!important;font:12px Arial,sans-serif!important}' +
            '#' + ID + '_settings .st{font-size:14px!important;font-weight:800!important;margin-bottom:10px!important}' +
            '#' + ID + '_settings label{display:block!important;margin:9px 0!important;color:#a8b2ac!important}' +
            '#' + ID + '_settings input{float:right!important;width:72px!important;padding:4px!important;border-radius:6px!important;border:1px solid #303933!important;background:#151c18!important;color:#fff!important;text-align:center!important}' +
            '#' + ID + '_settings .save{margin-top:7px!important;border:0!important;border-radius:7px!important;padding:7px 11px!important;background:#20aa5b!important;color:#fff!important;cursor:pointer!important}';
        document.documentElement.appendChild(css);
        document.body.appendChild(panel);

        settingsPanel = document.createElement('div');
        settingsPanel.id = ID + '_settings';
        settingsPanel.style.display = 'none';
        settingsPanel.innerHTML =
            '<div class="st">Keyboard shortcuts</div>' +
            '<label>Clip <input class="clip-input" value="' + settings.clip + '"></label>' +
            '<label>Screenshot <input class="shot-input" value="' + settings.shot + '"></label>' +
            '<label>Panel <input class="panel-input" value="' + settings.panel + '"></label>' +
            '<button class="save">Save</button>';
        document.body.appendChild(settingsPanel);

        panel.querySelector('.clip').onclick = clip;
        panel.querySelector('.shot').onclick = screenshot;
        panel.querySelector('.settings').onclick = toggleSettings;
        panel.querySelector('.close').onclick = function () {
            panel.style.display = 'none';
            settingsPanel.style.display = 'none';
        };

        settingsPanel.querySelector('.save').onclick = function () {
            settings.clip = settingsPanel.querySelector('.clip-input').value.trim().toUpperCase() || 'F9';
            settings.shot = settingsPanel.querySelector('.shot-input').value.trim().toUpperCase() || 'F8';
            settings.panel = settingsPanel.querySelector('.panel-input').value.trim().toUpperCase() || 'F7';
            saveSettings();
            panel.querySelector('.clip-key').textContent = settings.clip;
            panel.querySelector('.shot-key').textContent = settings.shot;
            toggleSettings();
        };
    }

    document.addEventListener('keydown', function (e) {
        var k = key(e);
        if (!k) return;
        if (k === settings.clip) { e.preventDefault(); clip(); }
        else if (k === settings.shot) { e.preventDefault(); screenshot(); }
        else if (k === settings.panel) {
            e.preventDefault();
            if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }
    }, true);

    function boot() {
        if (!document.body) return setTimeout(boot, 100);
        ui();
        startBuffer();
    }

    boot();
})();
