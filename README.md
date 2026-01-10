# IntraTALKS
Here is a professional, comprehensive README.md template designed specifically for your IntraTALKS application. You can copy and paste this directly into your GitHub repository.

💬 IntraTALKS

IntraTALKS is a high-performance, secure, and AI-enhanced internal chat application built on the Google Apps Script (GAS) ecosystem. It leverages Vue.js 3 for a modern frontend experience and Google Gemini AI to provide smart conversation summaries.

Unlike standard Apps Script projects, IntraTALKS uses an encrypted JSON-based database system stored in Google Drive, featuring RAM-speed caching for near-instant message delivery.

✨ Key Features
🔐 Advanced Authentication

Secure Login/Registration: User accounts with SHA-256 password hashing.

Admin Approval Flow: New registrations are "Pending" until an admin approves them.

Brute-Force Protection: Automated account locking after multiple failed login attempts.

Session Persistence: Remembers your last login email for a faster workflow.

💬 Real-Time Chat Experience

Optimistic UI: Messages appear instantly on the sender's screen while syncing in the background.

Typing Indicators: Real-time feedback when other members are composing messages.

Message Management: Edit or "Unsend" (delete) messages within a 60-second window.

Smart Formatting: Automatic URL detection and clickable links.

Mobile First: Responsive design with swipe-to-reply gestures.

🤖 AI-Powered Intelligence

Chat Summarization: One-click summary of today's conversations using Google Gemini AI.

Multi-Key Fallback: Intelligent API management that cycles through multiple Gemini keys to bypass free-tier rate limits.

Cooldown Logic: Integrated cooldown to manage AI usage effectively.

🛡️ Administrative Tools

User Management: Dashboard to Approve, Reject, or Ban users.

Security: XOR + Base64 encryption for all data stored in Google Drive.

System Maintenance: Tools to export unencrypted backups or clear system cache.

🛠️ Tech Stack

Frontend: Vue.js 3 (CDN), Font Awesome 6, Inter & JetBrains Mono Fonts

Backend: Google Apps Script[1]

Database: Encrypted JSON Files (Stored in Google Drive)

AI Engine: Google Gemini API (Model: gemini-3-flash-preview)

Styling: Custom CSS with CSS Variables for easy "Vibe" customization

🚀 Setup & Installation
1. Google Drive Preparation[2][3][4]

Create a new folder in your Google Drive.

Open the folder and copy the Folder ID from the URL (the string after folders/).

Inside your Apps Script code.gs, replace the FOLDER_ID constant with your new ID:

code
JavaScript
download
content_copy
expand_less
const FOLDER_ID = "YOUR_COPIED_FOLDER_ID_HERE";
2. Gemini AI API Keys

Go to Google AI Studio and generate one or more API keys.[2]

In code.gs, add your keys to the API_KEYS array:

code
JavaScript
download
content_copy
expand_less
const API_KEYS = ["YOUR_KEY_1", "YOUR_KEY_2"];
3. Deploying the Script

Go to script.new to create a new Apps Script project.

Create two files:

code.gs: Paste the server-side code.

Index.html: Paste the frontend code.

Click the Deploy button > New Deployment.

Select Type: Web App.

Set Execute as: Me.

Set Who has access: Anyone (The app has its own internal login system).

Copy the Web App URL.

📖 Usage Guide
First-Time Setup (Admin)

The first user to register an account automatically becomes the System Admin.

Open the Web App URL.

Click Create Account and register.

You will have immediate access and the ability to manage future users via the 🛡️ Shield icon in the sidebar.

Chatting & AI

Replying: Swipe a message to the right or use the 3-dot menu.

Editing: Use the 3-dot menu on your own messages (available for 60 seconds).

Summarizing: Click the 🤖 Robot icon in the header to get an AI summary of the day's topics.

🔒 Security & Data

Data Privacy: All messages and user data are encrypted before they hit Google Drive.

Database Location: Your data stays in your Google Drive. The developers of IntraTALKS have no access to your conversations.

Encryption Key: You can change the DB_ENCRYPTION_KEY in code.gs. Note: If you change this after data exists, old data will become unreadable.

📂 Project Structure
code
Text
download
content_copy
expand_less
├── code.gs          # Backend logic, API handlers, and Drive DB management
└── Index.html       # Single Page Application (Vue.js, CSS, and UI Logic)
📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

Created with ❤️ for high-vibe internal teams.

Sources
help
medium.com
medium.com
google.com
dev.to
Google Search Suggestions
Display of Search Suggestions is required when using Grounding with Google Search. Learn more
readme sections for full stack applications github
github readme template for google apps script project
how to set up google apps script with drive and gemini ai documentation
how to document a vue.js and google apps script chat app
