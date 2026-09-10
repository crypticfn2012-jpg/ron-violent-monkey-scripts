// ==UserScript==
// @name         RON ClipTools
// @namespace    https://ron.cool/userscripts/cliptools
// @version      13.0.0
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

    var ID = '__RON_CLIPTOOLS_V1300__';
    var CLIP_SECONDS = 15;
    var BUFFER_SECONDS = 17;
    var FPS = 30;
    var BITRATE = 6000000;

    var panel = null;
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
        var canvases = document.getElementsByTagName('canvas');
        var best = null;
        var bestArea = 0;
        for (var i = 0; i < canvases.length; i++) {
            var c = canvases[i];
            var area = (c.width || 0) * (c.height || 0);
            if (area > bestArea) {
                bestArea = area;
                best = c;
            }
        }
        return best;
    }

    function filename(prefix, ext) {
        var d = new Date();
        function p(n) { return String(n).padStart(2, '0'); }
        return prefix + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' +
            p(d.getHours()) + '-' + p(d.getMinutes()) + '-' + p(d.getSeconds()) + ext;
    }

    function saveBlob(blob, name) {
        if (!blob || !blob.size) {
            setStatus('Could not save', true);
            return;
        }
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
        } catch (_) {
            setStatus('Screenshot failed', true);
        }
    }

    function loadMediabunny() {
        if (M) return Promise.resolve(M);

        return new Promise(function (resolve, reject) {
            var existing = unsafeWindow && unsafeWindow.Mediabunny;
            if (existing) {
                M = existing;
                resolve(M);
                return;
            }

            var finished = false;
            var timeout = setTimeout(function () {
                if (!finished) {
                    finished = true;
                    reject(new Error('load'));
                }
            }, 12000);

            function check() {
                var api = unsafeWindow && unsafeWindow.Mediabunny;
                if (api && !finished) {
                    finished = true;
                    clearTimeout(timeout);
                    M = api;
                    resolve(api);
                    return true;
                }
                return !!api;
            }

            function fail() {
                if (!finished) {
                    finished = true;
                    clearTimeout(timeout);
                    reject(new Error('load'));
                }
            }

            function injectText() {
                if (finished || check()) return;
                try {
                    var text = GM_getResourceText('mediabunny');
                    if (!text) return fail();
                    var script = GM_addElement(document.documentElement, 'script', { textContent: text });
                    if (!script) return fail();
                    setTimeout(function () {
                        if (!check() && !finished) fail();
                    }, 1800);
                } catch (_) {
                    fail();
                }
            }

            var resourceUrl = '';
            try { resourceUrl = GM_getResourceURL('mediabunny'); } catch (_) {}

            if (resourceUrl) {
                try {
                    var script = GM_addElement(document.documentElement, 'script', { src: resourceUrl });
                    if (!script) return injectText();
                    script.onload = function () {
                        setTimeout(function () {
                            if (!check() && !finished) injectText();
                        }, 0);
                    };
                    script.onerror = function () {
                        injectText();
                    };
                    setTimeout(function () {
                        if (!check() && !finished) injectText();
                    }, 3500);
                } catch (_) {
                    injectText();
                }
            } else {
                injectText();
            }
        });
    }

    function newestTimestamp(list) {
        var newest = -Infinity;
        for (var i = 0; i < list.length; i++) {
            var p = list[i].p;
            newest = Math.max(newest, p.timestamp + p.duration);
        }
        return newest;
    }

    function trimPackets() {
        if (!packets.length) return;
        var newest = newestTimestamp(packets);
        var cutoff = newest - BUFFER_SECONDS;
        var keepFrom = 0;

        while (keepFrom < packets.length && packets[keepFrom].p.timestamp < cutoff) {
            keepFrom++;
        }

        if (keepFrom > 0) {
            var keyIndex = keepFrom;
            while (keyIndex < packets.length && packets[keyIndex].p.type !== 'key') keyIndex++;
            if (keyIndex < packets.length) keepFrom = keyIndex;
            else keepFrom = Math.max(0, keepFrom - 1);
            if (keepFrom > 0) packets.splice(0, keepFrom);
        }
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
            if (delay) await new Promise(function (resolve) { setTimeout(resolve, delay); });
        }
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

    async function startBuffer() {
        if (recording || starting) return;
        starting = true;

        try {
            var canvas = getCanvas();
            if (!canvas || !canvas.width || !canvas.height) throw new Error('canvas');
            if (!window.isSecureContext || !window.VideoEncoder || !window.VideoFrame) throw new Error('video');

            var api = await loadMediabunny();
            if (!api || !api.Output || !api.CanvasSource || !api.EncodedVideoPacketSource ||
                !api.Mp4OutputFormat || !api.BufferTarget || !api.NullTarget || !api.Quality) {
                throw new Error('media');
            }

            var quality = new api.Quality({ bitrate: BITRATE });

            if (api.canEncodeVideo) {
                var supported = await api.canEncodeVideo('avc', {
                    width: canvas.width,
                    height: canvas.height,
                    quality: quality,
                    framerate: FPS,
                    latencyMode: 'realtime',
                    hardwareAcceleration: 'prefer-hardware'
                });
                if (!supported) throw new Error('codec');
            }

            packets = [];
            firstMeta = null;

            var output = new api.Output({
                format: new api.Mp4OutputFormat(),
                target: new api.NullTarget()
            });

            var source = new api.CanvasSource(canvas, {
                codec: 'avc',
                quality: quality,
                latencyMode: 'realtime',
                hardwareAcceleration: 'prefer-hardware',
                keyFrameInterval: 0.5,
                alpha: 'discard',
                onEncodedPacket: function (packet, meta) {
                    try {
                        packets.push({
                            p: packet.clone(),
                            meta: meta || null
                        });
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
        var startIndex = -1;
        var bestTimestamp = -Infinity;

        for (var i = 0; i < snapshot.length; i++) {
            var item = snapshot[i];
            if (item.p.type === 'key' && item.p.timestamp <= wantedStart && item.p.timestamp >= bestTimestamp) {
                bestTimestamp = item.p.timestamp;
                startIndex = i;
            }
        }

        if (startIndex < 0) {
            for (var j = 0; j < snapshot.length; j++) {
                if (snapshot[j].p.type === 'key') {
                    startIndex = j;
                    break;
                }
            }
        }

        if (startIndex < 0) return null;
        return snapshot.slice(startIndex);
    }

    async function writeClip(snapshot) {
        if (!M) throw new Error('media');

        var chosen = getClipPackets(snapshot);
        if (!chosen || !chosen.length || chosen[0].p.type !== 'key') throw new Error('clip');

        var target = new M.BufferTarget();
        var output = new M.Output({
            format: new M.Mp4OutputFormat({ fastStart: 'in-memory' }),
            target: target
        });
        var source = new M.EncodedVideoPacketSource('avc');
        output.addVideoTrack(source, { frameRate: FPS });
        await output.start();

        var base = chosen[0].p.timestamp;

        for (var i = 0; i < chosen.length; i++) {
            var item = chosen[i];
            var packet = item.p.clone({ timestamp: item.p.timestamp - base });
            await source.add(packet, i === 0 ? (item.meta || firstMeta || undefined) : undefined);
        }

        source.close();
        await output.finalize();

        var buffer = target.buffer;
        if (!buffer || !buffer.byteLength) throw new Error('empty');

        saveBlob(
            new Blob([buffer], { type: 'video/mp4' }),
            filename('RON-Clip-15s-', '.mp4')
        );
    }

    function clip() {
        if (!recording || !liveSource || packets.length < 2) {
            setStatus('Getting ready', true);
            return;
        }

        var snapshot = packets.slice();
        setStatus('Saving...', false);

        exportQueue = exportQueue.then(function () {
            return writeClip(snapshot);
        }).catch(function () {
            setStatus('Could not save', true);
        });
    }

    function buildUI() {
        if (!document.body || document.getElementById(ID)) return;

        panel = document.createElement('div');
        panel.id = ID;
        panel.innerHTML =
            '<div class="ron-head">' +
                '<div class="ron-brand"><div class="ron-title">RON ClipTools</div><div class="ron-sub">BuildNow instant replay</div></div>' +
                '<button class="ron-close" aria-label="Close">×</button>' +
            '</div>' +
            '<button class="ron-clip"><span>Clip last 15s</span><kbd>F9</kbd></button>' +
            '<button class="ron-shot"><span>Screenshot</span><kbd>F8</kbd></button>' +
            '<div class="ron-status">Ready</div>';

        var style = document.createElement('style');
        style.id = ID + '_style';
        style.textContent =
            '#' + ID + '{position:fixed!important;right:18px!important;top:76px!important;width:268px!important;z-index:2147483647!important;padding:10px!important;background:rgba(12,16,14,.96)!important;color:#f5f8f6!important;border:1px solid rgba(71,255,137,.22)!important;border-radius:15px!important;box-shadow:0 16px 50px rgba(0,0,0,.45)!important;backdrop-filter:blur(16px)!important;font:13px Arial,sans-serif!important;box-sizing:border-box!important}' +
            '#' + ID + ' *{box-sizing:border-box!important}' +
            '#' + ID + ' .ron-head{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:5px 5px 10px!important}' +
            '#' + ID + ' .ron-title{font-size:16px!important;font-weight:800!important;letter-spacing:-.25px!important}' +
            '#' + ID + ' .ron-sub{margin-top:3px!important;color:#7f8b84!important;font-size:10px!important}' +
            '#' + ID + ' .ron-close{border:0!important;background:transparent!important;color:#7e8982!important;font-size:20px!important;line-height:1!important;padding:2px 4px!important;cursor:pointer!important}' +
            '#' + ID + ' .ron-clip,#' + ID + ' .ron-shot{width:100%!important;display:flex!important;align-items:center!important;justify-content:space-between!important;border-radius:10px!important;cursor:pointer!important;font:inherit!important}' +
            '#' + ID + ' .ron-clip{border:0!important;background:#22ad5d!important;color:#fff!important;padding:12px!important;font-weight:800!important}' +
            '#' + ID + ' .ron-clip:hover{background:#28bd68!important}' +
            '#' + ID + ' .ron-shot{margin-top:7px!important;border:1px solid rgba(255,255,255,.08)!important;background:#151b18!important;color:#dfe6e1!important;padding:10px 12px!important}' +
            '#' + ID + ' .ron-shot:hover{background:#1a221e!important}' +
            '#' + ID + ' kbd{font:10px Arial,sans-serif!important;color:rgba(255,255,255,.62)!important;background:rgba(0,0,0,.16)!important;border-radius:5px!important;padding:3px 5px!important}' +
            '#' + ID + ' .ron-status{text-align:center!important;color:#69766e!important;font-size:10px!important;height:18px!important;padding-top:9px!important}';

        document.documentElement.appendChild(style);
        document.body.appendChild(panel);

        panel.querySelector('.ron-clip').onclick = clip;
        panel.querySelector('.ron-shot').onclick = screenshot;
        panel.querySelector('.ron-close').onclick = function () {
            panel.style.display = 'none';
        };
    }

    document.addEventListener('keydown', function (e) {
        if (e.code === 'F9') {
            e.preventDefault();
            clip();
        } else if (e.code === 'F8') {
            e.preventDefault();
            screenshot();
        } else if (e.code === 'F7') {
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
