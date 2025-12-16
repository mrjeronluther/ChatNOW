

/* =========================================
   SERVER CONFIGURATION
   ========================================= */
const FOLDER_ID = '10KwWNUyl8AvY4ndlNzEVGiL1rgKlDNtD'; 
const USER_DB = 'devtalks_users_v4.json'; 
const CHAT_DB = 'devtalks_chat_v4.json';

// 🔴 SECRET KEY: Used for Encryption & Decryption.
// DO NOT LOSE THIS. If you change it later, you cannot read old data.
const DB_ENCRYPTION_KEY = 'ChatNOW_Secret_Key_2025_Change_Me!'; 

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('ChatNOW')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}

/* =========================================
   AUTH API
   ========================================= */

function apiLogin(email, password) {
  const inputHash = hashPassword(password);
  
  // We use withLock to OPEN and SAVE the database (updates lastSeen)
  return withLock((db) => {
    let user = db.users.find(u => u.email === email);
    let isTempAuth = false;

    // 1. Check Permanent Password
    if (user && user.password !== inputHash) {
      // 2. Check Temporary Password (Cache)
      const cache = CacheService.getScriptCache();
      const tempHash = cache.get('reset#' + email);
      
      if (tempHash && tempHash === inputHash) {
        isTempAuth = true; 
      } else {
        return { success: false, error: "Invalid Email or Password." };
      }
    }

    if (!user) return { success: false, error: "Invalid Email or Password." };
    if (user.status === 'pending') return { success: false, error: "Account pending Admin approval." };
    if (user.status === 'banned') return { success: false, error: "Account has been banned." };

    // --- FIX: UPDATE LAST SEEN PERMANENTLY ---
    user.lastSeen = Date.now(); 
    // -----------------------------------------

    updateCacheStatus(email, false);
    
    return { success: true, user: cleanUser(user), isTemp: isTempAuth };
  }, true); // 'true' = loads and saves USER_DB
}

function apiRegister(email, username, password) {
  // 'true' = USER_DB
  return withLock((db) => {
    if (db.users.some(u => u.email === email)) return { success: false, error: "Email already registered." };
    
    const isFirst = db.users.length === 0;
    db.users.push({
      email, username, 
      password: hashPassword(password),
      role: isFirst ? 'admin' : 'member', 
      status: isFirst ? 'active' : 'pending',
      color: getRandomColor(),
      joined: Date.now(),
      lastSeen: Date.now()
    });
    
    return { success: true, message: isFirst ? "Registered as Admin." : "Registration successful! Waiting for Admin approval." };
  }, true);
}

/* =========================================
   FORGOT PASSWORD & PROFILE API
   ========================================= */

