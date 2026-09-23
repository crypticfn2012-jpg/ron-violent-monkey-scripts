// ==UserScript==
// @name         Ron Crosshair
// @namespace    https://ron.cool/
// @version      1.0.0
// @description  Custom crosshair overlay and creator for BuildNow.gg and 1v1 LOL RELOADED.
// @author       Ron
// @match        *://buildnow.gg/*
// @match        *://www.buildnow.gg/*
// @match        *://buildnow-gg.game-files.crazygames.com/unity/unity2020/*
// @match        https://1v1lolreloaded.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const isReloadedSite = location.hostname === '1v1lolreloaded.com' || location.hostname === 'www.1v1lolreloaded.com';
    if (isReloadedSite && window.top === window.self) return;

    if (window.__RON_CROSSHAIR__) return;
    window.__RON_CROSSHAIR__ = true;

    const STORAGE_KEY = 'ron-crosshair-settings-v1';
    const PRESETS_KEY = 'ron-crosshair-presets-v1';

    const defaults = {
        enabled: true,
        shape: 'cross',
        size: 18,
        thickness: 2,
        gap: 5,
        outline: 1,
        opacity: 100,
        color: '#35ff6a',
        centerDot: false,
        dotSize: 3,
        dotColor: '#35ff6a'
    };

    const builtInPresets = {
        'Nova Green': {
            shape: 'cross',
            size: 18,
            thickness: 2,
            gap: 5,
            outline: 1,
            opacity: 100,
            color: '#35ff6a',
            centerDot: false,
            dotSize: 3,
            dotColor: '#35ff6a'
        },
        'Minimal': {
            shape: 'cross',
            size: 12,
            thickness: 1,
            gap: 4,
            outline: 1,
            opacity: 92,
            color: '#ffffff',
            centerDot: false,
            dotSize: 2,
            dotColor: '#ffffff'
        },
        'Competitive': {
            shape: 'cross',
            size: 16,
            thickness: 2,
            gap: 3,
            outline: 2,
            opacity: 100,
            color: '#00ff66',
            centerDot: true,
            dotSize: 2,
            dotColor: '#ffffff'
        },
        'Classic': {
            shape: 'cross',
            size: 20,
            thickness: 2,
            gap: 6,
            outline: 2,
            opacity: 100,
            color: '#ffffff',
            centerDot: false,
            dotSize: 3,
            dotColor: '#ffffff'
        },
        'Tiny Dot': {
            shape: 'dot',
            size: 4,
            thickness: 2,
            gap: 0,
            outline: 1,
            opacity: 100,
            color: '#35ff6a',
            centerDot: false,
            dotSize: 2,
            dotColor: '#35ff6a'
        }
    };

    let settings = loadSettings();
    let savedPresets = loadSavedPresets();

    function loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            return { ...defaults, ...(saved && typeof saved === 'object' ? saved : {}) };
        } catch {
            return { ...defaults };
        }
    }

    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch {
        }
    }

    function loadSavedPresets() {
        try {
            const saved = JSON.parse(localStorage.getItem(PRESETS_KEY) || '{}');
            return saved && typeof saved === 'object' ? saved : {};
        } catch {
            return {};
        }
    }

    function saveSavedPresets() {
        try {
            localStorage.setItem(PRESETS_KEY, JSON.stringify(savedPresets));
        } catch {
        }
    }

    const host = document.createElement('div');
    host.id = 'ron-crosshair-root';
    host.style.cssText = [
        'position:fixed',
        'inset:0',
        'width:100%',
        'height:100%',
        'pointer-events:none',
        'z-index:2147483647',
        'font-family:Arial,Helvetica,sans-serif'
    ].join(';');

    const shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

    const style = document.createElement('style');
    style.textContent = `
        :host, #ron-root {
            all: initial;
        }

        .ron-layer {
            position: fixed;
            inset: 0;
            width: 100vw;
            height: 100vh;
            pointer-events: none;
            z-index: 2147483647;
        }

        .ron-crosshair-wrap {
            position: absolute;
            left: 50%;
            top: 50%;
            width: 0;
            height: 0;
            transform: translate(-50%, -50%);
            pointer-events: none;
        }

        .ron-crosshair {
            position: relative;
            width: 0;
            height: 0;
            pointer-events: none;
        }

        .ron-piece {
            position: absolute;
            left: 0;
            top: 0;
            box-sizing: border-box;
            pointer-events: none;
            border-radius: 0;
        }

        .ron-center-dot {
            position: absolute;
            left: 0;
            top: 0;
            transform: translate(-50%, -50%);
            box-sizing: border-box;
            pointer-events: none;
            border-radius: 50%;
        }

        .ron-ui-button {
            position: fixed;
            top: 14px;
            right: 14px;
            min-width: 48px;
            height: 34px;
            padding: 0 12px;
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 9px;
            background: rgba(10,10,10,.88);
            color: #fff;
            font: 700 12px/34px Arial,Helvetica,sans-serif;
            letter-spacing: .08em;
            text-align: center;
            cursor: pointer;
            pointer-events: auto;
            user-select: none;
            box-shadow: 0 8px 30px rgba(0,0,0,.25);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            transition: border-color .15s ease, transform .15s ease, background .15s ease;
        }

        .ron-ui-button:hover {
            border-color: rgba(53,255,106,.55);
            background: rgba(15,15,15,.96);
            transform: translateY(-1px);
        }

        .ron-ui-button.off {
            opacity: .58;
        }

        .ron-panel {
            position: fixed;
            top: 56px;
            right: 14px;
            width: 292px;
            max-height: calc(100vh - 70px);
            overflow: auto;
            padding: 16px;
            border: 1px solid rgba(255,255,255,.11);
            border-radius: 14px;
            background: rgba(13,13,13,.96);
            color: #f4f4f4;
            font: 13px/1.35 Arial,Helvetica,sans-serif;
            box-shadow: 0 18px 55px rgba(0,0,0,.42);
            pointer-events: auto;
            display: none;
            scrollbar-width: thin;
        }

        .ron-panel.open {
            display: block;
        }

        .ron-heading {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            margin-bottom: 13px;
        }

        .ron-title {
            margin: 0;
            font-size: 17px;
            line-height: 1;
            letter-spacing: -.02em;
        }

        .ron-subtitle {
            margin: 5px 0 0;
            color: #858585;
            font-size: 11px;
        }

        .ron-status {
            color: #35ff6a;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: .08em;
        }

        .ron-section {
            padding-top: 13px;
            margin-top: 13px;
            border-top: 1px solid rgba(255,255,255,.07);
        }

        .ron-row {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 12px;
            align-items: center;
            margin: 9px 0;
        }

        .ron-label {
            color: #bcbcbc;
            font-size: 12px;
        }

        .ron-value {
            color: #fff;
            font-size: 11px;
            font-variant-numeric: tabular-nums;
            min-width: 34px;
            text-align: right;
        }

        .ron-range {
            grid-column: 1 / -1;
            width: 100%;
            margin: -2px 0 2px;
            accent-color: #35ff6a;
            cursor: pointer;
        }

        .ron-select,
        .ron-name-input {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 8px;
            background: #181818;
            color: #f2f2f2;
            outline: none;
            padding: 8px 9px;
            font: 12px Arial,Helvetica,sans-serif;
        }

        .ron-color {
            width: 44px;
            height: 28px;
            padding: 0;
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 7px;
            background: none;
            cursor: pointer;
        }

        .ron-check {
            width: 16px;
            height: 16px;
            accent-color: #35ff6a;
            cursor: pointer;
        }

        .ron-preview {
            height: 120px;
            border: 1px solid rgba(255,255,255,.08);
            border-radius: 10px;
            overflow: hidden;
            position: relative;
            background:
                linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px),
                linear-gradient(135deg, #202020, #101010);
            background-size: 24px 24px, 24px 24px, auto;
            margin-bottom: 11px;
        }

        .ron-preview-label {
            position: absolute;
            top: 8px;
            left: 9px;
            color: #666;
            font-size: 9px;
            letter-spacing: .1em;
            text-transform: uppercase;
        }

        .ron-preview-crosshair {
            position: absolute;
            left: 50%;
            top: 50%;
            width: 0;
            height: 0;
            transform: translate(-50%, -50%);
        }

        .ron-preview-piece {
            position: absolute;
            left: 0;
            top: 0;
            box-sizing: border-box;
            pointer-events: none;
        }

        .ron-preview-dot {
            position: absolute;
            left: 0;
            top: 0;
            transform: translate(-50%, -50%);
            pointer-events: none;
            box-sizing: border-box;
            border-radius: 50%;
        }

        .ron-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 7px;
            margin-top: 12px;
        }

        .ron-action,
        .ron-preset {
            min-height: 34px;
            border: 1px solid rgba(255,255,255,.1);
            border-radius: 8px;
            background: #181818;
            color: #f1f1f1;
            font: 600 11px Arial,Helvetica,sans-serif;
            cursor: pointer;
            transition: border-color .15s ease, background .15s ease;
        }

        .ron-action:hover,
        .ron-preset:hover {
            background: #202020;
            border-color: rgba(53,255,106,.42);
        }

        .ron-action.primary {
            background: rgba(53,255,106,.12);
            border-color: rgba(53,255,106,.32);
            color: #baffca;
        }

        .ron-preset-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 7px;
        }

        .ron-preset {
            min-height: 38px;
            text-align: left;
            padding: 7px 9px;
        }

        .ron-preset strong {
            display: block;
            color: #fff;
            font-size: 11px;
        }

        .ron-preset span {
            display: block;
            margin-top: 2px;
            color: #6f6f6f;
            font-size: 9px;
            font-weight: 400;
        }

        .ron-saved {
            margin-top: 7px;
        }

        .ron-saved-row {
            display: grid;
            grid-template-columns: 1fr 34px;
            gap: 7px;
            margin-top: 7px;
        }

        .ron-delete {
            border: 1px solid rgba(255,255,255,.1);
            border-radius: 8px;
            background: #181818;
            color: #aaa;
            cursor: pointer;
            font: 12px Arial,Helvetica,sans-serif;
        }

        .ron-hint {
            margin-top: 11px;
            color: #666;
            font-size: 9px;
            line-height: 1.45;
        }

        .ron-toast {
            position: fixed;
            left: 50%;
            bottom: 22px;
            transform: translateX(-50%) translateY(8px);
            padding: 8px 11px;
            border: 1px solid rgba(255,255,255,.1);
            border-radius: 8px;
            background: rgba(12,12,12,.95);
            color: #fff;
            font: 11px Arial,Helvetica,sans-serif;
            opacity: 0;
            pointer-events: none;
            transition: opacity .15s ease, transform .15s ease;
            box-shadow: 0 12px 30px rgba(0,0,0,.3);
        }

        .ron-toast.show {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }

        @media (max-width: 560px) {
            .ron-panel {
                right: 8px;
                left: 8px;
                width: auto;
            }

            .ron-ui-button {
                right: 8px;
                top: 8px;
            }
        }
    `;

    const layer = document.createElement('div');
    layer.className = 'ron-layer';

    const crosshairWrap = document.createElement('div');
    crosshairWrap.className = 'ron-crosshair-wrap';

    const crosshair = document.createElement('div');
    crosshair.className = 'ron-crosshair';
    crosshairWrap.appendChild(crosshair);

    const button = document.createElement('button');
    button.className = 'ron-ui-button';
    button.type = 'button';
    button.textContent = 'RON';

    const panel = document.createElement('div');
    panel.className = 'ron-panel';
    panel.innerHTML = `
        <div class="ron-heading">
            <div>
                <h2 class="ron-title">RON Crosshair</h2>
                <p class="ron-subtitle">BuildNow.gg and 1v1.lol crosshair creator</p>
            </div>
            <div class="ron-status">ON</div>
        </div>

        <div class="ron-preview">
            <div class="ron-preview-label">Live Preview</div>
            <div class="ron-preview-crosshair"></div>
        </div>

        <div class="ron-row">
            <label class="ron-label" for="ron-shape">Shape</label>
            <select class="ron-select" id="ron-shape">
                <option value="cross">Cross</option>
                <option value="dot">Dot</option>
                <option value="circle">Circle</option>
                <option value="square">Square</option>
            </select>
        </div>

        <div class="ron-section">
            <div class="ron-row">
                <label class="ron-label">Size</label>
                <span class="ron-value" data-value="size"></span>
                <input class="ron-range" data-setting="size" type="range" min="2" max="48" step="1">
            </div>

            <div class="ron-row">
                <label class="ron-label">Thickness</label>
                <span class="ron-value" data-value="thickness"></span>
                <input class="ron-range" data-setting="thickness" type="range" min="1" max="8" step="1">
            </div>

            <div class="ron-row">
                <label class="ron-label">Gap</label>
                <span class="ron-value" data-value="gap"></span>
                <input class="ron-range" data-setting="gap" type="range" min="0" max="24" step="1">
            </div>

            <div class="ron-row">
                <label class="ron-label">Outline</label>
                <span class="ron-value" data-value="outline"></span>
                <input class="ron-range" data-setting="outline" type="range" min="0" max="5" step="1">
            </div>

            <div class="ron-row">
                <label class="ron-label">Opacity</label>
                <span class="ron-value" data-value="opacity"></span>
                <input class="ron-range" data-setting="opacity" type="range" min="10" max="100" step="1">
            </div>

            <div class="ron-row">
                <label class="ron-label">Color</label>
                <input class="ron-color" data-setting="color" type="color">
            </div>

            <div class="ron-row">
                <label class="ron-label">Center dot</label>
                <input class="ron-check" data-setting="centerDot" type="checkbox">
            </div>

            <div class="ron-row">
                <label class="ron-label">Dot size</label>
                <span class="ron-value" data-value="dotSize"></span>
                <input class="ron-range" data-setting="dotSize" type="range" min="1" max="10" step="1">
            </div>

            <div class="ron-row">
                <label class="ron-label">Dot color</label>
                <input class="ron-color" data-setting="dotColor" type="color">
            </div>
        </div>

        <div class="ron-section">
            <div class="ron-preset-grid">
                <button class="ron-preset" data-preset="Nova Green"><strong>Nova Green</strong><span>clean green</span></button>
                <button class="ron-preset" data-preset="Minimal"><strong>Minimal</strong><span>thin and simple</span></button>
                <button class="ron-preset" data-preset="Competitive"><strong>Competitive</strong><span>high visibility</span></button>
                <button class="ron-preset" data-preset="Classic"><strong>Classic</strong><span>traditional cross</span></button>
                <button class="ron-preset" data-preset="Tiny Dot"><strong>Tiny Dot</strong><span>small precision dot</span></button>
            </div>
            <div class="ron-saved" id="ron-saved"></div>
        </div>

        <div class="ron-actions">
            <button class="ron-action primary" data-action="copy-css">Copy CSS</button>
            <button class="ron-action" data-action="copy-code">Copy Code</button>
            <button class="ron-action" data-action="save">Save Preset</button>
            <button class="ron-action" data-action="random">Randomize</button>
            <button class="ron-action" data-action="reset">Reset</button>
            <button class="ron-action" data-action="toggle">Turn Off</button>
        </div>

        <div class="ron-hint">
            Ctrl + Shift + X toggles the crosshair. Ctrl + Shift + P opens the editor.
            Settings and saved presets stay on this browser.
        </div>
    `;

    const previewCrosshair = panel.querySelector('.ron-preview-crosshair');
    const savedContainer = panel.querySelector('#ron-saved');
    const status = panel.querySelector('.ron-status');

    const settingsInputs = new Map(
        [...panel.querySelectorAll('[data-setting]')].map(el => [el.dataset.setting, el])
    );

    function createPiece(className, styles) {
        const piece = document.createElement('div');
        piece.className = className;
        Object.assign(piece.style, styles);
        return piece;
    }

    function outlineShadow(outline, color) {
        return outline > 0 ? `0 0 0 ${outline}px #000, 0 0 0 ${outline + 1}px rgba(0,0,0,.35)` : 'none';
    }

    function renderInto(container, pieceClass) {
        container.innerHTML = '';

        const opacity = Math.max(0, Math.min(100, Number(settings.opacity))) / 100;
        const color = settings.color;
        const outline = Number(settings.outline) || 0;
        const size = Number(settings.size) || 18;
        const thickness = Number(settings.thickness) || 2;
        const gap = Number(settings.gap) || 0;
        const dotSize = Number(settings.dotSize) || 3;

        if (settings.shape === 'dot') {
            const dot = createPiece(pieceClass, {
                width: `${Math.max(thickness, size / 2)}px`,
                height: `${Math.max(thickness, size / 2)}px`,
                transform: 'translate(-50%, -50%)',
                background: color,
                opacity: String(opacity),
                borderRadius: '50%',
                boxShadow: outlineShadow(outline, color)
            });
            container.appendChild(dot);
        } else if (settings.shape === 'circle') {
            const ring = createPiece(pieceClass, {
                width: `${size * 2}px`,
                height: `${size * 2}px`,
                transform: 'translate(-50%, -50%)',
                border: `${thickness}px solid ${color}`,
                opacity: String(opacity),
                borderRadius: '50%',
                boxShadow: outline > 0 ? `0 0 0 ${Math.max(0, outline - 1)}px #000` : 'none'
            });
            container.appendChild(ring);
        } else if (settings.shape === 'square') {
            const square = createPiece(pieceClass, {
                width: `${size * 2}px`,
                height: `${size * 2}px`,
                transform: 'translate(-50%, -50%)',
                border: `${thickness}px solid ${color}`,
                opacity: String(opacity),
                borderRadius: '1px',
                boxShadow: outline > 0 ? `0 0 0 ${outline}px #000` : 'none'
            });
            container.appendChild(square);
        } else {
            const half = Math.max(1, thickness / 2);
            const horizontalY = -half;
            const verticalX = -half;

            const top = createPiece(pieceClass, {
                left: `${-half}px`,
                top: `${-(gap + size)}px`,
                width: `${thickness}px`,
                height: `${size}px`,
                background: color,
                opacity: String(opacity),
                boxShadow: outlineShadow(outline, color)
            });

            const bottom = createPiece(pieceClass, {
                left: `${-half}px`,
                top: `${gap}px`,
                width: `${thickness}px`,
                height: `${size}px`,
                background: color,
                opacity: String(opacity),
                boxShadow: outlineShadow(outline, color)
            });

            const left = createPiece(pieceClass, {
                left: `${-(gap + size)}px`,
                top: `${horizontalY}px`,
                width: `${size}px`,
                height: `${thickness}px`,
                background: color,
                opacity: String(opacity),
                boxShadow: outlineShadow(outline, color)
            });

            const right = createPiece(pieceClass, {
                left: `${gap}px`,
                top: `${horizontalY}px`,
                width: `${size}px`,
                height: `${thickness}px`,
                background: color,
                opacity: String(opacity),
                boxShadow: outlineShadow(outline, color)
            });

            container.append(top, bottom, left, right);
        }

        if (settings.centerDot) {
            const dot = document.createElement('div');
            dot.className = pieceClass === 'ron-preview-piece' ? 'ron-preview-dot' : 'ron-center-dot';
            dot.style.width = `${dotSize}px`;
            dot.style.height = `${dotSize}px`;
            dot.style.background = settings.dotColor;
            dot.style.opacity = String(opacity);
            dot.style.boxShadow = outlineShadow(outline, settings.dotColor);
            container.appendChild(dot);
        }
    }

    function updatePreview() {
        renderInto(previewCrosshair, 'ron-preview-piece');
    }

    function updateCrosshair() {
        crosshair.style.display = settings.enabled ? 'block' : 'none';
        renderInto(crosshair, 'ron-piece');
        button.classList.toggle('off', !settings.enabled);
        button.textContent = settings.enabled ? 'RON' : 'RON OFF';
        status.textContent = settings.enabled ? 'ON' : 'OFF';
        status.style.color = settings.enabled ? '#35ff6a' : '#888';
        const toggle = panel.querySelector('[data-action="toggle"]');
        toggle.textContent = settings.enabled ? 'Turn Off' : 'Turn On';
    }

    function syncInputs() {
        for (const [key, input] of settingsInputs) {
            if (input.type === 'checkbox') {
                input.checked = Boolean(settings[key]);
            } else {
                input.value = settings[key];
            }
        }

        for (const el of panel.querySelectorAll('[data-value]')) {
            const key = el.dataset.value;
            el.textContent = key === 'opacity' ? `${settings[key]}%` : String(settings[key]);
        }

        updatePreview();
        updateCrosshair();
    }

    function applyPreset(name) {
        const preset = builtInPresets[name] || savedPresets[name];
        if (!preset) return;
        settings = { ...settings, ...preset };
        saveSettings();
        syncInputs();
        toast(`Loaded ${name}`);
    }

    function renderSavedPresets() {
        savedContainer.innerHTML = '';
        const names = Object.keys(savedPresets);

        if (!names.length) return;

        const label = document.createElement('div');
        label.className = 'ron-label';
        label.textContent = 'Saved presets';
        savedContainer.appendChild(label);

        for (const name of names) {
            const row = document.createElement('div');
            row.className = 'ron-saved-row';

            const load = document.createElement('button');
            load.className = 'ron-preset';
            load.type = 'button';
            load.textContent = name;
            load.addEventListener('click', () => applyPreset(name));

            const del = document.createElement('button');
            del.className = 'ron-delete';
            del.type = 'button';
            del.textContent = '×';
            del.title = `Delete ${name}`;
            del.addEventListener('click', () => {
                delete savedPresets[name];
                saveSavedPresets();
                renderSavedPresets();
                toast(`Deleted ${name}`);
            });

            row.append(load, del);
            savedContainer.appendChild(row);
        }
    }

    async function copyText(text, message) {
        try {
            await navigator.clipboard.writeText(text);
            toast(message);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                toast(message);
            } catch {
                toast('Copy failed');
            } finally {
                textarea.remove();
            }
        }
    }

    function buildCss() {
        const s = settings;
        const opacity = Math.round((Number(s.opacity) / 100) * 100) / 100;

        if (s.shape === 'dot') {
            return `.ron-crosshair { width: ${Math.max(s.thickness, s.size / 2)}px; height: ${Math.max(s.thickness, s.size / 2)}px; border-radius: 50%; background: ${s.color}; opacity: ${opacity}; box-shadow: ${s.outline > 0 ? `0 0 0 ${s.outline}px #000` : 'none'}; }`;
        }

        if (s.shape === 'circle') {
            return `.ron-crosshair { width: ${s.size * 2}px; height: ${s.size * 2}px; border: ${s.thickness}px solid ${s.color}; border-radius: 50%; opacity: ${opacity}; }`;
        }

        if (s.shape === 'square') {
            return `.ron-crosshair { width: ${s.size * 2}px; height: ${s.size * 2}px; border: ${s.thickness}px solid ${s.color}; opacity: ${opacity}; }`;
        }

        return `.ron-crosshair { position: relative; width: 0; height: 0; }
.ron-crosshair::before { content: ""; position: absolute; left: ${-s.size - s.gap}px; top: ${-Math.max(1, s.thickness / 2)}px; width: ${s.size * 2 + s.gap * 2}px; height: ${s.thickness}px; background: ${s.color}; opacity: ${opacity}; }
.ron-crosshair::after { content: ""; position: absolute; left: ${-Math.max(1, s.thickness / 2)}px; top: ${-s.size - s.gap}px; width: ${s.thickness}px; height: ${s.size * 2 + s.gap * 2}px; background: ${s.color}; opacity: ${opacity}; }`;
    }

    function buildCode() {
        return `/* Ron Crosshair
   Shape: ${settings.shape}
   Size: ${settings.size}
   Thickness: ${settings.thickness}
   Gap: ${settings.gap}
   Outline: ${settings.outline}
   Opacity: ${settings.opacity}%
   Color: ${settings.color}
   Center dot: ${settings.centerDot ? 'on' : 'off'}
*/
${buildCss()}`;
    }

    function randomize() {
        const colors = ['#35ff6a', '#ffffff', '#00e5ff', '#ff4d6d', '#ffd84d', '#b86cff'];
        const shapes = ['cross', 'cross', 'cross', 'dot', 'circle', 'square'];

        settings.shape = shapes[Math.floor(Math.random() * shapes.length)];
        settings.size = Math.floor(Math.random() * 25) + 5;
        settings.thickness = Math.floor(Math.random() * 4) + 1;
        settings.gap = Math.floor(Math.random() * 10);
        settings.outline = Math.floor(Math.random() * 4);
        settings.opacity = Math.floor(Math.random() * 41) + 60;
        settings.color = colors[Math.floor(Math.random() * colors.length)];
        settings.centerDot = Math.random() > 0.55;
        settings.dotSize = Math.floor(Math.random() * 5) + 2;
        settings.dotColor = Math.random() > 0.5 ? '#ffffff' : settings.color;

        saveSettings();
        syncInputs();
        toast('Randomized crosshair');
    }

    function saveCurrentPreset() {
        const name = prompt('Preset name:');
        if (!name) return;

        const cleanName = name.trim().slice(0, 40);
        if (!cleanName) return;

        savedPresets[cleanName] = {
            shape: settings.shape,
            size: settings.size,
            thickness: settings.thickness,
            gap: settings.gap,
            outline: settings.outline,
            opacity: settings.opacity,
            color: settings.color,
            centerDot: settings.centerDot,
            dotSize: settings.dotSize,
            dotColor: settings.dotColor
        };

        saveSavedPresets();
        renderSavedPresets();
        toast(`Saved ${cleanName}`);
    }

    function reset() {
        settings = { ...defaults };
        saveSettings();
        syncInputs();
        toast('Reset crosshair');
    }

    let toastTimer;
    function toast(message) {
        toastEl.textContent = message;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1400);
    }

    const toastEl = document.createElement('div');
    toastEl.className = 'ron-toast';

    layer.append(crosshairWrap, button, panel, toastEl);
    shadow.append(style, layer);

    function mount() {
        if (!document.documentElement) {
            requestAnimationFrame(mount);
            return;
        }

        if (!document.documentElement.contains(host)) {
            document.documentElement.appendChild(host);
        }

        syncInputs();
        renderSavedPresets();
    }

    function syncFullscreenParent() {
        const fs = document.fullscreenElement;
        if (fs && fs !== host && fs !== document.documentElement) {
            try {
                fs.appendChild(host);
            } catch {
            }
        } else if (host.parentElement !== document.documentElement && document.documentElement) {
            try {
                document.documentElement.appendChild(host);
            } catch {
            }
        }
    }

    panel.querySelector('#ron-shape').addEventListener('change', (event) => {
        settings.shape = event.target.value;
        saveSettings();
        syncInputs();
    });

    for (const [key, input] of settingsInputs) {
        if (key === 'shape') continue;

        input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', () => {
            settings[key] = input.type === 'checkbox'
                ? input.checked
                : input.type === 'color'
                    ? input.value
                    : Number(input.value);

            saveSettings();
            syncInputs();
        });
    }

    for (const presetButton of panel.querySelectorAll('[data-preset]')) {
        presetButton.addEventListener('click', () => applyPreset(presetButton.dataset.preset));
    }

    panel.querySelector('[data-action="copy-css"]').addEventListener('click', () => copyText(buildCss(), 'CSS copied'));
    panel.querySelector('[data-action="copy-code"]').addEventListener('click', () => copyText(buildCode(), 'Code copied'));
    panel.querySelector('[data-action="save"]').addEventListener('click', saveCurrentPreset);
    panel.querySelector('[data-action="random"]').addEventListener('click', randomize);
    panel.querySelector('[data-action="reset"]').addEventListener('click', reset);
    panel.querySelector('[data-action="toggle"]').addEventListener('click', () => {
        settings.enabled = !settings.enabled;
        saveSettings();
        syncInputs();
    });

    button.addEventListener('click', () => {
        panel.classList.toggle('open');
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            crosshair.style.display = 'none';
        } else {
            updateCrosshair();
        }
    });

    document.addEventListener('fullscreenchange', syncFullscreenParent);

    window.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.shiftKey && event.code === 'KeyX') {
            event.preventDefault();
            settings.enabled = !settings.enabled;
            saveSettings();
            updateCrosshair();
            toast(settings.enabled ? 'Crosshair on' : 'Crosshair off');
        }

        if (event.ctrlKey && event.shiftKey && event.code === 'KeyP') {
            event.preventDefault();
            panel.classList.toggle('open');
        }
    }, true);

    mount();
})();
