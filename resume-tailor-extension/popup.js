pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.worker.min.js');

document.addEventListener('DOMContentLoaded', () => {
  loadSavedData();
  attachEventListeners();
});

const apiKeyInput = document.getElementById('apiKeyInput');
const jdTextarea = document.getElementById('jdTextarea');
const fileInput = document.getElementById('fileInput');
const scrapeBtn = document.getElementById('scrapeBtn');
const tailorBtn = document.getElementById('tailorBtn');
const toggleKeyBtn = document.getElementById('toggleKeyBtn');
const statusBar = document.getElementById('statusBar');
const uploadZone = document.getElementById('uploadZone');
const outputSection = document.getElementById('outputSection');
const outputPreview = document.getElementById('outputPreview');
const downloadDocxBtn = document.getElementById('downloadDocxBtn');
const copyBtn = document.getElementById('copyBtn');

function loadSavedData() {
  chrome.storage.local.get(['geminiApiKey', 'baseResume', 'resumeFilename', 'lastJD'], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
    if (result.baseResume) {
      window.resumeText = result.baseResume;
      showResumeSuccess(result.resumeFilename || 'resume.docx', result.baseResume.length);
    }
    if (result.lastJD) {
      jdTextarea.value = result.lastJD;
    }
  });
}

function attachEventListeners() {
  apiKeyInput.addEventListener('input', debounce(() => {
    chrome.storage.local.set({ geminiApiKey: apiKeyInput.value.trim() });
  }, 500));

  toggleKeyBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleKeyBtn.textContent = '👁️‍🗨️'; // Use a different icon for open if desired, but 👁️ works
    } else {
      apiKeyInput.type = 'password';
      toggleKeyBtn.textContent = '👁️';
    }
  });

  jdTextarea.addEventListener('input', debounce(() => {
    chrome.storage.local.set({ lastJD: jdTextarea.value });
  }, 800));

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const isPDF  = file.name.toLowerCase().endsWith('.pdf');
    const isDOCX = file.name.toLowerCase().endsWith('.docx');

    if (!isPDF && !isDOCX) {
      setStatus('error', 'Please upload a .pdf or .docx file only');
      return;
    }

    setStatus('loading', 'Reading your resume...');

    try {
      let extractedText = '';

      if (isDOCX) {
        // --- DOCX path: mammoth.js ---
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        extractedText = result.value.trim();

      } else if (isPDF) {
        // --- PDF path: pdf.js ---
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pageTexts = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items
            .map(item => item.str)
            .join(' ');
          pageTexts.push(pageText);
        }
        extractedText = pageTexts.join('\n').trim();
      }

      if (!extractedText || extractedText.length < 50) {
        setStatus('error', 'Could not read resume content. Is the file valid?');
        return;
      }

      // Both paths converge here — identical from this point on
      window.resumeText = extractedText;
      chrome.storage.local.set({
        baseResume: extractedText,
        resumeFilename: file.name
      });

      showResumeSuccess(file.name, extractedText.length);
      setStatus('idle', '');

    } catch (err) {
      setStatus('error', 'Failed to read file: ' + err.message);
    }
  });

  scrapeBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: 'getJobDescription' },
        (response) => {
          if (chrome.runtime.lastError) {
            setStatus('error', 'Could not scrape this page. Paste the JD manually.');
            return;
          }
          if (response?.success) {
            jdTextarea.value = response.jobDescription;
            chrome.storage.local.set({ lastJD: response.jobDescription });
            setStatus('idle', '');
            jdTextarea.style.borderColor = '#16a34a';
            setTimeout(() => jdTextarea.style.borderColor = '', 2000);
          } else {
            setStatus('error', response?.error || 'Scrape failed. Paste the JD manually.');
          }
        }
      );
    });
  });

  tailorBtn.addEventListener('click', async () => {
    // --- Validation ---
    const apiKey = apiKeyInput.value.trim();
    const jd = jdTextarea.value.trim();
    const resumeText = window.resumeText || '';

    if (!apiKey) {
      setStatus('error', 'Please enter your Gemini API key');
      apiKeyInput.focus();
      return;
    }
    if (!resumeText) {
      setStatus('error', 'Please upload your resume (.docx)');
      return;
    }
    if (!jd) {
      setStatus('error', 'Please add a job description');
      jdTextarea.focus();
      return;
    }

    // --- Call Gemini ---
    setStatus('loading', 'Tailoring your resume — usually 10–15 seconds...');
    tailorBtn.disabled = true;

    const prompt = buildPrompt(resumeText, jd);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
        {
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
        }
      );

      const data = await response.json();

      if (data.error) {
        const code = data.error.code || response.status;
        const msg  = data.error.message || 'Unknown error from Gemini API';
        throw new Error(`Google API error ${code}: ${msg}`);
      }

      if (!data.candidates || !data.candidates[0]) {
        throw new Error(`Google API error: empty response — no candidates returned`);
      }

      const tailoredText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!tailoredText) throw new Error('Empty response from Gemini. Try again.');

      window.tailoredText = tailoredText;
      showOutput(tailoredText);
      setStatus('success', '✅ Your tailored resume is ready — download below');

    } catch (err) {
      if (err.message.includes('Failed to fetch')) {
        setStatus('error', 'Network error — check your internet connection');
      } else {
        setStatus('error', err.message);
      }
    } finally {
      tailorBtn.disabled = false;
    }
  });

  downloadDocxBtn.addEventListener('click', async () => {
    if (!window.tailoredText) return;
    downloadDocxBtn.disabled = true;
    downloadDocxBtn.textContent = 'Building .docx...';
    try {
      const blob = await buildDocx(window.tailoredText);
      const today = new Date().toISOString().split('T')[0];
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tailored_resume_${today}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setStatus('error', 'Failed to build .docx: ' + err.message);
    } finally {
      downloadDocxBtn.disabled = false;
      downloadDocxBtn.textContent = '📄 Download .docx';
    }
  });

  copyBtn.addEventListener('click', async () => {
    if (!window.tailoredText) return;
    try {
      await navigator.clipboard.writeText(window.tailoredText);
      copyBtn.textContent = '✅ Copied!';
      setTimeout(() => { copyBtn.textContent = '📋 Copy text'; }, 2000);
    } catch {
      setStatus('error', 'Clipboard access denied. Copy manually from the preview.');
    }
  });
}

