// ==UserScript==
// @name         RON ClipTools
// @namespace    https://ron.cool/userscripts/cliptools
// @version      11.1.0
// @description  RON ClipTools - always-on H.264 MP4 replay clips for BuildNow.GG
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

    var ID = '__RON_CLIPTOOLS_V1110__';
    var panel = null;
    var M = null;
    var live = null;
    var source = null;
    var packets = [];
    var firstMeta = null;
    var recording = false;
    var exporting = false;
    var restartTimer = null;
    var captureLoop = false;
    var frameIndex = 0;
    var bufferSeconds = 130;

    var settings = { shot: 'F8', clip: 'F9', panel: 'F7', duration: 15 };
    try {
        settings.shot = localStorage.getItem('ron_cliptools_v11_shot') || 'F8';
        settings.clip = localStorage.getItem('ron_cliptools_v11_clip') || 'F9';
        settings.panel = localStorage.getItem('ron_cliptools_v11_panel') || 'F7';
        settings.duration = Number(localStorage.getItem('ron_cliptools_v11_duration')) || 15;
    } catch (_) {}

    function status(text) {
        var e = panel && panel.querySelector('#r111status');
        if (e) e.textContent = text;
    }

    function saveSettings() {
        try {
            localStorage.setItem('ron_cliptools_v11_shot', settings.shot);
            localStorage.setItem('ron_cliptools_v11_clip', settings.clip);
            localStorage.setItem('ron_cliptools_v11_panel', settings.panel);
            localStorage.setItem('ron_cliptools_v11_duration', String(settings.duration));
        } catch (_) {}
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
        if (!blob || !blob.size) return status('Nothing to save');
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        status('Saved ' + name);
    }

    function screenshot() {
        var c = getCanvas();
        if (!c) return status('No BuildNow canvas found');
        try {
            c.toBlob(function (blob) {
                if (blob) saveBlob(blob, filename('RON-Screenshot-', '.png'));
                else status('Screenshot failed');
            }, 'image/png');
        } catch (e) {
            console.error('[RON ClipTools]', e);
            status('Screenshot unavailable');
        }
    }

    // Mediabunny can be loaded as a normal script and exposes window.Mediabunny.
    // BuildNow/CrazyGames can have a strict CSP, so try both a VM resource URL
    // and a data URL, then finally an inline resource fallback through GM_addElement.
    function loadMediabunny() {
        if (M) return Promise.resolve(M);
        return new Promise(function (resolve, reject) {
            if (unsafeWindow && unsafeWindow.Mediabunny) {
                M = unsafeWindow.Mediabunny;
                return resolve(M);
            }

            var tried = [];
            var done = false;

            function finish(api) {
                if (done) return;
                if (api) {
                    done = true;
                    M = api;
                    resolve(api);
                }
            }

            function fail(reason) {
                if (done) return;
                done = true;
                reject(new Error(reason || 'Mediabunny could not be loaded'));
            }

            function checkGlobal() {
                var api = unsafeWindow && unsafeWindow.Mediabunny;
                if (api) finish(api);
                return !!api;
            }

            function injectSrc(url, label, next) {
                try {
                    var script = GM_addElement(document.documentElement, 'script', { src: url });
                    var timer = setTimeout(function () {
                        if (!done && !checkGlobal()) next();
                    }, 7000);
                    script.onload = function () {
                        clearTimeout(timer);
                        setTimeout(function () {
                            if (!done && !checkGlobal()) next();
                        }, 0);
                    };
                    script.onerror = function () {
                        clearTimeout(timer);
                        if (!done) next();
                    };
                } catch (e) {
                    next();
                }
            }

            var blobUrl = '';
            try { blobUrl = GM_getResourceURL('mediabunny', true); } catch (_) {}
            var dataUrl = '';
            try { dataUrl = GM_getResourceURL('mediabunny', false); } catch (_) {}

            // Blob URL first. VM documents this as the normal cached resource URL.
            if (blobUrl) {
                tried.push('blob');
                injectSrc(blobUrl, 'blob', function () {
                    if (dataUrl) {
                        tried.push('data');
                        injectSrc(dataUrl, 'data', function () {
                            injectText();
                        });
                    } else injectText();
                });
            } else if (dataUrl) {
                tried.push('data');
                injectSrc(dataUrl, 'data', function () { injectText(); });
            } else {
                injectText();
            }

            function injectText() {
                if (done || checkGlobal()) return;
                try {
                    var text = GM_getResourceText('mediabunny');
                    if (!text) return fail('Mediabunny resource is empty');
                    var script = GM_addElement(document.documentElement, 'script', {});
                    script.textContent = text;
                    setTimeout(function () {
                        if (!done && !checkGlobal()) fail('Mediabunny loaded but did not create window.Mediabunny');
                    }, 1000);
                } catch (e) {
                    fail('Mediabunny injection failed: ' + (e.message || e));
                }
            }
        });
    }

    function trimPackets() {
        if (!packets.length) return;
        var newest = packets[packets.length - 1].p.timestamp;
        var cutoff = newest - bufferSeconds;
        var keepFrom = 0;
        while (keepFrom < packets.length - 1 && packets[keepFrom].p.timestamp < cutoff) keepFrom++;
        while (keepFrom > 0 && packets[keepFrom].p.type !== 'key') keepFrom--;
        if (keepFrom > 0) packets.splice(0, keepFrom);
    }

    async function captureForever(c) {
        captureLoop = true;
        frameIndex = 0;
        while (recording && source && captureLoop) {
            var started = performance.now();
            var targetTime = frameIndex / 30;
            frameIndex++;
            try {
                await source.add(targetTime, 1 / 30);
            } catch (e) {
                console.error('[RON ClipTools] capture error', e);
                captureLoop = false;
                if (recording && !exporting) {
                    status('Encoder hiccup — automatically restarting...');
                    await restartBuffer();
                }
                return;
            }
            var wait = Math.max(0, 33.333 - (performance.now() - started));
            if (wait) await new Promise(function (r) { setTimeout(r, wait); });
        }
    }

    async function createBuffer() {
        var c = getCanvas();
        if (!c || !c.width || !c.height) throw new Error('BuildNow canvas not ready');
        if (!window.isSecureContext) throw new Error('Browser security blocks WebCodecs here');
        if (!window.VideoEncoder || !window.VideoFrame) throw new Error('WebCodecs unavailable');

        var api = await loadMediabunny();
        if (!api.Output || !api.CanvasSource || !api.EncodedVideoPacketSource || !api.Mp4OutputFormat || !api.BufferTarget || !api.NullTarget) {
            throw new Error('Mediabunny API incomplete');
        }

        var quality = api.Quality ? new api.Quality({ bitrate: 6000000 }) : undefined;
        if (api.canEncodeVideo) {
            var supported = await api.canEncodeVideo('avc', {
                width: c.width,
                height: c.height,
                quality: quality,
                framerate: 30,
                latencyMode: 'realtime'
            });
            if (!supported) throw new Error('H.264/AVC encoder unavailable');
        }

        packets = [];
        firstMeta = null;

        var output = new api.Output({
            format: new api.Mp4OutputFormat(),
            target: new api.NullTarget()
        });

        var src = new api.CanvasSource(c, {
            codec: 'avc',
            quality: quality,
            latencyMode: 'realtime',
            keyFrameInterval: 0.5,
            alpha: 'discard',
            onEncodedPacket: function (packet, meta) {
                try {
                    var copy = packet.clone();
                    packets.push({ p: copy, meta: meta || null });
                    if (!firstMeta && meta && meta.decoderConfig) firstMeta = meta;
                    trimPackets();
                } catch (e) { console.error('[RON ClipTools] packet error', e); }
            }
        });

        output.addVideoTrack(src);
        await output.start();

        live = output;
        source = src;
        recording = true;
        updateUI();
        status('MP4 replay buffer ON');
        captureForever(c);
    }

    async function startBuffer() {
        if (recording || exporting) return;
        try {
            status('Starting always-on MP4 buffer...');
            await createBuffer();
        } catch (e) {
            recording = false;
            console.error('[RON ClipTools] start error', e);
            status('Retrying MP4 buffer: ' + (e.message || e));
            scheduleRestart(2000);
        }
    }

    function scheduleRestart(delay) {
        if (restartTimer || exporting) return;
        restartTimer = setTimeout(function () {
            restartTimer = null;
            if (!exporting) startBuffer();
        }, delay || 1500);
    }

    async function restartBuffer() {
        try { if (source) source.close(); } catch (_) {}
        try { if (live) await live.cancel(); } catch (_) {}
        source = null;
        live = null;
        recording = false;
        packets = [];
        firstMeta = null;
        updateUI();
        if (!exporting) scheduleRestart(500);
    }

    async function saveClip() {
        if (exporting) return;
        if (!recording || !source) return status('Replay buffer is starting — try again in a moment');
        if (!packets.length) return status('Replay buffer is warming up...');
        if (!M) return status('MP4 encoder is still loading...');

        exporting = true;
        try {
            status('Saving last ' + settings.duration + 's...');

            var end = packets[packets.length - 1].p.timestamp + packets[packets.length - 1].p.duration;
            var wantedStart = Math.max(0, end - settings.duration);
            var startIndex = -1;

            for (var i = packets.length - 1; i >= 0; i--) {
                if (packets[i].p.type === 'key' && packets[i].p.timestamp <= wantedStart) {
                    startIndex = i;
                    break;
                }
            }
            if (startIndex < 0) {
                for (var k = 0; k < packets.length; k++) {
                    if (packets[k].p.type === 'key') { startIndex = k; break; }
                }
            }
            if (startIndex < 0) throw new Error('No H.264 keyframe available yet');

            var chosen = packets.slice(startIndex);
            if (!chosen.length || chosen[0].p.type !== 'key') throw new Error('No decodable keyframe');

            var target = new M.BufferTarget();
            var output = new M.Output({
                format: new M.Mp4OutputFormat({ fastStart: 'in-memory' }),
                target: target
            });
            var packetSource = new M.EncodedVideoPacketSource('avc');
            output.addVideoTrack(packetSource);
            await output.start();

            var base = chosen[0].p.timestamp;
            for (var j = 0; j < chosen.length; j++) {
                var item = chosen[j];
                var packet = item.p.clone({ timestamp: item.p.timestamp - base });
                await packetSource.add(packet, j === 0 ? (item.meta || firstMeta || undefined) : undefined);
            }

            packetSource.close();
            await output.finalize();
            var buffer = target.buffer;
            if (!buffer || !buffer.byteLength) throw new Error('MP4 muxer returned no data');

            saveBlob(new Blob([buffer], { type: 'video/mp4' }), filename('RON-Clip-' + settings.duration + 's-', '.mp4'));
        } catch (e) {
            console.error('[RON ClipTools] export error', e);
            status('Clip save failed: ' + (e.message || e));
        } finally {
            exporting = false;
            if (!recording && !restartTimer) scheduleRestart(250);
            else if (recording) status('MP4 replay buffer ON');
        }
    }

    function updateUI() {
        if (!panel) return;
        var b = panel.querySelector('#r111state');
        if (b) {
            b.textContent = recording ? '● BUFFERING — ALWAYS ON' : '● STARTING / RETRYING';
            b.style.color = recording ? '#35ff83' : '#ffd166';
        }
        var save = panel.querySelector('#r111save');
        if (save) save.textContent = 'SAVE LAST ' + settings.duration + 'S';
    }

    function build() {
        if (!document.body || document.getElementById(ID)) return;

        panel = document.createElement('div');
        panel.id = ID;
        panel.style.cssText = 'position:fixed!important;top:76px!important;right:18px!important;width:320px!important;z-index:2147483647!important;background:#0a0f0c!important;color:#fff!important;border:1px solid #35ff83!important;border-radius:14px!important;box-shadow:0 16px 50px rgba(0,0,0,.55)!important;font:14px Arial,sans-serif!important;overflow:hidden!important;';
        panel.innerHTML = '<div style="padding:14px;background:#101712"><b style="font-size:17px;color:#35ff83">RON ClipTools</b><div style="font-size:11px;color:#718078">Always-on H.264 MP4 replay</div></div><div style="padding:12px"><div id="r111state" style="font-weight:bold;margin-bottom:10px;color:#ffd166">● STARTING / RETRYING</div><button id="r111shot">Screenshot</button><button id="r111save">SAVE LAST ' + settings.duration + 'S</button><div style="font-size:11px;color:#7a867e;text-align:center;min-height:34px" id="r111status">Starting replay buffer...</div><label>Clip length <select id="r111dur"><option>5</option><option>10</option><option>15</option><option>30</option><option>60</option><option>120</option></select></label><br><label>Screenshot key <input id="r111sk"></label><br><label>Clip key <input id="r111ck"></label><br><label>Window key <input id="r111pk"></label></div>';

        var style = document.createElement('style');
        style.textContent = '#' + ID + ' button{width:100%;padding:10px;margin:0 0 8px;border:0;border-radius:9px;background:#1b2a20;color:white;font-weight:bold;cursor:pointer}#' + ID + ' #r111shot,#' + ID + ' #r111save{background:#168c46}#' + ID + ' input,#' + ID + ' select{background:#080b09;color:white;border:1px solid #303b33;border-radius:6px;padding:5px;margin:4px}';
        document.documentElement.appendChild(style);
        document.body.appendChild(panel);

        panel.querySelector('#r111dur').value = String(settings.duration);
        panel.querySelector('#r111sk').value = settings.shot;
        panel.querySelector('#r111ck').value = settings.clip;
        panel.querySelector('#r111pk').value = settings.panel;
        panel.querySelector('#r111shot').onclick = screenshot;
        panel.querySelector('#r111save').onclick = saveClip;
        panel.querySelector('#r111dur').onchange = function (e) {
            settings.duration = Number(e.target.value) || 15;
            saveSettings();
            updateUI();
        };
        panel.querySelector('#r111sk').onchange = function (e) { settings.shot = e.target.value || 'F8'; saveSettings(); };
        panel.querySelector('#r111ck').onchange = function (e) { settings.clip = e.target.value || 'F9'; saveSettings(); };
        panel.querySelector('#r111pk').onchange = function (e) { settings.panel = e.target.value || 'F7'; saveSettings(); };
        updateUI();
    }

    function keyName(e) {
        if (e.code && /^F[1-9][0-2]?$/.test(e.code)) return e.code;
        return e.key ? e.key.toUpperCase() : '';
    }

    document.addEventListener('keydown', function (e) {
        var k = keyName(e);
        if (!k) return;
        if (k === settings.shot) { e.preventDefault(); screenshot(); }
        else if (k === settings.clip) { e.preventDefault(); saveClip(); }
        else if (k === settings.panel) {
            e.preventDefault();
            if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }
    }, true);

    function boot() {
        if (!document.body) return setTimeout(boot, 100);
        build();
        startBuffer();
    }

    boot();
})();
