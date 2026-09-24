// ==UserScript==
// @name         Ron | Game Ad Cleaner
// @namespace    https://ron.cool/
// @version      9.0.0
// @description  All-site game ad cleaner with frame-aware network hooks, ad script suppression and cosmetic cleanup.
// @match        http*://*/*
// @run-at       document-start
// @grant        none
// @inject-into  page
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-buildnow-ad-killer.user.js
// @downloadURL  https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-buildnow-ad-killer.user.js
// ==/UserScript==

(() => {
    'use strict';

    const w = window;
    const d = document;
    const hostname = location.hostname.toLowerCase();

    if (w.__RON_GAME_AD_CLEANER_V9__) return;
    w.__RON_GAME_AD_CLEANER_V9__ = true;

    const isCrazyRuntime =
        hostname === 'games.crazygames.com' ||
        hostname.endsWith('.game-files.crazygames.com');

    const site = {
        buildnow: hostname === 'buildnow.gg' || hostname.endsWith('.buildnow.gg'),
        crazygames: hostname === 'crazygames.com' || hostname.endsWith('.crazygames.com'),
        oneVOne: hostname === '1v1.lol' || hostname === 'www.1v1.lol',
        reloaded: hostname === '1v1lolreloaded.com' || hostname === 'www.1v1lolreloaded.com',
        bloxd: hostname === 'bloxd.io' || hostname === 'www.bloxd.io' || hostname.endsWith('.bloxd.io')
    };

    const supportedGameSite =
        site.buildnow || site.crazygames || site.oneVOne || site.reloaded || site.bloxd;

    // Ad systems/providers seen in the supported gaming stack and common web ad delivery.
    const adHosts = [
        'adinplay.com',
        'a-mo.net',
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
        'googletagservices.com',
        'indexww.com',
        'imasdk.googleapis.com',
        'openx.net',
        'onetag-sys.com',
        'pubmatic.com',
        'rubiconproject.com'
    ].map(x => x.toLowerCase());

    const adPath = [
        /(^|[\\/_.-])(ads?|advert|advertisement|advertising)([\\/_.?&=-]|$)/i,
        /(^|[\\/])adserver([\\/_.?&=-]|$)/i,
        /(^|[\\/])adservice([\\/_.?&=-]|$)/i,
        /(^|[\\/])adtag([\\/_.?&=-]|$)/i,
        /(^|[\\/])adcall([\\/_.?&=-]|$)/i,
        /(^|[\\/])prebid([\\/_.?&=-]|$)/i,
        /(^|[\\/])cpmstar(?:[\\/_.?-]|$)/i,
        /(^|[\\/])aiptag(?:[\\/_.?-]|$)/i
    ];

    const adQuery = [
        /(^|[?&])(adunit|adunitid|adslot|ad_slot|adtag|adtype|advert|advertisement|prebid)(=|&|$)/i
    ];

    function toURL(value) {
        try {
            if (value instanceof Request) return new URL(value.url, location.href);
            if (value instanceof URL) return value;
            if (typeof value === 'string') return new URL(value, location.href);
            if (value && typeof value.url === 'string') return new URL(value.url, location.href);
        } catch {}
        return null;
    }

    function hostMatchesAd(host) {
        const h = String(host || '').toLowerCase().replace(/^www\\./, '');
        return adHosts.some(base => h === base || h.endsWith('.' + base));
    }

    function isAdURL(value) {
        const url = toURL(value);
        if (!url || !/^https?:$/i.test(url.protocol)) return false;

        if (hostMatchesAd(url.hostname)) return true;

        const pathAndQuery = url.pathname + url.search;
        if (adPath.some(re => re.test(pathAndQuery))) {
            // Keep generic blocking limited to game pages/known ad frames.
            return supportedGameSite || isCrazyRuntime || hostMatchesAd(url.hostname);
        }

        return adQuery.some(re => re.test(url.search));
    }

    function blockedResourceElement(el) {
        if (!(el instanceof Element)) return false;

        const tag = el.tagName;
        if (!['SCRIPT','IFRAME','IMG','OBJECT','EMBED','VIDEO','SOURCE','LINK'].includes(tag)) return false;

        const src =
            el.getAttribute('src') ||
            el.getAttribute('data') ||
            el.getAttribute('href') ||
            el.getAttribute('data-src') ||
            el.getAttribute('data-url');

        return isAdURL(src);
    }

    // Network-layer JS hooks. These catch JS-initiated requests, not parser-level requests.
    function installRequestHooks() {
        try {
            const originalFetch = w.fetch;
            if (typeof originalFetch === 'function' && !originalFetch.__ronV9) {
                const wrappedFetch = function(input, init) {
                    if (isAdURL(input)) {
                        return Promise.reject(new TypeError('[Ron] blocked ad fetch'));
                    }
                    return originalFetch.call(this, input, init);
                };
                Object.defineProperty(wrappedFetch, '__ronV9', { value: true });
                w.fetch = wrappedFetch;
            }
        } catch {}

        try {
            const XHR = w.XMLHttpRequest;
            if (XHR && !XHR.prototype.__ronV9) {
                const open = XHR.prototype.open;
                const send = XHR.prototype.send;

                XHR.prototype.open = function(method, url) {
                    this.__ronURL = String(url || '');
                    return open.apply(this, arguments);
                };

                XHR.prototype.send = function() {
                    if (isAdURL(this.__ronURL)) {
                        try { this.abort(); } catch {}
                        return;
                    }
                    return send.apply(this, arguments);
                };

                Object.defineProperty(XHR.prototype, '__ronV9', { value: true });
            }
        } catch {}

        try {
            if (navigator.sendBeacon && !navigator.sendBeacon.__ronV9) {
                const beacon = navigator.sendBeacon.bind(navigator);
                const wrapped = function(url, data) {
                    if (isAdURL(url)) return false;
                    return beacon(url, data);
                };
                Object.defineProperty(wrapped, '__ronV9', { value: true });
                navigator.sendBeacon = wrapped;
            }
        } catch {}
    }

    installRequestHooks();

    // Suppress dynamically inserted ad resources before they are attached to the page.
    function installInsertionHooks() {
        try {
            if (Node.prototype.appendChild.__ronV9) return;

            const appendChild = Node.prototype.appendChild;
            const insertBefore = Node.prototype.insertBefore;
            const replaceChild = Node.prototype.replaceChild;

            const guard = node => {
                if (blockedResourceElement(node)) {
                    try {
                        node.removeAttribute('src');
                        node.removeAttribute('href');
                        node.removeAttribute('data');
                    } catch {}
                    return true;
                }
                return false;
            };

            Node.prototype.appendChild = function(node) {
                if (guard(node)) return node;
                return appendChild.call(this, node);
            };

            Node.prototype.insertBefore = function(node, ref) {
                if (guard(node)) return node;
                return insertBefore.call(this, node, ref);
            };

            Node.prototype.replaceChild = function(node, old) {
                if (guard(node)) return old;
                return replaceChild.call(this, node, old);
            };

            Object.defineProperty(Node.prototype.appendChild, '__ronV9', { value: true });
        } catch {}
    }

    installInsertionHooks();

    // CrazyGames runtime pages are deliberately DOM-safe: don't touch Unity/game DOM.
    // The network + insertion hooks are still active in the nested frame.
    if (isCrazyRuntime) {
        console.info('[Ron | Game Ad Cleaner] v9.0.0 network mode on ' + hostname);
        return;
    }

    const genericSelectors = [
        'ins.adsbygoogle',
        '.adsbygoogle',
        'amp-ad',
        'amp-embed[type="taboola"]',
        '[data-ad-slot]',
        '[data-ad-client]',
        '[data-ad-unit]',
        '[data-ad-format]',
        '[data-advertisement]',
        '[data-ad-container]',
        '[data-adname]',
        '[data-adunit-path]',
        '[data-ad-placeholder]',
        '[data-testid="ad"]',
        '[data-testid="advertisement"]',
        '[aria-label="advertisement" i]',
        '[aria-label="advertisements" i]',
        '[aria-label="sponsored" i]',
        '[role="advertisement"]',
        '[id*="google_ads" i]',
        '[id*="adcontainer" i]',
        '[id*="ad-container" i]',
        '[id*="ad_slot" i]',
        '[id*="adslot" i]',
        '[class*="ad-container" i]',
        '[class*="advert-container" i]',
        '[class*="advertisement" i]',
        '[class*="ad-banner" i]',
        '[class*="ad-wrapper" i]',
        '[class*="ad-slot" i]',
        'iframe[src*="doubleclick.net"]',
        'iframe[src*="googlesyndication.com"]',
        'iframe[src*="googleadservices.com"]',
        'iframe[src*="adnxs.com"]',
        'iframe[src*="amazon-adsystem.com"]',
        'iframe[src*="adsafeprotected.com"]',
        'iframe[src*="adinplay.com"]',
        'iframe[src*="cpmstar.com"]'
    ];

    const bloxdSelectors = [
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

    const selectors = site.bloxd ? bloxdSelectors : genericSelectors;
    const selector = selectors.join(',');
    const processed = new WeakSet();

    function gameProtected(el) {
        if (!(el instanceof Element)) return true;

        if (el.matches('canvas,video,audio,[data-game],[data-game-container],[id*="unity" i],[class*="unity" i],[id*="webgl" i],[class*="webgl" i],[id*="game" i],[class*="game" i]')) {
            return true;
        }

        return Boolean(el.querySelector('canvas,[data-game],[data-game-container],[id*="unity" i],[class*="unity" i],[id*="webgl" i],[class*="webgl" i]'));
    }

    function looksLikeAd(el) {
        if (!(el instanceof Element)) return false;
        if (el.matches(selector)) return true;
        if (site.bloxd) return false;

        const id = el.id || '';
        const cls = typeof el.className === 'string' ? el.className : '';
        const role = el.getAttribute('role') || '';
        const aria = el.getAttribute('aria-label') || '';

        if (/(^|[-_:.])(ad|ads|advert|advertisement|advertising|sponsor|sponsored)([-_:.]|$)/i.test(id)) return true;
        if (/(^|[-_:.])(ad|ads|advert|advertisement|advertising|sponsor|sponsored)([-_:.]|$)/i.test(cls)) return true;
        if (/advertisement|sponsored/i.test(role + ' ' + aria)) return true;

        return false;
    }

    function hideAd(el) {
        if (!(el instanceof Element) || processed.has(el) || !looksLikeAd(el) || gameProtected(el)) return;
        processed.add(el);
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
        el.style.setProperty('max-height', '0', 'important');
        el.style.setProperty('min-height', '0', 'important');
        el.style.setProperty('overflow', 'hidden', 'important');
    }

    function scan(root) {
        if (!root || !root.querySelectorAll) return;

        if (root instanceof Element) hideAd(root);

        for (const el of root.querySelectorAll(selector)) {
            hideAd(el);
        }

        // Only inspect semantic ad attributes on supported game portals.
        if (supportedGameSite) {
            for (const el of root.querySelectorAll('[id],[class],[role],[aria-label]')) {
                hideAd(el);
            }
        }
    }

    function installCSS() {
        if (d.getElementById('ron-game-ad-cleaner-v9-style')) return;
        const style = d.createElement('style');
        style.id = 'ron-game-ad-cleaner-v9-style';
        style.textContent = selectors.join(',\\n') + ' { display:none !important; visibility:hidden !important; pointer-events:none !important; }';
        (d.head || d.documentElement)?.appendChild(style);
    }

    function patchCrazySDK() {
        if (!site.crazygames || w.__RON_CRAZY_SDK_V9__) return;
        try {
            const ad = w.CrazyGames?.SDK?.ad;
            if (!ad || typeof ad.requestAd !== 'function') return;

            const original = ad.requestAd;
            ad.requestAd = function(type, callbacks = {}) {
                if (type !== 'midgame') return original.apply(this, arguments);
                callbacks?.adStarted?.();
                queueMicrotask(() => callbacks?.adFinished?.());
            };

            w.__RON_CRAZY_SDK_V9__ = true;
        } catch {}
    }

    function boot() {
        installCSS();
        scan(d);
        patchCrazySDK();

        if (!d.documentElement) return;

        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes') hideAd(mutation.target);

                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (blockedResourceElement(node)) {
                            try {
                                node.removeAttribute('src');
                                node.removeAttribute('href');
                                node.removeAttribute('data');
                            } catch {}
                        }
                        scan(node);
                    }
                }
            }

            patchCrazySDK();
        });

        observer.observe(d.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['id','class','style','src','href','data','data-ad-slot','data-ad-client','aria-label','role']
        });
    }

    if (d.documentElement) boot();
    else {
        const observer = new MutationObserver(() => {
            if (!d.documentElement) return;
            observer.disconnect();
            boot();
        });
        observer.observe(d, { childList: true, subtree: true });
    }

    // Re-scan SPAs and ad slots which are inserted after route changes.
    setInterval(() => {
        scan(d);
        patchCrazySDK();
    }, 2000);
})();