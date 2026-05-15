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
  return `You are a world-class ATS specialist, resume writer, and career coach
with 20+ years of experience helping candidates pass ATS systems and land
interviews at top companies. You understand exactly how ATS parsers work and
what recruiters look for in the first 6 seconds of reading a resume.

════════════════════════════════════════
TASK
════════════════════════════════════════
Rewrite the candidate's resume to perfectly match the job description below.
The output must pass ATS screening with a near-perfect keyword match score
AND read as a compelling, human-written document to the recruiter who reviews it.

════════════════════════════════════════
ATS OPTIMISATION RULES (critical — follow every one)
════════════════════════════════════════
1. Extract EVERY meaningful keyword, skill, tool, technology, methodology,
   and qualification from the job description below.
   Include: hard skills, soft skills, tools, frameworks, certifications,
   industry terms, action verbs, and any domain-specific vocabulary.

2. Naturally embed ALL of those keywords into the resume. Do not stuff them
   awkwardly — weave them into bullet points and the summary so they read
   naturally. ATS scanners match exact strings, so spelling and casing must
   match the JD exactly (e.g. if JD says "Node.js" write "Node.js" not "NodeJS").

3. If the candidate's original resume is missing a keyword that appears in the JD:
   - If it is a soft skill or general methodology (e.g. "cross-functional
     collaboration", "agile", "stakeholder management") — ADD it naturally
     into the summary or a bullet point where it fits contextually.
   - If it is a specific hard skill or tool the candidate clearly never used —
     DO NOT fabricate it. Instead, reference adjacent skills they do have.

4. Mirror the exact job title from the JD in the candidate's most recent role
   if it is reasonably close to their actual title. This is legal and standard
   practice — ATS systems rank exact title matches higher.

5. Include a SKILLS section with a clean comma-separated list of every relevant
   technical skill, tool, and technology pulled from both the JD and the
   candidate's background. This is the highest-weight ATS section.

════════════════════════════════════════
CONTENT QUALITY RULES
════════════════════════════════════════
6. Every bullet point must follow this formula:
   [Strong action verb] + [what you did] + [how/with what] + [measurable result]
   Example: "Reduced API response latency by 40% by migrating monolithic
   endpoints to asynchronous FastAPI microservices"

7. Use ONLY these action verbs — they are proven to score high with ATS and
   impress recruiters:
   Architected, Automated, Built, Collaborated, Delivered, Deployed, Designed,
   Developed, Drove, Engineered, Established, Executed, Generated, Implemented,
   Increased, Integrated, Launched, Led, Managed, Mentored, Migrated, Optimised,
   Owned, Reduced, Scaled, Shipped, Spearheaded, Streamlined, Transformed

8. Keep every number and metric from the original resume exactly as-is.
   If a bullet has no metric, add a realistic qualifier like "across a team of 6"
   or "within a 3-month timeline" — do not invent percentages or dollar figures.

9. The summary (3-4 lines) must:
   - Open with the exact job title from the JD
   - Mention years of experience
   - Include 4-6 keywords from the JD naturally
   - End with a value proposition sentence

10. Do NOT use generic filler phrases:
    Never write: "results-driven", "passionate about", "detail-oriented",
    "self-starter", "team player", "dynamic", "synergy", "leverage",
    "thought leader", "guru", "ninja", "rockstar"
    These are ATS noise and recruiter red flags.

════════════════════════════════════════
FORMAT RULES (these control the docx output — follow exactly)
════════════════════════════════════════
11. Output the resume as plain structured text only.
    No markdown, no asterisks, no # symbols, no HTML, no bold markers.
    Formatting is applied by the document builder — your job is clean text.

12. Use EXACTLY this structure and EXACTLY these section header names in CAPS:

    [Candidate Full Name]
    [Email] | [Phone] | [LinkedIn or Portfolio URL] | [City, Country]

    SUMMARY
    [3-4 line paragraph]

    EXPERIENCE
    [Job Title] — [Company Name], [City] | [Month Year] - [Month Year or Present]
    - [Bullet point]
    - [Bullet point]
    - [Bullet point — 3 to 5 bullets per role, each under 2 lines]

    SKILLS
    [Comma-separated single line list of all relevant skills and tools]

    EDUCATION
    [Degree] in [Field] — [University Name], [Year]

    PROJECTS (include only if present in original resume)
    [Project Name] | [Tech stack used]
    - [One line describing impact or outcome]

    CERTIFICATIONS (include only if present in original resume)
    [Certification Name] — [Issuing Body], [Year]

13. Section header format: single word or two words, ALL CAPS, on its own line,
    no colon, no period, no decoration. Exactly as shown above.

14. Job entry format: "Job Title — Company, City | Date - Date"
    Use an em dash between title and company.
    Use a pipe between company/city and dates.

15. Bullet points: start each with a dash and space: "- "
    Never use asterisks, dots, or other markers.

16. Contact line: all on ONE line separated by pipe characters " | "
    Never put contact info on multiple lines.

17. Fit everything in ONE PAGE worth of content.
    For candidates with under 5 years experience: max 3 bullet points per role,
    max 2 roles in experience section if needed to fit.
    For candidates with 5-10 years: max 4 bullet points per role, max 3 roles.
    For senior candidates (10+ years): max 5 bullet points per role, max 3 roles,
    oldest roles summarised in one line.
    Skills line: maximum 18 skills, comma separated, single line.
    Summary: strictly 3-4 lines, no more.

18. Output ONLY the resume. Start directly with the candidate's name on line 1.
    No preamble. No "Here is your tailored resume". No explanation after.
    No sign-off. The document ends after the last line of content.

════════════════════════════════════════
CANDIDATE'S CURRENT RESUME
════════════════════════════════════════
${resumeText.substring(0, 3500)}

════════════════════════════════════════
JOB DESCRIPTION
════════════════════════════════════════
${jd.substring(0, 2500)}

Write the complete tailored resume now:`;
}

