// ==UserScript==
// @name         Ron | Bloxd Ad Cleaner
// @namespace    https://roncool.cc.cd/
// @version      1.0.1
// @description  Deprecated compatibility stub. Bloxd cleaning is now included in Ron | Game Ad Cleaner.
// @match        https://bloxd.io/*
// @match        https://www.bloxd.io/*
// @match        https://*.bloxd.io/*
// @run-at       document-start
// @grant        none
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-bloxd-ad-cleaner.user.js
// @downloadURL  https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-bloxd-ad-cleaner.user.js
// ==/UserScript==

(() => {
    'use strict';
    console.info('[Ron | Bloxd Ad Cleaner] Deprecated — Bloxd cleaning is now included in Ron | Game Ad Cleaner v7.0.0');
    return;

    if (window.__RON_BLOXD_AD_CLEANER__) return;
    window.__RON_BLOXD_AD_CLEANER__ = true;

    const selector = [
        '[id^="bloxd-io_"][id*="leaderboard" i]',
        '[id^="bloxd-io_"][id*="skyscraper" i]',
        '[id^="bloxd-io_"][id*="banner" i]',
        '[id^="bloxd-io_"][id*="rectangle" i]',
        '[id^="bloxd-io_"][id*="interstitial" i]',
        '[id*="aip" i][id*="ad" i]',
        '[class*="aip-ad" i]',
        '[class*="adinplay" i]',
        '[id*="adinplay" i]'
    ].join(',');

    const style = document.createElement('style');
    style.id = 'ron-bloxd-ad-cleaner-style';
    style.textContent = selector.split(',').map(s => `${s} {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
    }`).join('\n');
    
    function install() {
        if (!document.documentElement) return;
        if (!document.getElementById(style.id)) {
            (document.head || document.documentElement).appendChild(style);
        }
    }

    function clean(root = document) {
        if (!root || !root.querySelectorAll) return;
        try {
            for (const el of root.querySelectorAll(selector)) {
                el.style.setProperty('display', 'none', 'important');
                el.style.setProperty('visibility', 'hidden', 'important');
                el.style.setProperty('pointer-events', 'none', 'important');
            }
        } catch {}
    }

    const observer = new MutationObserver(mutations => {
        install();
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                try {
                    if (node.matches?.(selector)) {
                        node.style.setProperty('display', 'none', 'important');
                        node.style.setProperty('visibility', 'hidden', 'important');
                        node.style.setProperty('pointer-events', 'none', 'important');
                    }
                    clean(node);
                } catch {}
            }
        }
    });

    function boot() {
        install();
        clean();
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['id', 'class', 'style']
        });
    }

    if (document.documentElement) boot();
    else {
        const wait = new MutationObserver(() => {
            if (!document.documentElement) return;
            wait.disconnect();
            boot();
        });
        wait.observe(document, { childList: true, subtree: true });
    }

    setInterval(() => {
        install();
        clean();
    }, 1500);
})();