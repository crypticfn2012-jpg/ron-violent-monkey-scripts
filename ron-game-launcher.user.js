// ==UserScript==
// @name         Ron | Game Launcher
// @namespace    https://ron.cool/
// @version      1.2.0
// @description  Fast keyboard-first launcher for browser games.
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

  const esc = value => String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  let favourites = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem("ron-game-launcher-favourites") || "[]");
    if (Array.isArray(saved)) favourites = new Set(saved);
  } catch {}

  const style = document.createElement("style");
  style.textContent = `
    #ron-game-launcher {
      position: fixed; inset: 0; z-index: 2147483646; display: none;
      align-items: flex-start; justify-content: center; padding: 9vh 14px;
      background: rgba(0,0,0,.64); backdrop-filter: blur(9px);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    #ron-game-launcher.open { display: flex; }
    .rgl-box {
      width: min(680px, 100%); max-height: 78vh; overflow: hidden;
      border: 1px solid rgba(85,255,122,.2); border-radius: 18px;
      background: #080d0a; box-shadow: 0 30px 100px rgba(0,0,0,.62);
      color: #f1f6f2; animation: rgl-in .12s ease-out;
    }
    @keyframes rgl-in { from { opacity: 0; transform: translateY(-8px) scale(.985); } to { opacity: 1; transform: none; } }
    .rgl-head { padding: 17px 18px 12px; border-bottom: 1px solid rgba(255,255,255,.06); }
    .rgl-row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .rgl-title { font-size: 13px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; color: #70ff91; }
    .rgl-count { color:#647068; font-size:11px; }
    .rgl-search {
      width: 100%; margin-top: 11px; padding: 11px 12px; box-sizing: border-box;
      border: 1px solid rgba(255,255,255,.09); border-radius: 10px; outline: none;
      background: rgba(255,255,255,.035); color: #fff; font-size: 14px;
    }
    .rgl-search::placeholder { color:#626d65; }
    .rgl-search:focus { border-color: rgba(85,255,122,.42); box-shadow: 0 0 0 3px rgba(85,255,122,.055); }
    .rgl-filters { display:flex; gap:6px; overflow:auto; padding:10px 18px 4px; scrollbar-width:none; }
    .rgl-filters::-webkit-scrollbar { display:none; }
    .rgl-filter {
      flex:0 0 auto; border:1px solid rgba(255,255,255,.07); border-radius:8px;
      background:rgba(255,255,255,.025); color:#87928a; padding:6px 9px; font-size:10px;
      cursor:pointer;
    }
    .rgl-filter.active { background:rgba(85,255,122,.1); border-color:rgba(85,255,122,.25); color:#8aff9f; }
    .rgl-list { padding:7px 10px 10px; max-height:52vh; overflow:auto; }
    .rgl-item {
      display:flex; align-items:center; justify-content:space-between; gap:14px;
      padding:11px 12px; border-radius:10px; cursor:pointer; user-select:none;
      border:1px solid transparent;
    }
    .rgl-item:hover { background:rgba(255,255,255,.035); }
    .rgl-item.selected { background:rgba(85,255,122,.095); border-color:rgba(85,255,122,.12); }
    .rgl-main { min-width:0; }
    .rgl-name { font-size:14px; font-weight:750; }
    .rgl-cat { color:#68736b; font-size:11px; }
    .rgl-star {
      flex:0 0 auto; width:28px; height:28px; display:grid; place-items:center;
      border:0; border-radius:7px; background:transparent; color:#657068; cursor:pointer; font-size:16px;
    }
    .rgl-star:hover { background:rgba(255,255,255,.06); color:#8aff9f; }
    .rgl-star.on { color:#72ff91; }
    .rgl-empty { padding:35px 15px; text-align:center; color:#657068; font-size:12px; }
    .rgl-foot {
      display:flex; justify-content:space-between; gap:12px; padding:10px 15px;
      border-top:1px solid rgba(255,255,255,.06); color:#5f6962; font-size:10px;
    }
    .rgl-foot b { color:#aeb8b1; font-weight:750; }
    @media(max-width:520px) {
      #ron-game-launcher { padding-top:5vh; }
      .rgl-foot { display:none; }
    }
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "ron-game-launcher";
  root.innerHTML = `
    <div class="rgl-box" role="dialog" aria-label="Ron Game Launcher">
      <div class="rgl-head">
        <div class="rgl-row">
          <div class="rgl-title">Ron Game Launcher</div>
          <div class="rgl-count"></div>
        </div>
        <input class="rgl-search" type="search" placeholder="Search games..." autocomplete="off" spellcheck="false">
      </div>
      <div class="rgl-filters"></div>
      <div class="rgl-list"></div>
      <div class="rgl-foot">
        <span><b>↑ ↓</b> select &nbsp; <b>Enter</b> launch &nbsp; <b>F</b> favourite</span>
        <span><b>Esc</b> close</span>
      </div>
    </div>`;
  document.body.appendChild(root);

  const search = root.querySelector(".rgl-search");
  const list = root.querySelector(".rgl-list");
  const filters = root.querySelector(".rgl-filters");
  const count = root.querySelector(".rgl-count");
  let selected = 0;
  let visible = [];
  let category = "All";

  const categories = ["All", ...new Set(games.map(g => g[2]))];
  filters.innerHTML = categories.map(cat =>
    `<button class="rgl-filter ${cat === "All" ? "active" : ""}" data-category="${esc(cat)}">${esc(cat)}</button>`
  ).join("");

  function saveFavourites() {
    try { localStorage.setItem("ron-game-launcher-favourites", JSON.stringify([...favourites])); } catch {}
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    visible = games.filter(g =>
      (category === "All" || g[2] === category) &&
      (!q || (g[0] + " " + g[2]).toLowerCase().includes(q))
    );
    visible.sort((a, b) =>
      Number(favourites.has(b[0])) - Number(favourites.has(a[0])) ||
      a[0].localeCompare(b[0])
    );

    selected = visible.length ? Math.max(0, Math.min(selected, visible.length - 1)) : 0;
    count.textContent = visible.length + " game" + (visible.length === 1 ? "" : "s");

    if (!visible.length) {
      list.innerHTML = '<div class="rgl-empty">No games found.</div>';
      return;
    }

    list.innerHTML = visible.map((g, i) => `
      <div class="rgl-item ${i === selected ? "selected" : ""}" data-index="${i}">
        <div class="rgl-main">
          <span class="rgl-name">${esc(g[0])}</span><br>
          <span class="rgl-cat">${esc(g[2])}</span>
        </div>
        <button class="rgl-star ${favourites.has(g[0]) ? "on" : ""}" data-favourite="${i}" title="Favourite" aria-label="Favourite">
          ${favourites.has(g[0]) ? "★" : "☆"}
        </button>
      </div>`).join("");

    const active = list.querySelector(".selected");
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  function openLauncher() {
    root.classList.add("open");
    search.value = "";
    category = "All";
    selected = 0;
    filters.querySelectorAll(".rgl-filter").forEach(b => b.classList.toggle("active", b.dataset.category === "All"));
    render();
    setTimeout(() => search.focus(), 0);
  }

  function closeLauncher() {
    root.classList.remove("open");
    search.blur();
  }

  function launch() {
    const game = visible[selected];
    if (game) window.location.assign(game[1]);
  }

  function toggleFavourite(index = selected) {
    const game = visible[index];
    if (!game) return;
    const name = game[0];
    if (favourites.has(name)) favourites.delete(name);
    else favourites.add(name);
    saveFavourites();
    render();
  }

  search.addEventListener("input", () => { selected = 0; render(); });

  filters.addEventListener("click", e => {
    const button = e.target.closest(".rgl-filter");
    if (!button) return;
    category = button.dataset.category;
    selected = 0;
    filters.querySelectorAll(".rgl-filter").forEach(b => b.classList.toggle("active", b === button));
    render();
  });

  list.addEventListener("click", e => {
    const star = e.target.closest(".rgl-star");
    if (star) {
      e.stopPropagation();
      toggleFavourite(Number(star.dataset.favourite));
      return;
    }
    const item = e.target.closest(".rgl-item");
    if (!item) return;
    selected = Number(item.dataset.index);
    launch();
  });

  root.addEventListener("click", e => {
    if (e.target === root) closeLauncher();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "F2" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      root.classList.contains("open") ? closeLauncher() : openLauncher();
      return;
    }

    if (!root.classList.contains("open")) return;

    if (e.key === "Escape") {
      e.preventDefault();
      closeLauncher();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      selected = Math.min(selected + 1, Math.max(visible.length - 1, 0));
      render();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selected = Math.max(selected - 1, 0);
      render();
    } else if (e.key === "Enter") {
      e.preventDefault();
      launch();
    } else if (e.key.toLowerCase() === "f" && e.target === search) {
      e.preventDefault();
      toggleFavourite();
    }
  }, true);
})();