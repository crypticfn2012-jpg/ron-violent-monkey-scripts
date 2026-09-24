// ==UserScript==
// @name         Ron | Popup Blocker
// @namespace    https://ron.cool/userscripts
// @version      1.1.0
// @description  Blocks unwanted popups, window.open, and click-jacked popups
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';


  const SHOW_TOAST = true;          
  const ALLOW_USER_GESTURE = true;  
  const BLOCK_BLUR = true;          

  let lastUserGesture = 0;

  
  ['click', 'mousedown', 'keydown', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, () => {
      lastUserGesture = Date.now();
    }, true);
  });

  function isUserGesture() {
    return ALLOW_USER_GESTURE && (Date.now() - lastUserGesture < 800);
  }

  function toast(msg) {
    if (!SHOW_TOAST) return;
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 2147483647,
      background: '#111',
      color: '#fff',
      padding: '10px 16px',
      borderRadius: '8px',
      font: '14px system-ui',
      boxShadow: '0 8px 24px rgba(0,0,0,.4)',
      opacity: '0',
      transition: 'opacity .2s'
    });
    document.documentElement.appendChild(el);
    requestAnimationFrame(() => el.style.opacity = '1');
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 250);
    }, 2200);
  }


  const originalOpen = window.open;
  window.open = function (...args) {
    if (isUserGesture()) {
      return originalOpen.apply(this, args);
    }
    console.warn('[Popup Blocker] Blocked window.open →', args[0]);
    toast('Popup blocked');
    return null;
  };


  Object.defineProperty(window, 'open', {
    value: window.open,
    writable: false,
    configurable: false
  });

 
  const originalReplace = location.replace.bind(location);
  location.replace = function (url) {
    if (isUserGesture()) return originalReplace(url);
    console.warn('[Popup Blocker] Blocked location.replace →', url);
    toast('Redirect blocked');
  };

 
  if (BLOCK_BLUR) {
    window.blur = function () { /* noop */ };
  }


  document.addEventListener('click', e => {
    const a = e.target.closest('a[target="_blank"]');
    if (!a) return;

    if (!isUserGesture()) {
      e.preventDefault();
      e.stopPropagation();
      console.warn('[Popup Blocker] Blocked target=_blank link');
      toast('Popup link blocked');
    }
  }, true);


  const originalCreateElement = document.createElement.bind(document);
  document.createElement = function (tag) {
    const el = originalCreateElement(tag);
    if (tag.toLowerCase() === 'iframe') {
  
    }
    return el;
  };

  console.log('[Ron Popup Blocker] Active');
})();
