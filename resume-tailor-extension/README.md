# ✨ Resume Tailor AI

A locally-run Chrome Extension that tailors your resume to any job description in seconds using AI. Get an ATS-friendly, humanised output optimized for the exact role you are applying to.

## Features
- **Zero Backend Server**: Everything runs inside your browser. No middleman.
- **Privacy First**: Your resume and job description never leave your browser except to call the Google Gemini API. API keys are stored in `chrome.storage.local` on your device.
- **Zero Cost**: Utilizes Google's Gemini 1.5 Flash free tier (15 requests/min, 1M tokens/day).
- **Auto-Scraper**: Automatically extracts the job description from any job board (LinkedIn, Indeed, etc.) with a single click.
- **ATS-Optimized**: Outputs plain text tailored specifically to beat ATS filters while maintaining truthfulness.

## How it works
1. **Upload**: Select your base resume (PDF or TXT).
2. **Setup**: Provide your free Gemini API key (stored securely and locally).
3. **Scrape/Paste**: Click "Auto-Scrape" on any job posting or paste the job description manually.
4. **Tailor**: The extension prompts Gemini 1.5 Flash to rewrite your resume.
5. **Download**: Save the result as a `.txt` file or copy it to your clipboard.

## Installation (Developer Mode)
1. Download or clone this repository to your computer.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle switch in the top right corner).
4. Click **Load unpacked** in the top left corner.
5. Select the folder containing the extension files (`resume-tailor-extension`).
6. Pin the extension to your toolbar for easy access!

## Getting your free API key
1. Go to [Google AI Studio](https://aistudio.google.com).
2. Sign in with your Google account.
3. Click on **Get API Key** in the left sidebar.
4. Create a new API key in a new or existing project.
5. Copy the key and paste it into the "Gemini API Key" field in the extension popup.

## Usage
1. Click the **Resume Tailor AI** icon in your Chrome toolbar.
2. Under **Step 1**, upload your base resume (PDF or TXT).
3. Under **Step 2**, enter your Gemini API key.
4. Navigate to a job posting (e.g., on LinkedIn).
5. Open the extension and click **Auto-Scrape from Page** under **Step 3**, or paste the job description manually.
6. Click **✨ Tailor My Resume**.
7. Wait a few seconds for the AI to process.
8. Click **📄 Download TXT** or **📋 Copy to Clipboard** to get your tailored resume!

## CI/CD Pipeline
This project includes two GitHub Actions workflows:
- **CI (`ci.yml`)**: Runs on pull requests and pushes to `main`. Validates `manifest.json`, ensures required files exist, and scans for accidentally committed API keys.
- **CD (`cd.yml`)**: Triggered when pushing a version tag (e.g., `v1.0.0`). Automatically bundles the extension into a `.zip` file and attaches it to a new GitHub Release.

## Publishing to Chrome Web Store
To publish this extension publicly:
1. Ensure you have the bundled `.zip` file (available in GitHub Releases after tagging).
2. Go to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).
3. Pay the one-time $5 developer fee if you haven't already.
4. Click **New Item** and upload the `.zip` file.
5. Fill out the store listing details and submit for review.

## Privacy
- **No Data Collected**: This extension does not track you, collect analytics, or store your data remotely.
- **Local Storage**: Your API key, base resume, and job descriptions are stored exclusively on your device using Chrome's local storage.
- **Direct API Communication**: The extension communicates directly with Google's Generative Language API.

## Tech Stack
| Component | Technology |
|---|---|
| Platform | Chrome Extension (Manifest V3) |
| AI API | Google Gemini 1.5 Flash |
| PDF Parsing | [PDF.js](https://mozilla.github.io/pdf.js/) |
| Styling | Vanilla CSS (Light/Dark mode support) |
| CI/CD | GitHub Actions |

## Contributing
1. Fork the repository.
2. Create a new branch (`git checkout -b feature/amazing-feature`).
3. Make your changes and commit them (`git commit -m 'Add some amazing feature'`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request.

## License
Distributed under the MIT License.
