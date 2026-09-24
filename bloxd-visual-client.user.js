// ==UserScript==
// @name         Ron | Bloxd Visual Client
// @namespace    https://roncool.cc.cd/
// @version      1.6.0
// @description  Client-side Bloxd visuals: custom name text + colour, nametag, cape, player colours
// @match        https://bloxd.io/*
// @match        https://www.bloxd.io/*
// @match        https://*.bloxd.io/*
// @run-at       document-idle
// @grant        none
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';

  const win = window;
  if (win.__RON_BLOXD_VISUAL_CLIENT__) return;
  win.__RON_BLOXD_VISUAL_CLIENT__ = true;

  const KEY = 'ron_bloxd_visual_client_v16';
  const HOTKEY = 'KeyI';
  const MAX_CAPE_BYTES = 768 * 1024;
  const PARTS = ['head', 'body', 'arms', 'legs', 'shoes'];

  const DEFAULTS = {
    nameEnabled: true,
    nameText: '',                 // NEW: custom display name (empty = keep real name)
    nameColor: '#69ff87',
    nametagEnabled: true,
    nametagColor: '#69ff87',
    nametagBackground: '#07100a',
    nametagSize: 17,
    nametagWeight: '800',
    capeEnabled: false,
    capeUrl: '',
    playerEnabled: false,
    playerColors: {
      head: '#d9a27e',
      body: '#2fbf59',
      arms: '#43db6a',
      legs: '#1f2c22',
      shoes: '#0b0f0c'
    },
    preset: 'Ron Green'
  };

  const PRESETS = {
    Default: {
      nameColor: '#ffffff',
      nametagColor: '#ffffff',
      nametagBackground: '#111111',
      nametagSize: 16,
      nametagWeight: '400',
      playerColors: {
        head: '#d9a27e', body: '#3a5b3b', arms: '#3a5b3b',
        legs: '#242824', shoes: '#111111'
      }
    },
    'Ron Green': {
      nameColor: '#69ff87',
      nametagColor: '#69ff87',
      nametagBackground: '#07100a',
      nametagSize: 17,
      nametagWeight: '800',
      playerColors: {
        head: '#d9a27e', body: '#2fbf59', arms: '#43db6a',
        legs: '#1f2c22', shoes: '#0b0f0c'
      }
    },
    Red: {
      nameColor: '#ff5e67',
      nametagColor: '#ff7a82',
      nametagBackground: '#16090b',
      nametagSize: 17,
      nametagWeight: '800',
      playerColors: {
        head: '#d9a27e', body: '#c83c45', arms: '#e85a61',
        legs: '#391619', shoes: '#10090a'
      }
    },
    Blue: {
      nameColor: '#66a8ff',
      nametagColor: '#82b8ff',
      nametagBackground: '#08111d',
      nametagSize: 17,
      nametagWeight: '800',
      playerColors: {
        head: '#d9a27e', body: '#3b6fc8', arms: '#5a8ae8',
        legs: '#162239', shoes: '#090a10'
      }
    },
    Purple: {
      nameColor: '#bf8cff',
      nametagColor: '#caa1ff',
      nametagBackground: '#100a18',
      nametagSize: 17,
      nametagWeight: '800',
      playerColors: {
        head: '#d9a27e', body: '#7b3bc8', arms: '#9a5ae8',
        legs: '#221639', shoes: '#0a0910'
      }
    }
  };

  let settings = loadSettings();
  let noa = null;
  let bloxd = null;
  let rendering = null;
  let localMeshes = [];
  let savedMaterials = new Map();
  let savedName = null;
  let capeMesh = null;
  let capeMaterial = null;
  let capeTexture = null;
  let shadow = null;
  let panel = null;
  let statusNode = null;
  let hooked = false;
  let lastHookTry = 0;
  let lastDiag = '';
  let lastThinMeshCount = -1;
  let webpackKey = null;
  let webpackRequire = null;
  let runtimeStage = 'waiting';
  let lastLocalId = null;

  function safeClone(v) {
    try { return JSON.parse(JSON.stringify(v)); } catch { return null; }
  }

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
      return {
        ...safeClone(DEFAULTS),
        ...saved,
        playerColors: { ...DEFAULTS.playerColors, ...(saved.playerColors || {}) }
      };
    } catch {
      return safeClone(DEFAULTS);
    }
  }

  function saveSettings() {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
  }

  function validHex(v) {
    return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  }

  function colorValue(v) {
    return {
      r: parseInt(v.slice(1, 3), 16) / 255,
      g: parseInt(v.slice(3, 5), 16) / 255,
      b: parseInt(v.slice(5, 7), 16) / 255
    };
  }

  function setColorObject(target, hex) {
    if (!target || !validHex(hex)) return false;
    const c = colorValue(hex);
    try {
      if (typeof target.set === 'function') {
        target.set(c.r, c.g, c.b);
        return true;
      }
      target.r = c.r; target.g = c.g; target.b = c.b;
      return true;
    } catch { return false; }
  }

  // ——— Runtime hooks ———

  function getWebpackRequire() {
    if (webpackRequire?.m) return webpackRequire;
    try {
      const descriptors = Object.getOwnPropertyDescriptors(win);
      if (!webpackKey) {
        webpackKey = Object.keys(descriptors).find(key => {
          const setter = descriptors[key]?.set;
          return typeof setter === 'function' &&
            Function.prototype.toString.call(setter).includes('++');
        });
      }
      if (!webpackKey) { runtimeStage = 'webpack-key-wait'; return null; }
      try { win[webpackKey] = win[webpackKey]; } catch {}
      const chunkQueue = win[webpackKey];
      if (!chunkQueue || typeof chunkQueue.push !== 'function') {
        runtimeStage = 'webpack-queue-wait';
        return null;
      }
      const randId = Math.floor(Math.random() * 9999999 + 1);
      chunkQueue.push([[randId], {}, req => { webpackRequire = req; }]);
      if (webpackRequire?.m) runtimeStage = 'webpack-ready';
      return webpackRequire;
    } catch {
      runtimeStage = 'webpack-error';
      return null;
    }
  }

  function findModule(text) {
    const req = getWebpackRequire();
    if (!req?.m) return null;
    try {
      for (const id in req.m) {
        const factory = req.m[id];
        if (factory && typeof factory.toString === 'function' &&
            factory.toString().includes(text)) {
          return req(id);
        }
      }
    } catch {}
    return null;
  }

  function findNoa() {
    if (noa?.entities) return noa;
    const req = getWebpackRequire();
    if (!req?.m) return null;
    try {
      const props = findModule('nonBlocksClient:');
      if (!props) { runtimeStage = 'nonBlocksClient-wait'; return null; }
      const values = Object.values(props);
      const bloxdProps = values.find(v => v && typeof v === 'object');
      if (!bloxdProps) { runtimeStage = 'bloxd-props-wait'; return null; }
      const candidate = Object.values(bloxdProps).find(v => v?.entities);
      if (!candidate) { runtimeStage = 'noa-wait'; return null; }
      noa = candidate;
      bloxd = candidate.bloxd || null;
      runtimeStage = 'noa-ready';
      console.info('[Ron Visual] noa found');
      return noa;
    } catch (e) {
      runtimeStage = 'noa-error';
      return null;
    }
  }

  function findRendering(noaObj) {
    try {
      const values = Object.values(noaObj || {});
      const indexed = values[12];
      if (indexed && typeof indexed === 'object') {
        const holder = Object.values(indexed).find(v => Array.isArray(v?.thinMeshes));
        if (holder) { runtimeStage = 'renderer-ready'; return indexed; }
      }
      const direct = values.find(v => Array.isArray(v?.thinMeshes));
      if (direct) { runtimeStage = 'renderer-ready'; return direct; }
      const nested = values.find(v =>
        v && typeof v === 'object' &&
        Object.values(v).some(c => Array.isArray(c?.thinMeshes))
      );
      if (nested) {
        const holder = Object.values(nested).find(c => Array.isArray(c?.thinMeshes));
        if (holder) { runtimeStage = 'renderer-ready'; return holder; }
      }
      runtimeStage = 'renderer-wait';
      return null;
    } catch {
      runtimeStage = 'renderer-error';
      return null;
    }
  }

  // Better local player ID detection
  function getLocalId() {
    try {
      if (noa?.playerEntity != null) {
        lastLocalId = noa.playerEntity;
        return noa.playerEntity;
      }
      if (noa?.entities?._playerEntity != null) {
        lastLocalId = noa.entities._playerEntity;
        return noa.entities._playerEntity;
      }
      // common fallback used by older builds
      if (bloxd?.localPlayerId != null) {
        lastLocalId = bloxd.localPlayerId;
        return bloxd.localPlayerId;
      }
    } catch {}
    lastLocalId = 1;
    return 1;
  }

  function getThinMeshes() {
    const direct = rendering?.thinMeshes;
    if (Array.isArray(direct)) return direct;
    try {
      const found = Object.values(rendering || {}).find(v => Array.isArray(v?.thinMeshes));
      return found?.thinMeshes || [];
    } catch { return []; }
  }

  function isMesh(v) {
    if (!v || typeof v !== 'object') return false;
    if (typeof v.dispose !== 'function') return false;
    if (typeof v.getClassName === 'function') {
      try { if (/mesh/i.test(v.getClassName())) return true; } catch {}
    }
    return typeof v.name === 'string' && ('material' in v || 'position' in v);
  }

  function refreshLocalMeshes() {
    localMeshes = [];
    const thinMeshes = getThinMeshes();
    if (!thinMeshes.length) {
      runtimeStage = 'thin-mesh-wait';
      return;
    }

    const localId = getLocalId();
    const tagged = thinMeshes.filter(entry => {
      const ids = [
        entry?.entityId, entry?.entityID, entry?.playerId,
        entry?.ownerId, entry?.entity?.id, entry?.entity?.entityId
      ].filter(v => v != null).map(String);
      return ids.includes(String(localId));
    });

    const source = tagged.length ? tagged : thinMeshes;
    for (const entry of source) {
      const mesh =
        entry?.meshVariations?.__DEFAULT__?.mesh ||
        entry?.meshVariations?.default?.mesh ||
        entry?.mesh ||
        entry?.defaultMesh;
      if (isMesh(mesh) && !localMeshes.includes(mesh)) localMeshes.push(mesh);
    }

    if (thinMeshes.length !== lastThinMeshCount) {
      lastThinMeshCount = thinMeshes.length;
      console.info('[Ron Visual] thinMeshes:', thinMeshes.length, 'local:', localMeshes.length);
    }
    if (localMeshes.length) runtimeStage = 'player-model-ready';
  }

  function meshPart(mesh) {
    const name = String(mesh?.name || mesh?.id || '').toLowerCase();
    if (/shoe|boot|foot/.test(name)) return 'shoes';
    if (/head|face|hair|eye|brow/.test(name)) return 'head';
    if (/arm|hand|wrist/.test(name)) return 'arms';
    if (/leg|thigh|calf/.test(name)) return 'legs';
    if (/torso|body|chest|shirt/.test(name)) return 'body';
    return null;
  }

  // ——— Materials / player colours ———

  function cloneMaterial(mesh) {
    const original = mesh?.material;
    if (!original) return null;
    const existing = savedMaterials.get(mesh);
    if (existing) return existing.active;
    try {
      const active = typeof original.clone === 'function'
        ? original.clone('ron-' + String(mesh.name || 'part'))
        : original;
      savedMaterials.set(mesh, { original, active, cloned: active !== original });
      if (active !== original) mesh.material = active;
      return active;
    } catch {
      savedMaterials.set(mesh, { original, active: original, cloned: false });
      return original;
    }
  }

  function tintMaterial(material, hex) {
    if (!material || !validHex(hex)) return;
    const c = colorValue(hex);
    const babylon = win.BABYLON;
    const color3 = babylon?.Color3 ? new babylon.Color3(c.r, c.g, c.b) : null;

    for (const key of ['diffuseColor', 'albedoColor', 'baseColor']) {
      if (!(key in material)) continue;
      try {
        if (color3) material[key] = color3.clone ? color3.clone() : color3;
        else if (material[key] && typeof material[key] === 'object') setColorObject(material[key], hex);
      } catch {}
    }
    try {
      if (material.emissiveColor && typeof material.emissiveColor === 'object') {
        setColorObject(material.emissiveColor, hex);
      }
    } catch {}
  }

  function restoreMaterials() {
    for (const [mesh, record] of savedMaterials) {
      try { mesh.material = record.original; } catch {}
      if (record.cloned && record.active?.dispose) {
        try { record.active.dispose(false, true); } catch {}
      }
    }
    savedMaterials.clear();
  }

  function applyPlayerColors() {
    if (!settings.playerEnabled || !localMeshes.length) return;
    for (const mesh of localMeshes) {
      const part = meshPart(mesh);
      if (!part) continue;
      const material = cloneMaterial(mesh);
      tintMaterial(material, settings.playerColors[part]);
    }
  }

  // ——— Name + nametag (with custom text) ———

  function findNameEntry() {
    const id = getLocalId();
    try {
      return noa?.bloxd?.entityNames?.[id] ||
             bloxd?.entityNames?.[id] ||
             noa?.bloxd?.entityNames?.[String(id)] ||
             null;
    } catch { return null; }
  }

  function cloneNameStyle(entry) {
    if (savedName?.entry === entry) return;
    savedName = {
      entry,
      style: entry?.style ? { ...entry.style } : undefined,
      entityName: entry?.entityName,
      nameColour: entry?.nameColour,
      nameTagInfo: entry?.nameTagInfo ? safeClone(entry.nameTagInfo) : undefined
    };
  }

  function restoreName() {
    if (!savedName?.entry) return;
    const entry = savedName.entry;
    try {
      if (savedName.style === undefined) delete entry.style;
      else entry.style = { ...savedName.style };
      if (savedName.entityName !== undefined) entry.entityName = savedName.entityName;
      if (savedName.nameColour !== undefined) entry.nameColour = savedName.nameColour;
      else delete entry.nameColour;
      if (savedName.nameTagInfo !== undefined) entry.nameTagInfo = safeClone(savedName.nameTagInfo);
      else delete entry.nameTagInfo;
    } catch {}
    savedName = null;
  }

  function setNameAndNametag() {
    const entry = findNameEntry();
    if (!entry) return;

    if (!settings.nameEnabled && !settings.nametagEnabled && !settings.nameText) {
      restoreName();
      return;
    }

    cloneNameStyle(entry);

    const displayName = (settings.nameText && settings.nameText.trim())
      ? settings.nameText.trim()
      : String(entry.entityName || savedName?.entityName || 'Player');

    // Override the actual name string (client-side only)
    if (settings.nameText && settings.nameText.trim()) {
      try { entry.entityName = displayName; } catch {}
    }

    const style = { ...(entry.style || {}) };

    if (settings.nameEnabled) {
      try { entry.nameColour = settings.nameColor; } catch {}
      style.color = settings.nameColor;
      style.colour = settings.nameColor;
    }

    if (settings.nametagEnabled) {
      const current = entry.nameTagInfo && typeof entry.nameTagInfo === 'object'
        ? entry.nameTagInfo
        : {};

      entry.nameTagInfo = {
        ...current,
        backgroundColor: settings.nametagBackground,
        content: [{
          str: displayName,
          style: {
            color: settings.nametagColor,
            colour: settings.nametagColor,
            fontSize: String(settings.nametagSize) + 'px',
            fontWeight: settings.nametagWeight
          }
        }],
        border: {
          colour: settings.nametagColor,
          style: 'solid',
          width: '1px',
          applyTo: 'both'
        }
      };

      if (!settings.nameEnabled) {
        style.color = settings.nametagColor;
        style.colour = settings.nametagColor;
      }
    }

    try { entry.style = style; } catch {}
  }

  // ——— Cape ———

  function getTextureConstructor(mesh) {
    try {
      const material = mesh?.material;
      const tex = material?.diffuseTexture || material?.albedoTexture || material?.baseTexture;
      if (tex?.constructor) return tex.constructor;
    } catch {}
    try {
      const scene = mesh?.getScene?.();
      const candidate = scene?.textures?.find(t => t?.constructor);
      if (candidate) return candidate.constructor;
    } catch {}
    try {
      if (win.BABYLON?.Texture) return win.BABYLON.Texture;
    } catch {}
    return null;
  }

  function getPlaneFactory(mesh) {
    try {
      if (mesh?.constructor?.CreatePlane) {
        return (name, size, scene) => mesh.constructor.CreatePlane(name, size, scene);
      }
    } catch {}
    try {
      const B = win.BABYLON;
      if (B?.MeshBuilder?.CreatePlane) {
        return (name, size, scene) => B.MeshBuilder.CreatePlane(name, { width: size, height: size }, scene);
      }
      if (B?.Mesh?.CreatePlane) {
        return (name, size, scene) => B.Mesh.CreatePlane(name, size, scene);
      }
    } catch {}
    return null;
  }

  function disposeCape() {
    if (capeMesh) {
      try { capeMesh.parent = null; } catch {}
      try { capeMesh.dispose(false, true); } catch {}
    }
    if (capeMaterial && capeMaterial !== capeMesh?.material) {
      try { capeMaterial.dispose(false, true); } catch {}
    }
    if (capeTexture) {
      try { capeTexture.dispose(); } catch {}
    }
    capeMesh = null;
    capeMaterial = null;
    capeTexture = null;
  }

  function makeCape() {
    if (!settings.capeEnabled || !settings.capeUrl || capeMesh || !localMeshes.length) return;

    const torso = localMeshes.find(m => meshPart(m) === 'body') || localMeshes[0];
    if (!torso) return;

    const scene = torso.getScene?.() || null;
    const createPlane = getPlaneFactory(torso);
    const Texture = getTextureConstructor(torso);
    if (!scene || !createPlane || !Texture) return;

    try {
      capeMesh = createPlane('ron-bloxd-cape', 1, scene);
      capeMesh.isPickable = false;
      capeMesh.renderingGroupId = torso.renderingGroupId ?? 0;
      capeMesh.parent = torso;

      if (capeMesh.scaling) {
        capeMesh.scaling.x = 0.72;
        capeMesh.scaling.y = 1.0;
      }
      if (capeMesh.position) {
        capeMesh.position.x = 0;
        capeMesh.position.y = -0.34;
        capeMesh.position.z = -0.30;
      }
      if (capeMesh.rotation) {
        capeMesh.rotation.x = 0;
        capeMesh.rotation.y = Math.PI;
        capeMesh.rotation.z = 0;
      }

      const MaterialCtor = torso.material?.constructor;
      capeMaterial = MaterialCtor ? new MaterialCtor('ron-bloxd-cape-mat', scene) : null;
      if (!capeMaterial) { disposeCape(); return; }

      capeMaterial.backFaceCulling = false;
      try { capeMaterial.useAlphaFromDiffuseTexture = true; } catch {}
      try { capeMaterial.alpha = 1; } catch {}

      capeTexture = new Texture(settings.capeUrl, scene, true, false);
      try { capeTexture.hasAlpha = true; } catch {}
      try { capeMaterial.diffuseTexture = capeTexture; } catch {}
      try { capeMaterial.albedoTexture = capeTexture; } catch {}

      capeMesh.material = capeMaterial;
    } catch {
      disposeCape();
    }
  }

  function removeCapeIfDisabled() {
    if (!settings.capeEnabled || !settings.capeUrl) disposeCape();
    else if (!capeMesh) makeCape();
  }

  // ——— Apply loop ———

  function applyVisuals(force = false) {
    const now = Date.now();
    if (!force && now - lastHookTry < 150) return;

    try {
      if (!noa?.entities) noa = findNoa();
      hooked = !!noa?.entities;

      if (!hooked) {
        if (lastDiag !== runtimeStage) {
          console.info('[Ron Visual] runtime:', runtimeStage);
          lastDiag = runtimeStage;
        }
        updateStatus();
        lastHookTry = now;
        return;
      }

      bloxd = noa.bloxd || bloxd;
      rendering = findRendering(noa);
      refreshLocalMeshes();

      setNameAndNametag();

      if (settings.playerEnabled) applyPlayerColors();
      else restoreMaterials();

      removeCapeIfDisabled();
    } catch (e) {
      runtimeStage = 'apply-error';
    }

    lastHookTry = now;
    updateStatus();
  }

  // ——— UI ———

  function make(tag, props = {}, text = '') {
    const node = document.createElement(tag);
    Object.assign(node, props);
    if (text) node.textContent = text;
    return node;
  }

  function field(label, input) {
    const row = make('div', { className: 'row' });
    row.append(make('label', {}, label), input);
    return row;
  }

  function switchField(label, key) {
    const button = make('button', {
      type: 'button',
      className: 'switch ' + (settings[key] ? 'on' : '')
    });
    button.onclick = () => {
      settings[key] = !settings[key];
      saveSettings();
      applyVisuals(true);
      renderUI();
    };
    const row = make('div', { className: 'row' });
    row.append(make('label', {}, label), button);
    return row;
  }

  function colorField(label, key) {
    const input = make('input', { type: 'color', value: settings[key] || '#ffffff' });
    input.oninput = () => {
      settings[key] = input.value;
      settings.preset = 'Custom';
      saveSettings();
      applyVisuals(true);
    };
    return field(label, input);
  }

  function usePreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    settings = {
      ...settings,
      preset: name,
      nameColor: preset.nameColor,
      nametagColor: preset.nametagColor,
      nametagBackground: preset.nametagBackground,
      nametagSize: preset.nametagSize,
      nametagWeight: preset.nametagWeight,
      playerColors: { ...settings.playerColors, ...preset.playerColors }
    };
    saveSettings();
    renderUI();
    applyVisuals(true);
  }

  function resetAll() {
    restoreMaterials();
    restoreName();
    disposeCape();
    settings = safeClone(DEFAULTS);
    saveSettings();
    renderUI();
    applyVisuals(true);
  }

  function updateStatus() {
    if (!statusNode) return;
    statusNode.replaceChildren();
    statusNode.append(make('span', { className: 'dot ' + (hooked ? 'good' : '') }));
    statusNode.appendChild(document.createTextNode(
      hooked
        ? (localMeshes.length ? 'Visual runtime ready' : 'Renderer found · waiting for player model')
        : ('Waiting for Bloxd · ' + runtimeStage)
    ));
  }

  function buildUI() {
    if (shadow) return;

    const host = make('div');
    host.id = 'ron-bloxd-visual-host';
    Object.assign(host.style, {
      position: 'fixed', top: '0', left: '0', zIndex: '2147483646',
      pointerEvents: 'none'
    });
    document.documentElement.appendChild(host);
    shadow = host.attachShadow({ mode: 'open' });

    const style = make('style');
    style.textContent = `
      *{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif}
      .launcher{pointer-events:auto;position:fixed;top:14px;right:14px;z-index:10;
        border:1px solid #2f6b3d;background:#0d1a12;color:#7dff9a;border-radius:10px;
        padding:8px 12px;font-weight:700;cursor:pointer;box-shadow:0 8px 25px rgba(0,0,0,.4)}
      .launcher:hover{background:#102117;border-color:#4a8d59;color:#fff}
      .panel{pointer-events:auto;position:fixed;top:56px;right:14px;width:340px;max-height:calc(100vh - 70px);
        overflow:auto;background:rgba(10,14,12,.97);border:1px solid #24352a;border-radius:14px;
        color:#e8f5ec;box-shadow:0 18px 60px rgba(0,0,0,.45)}
      .head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #24352a}
      .head strong{display:block;font-size:14px}
      .head small{color:#8aa694;font-size:11px}
      .grow{flex:1}
      .close{background:transparent;border:0;color:#9bb5a5;font-size:20px;cursor:pointer}
      .body{padding:12px 14px 16px}
      .section{margin-bottom:14px}
      .title{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#8aa694;margin-bottom:8px}
      .row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:7px 0}
      .row label{font-size:13px;color:#cfe3d6}
      input[type="text"],input[type="number"],input[type="color"],select{
        width:150px;max-width:55%;background:#121a15;border:1px solid #2a3b31;color:#e8f5ec;
        border-radius:8px;padding:6px 8px}
      input[type="color"]{padding:2px;height:32px}
      .switch{width:42px;height:24px;border-radius:999px;border:1px solid #2a3b31;background:#1a2420;position:relative;cursor:pointer}
      .switch::after{content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#8aa694;transition:.15s}
      .switch.on{background:#1e6b3a;border-color:#2f9b55}
      .switch.on::after{left:20px;background:#7dff9a}
      .buttons{display:flex;gap:8px;flex-wrap:wrap}
      .btn{border:1px solid #2a3b31;background:#152019;color:#e8f5ec;border-radius:8px;padding:7px 10px;cursor:pointer}
      .btn.primary{background:#1e6b3a;border-color:#2f9b55;color:#fff}
      .hint{font-size:11px;color:#8aa694;line-height:1.4;margin-top:6px}
      .cape-preview{margin-top:8px;border:1px solid #2a3b31;border-radius:8px;overflow:hidden;background:#0b100d}
      .cape-preview img{display:block;width:100%;max-height:120px;object-fit:contain}
      .status{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12px;color:#8aa694}
      .dot{width:8px;height:8px;border-radius:50%;background:#5a6b60}
      .dot.good{background:#69ff87;box-shadow:0 0 8px #69ff87}
      .preset-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
      .preset-row .btn{font-size:12px}
      @media(max-width:600px){.panel{right:10px;left:10px;top:10px;width:auto}}
    `;
    shadow.appendChild(style);

    const launcher = make('button', { className: 'launcher', type: 'button', title: 'Open visual client' }, 'RON');
    launcher.onclick = () => {
      if (!panel) return;
      panel.hidden = !panel.hidden;
      if (!panel.hidden) applyVisuals(true);
    };
    shadow.appendChild(launcher);

    panel = make('div', { className: 'panel', hidden: true });
    shadow.appendChild(panel);
    renderUI();
  }

  function renderUI() {
    if (!panel) return;
    panel.replaceChildren();

    const head = make('div', { className: 'head' });
    const title = make('div');
    title.append(make('strong', {}, 'Ron | Bloxd Visual Client'));
    title.append(make('small', {}, 'Shift + I · client-side only'));
    head.append(title, make('div', { className: 'grow' }));
    const close = make('button', { className: 'close', type: 'button' }, '×');
    close.onclick = () => { panel.hidden = true; };
    head.appendChild(close);
    panel.appendChild(head);

    const body = make('div', { className: 'body' });

    // Features
    const features = make('section', { className: 'section' });
    features.append(make('div', { className: 'title' }, 'Features'));
    features.append(switchField('Name colour', 'nameEnabled'));
    features.append(switchField('Nametag style', 'nametagEnabled'));
    features.append(switchField('Custom cape', 'capeEnabled'));
    features.append(switchField('Player colours', 'playerEnabled'));
    body.appendChild(features);

    // Name
    const names = make('section', { className: 'section' });
    names.append(make('div', { className: 'title' }, 'Name & nametag'));

    const nameInput = make('input', {
      type: 'text',
      value: settings.nameText || '',
      placeholder: 'Leave empty = real name'
    });
    nameInput.oninput = () => {
      settings.nameText = nameInput.value;
      settings.preset = 'Custom';
      saveSettings();
      applyVisuals(true);
    };
    names.append(field('Custom name', nameInput));
    names.append(make('div', { className: 'hint' }, 'Only you see this name. Others still see your real username.'));

    names.append(colorField('Name colour', 'nameColor'));
    names.append(colorField('Nametag colour', 'nametagColor'));
    names.append(colorField('Nametag background', 'nametagBackground'));

    const size = make('input', { type: 'number', min: '10', max: '40', value: String(settings.nametagSize) });
    size.onchange = () => {
      settings.nametagSize = Math.max(10, Math.min(40, Number(size.value) || 17));
      settings.preset = 'Custom';
      saveSettings();
      applyVisuals(true);
    };
    names.append(field('Nametag size', size));

    const weight = make('select');
    ['400','500','600','700','800','900'].forEach(v => {
      weight.appendChild(make('option', { value: v, selected: v === settings.nametagWeight }, v));
    });
    weight.onchange = () => {
      settings.nametagWeight = weight.value;
      settings.preset = 'Custom';
      saveSettings();
      applyVisuals(true);
    };
    names.append(field('Nametag weight', weight));
    body.appendChild(names);

    // Presets
    const presets = make('section', { className: 'section' });
    presets.append(make('div', { className: 'title' }, 'Presets'));
    const presetRow = make('div', { className: 'preset-row' });
    Object.keys(PRESETS).forEach(name => {
      const b = make('button', { className: 'btn', type: 'button' }, name);
      b.onclick = () => usePreset(name);
      presetRow.appendChild(b);
    });
    presets.appendChild(presetRow);
    body.appendChild(presets);

    // Player colours
    const player = make('section', { className: 'section' });
    player.append(make('div', { className: 'title' }, 'Player colours'));
    PARTS.forEach(part => {
      const input = make('input', { type: 'color', value: settings.playerColors[part] || '#ffffff' });
      input.oninput = () => {
        settings.playerColors[part] = input.value;
        settings.playerEnabled = true;
        settings.preset = 'Custom';
        saveSettings();
        applyVisuals(true);
        renderUI();
      };
      player.append(field(part[0].toUpperCase() + part.slice(1), input));
    });
    body.appendChild(player);

    // Cape
    const cape = make('section', { className: 'section' });
    cape.append(make('div', { className: 'title' }, 'Custom cape'));

    const capeButtons = make('div', { className: 'buttons' });
    const fileInput = make('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    const choose = make('button', { className: 'btn', type: 'button' }, 'Upload image');
    choose.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const selected = fileInput.files?.[0];
      if (!selected) return;
      if (selected.size > MAX_CAPE_BYTES) {
        alert('Image too large (max ~750KB). Compress it first.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        settings.capeUrl = String(reader.result || '');
        settings.capeEnabled = true;
        settings.preset = 'Custom';
        saveSettings();
        disposeCape();
        renderUI();
        applyVisuals(true);
      };
      reader.readAsDataURL(selected);
    };

    const clear = make('button', { className: 'btn', type: 'button' }, 'Clear');
    clear.onclick = () => {
      settings.capeUrl = '';
      settings.capeEnabled = false;
      saveSettings();
      disposeCape();
      renderUI();
    };
    capeButtons.append(choose, clear, fileInput);
    cape.appendChild(capeButtons);

    const url = make('input', {
      type: 'text',
      value: settings.capeUrl.startsWith('data:') ? '' : settings.capeUrl,
      placeholder: 'https://... or upload above'
    });
    url.onchange = () => {
      settings.capeUrl = url.value.trim();
      settings.capeEnabled = !!settings.capeUrl;
      settings.preset = 'Custom';
      saveSettings();
      disposeCape();
      renderUI();
      applyVisuals(true);
    };
    cape.appendChild(field('Image URL', url));

    if (settings.capeUrl) {
      const preview = make('div', { className: 'cape-preview' });
      const image = make('img', { src: settings.capeUrl, alt: 'Cape preview' });
      image.onerror = () => {
        image.remove();
        preview.textContent = 'Image could not be loaded';
      };
      preview.appendChild(image);
      cape.appendChild(preview);
    }

    cape.append(make('div', { className: 'hint' },
      'PNG with transparency works best. Uploaded images stay in this browser only.'));
    body.appendChild(cape);

    // Bottom
    const bottom = make('section', { className: 'section' });
    const buttons = make('div', { className: 'buttons' });
    const reset = make('button', { className: 'btn', type: 'button' }, 'Reset');
    reset.onclick = resetAll;
    const done = make('button', { className: 'btn primary', type: 'button' }, 'Done');
    done.onclick = () => { panel.hidden = true; };
    buttons.append(reset, done);
    bottom.appendChild(buttons);

    statusNode = make('div', { className: 'status' });
    bottom.appendChild(statusNode);
    body.appendChild(bottom);

    panel.appendChild(body);
    updateStatus();
  }

  function installKeys() {
    if (win.__RON_BLOXD_VISUAL_KEYS__) return;
    win.__RON_BLOXD_VISUAL_KEYS__ = true;

    const handler = event => {
      const tag = event.target?.tagName;
      const inField = ['INPUT','TEXTAREA','SELECT'].includes(tag) || event.target?.isContentEditable;

      if ((event.code === HOTKEY || String(event.key || '').toLowerCase() === 'i') &&
          event.shiftKey && !event.ctrlKey && !event.altKey && !inField) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!panel) buildUI();
        panel.hidden = !panel.hidden;
        if (!panel.hidden) applyVisuals(true);
        return;
      }
      if (event.code === 'Escape' && panel && !panel.hidden && !inField) {
        panel.hidden = true;
      }
    };
    document.addEventListener('keydown', handler, true);
    win.addEventListener('keydown', handler, true);
  }

  function startClient() {
    if (!document.documentElement) {
      setTimeout(startClient, 25);
      return;
    }
    buildUI();
    installKeys();
    console.info('[Ron | Bloxd Visual Client] v1.6.0 — Shift+I or click RON');
    setTimeout(() => applyVisuals(true), 300);
    setTimeout(() => applyVisuals(true), 1200);
    setTimeout(() => applyVisuals(true), 3000);
  }

  startClient();

  setInterval(() => {
    try { applyVisuals(); } catch {}
  }, 500);

  win.addEventListener('beforeunload', () => {
    try {
      restoreMaterials();
      restoreName();
      disposeCape();
    } catch {}
  });
})();
