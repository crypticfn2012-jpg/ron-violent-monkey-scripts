// ==UserScript==
// @name         Ron | Bloxd Visual Client
// @namespace    https://roncool.cc.cd/
// @version      1.1.0
// @description  Local Bloxd visual customization with custom names, nametags, capes, player colours and presets.
// @match        https://bloxd.io/*
// @match        https://www.bloxd.io/*
// @match        https://*.bloxd.io/*
// @run-at       document-end
// @grant        unsafeWindow
// @grant        GM_registerMenuCommand
// @inject-into  page
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/bloxd-visual-client.user.js
// @downloadURL   https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/bloxd-visual-client.user.js
// ==/UserScript==

(() => {
  'use strict';

  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  if (win.__RON_BLOXD_VISUAL_CLIENT__) return;
  win.__RON_BLOXD_VISUAL_CLIENT__ = true;

  const KEY = 'ron_bloxd_visual_client_v1';
  const HOTKEY = 'KeyI';
  const MAX_CAPE_BYTES = 768 * 1024;
  const PARTS = ['head', 'body', 'arms', 'legs', 'shoes'];

  const DEFAULTS = {
    nameEnabled: true,
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
        head: '#d9a27e',
        body: '#3a5b3b',
        arms: '#3a5b3b',
        legs: '#242824',
        shoes: '#111111'
      }
    },
    'Ron Green': {
      nameColor: '#69ff87',
      nametagColor: '#69ff87',
      nametagBackground: '#07100a',
      nametagSize: 17,
      nametagWeight: '800',
      playerColors: {
        head: '#d9a27e',
        body: '#2fbf59',
        arms: '#43db6a',
        legs: '#1f2c22',
        shoes: '#0b0f0c'
      }
    },
    Red: {
      nameColor: '#ff5e67',
      nametagColor: '#ff7a82',
      nametagBackground: '#16090b',
      nametagSize: 17,
      nametagWeight: '800',
      playerColors: {
        head: '#d9a27e',
        body: '#c83c45',
        arms: '#e85a61',
        legs: '#391619',
        shoes: '#10090a'
      }
    },
    Blue: {
      nameColor: '#66a8ff',
      nametagColor: '#82b8ff',
      nametagBackground: '#08111d',
      nametagSize: 17,
      nametagWeight: '800',
      playerColors: {
        head: '#d9a27e',
        body: '#3472c7',
        arms: '#568fe0',
        legs: '#1a2940',
        shoes: '#0a0f18'
      }
    },
    Purple: {
      nameColor: '#bf8cff',
      nametagColor: '#caa1ff',
      nametagBackground: '#100a18',
      nametagSize: 17,
      nametagWeight: '800',
      playerColors: {
        head: '#d9a27e',
        body: '#7f4dc2',
        arms: '#9a6be0',
        legs: '#2a1a3b',
        shoes: '#100b16'
      }
    }
  };

  let settings = loadSettings();
  let noa = null;
  let bloxd = null;
  let bloxdProps = null;
  let webpackRequire = null;
  let rendering = null;
  let objectData = null;
  let localEntry = null;
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

  function safeClone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
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
    const r = parseInt(v.slice(1, 3), 16) / 255;
    const g = parseInt(v.slice(3, 5), 16) / 255;
    const b = parseInt(v.slice(5, 7), 16) / 255;
    return { r, g, b };
  }

  function setColorObject(target, hex) {
    if (!target || !validHex(hex)) return false;
    const c = colorValue(hex);
    try {
      if (typeof target.set === 'function') {
        target.set(c.r, c.g, c.b);
        return true;
      }
      target.r = c.r;
      target.g = c.g;
      target.b = c.b;
      return true;
    } catch {
      return false;
    }
  }

  function getRendererScene() {
    try {
      const values = Object.values(rendering || {});
      return values.find(v => v && Array.isArray(v.meshes) && typeof v.getEngine === 'function') || null;
    } catch {
      return null;
    }
  }

  function getWebpackRequire() {
    if (webpackRequire?.m) return webpackRequire;

    try {
      const descriptors = Object.getOwnPropertyDescriptors(win);
      let key = Object.keys(descriptors).find(k => {
        const setter = descriptors[k]?.set;
        return setter && Function.prototype.toString.call(setter).includes('++');
      });

      if (!key) {
        key = Object.keys(win).find(k => {
          try {
            const value = win[k];
            return Array.isArray(value) && typeof value.push === 'function' && /webpack|chunk/i.test(k);
          } catch {
            return false;
          }
        });
      }

      if (!key) return null;

      let chunkArray = win[key];
      try { win[key] = win[key]; } catch {}
      chunkArray = win[key] || chunkArray;
      if (!chunkArray || typeof chunkArray.push !== 'function') return null;

      let req = null;
      const id = Math.floor(Math.random() * 9000000) + 1000000;
      chunkArray.push([[id], {}, runtime => { req = runtime; }]);

      if (req?.m) webpackRequire = req;
      return req;
    } catch {
      return null;
    }
  }

  function findNoa() {
    if (noa?.entities) return noa;

    const req = getWebpackRequire();
    if (!req?.m) return null;

    try {
      const moduleIds = Object.keys(req.m);

      for (const id of moduleIds) {
        const factory = req.m[id];
        if (typeof factory !== 'function') continue;

        const source = Function.prototype.toString.call(factory);
        if (!source.includes('nonBlocksClient:')) continue;

        let exported;
        try { exported = req(id); } catch { continue; }

        const exportedValues = [];
        if (exported && typeof exported === 'object') {
          exportedValues.push(exported);
          exportedValues.push(...Object.values(exported));
        }

        for (const candidate of exportedValues) {
          if (!candidate || typeof candidate !== 'object') continue;

          if (candidate.entities) {
            bloxdProps = candidate;
            bloxd = candidate.bloxd || null;
            return candidate;
          }

          const nested = Object.values(candidate).find(value =>
            value && typeof value === 'object' && value.entities
          );

          if (nested) {
            bloxdProps = candidate;
            bloxd = nested.bloxd || null;
            return nested;
          }
        }
      }
    } catch {}

    return null;
  }

  function findRendering(noaObj) {
    try {
      if (noaObj?.rendering) return noaObj.rendering;
      return Object.values(noaObj || {}).find(v =>
        v && typeof v === 'object' && Array.isArray(v.thinMeshes)
      ) || null;
    } catch {
      return null;
    }
  }

  function findObjectData(noaObj, renderingObj) {
    return renderingObj?.objectData || null;
  }

  function getLocalId() {
    const direct = [
      noa?.playerEntity,
      noa?.playerId,
      bloxd?.playerId,
      1
    ];

    for (const id of direct) {
      if (id != null) return id;
    }

    return 1;
  }

  function findLocalEntry() {
    const id = getLocalId();
    try {
      if (noa?.bloxd?.entityNames?.[id]) return noa.bloxd.entityNames[id];
      if (bloxd?.entityNames?.[id]) return bloxd.entityNames[id];
    } catch {}

    return null;
  }

  function walkObject(root, visitor, maxDepth = 6, maxNodes = 6000) {
    const seen = new WeakSet();
    let count = 0;
    const visit = (node, depth) => {
      if (!node || count >= maxNodes || depth > maxDepth) return;
      if ((typeof node !== 'object' && typeof node !== 'function') || seen.has(node)) return;
      seen.add(node);
      count++;
      try { visitor(node); } catch {}
      if (depth >= maxDepth) return;
      for (const key of Object.keys(node)) {
        if (key === 'scene' || key === '_scene' || key === 'engine' || key === '_engine' || key === 'parent') continue;
        let child;
        try { child = node[key]; } catch { continue; }
        visit(child, depth + 1);
      }
    };
    visit(root, 0);
  }

  function isMesh(value) {
    if (!value || typeof value !== 'object') return false;
    if (typeof value.dispose !== 'function') return false;
    if (value.material === undefined && typeof value.getClassName !== 'function') return false;
    if (typeof value.getClassName === 'function') {
      try { if (/mesh/i.test(value.getClassName())) return true; } catch {}
    }
    return typeof value.name === 'string' && ('material' in value || 'position' in value);
  }

  function refreshLocalMeshes() {
    localMeshes = [];

    const thinMeshes = Array.isArray(rendering?.thinMeshes) ? rendering.thinMeshes : [];
    for (const entry of thinMeshes) {
      const variations = entry?.meshVariations && typeof entry.meshVariations === 'object'
        ? Object.values(entry.meshVariations)
        : [];

      const candidates = [];
      if (entry?.mesh) candidates.push(entry.mesh);
      for (const variation of variations) {
        if (variation?.mesh) candidates.push(variation.mesh);
      }

      for (const mesh of candidates) {
        if (!isMesh(mesh) || localMeshes.includes(mesh)) continue;
        localMeshes.push(mesh);
      }
    }
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

  function cloneMaterial(mesh) {
    const original = mesh?.material;
    if (!original) return null;
    const existing = savedMaterials.get(mesh);
    if (existing) return existing.active;

    try {
      const active = typeof original.clone === 'function'
        ? original.clone('ron-bloxd-' + String(mesh.name || 'part'))
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
    const color = colorValue(hex);
    const names = ['diffuseColor', 'albedoColor', 'baseColor', 'emissiveColor'];
    for (const key of names) {
      if (!(key in material)) continue;
      try {
        if (material[key] && typeof material[key] === 'object') setColorObject(material[key], hex);
      } catch {}
    }
    try { material.diffuseColor = color; } catch {}
    try { material.albedoColor = color; } catch {}
  }

  function restoreMaterials() {
    for (const [mesh, record] of savedMaterials) {
      try {
        mesh.material = record.original;
      } catch {}
      if (record.cloned && record.active && typeof record.active.dispose === 'function') {
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

  function findNameEntry() {
    const id = getLocalId();
    try {
      return noa?.bloxd?.entityNames?.[id] || null;
    } catch {
      return null;
    }
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

    if (!settings.nameEnabled && !settings.nametagEnabled) {
      restoreName();
      return;
    }

    cloneNameStyle(entry);

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
          str: String(entry.entityName || ''),
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
    return null;
  }

  function getPlaneFactory(mesh) {
    try {
      if (mesh?.constructor?.CreatePlane) {
        return (name, size, scene) => mesh.constructor.CreatePlane(name, size, scene);
      }
    } catch {}
    try {
      const babylon = win.BABYLON;
      if (babylon?.Mesh?.CreatePlane) {
        return (name, size, scene) => babylon.Mesh.CreatePlane(name, size, scene);
      }
      if (babylon?.MeshBuilder?.CreatePlane) {
        return (name, size, scene) => babylon.MeshBuilder.CreatePlane(name, { width: size, height: size }, scene);
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

    const scene = torso.getScene?.() || getRendererScene();
    const createPlane = getPlaneFactory(torso);
    if (!scene || !createPlane) return;

    const Texture = getTextureConstructor(torso);
    if (!Texture) return;

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
      capeMaterial = MaterialCtor ? new MaterialCtor('ron-bloxd-cape-material', scene) : null;
      if (!capeMaterial) {
        disposeCape();
        return;
      }

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

  function applyVisuals(force = false) {
    const now = Date.now();
    if (!force && now - lastHookTry < 150) return;

    try {
      if (!noa?.entities) {
        noa = findNoa();
      }

      hooked = !!noa?.entities;

      if (noa) {
        bloxd = noa.bloxd || bloxd;
        rendering = findRendering(noa);
        objectData = findObjectData(noa, rendering);

        refreshLocalMeshes();
        setNameAndNametag();

        if (settings.playerEnabled) applyPlayerColors();
        else restoreMaterials();

        removeCapeIfDisabled();
      }
    } catch {}

    lastHookTry = now;
    updateStatus();
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

  function setFeature(key, enabled) {
    settings[key] = !!enabled;
    saveSettings();
    applyVisuals(true);
    renderUI();
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
    button.appendChild(make('span'));
    button.onclick = () => setFeature(key, !settings[key]);
    return field(label, button);
  }

  function colorField(label, key) {
    const input = make('input', { type: 'color', value: settings[key] });
    input.oninput = () => {
      settings[key] = input.value;
      settings.preset = 'Custom';
      saveSettings();
      applyVisuals();
    };
    return field(label, input);
  }

  function buildUI() {
    if (panel) return;

    shadow = document.createElement('div').attachShadow({ mode: 'open' });

    const host = document.createElement('div');
    host.id = 'ron-bloxd-visual-host';
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;isolation:isolate;';
    host.appendChild(shadow);
    document.documentElement.appendChild(host);

    const style = document.createElement('style');
    style.textContent = `
      :host{all:initial;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#eef6f1}
      *,*::before,*::after{box-sizing:border-box}
      .panel{position:fixed;right:18px;top:18px;width:356px;max-height:calc(100vh - 36px);display:flex;flex-direction:column;background:rgba(9,14,11,.96);border:1px solid #1d2a20;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.55);pointer-events:auto;color:#eef6f1;overflow:hidden}
      .head{display:flex;align-items:center;gap:12px;padding:15px 16px;border-bottom:1px solid #1b261e}
      .head strong{display:block;font-size:15px;letter-spacing:-.02em}.head small{display:block;margin-top:3px;color:#718075;font-size:10px}
      .grow{flex:1}.close{width:30px;height:30px;border:1px solid #233025;background:#0d140f;color:#aebbb1;border-radius:8px;font-size:17px;cursor:pointer}.close:hover{color:#fff}
      .body{padding:14px;overflow:auto}.section{padding:0 0 16px;margin:0 0 16px;border-bottom:1px solid #172119}.section:last-child{border-bottom:0;margin-bottom:0;padding-bottom:0}
      .title{font-size:10px;text-transform:uppercase;letter-spacing:.11em;color:#7c8b80;margin-bottom:9px}
      .row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:38px}.row label{font-size:12px;color:#cdd8d0}.row input[type=color]{width:42px;height:26px;padding:2px;border:1px solid #26342a;border-radius:7px;background:#0c120e;cursor:pointer}.row input[type=number],.row input[type=text],.row select{width:118px;height:30px;border:1px solid #26342a;border-radius:7px;background:#0b120d;color:#eef6f1;padding:0 8px;outline:0}
      .switch{width:42px;height:24px;padding:2px;border:1px solid #29372d;border-radius:20px;background:#121a14;cursor:pointer}.switch span{display:block;width:18px;height:18px;border-radius:50%;background:#657167;transition:.15s}.switch.on{background:#173c22;border-color:#2f6f3e}.switch.on span{transform:translateX(17px);background:#69ff87}
      .buttons{display:flex;flex-wrap:wrap;gap:7px}.btn{height:30px;padding:0 10px;border:1px solid #26342a;border-radius:7px;background:#0c130e;color:#b7c3bb;font-size:10px;font-weight:800;cursor:pointer}.btn:hover{border-color:#3b6244;color:#fff}.btn.active{background:#16321e;border-color:#3b824c;color:#69ff87}.btn.primary{background:#69ff87;border-color:#69ff87;color:#061008}
      .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.part{border:1px solid #202c23;background:#0b120d;border-radius:8px;padding:8px}.part span{display:block;font-size:10px;text-transform:capitalize;color:#95a198;margin-bottom:6px}.part-line{display:flex;align-items:center;gap:7px}.part-line input{width:36px;height:24px}.part-line code{font-size:9px;color:#657268}
      .cape-preview{height:110px;margin-top:8px;border:1px solid #202c23;border-radius:8px;background:#070b08;display:grid;place-items:center;overflow:hidden}.cape-preview img{max-width:100%;max-height:100%;object-fit:contain}
      .hint{margin-top:7px;color:#66736a;font-size:9px;line-height:1.55}.status{margin-top:10px;padding:9px 10px;border:1px solid #202c23;border-radius:8px;background:#0a100c;color:#839087;font-size:10px}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#d2a33a;margin-right:7px}.dot.good{background:#69ff87}
      .launcher{position:fixed;right:14px;bottom:14px;width:42px;height:42px;border:1px solid #315c3b;border-radius:10px;background:#0a110c;color:#69ff87;font-size:11px;font-weight:900;letter-spacing:.04em;cursor:pointer;pointer-events:auto;box-shadow:0 8px 25px rgba(0,0,0,.4)}
      .launcher:hover{background:#102117;border-color:#4a8d59;color:#fff}
      @media(max-width:600px){.panel{right:10px;left:10px;top:10px;width:auto;max-height:calc(100vh - 20px)}}
    `;
    shadow.appendChild(style);

    const launcher = make('button', {
      className: 'launcher',
      type: 'button',
      title: 'Open Ron Bloxd Visual Client'
    }, 'RON');
    launcher.onclick = openPanel;
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
    title.append(make('small', {}, 'Shift + I to open'));
    head.append(title, make('div', { className: 'grow' }));
    const close = make('button', { className: 'close', type: 'button' }, '×');
    close.onclick = () => { panel.hidden = true; };
    head.appendChild(close);
    panel.appendChild(head);

    const body = make('div', { className: 'body' });

    const features = make('section', { className: 'section' });
    features.append(make('div', { className: 'title' }, 'Features'));
    features.append(switchField('Name colour', 'nameEnabled'));
    features.append(switchField('Nametag style', 'nametagEnabled'));
    features.append(switchField('Custom cape', 'capeEnabled'));
    features.append(switchField('Player colours', 'playerEnabled'));
    body.appendChild(features);

    const names = make('section', { className: 'section' });
    names.append(make('div', { className: 'title' }, 'Name & nametag'));
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

    const weight = make('select');
    ['400','500','600','700','800','900'].forEach(v => weight.appendChild(make('option', { value: v, selected: v === settings.nametagWeight }, v)));

    const sizeRow = make('div', { className: 'row' });
    sizeRow.append(make('label', {}, 'Size'), size);
    names.appendChild(sizeRow);

    const weightRow = make('div', { className: 'row' });
    weight.onchange = () => {
      settings.nametagWeight = weight.value;
      settings.preset = 'Custom';
      saveSettings();
      applyVisuals(true);
    };
    weightRow.append(make('label', {}, 'Weight'), weight);
    names.appendChild(weightRow);

    body.appendChild(names);

    const presets = make('section', { className: 'section' });
    presets.append(make('div', { className: 'title' }, 'Visual presets'));
    const presetButtons = make('div', { className: 'buttons' });
    for (const name of Object.keys(PRESETS)) {
      const b = make('button', {
        className: 'btn ' + (settings.preset === name ? 'active' : ''),
        type: 'button'
      }, name);
      b.onclick = () => usePreset(name);
      presetButtons.appendChild(b);
    }
    const custom = make('button', {
      className: 'btn ' + (settings.preset === 'Custom' ? 'active' : ''),
      type: 'button'
    }, 'Custom');
    custom.onclick = () => {
      settings.preset = 'Custom';
      saveSettings();
      renderUI();
    };
    presetButtons.appendChild(custom);
    presets.appendChild(presetButtons);
    body.appendChild(presets);

    const players = make('section', { className: 'section' });
    players.append(make('div', { className: 'title' }, 'Player colours'));
    const partGrid = make('div', { className: 'grid' });
    for (const part of PARTS) {
      const card = make('div', { className: 'part' });
      card.append(make('span', {}, part));
      const line = make('div', { className: 'part-line' });
      const input = make('input', { type: 'color', value: settings.playerColors[part] });
      input.oninput = () => {
        settings.playerColors[part] = input.value;
        settings.preset = 'Custom';
        saveSettings();
        applyVisuals();
        const code = line.querySelector('code');
        if (code) code.textContent = input.value.toUpperCase();
      };
      line.append(input, make('code', {}, settings.playerColors[part].toUpperCase()));
      card.appendChild(line);
      partGrid.appendChild(card);
    }
    players.appendChild(partGrid);
    body.appendChild(players);

    const cape = make('section', { className: 'section' });
    cape.append(make('div', { className: 'title' }, 'Custom cape image'));

    const capeButtons = make('div', { className: 'buttons' });
    const choose = make('button', { className: 'btn primary', type: 'button' }, 'Choose image');
    const file = make('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
    choose.onclick = () => file.click();
    file.onchange = () => {
      const selected = file.files?.[0];
      if (!selected) return;
      if (selected.size > MAX_CAPE_BYTES) {
        alert('Cape image is too large. Keep it under 768 KB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        settings.capeUrl = String(reader.result || '');
        settings.capeEnabled = true;
        settings.preset = 'Custom';
        saveSettings();
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

    capeButtons.append(choose, clear);
    cape.appendChild(capeButtons);

    const url = make('input', { type: 'text', value: settings.capeUrl, placeholder: 'https://...' });
    url.onchange = () => {
      settings.capeUrl = url.value.trim();
      settings.capeEnabled = !!settings.capeUrl;
      settings.preset = 'Custom';
      saveSettings();
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

    cape.append(make('div', { className: 'hint' }, 'Local images are saved in this browser. PNG works best. Remote URLs need to be usable by the game renderer.'));
    body.appendChild(cape);

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

  function updateStatus() {
    if (!statusNode) return;
    statusNode.replaceChildren();
    statusNode.append(make('span', { className: 'dot ' + (hooked ? 'good' : '') }));
    statusNode.appendChild(document.createTextNode(
      hooked
        ? 'Bloxd renderer hook found'
        : 'Waiting for the Bloxd renderer'
    ));
  }

  function openPanel() {
    if (!panel) return;
    panel.hidden = false;
    applyVisuals(true);
  }

  function installKeys() {
    if (win.__RON_BLOXD_VISUAL_KEYS__) return;
    win.__RON_BLOXD_VISUAL_KEYS__ = true;

    const handler = event => {
      const tag = event.target?.tagName;
      const inField = ['INPUT','TEXTAREA','SELECT'].includes(tag) || event.target?.isContentEditable;

      if ((event.code === HOTKEY || String(event.key || '').toLowerCase() === 'i') &&
          event.shiftKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !inField) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!panel) buildUI();
        if (panel.hidden) openPanel();
        else panel.hidden = true;
        return;
      }

      if (event.code === 'Escape' && panel && !panel.hidden && !inField) {
        panel.hidden = true;
      }
    };

    document.addEventListener('keydown', handler, true);
    win.addEventListener('keydown', handler, true);
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('Open Bloxd Visual Client', openPanel);
    GM_registerMenuCommand('Reset Bloxd Visuals', resetAll);
  }

  function startClient() {
    if (!document.documentElement) {
      setTimeout(startClient, 25);
      return;
    }

    buildUI();
    installKeys();

    setTimeout(() => applyVisuals(true), 250);
    setTimeout(() => applyVisuals(true), 1000);
    setTimeout(() => applyVisuals(true), 2500);
  }

  startClient();

  win.addEventListener('load', () => applyVisuals(true), { once: true });

  const interval = setInterval(() => {
    try { applyVisuals(); } catch {}
  }, 500);

  win.addEventListener('beforeunload', () => {
    clearInterval(interval);
    try {
      restoreMaterials();
      restoreName();
      disposeCape();
    } catch {}
  });
})();
