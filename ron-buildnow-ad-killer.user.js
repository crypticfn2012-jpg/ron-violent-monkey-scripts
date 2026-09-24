// ==UserScript==
// @name         Ron | Game Ad Cleaner
// @namespace    https://ron.cool/
// @version      8.0.0
// @description  Hybrid game ad cleaner: network hooks, frame-safe filtering and DOM cleanup for supported game portals.
// @match        https://buildnow.gg/*
// @match        https://crazygames.com/*
// @match        https://*.crazygames.com/*
// @match        https://1v1.lol/*
// @match        https://www.1v1.lol/*
// @match        https://1v1lolreloaded.com/*
// @match        https://www.1v1lolreloaded.com/*
// @match        https://bloxd.io/*
// @match        https://www.bloxd.io/*
// @match        https://*.bloxd.io/*
// @run-at       document-start
// @grant        none
// @inject-into  page
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-buildnow-ad-killer.user.js
// @downloadURL  https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-buildnow-ad-killer.user.js
// ==/UserScript==

(() => {
    'use strict';

    if (window.__RON_GAME_AD_CLEANER_V8__) return;
    window.__RON_GAME_AD_CLEANER_V8__ = true;

    const hostname = location.hostname.toLowerCase();
    const isCrazyRuntime = hostname === 'games.crazygames.com' || hostname.endsWith('.game-files.crazygames.com');

    const hosts = {
        buildnow: hostname === 'buildnow.gg',
        crazygames: hostname === 'crazygames.com' || hostname.endsWith('.crazygames.com'),
        oneVOne: hostname === '1v1.lol' || hostname === 'www.1v1.lol',
        reloaded: hostname === '1v1lolreloaded.com' || hostname === 'www.1v1lolreloaded.com',
        bloxd: hostname === 'bloxd.io' || hostname === 'www.bloxd.io' || hostname.endsWith('.bloxd.io')
    };

    if (!isCrazyRuntime && !Object.values(hosts).some(Boolean)) return;

    const DEBUG = false;
    const log = (...args) => {
        if (DEBUG) console.info('[Ron | Game Ad Cleaner]', ...args);
    };

    // Ad/measurement delivery hosts observed in the supported game stacks.
    // Only requests made from supported game hosts/frames are intercepted.
    const blockedAdHosts = new Set([
        'api.adinplay.com',
        'adnxs.com',
        'adsrvr.org',
        'adsafeprotected.com',
        'amazon-adsystem.com',
        'casalemedia.com',
        'cpmstar.com',
        'criteo.com',
        'doubleclick.net',
        'googleadservices.com',
        'googlesyndication.com',
        'imasdk.googleapis.com',
        'indexww.com',
        'openx.net',
        'onetag-sys.com',
        'pubmatic.com',
        'rubiconproject.com'
    ]);

    const blockedPathRules = [
        /(^|\/)adsbygoogle(?:\.js)?(?:$|[?#])/i,
        /(^|\/)gpt\.js(?:$|[?#])/i,
        /(^|\/)cpmstar(?:\.min)?\.js(?:$|[?#])/i,
        /(^|\/)advert(?:isement|ising)?(?:[-_/]|\.)/i,
        /(^|\/)ad[-_](?:request|load|serve|server)(?:[-_/]|\.)/i
    ];

    const firstPartyBlocked = [
        { test: hosts.oneVOne, rules: [/^https?:\/\/1v1\.lol\/js\/cpmstar(?:\.min)?\.js/i] },
        { test: hosts.reloaded, rules: [/\/cpmstar(?:\.min)?\.js(?:$|[?#])/i] }
    ];

    const isBlockedHost = (host) => {
        const h = host.toLowerCase().replace(/^www\./, '');
        if (blockedAdHosts.has(h)) return true;
        for (const entry of blockedAdHosts) {
            if (h.endsWith('.' + entry)) return true;
        }
        return false;
    };

    function shouldBlockURL(input) {
        let url;
        try {
            url = new URL(typeof input === 'string' ? input : input?.url || input, location.href);
        } catch {
            return false;
        }

        if (!/^https?:$/i.test(url.protocol)) return false;
        if (isBlockedHost(url.hostname)) return true;

        for (const entry of firstPartyBlocked) {
            if (!entry.test) continue;
            if (entry.rules.some(rule => typeof rule === 'function' ? rule(url.href) : rule.test(url.href))) {
                return true;
            }
        }

        if (blockedPathRules.some(rule => rule.test(url.pathname + url.search))) {
            return hosts.buildnow || hosts.crazygames || hosts.oneVOne || hosts.reloaded || hosts.bloxd || isCrazyRuntime;
        }

        return false;
    }

    function installNetworkHooks() {
        const originalFetch = window.fetch;
        if (typeof originalFetch === 'function' && !originalFetch.__ronWrapped) {
            const wrappedFetch = function(input, init) {
                if (shouldBlockURL(input)) {
                    log('blocked fetch', typeof input === 'string' ? input : input?.url);
                    return Promise.reject(new TypeError('Blocked by Ron | Game Ad Cleaner'));
                }
                return originalFetch.call(this, input, init);
            };
            Object.defineProperty(wrappedFetch, '__ronWrapped', { value: true });
            window.fetch = wrappedFetch;
        }

        const XHR = window.XMLHttpRequest;
        if (XHR && !XHR.prototype.__ronWrapped) {
            const originalOpen = XHR.prototype.open;
            const originalSend = XHR.prototype.send;

            XHR.prototype.open = function(method, url) {
                this.__ronRonURL = String(url || '');
                return originalOpen.apply(this, arguments);
            };

            XHR.prototype.send = function(body) {
                if (shouldBlockURL(this.__ronRonURL)) {
                    log('blocked XHR', this.__ronRonURL);
                    try { this.abort(); } catch {}
                    return;
                }
                return originalSend.apply(this, arguments);
            };

            Object.defineProperty(XHR.prototype, '__ronWrapped', { value: true });
        }

        if (navigator.sendBeacon && !navigator.sendBeacon.__ronWrapped) {
            const originalBeacon = navigator.sendBeacon.bind(navigator);
            const wrappedBeacon = function(url, data) {
                if (shouldBlockURL(url)) {
                    log('blocked beacon', url);
                    return false;
                }
                return originalBeacon(url, data);
            };
            Object.defineProperty(wrappedBeacon, '__ronWrapped', { value: true });
            try { navigator.sendBeacon = wrappedBeacon; } catch {}
        }
    }

    installNetworkHooks();

    // Never mutate the DOM inside CrazyGames Unity/HTML5 runtime hosts.
    // The network layer above is still active there.
    if (isCrazyRuntime) {
        log('network-only mode on', hostname);
        return;
    }

    console.info('[Ron | Game Ad Cleaner] v8.0.0 active on ' + hostname);

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
        'iframe[src*="adsafeprotected.com"]'
    ];

    const bloxdSelectorList = [
        '[id^="bloxd-io_"][id*="leaderboard" i]',
        '[id^="bloxd-io_"][id*="skyscraper" i]',
        '[id^="bloxd-io_"][id*="banner" i]',
        '[id^="bloxd-io_"][id*="rectangle" i]',
        '[id^="bloxd-io_"][id*="interstitial" i]',
        '[id^="bloxd-io_"][id*="160x600" i]',
        '[id^="bloxd-io_"][id*="300x600" i]',
        '[id^="bloxd-io_"][id*="970x250" i]',
        '[id^="bloxd-io_"][id*="728x90" i]',
        '[id^="bloxd-io_"][id*="320x100" i]',
        '[id^="bloxd-io_"][id*="ad" i]',
        '[class*="aip-ad" i]',
        '[class*="adinplay" i]',
        '[id*="adinplay" i]'
    ];

    const selectorList = hosts.bloxd ? bloxdSelectorList : genericSelectorList;
    const selector = selectorList.join(',');
    const adName = /^(?:ad|ads|advert|advertisement|advertising|sponsor|sponsored)(?:[-_:.]|$)/i;
    const adWord = /(?:^|[-_:.])(?:ad|ads|advert|advertisement|advertising|sponsor|sponsored)(?:[-_:.]|$)/i;
    const protectedName = /(?:game|unity|webgl|canvas|play|player|content|app|iframe)/i;
    const touched = new WeakSet();

    function isElement(value) {
        return value instanceof Element;
    }

    function hasGameContent(element) {
        if (!isElement(element)) return false;
        if (element.matches('canvas,video,audio,[data-game],[data-game-container],[id*="game" i],[class*="game" i],[id*="unity" i],[class*="unity" i],[id*="webgl" i],[class*="webgl" i]')) {
            return true;
        }
        return Boolean(element.querySelector('canvas,[data-game],[data-game-container],[id*="unity" i],[class*="unity" i],[id*="webgl" i],[class*="webgl" i]'));
    }

    function looksLikeAd(element) {
        if (!isElement(element)) return false;
        if (hosts.bloxd) return element.matches(selector);
        if (element.matches(selector)) return true;

        const id = element.id || '';
        const className = typeof element.className === 'string' ? element.className : '';
        const role = element.getAttribute('role') || '';
        const aria = element.getAttribute('aria-label') || '';

        if (protectedName.test(id) || protectedName.test(className)) return false;
        if (adName.test(id) || adName.test(className)) return true;
        if (adWord.test(id) || adWord.test(className)) return true;
        if (/advertisement|sponsored/i.test(role) || /advertisement|sponsored/i.test(aria)) return true;
        return false;
    }

    function hide(element) {
        if (!isElement(element) || touched.has(element) || !looksLikeAd(element) || hasGameContent(element)) return;
        touched.add(element);
        element.style.setProperty('display', 'none', 'important');
        element.style.setProperty('visibility', 'hidden', 'important');
        element.style.setProperty('pointer-events', 'none', 'important');
    }

    function scan(root = document) {
        if (!root?.querySelectorAll) return;
        if (isElement(root)) hide(root);
        for (const element of root.querySelectorAll(selector)) hide(element);
        for (const element of root.querySelectorAll('[id],[class],[role],[aria-label]')) hide(element);
    }

    function installStyles() {
        if (document.getElementById('ron-game-ad-cleaner-style')) return;
        const style = document.createElement('style');
        style.id = 'ron-game-ad-cleaner-style';
        style.textContent = selectorList.join(',\n') + ' { display:none !important; visibility:hidden !important; pointer-events:none !important; }';
        (document.head || document.documentElement).appendChild(style);
    }

    function patchCrazyGamesSDK() {
        if (!hosts.crazygames || window.__RON_CRAZY_AD_PATCHED_V8__) return;
        const sdk = window.CrazyGames?.SDK?.ad;
        if (!sdk || typeof sdk.requestAd !== 'function') return;

        const original = sdk.requestAd;
        sdk.requestAd = function(type, callbacks = {}) {
            if (type !== 'midgame') return original.apply(this, arguments);
            if (typeof callbacks.adStarted === 'function') callbacks.adStarted();
            queueMicrotask(() => {
                if (typeof callbacks.adFinished === 'function') callbacks.adFinished();
            });
        };
        window.__RON_CRAZY_AD_PATCHED_V8__ = true;
    }

    let queued = false;
    const queueScan = () => {
        if (queued) return;
        queued = true;
        queueMicrotask(() => {
            queued = false;
            scan();
            patchCrazyGamesSDK();
        });
    };

    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes') hide(mutation.target);
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    hide(node);
                    scan(node);
                }
            }
        }
        queueScan();
    });

    function boot() {
        installStyles();
        scan();
        patchCrazyGamesSDK();
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['id','class','style','src','data-ad-slot','data-ad-client','aria-label']
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
        scan();
        patchCrazyGamesSDK();
    }, 2500);
})();