function buildPrompt(resumeText, jd) {
  return `You are a world-class resume writer and ATS specialist with 15+ years of experience.

Your task: Rewrite the candidate's resume to perfectly match the job description below.
The output will be inserted back into a Word document, so format it as clean structured text.

STRICT RULES:
1. NEVER fabricate skills, tools, companies, or achievements the candidate didn't have
2. DO reframe and reword existing experience to align with JD keywords naturally
3. DO reorder bullet points to surface the most relevant experience first
4. Embed exact keywords from the JD naturally — this is critical for ATS parsing
5. Use strong action verbs: Led, Built, Reduced, Increased, Shipped, Automated, Designed
6. Keep every number and metric from the original resume exactly as-is
7. Sound like a confident real human wrote this — no buzzword soup
8. Use these section headers exactly (in CAPS): SUMMARY, EXPERIENCE, EDUCATION, SKILLS, PROJECTS
9. Format each job as: Job Title — Company, Location (Start – End)
10. Format bullets starting with a dash: - Bullet text here
11. Output ONLY the resume text — no preamble, no "Here is your resume", start with the name

CANDIDATE'S CURRENT RESUME:
---
${resumeText.substring(0, 3500)}
---

JOB DESCRIPTION:
---
${jd.substring(0, 2500)}
---

Write the complete tailored resume now:`;
}

async function buildDocx(tailoredText) {
  const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType,
          BorderStyle, Packer } = docx;

  const lines = tailoredText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const children = [];

  // Section headers Gemini will output in ALL CAPS
  const SECTION_HEADERS = ['SUMMARY', 'EXPERIENCE', 'EDUCATION', 'SKILLS',
                            'PROJECTS', 'CERTIFICATIONS', 'AWARDS'];

  lines.forEach((line, index) => {
    // First line = candidate name (largest heading)
    if (index === 0) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line, bold: true, size: 28, font: 'Calibri' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 }
      }));
      return;
    }

    // Second line might be contact info (email, phone, LinkedIn)
    if (index === 1 && (line.includes('@') || line.includes('|') || line.includes('·'))) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line, size: 20, color: '555555', font: 'Calibri' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 }
      }));
      return;
    }

    // ALL CAPS section headers
    if (SECTION_HEADERS.some(h => line.toUpperCase() === h)) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line.toUpperCase(), bold: true, size: 24,
                                  font: 'Calibri', color: '1F3864' })],
        spacing: { before: 240, after: 80 },
        border: {
          bottom: { color: '1F3864', space: 4, style: BorderStyle.SINGLE, size: 6 }
        }
      }));
      return;
    }

    // Job title lines: "Job Title — Company, Location (Date – Date)"
    if (line.includes('—') || (line.includes(',') && line.includes('('))) {
      const parts = line.split('—');
      children.push(new Paragraph({
        children: [
          new TextRun({ text: parts[0]?.trim() || line, bold: true, size: 22, font: 'Calibri' }),
          parts[1] ? new TextRun({ text: ' — ' + parts[1].trim(), size: 22,
                                    color: '555555', font: 'Calibri' }) : null
        ].filter(Boolean),
        spacing: { before: 160, after: 40 }
      }));
      return;
    }

    // Bullet points starting with - or ·
    if (line.startsWith('-') || line.startsWith('·') || line.startsWith('•')) {
      const bulletText = line.replace(/^[-·•]\s*/, '');
      children.push(new Paragraph({
        children: [new TextRun({ text: bulletText, size: 20, font: 'Calibri' })],
        bullet: { level: 0 },
        spacing: { after: 40 }
      }));
      return;
    }

    // Default: normal paragraph
    children.push(new Paragraph({
      children: [new TextRun({ text: line, size: 20, font: 'Calibri' })],
      spacing: { after: 60 }
    }));
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, right: 720, bottom: 720, left: 720 } // 0.5 inch margins
        }
      },
      children
    }]
  });

  return await Packer.toBlob(doc);
}

function setStatus(type, message) {
  statusBar.className = 'status-bar ' + type;
  statusBar.innerHTML = type === 'loading'
    ? `<span class="spinner"></span> ${message}`
    : message;
}

function showResumeSuccess(filename, charCount) {
  uploadZone.classList.add('success');
  uploadZone.innerHTML =
    `<i class="check-icon">✓</i> ${filename}
     <span class="char-count">${charCount.toLocaleString()} chars loaded</span>`;
}

function showOutput(text) {
  outputSection.style.display = 'block';
  outputPreview.value = text;
  outputSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
