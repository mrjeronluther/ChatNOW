/* =========================================
   SERVER CONFIGURATION
   ========================================= */
const FOLDER_ID = "12axa561HdwjBBtjM3hSxtbHODgLYkg8E";
const USER_DB = "devtalks_users_v4.json";
const CHAT_DB = "devtalks_chat_v4.json";

// 🔴 SECRET KEY: Used for Encryption & Decryption.
// DO NOT LOSE THIS. If you change it later, you cannot read old data.
const DB_ENCRYPTION_KEY = "IntraTalks_Secret_Key_2025_Change_Me!";

function doGet() {
   return HtmlService.createTemplateFromFile("Index")
      .evaluate()
      .setTitle("IntraTALKS")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
}

/* =========================================
   AUTH API
   ========================================= */

function apiLogin(email, password) {
   // 1. BASIC INPUT VALIDATION
   // Prevent "type juggling" attacks by ensuring inputs are strictly strings
   if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return { success: false, error: "Invalid request format." };
   }

   const props = PropertiesService.getScriptProperties();
   const cleanEmail = email.toLowerCase().trim();
   const idKey = cleanEmail.replace(/[^a-z0-9]/g, "");
   const failKey = "FAIL_COUNT_" + idKey;
   const lockKey = "LOCK_UNTIL_" + idKey;

   // 2. CHECK BRUTE-FORCE LOCKOUT
   const now = Date.now();
   const lockUntil = props.getProperty(lockKey);

   if (lockUntil && now < parseInt(lockUntil)) {
      const waitMins = Math.ceil((parseInt(lockUntil) - now) / 60000);
      return {
         success: false,
         error: "Too many failed attempts. Try again in " + waitMins + " minute(s).",
      };
   }

   const inputHash = hashPassword(password);

   return withLock((db) => {
      let user = db.users.find((u) => u.email === cleanEmail);
      let isSuccess = false;
      let isTempAuth = false;

      // 3. MULTI-STEP VERIFICATION
      if (user) {
         // Check Permanent Password
         if (user.password === inputHash) {
            isSuccess = true;
         } else {
            // Check Temporary Password (Reset Code)
            const cache = CacheService.getScriptCache();
            const tempHash = cache.get("reset#" + cleanEmail);
            if (tempHash && tempHash === inputHash) {
               isSuccess = true;
               isTempAuth = true;
            }
         }
      }

      // 4. HANDLE FAILURE (Increment Counters)
      if (!isSuccess) {
         let fails = parseInt(props.getProperty(failKey) || "0") + 1;
         const MAX_ATTEMPTS = 5;

         if (fails >= MAX_ATTEMPTS) {
            // Lock for 15 minutes after 5 fails
            props.setProperty(lockKey, (now + 15 * 60 * 1000).toString());
            props.deleteProperty(failKey); // Reset count once locked
            return { success: false, error: "Too many attempts. This email is locked for 15 minutes." };
         } else {
            props.setProperty(failKey, fails.toString());
            // We always return the same generic error message to prevent user enumeration
            return { success: false, error: "Invalid Email or Password." };
         }
      }

      // 5. STATUS CHECKS (Banned/Pending)
      if (user.status === "pending") return { success: false, error: "Account pending Admin approval." };
      if (user.status === "banned") return { success: false, error: "Account has been banned." };

      // 6. SUCCESS - RESET COUNTERS
      props.deleteProperty(failKey);
      props.deleteProperty(lockKey);

      user.lastSeen = now;
      updateCacheStatus(cleanEmail, false);

      return {
         success: true,
         user: cleanUser(user),
         isTemp: isTempAuth,
      };
   }, true);
}

