// popup.js

if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.min.js');
}

document.addEventListener('DOMContentLoaded', () => {
  const elements = {
    resumeUpload: document.getElementById('resume-upload'),
    fileName: document.getElementById('file-name'),
    fileStats: document.getElementById('file-stats'),
    apiKey: document.getElementById('api-key'),
    toggleKeyBtn: document.getElementById('toggle-key'),
    jobDescription: document.getElementById('job-description'),
    autoScrapeBtn: document.getElementById('auto-scrape'),
    tailorBtn: document.getElementById('tailor-btn'),
    statusBar: document.getElementById('status-bar'),
    outputSection: document.getElementById('output-section'),
    outputText: document.getElementById('output-text'),
    downloadBtn: document.getElementById('download-btn'),
    copyBtn: document.getElementById('copy-btn')
  };

  let state = {
    apiKey: '',
    baseResume: '',
    resumeFilename: '',
    lastJD: '',
    tailoredResume: ''
  };

  const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  const loadState = () => {
    chrome.storage.local.get(['apiKey', 'baseResume', 'resumeFilename', 'lastJD'], (result) => {
      if (result.apiKey) {
        state.apiKey = result.apiKey;
        elements.apiKey.value = result.apiKey;
      }
      if (result.lastJD) {
        state.lastJD = result.lastJD;
        elements.jobDescription.value = result.lastJD;
      }
      if (result.baseResume && result.resumeFilename) {
        state.baseResume = result.baseResume;
        state.resumeFilename = result.resumeFilename;
        updateFileStats(state.resumeFilename, state.baseResume.length);
      }
    });
  };

  const saveState = (updates) => {
    Object.assign(state, updates);
    chrome.storage.local.set(updates);
  };

  const updateFileStats = (filename, charCount) => {
    elements.fileName.textContent = filename;
    elements.fileStats.textContent = `${charCount.toLocaleString()} characters loaded.`;
    elements.fileStats.classList.remove('hidden');
  };

  const setStatus = (type, message) => {
    elements.statusBar.className = `status-bar ${type}`;
    elements.statusBar.innerHTML = type === 'loading' ? `⏳ ${message}` : message;
  };

  elements.apiKey.addEventListener('input', debounce((e) => {
    saveState({ apiKey: e.target.value.trim() });
  }, 500));

  elements.jobDescription.addEventListener('input', debounce((e) => {
    saveState({ lastJD: e.target.value.trim() });
  }, 500));

  elements.toggleKeyBtn.addEventListener('click', () => {
    const isPassword = elements.apiKey.type === 'password';
    elements.apiKey.type = isPassword ? 'text' : 'password';
    elements.toggleKeyBtn.textContent = isPassword ? '🙈' : '👁️';
  });

  elements.resumeUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setStatus('loading', 'Parsing resume...');
    elements.fileName.textContent = file.name;

    try {
      let text = '';
      if (file.name.toLowerCase().endsWith('.pdf')) {
        text = await extractTextFromPDF(file);
      } else if (file.name.toLowerCase().endsWith('.txt')) {
        text = await file.text();
      } else {
        throw new Error('Unsupported file type. Please upload a PDF or TXT file.');
      }

      if (!text || text.trim().length === 0) {
        throw new Error('Could not extract text from file.');
      }

      saveState({ baseResume: text.trim(), resumeFilename: file.name });
      updateFileStats(file.name, text.length);
      setStatus('success', '✅ Resume loaded successfully');
    } catch (err) {
      console.error(err);
      setStatus('error', `❌ Error parsing file: ${err.message}`);
      elements.fileName.textContent = 'Click to select PDF or TXT';
      elements.fileStats.classList.add('hidden');
    }
  });

  const extractTextFromPDF = async (file) => {
    if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF.js library not loaded. Ensure libs/pdf.min.js exists.');
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map(item => item.str);
      fullText += strings.join(' ') + '\n';
    }
    return fullText;
  };

  elements.autoScrapeBtn.addEventListener('click', () => {
    setStatus('loading', 'Scraping page for job description...');
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab || currentTab.url.startsWith('chrome://')) {
        setStatus('error', '❌ Cannot scrape on this type of page.');
        return;
      }

      chrome.tabs.sendMessage(currentTab.id, { action: "getJobDescription" }, (response) => {
        if (chrome.runtime.lastError) {
          setStatus('error', '❌ Could not connect to page. Please refresh the page or paste manually.');
          return;
        }

        if (response && response.success) {
          elements.jobDescription.value = response.jobDescription;
          saveState({ lastJD: response.jobDescription });
          setStatus('success', '✅ Job description scraped from page');
        } else {
          setStatus('error', `❌ ${response?.error || 'Failed to scrape job description.'}`);
        }
      });
    });
  });

  elements.tailorBtn.addEventListener('click', async () => {
    const apiKey = state.apiKey;
    const baseResume = state.baseResume;
    const jdText = elements.jobDescription.value.trim();

    if (!baseResume) {
      return setStatus('error', '❌ Please upload your base resume first.');
    }
    if (!apiKey) {
      return setStatus('error', '❌ Please enter your Gemini API key.');
    }
    if (!jdText) {
      return setStatus('error', '❌ Please enter or scrape a job description.');
    }

    elements.tailorBtn.disabled = true;
    setStatus('loading', 'AI is tailoring your resume...');
    elements.outputSection.classList.add('hidden');

    try {
      const prompt = `You are a world-class resume writer, ATS specialist, and career coach with 15+ years of experience helping candidates land jobs at top companies.

Your task: Rewrite the candidate's resume to perfectly match the job description provided, while keeping it 100% truthful to their actual experience.

STRICT RULES:
1. NEVER fabricate experience, skills, tools, or achievements the candidate didn't have
2. DO reframe, emphasise, and reword existing experience to align with JD keywords
3. DO reorder sections and bullet points to surface the most relevant experience first
4. DO naturally incorporate exact keywords and phrases from the JD (for ATS parsing)
5. Make it sound like a real human wrote it — no buzzword soup, no robotic phrasing
6. Use strong action verbs: Led, Built, Reduced, Increased, Designed, Automated, Shipped, etc.
7. Quantify achievements wherever the original resume had numbers — keep those exact numbers
8. Standard ATS-safe section headers: Summary, Experience, Education, Skills, Projects, Certifications
9. No tables, no columns, no graphics — plain text only (ATS cannot parse these)
10. Target length: 1 page for <5 years experience, up to 2 pages for senior candidates
11. The final output must read like a confident, specific, real person — not an AI

CANDIDATE'S CURRENT RESUME:
---
${baseResume.substring(0, 3500)}
---

JOB DESCRIPTION:
---
${jdText.substring(0, 2500)}
---

Now write the complete tailored resume. Output ONLY the resume text — no preamble, no "Here is your resume", no explanation. Start directly with the candidate's name.`;

      // Gemini 1.5 Flash free tier: 15 requests/minute, 1M tokens/day, no credit card needed
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.65,
            maxOutputTokens: 2048,
            topP: 0.9
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
            throw new Error('Rate limit hit — wait a moment and try again (Gemini free: 15 req/min)');
        }
        if (response.status === 400 && data.error && data.error.message.includes('API key')) {
             throw new Error('Invalid API key — check your Gemini key at aistudio.google.com');
        }
        throw new Error(data.error?.message || \`API Error: \${response.status}\`);
      }

      const generatedText = data.candidates[0].content.parts[0].text;
      state.tailoredResume = generatedText;
      
      elements.outputText.value = generatedText;
      elements.outputSection.classList.remove('hidden');
      setStatus('success', '✨ Resume successfully tailored!');
      
    } catch (err) {
      console.error(err);
      let errorMsg = err.message;
      if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
         errorMsg = 'Network error — check your internet connection';
      }
      setStatus('error', `❌ \${errorMsg}`);
    } finally {
      elements.tailorBtn.disabled = false;
    }
  });

  elements.downloadBtn.addEventListener('click', () => {
    if (!state.tailoredResume) return;
    
    const blob = new Blob([state.tailoredResume], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `tailored_resume_\${dateStr}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  elements.copyBtn.addEventListener('click', async () => {
    if (!state.tailoredResume) return;
    
    try {
      await navigator.clipboard.writeText(state.tailoredResume);
      const originalText = elements.copyBtn.innerHTML;
      elements.copyBtn.innerHTML = '✅ Copied!';
      setTimeout(() => {
        elements.copyBtn.innerHTML = originalText;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      setStatus('error', '❌ Failed to copy to clipboard.');
    }
  });

  loadState();
});
