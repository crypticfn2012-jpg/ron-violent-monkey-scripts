```javascript
// ==UserScript==
// @name         Ron | BuildNow Ad Killer
// @namespace    https://ron.cool/
// @version      4.5.0
// @description  Aggressive ad blocker for BuildNow.GG and other websites
// @match        https://buildnow.gg/*
// @match        https://*.buildnow.gg/*
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

    if (window.__RON_AD_KILLER__) return;
    window.__RON_AD_KILLER__ = true;

    const BUILDNOW =
        location.hostname === 'buildnow.gg' ||
        location.hostname.endsWith('.buildnow.gg');

    /*
     * ============================================================
     * NETWORK BLOCKLIST
     * ============================================================
     */

    const AD_HOSTS = new Set([
        'doubleclick.net',
        'googlesyndication.com',
        'googleadservices.com',
        'googletagservices.com',
        'adnxs.com',
        'amazon-adsystem.com',
        'adform.net',
        'criteo.com',
        'criteo.net',
        'outbrain.com',
        'taboola.com',
        'pubmatic.com',
        'rubiconproject.com',
        'openx.net',
        'moatads.com',
        'smartadserver.com',
        'teads.tv',
        'mgid.com',
        'adsrvr.org',
        'appnexus.com',
        '33across.com',
        'casalemedia.com',
        'contextweb.com',
        'indexexchange.com',
        'lijit.com',
        'sharethrough.com',
        'sonobi.com',
        'triplelift.com',
        'yieldmo.com',
        'sovrn.com',
        'media.net',
        'adroll.com',
        'revcontent.com',
        'sharethrough.com',
        'spotx.tv',
        'spotxchange.com',
        'bidvertiser.com',
        'propellerads.com',
        'popads.net',
        'popcash.net',
        'exoclick.com',
        'juicyads.com'
    ]);

    /*
     * These are URL patterns, NOT generic "contains ad".
     * This is important because BuildNow has legitimate files
     * which may contain words such as "data", "shader", etc.
     */

    const AD_URL_PATTERNS = [
        /\/ads?\//i,
        /\/ads?\./i,
        /\/adserver(?:\/|\.|$)/i,
        /\/adservice(?:\/|\.|$)/i,
        /\/adsystem(?:\/|\.|$)/i,
        /\/advertising(?:\/|\.|$)/i,
        /\/advertisement(?:\/|\.|$)/i,
        /\/interstitial(?:\/|\.|$)/i,
        /\/popunder(?:\/|\.|$)/i,
        /\/adframe(?:\/|\.|$)/i,
        /\/adunit(?:\/|\.|$)/i,
        /\/adtag(?:\/|\.|$)/i,
        /\/adrequest(?:\/|\.|$)/i,
        /\/adloader(?:\/|\.|$)/i,
        /\/admanager(?:\/|\.|$)/i,
        /[?&](?:adunit|adslot|adtag|adserver|adformat)=/i
    ];

    function urlOf(value) {
        try {
            if (!value) return '';

            if (typeof value === 'string') {
                return value;
            }

            if (value instanceof URL) {
                return value.href;
            }

            if (
                typeof Request !== 'undefined' &&
                value instanceof Request
            ) {
                return value.url;
            }

            if (value.url) {
                return String(value.url);
            }
        } catch {}

        return '';
    }

    function isAdURL(value) {
        const raw = urlOf(value);

        if (!raw) {
            return false;
        }

        let url;

        try {
            url = new URL(raw, location.href);
        } catch {
            return false;
        }

        const host = url.hostname.toLowerCase();
        const full = `${url.pathname}${url.search}`.toLowerCase();

        /*
         * Exact ad-network / subdomain check.
         */

        for (const domain of AD_HOSTS) {
            if (
                host === domain ||
                host.endsWith('.' + domain)
            ) {
                return true;
            }
        }

        /*
         * Specific ad URL patterns.
         */

        return AD_URL_PATTERNS.some(
            pattern => pattern.test(full)
        );
    }

    function blocked(type, url) {
        if (BUILDNOW || type !== 'unknown') {
            console.debug(
                `%c[RON] blocked ${type}`,
                'color:#a855f7;font-weight:bold',
                url
            );
        }
    }

    /*
     * ============================================================
     * FETCH
     * ============================================================
     */

    if (typeof window.fetch === 'function') {
        try {
            const nativeFetch = window.fetch;

            window.fetch = function(input, init) {
                const url = urlOf(input);

                if (isAdURL(url)) {
                    blocked('fetch', url);

                    return Promise.reject(
                        new DOMException(
                            'Blocked by Ron Ad Killer',
                            'AbortError'
                        )
                    );
                }

                return nativeFetch.call(
                    this,
                    input,
                    init
                );
            };
        } catch {}
    }

    /*
     * ============================================================
     * XHR
     * ============================================================
     */

    if (
        typeof XMLHttpRequest !== 'undefined'
    ) {
        try {
            const nativeOpen =
                XMLHttpRequest.prototype.open;

            const nativeSend =
                XMLHttpRequest.prototype.send;

            XMLHttpRequest.prototype.open =
                function(method, url) {
                    this.__RON_AD_BLOCKED__ =
                        isAdURL(url);

                    if (
                        this.__RON_AD_BLOCKED__
                    ) {
                        blocked(
                            'XHR',
                            urlOf(url)
                        );
                    }

                    return nativeOpen.apply(
                        this,
                        arguments
                    );
                };

            XMLHttpRequest.prototype.send =
                function() {
                    if (
                        this.__RON_AD_BLOCKED__
                    ) {
                        try {
                            this.abort();
                        } catch {}

                        return;
                    }

                    return nativeSend.apply(
                        this,
                        arguments
                    );
                };
        } catch {}
    }

    /*
     * ============================================================
     * SEND BEACON
     * ============================================================
     */

    if (
        typeof navigator.sendBeacon ===
        'function'
    ) {
        try {
            const nativeBeacon =
                navigator.sendBeacon.bind(
                    navigator
                );

            navigator.sendBeacon =
                function(url, data) {
                    if (isAdURL(url)) {
                        blocked(
                            'beacon',
                            urlOf(url)
                        );

                        return false;
                    }

                    return nativeBeacon(
                        url,
                        data
                    );
                };
        } catch {}
    }

    /*
     * ============================================================
     * POPUPS
     * ============================================================
     */

    if (typeof window.open === 'function') {
        try {
            const nativeOpen =
                window.open.bind(window);

            window.open =
                function(url, ...args) {
                    if (isAdURL(url)) {
                        blocked(
                            'popup',
                            urlOf(url)
                        );

                        return null;
                    }

                    return nativeOpen(
                        url,
                        ...args
                    );
                };
        } catch {}
    }

    /*
     * ============================================================
     * LOCATION REDIRECT PROTECTION
     * ============================================================
     */

    document.addEventListener(
        'click',
        event => {
            const link =
                event.target?.closest?.(
                    'a[href]'
                );

            if (!link) return;

            if (isAdURL(link.href)) {
                event.preventDefault();
                event.stopImmediatePropagation();

                blocked(
                    'link',
                    link.href
                );
            }
        },
        true
    );

    /*
     * ============================================================
     * DOM AD SELECTORS
     * ============================================================
     */

    const AD_SELECTORS = [
        'ins.adsbygoogle',
        '.adsbygoogle',
        '[data-ad-slot]',
        '[data-ad-client]',
        '[data-ad-unit]',
        '[data-ad-format]',
        '[data-advertisement]',
        '[aria-label="advertisement" i]',
        '[aria-label="sponsored" i]',

        /*
         * Explicit ad/interstitial names only.
         */

        '[id="ad-container"]',
        '[id="adcontainer"]',
        '[id="advertisement"]',
        '[id="interstitial"]',
        '[id="popunder"]',

        '[class="ad-container"]',
        '[class="adcontainer"]',
        '[class="advertisement"]',
        '[class="interstitial"]',
        '[class="popunder"]'
    ];

    function removeAds(root) {
        if (!root?.querySelectorAll) {
            return;
        }

        for (const selector of AD_SELECTORS) {
            try {
                root
                    .querySelectorAll(selector)
                    .forEach(element => {
                        blocked(
                            'element',
                            selector
                        );

                        element.remove();
                    });
            } catch {}
        }
    }

    /*
     * ============================================================
     * RESOURCE ELEMENTS
     * ============================================================
     */

    function inspectResource(element) {
        if (
            !(element instanceof Element)
        ) {
            return;
        }

        const url =
            element.src ||
            element.href ||
            element.data ||
            '';

        if (
            url &&
            isAdURL(url)
        ) {
            blocked(
                'resource',
                url
            );

            element.remove();
        }
    }

    /*
     * ============================================================
     * MUTATION OBSERVER
     * ============================================================
     */

    let observer;

    try {
        observer =
            new MutationObserver(
                mutations => {
                    for (
                        const mutation
                        of mutations
                    ) {
                        for (
                            const node
                            of mutation.addedNodes
                        ) {
                            if (
                                node.nodeType !==
                                Node.ELEMENT_NODE
                            ) {
                                continue;
                            }

                            inspectResource(node);
                            removeAds(node);

                            /*
                             * Inspect dynamically-created
                             * resources inside the node.
                             */

                            try {
                                node
                                    .querySelectorAll(
                                        'iframe,script,img,link,video,audio,source,object,embed'
                                    )
                                    .forEach(
                                        inspectResource
                                    );
                            } catch {}

                            /*
                             * Shadow DOM.
                             */

                            try {
                                if (
                                    node.shadowRoot
                                ) {
                                    removeAds(
                                        node.shadowRoot
                                    );

                                    observer.observe(
                                        node.shadowRoot,
                                        {
                                            childList: true,
                                            subtree: true
                                        }
                                    );
                                }
                            } catch {}
                        }
                    }
                }
            );
    } catch {}

    /*
     * ============================================================
     * EARLY DOM HOOK
     * ============================================================
     *
     * This catches ad elements created through JS before the
     * MutationObserver gets a chance to process them.
     */

    try {
        const nativeAppendChild =
            Node.prototype.appendChild;

        Node.prototype.appendChild =
            function(node) {
                if (
                    node instanceof Element
                ) {
                    inspectResource(node);
                    removeAds(node);

                    /*
                     * Don't stop legitimate elements.
                     * Only stop the element if it was actually
                     * identified as an ad and removed.
                     */

                    if (
                        !node.parentNode &&
                        isAdURL(
                            node.src ||
                            node.href ||
                            node.data
                        )
                    ) {
                        return node;
                    }
                }

                return nativeAppendChild.call(
                    this,
                    node
                );
            };
    } catch {}

    /*
     * ============================================================
     * CSS COSMETIC FILTER
     * ============================================================
     */

    function installCSS() {
        if (
            document.getElementById(
                'ron-ad-killer-css'
            )
        ) {
            return;
        }

        const style =
            document.createElement('style');

        style.id =
            'ron-ad-killer-css';

        style.textContent = `
            ins.adsbygoogle,
            .adsbygoogle,
            [data-ad-slot],
            [data-ad-client],
            [data-ad-unit],
            [data-ad-format],
            [data-advertisement],
            [aria-label="advertisement" i],
            [aria-label="sponsored" i],
            #ad-container,
            #adcontainer,
            #advertisement,
            #interstitial,
            #popunder,
            .ad-container,
            .adcontainer,
            .advertisement,
            .interstitial,
            .popunder {
                display: none !important;
                visibility: hidden !important;
                pointer-events: none !important;
            }
        `;

        (
            document.head ||
            document.documentElement
        )?.appendChild(style);
    }

    /*
     * ============================================================
     * STARTUP
     * ============================================================
     */

    function start() {
        installCSS();
        removeAds(document);

        if (
            observer &&
            document.documentElement
        ) {
            observer.observe(
                document.documentElement,
                {
                    childList: true,
                    subtree: true
                }
            );
        }
    }

    if (document.documentElement) {
        start();
    } else {
        const boot =
            new MutationObserver(() => {
                if (
                    !document.documentElement
                ) {
                    return;
                }

                boot.disconnect();
                start();
            });

        boot.observe(
            document,
            {
                childList: true,
                subtree: true
            }
        );
    }

    /*
     * ============================================================
     * BUILDNOW
     * ============================================================
     */

    if (BUILDNOW) {
        setInterval(() => {
            removeAds(document);
            installCSS();
        }, 750);

        console.log(
            '%cRON%c BuildNow Ad Killer 4.4.0 ACTIVE',
            'font-weight:900;color:#8b5cf6',
            ''
        );
    }
})();
```
