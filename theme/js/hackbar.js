'use strict';
chrome.devtools.panels.create('HackBar', 'icons/icon.png', 'theme/hackbar-panel.html', function () {
  if (chrome.runtime.lastError) console.error('[HackBar]', chrome.runtime.lastError.message);
});