async function buildDocx(tailoredText) {
  const {
    Document, Paragraph, TextRun, AlignmentType,
    BorderStyle, Packer
  } = docx;

  const lines = tailoredText
    .split('\n')
    .map(l => l.trim());

  const children = [];

  const SECTION_HEADERS = [
    'SUMMARY', 'EXPERIENCE', 'EDUCATION', 'SKILLS',
    'PROJECTS', 'CERTIFICATIONS', 'AWARDS', 'PUBLICATIONS'
  ];

  // Font — Calibri is the gold standard ATS-safe font
  // Clean, professional, universally readable, parsed correctly by all major ATS
  const FONT       = 'Calibri';
  const SIZE_NAME  = 28;        // 14pt — candidate name
  const SIZE_HEAD  = 20;        // 10pt — section headers
  const SIZE_BODY  = 20;        // 10pt — all body text
  const SIZE_SMALL = 18;        // 9pt  — contact line and dates
  const COLOR_NAME = '1A1A2E';  // near-black for name
  const COLOR_HEAD = '16213E';  // dark navy for section headers
  const COLOR_BODY = '2D2D2D';  // dark gray for body text
  const COLOR_DATE = '555555';  // muted gray for dates and company
  const COLOR_LINE = 'C0C0C0';  // light gray for section divider lines

  lines.forEach((line, index) => {
    if (!line) {
      // Blank line — minimal spacing only, do not waste vertical space
      children.push(new Paragraph({ spacing: { after: 40 } }));
      return;
    }

    // Line 1: Candidate name — centered, bold, largest size
    if (index === 0) {
      children.push(new Paragraph({
        children: [
          new TextRun({
            text: line,
            bold: true,
            size: SIZE_NAME,
            font: FONT,
            color: COLOR_NAME,
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 60 },
      }));
      return;
    }

    // Line 2: Contact info — centered, small, muted
    if (index === 1 && (
      line.includes('@') || line.includes('|') ||
      line.includes('linkedin') || line.includes('+')
    )) {
      children.push(new Paragraph({
        children: [
          new TextRun({
            text: line,
            size: SIZE_SMALL,
            font: FONT,
            color: COLOR_DATE,
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 160 },
      }));
      return;
    }

    // Section headers — ALL CAPS, bold, dark navy, underlined with thin gray border
    if (SECTION_HEADERS.includes(line.toUpperCase())) {
      children.push(new Paragraph({
        children: [
          new TextRun({
            text: line.toUpperCase(),
            bold: true,
            size: SIZE_HEAD,
            font: FONT,
            color: COLOR_HEAD,
            allCaps: true,
          })
        ],
        spacing: { before: 200, after: 60 },
        border: {
          bottom: {
            color: COLOR_LINE,
            space: 4,
            style: BorderStyle.SINGLE,
            size: 4,
          }
        },
        alignment: AlignmentType.LEFT,
      }));
      return;
    }

    // Job title lines: "Title — Company, City | Date - Date"
    // Detected by presence of pipe | and dash — and not starting with -
    if (
      (line.includes('—') || line.includes('-')) &&
      line.includes('|') &&
      !line.startsWith('-')
    ) {
      const pipeIdx   = line.lastIndexOf('|');
      const roleInfo  = pipeIdx > -1 ? line.substring(0, pipeIdx).trim() : line;
      const dateInfo  = pipeIdx > -1 ? line.substring(pipeIdx + 1).trim() : '';
      const dashIdx   = roleInfo.indexOf('—');
      const titlePart   = dashIdx > -1 ? roleInfo.substring(0, dashIdx).trim() : roleInfo;
      const companyPart = dashIdx > -1 ? roleInfo.substring(dashIdx + 1).trim() : '';

      children.push(new Paragraph({
        children: [
          new TextRun({
            text: titlePart,
            bold: true,
            size: SIZE_BODY,
            font: FONT,
            color: COLOR_BODY,
          }),
          companyPart ? new TextRun({
            text: ' — ' + companyPart,
            size: SIZE_BODY,
            font: FONT,
            color: COLOR_DATE,
          }) : null,
          dateInfo ? new TextRun({
            text: '  |  ' + dateInfo,
            size: SIZE_SMALL,
            font: FONT,
            color: COLOR_DATE,
            italics: true,
          }) : null,
        ].filter(Boolean),
        spacing: { before: 120, after: 40 },
        alignment: AlignmentType.LEFT,
      }));
      return;
    }

    // Bullet points — lines starting with "- "
    if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
      const bulletText = line.replace(/^[-*•]\s*/, '');
      children.push(new Paragraph({
        children: [
          new TextRun({
            text: bulletText,
            size: SIZE_BODY,
            font: FONT,
            color: COLOR_BODY,
          })
        ],
        bullet: { level: 0 },
        spacing: { before: 20, after: 20 },
        alignment: AlignmentType.LEFT,
        indent: { left: 360, hanging: 180 },
      }));
      return;
    }

    // Skills line — long comma-separated list
    if (line.includes(',') && line.split(',').length > 4 && !line.startsWith('-')) {
      children.push(new Paragraph({
        children: [
          new TextRun({
            text: line,
            size: SIZE_BODY,
            font: FONT,
            color: COLOR_BODY,
          })
        ],
        spacing: { before: 40, after: 40 },
        alignment: AlignmentType.LEFT,
      }));
      return;
    }

    // Education and certification lines — bold main text, italics year
    if (
      line.includes(' in ') ||
      line.includes('Bachelor') || line.includes('Master') ||
      line.includes('B.Tech') || line.includes('B.E') ||
      line.includes('MBA') || line.includes('PhD') ||
      line.includes('Certified') || line.includes('Certificate')
    ) {
      const yearMatch = line.match(/\d{4}/);
      const yearStr   = yearMatch ? yearMatch[0] : '';
      const mainText  = yearStr
        ? line.replace(yearStr, '').trim().replace(/,?\s*$/, '')
        : line;

      children.push(new Paragraph({
        children: [
          new TextRun({
            text: mainText,
            bold: true,
            size: SIZE_BODY,
            font: FONT,
            color: COLOR_BODY,
          }),
          yearStr ? new TextRun({
            text: '  ' + yearStr,
            size: SIZE_SMALL,
            font: FONT,
            color: COLOR_DATE,
            italics: true,
          }) : null,
        ].filter(Boolean),
        spacing: { before: 60, after: 40 },
        alignment: AlignmentType.LEFT,
      }));
      return;
    }

    // Default: standard body paragraph
    children.push(new Paragraph({
      children: [
        new TextRun({
          text: line,
          size: SIZE_BODY,
          font: FONT,
          color: COLOR_BODY,
        })
      ],
      spacing: { before: 40, after: 40 },
      alignment: AlignmentType.LEFT,
    }));
  });

  // Document: tight margins to maximise one-page content
  // 0.5 inch (720 twips) on all sides — professional standard minimum
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: FONT,
            size: SIZE_BODY,
            color: COLOR_BODY,
          },
          paragraph: {
            // 1.15 line spacing — tight but readable, saves ~15% vertical space
            spacing: { line: 276, lineRule: 'auto' },
          }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top:    720,   // 0.5 inch
            right:  720,   // 0.5 inch
            bottom: 720,   // 0.5 inch
            left:   720,   // 0.5 inch
          },
          size: {
            width:  12240, // 8.5 inches — US Letter standard
            height: 15840, // 11 inches
          }
        }
      },
      children,
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
