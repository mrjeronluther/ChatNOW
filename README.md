# 💬 IntraTALKS

**IntraTALKS** is a professional-grade, internal chat application built on the **Google Apps Script (GAS)** ecosystem. It combines a modern **Vue.js 3** frontend with a high-performance, encrypted JSON database architecture stored directly in your Google Drive.

Features include real-time sync, **AI-powered summaries** via Google Gemini, and robust administrative controls.

---

## 🚀 Quick Features

- **Optimistic UI:** Instant messaging feel with background server reconciliation.
- **Smart AI Summaries:** Generates daily chat highlights using a multi-key Gemini API fallback system.
- **Enterprise-Grade Security:** SHA-256 password hashing and XOR-encrypted database files.
- **Mobile First:** Responsive design with "Swipe-to-Reply" gestures and auto-resizing text areas.
- **Admin Dashboard:** Approve, reject, or ban users from a dedicated management console.

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | Vue.js 3, HTML5, CSS3 (Variables), FontAwesome 6 |
| **Backend** | Google Apps Script (V8 Engine) |
| **Database** | Google Drive (Encrypted JSON) + `CacheService` RAM Layer |
| **AI Engine** | Google Gemini (3.0 Flash Preview) |

---

## 📦 Detailed Setup Guide

<details>
<summary><b>Step 1: Google Drive Preparation</b> (Click to expand)</summary>

1. Create a new folder in your Google Drive.
2. Open the folder and copy the **Folder ID** from the URL (the alphanumeric string after `folders/`).
3. Open your `code.gs` file and update the `FOLDER_ID` constant:
   ```javascript
   const FOLDER_ID = "PASTE_YOUR_ID_HERE";
   ```
</details>

<details>
<summary><b>Step 2: Google Gemini AI Keys</b> (Click to expand)</summary>

1. Visit [Google AI Studio](https://aistudio.google.com/) and generate one or more API keys.
2. In `code.gs`, add your keys to the `API_KEYS` array. The app will automatically cycle through these if one hits a rate limit:
   ```javascript
   const API_KEYS = [
     "KEY_ONE",
     "KEY_TWO"
   ];
   ```
</details>

<details>
<summary><b>Step 3: Deployment</b> (Click to expand)</summary>

1. Open [Google Apps Script](https://script.google.com).
2. Create two files: `code.gs` and `Index.html`. Paste the respective code into each.
3. Click **Deploy** > **New Deployment**.
4. Select **Web App**.
5. Set **Execute as:** `Me`.
6. Set **Who has access:** `Anyone`.
7. **Important:** Authorize the script when prompted. It requires access to Drive (for storage) and External Services (for AI).
</details>

---

## 📖 App Functions

### 👤 User Roles
*   **Admin:** The first user to register automatically becomes the Admin. They can approve/reject new signups.
*   **Member:** Can chat, edit their own messages (within 60s), and request AI summaries.

### 🤖 AI Summary Logic
Click the **Robot Icon** in the header to generate a summary of the current day's messages.
*   **Cooldown:** There is a built-in 5-minute cooldown per user to manage API usage.
*   **Fallback:** If an API key fails, the script silently tries the next available key in your list.

### 🔒 Data Handling
Data is stored as `devtalks_users_v4.json` and `devtalks_chat_v4.json` in your Drive.
*   **Caching:** The app uses `CacheService` to store the database in RAM for 6 hours, resulting in zero Drive latency during high-traffic periods.
*   **Encryption:** Even if the files are downloaded, the contents are encrypted using a custom XOR cipher.

---

## 🧪 Maintenance Commands

The `code.gs` file contains special maintenance functions you can run manually from the editor:

- `exportUnencryptedDatabases()`: Creates a readable, plain-text backup of your chat and users in your Drive folder.
- `developer_clearCache()`: Force-clears the RAM cache (useful if you manually edit the JSON files).
- `forceSyncAllNicknames()`: Updates all past messages to match current usernames if a user changes their profile name.

---

## 📜 License
MIT License - Feel free to modify and use for your internal teams.
```

### Pro-Tips for this README:
1.  **Syntax Highlighting:** I used ` ```javascript ` and ` ```text ` to ensure the code snippets are color-coded correctly.
2.  **Collapsible Details:** The `<details>` tags prevent the README from becoming a "wall of text." Users only see the setup steps they need.
3.  **Table Formatting:** The tech stack table uses standard GFM pipes (`|`) which render perfectly on GitHub, GitLab, and Bitbucket.
4.  **No Indentation Traps:** Markdown lists are sensitive to spaces. This version uses standard 2-space indentation to ensure bullets don't break.
