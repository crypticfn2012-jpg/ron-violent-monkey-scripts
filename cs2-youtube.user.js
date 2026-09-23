// ==UserScript==
// @name         Ron | CS2 YouTube
// @namespace    https://ron.cool/
// @version      1.1.0
// @description  Turns YouTube thumbnails into one CS2 thumbnail. Toggle with Shift+I.
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @match        https://m.youtube.com/*
// @run-at       document-start
// @grant        none
// @inject-into  page
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/cs2-youtube.user.js
// @downloadURL  https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/cs2-youtube.user.js
// ==/UserScript==

(() => {
  "use strict";

  if (window.__RON_CS2_YOUTUBE__) return;
  window.__RON_CS2_YOUTUBE__ = true;

  const THUMBNAIL = "https://i.ytimg.com/vi/AaChIhfwEks/maxresdefault.jpg";
  const changed = new WeakMap();
  const parentSelector = [
    "ytd-thumbnail",
    "ytd-rich-grid-media",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-playlist-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-reel-item-renderer",
    "ytm-video-with-context-renderer"
  ].join(",");

  let enabled = false;
  let observer = null;
  let panel = null;

  function isThumbnail(img) {
    return !!img.closest?.(parentSelector);
  }

  function replace(img) {
    if (!isThumbnail(img)) return;
    if (!changed.has(img)) {
      changed.set(img, {
        src: img.getAttribute("src"),
        srcset: img.getAttribute("srcset"),
        sizes: img.getAttribute("sizes")
      });
    }
    img.src = THUMBNAIL;
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
  }

  function scan(root = document) {
    if (!root.querySelectorAll) return;
    root.querySelectorAll("img").forEach(replace);
  }

  function restore() {
    document.querySelectorAll("img").forEach(img => {
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

  function ensurePanel() {
    if (panel?.isConnected) return;

    panel = document.createElement("div");
    panel.id = "ron-cs2-panel";

    panel.innerHTML = `
      <div class="ron-cs2-head">
        <strong>CS2 YouTube</strong>
        <span>ON</span>
      </div>
      <div class="ron-cs2-sub">All thumbnails are now CS2.</div>
      <div class="ron-cs2-buttons">
        <button id="ron-cs2-revert">Revert</button>
        <button id="ron-cs2-close">Close</button>
      </div>
      <div class="ron-cs2-key">Shift + I to toggle</div>
    `;

    const style = document.createElement("style");
    style.id = "ron-cs2-style";
    style.textContent = `
      #ron-cs2-panel{
        position:fixed !important;
        top:20px !important;
        right:20px !important;
        width:230px !important;
        padding:15px !important;
        z-index:2147483647 !important;
        display:block !important;
        visibility:visible !important;
        opacity:1 !important;
        pointer-events:auto !important;
        box-sizing:border-box !important;
        background:#101310 !important;
        color:#f2f5f2 !important;
        border:1px solid #303630 !important;
        border-radius:9px !important;
        box-shadow:0 12px 40px rgba(0,0,0,.5) !important;
        font-family:Arial,sans-serif !important;
        font-size:12px !important;
      }
      #ron-cs2-panel *{box-sizing:border-box !important}
      #ron-cs2-panel .ron-cs2-head{display:flex !important;align-items:center !important;justify-content:space-between !important}
      #ron-cs2-panel strong{font-size:15px !important}
      #ron-cs2-panel .ron-cs2-head span{font-size:9px !important;color:#071009 !important;background:#6dff88 !important;padding:3px 6px !important;border-radius:4px !important;font-weight:800 !important}
      #ron-cs2-panel .ron-cs2-sub{margin-top:5px !important;color:#929b94 !important;font-size:11px !important}
      #ron-cs2-panel .ron-cs2-buttons{display:flex !important;gap:7px !important;margin-top:13px !important}
      #ron-cs2-panel button{flex:1 !important;height:34px !important;border:1px solid #343b35 !important;border-radius:6px !important;background:#191d1a !important;color:#fff !important;font:700 11px Arial,sans-serif !important;cursor:pointer !important}
      #ron-cs2-panel button:hover{background:#252a26 !important}
      #ron-cs2-panel .ron-cs2-key{margin-top:10px !important;color:#687169 !important;font-size:10px !important}
    `;

    panel.appendChild(style);

    const mount = () => {
      const target = document.body || document.documentElement;
      if (target && !panel.isConnected) target.appendChild(panel);
    };

    mount();

    panel.querySelector("#ron-cs2-revert").onclick = () => {
      restore();
      setEnabled(false);
    };

    panel.querySelector("#ron-cs2-close").onclick = () => {
      setEnabled(false);
    };
  }

  function setEnabled(value) {
    enabled = value;

    if (enabled) {
      ensurePanel();
      scan();

      if (observer) observer.disconnect();

      observer = new MutationObserver(mutations => {
        if (!enabled) return;
        for (const mutation of mutations) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) scan(node);
          });
        }
      });

      observer.observe(document.documentElement || document, {
        childList: true,
        subtree: true
      });
    } else {
      if (observer) {
        observer.disconnect();
        observer = null;
      }

      restore();

      if (panel) {
        panel.remove();
        panel = null;
      }
    }
  }

  function toggle() {
    setEnabled(!enabled);
  }

  function keyHandler(event) {
    if (
      event.type === "keydown" &&
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
  }

  window.addEventListener("keydown", keyHandler, { capture: true });
  document.addEventListener("keydown", keyHandler, { capture: true });

  window.addEventListener("yt-navigate-finish", () => {
    if (enabled) {
      ensurePanel();
      scan();
    }
  }, true);
})();
