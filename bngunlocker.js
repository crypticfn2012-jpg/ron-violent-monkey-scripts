// ==UserScript==
// @name         Recte BuildNow Unlocker
// @version      9
// @author       Recte.cc/invite
// @match        https://*.crazygames.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
"use strict";
(() => {
  // src/dom.js
  function logDebug(message, ...args) {
  }
  function waitForElement(selector, callback) {
    const element = document.querySelector(selector);
    if (element) {
      callback(element);
    } else {
      const observer = new MutationObserver(() => {
        const element2 = document.querySelector(selector);
        if (element2) {
          observer.disconnect();
          callback(element2);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  // src/config.js
  var elementsToRemove = [".css-jyxwok", ".css-qeuppi", ".css-1g0vwi8", ".css-1bnqyvi"];

  // src/ui.js
  function changeButtonText(newText) {
    logDebug(`Changing button text to "${newText}"`);
    waitForElement(".css-vuljoq", (button) => {
      button.childNodes[0].innerText = newText;
      logDebug(`Button text changed`);
    });
  }
  function changeBnggText(newText) {
    logDebug(`Changing BNGG text to "${newText}"`);
    waitForElement(".css-inwm4l", (bnggText) => {
      bnggText.childNodes[0].textContent = newText;
      logDebug(`BNGG text changed in .css-inwm4l`);
    });
    waitForElement(".css-1dd18ox", (bnggText) => {
      bnggText.childNodes[0].textContent = newText;
      logDebug(`BNGG text changed in .css-1dd18ox`);
    });
  }
  function changeLoadingText(newText) {
    logDebug(`Changing loading text to "${newText}"`);
    for (let i = 0; i < 23; i++) {
      waitForElement(`.msg${i}`, (loadingText) => {
        loadingText.childNodes[0].textContent = newText;
        logDebug(`Loading text changed in .msg${i}`);
      });
    }
  }
  function removeGarbageButtons() {
    logDebug(`Removing garbage buttons`);
    elementsToRemove.forEach((a) => {
      waitForElement(a, (wow) => {
        wow.remove();
        logDebug(`Removed element: ${a}`);
      });
    });
  }

  // src/toastify.js
  function loadToastifyAssets(cssUrl, jsUrl, callback) {
    logDebug(`Loading Toastify assets`);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssUrl;
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = jsUrl;
    script.onload = () => {
      logDebug(`Toastify JS loaded`);
      if (typeof callback === "function") callback();
    };
    document.body.appendChild(script);
  }
  function showUnlockToasts() {
    Toastify({
      text: "Join Recte.cc/invite For Updates & More (You Really Should)",
      gravity: "top",
      position: "left",
      backgroundColor: "#1e1e2e",
      stopOnFocus: true,
      duration: 1e4
    }).showToast();
    Toastify({
      text: "Successfully Unlocked All Cosmetics",
      gravity: "top",
      position: "right",
      backgroundColor: "#27ae60",
      stopOnFocus: true,
      duration: 1e4
    }).showToast();
  }

  // src/inventory.js
  function create_item(item_id, item_class) {
    return {
      "ItemId": item_id,
      "ItemInstanceId": "A87030AFDB36A4E4",
      "ItemClass": item_class,
      "PurchaseDate": "2025-03-05T23:45:33.867Z",
      "RemainingUses": 1,
      "CatalogVersion": "EventOrFree",
      "DisplayName": item_id,
      "UnitPrice": 0
    };
  }
  function buildInventory(charskins = [], backpacks = [], pickaxes = []) {
    let inventory = [];
    inventory.push(...backpacks.map((bp) => create_item(bp, "Backpack")));
    inventory.push(...pickaxes.map((pk) => create_item(pk, "Pickaxe")));
    inventory.push(...charskins.map((c) => create_item(c, "Player")));
    return inventory;
  }

  // src/catalog.js
  var CATALOG_URL = "https://8415a.playfabapi.com/Client/GetCatalogItems?sdk=UnitySDK-2.206.241122&engine=2022.3.62f2&platform=WebGLPlayer";
  var CATALOGS = ["Player", "Backpack", "Pickaxe", "EventOrFree", "INAPP"];
  async function fetchCatalog(sessionTicket, nativeFetch) {
    const charskins = /* @__PURE__ */ new Set();
    const backpacks = /* @__PURE__ */ new Set();
    const pickaxes = /* @__PURE__ */ new Set();
    for (const catalogVersion of CATALOGS) {
      try {
        const res = await nativeFetch(CATALOG_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Authorization": sessionTicket
          },
          body: JSON.stringify({ CatalogVersion: catalogVersion, AuthenticationContext: null })
        });
        const json = await res.json();
        for (const item of json?.data?.Catalog ?? []) {
          if (item.ItemClass === "Player") charskins.add(item.ItemId);
          else if (item.ItemClass === "Backpack") backpacks.add(item.ItemId);
          else if (item.ItemClass === "Pickaxe") pickaxes.add(item.ItemId);
        }
      } catch {
      }
    }
    return {
      charskins: [...charskins],
      backpacks: [...backpacks],
      pickaxes: [...pickaxes]
    };
  }

  // src/fetch-hook.js
  var targetUrl = "LoginWithCustomID";
  var originalFetch = window.fetch;
  function hookFetch() {
    window.fetch = async function(...args) {
      const url = args[0];
      const response = await originalFetch.apply(this, args);
      if (typeof url === "string" && url.includes(targetUrl)) {
        const clone = response.clone();
        let text = await clone.text();
        try {
          const json = JSON.parse(text);
          const sessionTicket = json?.data?.SessionTicket;
          let catalogData = {};
          if (sessionTicket) {
            try {
              catalogData = await fetchCatalog(sessionTicket, originalFetch);
            } catch {
            }
          }
          json.data.InfoResultPayload.UserInventory = buildInventory(
            catalogData.charskins,
            catalogData.backpacks,
            catalogData.pickaxes
          );
          text = JSON.stringify(json);
        } catch (e) {
        }
        showUnlockToasts();
        return new Response(text, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      }
      return response;
    };
  }

  // src/ws-hook.js
  function replaceTLVAfterHeader(packet, replacements) {
    const newBytes = [];
    const HEADERS = [[243, 2, 227, 7], [226, 3]];
    let i = 0;
    let headerFound = false;
    while (i < packet.length && !headerFound) {
      let found = false;
      for (const HEADER of HEADERS) {
        if (i + HEADER.length <= packet.length && HEADER.every((b, idx) => packet[i + idx] === b)) {
          newBytes.push(...HEADER);
          i += HEADER.length;
          headerFound = true;
          found = true;
          break;
        }
      }
      if (!found) {
        newBytes.push(packet[i]);
        i++;
      }
    }
    let nextIsValueForKey = null;
    while (i < packet.length) {
      if (packet[i] !== 7) {
        newBytes.push(packet[i]);
        i++;
        continue;
      }
      const len = packet[i + 1];
      const start = i + 2;
      const end = start + len;
      if (end > packet.length) break;
      const str = new TextDecoder("ascii").decode(packet.slice(start, end));
      if (nextIsValueForKey) {
        const key = nextIsValueForKey;
        let valueBytes = packet.slice(start, end);
        if (replacements[key]) {
          valueBytes = Uint8Array.from(replacements[key], (c) => c.charCodeAt(0));
        }
        newBytes.push(7, valueBytes.length, ...valueBytes);
        nextIsValueForKey = null;
      } else if (["skid", "BPid", "pid"].includes(str)) {
        nextIsValueForKey = str;
        newBytes.push(7, len, ...packet.slice(start, end));
      } else {
        newBytes.push(7, len, ...packet.slice(start, end));
      }
      i = end;
    }
    return new Uint8Array(newBytes);
  }
  function getcurrentcoz() {
    let currentcoz = {};
    const sskRaw = localStorage.getItem("SDK_DATA_CLOUD_CACHE_19611");
    const skidMatch = sskRaw.match(/"skid":"([^"]+)"/);
    const BPidMatch = sskRaw.match(/"BPid":"([^"]+)"/);
    const pidMatch = sskRaw.match(/"pid":"([^"]+)"/);
    if (skidMatch) currentcoz.skid = skidMatch[1];
    if (BPidMatch) currentcoz.BPid = BPidMatch[1];
    if (pidMatch) currentcoz.pid = pidMatch[1];
    return currentcoz;
  }
  function processPacket(bytes, direction) {
    if (direction === "OUTGOING") {
      return replaceTLVAfterHeader(bytes, getcurrentcoz());
    }
    return bytes;
  }
  function hookWS() {
    const OriginalWS = window.WebSocket;
    const originalSend = OriginalWS.prototype.send;
    window.WebSocket = function(url, protocols) {
      const ws = new OriginalWS(url, protocols);
      const isGame = String(url).includes("/game/");
      ws.addEventListener("message", (event) => {
        if (!isGame) return;
        if (event.data instanceof Blob) {
          const reader = new FileReader();
          reader.onload = () => processPacket(new Uint8Array(reader.result), "INCOMING");
          reader.readAsArrayBuffer(event.data);
        } else if (event.data instanceof ArrayBuffer) {
          processPacket(new Uint8Array(event.data), "INCOMING");
        }
      });
      ws.send = function(data) {
        if (isGame) {
          if (data instanceof ArrayBuffer) data = processPacket(new Uint8Array(data), "OUTGOING").buffer;
          else if (data instanceof Uint8Array) data = processPacket(data, "OUTGOING");
        }
        return originalSend.call(ws, data);
      };
      return ws;
    };
    window.WebSocket.prototype = OriginalWS.prototype;
  }

  // src/index.js
  try {
    changeButtonText("");
    changeBnggText("");
    changeLoadingText("");
    removeGarbageButtons();
  } catch {
  }
  loadToastifyAssets(
    "https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css",
    "https://cdn.jsdelivr.net/npm/toastify-js",
    () => {
    }
  );
  hookFetch();
  hookWS();
})();
