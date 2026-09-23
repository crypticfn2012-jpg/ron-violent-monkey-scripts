// ==UserScript==
// @name         Ron | CS2 YouTube
// @namespace    https://ron.cool/
// @version      3.1.0
// @description  Turns YouTube thumbnails into one CS2 thumbnail. Toggle with Shift+I.
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @match        https://m.youtube.com/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/cs2-youtube.user.js
// @downloadURL  https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/cs2-youtube.user.js
// ==/UserScript==

(function () {
  "use strict";

  var IMAGE = "https://i.ytimg.com/vi/AaChIhfwEks/maxresdefault.jpg";
  var running = false;
  var panel = null;
  var observer = null;
  var originals = new Map();

  var thumbSelector = [
    "ytd-thumbnail img",
    "ytd-rich-grid-media img",
    "ytd-video-renderer img",
    "ytd-compact-video-renderer img",
    "ytd-playlist-video-renderer img",
    "ytd-grid-video-renderer img",
    "ytd-reel-item-renderer img"
  ].join(",");

  function swap(img) {
    if (!originals.has(img)) {
      originals.set(img, {
        src: img.getAttribute("src"),
        srcset: img.getAttribute("srcset"),
        sizes: img.getAttribute("sizes")
      });
    }

    img.src = IMAGE;
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
  }

  function scan() {
    if (!running) return;
    var imgs = document.querySelectorAll(thumbSelector);
    for (var i = 0; i < imgs.length; i++) swap(imgs[i]);
  }

  function restore() {
    originals.forEach(function (old, img) {
      if (!img || !img.isConnected) return;

      if (old.src === null) img.removeAttribute("src");
      else img.setAttribute("src", old.src);

      if (old.srcset === null) img.removeAttribute("srcset");
      else img.setAttribute("srcset", old.srcset);

      if (old.sizes === null) img.removeAttribute("sizes");
      else img.setAttribute("sizes", old.sizes);
    });

    originals.clear();
  }

  function closePanel() {
    if (panel) {
      panel.remove();
      panel = null;
    }
  }

  function createPanel() {
    closePanel();

    panel = document.createElement("div");

    panel.style.cssText = [
      "position:fixed",
      "top:24px",
      "right:24px",
      "z-index:2147483647",
      "width:240px",
      "padding:16px",
      "background:#0f120f",
      "color:#fff",
      "border:1px solid #394139",
      "border-radius:8px",
      "box-shadow:0 12px 40px rgba(0,0,0,.55)",
      "font-family:Arial,sans-serif",
      "font-size:13px",
      "line-height:1.4",
      "display:block",
      "visibility:visible",
      "opacity:1",
      "pointer-events:auto"
    ].join(";");

    panel.innerHTML =
      '<div style="font-size:16px;font-weight:700;margin-bottom:5px">CS2 YouTube</div>' +
      '<div id="ron-cs2-state" style="color:#98a198;font-size:11px">CS2 thumbnails are ON</div>' +
      '<div style="display:flex;gap:8px;margin-top:13px">' +
        '<button id="ron-cs2-revert" style="flex:1;height:35px;border:1px solid #3b433c;border-radius:6px;background:#1a1e1b;color:#fff;cursor:pointer;font-weight:700">Revert</button>' +
        '<button id="ron-cs2-close" style="flex:1;height:35px;border:0;border-radius:6px;background:#69ff87;color:#071009;cursor:pointer;font-weight:700">Close</button>' +
      '</div>' +
      '<div style="margin-top:10px;color:#697269;font-size:10px">Shift + I to toggle</div>';

    (document.body || document.documentElement).appendChild(panel);

    panel.querySelector("#ron-cs2-revert").onclick = function () {
      restore();
      setRunning(false);
    };

    panel.querySelector("#ron-cs2-close").onclick = function () {
      setRunning(false);
    };
  }

  function startObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver(function () {
      scan();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function setRunning(value) {
    running = value;

    if (running) {
      createPanel();
      scan();
      startObserver();
    } else {
      if (observer) {
        observer.disconnect();
        observer = null;
      }

      restore();
      closePanel();
    }
  }

  function onKey(event) {
    if (
      event.code === "KeyI" &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.repeat
    ) {
      event.preventDefault();
      event.stopPropagation();
      setRunning(!running);
    }
  }

  window.addEventListener("keydown", onKey, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", function () {}, true);

  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("Toggle CS2 YouTube", function () {
      setRunning(!running);
    });
  }

  setInterval(function () {
    if (running) scan();
  }, 1000);
})();