function apiRegister(email, username, password) {
   // 'true' = USER_DB
   return withLock((db) => {
      if (db.users.some((u) => u.email === email)) return { success: false, error: "Email already registered." };

      const isFirst = db.users.length === 0;
      db.users.push({
         email,
         username,
         password: hashPassword(password),
         role: isFirst ? "admin" : "member",
         status: isFirst ? "active" : "pending",
         color: getRandomColor(),
         joined: Date.now(),
         lastSeen: Date.now(),
      });

      return {
         success: true,
         message: isFirst ? "Registered as Admin." : "Registration successful! Waiting for Admin approval.",
      };
   }, true);
}

/* =========================================
   FORGOT PASSWORD & PROFILE API
   ========================================= */

function apiForgot(email) {
   if (!email) return { success: false, error: "Email is required." };

   // 1. Check Cooldown Period (12 Hours)
   const props = PropertiesService.getScriptProperties();
   // Create a unique key for this email (sanitized for property keys)
   const cooldownKey = "LIMIT_" + email.toLowerCase().replace(/[^a-z0-9]/g, "");
   const lastSent = props.getProperty(cooldownKey);
   const now = Date.now();
   const TWELVE_HOURS = 12 * 60 * 60 * 1000;

   if (lastSent) {
      const timePassed = now - parseInt(lastSent);
      if (timePassed < TWELVE_HOURS) {
         const remainingMs = TWELVE_HOURS - timePassed;
         const hours = Math.floor(remainingMs / (1000 * 60 * 60));
         const minutes = Math.ceil((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

         let timeStr = hours > 0 ? hours + "h " + minutes + "m" : minutes + " minutes";
         return {
            success: false,
            error: "Quota limit reached for this email. Please wait " + timeStr + " before requesting again.",
         };
      }
   }

   // 2. Find User
   const db = getDB(true);
   const user = db.users.find((u) => u.email === email);
   if (!user) return { success: false, error: "Email not found." };

   // 3. Generate Temporary Password
   const tempPass = Math.random().toString(36).slice(-8).toUpperCase();
   const tempHash = hashPassword(tempPass);

   // 4. Cache the hash for 15 minutes
   CacheService.getScriptCache().put("reset#" + email, tempHash, 900);

   // 5. Attempt to send Email
   try {
      GmailApp.sendEmail(
         email,
         "IntraTalks - Temporary Password",
         "Your temporary password is: " +
            tempPass +
            "\n\nThis will expire in 15 minutes. Once logged in, please change your password in the Profile settings.",
         { name: "IntraTalks System" }
      );

      // 6. SUCCESS: Set the 12-hour cooldown timestamp now
      props.setProperty(cooldownKey, now.toString());

      return { success: true, message: "Temporary password sent to email." };
   } catch (e) {
      // If email fails to send (e.g. invalid email), we don't set the cooldown
      return { success: false, error: "Email Error: " + e.message };
   }
}

/* =========================================
   MAINTENANCE: SYNC ALL PAST NAMES
   Run this function ONCE manually from the editor.
   ========================================= */
function forceSyncAllNicknames() {
   const userDB = getDB(true); // Load User Database

   // 1. Create a map of Email -> Current Username
   const userMap = {};
   userDB.users.forEach((u) => {
      userMap[u.email] = u.username;
   });

   // 2. Update Chat Database
   const result = withLock((chatDB) => {
      let updateCount = 0;

      chatDB.messages.forEach((msg) => {
         // If we know this user AND the name in the message is different from their current profile
         if (userMap[msg.senderEmail] && msg.senderName !== userMap[msg.senderEmail]) {
            msg.senderName = userMap[msg.senderEmail]; // Overwrite with current real name
            updateCount++;
         }
      });

      return { success: true, count: updateCount };
   }, false); // 'false' loads the CHAT_DB

   console.log("Finished! Updated " + result.count + " messages.");
}

function apiUpdateProfile(email, newName, oldPass, newPass) {
   let nameChanged = false; // Flag to track if we need to update messages

   // 1. Update USER DB
   const result = withLock((db) => {
      const idx = db.users.findIndex((u) => u.email === email);
      if (idx === -1) return { success: false, error: "User not found" };

      const u = db.users[idx];

      // Check if name is changing
      if (newName && newName.length > 0 && u.username !== newName) {
         u.username = newName;
         nameChanged = true; // Mark as changed
      }

      if (newPass && newPass.length > 0) {
         const oldHash = hashPassword(oldPass);
         const cache = CacheService.getScriptCache();
         const tempHash = cache.get("reset#" + email);

         const isOldValid = u.password === oldHash;
         const isTempValid = tempHash && tempHash === oldHash;

         if (!isOldValid && !isTempValid) return { success: false, error: "Current password incorrect." };

         u.password = hashPassword(newPass);
         cache.remove("reset#" + email);
      }

      return { success: true, user: cleanUser(u) };
   }, true);

   // 2. If name changed successfully, update CHAT DB (Old Messages)
   if (result.success && nameChanged) {
      withLock((chatDB) => {
         // Loop through all messages and update name if email matches
         chatDB.messages.forEach((msg) => {
            if (msg.senderEmail === email) {
               msg.senderName = newName;
            }
         });
         return { success: true };
      }, false); // 'false' accesses CHAT_DB
   }

   return result;
}

// -- Email Change Flow --

function apiSendEmailCode(currentEmail, newEmail) {
   const db = getDB(true);
   if (db.users.some((u) => u.email === newEmail)) return { success: false, error: "Email already taken." };

   const code = Math.floor(100000 + Math.random() * 900000).toString();
   CacheService.getScriptCache().put("email_change#" + currentEmail, JSON.stringify({ newEmail, code }), 600);

   try {
      GmailApp.sendEmail(newEmail, "IntraTalks - Verify Email Change", `Verification Code: ${code}`, {
         name: "IntraTalks System",
      });
      return { success: true };
   } catch (e) {
      return { success: false, error: "Could not send email." };
   }
}

function apiVerifyEmailChange(currentEmail, codeInput) {
   return withLock((db) => {
      const cache = CacheService.getScriptCache();
      const record = cache.get("email_change#" + currentEmail);

      if (!record) return { success: false, error: "Code expired or invalid." };
      const { newEmail, code } = JSON.parse(record);

      if (code !== codeInput) return { success: false, error: "Invalid Code." };

      const idx = db.users.findIndex((u) => u.email === currentEmail);
      if (idx === -1) return { success: false, error: "User not found." };

      db.users[idx].email = newEmail;

      cache.remove("email_change#" + currentEmail);
      cache.remove("u#" + currentEmail);

      return { success: true, user: cleanUser(db.users[idx]) };
   }, true);
}

/* =========================================
   CHAT API
   ========================================= */

function apiSendMessage(email, text, replyTo = null) {
   updateCacheStatus(email, false);

   // Save "Last Seen" to User DB (Sequential)
   withLock((userDB) => {
      const u = userDB.users.find((x) => x.email === email);
      if (u) u.lastSeen = Date.now();
      return { success: true };
   }, true);

   // Save Message to Chat DB
   return withLock((db) => {
      const userDB = getDB(true);
      const sender = userDB.users.find((u) => u.email === email);

      if (!sender || sender.status !== "active") return { success: false, error: "Auth Error" };

      const newId = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 4); // Added random suffix for high-speed unique IDs

      const msg = {
         id: newId, // Generate ID inside the lock
         senderName: sender.username,
         senderEmail: sender.email,
         role: sender.role,
         text: text,
         replyTo: replyTo,
         timestamp: Date.now(),
      };

      db.messages.push(msg);

      if (db.messages.length > 200) db.messages = db.messages.slice(-200);

      // RETURN THE NEW ID so the frontend can update its reference
      return { success: true, newId: newId };
   }, false);
}

/**
 * @param {string} email - Current user's email
 * @param {boolean} isFullLoad - If true, return more history (prevents lag on polls)
 * @param {boolean} isTyping - The current typing state of the user
 */
function apiSync(email, isFullLoad, isTyping) {
   const cache = CacheService.getScriptCache();
   const now = Date.now();

   // 1. IMMEDIATELY SAVE STATUS TO RAM (Cache)
   // This allows other users to see this user's "isTyping" state within 2.5 seconds
   if (email) {
      const myStatus = JSON.stringify({
         lastSeen: now,
         isTyping: !!isTyping,
      });
      cache.put("u#" + email, myStatus, 60); // Store status for 60 seconds
   }

   // 2. Load DB Data
   const userDB = getDB(true);
   const chatDB = getDB(false);

   // 3. PERSISTENT HEARTBEAT (Update Drive DB only every 60s to save performance)
   const me = userDB.users.find((u) => u.email === email);
   if (me && now - (me.lastSeen || 0) > 60000) {
      withLock((db) => {
         const u = db.users.find((x) => x.email === email);
         if (u) u.lastSeen = now;
         return { success: true };
      }, true);
   }

   // 4. GET ALL MEMBER STATUSES FROM RAM
   const activeUsers = userDB.users.filter((u) => u.status === "active");
   const cacheKeys = activeUsers.map((u) => "u#" + u.email);
   const cachedStatuses = cache.getAll(cacheKeys);

   const members = activeUsers.map((u) => {
      const rawStatus = cachedStatuses["u#" + u.email];
      let liveIsTyping = false;
      let liveLastSeen = u.lastSeen || 0;

      if (rawStatus) {
         try {
            const parsed = JSON.parse(rawStatus);
            liveIsTyping = parsed.isTyping;
            liveLastSeen = parsed.lastSeen;
         } catch (e) {}
      }

      // Logic: Recent ping within 15 seconds means Online
      const isOnline = now - liveLastSeen < 15000;

      return {
         username: u.username,
         email: u.email,
         role: u.role,
         isOnline: isOnline,
         lastSeen: isOnline ? now : liveLastSeen,
         // Only show "typing" if the user is actually online
         isTyping: isOnline ? liveIsTyping : false,
      };
   });

   // 5. FILTER MESSAGES
   let messages = chatDB.messages || [];
   if (!isFullLoad) {
      // Only return the last 40 messages during routine polling to stay fast
      messages = messages.slice(-40);
   }

   return {
      success: true,
      messages: messages,
      members: members,
   };
}

/* =========================================
   ADMIN API
   ========================================= */

/* =========================================
   ADMIN API
   ========================================= */

function apiAdminGetUsers(adminEmail) {
   const db = getDB(true);
   const admin = db.users.find((u) => u.email === adminEmail);
   if (!admin || admin.role !== "admin") return { success: false, error: "Unauthorized" };

   // Return all users for management
   return {
      success: true,
      users: db.users.map((u) => ({
         email: u.email,
         username: u.username,
         role: u.role,
         status: u.status,
         joined: u.joined,
      })),
   };
}

/**
 * UPDATED: Handles Accept, Reject, and Remove Member logic
 */
/**
 * UPDATED: Handles Accept, Reject, and Remove Member (Ban)
 * Reject and Ban will now physically delete the user so they disappear from the list.
 */
function apiAdminAction(adminEmail, targetEmail, action) {
   return withLock((db) => {
      // 1. Verify if the person performing the action is an admin
      const admin = db.users.find((u) => u.email === adminEmail);
      if (!admin || admin.role !== "admin") return { success: false, error: "Unauthorized" };

      // 2. Find the index of the target user
      const idx = db.users.findIndex((u) => u.email === targetEmail);
      if (idx === -1) return { success: false, error: "Target user not found" };

      // 3. Perform actions
      if (action === "approve") {
         // "Accept" - Changes status to active so they can log in
         db.users[idx].status = "active";
      } else if (action === "reject" || action === "ban") {
         // "Reject" or "Remove Member" (ban)
         // Splicing removes the user entry from the database entirely,
         // ensuring they no longer show up in the User Management list.
         db.users.splice(idx, 1);
      }

      return { success: true };
   }, true); // Opens USER_DB
}

/* =========================================
   HELPERS (ENCRYPTION + RAM CACHING)
   ========================================= */

function updateCacheStatus(email, isTyping) {
   CacheService.getScriptCache().put("u#" + email, JSON.stringify({ lastSeen: Date.now(), isTyping: isTyping }), 120);
}

function hashPassword(pass) {
   return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pass)
      .map((b) => ("0" + (b & 0xff).toString(16)).slice(-2))
      .join("");
}

