
// ==UserScript==
// @name         Ron | Buildnow GG Ad killer
// @namespace    https://ron.cool/
// @version      5.1.0
// @description  Removes common advertising surfaces and skips CrazyGames midgame ads without touching game requests or controls.
// @match        https://buildnow.gg/*
// @match        https://*.buildnow.gg/*
// @match        https://crazygames.com/*
// @match        https://*.crazygames.com/*
// @run-at       document-start
// @grant        none
// @inject-into  page
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-buildnow-ad-killer.user.js
// @downloadURL  https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-buildnow-ad-killer.user.js
// ==/UserScript==

(() => {
    'use strict';

    if (window.__RON_AD_BLOCKER__) return;
    window.__RON_AD_BLOCKER__ = true;

    const hostname = location.hostname.toLowerCase();
    const isBuildNow = hostname === 'buildnow.gg' || hostname.endsWith('.buildnow.gg');
    const isCrazyGames = hostname === 'crazygames.com' || hostname.endsWith('.crazygames.com');

    if (!isBuildNow && !isCrazyGames) return;

    const AD_SELECTORS = [
        'ins.adsbygoogle',
        '.adsbygoogle',
        '[data-ad-slot]',
        '[data-ad-client]',
        '[data-ad-unit]',
        '[data-ad-format]',
        '[data-advertisement]',
        '[data-testid="ad"]',
        '[data-testid="advertisement"]',
        '[aria-label="advertisement" i]',
        '[aria-label="sponsored" i]',
        'iframe[src*="doubleclick.net"]',
        'iframe[src*="googlesyndication.com"]',
        'iframe[src*="googleadservices.com"]',
        'iframe[src*="adnxs.com"]'
    ];

    const AD_CLASS_OR_ID = /^(ad|ads|advert|advertisement|sponsor|sponsored)([-_]|$)/i;
    const removed = new WeakSet();

    function isAdElement(element) {
        if (!(element instanceof Element)) return false;
        if (element.matches(AD_SELECTORS.join(','))) return true;

        const id = element.id || '';
        const classNames = typeof element.className === 'string' ? element.className.split(/\s+/) : [];
        return AD_CLASS_OR_ID.test(id) || classNames.some(className => AD_CLASS_OR_ID.test(className));
    }

    function removeAd(element) {
        if (!isAdElement(element) || removed.has(element)) return;

        // Never remove a game surface or an ancestor that owns one.
        if (element.matches('canvas, [data-game], [id*="game" i], [class*="game" i]')) return;
        if (element.querySelector('canvas, [data-game]')) return;

        removed.add(element);
        element.remove();
    }

    function clean(root = document) {
        if (!root.querySelectorAll) return;

        for (const selector of AD_SELECTORS) {
            root.querySelectorAll(selector).forEach(removeAd);
        }

        root.querySelectorAll('[id], [class]').forEach(element => {
            if (isAdElement(element)) removeAd(element);
        });
    }

    const style = document.createElement('style');
    style.textContent = `${AD_SELECTORS.join(',')} { display: none !important; }`;
    (document.head || document.documentElement).appendChild(style);

    let scheduled = false;
    function scheduleClean() {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
            scheduled = false;
            clean();
        });
    }

    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) removeAd(node);
            }
        }
        scheduleClean();
    });

    let sdkBypassed = false;
    function bypassMidgameAds() {
        if (sdkBypassed || !window.CrazyGames?.SDK?.ad?.requestAd) return;

        const ad = window.CrazyGames.SDK.ad;
        const requestAd = ad.requestAd;
        ad.requestAd = function(type, callbacks = {}) {
            if (type !== 'midgame') return requestAd.apply(this, arguments);

            callbacks.adStarted?.();
            queueMicrotask(() => callbacks.adFinished?.());
        };
        sdkBypassed = true;
    }

    function start() {
        clean();
        bypassMidgameAds();
        if (!document.documentElement) return;
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    if (document.documentElement) {
        start();
    } else {
        const bootObserver = new MutationObserver(() => {
            if (!document.documentElement) return;
            bootObserver.disconnect();
            start();
        });
        bootObserver.observe(document, { childList: true, subtree: true });
    }

    if (isCrazyGames) {
        const sdkTimer = setInterval(() => {
            bypassMidgameAds();
            if (sdkBypassed) clearInterval(sdkTimer);
        }, 100);
    }
})();


