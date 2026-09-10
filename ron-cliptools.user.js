// ==UserScript==
// @name         RON ClipTools
// @namespace    https://ron.cool/userscripts/cliptools-v9
// @version      9.1.0
// @description  RON ClipTools for BuildNow.GG - screenshots and replay clips
// @author       Ron
// @homepageURL  https://crypticfn2012-jpg.github.io/ron-violent-monkey-scripts/
// @supportURL   https://github.com/crypticfn2012-jpg/ron-violent-monkey-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-cliptools.user.js
// @updateURL    https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-cliptools.user.js
// @match        *://buildnow.gg/*
// @match        *://*.buildnow.gg/*
// @match        *://buildnow-gg.game-files.crazygames.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // v9.1: intentionally allow execution inside matching iframes.
    // BuildNow/CrazyGames can host the actual Unity game in a nested frame,
    // and @noframes prevented ClipTools from ever reaching that document.
    var ID = '__RON_CLIPTOOLS_V910__';
    var panel;
    var settings = { shot: 'F8', clip: 'F9', panel: 'F7', duration: 15 };
    var recording = false;
    var recorder = null;
    var stream = null;
    var chunks = [];

    try {
        settings.shot = localStorage.getItem('ron_cliptools_v9_shot') || 'F8';
        settings.clip = localStorage.getItem('ron_cliptools_v9_clip') || 'F9';
        settings.panel = localStorage.getItem('ron_cliptools_v9_panel') || 'F7';
        settings.duration = Number(localStorage.getItem('ron_cliptools_v9_duration')) || 15;
    } catch (_) {}

    function saveSettings() {
        try {
            localStorage.setItem('ron_cliptools_v9_shot', settings.shot);
            localStorage.setItem('ron_cliptools_v9_clip', settings.clip);
            localStorage.setItem('ron_cliptools_v9_panel', settings.panel);
            localStorage.setItem('ron_cliptools_v9_duration', String(settings.duration));
        } catch (_) {}
    }

    function findCanvas() {
        var list = document.getElementsByTagName('canvas');
        var best = null;
        var bestArea = 0;
        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            var area = (c.width || 0) * (c.height || 0);
            if (area > bestArea) {
                best = c;
                bestArea = area;
            }
        }
        return best;
    }

    function filename() {
        var d = new Date();
        function p(n) { return String(n).padStart(2, '0'); }
        return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + '-' + p(d.getMinutes()) + '-' + p(d.getSeconds());
    }

    function setStatus(text) {
        var e = panel && panel.querySelector('#rc91-status');
        if (e) e.textContent = text;
    }

    function download(blob, name) {
        if (!blob || !blob.size) return setStatus('Nothing to save');
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
        setStatus('Saved ' + name);
    }

    function screenshot() {
        var c = findCanvas();
        if (!c) return setStatus('No BuildNow canvas found');
        try {
            c.toBlob(function (blob) {
                if (blob) download(blob, 'RON-Screenshot-' + filename() + '.png');
                else setStatus('Screenshot failed');
            }, 'image/png');
        } catch (e) {
            console.error('[RON ClipTools]', e);
            setStatus('Screenshot unavailable');
        }
    }

    function mimeType() {
        if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
        var types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
        for (var i = 0; i < types.length; i++) {
            if (MediaRecorder.isTypeSupported(types[i])) return types[i];
        }
        return '';
    }

    function trimChunks() {
        var cutoff = Date.now() - 125000;
        while (chunks.length > 1 && chunks[0].time < cutoff) chunks.shift();
    }

    function updateButtons() {
        if (!panel) return;
        var b = panel.querySelector('#rc91-buffer');
        var s = panel.querySelector('#rc91-save');
        var t = panel.querySelector('#rc91-timer');
        if (b) b.textContent = recording ? 'Stop Clip Buffer' : 'Start Clip Buffer';
        if (s) {
            s.disabled = !recording;
            s.textContent = 'Save Last ' + settings.duration + 's';
        }
        if (t) t.textContent = recording ? 'Replay buffer is running' : 'Buffer is off';
    }

    function startBuffer() {
        if (recording) return;
        var c = findCanvas();
        if (!c) return setStatus('BuildNow canvas not ready yet');
        if (!c.captureStream || !window.MediaRecorder) return setStatus('Canvas recording is unavailable');
        var type = mimeType();
        if (!type) return setStatus('Video recording is unavailable');
        try {
            stream = c.captureStream(60);
            recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8000000 });
            chunks = [];
            recorder.ondataavailable = function (e) {
                if (e.data && e.data.size) {
                    chunks.push({ blob: e.data, time: Date.now() });
                    trimChunks();
                }
            };
            recorder.onerror = function (e) {
                console.error('[RON ClipTools] recorder error', e);
                setStatus('Recorder error');
            };
            recorder.start(1000);
            recording = true;
            updateButtons();
            setStatus('Replay buffer ON');
        } catch (e) {
            console.error('[RON ClipTools] start error', e);
            try { if (stream) stream.getTracks().forEach(function(t){ t.stop(); }); } catch (_) {}
            stream = null;
            recorder = null;
            recording = false;
            updateButtons();
            setStatus('Could not start recording');
        }
    }

    function stopBuffer() {
        try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch (_) {}
        try { if (stream) stream.getTracks().forEach(function(t){ t.stop(); }); } catch (_) {}
        stream = null;
        recorder = null;
        recording = false;
        chunks = [];
        updateButtons();
        setStatus('Buffer OFF');
    }

    function saveClip() {
        if (!recording || !recorder) return setStatus('Start Clip Buffer first');
        if (chunks.length < 2) return setStatus('Buffer warming up — wait a few seconds');
        var cutoff = Date.now() - settings.duration * 1000;
        var recent = [];
        for (var i = 0; i < chunks.length; i++) {
            if (chunks[i].time >= cutoff) recent.push(chunks[i].blob);
        }
        if (!recent.length) return setStatus('Not enough footage yet');
        download(new Blob(recent, { type: recorder.mimeType || 'video/webm' }), 'RON-Clip-' + settings.duration + 's-' + filename() + '.webm');
    }

    function togglePanel() {
        if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }

    function build() {
        if (!document.body || document.getElementById(ID)) return false;

        panel = document.createElement('div');
        panel.id = ID;
        panel.style.cssText = 'position:fixed!important;top:76px!important;right:18px!important;width:310px!important;z-index:2147483647!important;display:block!important;background:#0a0f0c!important;color:#fff!important;border:1px solid #35ff83!important;border-radius:14px!important;box-shadow:0 16px 50px rgba(0,0,0,.55)!important;font:14px Arial,sans-serif!important;overflow:hidden!important;pointer-events:auto!important;';
        panel.innerHTML = '<div id="rc91-head" style="padding:14px 15px;background:#101712;color:#fff;cursor:move;user-select:none"><b style="font-size:17px;color:#35ff83">RON ClipTools</b><div style="font-size:11px;color:#718078;margin-top:3px">RON Labs • BuildNow.GG</div></div>' +
            '<div style="padding:12px">' +
            '<button id="rc91-shot">Screenshot</button>' +
            '<button id="rc91-buffer">Start Clip Buffer</button>' +
            '<button id="rc91-save" disabled>Save Last ' + settings.duration + 's</button>' +
            '<div id="rc91-timer" style="text-align:center;color:#35ff83;font-size:11px;margin:2px 0 9px">Buffer is off</div>' +
            '<button id="rc91-site">RON Labs Clips</button>' +
            '<div style="font-size:10px;color:#657168;line-height:1.35;margin:3px 0 9px">Browser canvas capture only. No game data or network hooks.</div>' +
            '<label style="display:flex;justify-content:space-between;align-items:center;color:#aab5ae;font-size:12px;margin:8px 0">Clip length <select id="rc91-duration"><option value="5">5 seconds</option><option value="10">10 seconds</option><option value="15">15 seconds</option><option value="30">30 seconds</option><option value="60">60 seconds</option><option value="120">120 seconds</option></select></label>' +
            '<label style="display:flex;justify-content:space-between;align-items:center;color:#aab5ae;font-size:12px;margin:8px 0">Screenshot key <input id="rc91-sk"></label>' +
            '<label style="display:flex;justify-content:space-between;align-items:center;color:#aab5ae;font-size:12px;margin:8px 0">Clip key <input id="rc91-ck"></label>' +
            '<label style="display:flex;justify-content:space-between;align-items:center;color:#aab5ae;font-size:12px;margin:8px 0">Window key <input id="rc91-pk"></label>' +
            '<div id="rc91-status" style="text-align:center;color:#7a867e;font-size:11px;line-height:14px;min-height:28px;padding-top:2px">RON ClipTools 9.1.0 loaded</div>' +
            '</div>';

        var style = document.createElement('style');
        style.textContent = '#' + ID + ' button{width:100%;box-sizing:border-box;border:0;border-radius:9px;padding:10px;margin:0 0 8px;background:#1a241d;color:#fff;font-weight:700;cursor:pointer}#' + ID + ' button:hover{background:#26362b}#' + ID + ' button:disabled{opacity:.4;cursor:not-allowed}#' + ID + ' #rc91-shot,#' + ID + ' #rc91-save{background:#168c46}#' + ID + ' #rc91-buffer{background:#214d32}#' + ID + ' #rc91-site{background:#35ff83;color:#061008}#' + ID + ' input,#' + ID + ' select{width:108px;box-sizing:border-box;background:#080b09;color:#fff;border:1px solid #303b33;border-radius:6px;padding:6px}';
        document.documentElement.appendChild(style);
        document.body.appendChild(panel);

        panel.querySelector('#rc91-sk').value = settings.shot;
        panel.querySelector('#rc91-ck').value = settings.clip;
        panel.querySelector('#rc91-pk').value = settings.panel;
        panel.querySelector('#rc91-duration').value = String(settings.duration);
        panel.querySelector('#rc91-shot').onclick = screenshot;
        panel.querySelector('#rc91-buffer').onclick = function(){ recording ? stopBuffer() : startBuffer(); };
        panel.querySelector('#rc91-save').onclick = saveClip;
        panel.querySelector('#rc91-site').onclick = function(){ window.open('https://ron.cool/clips', '_blank'); };
        panel.querySelector('#rc91-duration').onchange = function(e){ settings.duration=Number(e.target.value)||15; saveSettings(); updateButtons(); };
        panel.querySelector('#rc91-sk').onchange = function(e){ settings.shot=e.target.value.trim()||'F8'; saveSettings(); };
        panel.querySelector('#rc91-ck').onchange = function(e){ settings.clip=e.target.value.trim()||'F9'; saveSettings(); };
        panel.querySelector('#rc91-pk').onchange = function(e){ settings.panel=e.target.value.trim()||'F7'; saveSettings(); };

        var head = panel.querySelector('#rc91-head');
        var dragging = false, dx = 0, dy = 0;
        head.addEventListener('mousedown', function(e){
            if (e.button !== 0) return;
            dragging = true;
            var r = panel.getBoundingClientRect();
            dx = e.clientX - r.left; dy = e.clientY - r.top;
            panel.style.right = 'auto';
            panel.style.left = r.left + 'px';
            panel.style.top = r.top + 'px';
        });
        document.addEventListener('mousemove', function(e){ if(dragging){ panel.style.left=(e.clientX-dx)+'px'; panel.style.top=(e.clientY-dy)+'px'; } });
        document.addEventListener('mouseup', function(){ dragging=false; });
        updateButtons();
        return true;
    }

    document.addEventListener('keydown', function(e){
        if (e.repeat || e.defaultPrevented) return;
        var target = e.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
        var key = String(e.key).toLowerCase();
        if (key === String(settings.shot).toLowerCase()) { e.preventDefault(); screenshot(); }
        else if (key === String(settings.clip).toLowerCase()) { e.preventDefault(); saveClip(); }
        else if (key === String(settings.panel).toLowerCase()) { e.preventDefault(); togglePanel(); }
    }, false);

    function ensure() {
        if (!panel || !panel.isConnected) build();
    }

    ensure();
    var tries = 0;
    var timer = setInterval(function(){
        tries++;
        ensure();
        if (panel && panel.isConnected) clearInterval(timer);
        if (tries > 120) clearInterval(timer);
    }, 250);
})();