function withLock(cb, isUserDB) {
   const lock = LockService.getScriptLock();
   try {
      lock.waitLock(10000);
      // This loads from Cache (Fast) if available
      const db = getDB(isUserDB);
      const res = cb(db);
      // This saves to Cache (Instant) AND Drive (Background safe)
      saveDB(db, isUserDB);
      return res;
   } catch (e) {
      return { success: false, error: "Server Busy" };
   } finally {
      lock.releaseLock();
   }
}

// 🚀 OPTIMIZED: READ FROM RAM (CACHE) FIRST
function getDB(isUserDB) {
   const cacheKey = isUserDB ? "DB_CACHE_USERS" : "DB_CACHE_CHAT";
   const cache = CacheService.getScriptCache();

   // 1. Try to get Encrypted String from RAM
   const cachedEncrypted = cache.get(cacheKey);

   if (cachedEncrypted) {
      try {
         // Decrypt and return immediately (Zero Drive Latency)
         const jsonStr = cipher(cachedEncrypted, DB_ENCRYPTION_KEY, false);
         return JSON.parse(jsonStr);
      } catch (e) {
         // If RAM data is corrupt, continue to Drive load...
      }
   }

   // 2. RAM Miss -> Load from Drive (Slower)
   const n = isUserDB ? USER_DB : CHAT_DB;
   const f = DriveApp.getFolderById(FOLDER_ID);
   const files = f.getFilesByName(n);

   if (files.hasNext()) {
      const file = files.next();
      const content = file.getBlob().getDataAsString();

      // Check Auto-Migration (Plain JSON -> Encrypted)
      if (content.trim().startsWith("{")) {
         const data = JSON.parse(content);
         saveDB(data, isUserDB); // Encrypt & Cache it
         return data;
      } else {
         // Decrypt
         try {
            const jsonStr = cipher(content, DB_ENCRYPTION_KEY, false);

            // POPULATE RAM CACHE for next time!
            cache.put(cacheKey, content, 21600); // Store for 6 hours

            return JSON.parse(jsonStr);
         } catch (e) {
            return isUserDB ? { users: [] } : { messages: [] };
         }
      }
   }

   // 3. New File
   const init = isUserDB ? { users: [] } : { messages: [] };
   // This saveDB will handle creating file & caching
   const nFile = f.createFile(n, cipher(JSON.stringify(init), DB_ENCRYPTION_KEY, true));
   return init;
}

