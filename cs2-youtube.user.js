// ==UserScript==
// @name         Ron | CS2 YouTube
// @namespace    https://ron.cool/
// @version      2.0.0
// @description  Replaces YouTube thumbnails with one CS2 thumbnail. Toggle with Shift+I.
// @match        https://*.youtube.com/*
// @run-at       document-end
// @grant        none
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/cs2-youtube.user.js
// @downloadURL  https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/cs2-youtube.user.js
// ==/UserScript==

(() => {
  "use strict";

  if (window.__RON_CS2_YOUTUBE_V2__) return;
  window.__RON_CS2_YOUTUBE_V2__ = true;

  const THUMBNAIL = "https://i.ytimg.com/vi/AaChIhfwEks/maxresdefault.jpg";
  const changed = new WeakMap();

  let enabled = false;
  let panel = null;
  let scanTimer = null;
  let observer = null;

  const SELECTOR = [
    "ytd-thumbnail img",
    "ytd-rich-grid-media img",
    "ytd-video-renderer img",
    "ytd-compact-video-renderer img",
    "ytd-playlist-video-renderer img",
    "ytd-grid-video-renderer img",
    "ytd-reel-item-renderer img",
    "ytm-video-with-context-renderer img"
  ].join(",");

  function save(img) {
    if (!changed.has(img)) {
      changed.set(img, {
        src: img.getAttribute("src"),
        srcset: img.getAttribute("srcset"),
        sizes: img.getAttribute("sizes")
      });
    }
  }

  function replace(img) {
    if (!(img instanceof HTMLImageElement)) return;

    save(img);

    if (img.getAttribute("src") !== THUMBNAIL) {
      img.setAttribute("src", THUMBNAIL);
    }

    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
  }

  function scan() {
    if (!enabled) return;
    document.querySelectorAll(SELECTOR).forEach(replace);
  }

  function restore() {
    document.querySelectorAll(SELECTOR).forEach(img => {
      const old = changed.get(img);
      if (!old) return;

      if (old.src === null) img.removeAttribute("src");
      else img.setAttribute("src", old.src);

      if (old.srcset === null) img.removeAttribute("srcset");
      else img.setAttribute("srcset", old.srcset);

      if (old.sizes === null) img.removeAttribute("sizes");
      else img.setAttribute("sizes", old.sizes);

      changed.delete(img);
    });
  }

  function removePanel() {
    if (!panel) return;
    panel.remove();
    panel = null;
  }

  function makePanel() {
    removePanel();

    panel = document.createElement("div");
    panel.id = "ron-cs2-youtube-panel";

    panel.innerHTML = `
      <div class="ron-cs2-title">CS2 YouTube</div>
      <div class="ron-cs2-status">CS2 thumbnails are ON</div>
      <div class="ron-cs2-actions">
        <button type="button" data-action="revert">Revert</button>
        <button type="button" data-action="close">Close</button>
      </div>
      <div class="ron-cs2-hint">Shift + I to toggle</div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #ron-cs2-youtube-panel{
        position:fixed!important;
        right:18px!important;
        top:18px!important;
        z-index:2147483647!important;
        width:230px!important;
        padding:15px!important;
        box-sizing:border-box!important;
        background:#101210!important;
        color:#f4f7f4!important;
        border:1px solid #303630!important;
        border-radius:8px!important;
        box-shadow:0 14px 45px rgba(0,0,0,.45)!important;
        font:12px Arial,sans-serif!important;
        line-height:1.4!important;
        display:block!important;
        visibility:visible!important;
        opacity:1!important;
        pointer-events:auto!important;
      }
      #ron-cs2-youtube-panel *{box-sizing:border-box!important}
      #ron-cs2-youtube-panel .ron-cs2-title{font-size:15px!important;font-weight:700!important}
      #ron-cs2-youtube-panel .ron-cs2-status{margin-top:4px!important;color:#909a92!important}
      #ron-cs2-youtube-panel .ron-cs2-actions{display:flex!important;gap:7px!important;margin-top:12px!important}
      #ron-cs2-youtube-panel button{
        flex:1!important;
        min-height:34px!important;
        border:1px solid #394139!important;
        border-radius:5px!important;
        background:#1a1f1b!important;
        color:#fff!important;
        cursor:pointer!important;
        font:700 11px Arial,sans-serif!important;
      }
      #ron-cs2-youtube-panel button:hover{background:#262c27!important}
      #ron-cs2-youtube-panel .ron-cs2-hint{margin-top:9px!important;color:#687169!important;font-size:10px!important}
    `;

    panel.appendChild(style);

    document.documentElement.appendChild(panel);

    panel.querySelector('[data-action="close"]').addEventListener("click", () => {
      disable();
    });

    panel.querySelector('[data-action="revert"]').addEventListener("click", () => {
      restore();
      if (panel) {
        panel.querySelector(".ron-cs2-status").textContent = "Thumbnails reverted";
      }
    });
  }

  function disable() {
    enabled = false;

    if (scanTimer) {
      clearInterval(scanTimer);
      scanTimer = null;
    }

    if (observer) {
      observer.disconnect();
      observer = null;
    }

    restore();
    removePanel();
  }

  function enable() {
    enabled = true;
    makePanel();
    scan();

    scanTimer = setInterval(scan, 700);

    observer = new MutationObserver(() => {
      if (enabled) scan();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function toggle(event) {
    if (
      event.code === "KeyI" &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      enabled ? disable() : enable();
    }
  }

  window.addEventListener("keydown", toggle, true);
  document.addEventListener("keydown", toggle, true);

  window.addEventListener("yt-navigate-finish", () => {
    if (enabled) {
      setTimeout(scan, 100);
      setTimeout(scan, 500);
    }
  }, true);
})();
