// ==UserScript==
// @name         Ron | Game Launcher
// @namespace    https://ron.cool/
// @version      1.0.0
// @description  Quick keyboard-first launcher for browser games.
// @match        *://*/*
// @run-at       document-end
// @grant        none
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-game-launcher.user.js
// @downloadURL  https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-game-launcher.user.js
// ==/UserScript==

(() => {
  "use strict";

  if (window.top !== window.self || window.__RON_GAME_LAUNCHER__) return;
  window.__RON_GAME_LAUNCHER__ = true;

  const games = [
    ["BuildNow.GG", "https://buildnow.gg/", "Shooter"],
    ["1v1.LOL", "https://1v1.lol/", "Shooter"],
    ["Veck.io", "https://veck.io/", "Shooter"],
    ["Kour.io", "https://kour.io/", "Shooter"],
    ["Shell Shockers", "https://shellshock.io/", "Shooter"],
    ["Krunker", "https://krunker.io/", "Shooter"],
    ["Kirka.io", "https://kirka.io/", "Shooter"],
    ["Venge.io", "https://venge.io/", "Shooter"],
    ["DEADSHOT.io", "https://deadshot.io/", "Shooter"],
    ["War Brokers", "https://warbrokers.io/", "Shooter"],
    ["Voxiom.io", "https://voxiom.io/", "Shooter"],
    ["Narrow One", "https://narrow.one/", "Shooter"],
    ["Bloxd.io", "https://bloxd.io/", "Sandbox"],
    ["ZombsRoyale.io", "https://zombsroyale.io/", "Battle Royale"],
    ["Smash Karts", "https://smashkarts.io/", "Racing"],
    ["Agar.io", "https://agar.io/", "Arcade"],
    ["Slither.io", "https://slither.io/", "Arcade"],
    ["Diep.io", "https://diep.io/", "Arcade"],
    ["Paper.io 2", "https://paper-io.com/", "Arcade"],
    ["LOLBeans", "https://lolbeans.io/", "Party"],
    ["BattleDudes", "https://battledudes.io/", "Shooter"],
    ["Ev.io", "https://ev.io/", "Shooter"]
  ];

  const style = document.createElement("style");
  style.textContent = `
    #ron-game-launcher {
      position: fixed; inset: 0; z-index: 2147483646; display: none;
      align-items: flex-start; justify-content: center; padding-top: 13vh;
      background: rgba(0,0,0,.58); backdrop-filter: blur(8px);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    #ron-game-launcher.open { display: flex; }
    .rgl-box {
      width: min(620px, calc(100vw - 28px)); max-height: 70vh; overflow: hidden;
      border: 1px solid rgba(100,255,135,.18); border-radius: 16px;
      background: #0a0f0c; box-shadow: 0 30px 100px rgba(0,0,0,.55); color: #f1f6f2;
    }
    .rgl-head { padding: 16px 17px 12px; border-bottom: 1px solid rgba(255,255,255,.06); }
    .rgl-title { font-size: 12px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; color: #7cff98; }
    .rgl-search {
      width: 100%; margin-top: 10px; padding: 10px 11px; box-sizing: border-box;
      border: 1px solid rgba(255,255,255,.09); border-radius: 9px; outline: none;
      background: rgba(255,255,255,.035); color: #fff; font-size: 14px;
    }
    .rgl-search:focus { border-color: rgba(100,255,135,.4); }
    .rgl-list { padding: 8px; max-height: 52vh; overflow: auto; }
    .rgl-item {
      display: flex; align-items: center; justify-content: space-between; gap: 14px;
      padding: 11px 12px; border-radius: 10px; cursor: pointer; user-select: none;
    }
    .rgl-item.selected { background: rgba(100,255,135,.11); }
    .rgl-name { font-size: 14px; font-weight: 750; }
    .rgl-cat { color: #758078; font-size: 11px; }
    .rgl-star { color: #7cff98; font-size: 13px; }
    .rgl-foot {
      display: flex; justify-content: space-between; gap: 12px; padding: 10px 14px;
      border-top: 1px solid rgba(255,255,255,.06); color: #6f7972; font-size: 11px;
    }
    .rgl-foot b { color: #aeb8b1; }
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "ron-game-launcher";
  root.innerHTML = `
    <div class="rgl-box">
      <div class="rgl-head">
        <div class="rgl-title">Ron Game Launcher</div>
        <input class="rgl-search" placeholder="Search games..." autocomplete="off">
      </div>
      <div class="rgl-list"></div>
      <div class="rgl-foot"><span><b>↑ ↓</b> select &nbsp; <b>Enter</b> launch &nbsp; <b>F</b> favourite</span><span><b>Esc</b> close</span></div>
    </div>`;
  document.body.appendChild(root);

  const search = root.querySelector(".rgl-search");
  const list = root.querySelector(".rgl-list");
  let selected = 0;
  let visible = [];
  const favourites = new Set(JSON.parse(localStorage.getItem("ron-game-launcher-favourites") || "[]"));

  function render() {
    const q = search.value.trim().toLowerCase();
    visible = games.filter(g => !q || (g[0] + " " + g[2]).toLowerCase().includes(q));
    visible.sort((a, b) => Number(favourites.has(b[0])) - Number(favourites.has(a[0])) || a[0].localeCompare(b[0]));
    selected = Math.max(0, Math.min(selected, visible.length - 1));
    list.innerHTML = visible.map((g, i) => `
      <div class="rgl-item ${i === selected ? "selected" : ""}" data-index="${i}">
        <span><span class="rgl-name">${g[0]}</span><br><span class="rgl-cat">${g[2]}</span></span>
        <span class="rgl-star">${favourites.has(g[0]) ? "★" : ""}</span>
      </div>`).join("");
  }

  function open() {
    root.classList.add("open");
    search.value = "";
    selected = 0;
    render();
    setTimeout(() => search.focus(), 0);
  }

  function close() {
    root.classList.remove("open");
    search.blur();
  }

  function launch() {
    if (!visible[selected]) return;
    window.location.href = visible[selected][1];
  }

  function toggleFavourite() {
    if (!visible[selected]) return;
    const name = visible[selected][0];
    favourites.has(name) ? favourites.delete(name) : favourites.add(name);
    localStorage.setItem("ron-game-launcher-favourites", JSON.stringify([...favourites]));
    render();
  }

  search.addEventListener("input", () => { selected = 0; render(); });
  list.addEventListener("click", e => {
    const item = e.target.closest(".rgl-item");
    if (!item) return;
    selected = Number(item.dataset.index);
    launch();
  });
  root.addEventListener("click", e => { if (e.target === root) close(); });

  document.addEventListener("keydown", e => {
    if (e.key === "F5" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      root.classList.contains("open") ? close() : open();
      return;
    }
    if (!root.classList.contains("open")) return;
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); selected = Math.min(selected + 1, visible.length - 1); render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); selected = Math.max(selected - 1, 0); render(); }
    else if (e.key === "Enter") { e.preventDefault(); launch(); }
    else if (e.key.toLowerCase() === "f" && e.target === search) { e.preventDefault(); toggleFavourite(); }
  });
})();