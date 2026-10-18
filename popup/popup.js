'use strict';
document.getElementById('panel').addEventListener('click', () => {
  chrome.tabs.query({active: true, currentWindow: true}, tabs => {
    chrome.tabs.create({url: chrome.runtime.getURL('theme/hackbar-panel.html') + (tabs[0] ? '?tab=' + tabs[0].id : '')});
    window.close();
  });
});
document.getElementById('help').addEventListener('click', () => chrome.tabs.create({url: chrome.runtime.getURL('help/help.html')}));
