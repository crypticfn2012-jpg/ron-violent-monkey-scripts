// ==UserScript==
// @name         RON ClipTools
// @namespace    https://ron.cool/userscripts/cliptools
// @version      8.1.0
// @description  RON ClipTools for BuildNow.GG - screenshots and replay clips
// @author       Ron
// @homepageURL  https://crypticfn2012-jpg.github.io/ron-violent-monkey-scripts/
// @supportURL   https://github.com/crypticfn2012-jpg/ron-violent-monkey-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-cliptools.user.js
// @updateURL    https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-cliptools.user.js
// @match        https://buildnow.gg/*
// @match        https://*.buildnow.gg/*
// @match        https://buildnow-gg.game-files.crazygames.com/*
// @run-at       document-body
// @inject-into  content
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  // 8.1.0 is deliberately isolated from other Ron/BuildNow scripts.
  // No page globals, no shared IDs/classes, no monkey-patching of game APIs.
  const ROOT = 'ron-cliptools-v810-root';
  const OLD_ROOT = 'ron-cliptools';
  const KEY = 'ronClipToolsV810';

  // Clean up a previous ClipTools UI if an older copy is still enabled.
  try { document.getElementById(OLD_ROOT)?.remove(); } catch (_) {}
  try { document.getElementById(ROOT)?.remove(); } catch (_) {}

  const settings = {
    screenshot: localStorage.getItem(KEY + ':shot') || 'F8',
    clip: localStorage.getItem(KEY + ':clip') || 'F9',
    panel: localStorage.getItem(KEY + ':panel') || 'F7',
    duration: Number(localStorage.getItem(KEY + ':duration')) || 15
  };

  const state = { recording:false, recorder:null, stream:null, chunks:[] };
  const saveSettings = () => {
    localStorage.setItem(KEY + ':shot', settings.screenshot);
    localStorage.setItem(KEY + ':clip', settings.clip);
    localStorage.setItem(KEY + ':panel', settings.panel);
    localStorage.setItem(KEY + ':duration', String(settings.duration));
  };
  const nowName = () => {
    const d = new Date(), p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  };
  const canvas = () => [...document.querySelectorAll('canvas')]
    .filter(c => c.width > 0 && c.height > 0)
    .sort((a,b) => b.width*b.height - a.width*a.height)[0] || null;

  const root = document.createElement('div');
  root.id = ROOT;
  root.setAttribute('data-ron-cliptools', '1');
  root.style.cssText = 'position:fixed;inset:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
  const shadow = root.attachShadow({mode:'open'});

  shadow.innerHTML = `
    <style>
      #p{position:fixed;top:76px;right:18px;width:310px;pointer-events:auto;background:#0a0f0c;color:#fff;border:1px solid #35ff83;border-radius:14px;box-shadow:0 16px 50px rgba(0,0,0,.55);overflow:hidden;font:14px Arial,sans-serif;display:block}
      #h{padding:14px 15px;background:#101712;border-bottom:1px solid #202b23;cursor:move;user-select:none}
      #t{font-size:17px;font-weight:800;color:#35ff83} #s{font-size:11px;color:#718078;margin-top:3px}
      #b{padding:12px} button{width:100%;box-sizing:border-box;border:0;border-radius:9px;padding:10px;margin:0 0 8px;background:#1a241d;color:#fff;font-weight:700;cursor:pointer}
      button:hover{background:#26362b} button:disabled{opacity:.4;cursor:not-allowed} #shot,#save{background:#168c46} #buf{background:#214d32} #site{background:#35ff83;color:#061008}
      .r{display:flex;align-items:center;justify-content:space-between;gap:8px;color:#aab5ae;font-size:12px;margin:8px 0}
      input,select{width:108px;box-sizing:border-box;background:#080b09;color:#fff;border:1px solid #303b33;border-radius:6px;padding:6px}
      #timer{text-align:center;color:#35ff83;font-size:11px;min-height:14px;margin:-1px 0 8px} #st{text-align:center;color:#7a867e;font-size:11px;line-height:14px;min-height:28px;padding-top:2px}
      #x{float:right;border:0;background:transparent;color:#718078;width:auto;padding:0;margin:0;font-size:16px} #x:hover{color:#fff}
      .small{font-size:10px;color:#657168;line-height:1.35;margin:3px 0 8px}
    </style>
    <div id="p">
      <div id="h"><button id="x" title="Hide">×</button><div id="t">RON ClipTools</div><div id="s">RON Labs • BuildNow.GG</div></div>
      <div id="b">
        <button id="shot">Screenshot</button>
        <button id="buf">Start Clip Buffer</button>
        <button id="save" disabled>Save Last ${settings.duration}s</button>
        <div id="timer">Buffer is off</div>
        <button id="site">RON Labs Clips</button>
        <div class="small">Browser canvas capture only. No game data or network hooks.</div>
        <div class="r"><span>Clip length</span><select id="dur"><option>5</option><option>10</option><option>15</option><option>30</option><option>60</option><option>120</option></select></div>
        <div class="r"><span>Screenshot key</span><input id="sk"></div>
        <div class="r"><span>Clip key</span><input id="ck"></div>
        <div class="r"><span>Window key</span><input id="pk"></div>
        <div id="st">ClipTools loaded</div>
      </div>
    </div>`;

  const $ = id => shadow.getElementById(id);
  $('sk').value = settings.screenshot; $('ck').value = settings.clip; $('pk').value = settings.panel; $('dur').value = String(settings.duration);
  const status = x => { $('st').textContent = x; };
  const ui = () => { $('buf').textContent = state.recording ? 'Stop Clip Buffer' : 'Start Clip Buffer'; $('save').disabled = !state.recording; $('save').textContent = `Save Last ${settings.duration}s`; $('timer').textContent = state.recording ? 'Replay buffer is running' : 'Buffer is off'; };
  const download = (blob,name) => {
    if (!blob?.size) return status('Nothing to save');
    const u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href=u; a.download=name; a.rel='noopener'; a.style.display='none'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 30000); status(`Saved ${name}`);
  };
  const screenshot = () => {
    const c = canvas(); if (!c) return status('No BuildNow canvas found');
    try { c.toBlob(b => b ? download(b,`RON-Screenshot-${nowName()}.png`) : status('Screenshot failed'),'image/png'); }
    catch(e){ console.error('[RON ClipTools]',e); status('Screenshot unavailable'); }
  };
  const mime = () => {
    if (!window.MediaRecorder?.isTypeSupported) return '';
    return ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(x => MediaRecorder.isTypeSupported(x)) || '';
  };
  const trim = () => { const cut=Date.now()-125000; while(state.chunks.length>1 && state.chunks[0].time<cut) state.chunks.shift(); };
  const start = () => {
    if (state.recording) return;
    const c=canvas(), m=mime(); if(!c) return status('BuildNow canvas not ready'); if(!m) return status('Video recording is unavailable');
    try {
      state.stream=c.captureStream(60);
      state.recorder=new MediaRecorder(state.stream,{mimeType:m,videoBitsPerSecond:8000000}); state.chunks=[];
      state.recorder.ondataavailable=e=>{if(e.data?.size){state.chunks.push({blob:e.data,time:Date.now()});trim();}};
      state.recorder.onerror=e=>{console.error('[RON ClipTools]',e);status('Recorder error');};
      state.recorder.start(1000); state.recording=true; ui(); status('Replay buffer ON');
    } catch(e){ console.error('[RON ClipTools]',e); stop(); status('Could not start recording'); }
  };
  const stop = () => {
    try { if(state.recorder && state.recorder.state!=='inactive') state.recorder.stop(); } catch(_) {}
    state.stream?.getTracks().forEach(t=>t.stop()); state.stream=null; state.recorder=null; state.recording=false; state.chunks=[]; ui();
  };
  const saveClip = () => {
    if(!state.recording || !state.recorder) return status('Start Clip Buffer first');
    if(state.chunks.length<2) return status('Buffer warming up — wait a few seconds');
    const cut=Date.now()-settings.duration*1000;
    const blobs=state.chunks.filter(x=>x.time>=cut).map(x=>x.blob);
    if(!blobs.length) return status('Not enough footage yet');
    download(new Blob(blobs,{type:state.recorder.mimeType||'video/webm'}),`RON-Clip-${settings.duration}s-${nowName()}.webm`);
  };
  const toggle = () => { $('p').style.display = $('p').style.display==='none' ? 'block' : 'none'; };
  const match = (e,k) => String(e.key).toLowerCase()===String(k).toLowerCase();

  $('shot').onclick=screenshot; $('buf').onclick=()=>state.recording?stop():start(); $('save').onclick=saveClip;
  $('site').onclick=()=>window.open('https://ron.cool/clips','_blank','noopener,noreferrer'); $('x').onclick=toggle;
  $('dur').onchange=e=>{settings.duration=Number(e.target.value)||15;saveSettings();ui();};
  $('sk').onchange=e=>{settings.screenshot=e.target.value.trim()||'F8';saveSettings();}; $('ck').onchange=e=>{settings.clip=e.target.value.trim()||'F9';saveSettings();}; $('pk').onchange=e=>{settings.panel=e.target.value.trim()||'F7';saveSettings();};

  let drag=false,dx=0,dy=0;
  $('h').addEventListener('mousedown',e=>{if(e.target===$('x'))return;drag=true;const r=$('p').getBoundingClientRect();dx=e.clientX-r.left;dy=e.clientY-r.top;$('p').style.left=r.left+'px';$('p').style.top=r.top+'px';$('p').style.right='auto';});
  document.addEventListener('mousemove',e=>{if(drag){$('p').style.left=(e.clientX-dx)+'px';$('p').style.top=(e.clientY-dy)+'px';}}); document.addEventListener('mouseup',()=>drag=false);
  document.addEventListener('keydown',e=>{if(e.defaultPrevented||e.repeat)return;if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target?.isContentEditable)return;if(match(e,settings.screenshot)){e.preventDefault();screenshot();}else if(match(e,settings.clip)){e.preventDefault();saveClip();}else if(match(e,settings.panel)){e.preventDefault();toggle();}},false);

  const mount=()=>{if(!document.documentElement)return;if(!root.isConnected)document.documentElement.appendChild(root);};
  mount();
  new MutationObserver(mount).observe(document.documentElement,{childList:true});
  ui();
})();
