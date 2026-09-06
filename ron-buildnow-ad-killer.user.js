
// ==UserScript==
// @name         Ron | BuildNow Ad Killer
// @namespace    https://ron.cool/
// @version      4.4.0
// @description  Lightweight ad blocker for BuildNow.GG and the web
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

    if (window.__RON_AD_BLOCKER__) return;
    window.__RON_AD_BLOCKER__ = true;

    const isBuildNow =
        location.hostname === 'buildnow.gg' ||
        location.hostname.endsWith('.buildnow.gg');

    const BLOCKED_DOMAINS = [
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
        'media.net'
    ];

    const BLOCKED_PATHS = [
        '/ads/',
        '/adserver/',
        '/adservice/',
        '/adsystem/',
        '/advertising/',
        '/advertisement/',
        '/interstitial/',
        '/popunder/'
    ];

    function getURL(value) {
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

            if (typeof value.url === 'string') {
                return value.url;
            }
        } catch {}

        return '';
    }

    function isBlocked(url) {
        const raw = getURL(url);

        if (!raw) return false;

        let parsed;

        try {
            parsed = new URL(raw, location.href);
        } catch {
            return false;
        }

        const hostname = parsed.hostname.toLowerCase();
        const path = parsed.pathname.toLowerCase();

        for (const domain of BLOCKED_DOMAINS) {
            if (
                hostname === domain ||
                hostname.endsWith('.' + domain)
            ) {
                return true;
            }
        }

        for (const blockedPath of BLOCKED_PATHS) {
            if (path.includes(blockedPath)) {
                return true;
            }
        }

        return false;
    }

    if (typeof window.fetch === 'function') {
        const originalFetch = window.fetch;

        try {
            window.fetch = function(input, init) {
                if (isBlocked(input)) {
                    console.debug(
                        '[RON] blocked fetch:',
                        getURL(input)
                    );

                    return Promise.reject(
                        new DOMException(
                            'Blocked by Ron Ad Killer',
                            'AbortError'
                        )
                    );
                }

                return originalFetch.call(
                    this,
                    input,
                    init
                );
            };
        } catch {}
    }

    if (typeof XMLHttpRequest !== 'undefined') {
        try {
            const originalOpen =
                XMLHttpRequest.prototype.open;

            const originalSend =
                XMLHttpRequest.prototype.send;

            XMLHttpRequest.prototype.open =
                function(method, url) {

                    this.__RON_BLOCKED =
                        isBlocked(url);

                    if (this.__RON_BLOCKED) {
                        console.debug(
                            '[RON] blocked XHR:',
                            getURL(url)
                        );
                    }

                    return originalOpen.apply(
                        this,
                        arguments
                    );
                };

            XMLHttpRequest.prototype.send =
                function() {

                    if (this.__RON_BLOCKED) {
                        try {
                            this.abort();
                        } catch {}

                        return;
                    }

                    return originalSend.apply(
                        this,
                        arguments
                    );
                };
        } catch {}
    }

    if (
        typeof navigator.sendBeacon === 'function'
    ) {
        try {
            const originalBeacon =
                navigator.sendBeacon.bind(navigator);

            navigator.sendBeacon =
                function(url, data) {

                    if (isBlocked(url)) {
                        console.debug(
                            '[RON] blocked beacon:',
                            getURL(url)
                        );

                        return false;
                    }

                    return originalBeacon(
                        url,
                        data
                    );
                };
        } catch {}
    }

    if (typeof window.open === 'function') {
        try {
            const originalOpen =
                window.open.bind(window);

            window.open =
                function(url, ...args) {

                    if (isBlocked(url)) {
                        console.debug(
                            '[RON] blocked popup:',
                            getURL(url)
                        );

                        return null;
                    }

                    return originalOpen(
                        url,
                        ...args
                    );
                };
        } catch {}
    }

    const AD_SELECTORS = [
        'ins.adsbygoogle',
        '.adsbygoogle',
        '[data-ad-slot]',
        '[data-ad-client]',
        '[data-ad-unit]',
        '[data-ad-format]',
        '[data-advertisement]',
        '[aria-label="advertisement" i]',
        '[aria-label="sponsored" i]'
    ];

    function removeAds(root = document) {
        if (!root.querySelectorAll) return;

        for (const selector of AD_SELECTORS) {
            try {
                root
                    .querySelectorAll(selector)
                    .forEach(element => {
                        element.remove();

                        console.debug(
                            '[RON] removed ad element'
                        );
                    });
            } catch {}
        }
    }

    function checkElement(element) {
        if (!(element instanceof Element)) {
            return;
        }

        const url =
            element.src ||
            element.href ||
            element.data ||
            '';

        if (url && isBlocked(url)) {
            console.debug(
                '[RON] removed blocked resource:',
                url
            );

            element.remove();
        }
    }

    let observer;

    try {
        observer = new MutationObserver(
            mutations => {

                for (const mutation of mutations) {

                    for (const node of mutation.addedNodes) {

                        if (
                            node.nodeType !==
                            Node.ELEMENT_NODE
                        ) {
                            continue;
                        }

                        checkElement(node);
                        removeAds(node);

                        try {
                            if (node.shadowRoot) {
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

    document.addEventListener(
        'click',
        event => {

            const link =
                event.target?.closest?.(
                    'a[href]'
                );

            if (!link) return;

            if (isBlocked(link.href)) {

                event.preventDefault();
                event.stopImmediatePropagation();

                console.debug(
                    '[RON] blocked ad link:',
                    link.href
                );
            }
        },
        true
    );

    function start() {

        removeAds();

        if (observer && document.documentElement) {

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

        const bootObserver =
            new MutationObserver(() => {

                if (!document.documentElement) {
                    return;
                }

                bootObserver.disconnect();
                start();
            });

        bootObserver.observe(
            document,
            {
                childList: true,
                subtree: true
            }
        );
    }

    if (isBuildNow) {

        setInterval(() => {
            removeAds();
        }, 1000);

        console.log(
            '%cRON%c BuildNow Ad Killer 4.3.0 ACTIVE',
            'font-weight:900;color:#8b5cf6',
            ''
        );
    }

})();