// 🚀 OPTIMIZED: WRITE TO RAM (CACHE) & DRIVE
function saveDB(data, isUserDB) {
   const n = isUserDB ? USER_DB : CHAT_DB;
   const cacheKey = isUserDB ? "DB_CACHE_USERS" : "DB_CACHE_CHAT";

   // 1. Prepare Encrypted String
   const jsonStr = JSON.stringify(data);
   const encryptedStr = cipher(jsonStr, DB_ENCRYPTION_KEY, true);

   // 2. Save to Drive (For Safety/Persistence)
   const folder = DriveApp.getFolderById(FOLDER_ID);
   const files = folder.getFilesByName(n);
   if (files.hasNext()) {
      files.next().setContent(encryptedStr);
   } else {
      folder.createFile(n, encryptedStr);
   }

   // 3. Save to RAM (For Speed)
   // Next time getDB calls, it grabs this instantly!
   CacheService.getScriptCache().put(cacheKey, encryptedStr, 21600); // 6 hours
}

// --- ENCRYPTION (XOR + BASE64) ---
function cipher(input, key, isEncrypt) {
   if (!input) return "";
   let processedBytes;

   if (isEncrypt) {
      processedBytes = Utilities.newBlob(input).getBytes();
   } else {
      processedBytes = Utilities.base64Decode(input);
   }

   const keyBytes = Utilities.newBlob(key).getBytes();
   const outputBytes = [];

   for (let i = 0; i < processedBytes.length; i++) {
      outputBytes.push(processedBytes[i] ^ keyBytes[i % keyBytes.length]);
   }

   if (isEncrypt) {
      return Utilities.base64Encode(outputBytes);
   } else {
      return Utilities.newBlob(outputBytes).getDataAsString();
   }
}

