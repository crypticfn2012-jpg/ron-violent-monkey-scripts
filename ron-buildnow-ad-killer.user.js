// ==UserScript==
// @name         Ron | Game Ad Cleaner
// @namespace    https://ron.cool/
// @version      9.1.0
// @description  Userscript-only game ad cleaner with safe site-specific network hooks and cosmetic cleanup.
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

    if (w.__RON_GAME_AD_CLEANER_V91__) return;
    w.__RON_GAME_AD_CLEANER_V91__ = true;

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

    const supportedSite = Object.values(site).some(Boolean);

    // Only use a network hook when the request target is a verified ad-delivery host.
    // This is deliberately strict: legitimate game assets often contain words such as
    // "ad", "advert", or "slot" in filenames/paths.
    const adHosts = [
        'api.adinplay.com',
        'adinplay.com',
        'cpmstar.com',
        'doubleclick.net',
        'googlesyndication.com',
        'googleadservices.com',
        'googletagservices.com',
        'imasdk.googleapis.com',
        'adnxs.com',
        'adsrvr.org',
        'adsafeprotected.com',
        'amazon-adsystem.com',
        'criteo.com',
        'pubmatic.com',
        'rubiconproject.com',
        'openx.net',
        'onetag-sys.com',
        'indexww.com',
        'casalemedia.com'
    ];

    const exactFirstPartyAdURLs = [
        /^https?:\/\/1v1\.lol\/js\/cpmstar(?:\.min)?\.js(?:$|[?#])/i,
        /^https?:\/\/(?:www\.)?1v1lolreloaded\.com\/.*cpmstar(?:\.min)?\.js(?:$|[?#])/i
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

    function isKnownAdHost(host) {
        const h = String(host || '').toLowerCase().replace(/^www\./, '');
        return adHosts.some(base => h === base || h.endsWith('.' + base));
    }

    function isNetworkAd(value) {
        const url = toURL(value);
        if (!url || !/^https?:$/i.test(url.protocol)) return false;
        if (isKnownAdHost(url.hostname)) return true;
        return exactFirstPartyAdURLs.some(re => re.test(url.href));
    }

    // BuildNow gets NO request interception. This is the important regression fix:
    // the standalone game must be allowed to load all of its Unity assets/API files.
    const allowNetworkHooks =
        !site.buildnow &&
        (supportedSite || isCrazyRuntime);

    function installRequestHooks() {
        if (!allowNetworkHooks) return;

        try {
            const originalFetch = w.fetch;
            if (typeof originalFetch === 'function' && !originalFetch.__ron91) {
                const wrappedFetch = function(input, init) {
                    if (isNetworkAd(input)) {
                        return Promise.reject(new TypeError('[Ron] blocked ad fetch'));
                    }
                    return originalFetch.call(this, input, init);
                };
                Object.defineProperty(wrappedFetch, '__ron91', { value: true });
                w.fetch = wrappedFetch;
            }
        } catch {}

        try {
            const XHR = w.XMLHttpRequest;
            if (XHR && !XHR.prototype.__ron91) {
                const originalOpen = XHR.prototype.open;
                const originalSend = XHR.prototype.send;

                XHR.prototype.open = function(method, url) {
                    this.__ronRonURL = String(url || '');
                    return originalOpen.apply(this, arguments);
                };

                XHR.prototype.send = function() {
                    if (isNetworkAd(this.__ronRonURL)) {
                        try { this.abort(); } catch {}
                        return;
                    }
                    return originalSend.apply(this, arguments);
                };

                Object.defineProperty(XHR.prototype, '__ron91', { value: true });
            }
        } catch {}

        try {
            if (navigator.sendBeacon && !navigator.sendBeacon.__ron91) {
                const originalBeacon = navigator.sendBeacon.bind(navigator);
                const wrappedBeacon = function(url, data) {
                    if (isNetworkAd(url)) return false;
                    return originalBeacon(url, data);
                };
                Object.defineProperty(wrappedBeacon, '__ron91', { value: true });
                navigator.sendBeacon = wrappedBeacon;
            }
        } catch {}
    }

    installRequestHooks();

    // Never mutate the DOM inside CrazyGames runtime hosts.
    // That protects Unity/WebGL games while known ad-network requests are filtered.
    if (isCrazyRuntime) {
        console.info('[Ron | Game Ad Cleaner] v9.1.0 network-only mode on ' + hostname);
        return;
    }

    console.info('[Ron | Game Ad Cleaner] v9.1.0 active on ' + hostname);

    const genericSelectors = [
        'ins.adsbygoogle',
        '.adsbygoogle',
        'amp-ad',
        '[data-ad-slot]',
        '[data-ad-client]',
        '[data-ad-unit]',
        '[data-ad-format]',
        '[data-advertisement]',
        '[data-ad-container]',
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
    const touched = new WeakSet();

    function gameProtected(el) {
        if (!(el instanceof Element)) return true;

        if (el.matches(
            'canvas,video,audio,[data-game],[data-game-container],' +
            '[id*="unity" i],[class*="unity" i],[id*="webgl" i],[class*="webgl" i]'
        )) {
            return true;
        }

        return Boolean(el.querySelector(
            'canvas,[data-game],[data-game-container],[id*="unity" i],[class*="unity" i],[id*="webgl" i],[class*="webgl" i]'
        ));
    }

    function looksLikeAd(el) {
        if (!(el instanceof Element)) return false;
        if (el.matches(selector)) return true;

        // Do not use broad "contains ad" matching on BuildNow.
        // Only strong semantic names are accepted for generic supported portals.
        const id = el.id || '';
        const cls = typeof el.className === 'string' ? el.className : '';
        const role = el.getAttribute('role') || '';
        const aria = el.getAttribute('aria-label') || '';

        const strong =
            /^(?:ad|ads|advert|advertisement|advertising|sponsor|sponsored)(?:[-_:.]|$)/i;

        if (strong.test(id) || strong.test(cls)) return true;
        if (/^(?:advertisement|sponsored)$/i.test(role)) return true;
        if (/^(?:advertisement|advertisements|sponsored)$/i.test(aria)) return true;

        return false;
    }

    function hideAd(el) {
        if (!(el instanceof Element) || touched.has(el)) return;
        if (!looksLikeAd(el) || gameProtected(el)) return;

        touched.add(el);
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
        el.style.setProperty('max-height', '0', 'important');
        el.style.setProperty('min-height', '0', 'important');
        el.style.setProperty('overflow', 'hidden', 'important');
    }

    function scan(root = d) {
        if (!root?.querySelectorAll) return;

        if (root instanceof Element) hideAd(root);

        for (const el of root.querySelectorAll(selector)) hideAd(el);

        // BuildNow gets the same safe selectors, but NO broad [id],[class] scan.
        if (!site.buildnow) {
            for (const el of root.querySelectorAll('[role],[aria-label]')) hideAd(el);
        }
    }

    function installCSS() {
        if (d.getElementById('ron-game-ad-cleaner-v91-style')) return;

        const style = d.createElement('style');
        style.id = 'ron-game-ad-cleaner-v91-style';
        style.textContent =
            selectors.join(',\n') +
            ' { display:none !important; visibility:hidden !important; pointer-events:none !important; }';

        (d.head || d.documentElement)?.appendChild(style);
    }

    function patchCrazySDK() {
        if (!site.crazygames || w.__RON_CRAZY_SDK_V91__) return;

        try {
            const ad = w.CrazyGames?.SDK?.ad;
            if (!ad || typeof ad.requestAd !== 'function') return;

            const original = ad.requestAd;

            ad.requestAd = function(type, callbacks = {}) {
                if (type !== 'midgame') return original.apply(this, arguments);

                if (typeof callbacks.adStarted === 'function') callbacks.adStarted();

                queueMicrotask(() => {
                    if (typeof callbacks.adFinished === 'function') callbacks.adFinished();
                });
            };

            w.__RON_CRAZY_SDK_V91__ = true;
        } catch {}
    }

    function boot() {
        installCSS();
        scan();
        patchCrazySDK();

        if (!d.documentElement) return;

        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes') hideAd(mutation.target);

                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) scan(node);
                }
            }

            patchCrazySDK();
        });

        observer.observe(d.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                'id',
                'class',
                'style',
                'src',
                'href',
                'data',
                'data-ad-slot',
                'data-ad-client',
                'aria-label',
                'role'
            ]
        });
    }

    if (d.documentElement) {
        boot();
    } else {
        const observer = new MutationObserver(() => {
            if (!d.documentElement) return;
            observer.disconnect();
            boot();
        });

        observer.observe(d, { childList: true, subtree: true });
    }

    setInterval(() => {
        scan();
        patchCrazySDK();
    }, 2500);
})();