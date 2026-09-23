// ==UserScript==
// @name         Ron | CS2 YouTube
// @namespace    https://ron.cool/
// @version      4.0.0
// @description  Optional CS2 thumbnail mode for YouTube. Open with Shift+I and turn it on.
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

  if (window.__RON_CS2_YOUTUBE_4__) return;
  window.__RON_CS2_YOUTUBE_4__ = true;

  var IMAGE = "https://i.ytimg.com/vi/AaChIhfwEks/maxresdefault.jpg";
  var enabled = false;
  var panelOpen = false;
  var panel = null;
  var style = null;

  var CSS = [
    ".ron-cs2-enabled ytd-thumbnail #thumbnail,",
    ".ron-cs2-enabled ytd-thumbnail,",
    ".ron-cs2-enabled .yt-thumbnail-view-model__image,",
    ".ron-cs2-enabled .yt-thumbnail-view-model,",
    ".ron-cs2-enabled yt-thumbnail-view-model,",
    ".ron-cs2-enabled .yt-lockup-view-model__content-image,",
    ".ron-cs2-enabled ytm-thumbnail {",
    "  background-image: url('" + IMAGE + "') !important;",
    "  background-size: cover !important;",
    "  background-position: center !important;",
    "  background-repeat: no-repeat !important;",
    "}",

    ".ron-cs2-enabled ytd-thumbnail img,",
    ".ron-cs2-enabled .yt-thumbnail-view-model__image img,",
    ".ron-cs2-enabled .yt-thumbnail-view-model img,",
    ".ron-cs2-enabled yt-thumbnail-view-model img,",
    ".ron-cs2-enabled .yt-lockup-view-model__content-image img,",
    ".ron-cs2-enabled ytm-thumbnail img {",
    "  opacity: 0 !important;",
    "  visibility: hidden !important;",
    "}",

    ".ron-cs2-enabled ytd-moving-thumbnail-renderer,",
    ".ron-cs2-enabled ytd-moving-thumbnail-renderer img,",
    ".ron-cs2-enabled yt-image-companion {",
    "  visibility: hidden !important;",
    "}",

    ".ron-cs2-enabled .yt-thumbnail-view-model__image,",
    ".ron-cs2-enabled .yt-lockup-view-model__content-image {",
    "  overflow: hidden !important;",
    "}"
  ].join("\n");

  function addStyles() {
    if (style && style.isConnected) return;

    style = document.createElement("style");
    style.id = "ron-cs2-youtube-style";
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function setMode(value) {
    enabled = value;
    addStyles();

    if (enabled) {
      document.documentElement.classList.add("ron-cs2-enabled");
    } else {
      document.documentElement.classList.remove("ron-cs2-enabled");
    }

    updatePanel();
  }

  function updatePanel() {
    if (!panel) return;

    var status = panel.querySelector('[data-role="status"]');
    var toggle = panel.querySelector('[data-role="toggle"]');

    status.textContent = enabled
      ? "CS2 mode is ON. YouTube thumbnails are replaced."
      : "CS2 mode is OFF. Nothing is changed.";

    toggle.textContent = enabled ? "Turn Off" : "Turn On";
  }

  function makeButton(label, primary) {
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = [
      "height:36px",
      "padding:0 12px",
      "border-radius:6px",
      "border:1px solid " + (primary ? "#69ff87" : "#343a35"),
      "background:" + (primary ? "#69ff87" : "#191d1a"),
      "color:" + (primary ? "#071009" : "#ffffff"),
      "font:700 11px Arial,sans-serif",
      "cursor:pointer"
    ].join(";");
    return button;
  }

  function createPanel() {
    if (panel && panel.isConnected) return;

    panel = document.createElement("div");
    panel.id = "ron-cs2-youtube-panel";
    panel.style.cssText = [
      "position:fixed",
      "top:18px",
      "right:18px",
      "z-index:2147483647",
      "width:270px",
      "padding:16px",
      "background:#101310",
      "color:#f4f7f4",
      "border:1px solid #343a35",
      "border-radius:9px",
      "box-shadow:0 15px 50px rgba(0,0,0,.55)",
      "font-family:Arial,sans-serif",
      "font-size:12px",
      "line-height:1.4",
      "box-sizing:border-box",
      "display:block",
      "visibility:visible",
      "opacity:1",
      "pointer-events:auto"
    ].join(";");

    var title = document.createElement("div");
    title.textContent = "CS2 YouTube";
    title.style.cssText = "font-size:16px;font-weight:700;margin-bottom:5px";

    var status = document.createElement("div");
    status.dataset.role = "status";
    status.style.cssText = "color:#929b93;font-size:11px;margin-bottom:13px";

    var buttons = document.createElement("div");
    buttons.style.cssText = "display:flex;gap:7px";

    var toggle = makeButton("Turn On", true);
    toggle.dataset.role = "toggle";

    var revert = makeButton("Revert", false);
    revert.dataset.role = "revert";

    var close = makeButton("Close", false);
    close.dataset.role = "close";

    var hint = document.createElement("div");
    hint.textContent = "Shift + I opens/closes this panel";
    hint.style.cssText = "margin-top:10px;color:#687169;font-size:10px";

    buttons.appendChild(toggle);
    buttons.appendChild(revert);
    buttons.appendChild(close);

    panel.appendChild(title);
    panel.appendChild(status);
    panel.appendChild(buttons);
    panel.appendChild(hint);

    (document.body || document.documentElement).appendChild(panel);

    toggle.addEventListener("click", function () {
      setMode(!enabled);
    });

    revert.addEventListener("click", function () {
      setMode(false);
    });

    close.addEventListener("click", function () {
      closePanel();
    });

    updatePanel();
  }

  function openPanel() {
    panelOpen = true;
    createPanel();
  }

  function closePanel() {
    panelOpen = false;
    if (panel) {
      panel.remove();
      panel = null;
    }
  }

  function togglePanel() {
    if (panelOpen) closePanel();
    else openPanel();
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
      event.stopImmediatePropagation();
      togglePanel();
    }
  }

  window.addEventListener("keydown", onKey, true);
  document.addEventListener("keydown", onKey, true);

  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("Open CS2 YouTube", openPanel);
    GM_registerMenuCommand("Turn CS2 YouTube On/Off", function () {
      setMode(!enabled);
      if (!panelOpen) openPanel();
    });
    GM_registerMenuCommand("Revert CS2 YouTube", function () {
      setMode(false);
    });
  }
})();