function cleanUser(u) {
   return { email: u.email, username: u.username, role: u.role, color: u.color, status: u.status, joined: u.joined };
}
function getRandomColor() {
   return ["#00ff9d", "#00e1ff", "#ff00ff", "#ffe600", "#ff3860"][Math.floor(Math.random() * 5)];
}

/* --- NEW ACTIONS FOR EDIT & UNSEND --- */

function apiEditMessage(email, msgId, newText) {
   return withLock((db) => {
      const msg = db.messages.find((m) => m.id === msgId && m.senderEmail === email);
      if (msg) {
         msg.text = newText;
         msg.isEdited = true;
         return { success: true };
      }
      return { success: false, error: "Unauthorized or Message Not Found" };
   }, false); // CHAT_DB
}

function apiDeleteMessage(email, msgId) {
   return withLock((db) => {
      const index = db.messages.findIndex((m) => m.id === msgId && m.senderEmail === email);
      if (index !== -1) {
         db.messages.splice(index, 1);
         return { success: true };
      }
      return { success: false, error: "Unauthorized or Message Not Found" };
   }, false); // CHAT_DB
}

function forceAuth() {
   GmailApp.getDrafts();
   DriveApp.getRootFolder();
}

function developer_clearCache() {
   const cache = CacheService.getScriptCache();
   cache.remove("DB_CACHE_CHAT");
   cache.remove("DB_CACHE_USERS");
   console.log("Cache cleared! Your deleted files will now be recognized as empty.");
}

