// ==UserScript==
// @name         Recte BuildNow Unlocker - Compatibility Edition
// @version      10.0.0
// @author       Recte.cc/invite
// @description  BuildNow page cleanup without replacing global fetch or WebSocket APIs
// @match        https://buildnow.gg/*
// @match        https://*.buildnow.gg/*
// @match        https://buildnow-gg.game-files.crazygames.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // IMPORTANT:
    // This compatibility edition deliberately does NOT replace window.fetch,
    // window.WebSocket, WebSocket.prototype.send, or other global APIs.
    // Those global hooks were the main source of conflicts with other scripts.

    const SCRIPT_ID = 'recte-unlocker-compat';
    if (document.getElementById(SCRIPT_ID)) return;

    const REMOVE_SELECTORS = [
        '.css-jyxwok',
        '.css-qeuppi',
        '.css-1g0vwi8',
        '.css-1bnqyvi'
    ];

    function removeElement(selector) {
        document.querySelectorAll(selector).forEach(el => el.remove());
    }

    function cleanPage() {
        REMOVE_SELECTORS.forEach(removeElement);
    }

    function addObserver() {
        if (!document.body) return;

        const observer = new MutationObserver(() => {
            cleanPage();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        cleanPage();
    }

    function addStatus() {
        if (!document.body || document.getElementById(SCRIPT_ID)) return;

        const status = document.createElement('div');
        status.id = SCRIPT_ID;
        status.textContent = 'Recte compatibility mode';
        status.style.cssText = [
            'position:fixed',
            'left:-99999px',
            'top:-99999px',
            'width:1px',
            'height:1px',
            'overflow:hidden',
            'pointer-events:none'
        ].join(';');

        document.body.appendChild(status);
    }

    function start() {
        addStatus();
        cleanPage();
        addObserver();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
