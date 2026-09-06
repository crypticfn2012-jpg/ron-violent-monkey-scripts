// ==UserScript==
// @name         Ron | BuildNow Ad Killer
// @namespace    https://ron.cool/
// @version      4.3.0
// @description  Aggressive ad, popup, tracking and injected-ad blocker for BuildNow.GG and other websites
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

    const IS_BUILDNOW =
        location.hostname === 'buildnow.gg' ||
        location.hostname.endsWith('.buildnow.gg');

    const BLOCKED_HOSTS = new Set([
        'doubleclick.net',
        'googlesyndication.com',
        'googleadservices.com',
        'googletagservices.com',
        'googletagmanager.com',
        'google-analytics.com',
        'analytics.google.com',
        'adservice.google.com',

        'amazon-adsystem.com',
        'aax.amazon-adsystem.com',

        'bat.bing.com',

        'an.facebook.com',
        'connect.facebook.net',

        'adnxs.com',
        'adsrvr.org',
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
        '33across.com',
        'appnexus.com',
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

        'unityads.unity3d.com',
        'ads.unity.com',
        'unity3d.com',

        'berht-shv.com',
        'studiowatersolutions.com'
    ]);

    const BLOCKED_URL_PARTS = [
        '/ads/',
        '/ads.',
        '/ad/',
        '/ad.',
        '/advert/',
        '/advertising/',
        '/advertisement/',
        '/adserver/',
        '/adservice/',
        '/adsystem/',
        '/adframe/',
        '/adiframe/',
        '/adtag/',
        '/adunit/',
        '/adloader/',
        '/admanager/',
        '/adrequest/',
        '/adrequest.',
        '/adcall/',
        '/adcall.',
        'googlesyndication',
        'doubleclick',
        'googleadservices',
        'amazon-adsystem',
        'adserver',
        'adservice',
        'adsystem',
        'advertising',
        'advertisement',
        'interstitial',
        'popunder',
        'pop-up-ad',
        'popup-ad'
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

            if (typeof Request !== 'undefined' && value instanceof Request) {
                return value.url;
            }

            if (typeof value === 'object' && value.url) {
                return String(value.url);
            }

            return '';
        } catch {
            return '';
        }
    }

    function isBlockedURL(value) {
        const raw = getURL(value);

        if (!raw) {
            return false;
        }

        let url;

        try {
            url = new URL(raw, location.href);
        } catch {
            return false;
        }

        const hostname = url.hostname.toLowerCase();
        const path = url.pathname.toLowerCase();
        const search = url.search.toLowerCase();

        for (const host of BLOCKED_HOSTS) {
            if (
                hostname === host ||
                hostname.endsWith('.' + host)
            ) {
                return true;
            }
        }

        const combined = `${path}${search}`;

        for (const part of BLOCKED_URL_PARTS) {
            if (combined.includes(part)) {
                return true;
            }
        }

        const adParams = [
            'adunit',
            'ad_unit',
            'adslot',
            'ad_slot',
            'adtag',
            'ad_tag',
            'adserver',
            'adformat',
            'ad_format',
            'advertiser',
            'interstitial'
        ];

        for (const param of adParams) {
            if (
                search.includes(`?${param}=`) ||
                search.includes(`&${param}=`)
            ) {
                return true;
            }
        }

        return false;
    }

    let blockedCount = 0;

    function blockedLog(type, url) {
        blockedCount++;

        if (IS_BUILDNOW) {
            console.debug(
                `[RON] blocked ${type}:`,
                url
            );
        }
    }

    const nativeFetch = window.fetch;

    if (typeof nativeFetch === 'function') {
        try {
            window.fetch = function(input, init) {
                if (isBlockedURL(input)) {
                    blockedLog('fetch', getURL(input));

                    return Promise.reject(
                        new DOMException(
                            'Blocked by Ron | BuildNow Ad Killer',
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

    if (typeof XMLHttpRequest !== 'undefined') {
        try {
            const nativeOpen =
                XMLHttpRequest.prototype.open;

            const nativeSend =
                XMLHttpRequest.prototype.send;

            XMLHttpRequest.prototype.open =
                function(method, url) {
                    this.__RON_BLOCKED =
                        isBlockedURL(url);

                    if (this.__RON_BLOCKED) {
                        blockedLog(
                            'XHR',
                            getURL(url)
                        );
                    }

                    return nativeOpen.apply(
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

                    return nativeSend.apply(
                        this,
                        arguments
                    );
                };
        } catch {}
    }

    if (
        navigator.sendBeacon &&
        typeof navigator.sendBeacon === 'function'
    ) {
        try {
            const nativeBeacon =
                navigator.sendBeacon.bind(navigator);

            navigator.sendBeacon =
                function(url, data) {
                    if (isBlockedURL(url)) {
                        blockedLog(
                            'beacon',
                            getURL(url)
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

    if (typeof window.open === 'function') {
        try {
            const nativeOpen =
                window.open.bind(window);

            window.open =
                function(url, ...args) {
                    if (isBlockedURL(url)) {
                        blockedLog(
                            'popup',
                            getURL(url)
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

    document.addEventListener(
        'click',
        event => {
            const target =
                event.target?.closest?.(
                    'a[href]'
                );

            if (!target) return;

            if (isBlockedURL(target.href)) {
                event.preventDefault();
                event.stopImmediatePropagation();

                blockedLog(
                    'link',
                    target.href
                );
            }
        },
        true
    );

    function elementURL(element) {
        if (!element) return '';

        return (
            element.src ||
            element.href ||
            element.data ||
            element.action ||
            element.getAttribute?.('src') ||
            element.getAttribute?.('href') ||
            ''
        );
    }

    const AD_SELECTORS = [
        'ins.adsbygoogle',
        '.adsbygoogle',

        '[data-ad-slot]',
        '[data-ad-client]',
        '[data-ad-unit]',
        '[data-ad-format]',
        '[data-advertisement]',

        '[id="ad"]',
        '[id^="ad-"]',
        '[id^="ad_"]',
        '[id*="-ad-"]',
        '[id*="_ad_"]',
        '[id*="ad-container" i]',
        '[id*="adcontainer" i]',
        '[id*="advertisement" i]',
        '[id*="interstitial" i]',
        '[id*="popunder" i]',

        '[class="ad"]',
        '[class^="ad-"]',
        '[class^="ad_"]',
        '[class*="-ad-"]',
        '[class*="_ad_"]',
        '[class*="ad-container" i]',
        '[class*="adcontainer" i]',
        '[class*="advertisement" i]',
        '[class*="interstitial" i]',
        '[class*="popunder" i]',

        '[aria-label*="advertisement" i]',
        '[aria-label*="sponsored" i]'
    ];

    const RESOURCE_ELEMENTS = [
        'iframe',
        'script',
        'img',
        'link',
        'video',
        'audio',
        'source',
        'embed',
        'object'
    ];

    function removeElement(element) {
        if (!element || !element.parentNode) {
            return;
        }

        try {
            element.remove();
        } catch {
            try {
                element.parentNode.removeChild(
                    element
                );
            } catch {}
        }
    }

    function cleanElement(element) {
        if (!element || element.nodeType !== 1) {
            return;
        }

        const url = elementURL(element);

        if (
            url &&
            isBlockedURL(url)
        ) {
            blockedLog(
                'resource',
                url
            );

            removeElement(element);
            return;
        }

        for (const selector of AD_SELECTORS) {
            try {
                if (element.matches(selector)) {
                    blockedLog(
                        'element',
                        selector
                    );

                    removeElement(element);
                    return;
                }
            } catch {}
        }
    }

    function cleanTree(root) {
        if (!root) return;

        try {
            if (root.nodeType === 1) {
                cleanElement(root);
            }

            if (!root.querySelectorAll) {
                return;
            }

            for (const selector of AD_SELECTORS) {
                try {
                    root
                        .querySelectorAll(selector)
                        .forEach(removeElement);
                } catch {}
            }

            for (const selector of RESOURCE_ELEMENTS) {
                try {
                    root
                        .querySelectorAll(selector)
                        .forEach(element => {
                            cleanElement(element);
                        });
                } catch {}
            }
        } catch {}
    }

    function installStyle() {
        if (document.getElementById(
            'ron-ad-killer-style'
        )) {
            return;
        }

        const style =
            document.createElement('style');

        style.id =
            'ron-ad-killer-style';

        style.textContent = `
            ins.adsbygoogle,
            .adsbygoogle,
            [data-ad-slot],
            [data-ad-client],
            [data-ad-unit],
            [data-ad-format],
            [data-advertisement],
            [id="ad"],
            [id^="ad-"],
            [id^="ad_"],
            [id*="-ad-"],
            [id*="_ad_"],
            [id*="ad-container" i],
            [id*="adcontainer" i],
            [id*="advertisement" i],
            [id*="interstitial" i],
            [id*="popunder" i],
            [class="ad"],
            [class^="ad-"],
            [class^="ad_"],
            [class*="-ad-"],
            [class*="_ad_"],
            [class*="ad-container" i],
            [class*="adcontainer" i],
            [class*="advertisement" i],
            [class*="interstitial" i],
            [class*="popunder" i],
            [aria-label*="advertisement" i],
            [aria-label*="sponsored" i] {
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

    function installDOMHooks() {
        try {
            const nativeAppendChild =
                Node.prototype.appendChild;

            Node.prototype.appendChild =
                function(node) {
                    if (
                        node &&
                        node.nodeType === 1
                    ) {
                        cleanElement(node);

                        if (
                            !node.isConnected &&
                            node.parentNode === null
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

        try {
            const nativeInsertBefore =
                Node.prototype.insertBefore;

            Node.prototype.insertBefore =
                function(node, reference) {
                    if (
                        node &&
                        node.nodeType === 1
                    ) {
                        cleanElement(node);

                        if (
                            !node.isConnected &&
                            node.parentNode === null
                        ) {
                            return node;
                        }
                    }

                    return nativeInsertBefore.call(
                        this,
                        node,
                        reference
                    );
                };
        } catch {}

        try {
            const nativeReplaceChild =
                Node.prototype.replaceChild;

            Node.prototype.replaceChild =
                function(newNode, oldNode) {
                    if (
                        newNode &&
                        newNode.nodeType === 1
                    ) {
                        cleanElement(newNode);
                    }

                    return nativeReplaceChild.call(
                        this,
                        newNode,
                        oldNode
                    );
                };
        } catch {}

        try {
            const nativeAppend =
                Element.prototype.append;

            Element.prototype.append =
                function(...nodes) {
                    for (const node of nodes) {
                        if (
                            node &&
                            node.nodeType === 1
                        ) {
                            cleanElement(node);
                        }
                    }

                    return nativeAppend.apply(
                        this,
                        nodes
                    );
                };
        } catch {}

        try {
            const nativePrepend =
                Element.prototype.prepend;

            Element.prototype.prepend =
                function(...nodes) {
                    for (const node of nodes) {
                        if (
                            node &&
                            node.nodeType === 1
                        ) {
                            cleanElement(node);
                        }
                    }

                    return nativePrepend.apply(
                        this,
                        nodes
                    );
                };
        } catch {}
    }

    function installAttributeHook() {
        try {
            const nativeSetAttribute =
                Element.prototype.setAttribute;

            Element.prototype.setAttribute =
                function(name, value) {
                    const attribute =
                        String(name).toLowerCase();

                    if (
                        attribute === 'src' ||
                        attribute === 'href' ||
                        attribute === 'data' ||
                        attribute === 'action'
                    ) {
                        if (
                            isBlockedURL(value)
                        ) {
                            blockedLog(
                                'attribute',
                                value
                            );

                            return;
                        }
                    }

                    return nativeSetAttribute.call(
                        this,
                        name,
                        value
                    );
                };
        } catch {}
    }

    let observer;

    try {
        observer =
            new MutationObserver(
                mutations => {
                    for (const mutation of mutations) {
                        for (
                            const node
                            of mutation.addedNodes
                        ) {
                            if (
                                node.nodeType !== 1
                            ) {
                                continue;
                            }

                            cleanTree(node);

                            try {
                                if (
                                    node.shadowRoot
                                ) {
                                    cleanTree(
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
    } catch {
        observer = null;
    }

    function start() {
        installStyle();
        installDOMHooks();
        installAttributeHook();

        if (
            observer &&
            document.documentElement
        ) {
            try {
                observer.observe(
                    document.documentElement,
                    {
                        childList: true,
                        subtree: true
                    }
                );
            } catch {}
        }

        cleanTree(document);
    }

    if (document.documentElement) {
        start();
    } else {
        const bootObserver =
            new MutationObserver(() => {
                if (
                    document.documentElement
                ) {
                    bootObserver.disconnect();
                    start();
                }
            });

        bootObserver.observe(
            document,
            {
                childList: true,
                subtree: true
            }
        );
    }

    if (IS_BUILDNOW) {
        setInterval(() => {
            cleanTree(document);
            installStyle();
        }, 750);

        console.log(
            '%cRON%c BuildNow Ad Killer 4.3.0 active',
            'font-weight:900;color:#8b5cf6',
            ''
        );

        Object.defineProperty(
            window,
            '__RON_AD_STATS__',
            {
                configurable: false,
                get() {
                    return {
                        active: true,
                        buildNow: true,
                        blocked: blockedCount
                    };
                }
            }
        );
    }
})();