/**
 * MAINTENANCE: EXPORT UNENCRYPTED JSON
 * Decrypts the current databases and saves them as readable plain-text JSON files
 * in the same Google Drive folder.
 * Run this manually from the Apps Script editor.
 */
function exportUnencryptedDatabases() {
   const folder = DriveApp.getFolderById(FOLDER_ID);
   const timestamp = new Date().toLocaleString().replace(/[/, :]/g, "-");

   try {
      // 1. Get the Decrypted Data using your existing helper
      const usersData = getDB(true); // Decrypts Users
      const chatData = getDB(false); // Decrypts Messages

      // 2. Prepare readable JSON strings (with 2-space indentation)
      const plainUsers = JSON.stringify(usersData, null, 2);
      const plainChat = JSON.stringify(chatData, null, 2);

      // 3. Create the new files
      const userFile = folder.createFile("READABLE_USERS_" + timestamp + ".json", plainUsers, MimeType.PLAIN_TEXT);
      const chatFile = folder.createFile("READABLE_CHAT_" + timestamp + ".json", plainChat, MimeType.PLAIN_TEXT);

      console.log("Successfully created unencrypted files:");
      console.log("User Backup: " + userFile.getName());
      console.log("Chat Backup: " + chatFile.getName());

      return "Backup complete. Check your Google Drive folder.";
   } catch (e) {
      console.error("Export failed: " + e.toString());
      return "Error: " + e.message;
   }
}

