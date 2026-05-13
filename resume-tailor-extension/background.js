// background.js

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['apiKey', 'baseResume', 'resumeFilename', 'lastJD'], (result) => {
    const defaults = {};
    if (result.apiKey === undefined) defaults.apiKey = "";
    if (result.baseResume === undefined) defaults.baseResume = "";
    if (result.resumeFilename === undefined) defaults.resumeFilename = "";
    if (result.lastJD === undefined) defaults.lastJD = "";
    
    if (Object.keys(defaults).length > 0) {
      chrome.storage.local.set(defaults);
    }
  });
  
  console.log("Resume Tailor AI installed");
});
