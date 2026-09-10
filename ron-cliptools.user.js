// ==UserScript==
// @name         RON ClipTools
// @namespace    https://ron.cool/userscripts/cliptools-v10
// @version      10.1.0
// @description  RON ClipTools - reliable H.264 MP4 replay clips for BuildNow.GG
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
// @grant        unsafeWindow
// @resource     mediabunny https://cdn.jsdelivr.net/npm/mediabunny@1.56.1/dist/bundles/mediabunny.cjs
// ==/UserScript==
(function () {
    'use strict';

    var ID = '__RON_CLIPTOOLS_V1010__';
    var panel = null;
    var mb = null;
    var live = null;
    var source = null;
    var captureTimer = null;
    var busy = false;
    var recording = false;
    var packets = [];
    var firstMeta = null;
    var lastPacketTime = 0;

    var settings = { shot: 'F8', clip: 'F9', panel: 'F7', duration: 15 };
    try {
        settings.shot = localStorage.getItem('ron_cliptools_v10_shot') || 'F8';
        settings.clip = localStorage.getItem('ron_cliptools_v10_clip') || 'F9';
        settings.panel = localStorage.getItem('ron_cliptools_v10_panel') || 'F7';
        settings.duration = Number(localStorage.getItem('ron_cliptools_v10_duration')) || 15;
    } catch (_) {}

    function saveSettings() {
        try {
            localStorage.setItem('ron_cliptools_v10_shot', settings.shot);
            localStorage.setItem('ron_cliptools_v10_clip', settings.clip);
            localStorage.setItem('ron_cliptools_v10_panel', settings.panel);
            localStorage.setItem('ron_cliptools_v10_duration', String(settings.duration));
        } catch (_) {}
    }

    function status(text) {
        var e = panel && panel.querySelector('#r10status');
        if (e) e.textContent = text;
    }

    function canvas() {
        var list = document.getElementsByTagName('canvas');
        var best = null;
        var area = 0;
        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            var a = (c.width || 0) * (c.height || 0);
            if (a > area) { area = a; best = c; }
        }
        return best;
    }

    function fileName(prefix, ext) {
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
        setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
        status('Saved ' + name);
    }

    function screenshot() {
        var c = canvas();
        if (!c) return status('No BuildNow canvas found');
        try {
            c.toBlob(function (blob) {
                if (blob) saveBlob(blob, fileName('RON-Screenshot-', '.png'));
                else status('Screenshot failed');
            }, 'image/png');
        } catch (e) {
            console.error('[RON ClipTools]', e);
            status('Screenshot unavailable');
        }
    }

    function loadMediabunny() {
        return new Promise(function (resolve, reject) {
            var pageWindow = unsafeWindow;
            if (pageWindow && pageWindow.Mediabunny) {
                mb = pageWindow.Mediabunny;
                return resolve(mb);
            }

            var finished = false;
            function finishOk() {
                if (finished) return;
                finished = true;
                setTimeout(function () {
                    var M = unsafeWindow && unsafeWindow.Mediabunny;
                    if (M) { mb = M; resolve(M); }
                    else reject(new Error('Mediabunny loaded but global was not created'));
                }, 0);
            }
            function finishFail() {
                if (finished) return;
                finished = true;
                reject(new Error('Mediabunny could not be loaded'));
            }

            try {
                var url = GM_getResourceURL('mediabunny');
                var script = GM_addElement(document.documentElement, 'script');
                script.src = url;
                script.onload = finishOk;
                script.onerror = finishFail;
            } catch (e) {
                finishFail();
            }
        });
    }

    function trimBuffer() {
        var cutoff = lastPacketTime - 125;
        while (packets.length > 1 && packets[0].p.timestamp < cutoff) {
            packets.shift();
        }
    }

    async function startBuffer() {
        if (recording) return;

        var c = canvas();
        if (!c || !c.width || !c.height) return status('BuildNow canvas not ready');
        if (!window.isSecureContext) return status('Browser security blocks WebCodecs here');
        if (!window.VideoEncoder || !window.VideoFrame) return status('WebCodecs is unavailable in this browser');

        status('Loading MP4 encoder...');

        try {
            var M = mb || await loadMediabunny();
            if (!M || !M.Output || !M.CanvasSource || !M.EncodedVideoPacketSource || !M.Mp4OutputFormat || !M.BufferTarget) {
                throw new Error('Mediabunny API is incomplete');
            }

            // IMPORTANT: Mediabunny expects Quality for bitrate checks/configuration.
            // Passing bitrate directly was the reason the previous version could fail
            // before recording even started.
            var quality = M.Quality ? new M.Quality({ bitrate: 6000000 }) : null;
            var canEncode = true;
            if (M.canEncodeVideo) {
                canEncode = await M.canEncodeVideo('avc', {
                    width: c.width,
                    height: c.height,
                    quality: quality || undefined,
                    framerate: 30,
                    latencyMode: 'realtime'
                });
            }
            if (!canEncode) throw new Error('H.264/AVC encoding is not supported by this browser');

            packets = [];
            firstMeta = null;
            lastPacketTime = 0;

            // Keep an always-running encoder alive in a NullTarget. We capture the
            // encoded packets ourselves so the replay can later be muxed into a
            // completely fresh MP4 starting at a keyframe.
            live = new M.Output({
                format: new M.Mp4OutputFormat(),
                target: new M.NullTarget()
            });

            source = new M.CanvasSource(c, {
                codec: 'avc',
                quality: quality || undefined,
                latencyMode: 'realtime',
                keyFrameInterval: 1,
                alpha: 'discard',
                onEncodedPacket: function (packet, meta) {
                    var copy = packet.clone();
                    packets.push({ p: copy, meta: meta || null });
                    lastPacketTime = Math.max(lastPacketTime, copy.timestamp + copy.duration);
                    if (!firstMeta && meta && meta.decoderConfig) firstMeta = meta;
                    trimBuffer();
                }
            });

            live.addVideoTrack(source);
            await live.start();

            recording = true;
            updateButtons();
            status('MP4 replay buffer ON');

            var started = performance.now();
            captureTimer = setInterval(async function () {
                if (!recording || busy || !source) return;
                busy = true;
                try {
                    var timestamp = (performance.now() - started) / 1000;
                    await source.add(timestamp, 1 / 30);
                } catch (e) {
                    console.error('[RON ClipTools] frame error', e);
                    status('Encoder stopped: ' + (e.message || e));
                    await stopBuffer();
                } finally {
                    busy = false;
                }
            }, 33);
        } catch (e) {
            console.error('[RON ClipTools] start error', e);
            status('MP4 buffer failed: ' + (e.message || e));
            try { if (live) await live.cancel(); } catch (_) {}
            live = null;
            source = null;
            packets = [];
        }
    }

    async function saveClip() {
        if (!recording || !source) return status('Start MP4 buffer first');
        if (busy) return status('Encoder busy - try again');
        if (!packets.length) return status('Buffer warming up - wait a few seconds');

        var M = mb;
        if (!M) return status('MP4 encoder is not loaded');

        try {
            status('Building MP4...');

            var end = packets[packets.length - 1].p.timestamp + packets[packets.length - 1].p.duration;
            var wantedStart = end - settings.duration;
            var startIndex = -1;

            // Start at the latest keyframe at or before the requested start.
            // This guarantees the first packet can actually decode the clip.
            for (var i = packets.length - 1; i >= 0; i--) {
                if (packets[i].p.type === 'key' && packets[i].p.timestamp <= wantedStart) {
                    startIndex = i;
                    break;
                }
            }

            // If the buffer isn't long enough yet, use its first keyframe.
            if (startIndex < 0) {
                for (var k = 0; k < packets.length; k++) {
                    if (packets[k].p.type === 'key') { startIndex = k; break; }
                }
            }

            if (startIndex < 0) return status('Waiting for first H.264 keyframe');

            var chosen = packets.slice(startIndex);
            if (!chosen.length || chosen[0].p.type !== 'key') return status('Waiting for H.264 keyframe');

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
            if (!buffer || !buffer.byteLength) throw new Error('MP4 muxer produced no data');

            saveBlob(new Blob([buffer], { type: 'video/mp4' }), fileName('RON-Clip-' + settings.duration + 's-', '.mp4'));
        } catch (e) {
            console.error('[RON ClipTools] MP4 export error', e);
            status('MP4 export failed: ' + (e.message || e));
        }
    }

    async function stopBuffer() {
        recording = false;
        if (captureTimer) { clearInterval(captureTimer); captureTimer = null; }
        try { if (source) source.close(); } catch (_) {}
        try { if (live) await live.cancel(); } catch (_) {}
        source = null;
        live = null;
        busy = false;
        packets = [];
        firstMeta = null;
        lastPacketTime = 0;
        updateButtons();
        status('MP4 buffer OFF');
    }

    function updateButtons() {
        if (!panel) return;
        var b = panel.querySelector('#r10buf');
        var s = panel.querySelector('#r10save');
        if (b) b.textContent = recording ? 'Stop MP4 Buffer' : 'Start MP4 Buffer';
        if (s) {
            s.disabled = !recording;
            s.textContent = 'Save Last ' + settings.duration + 's';
        }
    }

    function build() {
        if (!document.body || document.getElementById(ID)) return;

        panel = document.createElement('div');
        panel.id = ID;
        panel.style.cssText = 'position:fixed!important;top:76px!important;right:18px!important;width:315px!important;z-index:2147483647!important;background:#0a0f0c!important;color:white!important;border:1px solid #35ff83!important;border-radius:14px!important;box-shadow:0 16px 50px rgba(0,0,0,.55)!important;font:14px Arial,sans-serif!important;overflow:hidden!important;';
        panel.innerHTML = '<div style="padding:14px;background:#101712"><b style="font-size:17px;color:#35ff83">RON ClipTools</b><div style="font-size:11px;color:#718078">H.264 MP4 replay buffer</div></div><div style="padding:12px"><button id="r10shot">Screenshot</button><button id="r10buf">Start MP4 Buffer</button><button id="r10save" disabled>Save Last ' + settings.duration + 's</button><div style="font-size:11px;color:#7a867e;text-align:center;min-height:30px" id="r10status">RON ClipTools 10.1.0 loaded</div><label>Clip length <select id="r10dur"><option>5</option><option>10</option><option>15</option><option>30</option><option>60</option><option>120</option></select></label><br><label>Screenshot key <input id="r10sk"></label><br><label>Clip key <input id="r10ck"></label><br><label>Window key <input id="r10pk"></label></div>';

        var style = document.createElement('style');
        style.textContent = '#' + ID + ' button{width:100%;padding:10px;margin:0 0 8px;border:0;border-radius:9px;background:#1b2a20;color:white;font-weight:bold;cursor:pointer}#' + ID + ' #r10shot,#' + ID + ' #r10save{background:#168c46}#' + ID + ' #r10buf{background:#214d32}#' + ID + ' input,#' + ID + ' select{background:#080b09;color:white;border:1px solid #303b33;border-radius:6px;padding:5px;margin:4px}';
        document.documentElement.appendChild(style);
        document.body.appendChild(panel);

        panel.querySelector('#r10dur').value = String(settings.duration);
        panel.querySelector('#r10sk').value = settings.shot;
        panel.querySelector('#r10ck').value = settings.clip;
        panel.querySelector('#r10pk').value = settings.panel;
        panel.querySelector('#r10shot').onclick = screenshot;
        panel.querySelector('#r10buf').onclick = function () { recording ? stopBuffer() : startBuffer(); };
        panel.querySelector('#r10save').onclick = saveClip;
        panel.querySelector('#r10dur').onchange = function (e) { settings.duration = Number(e.target.value) || 15; saveSettings(); updateButtons(); };
        panel.querySelector('#r10sk').onchange = function (e) { settings.shot = e.target.value || 'F8'; saveSettings(); };
        panel.querySelector('#r10ck').onchange = function (e) { settings.clip = e.target.value || 'F9'; saveSettings(); };
        panel.querySelector('#r10pk').onchange = function (e) { settings.panel = e.target.value || 'F7'; saveSettings(); };
        updateButtons();
    }

    document.addEventListener('keydown', function (e) {
        if (e.repeat) return;
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        var k = e.key.toLowerCase();
        if (k === settings.shot.toLowerCase()) { e.preventDefault(); screenshot(); }
        else if (k === settings.clip.toLowerCase()) { e.preventDefault(); saveClip(); }
        else if (k === settings.panel.toLowerCase()) { e.preventDefault(); if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; }
    });

    var tries = 0;
    var timer = setInterval(function () {
        tries++;
        if (!panel) build();
        if (panel && panel.isConnected) clearInterval(timer);
        if (tries > 120) clearInterval(timer);
    }, 250);
})();