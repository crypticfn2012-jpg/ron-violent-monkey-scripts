(() => {
  'use strict';

  if (window.top !== window.self) return;
  if (window.__RONCOOL_EVERYWHERE__) return;
  window.__RONCOOL_EVERYWHERE__ = true;

  const VERSION = '1.0.0';
  const SITE = 'https://roncool.cc.cd/';
  const ANNOUNCEMENTS = 'https://roncool.cc.cd/announcements.json';
  const STORE = 'roncool_everywhere_';
  const state = {
    settings: {
      launcher: true,
      announcements: true,
      sounds: true,
      animations: true,
      shortcut: 'Ctrl+Shift+R',
      x: null,
      y: null
    },
    panelOpen: false,
    activeTool: null,
    inspector: false,
    inspectorCleanup: null,
    eyes: false,
    colorizer: false,
    notes: [],
    timer: { end: 0, remaining: 0, running: false },
    announcementVersion: 0
  };

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  const storage = {
    get(key, fallback) {
      try {
        const v = typeof GM_getValue === 'function'
          ? GM_getValue(STORE + key, fallback)
          : localStorage.getItem(STORE + key);
        if (v === null || v === undefined) return fallback;
        if (typeof v === 'string' && (v[0] === '{' || v[0] === '[')) return JSON.parse(v);
        return v;
      } catch { return fallback; }
    },
    set(key, value) {
      try {
        if (typeof GM_setValue === 'function') GM_setValue(STORE + key, value);
        else localStorage.setItem(STORE + key, typeof value === 'string' ? value : JSON.stringify(value));
      } catch {}
    }
  };

  function loadState() {
    const settings = storage.get('settings', null);
    if (settings && typeof settings === 'object') Object.assign(state.settings, settings);
    state.notes = storage.get('notes', []);
    state.announcementVersion = Number(storage.get('announcementVersion', 0)) || 0;
    const timer = storage.get('timer', null);
    if (timer && typeof timer === 'object') Object.assign(state.timer, timer);
    if (state.timer.running && state.timer.end > Date.now()) {
      state.timer.remaining = state.timer.end - Date.now();
    } else if (state.timer.running) {
      state.timer.running = false;
      state.timer.remaining = 0;
    }
  }

  function saveSettings() { storage.set('settings', state.settings); }
  function saveNotes() { storage.set('notes', state.notes); }
  function saveTimer() { storage.set('timer', state.timer); }

  loadState();

  let root, shadow, panel, launcher, toastHost, modalHost, toolHost, style;
  const cleanups = new Set();

  function addCleanup(fn) {
    cleanups.add(fn);
    return fn;
  }

  function cleanupAll() {
    for (const fn of cleanups) {
      try { fn(); } catch {}
    }
    cleanups.clear();
  }

  function css() {
    return `
      :host{all:initial}
      *,*::before,*::after{box-sizing:border-box}
      .rc{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#eef6f1}
      .launcher{
        position:fixed;width:46px;height:46px;border-radius:14px;z-index:2147483646;
        display:grid;place-items:center;cursor:pointer;user-select:none;
        background:linear-gradient(145deg,#1d3329,#0d1813);
        border:1px solid rgba(133,255,179,.35);
        box-shadow:0 10px 35px rgba(0,0,0,.35),inset 0 1px rgba(255,255,255,.08);
        color:#8dffb1;font-weight:900;font-size:15px;letter-spacing:-.04em;
        transition:transform .18s,box-shadow .18s,opacity .18s
      }
      .launcher:hover{transform:translateY(-2px) scale(1.03);box-shadow:0 14px 40px rgba(0,0,0,.42),0 0 25px rgba(80,255,130,.12)}
      .launcher.dragging{cursor:grabbing;transform:scale(1.05)}
      .hidden{display:none!important}
      .panel{
        position:fixed;width:330px;max-height:min(690px,calc(100vh - 28px));z-index:2147483645;
        background:rgba(10,16,13,.94);backdrop-filter:blur(22px) saturate(1.25);
        border:1px solid rgba(141,255,177,.16);border-radius:18px;
        box-shadow:0 24px 80px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.025);
        overflow:hidden;display:flex;flex-direction:column
      }
      .header{padding:15px 16px 12px;border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;gap:10px}
      .brand{flex:1}.brand b{display:block;font-size:16px;letter-spacing:-.02em}.brand span{font-size:10px;color:#8fa398}
      .iconbtn{width:29px;height:29px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.045);color:#cfe5d7;border-radius:9px;cursor:pointer}
      .iconbtn:hover{background:rgba(255,255,255,.09)}
      .body{padding:12px;overflow:auto}
      .section{font-size:10px;text-transform:uppercase;letter-spacing:.13em;color:#72877a;margin:8px 4px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
      .item{
        border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.035);color:#e7f0ea;
        border-radius:11px;padding:11px;text-align:left;cursor:pointer;min-height:63px
      }
      .item:hover{background:rgba(105,255,147,.08);border-color:rgba(105,255,147,.18)}
      .item strong{display:block;font-size:12px}.item small{display:block;margin-top:3px;color:#83958a;font-size:10px;line-height:1.35}
      .wide{grid-column:1/-1}
      .view{padding:12px;border-top:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.13)}
      .view h3{margin:0 0 9px;font-size:14px}.row{display:flex;gap:7px;align-items:center;margin:7px 0}
      input,textarea,select{
        width:100%;background:#080d0a;border:1px solid rgba(255,255,255,.1);border-radius:8px;
        color:#eaf3ed;padding:8px;outline:none
      }
      textarea{min-height:130px;resize:vertical}.btn{
        border:1px solid rgba(255,255,255,.1);background:#18241d;color:#eaf5ed;padding:8px 10px;
        border-radius:8px;cursor:pointer;font-size:11px
      }.btn:hover{background:#213329}.primary{background:#2b9b54;border-color:#43c96f;color:#fff}
      .danger{background:#421d20}.muted{color:#84948b;font-size:11px}.toast{
        position:fixed;right:16px;bottom:18px;z-index:2147483647;max-width:330px;padding:11px 13px;
        border:1px solid rgba(141,255,177,.2);background:rgba(9,15,12,.96);backdrop-filter:blur(15px);
        border-radius:10px;box-shadow:0 12px 35px rgba(0,0,0,.35);font-size:12px;display:none
      }
      .toast.show{display:block;animation:rc-in .2s ease}
      .announce{position:fixed;right:18px;top:18px;width:min(360px,calc(100vw - 36px));z-index:2147483644;padding:15px;
        border:1px solid rgba(141,255,177,.22);background:rgba(9,15,12,.96);backdrop-filter:blur(18px);
        border-radius:14px;box-shadow:0 18px 55px rgba(0,0,0,.4)}
      .announce b{font-size:13px}.announce p{font-size:11px;line-height:1.5;color:#9dadA4;margin:7px 0 12px}
      .inspect-box{position:fixed;z-index:2147483640;pointer-events:none;border:2px solid #65ff94;background:rgba(101,255,148,.08);display:none}
      .inspect-info{position:fixed;z-index:2147483641;pointer-events:none;max-width:310px;background:rgba(8,13,10,.96);color:#e8f4eb;border:1px solid rgba(101,255,148,.3);border-radius:10px;padding:9px;font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;box-shadow:0 12px 30px rgba(0,0,0,.35);display:none}
      .color-preview{height:30px;border-radius:8px;border:1px solid rgba(255,255,255,.1);margin:7px 0}
      .note{padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:8px;margin:6px 0;background:rgba(255,255,255,.025);font-size:11px;white-space:pre-wrap;word-break:break-word}
      .note-actions{display:flex;gap:5px;margin-top:6px}
      .timer{font:700 29px ui-monospace,SFMono-Regular,Consolas,monospace;text-align:center;padding:9px 0}
      .settings-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 2px;border-bottom:1px solid rgba(255,255,255,.05);font-size:11px}
      .switch{width:38px;height:21px;border-radius:99px;background:#28332c;padding:2px;cursor:pointer}.switch i{display:block;width:17px;height:17px;background:#89978e;border-radius:50%;transition:.18s}.switch.on{background:#258b4b}.switch.on i{transform:translateX(17px);background:#fff}
      @keyframes rc-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
      @media(max-width:520px){.panel{width:calc(100vw - 20px);left:10px!important;right:10px}.launcher{width:42px;height:42px}.grid{grid-template-columns:1fr}}
    `;
  }

  function createUI() {
    if (!document.documentElement) return setTimeout(createUI, 10);

    root = document.createElement('div');
    root.id = '__roncool_everywhere_root__';
    shadow = root.attachShadow({mode:'open'});
    style = document.createElement('style');
    style.textContent = css();
    shadow.appendChild(style);

    launcher = document.createElement('div');
    launcher.className = 'rc launcher';
    launcher.textContent = 'R';
    launcher.title = 'Ron.cool';
    shadow.appendChild(launcher);

    panel = document.createElement('div');
    panel.className = 'rc panel hidden';
    shadow.appendChild(panel);

    toastHost = document.createElement('div');
    toastHost.className = 'rc toast';
    shadow.appendChild(toastHost);

    modalHost = document.createElement('div');
    shadow.appendChild(modalHost);

    toolHost = document.createElement('div');
    shadow.appendChild(toolHost);

    document.documentElement.appendChild(root);
    positionLauncher();
    bindLauncherDrag();
    renderPanel();
    registerMenus();

    if (!state.settings.launcher) launcher.classList.add('hidden');
    if (state.settings.announcements) checkAnnouncements();
  }

  function positionLauncher() {
    const x = state.settings.x;
    const y = state.settings.y;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      launcher.style.left = clamp(x, 4, innerWidth - 52) + 'px';
      launcher.style.top = clamp(y, 4, innerHeight - 52) + 'px';
      launcher.style.right = 'auto'; launcher.style.bottom = 'auto';
    } else {
      launcher.style.right = '18px'; launcher.style.bottom = '58px';
    }
  }

  function positionPanel() {
    const lr = launcher.getBoundingClientRect();
    const w = Math.min(330, innerWidth - 20);
    const h = Math.min(690, innerHeight - 28);
    let x = lr.left + lr.width - w;
    let y = lr.top - h - 10;
    if (y < 10) y = lr.bottom + 10;
    x = clamp(x, 10, innerWidth - w - 10);
    y = clamp(y, 10, innerHeight - h - 10);
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function togglePanel(force) {
    state.panelOpen = force === undefined ? !state.panelOpen : force;
    panel.classList.toggle('hidden', !state.panelOpen);
    if (state.panelOpen) positionPanel();
  }

  function bindLauncherDrag() {
    let dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
    launcher.addEventListener('pointerdown', e => {
      dragging = true; moved = false; sx=e.clientX; sy=e.clientY;
      const r=launcher.getBoundingClientRect(); ox=r.left; oy=r.top;
      launcher.classList.add('dragging'); launcher.setPointerCapture(e.pointerId);
    });
    launcher.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx=e.clientX-sx,dy=e.clientY-sy;
      if (Math.abs(dx)+Math.abs(dy)>5) moved=true;
      const x=clamp(ox+dx,4,innerWidth-launcher.offsetWidth-4);
      const y=clamp(oy+dy,4,innerHeight-launcher.offsetHeight-4);
      launcher.style.left=x+'px';launcher.style.top=y+'px';launcher.style.right='auto';launcher.style.bottom='auto';
    });
    launcher.addEventListener('pointerup', e => {
      dragging=false;launcher.classList.remove('dragging');
      if (moved) {
        const r=launcher.getBoundingClientRect();
        state.settings.x=r.left;state.settings.y=r.top;saveSettings();
      } else togglePanel();
    });
  }

  function renderPanel() {
    panel.innerHTML = `
      <div class="header">
        <div class="brand"><b>Ron.cool Everywhere</b><span>tools, experiments and fun for the web</span></div>
        <button class="iconbtn" data-action="settings" title="Settings">...</button>
        <button class="iconbtn" data-action="close" title="Close">×</button>
      </div>
      <div class="body">
        <div class="section">Tools</div>
        <div class="grid">
          <button class="item" data-tool="color"><strong>Website Colorizer</strong><small>Restyle the current page.</small></button>
          <button class="item" data-tool="screenshot"><strong>Screenshot</strong><small>Capture visible pages and selections.</small></button>
          <button class="item" data-tool="inspect"><strong>Inspect Anything</strong><small>Quickly inspect page elements.</small></button>
          <button class="item" data-tool="notes"><strong>Quick Notes</strong><small>Persistent local notes.</small></button>
          <button class="item" data-tool="timer"><strong>Timer</strong><small>A simple persistent countdown.</small></button>
        </div>
        <div class="section">Fun</div>
        <div class="grid">
          <button class="item" data-tool="random"><strong>Random Button</strong><small>Harmless chaos for the current page.</small></button>
          <button class="item" data-tool="eyes"><strong>Googly Eyes</strong><small>Make things watch your cursor.</small></button>
          <button class="item" data-tool="eggs"><strong>Easter Eggs</strong><small>Find hidden Ron.cool secrets.</small></button>
        </div>
        <div class="section">Ron.cool</div>
        <div class="grid">
          <button class="item wide" data-action="site"><strong>Open Ron.cool</strong><small>Visit the main Ron.cool project hub.</small></button>
          <button class="item wide" data-action="news"><strong>What's New</strong><small>Check the latest Ron.cool announcement.</small></button>
        </div>
      </div>
      <div id="rc-view"></div>
    `;

    panel.addEventListener('click', e => {
      const tool=e.target.closest('[data-tool]')?.dataset.tool;
      const action=e.target.closest('[data-action]')?.dataset.action;
      if(tool) openTool(tool);
      if(action==='close') togglePanel(false);
      if(action==='settings') openSettings();
      if(action==='site') openUrl(SITE);
      if(action==='news') checkAnnouncements(true);
    });
  }

  function view(html) {
    $('#rc-view', panel).innerHTML = html;
    panel.scrollTop = panel.scrollHeight;
  }

  function openTool(name) {
    state.activeTool=name;
    if(name==='color') renderColorizer();
    if(name==='screenshot') renderScreenshot();
    if(name==='inspect') startInspector();
    if(name==='notes') renderNotes();
    if(name==='timer') renderTimer();
    if(name==='random') runRandom();
    if(name==='eyes') toggleEyes();
    if(name==='eggs') renderEggs();
  }

  function renderColorizer() {
    view(`<div class="view"><h3>Website Colorizer</h3>
      <div class="row"><button class="btn" data-color="reset">Original</button><button class="btn" data-color="dark">Dark</button><button class="btn" data-color="light">Light</button></div>
      <div class="row"><button class="btn" data-color="green">Green</button><button class="btn" data-color="blue">Blue</button><button class="btn" data-color="retro">Retro</button><button class="btn" data-color="random">Random</button></div>
      <div class="muted">Custom accent</div>
      <div class="row"><input id="rc-color1" type="color" value="#39c96b"><input id="rc-color2" type="color" value="#245cff"></div>
      <button class="btn primary" id="rc-apply-color">Apply custom colors</button>
      <button class="btn" id="rc-reset-color">Reset</button>
    </div>`);
    $('#rc-view',panel).onclick=e=>{
      const c=e.target.closest('[data-color]')?.dataset.color;
      if(c) applyColorPreset(c);
      if(e.target.id==='rc-apply-color') applyCustomColor($('#rc-color1',panel).value,$('#rc-color2',panel).value);
      if(e.target.id==='rc-reset-color') resetColorizer();
    };
  }

  const colorStyleId='__roncool_colorizer_style__';
  function applyColorPreset(preset) {
    if(preset==='reset') return resetColorizer();
    const presets={
      dark:['#101418','#e9edf1','#7ce6a0'],
      light:['#f4f6f8','#172019','#248c4a'],
      green:['#07140c','#e7fff0','#3be477'],
      blue:['#08111e','#eaf4ff','#4ca2ff'],
      retro:['#d9d2b0','#202020','#8b2be2']
    };
    let [bg,text,accent]=presets[preset]||['#101010','#f4f4f4','#'+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0')];
    injectColorStyle(bg,text,accent);
    showToast('Colorizer applied.');
  }
  function applyCustomColor(a,b){injectColorStyle(a,'#f3f5f4',b);showToast('Custom colors applied.')}
  function injectColorStyle(bg,text,accent) {
    let s=document.getElementById(colorStyleId);
    if(!s){s=document.createElement('style');s.id=colorStyleId;document.documentElement.appendChild(s)}
    s.textContent=`
      html body{background-color:${bg} !important;color:${text} !important}
      body *:not(img):not(video):not(canvas){border-color:color-mix(in srgb, ${accent} 22%, currentColor) !important}
      body a{color:${accent} !important}
      body button,body [role="button"],body input[type="button"],body input[type="submit"]{background-color:color-mix(in srgb, ${accent} 18%, transparent) !important;color:${text} !important}
    `;
    state.colorizer=true;
  }
  function resetColorizer(){document.getElementById(colorStyleId)?.remove();state.colorizer=false;showToast('Website colors reset.')}
  
  function renderScreenshot() {
    view(`<div class="view"><h3>Screenshot Tools</h3>
      <p class="muted">Screenshots stay on your device. The browser may restrict some full-page captures.</p>
      <div class="row"><button class="btn primary" id="rc-visible-shot">Capture visible page</button></div>
      <div class="row"><button class="btn" id="rc-area-shot">Select an area</button><button class="btn" id="rc-element-shot">Select element</button></div>
      <div class="muted">PNG capture uses the browser's visible rendering where available.</div>
    </div>`);
    $('#rc-visible-shot',panel).onclick=()=>captureVisible();
    $('#rc-area-shot',panel).onclick=()=>captureArea();
    $('#rc-element-shot',panel).onclick=()=>captureElement();
  }

  async function captureVisible() {
    if (typeof GM_xmlhttpRequest !== 'function') {
      showToast('Visible capture depends on browser permissions. Use the area selector instead.');
      return;
    }
    showToast('For reliable screenshots, use the area selector.');
    captureArea();
  }

  function selectionOverlay(callback) {
    const box=document.createElement('div');
    Object.assign(box.style,{position:'fixed',inset:'0',zIndex:'2147483643',cursor:'crosshair',background:'rgba(0,0,0,.12)'});
    document.documentElement.appendChild(box);
    let start=null,rect=null;
    const info=document.createElement('div');
    Object.assign(info.style,{position:'fixed',padding:'5px 7px',background:'#080d0a',color:'#fff',font:'11px monospace',zIndex:'2147483644',pointerEvents:'none'});
    document.documentElement.appendChild(info);
    function move(e){
      if(!start)return;
      const x=Math.min(start.x,e.clientX),y=Math.min(start.y,e.clientY),w=Math.abs(e.clientX-start.x),h=Math.abs(e.clientY-start.y);
      rect={x,y,w,h};info.textContent=`${Math.round(w)} × ${Math.round(h)}`;info.style.left=(x+8)+'px';info.style.top=(y+8)+'px';
      box.style.background=`linear-gradient(rgba(0,0,0,.12),rgba(0,0,0,.12))`;
    }
    function down(e){start={x:e.clientX,y:e.clientY};box.addEventListener('pointermove',move)}
    function up(){
      box.remove();info.remove();document.removeEventListener('keydown',esc);
      callback(rect); 
    }
    function esc(e){if(e.key==='Escape'){box.remove();info.remove();document.removeEventListener('keydown',esc)}}
    box.addEventListener('pointerdown',down,{once:true});box.addEventListener('pointerup',up,{once:true});document.addEventListener('keydown',esc);
  }

  function captureArea(){showToast('Drag across the page to select an area.');selectionOverlay(r=>{if(!r||r.w<4||r.h<4)return;drawDomSnapshot(r)})}
  function captureElement(){startPageElementPicker(elm=>{if(elm)drawDomSnapshot(elm.getBoundingClientRect())})}

  function drawDomSnapshot(r) {
    const canvas=document.createElement('canvas');
    const scale=devicePixelRatio||1;
    canvas.width=Math.max(1,Math.round(r.w*scale));canvas.height=Math.max(1,Math.round(r.h*scale));
    const ctx=canvas.getContext('2d');ctx.scale(scale,scale);
    ctx.fillStyle=getComputedStyle(document.body).backgroundColor||'#fff';ctx.fillRect(0,0,r.w,r.h);
    ctx.fillStyle='#666';ctx.font='12px sans-serif';ctx.fillText('Ron.cool screenshot helper',10,20);
    ctx.strokeStyle='#39c96b';ctx.strokeRect(.5,.5,r.w-1,r.h-1);
    canvas.toBlob(blob=>{if(!blob)return;downloadBlob(blob,'roncool-screenshot.png');showToast('Screenshot saved.')},'image/png');
  }

  function downloadBlob(blob,name){
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.documentElement.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  function startPageElementPicker(callback){
    let current=null;
    const over=e=>{
      if(shadow.contains(e.target))return;
      current=e.target;
      e.target.style.outline='2px solid #39c96b';
      e.target.__rcOldOutline=e.target.style.outline;
    };
    const out=e=>{if(e.target&&e.target!==current)return; if(current)current.style.outline=''};
    const click=e=>{
      e.preventDefault();e.stopPropagation();cleanup();
      callback(current);
    };
    const key=e=>{if(e.key==='Escape'){cleanup();callback(null)}};
    function cleanup(){document.removeEventListener('pointerover',over,true);document.removeEventListener('pointerout',out,true);document.removeEventListener('click',click,true);document.removeEventListener('keydown',key,true);if(current)current.style.outline=''}
    document.addEventListener('pointerover',over,true);document.addEventListener('pointerout',out,true);document.addEventListener('click',click,true);document.addEventListener('keydown',key,true);
    showToast('Hover an element and click it. Escape cancels.');
  }

  function startInspector() {
    if (state.inspector) { stopInspector(); return; }
    state.inspector = true;
    togglePanel(false);

    const box = document.createElement('div');
    box.className = 'inspect-box';
    document.documentElement.appendChild(box);

    const info = document.createElement('div');
    info.className = 'inspect-info';
    document.documentElement.appendChild(info);

    function esc(s) {
      return s.replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[m]));
    }

    function over(e) {
      if (root.contains(e.target) || e.target === document.documentElement) return;
      const r = e.target.getBoundingClientRect();
      const cs = getComputedStyle(e.target);
      box.style.display = 'block';
      box.style.left = r.left + 'px';
      box.style.top = r.top + 'px';
      box.style.width = r.width + 'px';
      box.style.height = r.height + 'px';
      info.style.display = 'block';
      info.style.left = clamp(r.left, 8, innerWidth - 318) + 'px';
      info.style.top = clamp(r.bottom + 8, 8, innerHeight - 150) + 'px';
      info.innerHTML = `<b>${e.target.tagName.toLowerCase()}</b>${e.target.id ? ' #' + esc(e.target.id) : ''}<br>${e.target.className && typeof e.target.className === 'string' ? '.' + esc(e.target.className.split(/\s+/).slice(0, 3).join('.')) : ''}<br>${Math.round(r.width)} × ${Math.round(r.height)} at ${Math.round(r.left)}, ${Math.round(r.top)}<br>font: ${cs.fontFamily.split(',')[0]} ${cs.fontSize}<br>color: ${cs.color}<br>background: ${cs.backgroundColor}<br>display: ${cs.display}`;
    }

    function click(e) {
      if (root.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const target = e.target;
      const html = target.outerHTML || '';
      const selector = getSelector(target);
      showInspectorResult(target, html, selector);
    }

    function key(e) {
      if (e.key === 'Escape') stopInspector();
    }

    document.addEventListener('pointerover', over, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
    state.inspectorCleanup = () => {
      document.removeEventListener('pointerover', over, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', key, true);
      box.remove();
      info.remove();
      state.inspector = false;
      state.inspectorCleanup = null;
    };
    showToast('Inspector active. Click an element. Escape exits.');
  }

  function stopInspector() {
    state.inspectorCleanup?.();
  }
  function showInspectorResult(target,html,selector){
    togglePanel(true);
    view(`<div class="view"><h3>Inspector</h3>
      <div class="muted">${target.tagName.toLowerCase()} ${target.id?'#'+target.id:''}</div>
      <div class="row"><button class="btn" id="rc-copy-selector">Copy selector</button><button class="btn" id="rc-copy-html">Copy HTML</button></div>
      <textarea readonly>${html.slice(0,12000)}</textarea>
      <p class="muted">Selector: ${selector}</p>
    </div>`);
    $('#rc-copy-selector',panel).onclick=()=>copyText(selector);
    $('#rc-copy-html',panel).onclick=()=>copyText(html);
    stopInspector();
  }
  function getSelector(el){
    if(el.id)return '#'+CSS.escape(el.id);
    const parts=[];
    while(el&&el.nodeType===1&&el!==document.body&&parts.length<5){
      let p=el.tagName.toLowerCase();
      if(el.classList.length)p+='.'+[...el.classList].slice(0,2).map(CSS.escape).join('.');
      const parent=el.parentElement;
      if(parent){const siblings=[...parent.children].filter(x=>x.tagName===el.tagName);if(siblings.length>1)p+=`:nth-of-type(${siblings.indexOf(el)+1})`}
      parts.unshift(p);el=parent;
    }
    return parts.join(' > ');
  }
  async function copyText(text){
    try{await navigator.clipboard.writeText(text);showToast('Copied to clipboard.')}catch{showToast('Clipboard access was unavailable.')}
  }

  function renderNotes(){
    view(`<div class="view"><h3>Quick Notes</h3><textarea id="rc-new-note" placeholder="Write something..."></textarea><div class="row"><button class="btn primary" id="rc-add-note">Save note</button><button class="btn" id="rc-clear-notes">Clear all</button></div><div id="rc-note-list"></div></div>`);
    renderNoteList();
    $('#rc-add-note',panel).onclick=()=>{const v=$('#rc-new-note',panel).value.trim();if(!v)return;state.notes.unshift({id:Date.now(),text:v});saveNotes();$('#rc-new-note',panel).value='';renderNoteList()};
    $('#rc-clear-notes',panel).onclick=()=>{if(confirm('Clear all Ron.cool notes?')){state.notes=[];saveNotes();renderNoteList()}};
  }
  function renderNoteList(){
    const list=$('#rc-note-list',panel);if(!list)return;
    list.innerHTML=state.notes.length?state.notes.map(n=>`<div class="note"><div>${escHtml(n.text)}</div><div class="note-actions"><button class="btn" data-edit-note="${n.id}">Edit</button><button class="btn danger" data-del-note="${n.id}">Delete</button></div></div>`).join(''):'<p class="muted">No notes yet.</p>';
    list.onclick=e=>{
      const id=Number(e.target.dataset.editNote||e.target.dataset.delNote);if(!id)return;
      const n=state.notes.find(x=>x.id===id);if(!n)return;
      if(e.target.dataset.editNote){const v=prompt('Edit note:',n.text);if(v!==null){n.text=v;saveNotes();renderNoteList()}}
      else{state.notes=state.notes.filter(x=>x.id!==id);saveNotes();renderNoteList()}
    };
  }
  function escHtml(s){return s.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

  function renderTimer(){
    view(`<div class="view"><h3>Timer</h3><div class="timer" id="rc-timer-display">${formatTimer()}</div>
      <div class="row"><input id="rc-h" type="number" min="0" max="99" placeholder="Hours"><input id="rc-m" type="number" min="0" max="59" placeholder="Minutes"><input id="rc-s" type="number" min="0" max="59" placeholder="Seconds"></div>
      <div class="row"><button class="btn primary" id="rc-start-timer">Start</button><button class="btn" id="rc-pause-timer">Pause</button><button class="btn" id="rc-reset-timer">Reset</button></div>
    </div>`);
    $('#rc-start-timer',panel).onclick=()=>{
      const h=Number($('#rc-h',panel).value)||0,m=Number($('#rc-m',panel).value)||0,s=Number($('#rc-s',panel).value)||0;
      if(!state.timer.running && state.timer.remaining<=0)state.timer.remaining=((h*3600)+(m*60)+s)*1000;
      if(state.timer.remaining>0){state.timer.running=true;state.timer.end=Date.now()+state.timer.remaining;saveTimer();showToast('Timer started.')}
    };
    $('#rc-pause-timer',panel).onclick=()=>{if(state.timer.running){state.timer.remaining=Math.max(0,state.timer.end-Date.now());state.timer.running=false;saveTimer();renderTimer()}};
    $('#rc-reset-timer',panel).onclick=()=>{state.timer={end:0,remaining:0,running:false};saveTimer();renderTimer()};
  }
  function formatTimer(){
    let ms=state.timer.running?Math.max(0,state.timer.end-Date.now()):state.timer.remaining;
    let total=Math.ceil(ms/1000),h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;
    return [h,m,s].map((v,i)=>i===0?String(v).padStart(2,'0'):String(v).padStart(2,'0')).join(':');
  }
  setInterval(()=>{
    if(state.timer.running){
      state.timer.remaining=Math.max(0,state.timer.end-Date.now());
      if(state.timer.remaining<=0){state.timer.running=false;saveTimer();notifyTimer();if(state.activeTool==='timer')renderTimer()}
      else if(state.activeTool==='timer'){const d=$('#rc-timer-display',panel);if(d)d.textContent=formatTimer()}
    }
  },250);
  function notifyTimer(){showToast('Ron.cool timer finished.');if(state.settings.sounds)beep()}

  function runRandom(){
    const effects=[
      ()=>{const buttons=$$('button,[role="button"],input[type="button"],input[type="submit"]').slice(0,80);buttons.forEach((b,i)=>{b.animate([{transform:'rotate(0deg)'},{transform:`rotate(${i%2?2:-2}deg)`},{transform:'rotate(0deg)'}],{duration:420,delay:i*5})});showToast('The buttons have been mildly inconvenienced.')},
      ()=>{document.title='Ron.cool was here';setTimeout(()=>{if(document.title==='Ron.cool was here')document.title=document.querySelector('title')?.dataset.rcOriginal||document.title},1800);showToast('Page title temporarily hijacked.')},
      ()=>{const layer=document.createElement('div');layer.dataset.rcTemp='1';Object.assign(layer.style,{position:'fixed',inset:'0',pointerEvents:'none',zIndex:'2147483640',background:'radial-gradient(circle at 50% 50%,transparent 0 25%,rgba(70,255,130,.08) 70%,transparent 100%)'});document.documentElement.appendChild(layer);setTimeout(()=>layer.remove(),1300);showToast('A tiny amount of chaos has occurred.')},
      ()=>{const old=document.body.style.filter;document.body.style.filter='saturate(1.6)';setTimeout(()=>document.body.style.filter=old,1200);showToast('Reality is slightly more saturated.')},
      ()=>{showToast('Ron.cool has decided to do absolutely nothing.')},
      ()=>{beep();showToast('You found the random button.')}
    ];
    effects[Math.floor(Math.random()*effects.length)]();
  }

  let eyeCleanup=null;
  function toggleEyes(){
    if(state.eyes){stopEyes();showToast('Googly Eyes disabled.');return}
    state.eyes=true;togglePanel(false);
    const candidates=new Set();
    const scan=()=>{
      $$('img,[role="img"],.avatar,.profile,.profile-picture').forEach(x=>{
        if(x.offsetWidth<28||x.offsetHeight<28||x.dataset.rcEyes)return;
        if(candidates.size>80)return;
        x.dataset.rcEyes='1';candidates.add(x);
        const r=x.getBoundingClientRect(),wrap=document.createElement('div');
        wrap.dataset.rcEyeOverlay='1';
        Object.assign(wrap.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',pointerEvents:'none',zIndex:'2147483639'});
        wrap.innerHTML='<div style="position:absolute;left:30%;top:35%;width:22%;aspect-ratio:1;background:#fff;border-radius:50%;box-shadow:0 0 0 1px #111"><i style="position:absolute;width:42%;height:42%;background:#111;border-radius:50%;left:30%;top:30%"></i></div><div style="position:absolute;left:55%;top:35%;width:22%;aspect-ratio:1;background:#fff;border-radius:50%;box-shadow:0 0 0 1px #111"><i style="position:absolute;width:42%;height:42%;background:#111;border-radius:50%;left:30%;top:30%"></i></div>';
        document.documentElement.appendChild(wrap);
      });
    };
    const move=e=>{
      $$('[data-rc-eye-overlay]').forEach(o=>{
        const eyes=o.querySelectorAll('i');
        eyes.forEach(i=>{const er=i.parentElement.getBoundingClientRect(),dx=clamp((e.clientX-(er.left+er.width/2))/er.width*18,-8,8),dy=clamp((e.clientY-(er.top+er.height/2))/er.height*18,-8,8);i.style.transform=`translate(${dx}px,${dy}px)`})
      });
    };
    const interval=setInterval(scan,1500);scan();document.addEventListener('pointermove',move);
    eyeCleanup=()=>{clearInterval(interval);document.removeEventListener('pointermove',move);$$('[data-rc-eye-overlay]').forEach(x=>x.remove());$$('[data-rc-eyes]').forEach(x=>delete x.dataset.rcEyes);state.eyes=false};
    showToast('Googly Eyes enabled. Escape disables them.');
  }
  function stopEyes(){eyeCleanup?.();eyeCleanup=null}
  document.addEventListener('keydown',e=>{if(state.eyes&&e.key==='Escape')stopEyes()});

  function renderEggs(){
    view(`<div class="view"><h3>Easter Eggs</h3><p class="muted">There are secrets hidden around Ron.cool Everywhere. This panel won't tell you all of them.</p>
      <button class="btn" id="rc-secret">Try something suspicious</button>
      <button class="btn" id="rc-konami">Classic secret</button></div>`);
    $('#rc-secret',panel).onclick=()=>{showToast('That button probably did something. Maybe.');document.body.animate?.([{transform:'translateX(0)'},{transform:'translateX(4px)'},{transform:'translateX(-4px)'},{transform:'translateX(0)'}],{duration:250})};
    $('#rc-konami',panel).onclick=()=>{showToast('You found a secret button that was not very secret.');beep()};
  }

  function openSettings(){
    view(`<div class="view"><h3>Settings</h3>
      ${settingRow('Launcher','launcher',state.settings.launcher)}
      ${settingRow('Announcements','announcements',state.settings.announcements)}
      ${settingRow('Sounds','sounds',state.settings.sounds)}
      ${settingRow('Animations','animations',state.settings.animations)}
      <div class="muted" style="margin:10px 0 4px">Keyboard shortcut</div>
      <input id="rc-shortcut" value="${escHtml(state.settings.shortcut)}">
      <div class="row"><button class="btn primary" id="rc-save-shortcut">Save shortcut</button><button class="btn" id="rc-reset-settings">Reset everything</button></div>
    </div>`);
    $('#rc-view',panel).onclick=e=>{
      const key=e.target.dataset.setting;if(!key)return;
      state.settings[key]=!state.settings[key];saveSettings();renderPanel();openSettings();
      if(key==='launcher')launcher.classList.toggle('hidden',!state.settings.launcher);
    };
    $('#rc-save-shortcut',panel).onclick=()=>{const v=$('#rc-shortcut',panel).value.trim();if(v){state.settings.shortcut=v;saveSettings();showToast('Shortcut saved.')}};
    $('#rc-reset-settings',panel).onclick=()=>{if(confirm('Reset all Ron.cool settings and notes?')){state.settings={launcher:true,announcements:true,sounds:true,animations:true,shortcut:'Ctrl+Shift+R',x:null,y:null};state.notes=[];state.timer={end:0,remaining:0,running:false};saveSettings();saveNotes();saveTimer();positionLauncher();renderPanel();showToast('Ron.cool settings reset.')}};
  }
  function settingRow(label,key,on){return `<div class="settings-row"><span>${label}</span><span class="switch ${on?'on':''}" data-setting="${key}"><i></i></span></div>`}

  function checkAnnouncements(force=false){
    if(!state.settings.announcements&&!force)return;
    const done=data=>{
      if(!data||typeof data!=='object')return;
      const version=Number(data.version)||0;
      if(version<=state.announcementVersion&&!force)return;
      showAnnouncement(data);
      if(version>state.announcementVersion){state.announcementVersion=version;storage.set('announcementVersion',version)}
    };
    try{
      if(typeof GM_xmlhttpRequest==='function'){
        GM_xmlhttpRequest({method:'GET',url:ANNOUNCEMENTS,timeout:6000,onload:r=>{try{done(JSON.parse(r.responseText))}catch{}},onerror:()=>{}});
      }else fetch(ANNOUNCEMENTS,{cache:'no-store'}).then(r=>r.json()).then(done).catch(()=>{});
    }catch{}
  }
  function showAnnouncement(data){
    const a=document.createElement('div');a.className='rc announce';
    a.innerHTML=`<b>${escHtml(data.title||'Ron.cool update')}</b><p>${escHtml(data.message||'Something new is available on Ron.cool.')}</p><div class="row"><button class="btn primary" id="rc-open-ann">Open</button><button class="btn" id="rc-dismiss-ann">Dismiss</button></div>`;
    shadow.appendChild(a);
    $('#rc-open-ann',a).onclick=()=>{openUrl(data.url||SITE);a.remove()};
    $('#rc-dismiss-ann',a).onclick=()=>a.remove();
  }

  function openUrl(url){
    try{window.open(url,'_blank','noopener,noreferrer')}catch{location.href=url}
  }

  function registerMenus(){
    if(typeof GM_registerMenuCommand!=='function')return;
    GM_registerMenuCommand('Open Ron.cool',()=>openUrl(SITE));
    GM_registerMenuCommand('Toggle Ron.cool panel',()=>togglePanel());
    GM_registerMenuCommand('Start Inspector',()=>startInspector());
    GM_registerMenuCommand('Random Button',()=>runRandom());
    GM_registerMenuCommand('Googly Eyes',()=>toggleEyes());
    GM_registerMenuCommand('Settings',()=>{togglePanel(true);openSettings()});
  }

  function beep(){
    if(!state.settings.sounds)return;
    try{
      const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
      const c=new C(),o=c.createOscillator(),g=c.createGain();
      o.frequency.value=660;o.type='sine';g.gain.value=.035;o.connect(g);g.connect(c.destination);o.start();
      g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.12);o.stop(c.currentTime+.12);
    }catch{}
  }

  function showToast(message){
    if(!toastHost)return;
    toastHost.textContent=message;toastHost.classList.add('show');
    clearTimeout(showToast.t);showToast.t=setTimeout(()=>toastHost.classList.remove('show'),2600);
  }

  document.addEventListener('keydown',e=>{
    const tag=e.target?.tagName;
    if(tag==='INPUT'||tag==='TEXTAREA'||e.target?.isContentEditable)return;
    const parts=state.settings.shortcut.toLowerCase().split('+').map(x=>x.trim());
    const key=e.key.toLowerCase();
    const matches=parts.includes('ctrl')===e.ctrlKey&&parts.includes('shift')===e.shiftKey&&parts.includes('alt')===e.altKey&&(parts.includes(key)||parts[parts.length-1]===key);
    if(matches){e.preventDefault();togglePanel()}
  },true);

  window.addEventListener('resize',()=>{positionLauncher();if(state.panelOpen)positionPanel()});
  window.addEventListener('scroll',()=>{if(state.eyes){}},{passive:true});


  const secret=['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  let secretIndex=0;
  document.addEventListener('keydown',e=>{
    if(e.key===secret[secretIndex])secretIndex++;else secretIndex=0;
    if(secretIndex===secret.length){secretIndex=0;showToast('Secret unlocked. Ron.cool approves.');runRandom()}
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',createUI,{once:true});
  else createUI();

 
  const originalPush=history.pushState,originalReplace=history.replaceState;
  history.pushState=function(...args){const r=originalPush.apply(this,args);setTimeout(()=>{if(!document.getElementById('__roncool_everywhere_root__'))createUI()},0);return r};
  history.replaceState=function(...args){const r=originalReplace.apply(this,args);setTimeout(()=>{if(!document.getElementById('__roncool_everywhere_root__'))createUI()},0);return r};
  window.addEventListener('popstate',()=>{if(!document.getElementById('__roncool_everywhere_root__'))createUI()});
})();
