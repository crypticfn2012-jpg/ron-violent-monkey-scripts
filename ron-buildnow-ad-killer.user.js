// ==UserScript==
// @name         Ron | BuildNow Ad Killer
// @namespace    https://ron.cool/
// @version      4.1.0
// @description  Block advertising requests, popups, and injected ad containers
// @match        https://buildnow.gg/*
// @match        https://*.buildnow.gg/*
// @match        *://*/*
// @run-at       document-start
// @grant        none
// @inject-into  page
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-buildnow-ad-killer.user.js
// @downloadURL  https://raw.githubusercontent.com/crypticfn2012-jpg/ron-violent-monkey-scripts/main/ron-buildnow-ad-killer.user.js
// ==/UserScript==

(() => {
    'use strict';

    const BLOCKED_HOSTS = new Set([
        'doubleclick.net',
        'googlesyndication.com',
        'googleadservices.com',
        'googletagservices.com',
        'googletagmanager.com',
        'adnxs.com',
        'amazon-adsystem.com',
        'adform.net',
        'criteo.com',
        'outbrain.com',
        'taboola.com',
        'pubmatic.com',
        'rubiconproject.com',
        'openx.net',
        'moatads.com',
        'smartadserver.com',
        'teads.tv',
        'mgid.com',
        'berht-shv.com',
        'studiowatersolutions.com'
    ]);

    const BLOCKED_URL_PARTS = [
        'advertisement',
        'advertising',
        'adserver',
        'adservice',
        'adsystem',
        'doubleclick',
        'googlesyndication',
        'googleadservices',
        'amazon-adsystem'
    ];

    const BLOCKED_SELECTORS = [
        'ins.adsbygoogle',
        '.adsbygoogle',
        '[data-ad-slot]',
        '[data-ad-client]',
        '[data-ad-format]',
        '[id*="ad-container" i]',
        '[id*="adcontainer" i]',
        '[id*="advertisement" i]',
        '[class*="ad-container" i]',
        '[class*="adcontainer" i]',
        '[class*="advertisement" i]',
        '[class*="interstitial" i]',
        '[id*="interstitial" i]',
        '[class*="popunder" i]',
        '[id*="popunder" i]',
        '[aria-label*="advertisement" i]',
        '[aria-label*="sponsored" i]'
    ];

    const BLOCKED_RESOURCE_SELECTORS = [
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

    function getURL(value) {
        if (!value) return '';

        try {
            if (typeof value === 'string' || value instanceof URL) {
                return String(value);
            }

            return value.url || '';
        } catch {
            return '';
        }
    }

    function blocked(url) {
        const rawURL = getURL(url);
        if (!rawURL) return false;

        let u;

        try {
            u = new URL(rawURL, location.href);
        } catch {
            return false;
        }

        const host = u.hostname.toLowerCase();
        const pathAndQuery = `${u.pathname}${u.search}`.toLowerCase();

        for (const domain of BLOCKED_HOSTS) {
            if (
                host === domain ||
                host.endsWith('.' + domain)
            ) {
                return true;
            }
        }

        return BLOCKED_URL_PARTS.some(word => pathAndQuery.includes(word));
    }

    const nativeFetch = window.fetch;

    window.fetch = function(input, init) {
        if (blocked(input)) {
            return Promise.reject(
                new DOMException(
                    'Blocked by RON ad blocker',
                    'AbortError'
                )
            );
        }

        return nativeFetch.call(this, input, init);
    };

    const xhrOpen = XMLHttpRequest.prototype.open;
    const xhrSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this.__ronBlocked = blocked(url);
        return xhrOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function() {
        if (this.__ronBlocked) {
            this.abort();
            return undefined;
        }

        return xhrSend.apply(this, arguments);
    };

    const nativeSendBeacon = navigator.sendBeacon;

    if (typeof nativeSendBeacon === 'function') {
        try {
            navigator.sendBeacon = function(url, data) {
                if (blocked(url)) return false;
                return nativeSendBeacon.call(this, url, data);
            };
        } catch {}
    }

    const nativeOpen = window.open;

    window.open = function(url, ...args) {
        if (blocked(url)) {
            console.debug(
                '[RON] blocked popup',
                url
            );

            return null;
        }

        return nativeOpen.call(
            window,
            url,
            ...args
        );
    };

    document.addEventListener('click', event => {
        const link = event.target.closest?.('a[href]');
        if (!link || !blocked(link.href)) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        console.debug('[RON] blocked link', link.href);
    }, true);

    const nativeAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
        if (blocked(this.href)) {
            console.debug('[RON] blocked scripted link', this.href);
            return;
        }

        return nativeAnchorClick.call(this);
    };

    const style = document.createElement('style');
    style.textContent = `${BLOCKED_SELECTORS.join(',\n')} { display: none !important; }`;
    (document.head || document.documentElement).appendChild(style);

    function clean(root = document) {
        if (!root.querySelectorAll) return;

        for (const selector of BLOCKED_SELECTORS) {
            try {
                if (root.matches?.(selector)) root.remove();
                root.querySelectorAll(selector)
                    .forEach(el => {
                        el.remove();
                    });
            } catch {}
        }

       
        for (const selector of BLOCKED_RESOURCE_SELECTORS) {
            if (root.matches?.(selector)) {
                const rootURL = root.src || root.href || root.data ||
                    root.getAttribute('poster');
                if (blocked(rootURL)) root.remove();
                continue;
            }

            root.querySelectorAll(selector).forEach(element => {
                try {
                    const url = element.src || element.href ||
                        element.data || element.getAttribute('poster');
                    if (blocked(url)) {
                        element.remove();
                    }
                } catch {}
            });
        }
    }

    const observer =
        new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (
                        node.nodeType !==
                        Node.ELEMENT_NODE
                    ) {
                        continue;
                    }

                    clean(node);

                    if (node.shadowRoot) {
                        clean(node.shadowRoot);
                        observer.observe(
                            node.shadowRoot,
                            {
                                childList: true,
                                subtree: true
                            }
                        );
                    }
                }
            }
        });

    function start() {
        if (!document.documentElement) {
            requestAnimationFrame(start);
            return;
        }

        observer.observe(
            document.documentElement,
            {
                childList: true,
                subtree: true
            }
        );

        clean(document);
    }

    start();

    
    if (
        location.hostname === 'buildnow.gg' ||
        location.hostname.endsWith('.buildnow.gg')
    ) {
        setInterval(
            () => clean(document),
            500
        );

        console.log(
            '%cRON%c BuildNow Ad Killer active',
            'font-weight:bold',
            ''
        );
    }

})();
