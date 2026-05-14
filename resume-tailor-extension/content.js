chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'getJobDescription') return;

  try {
    const bodyText = document.body.innerText || '';

    // Keywords that typically mark the start of a job description section
    const jdMarkers = [
      'responsibilities', 'requirements', 'qualifications',
      'about the role', 'about the job', 'what you\'ll do',
      'what we\'re looking for', 'job description', 'the role',
      'your role', 'about you', 'what you will do', 'key responsibilities'
    ];

    let startIndex = -1;
    const lowerBody = bodyText.toLowerCase();

    for (const marker of jdMarkers) {
      const idx = lowerBody.indexOf(marker);
      if (idx !== -1 && (startIndex === -1 || idx < startIndex)) {
        startIndex = idx;
      }
    }

    let raw = startIndex !== -1
      ? bodyText.substring(startIndex, startIndex + 5000)
      : bodyText.substring(0, 5000);

    // Clean up whitespace
    const cleaned = raw
      .replace(/\t/g, ' ')
      .replace(/[ ]{3,}/g, '  ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    sendResponse({ success: true, jobDescription: cleaned });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }

  return true; // keep message channel open for async
});
