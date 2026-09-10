// ==UserScript==
// @name         RON ClipTools
// @namespace    https://ron.cool/userscripts/cliptools
// @version      12.0.0
// @description  RON ClipTools - screenshot and instant replay clips for BuildNow.GG
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

    var ID = '__RON_CLIPTOOLS_V1200__';
    var panel = null;
    var settingsPanel = null;
    var M = null;
    var liveOutput = null;
    var liveSource = null;
    var packets = [];
    var firstMeta = null;
    var recording = false;
    var starting = false;
    var exporting = false;
    var restartTimer = null;
    var captureLoop = false;
    var frameIndex = 0;
    var bufferSeconds = 130;
    var exportQueue = Promise.resolve();

    var settings = { shot: 'F8', clip: 'F9', panel: 'F7', duration: 15 };
    try {
        settings.shot = localStorage.getItem('ron_cliptools_v12_shot') || 'F8';
        settings.clip = localStorage.getItem('ron_cliptools_v12_clip') || 'F9';
        settings.panel = localStorage.getItem('ron_cliptools_v12_panel') || 'F7';
        settings.duration = Number(localStorage.getItem('ron_cliptools_v12_duration')) || 15;
    } catch (_) {}

    function saveSettings() {
        try {
            localStorage.setItem('ron_cliptools_v12_shot', settings.shot);
            localStorage.setItem('ron_cliptools_v12_clip', settings.clip);
            localStorage.setItem('ron_cliptools_v12_panel', settings.panel);
            localStorage.setItem('ron_cliptools_v12_duration', String(settings.duration));
        } catch (_) {}
    }

    function setStatus(text, temporary) {
        if (!panel) return;
        var e = panel.querySelector('.ron-status');
        if (e) e.textContent = text;
        if (temporary) {
            clearTimeout(setStatus.timer);
            setStatus.timer = setTimeout(function () {
                if (e && !exporting) e.textContent = 'Ready';
            }, 2200);
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
        if (!blob || !blob.size) return setStatus('Nothing to save', true);
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        setStatus('Saved to Downloads', true);
    }

    function screenshot() {
        var c = getCanvas();
        if (!c) return setStatus('Screenshot unavailable', true);
        try {
            c.toBlob(function (blob) {
                if (blob) saveBlob(blob, filename('RON-Screenshot-', '.png'));
                else setStatus('Screenshot failed', true);
            }, 'image/png');
        } catch (e) {
            console.error('[RON ClipTools]', e);
            setStatus('Screenshot failed', true);
        }
    }

    function loadMediabunny() {
        if (M) return Promise.resolve(M);
        return new Promise(function (resolve, reject) {
            if (unsafeWindow && unsafeWindow.Mediabunny) {
                M = unsafeWindow.Mediabunny;
                return resolve(M);
            }

            var settled = false;
            var timer = null;
            function done(api) {
                if (settled) return;
                if (!api) return;
                settled = true;
                clearTimeout(timer);
                M = api;
                resolve(api);
            }
            function fail(message) {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(new Error(message));
            }
            function check() {
                var api = unsafeWindow && unsafeWindow.Mediabunny;
                if (api) done(api);
                return api;
            }
            function injectSource(src, next) {
                try {
                    var el = GM_addElement(document.documentElement, 'script', { src: src });
                    var localTimer = setTimeout(function () {
                        if (!check() && !settled) next();
                    }, 5000);
                    el.onload = function () {
                        clearTimeout(localTimer);
                        setTimeout(function () { if (!check() && !settled) next(); }, 0);
                    };
                    el.onerror = function () {
                        clearTimeout(localTimer);
                        if (!settled) next();
                    };
                } catch (_) { next(); }
            }
            function injectText() {
                if (settled || check()) return;
                try {
                    var text = GM_getResourceText('mediabunny');
                    if (!text) return fail('Mediabunny resource is empty');
                    var el = GM_addElement(document.documentElement, 'script', {});
                    el.textContent = text;
                    setTimeout(function () {
                        if (!check() && !settled) fail('Mediabunny could not initialize');
                    }, 1500);
                } catch (e) { fail('Mediabunny could not load'); }
            }

            timer = setTimeout(function () {
                if (!check() && !settled) fail('Mediabunny could not load');
            }, 14000);

            var resourceUrl = '';
            try { resourceUrl = GM_getResourceURL('mediabunny'); } catch (_) {}
            if (resourceUrl) injectSource(resourceUrl, injectText);
            else injectText();
        });
    }

    function trimPackets() {
        if (!packets.length) return;
        var newest = packets[packets.length - 1].p.timestamp;
        var cutoff = newest - bufferSeconds;
        var keep = 0;
        while (keep < packets.length - 1 && packets[keep].p.timestamp < cutoff) keep++;
        while (keep > 0 && packets[keep].p.type !== 'key') keep--;
        if (keep > 0) packets.splice(0, keep);
    }

    async function captureLoopRun(canvas, generation) {
        captureLoop = true;
        frameIndex = 0;
        while (recording && captureLoop && liveSource && generation === captureGeneration) {
            var started = performance.now();
            var timestamp = frameIndex / 30;
            frameIndex++;
            try {
                await liveSource.add(timestamp, 1 / 30);
            } catch (e) {
                console.error('[RON ClipTools] capture error', e);
                captureLoop = false;
                if (recording && generation === captureGeneration) {
                    recording = false;
                    try { liveSource.close(); } catch (_) {}
                    try { if (liveOutput) await liveOutput.cancel(); } catch (_) {}
                    liveSource = null;
                    liveOutput = null;
                    scheduleRestart(400);
                }
                return;
            }
            var delay = Math.max(0, 33.333 - (performance.now() - started));
            if (delay) await new Promise(function (r) { setTimeout(r, delay); });
        }
    }

    var captureGeneration = 0;

    async function createBuffer() {
        var canvas = getCanvas();
        if (!canvas || !canvas.width || !canvas.height) throw new Error('canvas not ready');
        if (!window.isSecureContext || !window.VideoEncoder || !window.VideoFrame) throw new Error('video encoder unavailable');

        var api = await loadMediabunny();
        if (!api || !api.Output || !api.CanvasSource || !api.EncodedVideoPacketSource || !api.Mp4OutputFormat || !api.BufferTarget || !api.NullTarget) {
            throw new Error('media toolkit unavailable');
        }

        var quality = api.Quality ? new api.Quality({ bitrate: 6000000 }) : undefined;
        if (api.canEncodeVideo) {
            var supported = await api.canEncodeVideo('avc', {
                width: canvas.width,
                height: canvas.height,
                quality: quality,
                framerate: 30,
                latencyMode: 'realtime'
            });
            if (!supported) throw new Error('H.264 is unavailable');
        }

        packets = [];
        firstMeta = null;

        var output = new api.Output({ format: new api.Mp4OutputFormat(), target: new api.NullTarget() });
        var source = new api.CanvasSource(canvas, {
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
                } catch (e) { console.error('[RON ClipTools] packet capture error', e); }
            }
        });

        output.addVideoTrack(source);
        await output.start();

        liveOutput = output;
        liveSource = source;
        recording = true;
        starting = false;
        var generation = ++captureGeneration;
        captureLoopRun(canvas, generation);
    }

    function scheduleRestart(delay) {
        if (restartTimer || exporting || recording || starting) return;
        restartTimer = setTimeout(function () {
            restartTimer = null;
            startBuffer();
        }, delay || 1000);
    }

    async function startBuffer() {
        if (recording || starting || exporting) return;
        starting = true;
        try {
            await createBuffer();
        } catch (e) {
            console.error('[RON ClipTools] buffer error', e);
            recording = false;
            starting = false;
            scheduleRestart(1500);
        }
    }

    async function restartBuffer() {
        captureGeneration++;
        captureLoop = false;
        var oldSource = liveSource;
        var oldOutput = liveOutput;
        liveSource = null;
        liveOutput = null;
        recording = false;
        try { if (oldSource) oldSource.close(); } catch (_) {}
        try { if (oldOutput) await oldOutput.cancel(); } catch (_) {}
        packets = [];
        firstMeta = null;
        scheduleRestart(400);
    }

    function clonePacket(item, base) {
        var p = item.p;
        try { return p.clone({ timestamp: p.timestamp - base }); }
        catch (_) { return p.clone(); }
    }

    async function exportClip() {
        if (!recording || !liveSource) return setStatus('Clip is warming up', true);
        if (!packets.length) return setStatus('Clip is warming up', true);
        if (!M) return setStatus('Clip system is loading', true);

        // Take a fixed snapshot immediately. The live buffer keeps running while
        // the MP4 is exported, so pressing the hotkey repeatedly never kills it.
        var snapshot = packets.slice();
        var duration = settings.duration;
        setStatus('Saving ' + duration + 's clip...');

        exportQueue = exportQueue.then(async function () {
            exporting = true;
            try {
                if (!snapshot.length) throw new Error('empty buffer');
                var end = snapshot[snapshot.length - 1].p.timestamp + snapshot[snapshot.length - 1].p.duration;
                var wanted = Math.max(0, end - duration);
                var start = -1;

                for (var i = snapshot.length - 1; i >= 0; i--) {
                    if (snapshot[i].p.type === 'key' && snapshot[i].p.timestamp <= wanted) {
                        start = i;
                        break;
                    }
                }
                if (start < 0) {
                    for (var j = 0; j < snapshot.length; j++) {
                        if (snapshot[j].p.type === 'key') { start = j; break; }
                    }
                }
                if (start < 0) throw new Error('buffer has no keyframe yet');

                var chosen = snapshot.slice(start);
                if (!chosen.length || chosen[0].p.type !== 'key') throw new Error('clip has no keyframe');

                var target = new M.BufferTarget();
                var output = new M.Output({
                    format: new M.Mp4OutputFormat({ fastStart: 'in-memory' }),
                    target: target
                });
                var packetSource = new M.EncodedVideoPacketSource('avc');
                output.addVideoTrack(packetSource);
                await output.start();

                var base = chosen[0].p.timestamp;
                for (var k = 0; k < chosen.length; k++) {
                    var item = chosen[k];
                    var packet = clonePacket(item, base);
                    var meta = k === 0 ? (item.meta || firstMeta || undefined) : undefined;
                    await packetSource.add(packet, meta);
                }
                packetSource.close();
                await output.finalize();

                var buffer = target.buffer;
                if (!buffer || !buffer.byteLength) throw new Error('empty MP4');
                saveBlob(new Blob([buffer], { type: 'video/mp4' }), filename('RON-Clip-' + duration + 's-', '.mp4'));
            } catch (e) {
                console.error('[RON ClipTools] export error', e);
                setStatus('Could not save clip', true);
            } finally {
                exporting = false;
                if (!recording && !starting && !restartTimer) scheduleRestart(250);
            }
        }).catch(function (e) {
            console.error('[RON ClipTools] queue error', e);
            exporting = false;
            if (!recording && !starting && !restartTimer) scheduleRestart(250);
        });

        return exportQueue;
    }

    function updateDurationButtons() {
        if (!panel) return;
        var buttons = panel.querySelectorAll('.ron-duration button');
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].classList.toggle('active', Number(buttons[i].dataset.seconds) === settings.duration);
        }
    }

    function toggleSettings() {
        if (!settingsPanel) return;
        settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
    }

    function buildUI() {
        if (!document.body || document.getElementById(ID)) return;

        panel = document.createElement('div');
        panel.id = ID;
        panel.innerHTML = '<div class="ron-head"><div><div class="ron-title">RON ClipTools</div><div class="ron-sub">Instant replay for BuildNow</div></div><button class="ron-close">×</button></div>' +
            '<div class="ron-main"><button class="ron-primary ron-clip">Clip last <span class="ron-current">' + settings.duration + 's</span><span class="ron-hotkey">' + settings.clip + '</span></button>' +
            '<div class="ron-duration"><button data-seconds="5">5s</button><button data-seconds="10">10s</button><button data-seconds="15">15s</button><button data-seconds="30">30s</button><button data-seconds="60">60s</button><button data-seconds="120">120s</button></div>' +
            '<button class="ron-secondary ron-shot">Screenshot <span>' + settings.shot + '</span></button>' +
            '<div class="ron-status">Ready</div><button class="ron-settings">Settings</button></div>';

        var style = document.createElement('style');
        style.id = ID + '_style';
        style.textContent = '#' + ID + '{position:fixed!important;top:76px!important;right:18px!important;width:300px!important;z-index:2147483647!important;background:rgba(12,17,14,.97)!important;color:#f4f7f5!important;border:1px solid rgba(53,255,131,.28)!important;border-radius:16px!important;box-shadow:0 18px 55px rgba(0,0,0,.48)!important;font:13px Arial,sans-serif!important;overflow:hidden!important;backdrop-filter:blur(14px)!important}' +
            '#' + ID + ' *{box-sizing:border-box!important}' +
            '#' + ID + ' .ron-head{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:15px 16px 13px!important;border-bottom:1px solid rgba(255,255,255,.07)!important}' +
            '#' + ID + ' .ron-title{font-size:17px!important;font-weight:800!important;letter-spacing:-.3px!important}' +
            '#' + ID + ' .ron-sub{margin-top:3px!important;color:#84918a!important;font-size:11px!important}' +
            '#' + ID + ' .ron-close{border:0!important;background:transparent!important;color:#8b9891!important;font-size:21px!important;line-height:1!important;cursor:pointer!important;padding:2px 4px!important}' +
            '#' + ID + ' .ron-main{padding:14px!important}' +
            '#' + ID + ' button{font:inherit!important}' +
            '#' + ID + ' .ron-primary{position:relative!important;width:100%!important;border:0!important;border-radius:11px!important;padding:12px 48px 12px 12px!important;background:#20a85a!important;color:white!important;font-weight:800!important;cursor:pointer!important;text-align:left!important}' +
            '#' + ID + ' .ron-primary:hover{background:#25bb65!important}' +
            '#' + ID + ' .ron-hotkey{position:absolute!important;right:11px!important;top:50%!important;transform:translateY(-50%)!important;font-size:10px!important;opacity:.72!important}' +
            '#' + ID + ' .ron-duration{display:grid!important;grid-template-columns:repeat(6,1fr)!important;gap:5px!important;margin:9px 0!important}' +
            '#' + ID + ' .ron-duration button{border:1px solid rgba(255,255,255,.08)!important;border-radius:7px!important;padding:7px 2px!important;background:#151d18!important;color:#aab5ae!important;cursor:pointer!important}' +
            '#' + ID + ' .ron-duration button.active{background:#20392a!important;border-color:rgba(53,255,131,.4)!important;color:#5cff99!important}' +
            '#' + ID + ' .ron-secondary{width:100%!important;border:1px solid rgba(255,255,255,.08)!important;border-radius:10px!important;padding:10px!important;background:#151d18!important;color:#e7ece9!important;cursor:pointer!important;text-align:left!important}' +
            '#' + ID + ' .ron-secondary span{float:right!important;color:#7e8b83!important;font-size:10px!important}' +
            '#' + ID + ' .ron-status{text-align:center!important;height:25px!important;padding-top:9px!important;color:#718078!important;font-size:10px!important}' +
            '#' + ID + ' .ron-settings{display:block!important;margin:5px auto 0!important;border:0!important;background:transparent!important;color:#67736c!important;cursor:pointer!important;font-size:10px!important}' +
            '#' + ID + '_settings{position:fixed!important;top:76px!important;right:330px!important;width:250px!important;z-index:2147483647!important;background:#0c110e!important;color:#f4f7f5!important;border:1px solid rgba(255,255,255,.1)!important;border-radius:14px!important;padding:14px!important;box-shadow:0 18px 55px rgba(0,0,0,.48)!important;font:12px Arial,sans-serif!important}' +
            '#' + ID + '_settings label{display:block!important;margin:10px 0!important;color:#aab5ae!important}' +
            '#' + ID + '_settings input{float:right!important;width:70px!important;background:#151d18!important;color:white!important;border:1px solid #303a34!important;border-radius:6px!important;padding:4px!important;text-align:center!important}' +
            '#' + ID + '_settings button{border:0!important;background:#20a85a!important;color:white!important;border-radius:7px!important;padding:7px 10px!important;cursor:pointer!important}';
        document.documentElement.appendChild(style);
        document.body.appendChild(panel);

        settingsPanel = document.createElement('div');
        settingsPanel.id = ID + '_settings';
        settingsPanel.style.display = 'none';
        settingsPanel.innerHTML = '<b style="font-size:14px">ClipTools settings</b><label>Screenshot key <input class="sk"></label><label>Clip key <input class="ck"></label><label>Panel key <input class="pk"></label><button class="done">Done</button>';
        document.body.appendChild(settingsPanel);

        panel.querySelector('.ron-clip').onclick = exportClip;
        panel.querySelector('.ron-shot').onclick = screenshot;
        panel.querySelector('.ron-close').onclick = function () { panel.style.display = 'none'; if (settingsPanel) settingsPanel.style.display = 'none'; };
        panel.querySelector('.ron-settings').onclick = toggleSettings;
        panel.querySelectorAll('.ron-duration button').forEach(function (b) {
            b.onclick = function () {
                settings.duration = Number(b.dataset.seconds);
                saveSettings();
                panel.querySelector('.ron-current').textContent = settings.duration + 's';
                updateDurationButtons();
            };
        });

        var sk = settingsPanel.querySelector('.sk');
        var ck = settingsPanel.querySelector('.ck');
        var pk = settingsPanel.querySelector('.pk');
        sk.value = settings.shot; ck.value = settings.clip; pk.value = settings.panel;
        sk.onchange = function () { settings.shot = sk.value || 'F8'; saveSettings(); panel.querySelector('.ron-shot span').textContent = settings.shot; };
        ck.onchange = function () { settings.clip = ck.value || 'F9'; saveSettings(); panel.querySelector('.ron-hotkey').textContent = settings.clip; };
        pk.onchange = function () { settings.panel = pk.value || 'F7'; saveSettings(); };
        settingsPanel.querySelector('.done').onclick = toggleSettings;
        updateDurationButtons();
    }

    function keyName(e) {
        if (e.code && /^F(?:[1-9]|1[0-2])$/.test(e.code)) return e.code;
        return e.key ? e.key.toUpperCase() : '';
    }

    document.addEventListener('keydown', function (e) {
        var k = keyName(e);
        if (!k) return;
        if (k === settings.shot) { e.preventDefault(); screenshot(); }
        else if (k === settings.clip) { e.preventDefault(); exportClip(); }
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
