'use strict';

chrome.runtime.onInstalled.addListener(() => {
  console.info('[Ron | Game Ad Blocker] network rules enabled');
});

chrome.runtime.onStartup.addListener(() => {
  console.info('[Ron | Game Ad Blocker] started');
});

// Available for unpacked/developer-mode builds because the manifest includes
// declarativeNetRequestFeedback. This gives us a real confirmation in the
// extension service-worker console whenever one of our network rules fires.
if (chrome.declarativeNetRequest?.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(details => {
    console.info(
      '[Ron | Game Ad Blocker] blocked',
      details.rule?.ruleId,
      details.request?.url
    );
  });
}

chrome.action.onClicked.addListener(() => {
  console.info('[Ron | Game Ad Blocker] active');
});