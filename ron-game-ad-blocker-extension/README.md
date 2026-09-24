# Ron | Game Ad Blocker

This is the network-level companion to Ron | Game Ad Cleaner.

## Why this exists

The userscript can clean DOM elements and hook page JavaScript, but it cannot provide browser-level request blocking. Chrome's Manifest V3 `declarativeNetRequest` API is the layer that can block requests before the page receives them.

## Install

1. Open `edge://extensions/` or `chrome://extensions/`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the `ron-game-ad-blocker-extension` folder.
5. Keep `Ron | Game Ad Cleaner` installed in Violentmonkey for the cosmetic/frame layer.

## Design

The bundled rules target ad delivery systems verified in the supported gaming stack, including AdInPlay, CPMStar and Google ad delivery. The extension also applies cosmetic cleanup on ordinary pages.

CrazyGames game runtime hosts are intentionally excluded from DOM mutation; network blocking remains active through Declarative Net Request.

The ruleset is curated rather than pretending to be a full EasyList replacement. New game ad providers can be added as they are verified.
