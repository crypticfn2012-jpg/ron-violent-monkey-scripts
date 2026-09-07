
// ==UserScript==
// @name         Ron | BuildNow Ad Killer
// @namespace    https://ron.cool/
// @version      5.0.0
// @description  BuildNow GG ad blocker for Violentmonkey
// @match        https://buildnow.gg/*
// @match        https://*.buildnow.gg/*
// @match        https://*.crazygames.com/*
// @match        *://*/*
// @run-at       document-start
// @grant        none
// @inject-into  page
// @noframes
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-buildnow-ad-killer.user.js
// @downloadURL  https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-buildnow-ad-killer.user.js
// ==/UserScript==

(() => {
    'use strict';

    const BUILDNOW =
        location.hostname === 'buildnow.gg' ||
        location.hostname.endsWith('.buildnow.gg');

    /*
     * ----------------------------------------------------------------------
     * CONFIG
     * ----------------------------------------------------------------------
     */

    const DEBUG = BUILDNOW;

    const log = (...args) => {
        if (DEBUG) console.log('[RON-ADK]', ...args);
    };

    /*
     * ----------------------------------------------------------------------
     * KNOWN AD DOM / URL FILTERING
     * ----------------------------------------------------------------------
     */

    const AD_HOSTS = [
        'doubleclick.net',
        'googlesyndication.com',
        'googleadservices.com',
        'googletagservices.com',
        'adnxs.com',
        'adsrvr.org',
        'amazon-adsystem.com',
        'advertising.com',
        'adform.net',
        'criteo.com',
        'criteo.net',
        'pubmatic.com',
        'rubiconproject.com',
        'openx.net',
        'smartadserver.com',
        'teads.tv',
        'taboola.com',
        'outbrain.com',
        'mgid.com',
        'moatads.com',
        '33across.com',
        'casalemedia.com',
        'indexww.com',
        'yieldmo.com',
        'media.net'
    ];

    const AD_PATHS = [
        /\/adserver(?:\/|$)/i,
        /\/adservice(?:\/|$)/i,
        /\/adsystem(?:\/|$)/i,
        /\/advertising(?:\/|$)/i,
        /\/advertisement(?:\/|$)/i,
        /\/interstitial(?:\/|$)/i,
        /\/popunder(?:\/|$)/i
    ];

    function toURL(value) {
        try {
            if (value instanceof Request) {
                return new URL(value.url);
            }

            if (value instanceof URL) {
                return value;
            }

            return new URL(String(value), location.href);
        } catch {
            return null;
        }
    }

    function isAdURL(value) {
        const url = toURL(value);

        if (!url) return false;

        const host = url.hostname.toLowerCase();

        if (
            AD_HOSTS.some(
                domain =>
                    host === domain ||
                    host.endsWith('.' + domain)
            )
        ) {
            return true;
        }

        if (
            AD_PATHS.some(regex =>
                regex.test(url.pathname)
            )
        ) {
            return true;
        }

        return false;
    }

    /*
     * ----------------------------------------------------------------------
     * CRAZYGAMES HTML5 SDK
     *
     * IMPORTANT:
     *
     * Modern CrazyGames SDK:
     *
     *   window.CrazyGames.SDK.ad
     *   .requestAd(...)
     *   .hasAdblock()
     *
     * These are promise based in the current SDK.
     * ----------------------------------------------------------------------
     */

    function makeFakeAdModule(original = null) {
        const fake = {};

        /*
         * requestAd()
         *
         * Return an adblock error instead of ever displaying the ad.
         *
         * We support both:
         *
         *   await requestAd("midgame")
         *
         * and older:
         *
         *   requestAd("midgame", callbacks)
         */

        fake.requestAd = function(type, callbacks) {
            log('Blocked CrazyGames ad:', type);

            const error = {
                code: 'adblock',
                message: 'Advertisement blocked'
            };

            /*
             * Old callback API.
             */
            if (callbacks && typeof callbacks === 'object') {
                queueMicrotask(() => {
                    try {
                        if (typeof callbacks.adError === 'function') {
                            callbacks.adError(error);
                        }
                    } catch {}
                });
            }

            /*
             * Modern Promise API.
             *
             * Rejecting here lets the game use its normal ad-error path.
             */
            return Promise.reject(error);
        };

        /*
         * Modern CrazyGames:
         *
         * await window.CrazyGames.SDK.ad.hasAdblock()
         */

        fake.hasAdblock = function() {
            log('CrazyGames hasAdblock() => true');

            return Promise.resolve(true);
        };

        /*
         * Preserve any non-ad properties from the real object.
         */

        if (original && typeof original === 'object') {
            for (const key of Reflect.ownKeys(original)) {
                if (
                    key === 'requestAd' ||
                    key === 'hasAdblock'
                ) {
                    continue;
                }

                try {
                    const descriptor =
                        Object.getOwnPropertyDescriptor(
                            original,
                            key
                        );

                    if (descriptor) {
                        Object.defineProperty(
                            fake,
                            key,
                            descriptor
                        );
                    }
                } catch {}
            }
        }

        return fake;
    }

    function patchCrazyGamesObject(cg) {
        try {
            if (
                !cg ||
                !cg.SDK ||
                !cg.SDK.ad
            ) {
                return false;
            }

            const original = cg.SDK.ad;

            /*
             * Don't repeatedly patch our own object.
             */

            if (original.__RON_ADK__) {
                return true;
            }

            const fake = makeFakeAdModule(original);

            Object.defineProperty(
                fake,
                '__RON_ADK__',
                {
                    value: true,
                    enumerable: false,
                    configurable: false
                }
            );

            /*
             * Keep SDK intact, only replace its ad module.
             */

            try {
                cg.SDK.ad = fake;
            } catch {
                try {
                    Object.defineProperty(
                        cg.SDK,
                        'ad',
                        {
                            value: fake,
                            configurable: true,
                            writable: true
                        }
                    );
                } catch {}
            }

            log('Patched window.CrazyGames.SDK.ad');

            return true;

        } catch (error) {
            log('CrazyGames patch failed:', error);
            return false;
        }
    }

    /*
     * ----------------------------------------------------------------------
     * CRAZYSDK UNITY BRIDGE
     * ----------------------------------------------------------------------
     */

    function patchCrazySDK() {
        try {
            const sdk = window.CrazySDK;

            if (!sdk) return false;

            const ad =
                sdk.Ad ||
                sdk.ad;

            if (!ad) return false;

            /*
             * Unity's CrazySDK commonly exposes:
             *
             *   CrazySDK.Ad.RequestAd(...)
             *
             * Patch whatever RequestAd exists without changing the rest
             * of the SDK.
             */

            if (
                typeof ad.RequestAd === 'function' &&
                !ad.RequestAd.__RON_ADK__
            ) {
                const blockedRequestAd = function(
                    adType,
                    adStarted,
                    adError,
                    adFinished
                ) {
                    log('Blocked CrazySDK Unity ad:', adType);

                    const error = {
                        code: 'adblock',
                        message: 'Advertisement blocked'
                    };

                    /*
                     * Unity bridge style.
                     */
                    queueMicrotask(() => {
                        try {
                            if (typeof adError === 'function') {
                                adError(error);
                            }
                        } catch {}
                    });

                    /*
                     * Some bridge versions may use promises.
                     */
                    return Promise.reject(error);
                };

                Object.defineProperty(
                    blockedRequestAd,
                    '__RON_ADK__',
                    { value: true }
                );

                try {
                    ad.RequestAd =
                        blockedRequestAd;
                } catch {
                    try {
                        Object.defineProperty(
                            ad,
                            'RequestAd',
                            {
                                value: blockedRequestAd,
                                writable: true,
                                configurable: true
                            }
                        );
                    } catch {}
                }

                log('Patched CrazySDK.Ad.RequestAd');
            }

            /*
             * Unity adblock detection.
             */

            if (
                typeof ad.HasAdblock === 'function' &&
                !ad.HasAdblock.__RON_ADK__
            ) {
                const fn = function(callback) {
                    log('CrazySDK.HasAdblock => true');

                    if (typeof callback === 'function') {
                        queueMicrotask(() => {
                            try {
                                callback(true);
                            } catch {}
                        });
                    }

                    return Promise.resolve(true);
                };

                Object.defineProperty(
                    fn,
                    '__RON_ADK__',
                    { value: true }
                );

                try {
                    ad.HasAdblock = fn;
                } catch {}
            }

            return true;

        } catch (error) {
            log('CrazySDK patch failed:', error);
            return false;
        }
    }

    /*
     * ----------------------------------------------------------------------
     * PROPERTY WATCHERS
     *
     * BuildNow can create the SDK after our script has loaded.
     *
     * Polling alone isn't enough, so we also watch assignments to the
     * important globals.
     * ----------------------------------------------------------------------
     */

    function watchGlobal(name, callback) {
        try {
            const descriptor =
                Object.getOwnPropertyDescriptor(
                    window,
                    name
                );

            /*
             * Don't touch a non-configurable property.
             */
            if (
                descriptor &&
                descriptor.configurable === false
            ) {
                return;
            }

            let value =
                descriptor &&
                'value' in descriptor
                    ? descriptor.value
                    : window[name];

            Object.defineProperty(
                window,
                name,
                {
                    configurable: true,
                    enumerable:
                        descriptor?.enumerable ?? true,

                    get() {
                        return value;
                    },

                    set(next) {
                        value = next;

                        try {
                            callback(next);
                        } catch {}

                        /*
                         * Patch immediately.
                         */
                        queueMicrotask(() => {
                            try {
                                callback(next);
                            } catch {}
                        });
                    }
                }
            );

            /*
             * Existing object.
             */
            if (value) {
                callback(value);
            }

        } catch {}
    }

    watchGlobal(
        'CrazyGames',
        patchCrazyGamesObject
    );

    watchGlobal(
        'CrazySDK',
        patchCrazySDK
    );

    /*
     * ----------------------------------------------------------------------
     * AGGRESSIVE SDK DISCOVERY
     * ----------------------------------------------------------------------
     */

    function patchEverything() {
        try {
            patchCrazyGamesObject(
                window.CrazyGames
            );
        } catch {}

        try {
            patchCrazySDK();
        } catch {}
    }

    patchEverything();

    /*
     * The Unity loader can initialise late.
     */

    let checks = 0;

    const sdkTimer = setInterval(() => {
        patchEverything();

        checks++;

        if (checks >= 240) {
            clearInterval(sdkTimer);
        }
    }, 250);

    /*
     * ----------------------------------------------------------------------
     * FETCH BLOCK
     * ----------------------------------------------------------------------
     */

    try {
        const nativeFetch = window.fetch;

        if (typeof nativeFetch === 'function') {
            window.fetch = function(input, init) {
                if (isAdURL(input)) {
                    log(
                        'Blocked fetch:',
                        String(input?.url || input)
                    );

                    return Promise.reject(
                        new TypeError(
                            'Blocked by Ron | BuildNow Ad Killer'
                        )
                    );
                }

                return nativeFetch.call(
                    this,
                    input,
                    init
                );
            };
        }
    } catch {}

    /*
     * ----------------------------------------------------------------------
     * XHR BLOCK
     * ----------------------------------------------------------------------
     */

    try {
        const nativeOpen =
            XMLHttpRequest.prototype.open;

        const nativeSend =
            XMLHttpRequest.prototype.send;

        const urls = new WeakMap();

        XMLHttpRequest.prototype.open =
            function(method, url, ...rest) {
                try {
                    urls.set(
                        this,
                        String(url)
                    );
                } catch {}

                return nativeOpen.call(
                    this,
                    method,
                    url,
                    ...rest
                );
            };

        XMLHttpRequest.prototype.send =
            function(body) {
                const url = urls.get(this);

                if (isAdURL(url)) {
                    log(
                        'Blocked XHR:',
                        url
                    );

                    try {
                        this.abort();
                    } catch {}

                    return;
                }

                return nativeSend.call(
                    this,
                    body
                );
            };
    } catch {}

    /*
     * ----------------------------------------------------------------------
     * BEACON BLOCK
     * ----------------------------------------------------------------------
     */

    try {
        if (
            typeof navigator.sendBeacon ===
            'function'
        ) {
            const nativeBeacon =
                navigator.sendBeacon.bind(
                    navigator
                );

            navigator.sendBeacon =
                function(url, data) {
                    if (isAdURL(url)) {
                        log(
                            'Blocked beacon:',
                            url
                        );

                        return true;
                    }

                    return nativeBeacon(
                        url,
                        data
                    );
                };
        }
    } catch {}

    /*
     * ----------------------------------------------------------------------
     * POPUP BLOCK
     * ----------------------------------------------------------------------
     */

    try {
        const nativeWindowOpen =
            window.open;

        window.open = function(
            url,
            target,
            features
        ) {
            if (url && isAdURL(url)) {
                log(
                    'Blocked popup:',
                    url
                );

                return null;
            }

            return nativeWindowOpen.call(
                window,
                url,
                target,
                features
            );
        };
    } catch {}

    /*
     * ----------------------------------------------------------------------
     * AD ELEMENT CLEANUP
     * ----------------------------------------------------------------------
     */

    const AD_SELECTORS = [
        '[id*="advertisement"]',
        '[id*="advertising"]',
        '[id*="interstitial"]',
        '[id*="popunder"]',
        '[id*="ad-container"]',
        '[id*="ad_container"]',
        '[id*="ad-overlay"]',
        '[id*="ad_overlay"]',

        '[class*="advertisement"]',
        '[class*="advertising"]',
        '[class*="interstitial"]',
        '[class*="popunder"]',
        '[class*="ad-container"]',
        '[class*="ad_container"]',
        '[class*="ad-overlay"]',
        '[class*="ad_overlay"]'
    ];

    function removeAds(root = document) {
        try {
            for (const selector of AD_SELECTORS) {
                let nodes;

                try {
                    nodes =
                        root.querySelectorAll(
                            selector
                        );
                } catch {
                    continue;
                }

                for (const node of nodes) {
                    /*
                     * NEVER remove the Unity canvas.
                     */

                    if (
                        node.tagName === 'CANVAS' ||
                        node.closest('canvas')
                    ) {
                        continue;
                    }

                    try {
                        node.remove();
                        log(
                            'Removed ad element'
                        );
                    } catch {}
                }
            }

            /*
             * Only remove frames whose actual URL is a
             * known ad URL.
             */

            const frames =
                root.querySelectorAll?.(
                    'iframe[src]'
                ) || [];

            for (const frame of frames) {
                if (isAdURL(frame.src)) {
                    try {
                        frame.remove();
                        log(
                            'Removed ad iframe'
                        );
                    } catch {}
                }
            }

        } catch {}
    }

    /*
     * ----------------------------------------------------------------------
     * MUTATION OBSERVER
     * ----------------------------------------------------------------------
     */

    function startObserver() {
        if (!document.documentElement) {
            setTimeout(
                startObserver,
                10
            );
            return;
        }

        try {
            const observer =
                new MutationObserver(
                    mutations => {
                        for (const mutation of mutations) {
                            for (
                                const node
                                of mutation.addedNodes
                            ) {
                                if (
                                    node instanceof Element
                                ) {
                                    removeAds(node);
                                }
                            }
                        }
                    }
                );

            observer.observe(
                document.documentElement,
                {
                    childList: true,
                    subtree: true
                }
            );

        } catch {}
    }

    startObserver();

    /*
     * ----------------------------------------------------------------------
     * CSS AD CLEANUP
     * ----------------------------------------------------------------------
     */

    function addCSS() {
        if (!document.head) {
            setTimeout(addCSS, 10);
            return;
        }

        try {
            const style =
                document.createElement(
                    'style'
                );

            style.textContent = `
                [id*="advertisement"],
                [id*="advertising"],
                [id*="interstitial"],
                [id*="popunder"],
                [id*="ad-container"],
                [id*="ad_container"],
                [id*="ad-overlay"],
                [id*="ad_overlay"],
                [class*="advertisement"],
                [class*="advertising"],
                [class*="interstitial"],
                [class*="popunder"],
                [class*="ad-container"],
                [class*="ad_container"],
                [class*="ad-overlay"],
                [class*="ad_overlay"] {
                    display: none !important;
                    visibility: hidden !important;
                    pointer-events: none !important;
                    opacity: 0 !important;
                }
            `;

            document.head.appendChild(style);

        } catch {}
    }

    addCSS();

    /*
     * ----------------------------------------------------------------------
     * INITIAL + REPEATED CLEANUP
     * ----------------------------------------------------------------------
     */

    if (
        document.readyState !==
        'loading'
    ) {
        removeAds();
    } else {
        document.addEventListener(
            'DOMContentLoaded',
            removeAds,
            { once: true }
        );
    }

    if (BUILDNOW) {
        let cleanupCount = 0;

        const cleanupTimer =
            setInterval(() => {
                patchEverything();
                removeAds();

                cleanupCount++;

                if (cleanupCount >= 180) {
                    clearInterval(
                        cleanupTimer
                    );
                }
            }, 500);

        log(
            'Ron | BuildNow Ad Killer 5.0.0 active'
        );
    }

})();