function apiForgotPassword(email) {
  const db = getDB(true);
  const user = db.users.find(u => u.email === email);
  
  if (!user) return { success: false, error: "Email not found." };

  const tempPass = Math.random().toString(36).slice(-8).toUpperCase(); 
  const tempHash = hashPassword(tempPass);

  CacheService.getScriptCache().put('reset#' + email, tempHash, 900);

  try {
    GmailApp.sendEmail(
      email, "ChatNOW - Temporary Password", 
      `Your temporary password: ${tempPass}\nExpire in 15 mins.`,
      { name: 'ChatNow System' }
    );
    return { success: true, message: "Temporary password sent to email." };
  } catch (e) {
    return { success: false, error: "Server Error: " + e.message };
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
  userDB.users.forEach(u => {
    userMap[u.email] = u.username;
  });

  // 2. Update Chat Database
  const result = withLock((chatDB) => {
    let updateCount = 0;
    
    chatDB.messages.forEach(msg => {
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
    const idx = db.users.findIndex(u => u.email === email);
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
      const tempHash = cache.get('reset#' + email);
      
      const isOldValid = (u.password === oldHash);
      const isTempValid = (tempHash && tempHash === oldHash);

      if (!isOldValid && !isTempValid) return { success: false, error: "Current password incorrect." };

      u.password = hashPassword(newPass);
      cache.remove('reset#' + email);
    }

    return { success: true, user: cleanUser(u) };
  }, true);

  // 2. If name changed successfully, update CHAT DB (Old Messages)
  if (result.success && nameChanged) {
    withLock((chatDB) => {
      // Loop through all messages and update name if email matches
      chatDB.messages.forEach(msg => {
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
  if (db.users.some(u => u.email === newEmail)) return { success: false, error: "Email already taken." };

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  CacheService.getScriptCache().put('email_change#' + currentEmail, JSON.stringify({ newEmail, code }), 600); 

  try {
    GmailApp.sendEmail(newEmail, "ChatNOW - Verify Email Change", `Verification Code: ${code}`, { name: 'ChatNow System' });
    return { success: true };
  } catch(e) { return { success: false, error: "Could not send email." }; }
}

function apiVerifyEmailChange(currentEmail, codeInput) {
  return withLock((db) => {
    const cache = CacheService.getScriptCache();
    const record = cache.get('email_change#' + currentEmail);
    
    if (!record) return { success: false, error: "Code expired or invalid." };
    const { newEmail, code } = JSON.parse(record);

    if (code !== codeInput) return { success: false, error: "Invalid Code." };

    const idx = db.users.findIndex(u => u.email === currentEmail);
    if (idx === -1) return { success: false, error: "User not found." };

    db.users[idx].email = newEmail;
    
    cache.remove('email_change#' + currentEmail);
    cache.remove('u#' + currentEmail);
    
    return { success: true, user: cleanUser(db.users[idx]) };
  }, true);
}

/* =========================================
   CHAT API
   ========================================= */

function apiSendMessage(email, text, replyTo = null) {
  // 1. Update Cache immediately (for green dot)
  updateCacheStatus(email, false);

  // ---------------------------------------------------------
  // 2. CRITICAL FIX: Save "Last Seen" to Permanent USER DB
  // This ensures your profile updates to "Now" instantly.
  // ---------------------------------------------------------
  withLock((userDB) => {
    const u = userDB.users.find(x => x.email === email);
    if (u) {
      u.lastSeen = Date.now(); // <--- This fixes the 10:27AM issue
    }
    return { success: true };
  }, true); // 'true' opens the USER database

  // 3. Save the Message to CHAT DB
  return withLock((db) => {
    const userDB = getDB(true); // Re-read user DB to get fresh data
    const sender = userDB.users.find(u => u.email === email);
    
    if (!sender || sender.status !== 'active') return { success: false, error: "Auth Error" };

    const msg = {
      id: Date.now().toString(),
      senderName: sender.username,
      senderEmail: sender.email,
      role: sender.role,
      text: text,
      replyTo: replyTo,
      timestamp: Date.now()
    };
    
    db.messages.push(msg);
    
    // Keep DB small for speed (Max 200)
    if (db.messages.length > 200) db.messages = db.messages.slice(-200);
    
    return { success: true };
  }, false); // 'false' opens the CHAT database
}

function apiSync(email, isTyping) {
  const cache = CacheService.getScriptCache();
  
  // 1. FAST READ: Load data from RAM (Cache) first
  const userDB = getDB(true); 
  const chatDB = getDB(false);

  // 2. UPDATE RAM STATUS (This makes the green dot work)
  updateCacheStatus(email, isTyping);

  // ======================================================
  // 3. HEARTBEAT SAVE (NEW FIX)
  // This updates the Permanent Database while you are just reading.
  // We only run this if the saved time is older than 60 seconds 
  // to prevent slowing down the system.
  // ======================================================
  const me = userDB.users.find(u => u.email === email);
  
  if (me && (Date.now() - me.lastSeen > 60000)) { 
    // It has been more than 1 minute since last save. Update Drive!
    withLock((db) => {
       const u = db.users.find(x => x.email === email);
       if (u) u.lastSeen = Date.now();
       return { success: true };
    }, true);
  }
  // ======================================================

  // 4. Prepare data for Frontend
  const activeUsers = userDB.users.filter(u => u.status === 'active');
  const cachedStatuses = cache.getAll(activeUsers.map(u => 'u#' + u.email));

  const members = activeUsers.map(u => {
    const rawStatus = cachedStatuses['u#' + u.email];
    let liveData = { lastSeen: u.lastSeen || 0, isTyping: false };
    
    // If the user is currently pinging the server, they are "Online"
    if (rawStatus) { 
      try { 
        const parsed = JSON.parse(rawStatus);
        liveData.isTyping = parsed.isTyping;
        // If they are in RAM, their lastSeen is NOW.
        liveData.lastSeen = parsed.lastSeen; 
      } catch(e) {} 
    }

    // Logic: If 'liveData.lastSeen' (RAM) is recent (< 15s), they are Online.
    // Otherwise, we fallback to 'u.lastSeen' (Database) which we just updated in step 3.
    const isOnline = (Date.now() - liveData.lastSeen) < 15000;

    return {
      username: u.username, 
      email: u.email, 
      role: u.role, 
      color: u.color,
      isTyping: liveData.isTyping, 
      // If online, use NOW. If offline, use Database time.
      lastSeen: isOnline ? Date.now() : u.lastSeen,
      isOnline: isOnline
    };
  });

  return { messages: chatDB.messages, members: members };
}

/* =========================================
   ADMIN API
   ========================================= */

function apiAdminGetUsers(adminEmail) {
  const db = getDB(true);
  const admin = db.users.find(u => u.email === adminEmail);
  if(!admin || admin.role !== 'admin') return { success: false, error: "Unauthorized" };
  return { success: true, users: db.users.map(u => ({ email: u.email, username: u.username, role: u.role, status: u.status, joined: u.joined }))};
}

function apiAdminAction(adminEmail, targetEmail, action) {
  return withLock((db) => {
    const admin = db.users.find(u => u.email === adminEmail);
    if(!admin || admin.role !== 'admin') return { success: false, error: "Unauthorized" };
    const idx = db.users.findIndex(u => u.email === targetEmail);
    if(idx === -1) return { success: false };
    if(action === 'approve') db.users[idx].status = 'active';
    if(action === 'remove') db.users.splice(idx, 1);
    return { success: true };
  }, true);
}

/* =========================================
   HELPERS (ENCRYPTION + RAM CACHING)
   ========================================= */

function updateCacheStatus(email, isTyping) {
  CacheService.getScriptCache().put('u#' + email, JSON.stringify({ lastSeen: Date.now(), isTyping: isTyping }), 120);
}

function hashPassword(pass) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pass)
    .map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
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
  } 
  catch(e) { return { success: false, error: "Server Busy" }; } 
  finally { lock.releaseLock(); }
}

// 🚀 OPTIMIZED: READ FROM RAM (CACHE) FIRST
function getDB(isUserDB) {
  const cacheKey = isUserDB ? 'DB_CACHE_USERS' : 'DB_CACHE_CHAT';
  const cache = CacheService.getScriptCache();
  
  // 1. Try to get Encrypted String from RAM
  const cachedEncrypted = cache.get(cacheKey);
  
  if (cachedEncrypted) {
    try {
      // Decrypt and return immediately (Zero Drive Latency)
      const jsonStr = cipher(cachedEncrypted, DB_ENCRYPTION_KEY, false);
      return JSON.parse(jsonStr);
    } catch(e) {
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
    if (content.trim().startsWith('{')) {
      const data = JSON.parse(content);
      saveDB(data, isUserDB); // Encrypt & Cache it
      return data;
    } 
    else {
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
  const cacheKey = isUserDB ? 'DB_CACHE_USERS' : 'DB_CACHE_CHAT';
  
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

function cleanUser(u) { return { email: u.email, username: u.username, role: u.role, color: u.color, status: u.status, joined: u.joined }; }
function getRandomColor() { return ['#00ff9d', '#00e1ff', '#ff00ff', '#ffe600', '#ff3860'][Math.floor(Math.random()*5)]; }

function forceAuth() {
  GmailApp.getDrafts();
  DriveApp.getRootFolder();
}
