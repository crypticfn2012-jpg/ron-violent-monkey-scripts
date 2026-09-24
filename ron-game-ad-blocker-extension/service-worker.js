'use strict';

chrome.runtime.onInstalled.addListener(() => {
  console.info('[Ron | Game Ad Blocker] network rules enabled');
});

chrome.runtime.onStartup.addListener(() => {
  console.info('[Ron | Game Ad Blocker] started');
});

chrome.action.onClicked.addListener(() => {
  console.info('[Ron | Game Ad Blocker] active');
});