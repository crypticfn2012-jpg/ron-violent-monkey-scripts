// ==UserScript==
// @name         RON ClipTools
// @namespace    https://ron.cool/
// @version      1.0.0
// @description  RON ClipTools for BuildNow.GG
// @author       Ron
// @match        https://buildnow.gg/*
// @match        https://*.buildnow.gg/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    console.log('RON ClipTools loaded');

    const button = document.createElement('button');

    button.textContent = 'RON ClipTools';

    button.style.cssText = `
        position:fixed;
        top:20px;
        right:20px;
        z-index:2147483647;
        padding:12px 18px;
        background:#111;
        color:#35ff83;
        border:2px solid #35ff83;
        border-radius:10px;
        font:bold 14px Arial;
        cursor:pointer;
    `;

    function add() {
        if (!document.body) {
            setTimeout(add, 100);
            return;
        }

        if (!document.getElementById('ron-cliptools-test')) {
            button.id = 'ron-cliptools-test';
            document.body.appendChild(button);
        }
    }

    add();
})();
