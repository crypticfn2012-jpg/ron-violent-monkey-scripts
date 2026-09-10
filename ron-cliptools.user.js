// ==UserScript==
// @name         RON ClipTools
// @namespace    https://ron.cool/userscripts/cliptools
// @version      14.0.0
// @description  RON ClipTools - instant replay clips for BuildNow.GG
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

    var ID = '__RON_CLIPTOOLS_V1400__';
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
    var firstMeta = null;
    var recording = false;
    var starting = false;
    var captureLoop = false;
    var captureGeneration = 0;
    var restartTimer = null;
    var exportQueue = Promise.resolve();
    var frameIndex = 0;

    var settings = { shot: 'F8', clip: 'F9', panel: 'F7' };
    try {
        settings.shot = localStorage.getItem('ron_cliptools_v14_shot') || 'F8';
        settings.clip = localStorage.getItem('ron_cliptools_v14_clip') || 'F9';
        settings.panel = localStorage.getItem('ron_cliptools_v14_panel') || 'F7';
    } catch (_) {}

    function saveSettings() {
        try {
            localStorage.setItem('ron_cliptools_v14_shot', settings.shot);
            localStorage.setItem('ron_cliptools_v14_clip', settings.clip);
            localStorage.setItem('ron_cliptools_v14_panel', settings.panel);
        } catch (_) {}
    }

    function setStatus(text, temporary) {
        if (!panel) return;
        var el = panel.querySelector('.ron-status');
        if (!el) return;
        el.textContent = text;
        if (temporary) {
            clearTimeout(setStatus.timer);
            setStatus.timer = setTimeout(function () {
                if (el) el.textContent = 'Ready';
            }, 1800);
        }
    }

    function getCanvas() {
        var list = document.getElementsByTagName('canvas');
        var best = null, area = 0;
        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            var a = (c.width || 0) * (c.height || 0);
            if (a > area) { area = a; best = c; }
        }
        return best;
    }

    function filename(prefix, ext) {
        var d = new Date();
        function p(n) { return String(n).padStart(2, '0'); }
        return prefix + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + '-' + p(d.getMinutes()) + '-' + p(d.getSeconds()) + ext;
    }

    function saveBlob(blob, name) {
        if (!blob || !blob.size) throw new Error('empty file');
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        setStatus('Saved', true);
    }

    function screenshot() {
        var canvas = getCanvas();
        if (!canvas) return setStatus('Screenshot unavailable', true);
        try {
            canvas.toBlob(function (blob) {
                if (blob) saveBlob(blob, filename('RON-Screenshot-', '.png'));
                else setStatus('Screenshot failed', true);
            }, 'image/png');
        } catch (_) { setStatus('Screenshot failed', true); }
    }

    function loadMediabunny() {
        if (M) return Promise.resolve(M);
        return new Promise(function (resolve, reject) {
            var existing = unsafeWindow && unsafeWindow.Mediabunny;
            if (existing) { M = existing; resolve(M); return; }

            var done = false;
            var timeout = setTimeout(function () {
                if (!done) { done = true; reject(new Error('Mediabunny load failed')); }
            }, 12000);

            function check() {
                var api = unsafeWindow && unsafeWindow.Mediabunny;
                if (api && !done) {
                    done = true;
                    clearTimeout(timeout);
                    M = api;
                    resolve(api);
                    return true;
                }
                return !!api;
            }

            function injectText() {
                if (done || check()) return;
                try {
                    var text = GM_getResourceText('mediabunny');
                    if (!text) throw new Error('empty resource');
                    GM_addElement(document.documentElement, 'script', { textContent: text });
                    setTimeout(function () { if (!check() && !done) { done = true; clearTimeout(timeout); reject(new Error('Mediabunny init failed')); } }, 1800);
                } catch (_) {
                    if (!done) { done = true; clearTimeout(timeout); reject(new Error('Mediabunny load failed')); }
                }
            }

            var resourceUrl = '';
            try { resourceUrl = GM_getResourceURL('mediabunny'); } catch (_) {}
            if (resourceUrl) {
                try {
                    var script = GM_addElement(document.documentElement, 'script', { src: resourceUrl });
                    var fallback = setTimeout(function () { if (!check() && !done) injectText(); }, 3000);
                    script.onload = function () {
                        clearTimeout(fallback);
                        setTimeout(function () { if (!check() && !done) injectText(); }, 0);
                    };
                    script.onerror = function () { clearTimeout(fallback); injectText(); };
                } catch (_) { injectText(); }
            } else injectText();
        });
    }

    function packetEnd(p) { return p.timestamp + p.duration; }

    function newestTimestamp(list) {
        var newest = -Infinity;
        for (var i = 0; i < list.length; i++) newest = Math.max(newest, packetEnd(list[i].p));
        return newest;
    }

    function trimPackets() {
        if (!packets.length) return;
        var newest = newestTimestamp(packets);
        var cutoff = newest - BUFFER_SECONDS;
        var first = 0;
        while (first < packets.length && packets[first].p.timestamp < cutoff) first++;
        while (first > 0 && first < packets.length && packets[first].p.type !== 'key') first--;
        if (first > 0) packets.splice(0, first);
    }

    async function stopLiveBuffer(restart) {
        captureGeneration++;
        captureLoop = false;
        recording = false;
        var source = liveSource;
        var output = liveOutput;
        liveSource = null;
        liveOutput = null;
        try { if (source) source.close(); } catch (_) {}
        try { if (output) await output.cancel(); } catch (_) {}
        packets = [];
        firstMeta = null;
        if (restart) scheduleRestart(300);
    }

    function scheduleRestart(delay) {
        if (restartTimer || recording || starting) return;
        restartTimer = setTimeout(function () {
            restartTimer = null;
            startBuffer();
        }, delay || 500);
    }

    async function captureLoopRun(canvas, generation) {
        captureLoop = true;
        frameIndex = 0;
        while (recording && captureLoop && liveSource && generation === captureGeneration) {
            var started = performance.now();
            var timestamp = frameIndex / FPS;
            frameIndex++;
            try {
                await liveSource.add(timestamp, 1 / FPS);
            } catch (_) {
                captureLoop = false;
                if (generation === captureGeneration) {
                    await stopLiveBuffer(false);
                    scheduleRestart(500);
                }
                return;
            }
            var delay = Math.max(0, (1000 / FPS) - (performance.now() - started));
            if (delay) await new Promise(function (r) { setTimeout(r, delay); });
        }
    }

    async function startBuffer() {
        if (recording || starting) return;
        starting = true;
        try {
            var canvas = getCanvas();
            if (!canvas || !canvas.width || !canvas.height) throw new Error('canvas');
            if (!window.isSecureContext || !window.VideoEncoder || !window.VideoFrame) throw new Error('video');

            var api = await loadMediabunny();
            if (!api || !api.Output || !api.CanvasSource || !api.EncodedVideoPacketSource || !api.Mp4OutputFormat || !api.BufferTarget || !api.NullTarget || !api.Quality) throw new Error('media');

            var quality = new api.Quality({ bitrate: BITRATE });
            if (api.canEncodeVideo) {
                var ok = await api.canEncodeVideo('avc', {
                    width: canvas.width,
                    height: canvas.height,
                    quality: quality,
                    framerate: FPS,
                    latencyMode: 'realtime',
                    hardwareAcceleration: 'prefer-hardware'
                });
                if (!ok) throw new Error('codec');
            }

            packets = [];
            firstMeta = null;

            var output = new api.Output({ format: new api.Mp4OutputFormat(), target: new api.NullTarget() });
            var source = new api.CanvasSource(canvas, {
                codec: 'avc',
                quality: quality,
                latencyMode: 'realtime',
                hardwareAcceleration: 'prefer-hardware',
                keyFrameInterval: 0.25,
                alpha: 'discard',
                onEncodedPacket: function (packet, meta) {
                    try {
                        packets.push({ p: packet.clone(), meta: meta || null });
                        if (!firstMeta && meta && meta.decoderConfig) firstMeta = meta;
                        trimPackets();
                    } catch (_) {}
                }
            });

            output.addVideoTrack(source, { frameRate: FPS });
            await output.start();
            liveOutput = output;
            liveSource = source;
            recording = true;
            starting = false;
            var generation = ++captureGeneration;
            captureLoopRun(canvas, generation);
        } catch (_) {
            starting = false;
            recording = false;
            scheduleRestart(1800);
        }
    }

    function getClipPackets(snapshot) {
        if (!snapshot.length) return null;
        var end = newestTimestamp(snapshot);
        var wantedStart = end - CLIP_SECONDS;
        var start = -1;
        var best = -Infinity;
        for (var i = 0; i < snapshot.length; i++) {
            if (snapshot[i].p.type === 'key' && snapshot[i].p.timestamp <= wantedStart && snapshot[i].p.timestamp >= best) {
                best = snapshot[i].p.timestamp;
                start = i;
            }
        }
        if (start < 0) {
            for (var j = 0; j < snapshot.length; j++) {
                if (snapshot[j].p.type === 'key') { start = j; break; }
            }
        }
        return start >= 0 ? snapshot.slice(start) : null;
    }

    async function writeClip(snapshot) {
        var chosen = getClipPackets(snapshot);
        if (!chosen || chosen.length < 2 || chosen[0].p.type !== 'key') throw new Error('not enough replay data');

        var target = new M.BufferTarget();
        var output = new M.Output({ format: new M.Mp4OutputFormat({ fastStart: 'in-memory' }), target: target });
        var source = new M.EncodedVideoPacketSource('avc');
        output.addVideoTrack(source, { frameRate: FPS });
        await output.start();

        var base = chosen[0].p.timestamp;
        for (var i = 0; i < chosen.length; i++) {
            var item = chosen[i];
            // Mediabunny packet clones preserve the encoded payload while allowing the
            // export to use a fresh timeline starting at zero.
            var packet = item.p.clone({ timestamp: item.p.timestamp - base });
            await source.add(packet, i === 0 ? (item.meta || firstMeta || undefined) : undefined);
        }
        source.close();
        await output.finalize();

        var buffer = target.buffer;
        if (!buffer || !buffer.byteLength) throw new Error('empty MP4');
        saveBlob(new Blob([buffer], { type: 'video/mp4' }), filename('RON-Clip-15s-', '.mp4'));
    }

    function clip() {
        if (!recording || !liveSource || packets.length < 2) return setStatus('Getting ready', true);
        var snapshot = packets.slice();
        setStatus('Saving...', false);
        exportQueue = exportQueue.then(function () {
            return writeClip(snapshot);
        }).catch(function (e) {
            console.error('[RON ClipTools]', e);
            setStatus('Could not save', true);
        });
    }

    function toggleSettings() {
        if (!settingsPanel) return;
        settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
    }

    function keyName(e) {
        if (e.code && /^F(?:[1-9]|1[0-2])$/.test(e.code)) return e.code;
        return e.key ? e.key.toUpperCase() : '';
    }

    function buildUI() {
        if (!document.body || document.getElementById(ID)) return;

        panel = document.createElement('div');
        panel.id = ID;
        panel.innerHTML =
            '<div class="ron-head"><div><div class="ron-title">RON ClipTools</div><div class="ron-sub">BuildNow instant replay</div></div><button class="ron-close" aria-label="Close">×</button></div>' +
            '<button class="ron-main ron-clip"><span>Clip last 15s</span><kbd class="ron-clip-key">' + settings.clip + '</kbd></button>' +
            '<button class="ron-main ron-shot"><span>Screenshot</span><kbd class="ron-shot-key">' + settings.shot + '</kbd></button>' +
            '<button class="ron-settings">Settings</button>' +
            '<div class="ron-status">Ready</div>';

        var style = document.createElement('style');
        style.textContent =
            '#' + ID + '{position:fixed!important;right:18px!important;top:76px!important;width:270px!important;z-index:2147483647!important;padding:11px!important;background:rgba(12,16,14,.97)!important;color:#f4f7f5!important;border:1px solid rgba(65,255,132,.24)!important;border-radius:16px!important;box-shadow:0 18px 55px rgba(0,0,0,.5)!important;backdrop-filter:blur(16px)!important;font:13px Arial,sans-serif!important;box-sizing:border-box!important}' +
            '#' + ID + ' *{box-sizing:border-box!important}' +
            '#' + ID + ' .ron-head{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:4px 5px 11px!important}' +
            '#' + ID + ' .ron-title{font-size:16px!important;font-weight:800!important}' +
            '#' + ID + ' .ron-sub{margin-top:3px!important;color:#7d8982!important;font-size:10px!important}' +
            '#' + ID + ' .ron-close{border:0!important;background:transparent!important;color:#7d8982!important;font-size:20px!important;cursor:pointer!important}' +
            '#' + ID + ' .ron-main{width:100%!important;display:flex!important;align-items:center!important;justify-content:space-between!important;border-radius:10px!important;padding:11px 12px!important;margin:5px 0!important;cursor:pointer!important;font:inherit!important;text-align:left!important}' +
            '#' + ID + ' .ron-clip{border:0!important;background:#20aa5b!important;color:#fff!important;font-weight:800!important}' +
            '#' + ID + ' .ron-clip:hover{background:#27bc67!important}' +
            '#' + ID + ' .ron-shot{border:1px solid rgba(255,255,255,.08)!important;background:#151c18!important;color:#e6ebe8!important}' +
            '#' + ID + ' kbd{font:10px Arial,sans-serif!important;color:rgba(255,255,255,.62)!important;background:rgba(0,0,0,.18)!important;border-radius:5px!important;padding:3px 5px!important}' +
            '#' + ID + ' .ron-settings{display:block!important;margin:8px auto 2px!important;border:0!important;background:transparent!important;color:#68756d!important;font:10px Arial,sans-serif!important;cursor:pointer!important}' +
            '#' + ID + ' .ron-status{text-align:center!important;height:18px!important;padding-top:7px!important;color:#748078!important;font-size:10px!important}' +
            '#' + ID + '_settings{position:fixed!important;right:300px!important;top:76px!important;width:245px!important;z-index:2147483647!important;padding:14px!important;background:rgba(12,16,14,.98)!important;color:#f4f7f5!important;border:1px solid rgba(255,255,255,.1)!important;border-radius:14px!important;box-shadow:0 18px 55px rgba(0,0,0,.5)!important;font:12px Arial,sans-serif!important}' +
            '#' + ID + '_settings .title{font-size:14px!important;font-weight:800!important;margin-bottom:10px!important}' +
            '#' + ID + '_settings label{display:block!important;margin:9px 0!important;color:#a8b2ac!important}' +
            '#' + ID + '_settings input{float:right!important;width:72px!important;padding:4px!important;border-radius:6px!important;border:1px solid #303933!important;background:#151c18!important;color:#fff!important;text-align:center!important}' +
            '#' + ID + '_settings .save{margin-top:7px!important;border:0!important;border-radius:7px!important;padding:7px 11px!important;background:#20aa5b!important;color:#fff!important;cursor:pointer!important}';
        document.documentElement.appendChild(style);
        document.body.appendChild(panel);

        settingsPanel = document.createElement('div');
        settingsPanel.id = ID + '_settings';
        settingsPanel.style.display = 'none';
        settingsPanel.innerHTML =
            '<div class="title">Keyboard shortcuts</div>' +
            '<label>Clip <input class="clip-key" value="' + settings.clip + '"></label>' +
            '<label>Screenshot <input class="shot-key" value="' + settings.shot + '"></label>' +
            '<label>Panel <input class="panel-key" value="' + settings.panel + '"></label>' +
            '<button class="save">Save</button>';
        document.body.appendChild(settingsPanel);

        panel.querySelector('.ron-clip').onclick = clip;
        panel.querySelector('.ron-shot').onclick = screenshot;
        panel.querySelector('.ron-settings').onclick = toggleSettings;
        panel.querySelector('.ron-close').onclick = function () {
            panel.style.display = 'none';
            settingsPanel.style.display = 'none';
        };

        settingsPanel.querySelector('.save').onclick = function () {
            settings.clip = settingsPanel.querySelector('.clip-key').value.trim().toUpperCase() || 'F9';
            settings.shot = settingsPanel.querySelector('.shot-key').value.trim().toUpperCase() || 'F8';
            settings.panel = settingsPanel.querySelector('.panel-key').value.trim().toUpperCase() || 'F7';
            saveSettings();
            panel.querySelector('.ron-clip-key').textContent = settings.clip;
            panel.querySelector('.ron-shot-key').textContent = settings.shot;
            toggleSettings();
        };
    }

    document.addEventListener('keydown', function (e) {
        var k = keyName(e);
        if (!k) return;
        if (k === settings.shot) { e.preventDefault(); screenshot(); }
        else if (k === settings.clip) { e.preventDefault(); clip(); }
        else if (k === settings.panel) {
            e.preventDefault();
            if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }
    }, true);

    function boot() {
        if (!document.body) return setTimeout(boot, 100);
        buildUI();
        startBuffer();
    }

    boot();
})();
