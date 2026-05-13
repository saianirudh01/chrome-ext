// content.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getJobDescription") {
    try {
      const bodyText = document.body.innerText;
      if (!bodyText) {
         sendResponse({ success: false, error: "No text found on page." });
         return true;
      }
      
      const textToSearch = bodyText.substring(0, 8000);
      
      const keywords = [
        "responsibilities", 
        "requirements", 
        "qualifications", 
        "about the role", 
        "about the job", 
        "what you'll do", 
        "what we're looking for", 
        "job description", 
        "the role", 
        "your role"
      ];
      
      let startIndex = -1;
      const lowerText = textToSearch.toLowerCase();
      
      for (const keyword of keywords) {
        const idx = lowerText.indexOf(keyword);
        if (idx !== -1 && (startIndex === -1 || idx < startIndex)) {
          startIndex = idx;
        }
      }
      
      let rawJD = "";
      if (startIndex !== -1) {
        rawJD = textToSearch.substring(startIndex, startIndex + 5000);
      } else {
        rawJD = textToSearch.substring(0, 5000);
      }
      
      const cleanedText = rawJD.replace(/\n{3,}/g, '\n\n').trim();
      
      sendResponse({ success: true, jobDescription: cleanedText });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
  
  return true;
});