function apiUpdateTypingStatus(email) {
   const ss = SpreadsheetApp.getActiveSpreadsheet();
   const sheet = ss.getSheetByName("Members");
   const data = sheet.getDataRange().getValues();
   const now = new Date().getTime();

   for (let i = 1; i < data.length; i++) {
      if (data[i][1] === email) {
         // Email column
         // Column 5: Typing Timestamp
         // Column 4: Last Seen (to keep them online)
         sheet.getRange(i + 1, 4).setValue(now);
         sheet.getRange(i + 1, 5).setValue(now);
         return { success: true };
      }
   }
}
// --- GenAI CONFIGURATION (2026 VERSION) ---
// Add as many keys as you want to this array
const API_KEYS = [
  "AIzaSyBF-rwQCVzPubB3koQgZo_Ne_By3AV1E44", 
  "AIzaSyAnxlLbjPfbUTvdcZWiVzNQmKL5PtracpM",
  "AIzaSyDIn1uRO8yF-r5Sx70GJhvVS_HrZqaHifU",
  "AIzaSyDsVCMTbnuPMrTAPwFyzq-77QK0Llx2HoM",
  "AIzaSyDdy_HdacLrP8JAD9mPomI3bgjaO4lRcms",
  "AIzaSyACQ6KkdTSDBI-7nYBD3zuyxGlUbPBBMao",
  "AIzaSyAjrPIVmndgBo9-eujecyZTGH06TR0P7M8",
  "AIzaSyD4wT4iiOOgIeMIBSx2v6_ckdrqRlLmkGQ",
  "AIzaSyDkhR5QTifQ81lwkg9lrLr0d6miO5zJoLo"
];

const CURRENT_MODEL = "gemini-3-flash-preview";

/**
 * AI SUMMARY: SUMMARIZES MESSAGES WITH MULTI-KEY FALLBACK
 */
function apiAiSummarize(messagesArray) {
   if (!messagesArray || messagesArray.length === 0) return "No new messages today.";

   const history = messagesArray.map((m) => `${m.senderName}: ${m.text}`).join("\n");
   const prompt = `Summarize the following chat into clear bullet points that highlight key topics, actions, and outcomes. 
   IMPORTANT: Provide the summary ONLY in English. Use natural, human-like English and go straight to the bullet points without any introduction.
   Chat History:\n\n${history}`;

   const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
   };

   // Loop through each API Key
   for (let i = 0; i < API_KEYS.length; i++) {
      let currentKey = API_KEYS[i];
      let url = `https://generativelanguage.googleapis.com/v1beta/models/${CURRENT_MODEL}:generateContent?key=${currentKey}`;

      try {
         const res = UrlFetchApp.fetch(url, {
            method: "post",
            contentType: "application/json",
            payload: JSON.stringify(payload),
            muteHttpExceptions: true, // Crucial: Allows us to see the error code instead of crashing
         });

         const responseCode = res.getResponseCode();
         const json = JSON.parse(res.getContentText());

         // SUCCESS: Return the summary
         if (responseCode === 200 && json.candidates && json.candidates[0].content) {
            return json.candidates[0].content.parts[0].text.trim();
         }

         // QUOTA EXCEEDED / RATE LIMITED: Log and try the next key
         if (responseCode === 429 || responseCode === 403) {
            console.warn(`Key ${i + 1} hit its limit. Error: ${json.error ? json.error.message : 'Quota Exceeded'}`);
            continue; // This skips to the next key in the array
         }

         // OTHER ERRORS (Safety filter, etc): Return the error
         if (json.candidates && json.candidates[0].finishReason === "SAFETY") {
            return "The AI could not summarize this conversation due to safety filters.";
         }

      } catch (e) {
         console.error(`Request failed for key ${i + 1}: ${e.message}`);
         continue; 
      }
   }

   // If the loop finishes and no keys worked
   return "ALL_KEYS_EXHAUSTED";
}
