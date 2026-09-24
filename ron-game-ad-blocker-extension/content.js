(() => {
  'use strict';

  if (/^(games\.crazygames\.com|.+\.game-files\.crazygames\.com)$/i.test(location.hostname)) {
    return;
  }

  const selectors = [
    'ins.adsbygoogle',
    '.adsbygoogle',
    '[data-ad-slot]',
    '[data-ad-client]',
    '[data-ad-unit]',
    '[data-advertisement]',
    '[data-ad-container]',
    '[aria-label="advertisement" i]',
    '[aria-label="sponsored" i]',
    '[id*="google_ads" i]',
    '[id*="ad-container" i]',
    '[id*="adcontainer" i]',
    '[class*="ad-container" i]',
    '[class*="advertisement" i]',
    '[class*="ad-banner" i]',
    '[class*="ad-wrapper" i]',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="googleadservices.com"]',
    'iframe[src*="adnxs.com"]',
    'iframe[src*="amazon-adsystem.com"]',
    'iframe[src*="adsafeprotected.com"]'
  ];

  const selector = selectors.join(',');
  const touched = new WeakSet();

  function hide(el) {
    if (!(el instanceof Element) || touched.has(el)) return;
    touched.add(el);
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
  }

  function scan(root = document) {
    if (!root?.querySelectorAll) return;
    if (root instanceof Element && root.matches(selector)) hide(root);
    for (const el of root.querySelectorAll(selector)) hide(el);
  }

  function boot() {
    scan();
    if (!document.documentElement) return;

    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') hide(mutation.target);
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) scan(node);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['id', 'class', 'style', 'src', 'aria-label', 'data-ad-slot', 'data-ad-client']
    });
  }

  if (document.documentElement) boot();
  else {
    const wait = new MutationObserver(() => {
      if (!document.documentElement) return;
      wait.disconnect();
      boot();
    });
    wait.observe(document, { childList: true, subtree: true });
  }
})();