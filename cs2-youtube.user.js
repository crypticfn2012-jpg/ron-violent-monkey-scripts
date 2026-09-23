// ==UserScript==
// @name         Ron | CS2 YouTube
// @namespace    https://ron.cool/
// @version      1.0.0
// @description  Turns YouTube thumbnails into one CS2 thumbnail. Toggle with Shift+I.
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @run-at       document-start
// @grant        none
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/cs2-youtube.user.js
// @downloadURL  https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/cs2-youtube.user.js
// ==/UserScript==

(() => {
  "use strict";

  const THUMBNAIL = "https://i.ytimg.com/vi/AaChIhfwEks/maxresdefault.jpg";
  const TOGGLE_KEY = "Shift+I";
  const changed = new WeakMap();
  let enabled = false;
  let observer = null;
  let panel = null;

  const isThumbnailImage = img => {
    const parent = img.closest(
      "ytd-thumbnail, ytd-rich-grid-media, ytd-video-renderer, ytd-compact-video-renderer, ytd-playlist-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, ytm-video-with-context-renderer"
    );
    return !!parent;
  };

  function saveOriginal(img) {
    if (changed.has(img)) return;

    changed.set(img, {
      src: img.getAttribute("src"),
      srcset: img.getAttribute("srcset"),
      sizes: img.getAttribute("sizes"),
      style: img.getAttribute("style")
    });
  }

  function replaceImage(img) {
    if (!isThumbnailImage(img)) return;

    saveOriginal(img);
    img.src = THUMBNAIL;
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
  }

  function replaceBackgrounds(root) {
    const elements = root.querySelectorAll
      ? root.querySelectorAll(
          "ytd-thumbnail, ytd-rich-grid-media, ytd-video-renderer, ytd-compact-video-renderer, ytd-playlist-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer"
        )
      : [];

    elements.forEach(el => {
      const style = getComputedStyle(el);
      if (style.backgroundImage && style.backgroundImage !== "none") {
        const current = el.style.backgroundImage;
        if (!el.dataset.ronCs2BgSaved) {
          el.dataset.ronCs2BgSaved = current;
        }
        el.style.backgroundImage = `url("${THUMBNAIL}")`;
      }
    });
  }

  function apply(root = document) {
    root.querySelectorAll?.("img").forEach(replaceImage);
    replaceBackgrounds(root);
  }

  function restore() {
    document.querySelectorAll("img").forEach(img => {
      const original = changed.get(img);
      if (!original) return;

      for (const [attr, value] of Object.entries(original)) {
        if (value === null) img.removeAttribute(attr);
        else img.setAttribute(attr, value);
      }
      changed.delete(img);
    });

    document.querySelectorAll("[data-ron-cs2-bg-saved]").forEach(el => {
      el.style.backgroundImage = el.dataset.ronCs2BgSaved;
      delete el.dataset.ronCs2BgSaved;
    });
  }

  function updatePanel() {
    if (!panel) return;
    panel.querySelector(".ron-cs2-status").textContent =
      enabled ? "CS2 mode is ON" : "CS2 mode is OFF";
    panel.querySelector(".ron-cs2-revert").disabled = !enabled;
  }

  function createPanel() {
    if (panel) return;

    panel = document.createElement("div");
    panel.innerHTML = `
      <div class="ron-cs2-title">CS2 YouTube</div>
      <div class="ron-cs2-status">CS2 mode is ON</div>
      <button class="ron-cs2-revert" type="button">Revert thumbnails</button>
      <div class="ron-cs2-hint">${TOGGLE_KEY} to close</div>
    `;

    Object.assign(panel.style, {
      position: "fixed",
      top: "18px",
      right: "18px",
      zIndex: "2147483647",
      width: "190px",
      padding: "14px",
      background: "#111",
      color: "#fff",
      border: "1px solid #333",
      borderRadius: "8px",
      boxShadow: "0 8px 30px rgba(0,0,0,.35)",
      fontFamily: "Arial, sans-serif",
      fontSize: "12px"
    });

    const style = document.createElement("style");
    style.textContent = `
      .ron-cs2-title{font-size:14px;font-weight:700;margin-bottom:5px}
      .ron-cs2-status{color:#aaa;margin-bottom:11px}
      .ron-cs2-revert{width:100%;border:0;border-radius:5px;padding:8px;background:#fff;color:#111;font-weight:700;cursor:pointer}
      .ron-cs2-revert:disabled{opacity:.45;cursor:default}
      .ron-cs2-hint{margin-top:9px;color:#777;font-size:10px}
    `;

    document.documentElement.appendChild(style);
    document.documentElement.appendChild(panel);

    panel.querySelector(".ron-cs2-revert").addEventListener("click", () => {
      enabled = false;
      if (observer) observer.disconnect();
      restore();
      updatePanel();
    });
  }

  function enable() {
    enabled = true;
    createPanel();
    apply();

    observer = new MutationObserver(mutations => {
      if (!enabled) return;
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) apply(node);
        });
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    updatePanel();
  }

  function disable() {
    enabled = false;
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

  function toggle() {
    if (enabled) disable();
    else enable();
  }

  window.addEventListener("keydown", event => {
    if (
      event.key.toLowerCase() === "i" &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    }
  }, true);
})();
