// ==UserScript==
// @name         Ron | CS2 YouTube
// @namespace    https://ron.cool/
// @version      1.0.1
// @description  Turns YouTube thumbnails into one CS2 thumbnail. Toggle with Shift+I.
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @match        https://m.youtube.com/*
// @run-at       document-start
// @grant        none
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/cs2-youtube.user.js
// @downloadURL  https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/cs2-youtube.user.js
// ==/UserScript==

(() => {
  "use strict";

  const THUMBNAIL = "https://i.ytimg.com/vi/AaChIhfwEks/maxresdefault.jpg";
  const changed = new WeakMap();

  let enabled = false;
  let observer = null;
  let panelHost = null;
  let panel = null;

  const thumbnailParents =
    "ytd-thumbnail, ytd-rich-grid-media, ytd-video-renderer, ytd-compact-video-renderer, ytd-playlist-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, ytm-video-with-context-renderer";

  function isThumbnailImage(img) {
    return !!img.closest?.(thumbnailParents);
  }

  function saveOriginal(img) {
    if (changed.has(img)) return;

    changed.set(img, {
      src: img.getAttribute("src"),
      srcset: img.getAttribute("srcset"),
      sizes: img.getAttribute("sizes")
    });
  }

  function replaceImage(img) {
    if (!isThumbnailImage(img)) return;

    saveOriginal(img);
    img.setAttribute("src", THUMBNAIL);
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
  }

  function apply(root = document) {
    if (!root?.querySelectorAll) return;

    root.querySelectorAll("img").forEach(replaceImage);
  }

  function restore() {
    document.querySelectorAll("img").forEach(img => {
      const original = changed.get(img);
      if (!original) return;

      Object.entries(original).forEach(([name, value]) => {
        if (value === null) img.removeAttribute(name);
        else img.setAttribute(name, value);
      });

      changed.delete(img);
    });
  }

  function setStatus(textValue) {
    const status = panel?.querySelector("#status");
    if (status) status.textContent = textValue;
  }

  function makePanel() {
    if (panelHost) return;

    panelHost = document.createElement("div");
    panelHost.id = "ron-cs2-youtube-ui";

    Object.assign(panelHost.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      zIndex: "2147483647",
      width: "220px",
      pointerEvents: "auto"
    });

    const shadow = panelHost.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      *{box-sizing:border-box}
      .panel{
        width:220px;
        padding:14px;
        border:1px solid #303530;
        border-radius:10px;
        background:#0e110f;
        color:#f2f5f2;
        font:12px/1.4 Arial,sans-serif;
        box-shadow:0 12px 35px rgba(0,0,0,.42);
      }
      .title{
        font-size:15px;
        font-weight:700;
        letter-spacing:-.01em;
      }
      .status{
        margin-top:4px;
        color:#8f9a91;
        font-size:11px;
      }
      .buttons{
        display:flex;
        gap:7px;
        margin-top:12px;
      }
      button{
        appearance:none;
        border:1px solid #303730;
        border-radius:6px;
        min-height:34px;
        padding:0 10px;
        background:#171b18;
        color:#f2f5f2;
        font:700 11px Arial,sans-serif;
        cursor:pointer;
      }
      button:hover{background:#202620}
      .close{
        flex:1;
        background:#6dff88;
        border-color:#6dff88;
        color:#071009;
      }
      .revert{flex:1}
      .hint{
        margin-top:10px;
        color:#667168;
        font-size:10px;
      }
    `;

    panel = document.createElement("div");
    panel.className = "panel";
    panel.innerHTML = `
      <div class="title">CS2 YouTube</div>
      <div class="status" id="status">CS2 mode is ON</div>
      <div class="buttons">
        <button class="close" id="close">Close</button>
        <button class="revert" id="revert">Revert</button>
      </div>
      <div class="hint">Shift + I toggles CS2 mode</div>
    `;

    shadow.append(style, panel);

    const mount = () => {
      if (!panelHost.isConnected) document.documentElement.appendChild(panelHost);
    };

    if (document.documentElement) mount();
    else document.addEventListener("DOMContentLoaded", mount, { once: true });

    panel.querySelector("#close").addEventListener("click", disable);
    panel.querySelector("#revert").addEventListener("click", () => {
      restore();
      enabled = false;
      disconnectObserver();
      setStatus("CS2 mode is OFF");
    });
  }

  function disconnectObserver() {
    if (!observer) return;
    observer.disconnect();
    observer = null;
  }

  function enable() {
    enabled = true;
    makePanel();
    apply();

    disconnectObserver();

    observer = new MutationObserver(mutations => {
      if (!enabled) return;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) apply(node);
        }
      }
    });

    const target = document.documentElement || document;
    observer.observe(target, { childList: true, subtree: true });

    setStatus("CS2 mode is ON");
  }

  function disable() {
    enabled = false;
    disconnectObserver();
    restore();

    if (panelHost) {
      panelHost.remove();
      panelHost = null;
      panel = null;
    }
  }

  function toggle() {
    if (enabled) disable();
    else enable();
  }

  document.addEventListener("keydown", event => {
    if (
      event.key.toLowerCase() === "i" &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggle();
    }
  }, true);
})();
