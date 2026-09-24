// ==UserScript==
// @name         Ron | Game Ad Cleaner
// @namespace    https://ron.cool/
// @version      6.3.0
// @description  Removes common ad surfaces and ad overlays from BuildNow.gg, 1v1.LOL, Bloxd.io and supported game portals without touching game canvases or game network requests.
// @match        https://buildnow.gg/*
// @match        https://*.buildnow.gg/*
// @match        https://crazygames.com/*
// @match        https://*.crazygames.com/*
// @match        https://1v1.lol/*
// @match        https://www.1v1.lol/*
// @match        https://1v1lolreloaded.com/*
// @match        https://www.1v1lolreloaded.com/*
// @run-at       document-start
// @grant        none
// @inject-into  page
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-buildnow-ad-killer.user.js
// @downloadURL  https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-buildnow-ad-killer.user.js
// ==/UserScript==

(() => {
    'use strict';

    if (window.__RON_GAME_AD_CLEANER__) return;
    window.__RON_GAME_AD_CLEANER__ = true;

    const hostname = location.hostname.toLowerCase();
    const hosts = {
        buildnow: hostname === 'buildnow.gg' || hostname.endsWith('.buildnow.gg'),
        crazygames: hostname === 'crazygames.com' || hostname.endsWith('.crazygames.com'),
        oneVOne: hostname === '1v1.lol' || hostname === 'www.1v1.lol',
        reloaded: hostname === '1v1lolreloaded.com' || hostname === 'www.1v1lolreloaded.com'
    };

    if (!Object.values(hosts).some(Boolean)) return;

    const genericSelectorList = [
        'ins.adsbygoogle',
        '.adsbygoogle',
        '[data-ad-slot]',
        '[data-ad-client]',
        '[data-ad-unit]',
        '[data-ad-format]',
        '[data-advertisement]',
        '[data-ad-container]',
        '[data-advert]',
        '[data-testid="ad"]',
        '[data-testid="advertisement"]',
        '[aria-label="advertisement" i]',
        '[aria-label="advertisements" i]',
        '[aria-label="sponsored" i]',
        '[id*="google_ads" i]',
        '[id*="adcontainer" i]',
        '[id*="ad-container" i]',
        '[class*="ad-container" i]',
        '[class*="advert-container" i]',
        '[class*="advertisement" i]',
        '[class*="ad-banner" i]',
        '[class*="ad-wrapper" i]',
        'iframe[src*="doubleclick.net"]',
        'iframe[src*="googlesyndication.com"]',
        'iframe[src*="googleadservices.com"]',
        'iframe[src*="adnxs.com"]',
        'iframe[src*="amazon-adsystem.com"]',
        'iframe[src*="adsafeprotected.com"]',
    ];

    const selectorList = genericSelectorList;
    const selector = selectorList.join(',');
    const adName = /^(?:ad|ads|advert|advertisement|advertising|sponsor|sponsored)(?:[-_:.]|$)/i;
    const adWord = /(?:^|[-_:.])(?:ad|ads|advert|advertisement|advertising|sponsor|sponsored)(?:[-_:.]|$)/i;
    const protectedName = /(?:game|unity|webgl|canvas|play|player|content|app|iframe)/i;

    const removed = new WeakSet();
    const hidden = new WeakSet();

    function isElement(value) {
        return value instanceof Element;
    }

    function hasGameContent(element) {
        if (!isElement(element)) return false;

        if (
            element.matches(
                'canvas, video, audio, [data-game], [data-game-container], [id*="game" i], [class*="game" i], [id*="unity" i], [class*="unity" i], [id*="webgl" i], [class*="webgl" i]'
            )
        ) {
            return true;
        }

        return Boolean(
            element.querySelector(
                'canvas, [data-game], [data-game-container], [id*="game" i], [class*="game" i], [id*="unity" i], [class*="unity" i], [id*="webgl" i], [class*="webgl" i]'
            )
        );
    }

    function looksLikeAd(element) {
        if (!isElement(element)) return false;

        if (element.matches(selector)) return true;

        const id = element.id || '';
        const className = typeof element.className === 'string' ? element.className : '';
        const role = element.getAttribute('role') || '';
        const aria = element.getAttribute('aria-label') || '';

        if (protectedName.test(id) || protectedName.test(className)) {
            return false;
        }

        if (adName.test(id) || adName.test(className)) return true;
        if (adWord.test(id) || adWord.test(className)) return true;

        if (/advertisement|sponsored/i.test(role) || /advertisement|sponsored/i.test(aria)) {
            return true;
        }

        return false;
    }

    function safeHide(element) {
        if (!isElement(element) || hidden.has(element) || !looksLikeAd(element)) return;
        if (hasGameContent(element)) return;

        hidden.add(element);
        element.style.setProperty('display', 'none', 'important');
        element.style.setProperty('visibility', 'hidden', 'important');
        element.style.setProperty('pointer-events', 'none', 'important');
    }

    function safeRemove(element) {
        if (!isElement(element) || removed.has(element) || !looksLikeAd(element)) return;
        if (hasGameContent(element)) return;

        removed.add(element);
        element.remove();
    }

    function scan(root = document) {
        if (!root || !root.querySelectorAll) return;

        if (isElement(root)) {
            safeRemove(root);
        }

        for (const element of root.querySelectorAll(selector)) {
            safeRemove(element);
        }

        for (const element of root.querySelectorAll('[id], [class], [role], [aria-label]')) {
            safeRemove(element);
        }
    }

    function hideKnownAds() {
        if (!document.documentElement) return;

        for (const element of document.querySelectorAll(selector)) {
            if (!isElement(element) || hidden.has(element) || hasGameContent(element)) continue;

            hidden.add(element);
            element.style.setProperty('display', 'none', 'important');
            element.style.setProperty('visibility', 'hidden', 'important');
            element.style.setProperty('pointer-events', 'none', 'important');
        }
    }

    function installStyles() {
        if (document.getElementById('ron-game-ad-cleaner-style')) return;

        const style = document.createElement('style');
        style.id = 'ron-game-ad-cleaner-style';
        const styleSelectors = genericSelectorList;
        style.textContent = `
            ${styleSelectors.join(',\\n            ')} {
                display: none !important;
                visibility: hidden !important;
                pointer-events: none !important;
            }
        `;

        (document.head || document.documentElement).appendChild(style);
    }

    let cleanQueued = false;

    function queueClean() {
        if (cleanQueued) return;
        cleanQueued = true;

        queueMicrotask(() => {
            cleanQueued = false;
            scan();
            hideKnownAds();
        });
    }

    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    safeRemove(node);
                    scan(node);
                }
            }

            if (mutation.type === 'attributes') {
                safeRemove(mutation.target);
            }
        }

        queueClean();
    });

    function startObserver() {
        if (!document.documentElement) return false;

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['id', 'class', 'style', 'src', 'data-ad-slot', 'data-ad-client', 'aria-label']
        });

        return true;
    }

    function bypassCrazyGamesMidgameAds() {
        if (!hosts.crazygames) return;
        if (!window.CrazyGames?.SDK?.ad?.requestAd) return;
        if (window.__RON_CRAZY_AD_PATCHED__) return;

        const ad = window.CrazyGames.SDK.ad;
        const original = ad.requestAd;

        if (typeof original !== 'function') return;

        ad.requestAd = function(type, callbacks = {}) {
            if (type !== 'midgame') {
                return original.apply(this, arguments);
            }

            if (callbacks && typeof callbacks.adStarted === 'function') {
                callbacks.adStarted();
            }

            queueMicrotask(() => {
                if (callbacks && typeof callbacks.adFinished === 'function') {
                    callbacks.adFinished();
                }
            });
        };

        window.__RON_CRAZY_AD_PATCHED__ = true;
    }

    function boot() {
        installStyles();
        scan();
        hideKnownAds();
        startObserver();
        bypassCrazyGamesMidgameAds();
    }

    if (document.documentElement) {
        boot();
    } else {
        const bootObserver = new MutationObserver(() => {
            if (!document.documentElement) return;

            bootObserver.disconnect();
            boot();
        });

        bootObserver.observe(document, {
            childList: true,
            subtree: true
        });
    }

    const sdkTimer = setInterval(() => {
        bypassCrazyGamesMidgameAds();

        if (window.__RON_CRAZY_AD_PATCHED__ || !hosts.crazygames) {
            clearInterval(sdkTimer);
        }
    }, 250);

    setInterval(() => {
        scan();
        hideKnownAds();
    }, 1500);
})();
