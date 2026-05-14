chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default storage structure on fresh install
    // API key starts empty — user provides their own
    chrome.storage.local.set({
      geminiApiKey: '',      // user's Gemini API key — stored here, never in code
      baseResume: '',        // extracted text from uploaded .docx
      resumeFilename: '',    // display name for the UI
      lastJD: ''             // last job description for convenience
    });
    console.log('Resume Tailor AI installed. API key will be stored in chrome.storage.local');
  }
});
