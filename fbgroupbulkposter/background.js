// Keep both buffers and metadata per video ID
const videoBuffers = {}; // { [id]: Uint8Array[] }
const videoMeta = {}; // { [id]: { type: string, total: number } }
const triggeredSet = new Set();

// PERSISTENCE FIX: State guards now use chrome.storage.session for resilience across SW restarts
// Falls back to memory if API unavailable (Chrome < 102)
let isCurrentlyPosting = false; // Guard to prevent concurrent posting sessions
let activeCampaignId = null; // Track which campaign is currently running (CRITICAL FIX for double-posting bug)
let isStopping = false; // Flag to prevent new campaigns from starting during cleanup (FIX for race condition)

const SUPPORTS_SESSION_STORAGE = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session;

// Initialize state from persistent storage on startup
async function initializeStateFromStorage() {
  if (!SUPPORTS_SESSION_STORAGE) return;
  try {
    const state = await chrome.storage.session.get(['isCurrentlyPosting', 'activeCampaignId', 'isStopping', 'triggeredSet']);
    if (state.isCurrentlyPosting) isCurrentlyPosting = true;
    if (state.activeCampaignId) activeCampaignId = state.activeCampaignId;
    if (state.isStopping) isStopping = true;
    if (state.triggeredSet) {
      triggeredSet = new Set(state.triggeredSet);
    }
    console.log('[State] Initialized from session storage:', { isCurrentlyPosting, activeCampaignId, isStopping, triggeredSetSize: triggeredSet.size });
  } catch (e) {
    console.error('[State] Failed to initialize from session storage:', e);
  }
}

// Call on service worker startup
initializeStateFromStorage();

// Helper to persist state changes
async function persistState() {
  if (!SUPPORTS_SESSION_STORAGE) return;
  try {
    await chrome.storage.session.set({
      isCurrentlyPosting,
      activeCampaignId,
      isStopping,
      triggeredSet: Array.from(triggeredSet) // CRITICAL FIX: Persist triggeredSet to survive SW restarts
    });
  } catch (e) {
    console.error('[State] Failed to persist state:', e);
  }
}

// DATABASE CACHE: Reduce redundant IndexedDB reads with 5-second TTL
let dbCache = null;
let dbCacheTime = 0;
const DB_CACHE_TTL_MS = 5000;

async function getDataFromDBCached() {
  const now = Date.now();
  if (dbCache && (now - dbCacheTime) < DB_CACHE_TTL_MS) {
    console.log('[Cache] Returning cached DB data (age:', now - dbCacheTime, 'ms)');
    return dbCache;
  }
  
  // Cache miss - fetch from actual getDataFromDB
  console.log('[Cache] Cache miss or expired, fetching fresh data');
  const data = await getDataFromDB();
  dbCache = data;
  dbCacheTime = now;
  return data;
}

// Spintax expansion helper
function expandSpintax(text) {
  if (!text) return text;
  
  // Log for debugging
  console.log("[Spintax] Input text:", text);
  
  // FIX: Handle HTML formatting by temporarily removing it
  // This allows spintax patterns like {opt1|opt2} to work even with <strong>, <em>, etc.
  // Create a map of placeholders for HTML tags
  const htmlMap = {};
  let htmlCounter = 0;
  const placeholder = (id) => `__HTML_PLACEHOLDER_${id}__`;
  
  // Extract HTML tags and replace with placeholders
  let processedText = text.replace(/<[^>]+>/g, (match) => {
    htmlMap[htmlCounter] = match;
    const ph = placeholder(htmlCounter);
    htmlCounter++;
    return ph;
  });
  
  console.log("[Spintax] Processed text (HTML removed):", processedText);
  
  // Parse and expand spintax groups {option1|option2|option3}
  let result = processedText.replace(/\{([^{}]+)\}/g, (match, content) => {
    console.log("[Spintax] Found match:", match, "content:", content);
    const options = content.split('|').map(opt => opt.trim()).filter(opt => opt.length > 0);
    console.log("[Spintax] Options:", options);
    
    if (options.length > 1) {
      // CRITICAL FIX: Generate fresh random value for each match to ensure proper randomization
      // Previously Math.random() may have been cached or reused incorrectly
      const randomIndex = Math.floor(Math.random() * options.length);
      const selected = options[randomIndex];
      console.log("[Spintax] Random index:", randomIndex, "Selected:", selected);
      return selected;
    }
    return match; // Return original if no valid options
  });
  
  // Restore HTML tags from placeholders
  Object.keys(htmlMap).forEach(id => {
    result = result.replace(placeholder(id), htmlMap[id]);
  });
  
  console.log("[Spintax] Output text:", result);
  return result;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 1) Save each chunk
  if (msg.action === "save_video_chunk") {
    const { id, index, total, base64, type } = msg;

    try {
      // Decode base64 into a Uint8Array
      const binary = atob(base64.split(",")[1]);
      const buf = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        buf[i] = binary.charCodeAt(i);
      }

      // Initialize storage if first chunk
      if (!videoBuffers[id]) {
        videoBuffers[id] = [];
        videoMeta[id] = { type, total };
      }

      videoBuffers[id][index] = buf;
      sendResponse({ received: true });
    } catch (err) {
      sendResponse({ received: false, error: err.message });
    }

    return true; // keep sendResponse available
  }

  // 2) Finalize and reassemble
  if (msg.action === "finalize_video") {
    const { id } = msg;
    const meta = videoMeta[id];
    const buffers = videoBuffers[id];

    if (
      !meta ||
      !buffers ||
      buffers.length !== meta.total ||
      buffers.some((c) => !c)
    ) {
      sendResponse({ done: false, error: "Missing or incomplete chunks" });
      return true;
    }

    // Reassemble with the correct MIME type
    const blob = new Blob(buffers, { type: meta.type });

    // Save to IndexedDB
    const openReq = indexedDB.open("MediaStore", 1);
    openReq.onupgradeneeded = () => {
      const db = openReq.result;
      if (!db.objectStoreNames.contains("videos")) {
        db.createObjectStore("videos");
      }
    };

    openReq.onsuccess = () => {
      const db = openReq.result;
      const tx = db.transaction("videos", "readwrite");
      tx.objectStore("videos").put(blob, id);

      tx.oncomplete = () => {
        db.close();

        // cleanup
        delete videoBuffers[id];
        delete videoMeta[id];

        sendResponse({ done: true });
      };

      tx.onerror = () => {
        db.close();
        sendResponse({ done: false, error: tx.error.message });
      };
    };

    openReq.onerror = () => {
      sendResponse({ done: false, error: openReq.error.message });
    };

    return true; // async response
  }
});

// Fetch current sotred Videos
const MAX_CHUNK_SIZE = 256 * 1024; // 256 KB

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "video-stream") return;

  port.onMessage.addListener(async (msg) => {
    if (msg.action !== "get_videos_by_ids") return;
    try {
      const db = await openMediaDB();
      for (const id of msg.ids) {
        const blob = await getBlobById(db, id);
        if (!blob) {
          // signal “no data” for this id
          port.postMessage({ id, done: true, error: "not-found" });
          continue;
        }

        // slice & send
        let offset = 0;
        while (offset < blob.size) {
          const slice = blob.slice(offset, offset + MAX_CHUNK_SIZE);
          const arrayBuffer = await slice.arrayBuffer();
          port.postMessage({
            id,
            chunk: Array.from(new Uint8Array(arrayBuffer)),
            type: blob.type,
            done: false,
          });
          // wait for consumer to ack before sending next slice
          await new Promise((res) => {
            const listener = (ack) => {
              if (ack.id === id && ack.received === true) {
                port.onMessage.removeListener(listener);
                res();
              }
            };
            port.onMessage.addListener(listener);
          });
          offset += MAX_CHUNK_SIZE;
        }

        // signal end-of-file for this video
        port.postMessage({ id, done: true });
      }
    } catch (err) {
      port.postMessage({ action: "error", message: err.message });
    }
  });
});

async function openMediaDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("MediaDB", 1);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains("media")) {
        db.createObjectStore("media", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getBlobById(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("media", "readonly");
    const store = tx.objectStore("media");
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result?.value?.blob);
    req.onerror = () => reject(req.error);
  });
}

// ✅ Helper function: Convert Blob to base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]); // Only base64 part
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Background script

const requestQueue = [];
let isProcessing = false;
const REQUEST_INTERVAL = 500; // ms between requests

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "callApi") {
    // Push request to queue
    requestQueue.push({ payload: message.payload, sendResponse });

    // Start processing if not already
    if (!isProcessing) processQueue();

    return true; // keep channel open for async sendResponse
  }
});

function processQueue() {
  if (requestQueue.length === 0) {
    isProcessing = false;
    return;
  }

  isProcessing = true;
  const { payload, sendResponse } = requestQueue.shift();

  fetch("https://server.fbgroupbulkposter.com/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then(async (response) => {
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        sendResponse({ success: false, error: data || response.statusText });
      } else {
        sendResponse({ success: true, data });
      }
    })
    .catch((error) => {
      sendResponse({ success: false, error: error.toString() });
    })
    .finally(() => {
      setTimeout(processQueue, REQUEST_INTERVAL);
    });
}

function updatePostingStatus(message) {
  chrome.storage.local.set({ postingStatus: message }, function () {
    if (chrome.runtime.lastError) {
      console.error("Storage error (updatePostingStatus):", chrome.runtime.lastError);
    }
  });
}

async function waitBeforeNextPost(timeInSeconds, currentIndex, totalGroups, deliveryOptions = null) {
  // Determine wait time based on delivery mode
  let actualWaitTime = timeInSeconds; // Default to legacy timeInSeconds

  // Default delivery behavior when user hasn't selected anything:
  // - every 3 posts (batchSize = 3)
  // - randomize wait between 70% and 150% of the base wait
  // If no deliveryOptions passed, treat as not customized and use defaults
  if (!deliveryOptions) {
    deliveryOptions = { mode: "throttled", batchSize: 3, waitMinutes: 0, randomizeWait: true, isCustom: false };
  }

  if (deliveryOptions) {
    // If user hasn't customized delivery settings (isCustom === false or undefined),
    // apply our new default: after every 3 posts, wait randomly between 140 and 520 seconds.
    if (!deliveryOptions.isCustom) {
      const postNumber = currentIndex + 1;
      if (postNumber % 3 === 0) {
        const minSec = 140;
        const maxSec = 520;
        actualWaitTime = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
      } else {
        actualWaitTime = 0;
      }
    } else if (deliveryOptions.mode === 'continuous') {
      // No wait for continuous mode
      actualWaitTime = 0;
    } else if (deliveryOptions.mode === 'throttled') {
      // Check if we should wait (every batchSize posts)
      const postNumber = currentIndex + 1;
      if (postNumber % deliveryOptions.batchSize === 0) {
        // Apply wait time in seconds
        actualWaitTime = deliveryOptions.waitMinutes * 60;
        
        // Apply randomization if enabled
        if (deliveryOptions.randomizeWait) {
          const minWait = Math.round(actualWaitTime * 0.7);
          const maxWait = Math.round(actualWaitTime * 1.5);
          actualWaitTime = Math.floor(Math.random() * (maxWait - minWait + 1)) + minWait;
        }
      } else {
        actualWaitTime = 0;
      }
    }
  }

  // If no wait needed, return immediately
  if (actualWaitTime === 0) {
    return;
  }

  updatePostingStatus(
    `Post ${
      currentIndex + 1
    } / ${totalGroups} done. Next post will continue in ${actualWaitTime} seconds.`
  );

  // Loop to decrement the remaining time every 10 seconds and log the message
  let remainingTime = actualWaitTime;
  while (remainingTime > 0) {
    // FIX: Check for stop request during wait to allow immediate stopping
    if (state.isStopRequested) {
      console.log("✅ Stop requested during wait, exiting early");
      break;
    }
    
    await sleep(10); // Sleep for 10 seconds
    remainingTime -= 10; // Decrement the remaining time by 10 seconds

    // Check to not go below zero
    if (remainingTime < 0) {
      remainingTime = 0;
    }

    // Update the log with the remaining time
    if (remainingTime > 0) {
      updatePostingStatus(
        `Post ${
          currentIndex + 1
        } / ${totalGroups} done. Next post will continue in ${remainingTime} seconds.`
      );
    }
  }
}

async function cleanUpAfterPosting(tabId) {
  chrome.tabs.remove(tabId, async () => {
    await sleep(2);
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "removeOverlay" }, () => {
          if (chrome.runtime.lastError) {
            // Silently ignore - tab might not have content script
          }
        });
      }
    });
  });
}

const state = {
  isStopRequested: false, // Flag to stop posting process
  avoidNightTimePosting: false, // (Future implementation) Flag to avoid night-time posting
  groupLinks: [], // List of group links to post content
  remainingGroups: [], // Links remaining for posting
  postsCompleted: [], // Track completed posts with success/failure
};

const getUserStatus = async () => {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["user", "isPremium", "postsRemaining"], (result) => {
      const email = result.user?.email;
      
      // PERFORMANCE FIX: Return cached data immediately for instant UI rendering
      // Do not block the popup from opening
      const cachedData = {
        postsRemaining: result.postsRemaining ?? 6,
        isPremium: result.isPremium ?? false,
        email: email
      };
      
      resolve(cachedData); // UI renders now with last-known state
      
      // BACKGROUND REFRESH: Non-blocking premium status verification
      // Only happens after UI is already displayed
      if (email) {
        verifyPremiumStatus(email)
          .then(freshStatus => {
            // Only update storage if status changed
            if (freshStatus.isPremium !== cachedData.isPremium) {
              console.log("[Premium Status] Status changed, updating storage");
              chrome.storage.sync.set({ isPremium: freshStatus.isPremium });
              // Notify popup if still open about the status change
              chrome.runtime.sendMessage({
                action: "statusChanged", 
                isPremium: freshStatus.isPremium,
                email: email
              }).catch(() => {
                // Popup may be closed, this is fine
              });
            } else {
              console.log("[Premium Status] Status unchanged, no update needed");
            }
          })
          .catch(error => {
            console.error("[Premium Status] Background verification failed:", error);
          });
      }
    });
  });
};

// Function to check stored schedules and execute logic
async function checkAndRunScheduledPosts() {
  (async () => {
    const userStatus = await getUserStatus();
    const isPremium = userStatus.isPremium;
    chrome.storage.sync.set({ postsRemaining: userStatus.postsRemaining });
    //const postsRemaining = userStatus.postsRemaining;
    const postsRemaining = 10;

    const data = await getDataFromDBCached();
    if (
      !(isPremium || postsRemaining > 0) ||
      !data?.state?.scheduledPosts?.length
    )
      return;

    const now = new Date();
    let currentHour = now.getHours(); // Keep 24-hour format for consistency
    const currentMinute = now.getMinutes();
    const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
    const currentDate = now.getDate();

    let updatedPosts = [];

    data.state.scheduledPosts.forEach((post) => {
      const { id, schedule } = post;
      if (!schedule || schedule.completed) return;

      const { frequency, time, recurring, startDate } = schedule;
      let [hour, minute] = time.split(":").map(Number);

      // Ensure hour is in 24-hour format (assume input is already in 24-hour format)
      hour = hour % 24; // Normalize hour within 24-hour range
      minute = parseInt(minute, 10);

      if (hour === currentHour && minute === currentMinute) {
        if (frequency === "once") {
          runPostLogic(id);
          post.schedule.completed = true; // Mark post as completed
          updatedPosts.push(post);
        } else if (frequency === "daily") {
          runPostLogic(id);
        } else if (
          frequency === "weekly" &&
          recurring?.weekDays?.includes(getDayName(currentDay))
        ) {
          runPostLogic(id);
        } else if (
          frequency === "monthly" &&
          recurring?.monthDays?.includes(currentDate)
        ) {
          runPostLogic(id);
        }
      }
    });

    // 🔄 Update the database with completed "once" posts
    if (updatedPosts.length > 0) {
      await updateDataInDB(data);
    }
  })();
}

function updatePostingProgress(status) {
  chrome.storage.local.set({ isPostingInProgress: status }, function () {
    if (chrome.runtime.lastError) {
      console.error("Storage error (updatePostingProgress):", chrome.runtime.lastError);
    }
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms * 1000));
}

async function handleResponse() {
  // Helper wrappers to use chrome.storage with async/await
  const getLocal = (keys) =>
    new Promise((resolve) => chrome.storage.local.get(keys, (res) => resolve(res)));
  const getSync = (keys) =>
    new Promise((resolve) => chrome.storage.sync.get(keys, (res) => resolve(res)));

  let response = null;
  // REMOVED: await sleep(5); - No need to wait 5 seconds before checking status
  // This caused unnecessary delays when composer fails to open immediately
  let timeTaken = 0;

  while (true) {
    const result = await getLocal(["operationDone"]);
    response = result?.operationDone;

    if (response) {
      if (response === "failed") {
        console.log("[handleResponse] ❌ Post failed - operationDone: failed");
        return false;
      } else if (response === "successful") {
        console.log("[handleResponse] ✅ Post successful - operationDone: successful");
        const data = await getSync(["user"]);
        const email = data?.user?.email;
        if (email) await useCredit(email);
        return true;
      }
    } else {
      await sleep(1);
      timeTaken++;
    }

    if (timeTaken > 120) {
      console.warn("[handleResponse] ⏱️ TIMEOUT after 120 seconds - no operationDone response");
      return false;
    }
  }
}

function updatePostingStatus(message) {
  chrome.storage.local.set({ postingStatus: message }, function () {
    if (chrome.runtime.lastError) {
      console.error("Storage error (updatePostingStatus):", chrome.runtime.lastError);
    }
  });
}

// CONTENT SCRIPT READINESS CHECK: Verify content.js is loaded before sending messages
async function checkContentScriptReady(tabId, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: "ping" }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.pong) {
            resolve(true);
          } else {
            reject(new Error("Content script did not respond to ping"));
          }
        });
      });
    } catch (error) {
      console.warn(`[Content Ready] Attempt ${attempt}/${maxRetries} failed:`, error.message);
      if (attempt < maxRetries) {
        await sleep(500); // Wait before retrying
      } else {
        throw error;
      }
    }
  }
}

async function postContent(tabId, contentAction) {
  // Verify content script is ready before sending post command
  try {
    await checkContentScriptReady(tabId);
  } catch (error) {
    console.error("[Content Ready] Failed to verify content script readiness:", error.message);
    throw error;
  }
  
  chrome.tabs.sendMessage(tabId, contentAction, () => {
    if (chrome.runtime.lastError) {
      console.error("[Post Content] Message send failed:", chrome.runtime.lastError.message);
    }
  });
  await sleep(5); // Wait for the content to be processed
}

// TAB RETRY LOGIC: Retry tab creation with exponential backoff
async function createTabWithRetry(url, maxRetries = 3, initialDelayMs = 2000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Tab Creation] Attempt ${attempt}/${maxRetries} for ${url}`);
      const tab = await createTab(url);
      return tab;
    } catch (error) {
      lastError = error;
      console.error(`[Tab Creation] Attempt ${attempt} failed:`, error.message);
      
      if (attempt < maxRetries) {
        const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
        console.log(`[Tab Creation] Waiting ${delayMs}ms before retry...`);
        await sleep(delayMs);
      }
    }
  }
  throw new Error(`Failed to create tab after ${maxRetries} attempts: ${lastError.message}`);
}

function createTab(url, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    let timeoutId = null;
    let listener = null;

    try {
      chrome.system.display.getInfo((displayInfo) => {
        if (chrome.runtime.lastError || !displayInfo) {
          // use default position
          const leftPosition = 0;
          const topPosition = 100;
          
          chrome.windows.create(
            {
              url: url,
              type: "popup",
              left: leftPosition,
              top: topPosition,
              width: 300,
              height: 300,
              focused: true,
            },
            (newWindow) => {
              if (chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
              }

              const tabId = newWindow?.tabs?.[0]?.id;
              const windowId = newWindow?.id;

              if (!tabId) {
                return reject(new Error("Failed to get tab id from newly created window"));
              }

              listener = (updatedTabId, changeInfo, tab) => {
                if (updatedTabId === tabId && changeInfo && changeInfo.status === "complete") {
                  // Cleanup
                  if (listener) chrome.tabs.onUpdated.removeListener(listener);
                  if (timeoutId) clearTimeout(timeoutId);

                  // Verify window still exists before resizing
                  chrome.windows.get(windowId, {}, function (win) {
                    if (chrome.runtime.lastError || !win) {
                      return reject(new Error("Window not found or already closed."));
                    }

                    chrome.windows.update(windowId, {
                      width: 600,
                      height: 500,
                      top: 100,
                      left: 100,
                      focused: true,
                    }, () => resolve({ id: tabId }));
                  });
                }
              };

              chrome.tabs.onUpdated.addListener(listener);

              // Setup timeout to avoid waiting forever
              timeoutId = setTimeout(() => {
                if (listener) chrome.tabs.onUpdated.removeListener(listener);
                return reject(new Error("Timed out waiting for tab to load"));
              }, timeoutMs);
            }
          );
          return;
        }
        const primaryDisplay = displayInfo.find((display) => display.isPrimary);

        const leftPosition = 0;
        const topPosition = (primaryDisplay && primaryDisplay.bounds && primaryDisplay.bounds.height - 200) || 100;

        chrome.windows.create(
          {
            url: url,
            type: "popup",
            left: leftPosition,
            top: topPosition,
            width: 300,
            height: 300,
            focused: true,
          },
          (newWindow) => {
            if (chrome.runtime.lastError) {
              return reject(new Error(chrome.runtime.lastError.message));
            }

            const tabId = newWindow?.tabs?.[0]?.id;
            const windowId = newWindow?.id;

            if (!tabId) {
              return reject(new Error("Failed to get tab id from newly created window"));
            }

            listener = (updatedTabId, changeInfo, tab) => {
              if (updatedTabId === tabId && changeInfo && changeInfo.status === "complete") {
                // Cleanup
                if (listener) chrome.tabs.onUpdated.removeListener(listener);
                if (timeoutId) clearTimeout(timeoutId);

                // Verify window still exists before resizing
                chrome.windows.get(windowId, {}, function (win) {
                  if (chrome.runtime.lastError || !win) {
                    return reject(new Error("Window not found or already closed."));
                  }

                  chrome.windows.update(windowId, {
                    width: 600,
                    height: 500,
                    top: 100,
                    left: 100,
                    focused: true,
                  }, () => resolve({ id: tabId }));
                });
              }
            };

            chrome.tabs.onUpdated.addListener(listener);

            // Setup timeout to avoid waiting forever
            timeoutId = setTimeout(() => {
              if (listener) chrome.tabs.onUpdated.removeListener(listener);
              return reject(new Error("Timed out waiting for tab to load"));
            }, timeoutMs);
          }
        );
      });
    } catch (err) {
      if (listener) chrome.tabs.onUpdated.removeListener(listener);
      if (timeoutId) clearTimeout(timeoutId);
      return reject(err);
    }
  });
}

async function handleStopRequest() {
  //let activeIndex = null;
  updatePostingStatus(`Posting stopped. Summary...`);
  updatePostingProgress("done");

  state.remainingGroups = state.groupLinks.slice(state.postsCompleted.length);
  state.remainingGroups.forEach((groupLink) => {
    state.postsCompleted.push({ link: groupLink, response: "failed" });
  });

  chrome.storage.local.set({ postsCompleted: state.postsCompleted }, () => {
    if (chrome.runtime.lastError) {
      console.error("Storage error (handleStopRequest):", chrome.runtime.lastError);
    }
  });
  
  // CRITICAL FIX: Clear all posting flags when stopping
  isCurrentlyPosting = false;
  isStopping = false;
  activeCampaignId = null;
  await persistState();
  console.log("[Stop] All posting flags cleared");

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "removeOverlay" }, () => {
        if (chrome.runtime.lastError) {
          // Silently ignore - tab might not have content script
        }
      });
    }
  });
}

function finalizePosting(postsCompleted) {
  // chrome.tabs.sendMessage(tabs[0].id, { action: "removeOverlay" });
  chrome.storage.local.set({ postsCompleted: postsCompleted }, () => {
    if (chrome.runtime.lastError) {
      console.error("Storage error (finalizePosting):", chrome.runtime.lastError);
    }
  });
  updatePostingStatus(`Posting completed successfully.`);
  updatePostingProgress("done");
  // Note: Flag clearing is now handled in finally block of initiatePostToFBAction
  console.log("✅ Posting session completed");
}

async function initiatePostToFBAction(request) {
  try {
    // CRITICAL FIX: Check if campaign still exists in storage before starting
    const campaignId = request.payload.campaignId;
    if (campaignId) {
      const stored = await getDataFromDBCached();
      const campaign = stored?.state?.scheduledPosts?.find(p => p.id === campaignId);
      if (!campaign) {
        console.error("❌ Campaign not found in storage - it was cancelled. Aborting.");
        updatePostingStatus("Campaign was cancelled. Posting aborted.");
        updatePostingProgress("done");
        return;
      }
    }
    
    // FIX: Reset state for new campaign and track it with campaignId
    Object.assign(state, {
      isStopRequested: false,
      postsCompleted: [],
      groupLinks: request.payload.group.urls.slice() || [], // Clone the array
      remainingGroups: [],
    });
    activeCampaignId = campaignId;
    await persistState(); // CRITICAL FIX: Persist immediately after setting activeCampaignId

    updatePostingProgress("started");
    updatePostingStatus(`Start posting`);

    chrome.storage.local.set({ showModal: true });
    const { timeInSeconds, group } = request.payload;

    const selectedGroups = group.urls;
    state.groupLinks = group.urls.slice(); // Clone the array
    
    // Store original post text to expand fresh for each group
    console.log("[POST] Original post:", request.payload.post);
    const originalPostText = request.payload.post.text;
    
    // goes through the group urls
    for (let i = 0; i < selectedGroups.length; i++) {
      if (state.isStopRequested) {
        break;
      }
      // CRITICAL FIX: Check campaign status before each post
      if (campaignId) {
        const stored = await getDataFromDBCached();
        const campaign = stored?.state?.scheduledPosts?.find(p => p.id === campaignId);
        if (!campaign) {
          console.warn("⚠️ Campaign was cancelled during posting. Stopping.");
          break;
        }
      }
      updatePostingStatus(`Post to group ${i + 1} / ${selectedGroups.length}`);

      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs.length > 0) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "showOverlay" }, () => {
            if (chrome.runtime.lastError) {
              // Silently ignore - tab might not have content script
            }
          });
        }
      });

      const groupLink = selectedGroups[i];
      // Open a new tab for each group link with retry logic
      let tab;
      try {
        tab = await createTabWithRetry(groupLink);
      } catch (error) {
        console.error(`[Campaign] Failed to create tab for ${groupLink}. Skipping this group.`, error);
        state.postsCompleted.push({
          status: "failed",
          groupLink,
          reason: "Tab creation failed after retries",
          timestamp: new Date().toISOString(),
        });
        continue; // Skip this group and move to the next
      }
      let shouldWait = true;
      let contentAction;
      switch (request.action) {
        case "POST_PAYLOAD":
          // CRITICAL FIX: Expand spintax FRESH for each group to get different randomized text
          const expandedPost = expandSpintax(originalPostText);
          console.log(`[POST] Group ${i + 1}: Expanded text:`, expandedPost);
          contentAction = {
            action: "contentPostPost",
            post: {
              ...request.payload.post,
              text: expandedPost,
            },
            background: request.payload.background,
          };
          break;
        default:
          console.error("Unknown action in initiatePostToFBAction:", request.action);
          throw new Error(`Unknown action: ${request.action}`);
      }
      // CRITICAL FIX: Final safety check before actually posting to Facebook
      if (campaignId) {
        const stored = await getDataFromDBCached();
        const campaign = stored?.state?.scheduledPosts?.find(p => p.id === campaignId);
        if (!campaign) {
          console.warn("⚠️ Campaign was cancelled - skipping this post to prevent orphan posts");
          state.postsCompleted.push({
            link: groupLink,
            response: "cancelled"
          });
          await cleanUpAfterPosting(tab.id);
          continue;
        }
      }
      
      // CRITICAL FIX: Clear operationDone BEFORE sending message to content script
      // so we don't accidentally delete the immediate failure response
      console.log("[Posting Loop] Clearing operationDone before sending post...");
      chrome.storage.local.remove("operationDone", () => {
        // console.log("operationDone deleted");
      });
      
      await postContent(tab.id, contentAction);
      let response;
      console.log("[Posting Loop] Post content sent, waiting for response from content script...");
      let responseHandled = await handleResponse();
      console.log("[Posting Loop] Response received:", responseHandled ? "successful" : "failed");
      state.postsCompleted.push({
        // postIndex: activeIndex || activeIndexProducts,
        link: selectedGroups[i],
        response: responseHandled ? "successful" : "failed",
      });
      // If post was successful, decrement postsRemaining for non-premium users
      if (responseHandled) {
        try {
          // SECURITY FIX: Verify premium status with server before decrementing posts
          chrome.storage.sync.get(["user"], async (userRes) => {
            const email = userRes.user?.email;
            if (email) {
              const premiumStatus = await verifyPremiumStatus(email);
              if (!premiumStatus.isPremium) {
                chrome.storage.sync.get(["postsRemaining"], (res) => {
                  const current = typeof res?.postsRemaining !== "undefined" ? res.postsRemaining : 6;
                  const next = Math.max(0, current - 1);
                  chrome.storage.sync.set({ postsRemaining: next });
                });
              }
            }
          });
        } catch (e) {
          console.error("Error verifying premium status for post decrement:", e);
        }
      }
      await cleanUpAfterPosting(tab.id);
      console.log(`[Posting Loop] ✅ Cleanup complete for post ${i + 1}/${selectedGroups.length}`);
      // if (responseHandled && i + 1 != selectedGroups.length && shouldWait) {
      //   await waitBeforeNextPost(timeInSeconds, i, selectedGroups.length);
      // }
      if (i + 1 < selectedGroups.length && shouldWait) {
        console.log(`[Posting Loop] 🕐 Waiting before next post (${i + 2}/${selectedGroups.length})...`);
        await waitBeforeNextPost(timeInSeconds, i, selectedGroups.length, request.payload.deliveryOptions);
      }
      await sleep(1);
      console.log(`[Posting Loop] 🚀 Moving to next group (${i + 2}/${selectedGroups.length})...`);
    }
    finalizePosting(state.postsCompleted);
  } catch (err) {
    console.error("initiatePostToFBAction error:", err);
    // Ensure partial cleanup: mark remaining groups as failed
    state.remainingGroups = state.groupLinks.slice(state.postsCompleted.length);
    state.remainingGroups.forEach((groupLink) => {
      state.postsCompleted.push({ link: groupLink, response: "failed" });
    });
    try {
      chrome.storage.local.set({ postsCompleted: state.postsCompleted }, () => {
        if (chrome.runtime.lastError) {
          console.error("Storage error (postsCompleted):", chrome.runtime.lastError);
        }
      });
    } catch (e) {
      // ignore storage errors
    }
    updatePostingStatus(`Posting failed: ${err?.message || err}`);
    updatePostingProgress("done");
  }
  // CRITICAL FIX: Removed duplicate cleanup block - cleanup is handled in POST_PAYLOAD handler finally block
}

function runPostLogic(postId) {
  (async () => {
    // CRITICAL FIX: Check if a campaign is already running before starting scheduled post
    if (isCurrentlyPosting || isStopping) {
      console.log("⚠️ runPostLogic blocked: campaign already running or stopping");
      return;
    }

    const userStatus = await getUserStatus();
    const isPremium = userStatus.isPremium;
    const postsRemaining = userStatus.postsRemaining;

    const data = await getDataFromDBCached();
    if (isPremium || postsRemaining > 0) {
      if (!!data) {
        if (!!data.state && !!data.state.scheduledPosts) {
          const StoreData = data.state.scheduledPosts;
          const post = StoreData.find((item) => item.id === postId);

          if (post) {
            // CRITICAL FIX: Set state guards BEFORE calling initiatePostToFBAction
            isCurrentlyPosting = true;
            activeCampaignId = postId;
            await persistState();
            
            // Reuse the existing POST_PAYLOAD logic
            const request = {
              action: "POST_PAYLOAD",
              payload: {
                post: post.schedule.postData.post,
                group: post.schedule.postData.group,
                background: post.schedule.postData.background,
                timeInSeconds: parseTime(post.schedule.time),
                campaignId: postId, // CRITICAL FIX: Pass campaign ID so background can track it
              },
            };
            initiatePostToFBAction(request)
              .catch((err) => console.error("Error during scheduled posting:", err))
              .finally(async () => {
                isCurrentlyPosting = false;
                activeCampaignId = null;
                isStopping = false;
                await persistState();
                console.log("Scheduled campaign cleanup complete");
              });
            if (!isPremium) {
              const newPostsRemaining = postsRemaining - 1;
              chrome.storage.sync.set({ postsRemaining: newPostsRemaining });
            }
          }
        }
      }
    }
  })();

  // Add your actual post logic here
}

async function getCredits(email) {
  if (!email) return console.log("Please enter an email");

  const res = await fetch(
    `https://server.fbgroupbulkposter.com/credits/${email}`
  );
  const data = await res.json();
  chrome.storage.sync.set({ postsRemaining: data.credits });
  return data;
}

async function useCredit(email) {
  if (!email) return console.log("Please enter an email");

  const res = await fetch(
    `https://server.fbgroupbulkposter.com/credits/${email}`,
    {
      method: "POST",
    }
  );

  const data = await res.json();
  // Whenever credits are used, decrement postsRemaining for non-premium users
  try {
    // SECURITY FIX: Verify premium status with server instead of trusting local storage
    const premiumStatus = await verifyPremiumStatus(email);
    if (!premiumStatus.isPremium) {
      chrome.storage.sync.get(["postsRemaining"], (r) => {
        const current = typeof r?.postsRemaining !== "undefined" ? r.postsRemaining : 6;
        const next = Math.max(0, current - 1);
        chrome.storage.sync.set({ postsRemaining: next });
      });
    }
  } catch (e) {
    console.error("Error verifying premium status in useCredit:", e);
  }

  return data;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkPremium") {
    if (request.email) {
      (async () => {
        try {
          const result = await fetchSubscriptionStatus(request.email);
          sendResponse(result); // Send the result back to the caller
        } catch (error) {
          sendResponse({ error: "Failed to check subscription" });
        }
      })();
      return true; // Important: keep the message channel open for async response
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkCredits") {
    (async () => {
      try {
        if (!request.email) console.log("No email found ", request.email);
        const subscription = await fetchSubscriptionStatus(request.email);
        const credits = await getCredits(request.email);

        console.log(request, credits, subscription);

        sendResponse({
          subscription: subscription?.isPremium,
          postsRemaining: credits?.credits,
          subscriptionId: subscription?.subscriptionId,
        });
      } catch (err) {
        console.error("Error in checkCredits handler:", err);
        sendResponse({ error: "Failed to fetch credits or subscription" });
      }
    })();

    // 👇 Tell Chrome to keep the message channel open for the async response
    return true;
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkLoginState") {
    const checkCookie = (url, callback) => {
      chrome.cookies.get({ url, name: "firebaseUser" }, async (cookie) => {
        if (cookie) {
          try {
            const userObj = JSON.parse(decodeURIComponent(cookie.value));
            await chrome.storage.sync.set({
              last_loggedin_user: userObj.email,
            });

            await chrome.storage.sync.set({ user: userObj });

            callback({ loggedIn: true, user: userObj });
          } catch (err) {
            console.error("Error processing cookie", err);
            callback(null);
          }
        } else {
          callback(null); // Try next fallback
        }
      });
    };

    // Check production cookie
    checkCookie("https://auth.fbgroupbulkposter.com/", (result) => {
      if (result) {
        sendResponse(result);
      } else {
        // Fallback to staging/local
        checkCookie(
          "https://clownfish-app-google-auth-v2-nghvc.ondigitalocean.app/",
          (localResult) => {
            if (localResult) {
              sendResponse(localResult);
              chrome.storage.sync.set({ user: localResult.user });
            } else {
              chrome.storage.sync.set({ user: {} }, () => {
                sendResponse({ loggedIn: false, user: {} });
              });
            }
          }
        );
      }
    });

    return true; // ✅ Keeps message channel open for async sendResponse
  }

  if (request.action === "handleLogout") {
    const removeCookie = (url, cb) => {
      chrome.cookies.remove({ url, name: "firebaseUser" }, cb);
    };

    removeCookie("https://auth.fbgroupbulkposter.com/", () => {
      removeCookie(
        "https://clownfish-app-google-auth-v2-nghvc.ondigitalocean.app/",
        () => {
          chrome.storage.sync.set({ user: {} }, () => {
            chrome.runtime.sendMessage({ action: "highlightContentLogout" });
          });
        }
      );
    });
    chrome.storage.sync.remove(["postsRemaining", "isPremium", "user"], () => {
      console.log("postsRemaining and isPremium removed from storage.");
    });

    // CRITICAL FIX: Clear cache and triggered snapshots on logout
    dbCache = null;
    dbCacheTime = 0;
    triggeredSet.clear();
    console.log("[Logout] Cleared dbCache and triggeredSet");

    // ❌ No sendResponse used, so no need to return true
  }

  if (request.action === "isPostInPRogress") {
    chrome.storage.local.get(["showModal"], (result) => {
      sendResponse({ working: result.showModal, user: {} });
    });
    return true; // ✅ async sendResponse
  }

  if (request.action === "resetPostingState") {
    (async () => {
      console.log("✅ Reset request received. Clearing posting flags...");
      isCurrentlyPosting = false;
      isStopping = false;
      activeCampaignId = null;
      await persistState(); // CRITICAL FIX: Await to ensure state is persisted
      console.log("✅ Posting state reset complete");
      sendResponse({ success: true, message: "Posting state cleared" });
    })();
    return true; // Keep channel open for async response
  }

  if (request.action === "DELETE_CAMPAIGN") {
    // CAMPAIGN CLEANUP: Delete a specific campaign from storage
    (async () => {
      const campaignId = request.campaignId;
      if (!campaignId) {
        sendResponse({ success: false, message: "Campaign ID required" });
        return;
      }
      
      try {
        const data = await getDataFromDB();
        if (data && data.state && data.state.scheduledPosts) {
          const filtered = data.state.scheduledPosts.filter(p => p.id !== campaignId);
          const updated = { ...data, state: { ...data.state, scheduledPosts: filtered } };
          
          // Save back to storage
          chrome.storage.local.set({ state: updated.state }, () => {
            console.log(`[Campaign Cleanup] Deleted campaign ${campaignId}`);
            sendResponse({ success: true, message: `Campaign ${campaignId} deleted` });
          });
        } else {
          sendResponse({ success: false, message: "No campaigns found" });
        }
      } catch (error) {
        console.error("[Campaign Cleanup] Error deleting campaign:", error);
        sendResponse({ success: false, message: error.message });
      }
    })();
    return true; // CRITICAL FIX: Keep message channel open for async sendResponse
  }

  if (request.action === "POST_PAYLOAD") {
    // CRITICAL FIX: Prevent concurrent posting sessions AND track campaign ID
    console.log("POST_PAYLOAD received. Current state - isCurrentlyPosting:", isCurrentlyPosting, "isStopping:", isStopping);
    
    if (isCurrentlyPosting || isStopping) {
      console.log("⚠️ POST_PAYLOAD rejected: campaign already running");
      sendResponse({ success: false, message: "A campaign is already running. Please wait for it to finish or use the Stop button to cancel." });
      return;
    }
    
    // CRITICAL FIX: Set flag IMMEDIATELY before any async operations to prevent race condition
    const campaignId = request.payload.campaignId;
    isCurrentlyPosting = true;
    activeCampaignId = campaignId;
    console.log("✅ POST_PAYLOAD accepted: starting post operation for campaign", campaignId);
    
    // Wrap in async IIFE to await persistState() while keeping return true
    (async () => {
      // Persist the flag immediately
      await persistState(); // MUST await to ensure state is saved before continuing
      
      // Start posting and ensure the flag is cleared regardless of outcome
      initiatePostToFBAction(request)
        .catch((err) => console.error("Error during posting:", err))
        .finally(async () => {
          isCurrentlyPosting = false;
          activeCampaignId = null;
          isStopping = false;
          await persistState(); // CRITICAL FIX: Persist state after clearing flags
          console.log("Campaign cleanup complete: cleared all posting flags");
        });
    })();
    return true; // Keep channel open
  }

  if (request.action === "stopPosting") {
    // Wrap in async IIFE to properly handle persistState()
    (async () => {
      // CRITICAL FIX: Set stopping flag first to prevent race conditions
      isStopping = true;
      state.isStopRequested = true;
      await persistState(); // CRITICAL FIX: Persist immediately after setting isStopping
      await handleStopRequest();
      console.log("✅ Posting stopped by user, cleanup complete");
      sendResponse({ success: true });
    })();
    return true; // Keep channel open for async response
  }

  if (request.action === "get_user_info") {
    chrome.storage.sync.get(["user"], (data) => {
      if (chrome.runtime.lastError) {
        console.error("Storage error (get_user_info):", chrome.runtime.lastError);
        sendResponse({ success: false, user: {} });
        return;
      }
      const user = data.user || {};
      const userInfo = {
        name: user.name || null,
        email: user.email || null,
        id: user.uid || user.id || null,
      };
      sendResponse({ success: true, user: userInfo });
    });
    return true; // ✅ async sendResponse
  }
});

function getMessageHTML(message) {
  // Full class string converted to selector
  const classSelector =
    "html-div xdj266r x14z9mp xat24cr x1lziwak xexx8yu xyri2b x18d9i69 x1c1uobl x78zum5 x1n2onr6 xh8yej3";
  const el = document.querySelector(`div.${classSelector.replace(/ /g, ".")}`);
  const htmlContent = el ? el.innerHTML : message.payload.html;
  return JSON.stringify({ html: htmlContent });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "callAi") {
    (async () => {
      try {
        const resp = await fetch(
          "https://server.fbgroupbulkposter.com/dom-analyze",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: getMessageHTML(message),
          }
        );

        const rawText = await resp.text();

        if (!resp.ok) {
          sendResponse({ error: `Server error ${resp.status}` });
        } else {
          try {
            const data = JSON.parse(rawText);
            sendResponse({ selector: data.selector });
          } catch (parseErr) {
            sendResponse({ error: "Invalid JSON from server" });
          }
        }
      } catch (err) {
        sendResponse({ error: "Fetch failed" });
      }
    })(); // 👈 Call the async IIFE

    return true; // 👈 MUST be returned synchronously from listener
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "show_select_files") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return;

      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: "show_select_files_content" },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("Failed to send message to content script:", chrome.runtime.lastError.message);
            sendResponse({ error: chrome.runtime.lastError.message });
            return;
          }
          sendResponse(response); // Pass the response back to popup.js
        }
      );
    });

    return true; // ⬅️ KEEP MESSAGE PORT OPEN
  }
});

const fileChunksMap = new Map(); // temp in-memory storage for chunks

// IndexedDB setup
function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("MediaDB", 1);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("media")) {
        db.createObjectStore("media", { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, fileId } = message;
  if (action === "fileChunk") {
    const { index, totalChunks, name, type, size, data: base64 } = message;

    if (!fileChunksMap.has(fileId)) {
      fileChunksMap.set(fileId, {
        chunks: Array(totalChunks),
        count: 0,
        total: totalChunks,
        meta: { name, type, size, id: fileId },
      });
    }
    const fileData = fileChunksMap.get(fileId);

    const binary = atob(base64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      arr[i] = binary.charCodeAt(i);
    }

    fileData.chunks[index] = arr;
    fileData.count++;

    if (fileData.count === fileData.total) {
      const { chunks, meta } = fileData;
      const fullBlob = new File(chunks, meta.name, {
        type: meta.type,
        lastModified: Date.now(),
      });

      saveFileToIndexedDB(meta.id, fullBlob);
      fileChunksMap.delete(fileId);
    }

    sendResponse(); // ✅ resolves the promise in content script
    return true; // ✅ keep message channel open for async
  }

  if (action === "clearCurrentDB") {
    if (message.fileId) {
      deleteFileFromIndexedDB(message.fileId);
    } else {
      // indexedDB.databases().then(dbs => dbs.forEach(db => indexedDB.deleteDatabase(db.name)));
    }
    sendResponse();
    return true;
  }
});

async function saveFileToIndexedDB(id, fileObj) {
  const db = await getDB();
  const tx = db.transaction("media", "readwrite");
  const store = tx.objectStore("media");

  const entry = { key: id, value: { blob: fileObj, type: fileObj.type } };
  store.put(entry);
}

async function deleteFileFromIndexedDB(id) {
  const db = await getDB();
  const tx = db.transaction("media", "readwrite");
  const store = tx.objectStore("media");
  store.delete(id);
}

function injectContentScriptToAllTabs() {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (
        tab.id &&
        tab.url &&
        tab.url.startsWith("http") &&
        !tab.url.includes("chrome://") &&
        !tab.url.includes("chrome-extension://")
      ) {
        chrome.scripting
          .executeScript({
            target: { tabId: tab.id },
            files: ["content.js"],
          })
          .catch((err) => {
            console.warn(`Failed to inject into tab ${tab.id}:`, err.message);
          });
      }
    }
  });
}

function initializeDB() {
  const request = indexedDB.open("permanentStore", 1);

  request.onupgradeneeded = (event) => {
    const db = event.target.result;

    if (!db.objectStoreNames.contains("snapshots")) {
      db.createObjectStore("snapshots", { keyPath: "id" }); // or use autoIncrement: true if needed
    }
  };

  request.onsuccess = () => {
    request.result.close();
  };

  // request.onerror = (event) => {
  //   console.error("❌ Error initializing IndexedDB:", event.target.error);
  // };
}

chrome.runtime.onInstalled.addListener(() => {
  injectContentScriptToAllTabs();
  initializeDB();
});

chrome.runtime.onStartup.addListener(() => {
  injectContentScriptToAllTabs();
});

//Check for content.js periodically
function checkAndInjectContentScript(tab) {
  chrome.scripting.executeScript(
    {
      target: { tabId: tab.id },
      func: () => {
        return !!window.__myExtensionContentLoaded;
      },
    },
    (results) => {
      if (
        chrome.runtime.lastError ||
        !results ||
        !results[0] ||
        !results[0].result
      ) {
        // If script not injected or marker not found
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        });
      }
    }
  );
}

function watchTabsPeriodically() {
  setInterval(() => {
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.url && tab.url.startsWith("http")) {
          checkAndInjectContentScript(tab);
        }
      }
    });
  }, 1000); // Every 1 second
}

// Call this once on startup
watchTabsPeriodically();

//Handing versions
// background.js
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "update") {
    const newVer = chrome.runtime.getManifest().version;
    chrome.storage.local.set({ updatedVersion: newVer }, () => {
      if (chrome.runtime.lastError) {
        console.error("Storage error (updatedVersion):", chrome.runtime.lastError);
      }
    });
  }
});

// STARTUP RECOVERY: Clear stale posting flags on browser restart
// AUTO-CLEANUP: Delete campaigns older than 30 days on startup
async function autoCleanupOldCampaigns() {
  try {
    const data = await getDataFromDB();
    if (!data || !data.state || !data.state.scheduledPosts) return;
    
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    
    const filtered = data.state.scheduledPosts.filter(campaign => {
      const createdTime = campaign.createdAt ? new Date(campaign.createdAt).getTime() : now;
      const age = now - createdTime;
      if (age > thirtyDaysMs) {
        console.log(`[Auto-Cleanup] Deleting campaign ${campaign.id} (age: ${Math.floor(age / (24 * 60 * 60 * 1000))} days)`);
        return false; // Exclude from filtered list
      }
      return true; // Keep campaign
    });
    
    if (filtered.length < data.state.scheduledPosts.length) {
      const updated = { ...data, state: { ...data.state, scheduledPosts: filtered } };
      chrome.storage.local.set({ state: updated.state }, () => {
        console.log(`[Auto-Cleanup] Removed ${data.state.scheduledPosts.length - filtered.length} old campaigns`);
      });
      // Also clear cache since data changed
      dbCache = null;
      dbCacheTime = 0;
    }
  } catch (error) {
    console.error("[Auto-Cleanup] Error during cleanup:", error);
  }
}

chrome.runtime.onStartup.addListener(async () => {
  console.log("[Startup] Browser restarted. Checking for stale posting flags...");
  isCurrentlyPosting = false;
  activeCampaignId = null;
  isStopping = false;
  await persistState();
  
  // Run auto-cleanup of old campaigns
  await autoCleanupOldCampaigns();
  
  console.log("[Startup] Stale flags cleared");
});

chrome.runtime.requestUpdateCheck((status) => {
  if (status === "update_available") {
    chrome.runtime.reload(); // or show a prompt before reloading
  }
});

chrome.runtime.requestUpdateCheck((status) => {
  if (status === "update_available") {
    showUpdateMessage();
  }
});

function showUpdateMessage() {
  // Prevent duplicate banners
  if (document.getElementById("ext-update-banner")) return;

  const banner = document.createElement("div");
  banner.id = "ext-update-banner";
  banner.textContent = "🔄 A new update is available. Click to reload.";
  banner.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #222;
    color: #fff;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    z-index: 9999;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  `;

  banner.onclick = () => {
    chrome.runtime.reload();
  };

  document.body.appendChild(banner);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "snapshot_log" && message.payload) {
    const snapshot = message.payload;

    // Optional: Upload to server
    fetch("https://server.fbgroupbulkposter.com/api/snapshots", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(snapshot),
    });
  }
});

const fetchSubscriptionStatus = async (email) => {
  try {
    const response = await fetch(
      `https://auth.fbgroupbulkposter.com/api/subscription?email=${encodeURIComponent(email)}`
    );
    const data = await response.json();

    if (data.status === "success" && data.subscription) {
      // Store for caching purposes only - NEVER trust this for security checks
      chrome.storage.sync.set({
        isPremium: data.subscription.status === "active",
      });
      chrome.storage.sync.set({
        subscriptionId: data.subscription.subscription_id,
      });
      return {
        isPremium: data.subscription.status === "active",
        subscriptionId: data.subscription.subscription_id,
      };
    } else {
      chrome.storage.sync.set({ isPremium: false });
      chrome.storage.sync.set({
        subscriptionId: null,
      });
      return { isPremium: false, subscriptionId: null };
    }
  } catch (error) {
    console.error("Security: Error fetching subscription status from server:", error);
    // SECURITY FIX: On error, assume NOT premium to prevent unauthorized access
    return { isPremium: false, subscriptionId: null };
  }
};

// SECURITY FIX: Always verify premium status with server, never trust client-side storage
// This prevents users from modifying isPremium in DevTools to unlock premium features
const verifyPremiumStatus = async (email) => {
  if (!email) {
    return { isPremium: false, subscriptionId: null };
  }
  try {
    const result = await fetchSubscriptionStatus(email);
    return result;
  } catch (error) {
    console.error("Security: Failed to verify premium status:", error);
    // SECURITY: Default to non-premium if verification fails
    return { isPremium: false, subscriptionId: null };
  }
};

//Scheduler
function shouldTrigger(schedule) {
  const now = new Date();
  const startDate = new Date(schedule.startDate);
  const [hour, minute] = schedule.time.split(":").map(Number);

  // Scheduled time on today's date
  const scheduledTime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute
  );

  if (schedule.frequency === "once") {
    const scheduledOnce = new Date(startDate);
    scheduledOnce.setHours(hour, minute, 0, 0);
    return now >= scheduledOnce;
  }

  if (schedule.frequency === "daily") {
    return now >= scheduledTime;
  }

  if (schedule.frequency === "weekly") {
    const today = now
      .toLocaleString("en-US", { weekday: "long" })
      .toLowerCase();
    const weekDays = schedule.recurring?.weekDays || [];
    return weekDays.includes(today) && now >= scheduledTime;
  }

  if (schedule.frequency === "monthly") {
    const todayDate = now.getDate();
    const monthDays = schedule.recurring?.monthDays || [];
    return monthDays.includes(todayDate) && now >= scheduledTime;
  }

  return false;
}

//Scheduler
function generateUniqueId() {
  return `snap_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
}

function openDB(name, version, onUpgradeNeeded) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);

    request.onupgradeneeded = (e) => {
      const db = request.result;
      onUpgradeNeeded?.(db);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function writeToStore(db, storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.put(value);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function clearStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function copyAndClearMediaDBToPermanentStore(metadata) {
  const TEMP_DB_NAME = "MediaDB";
  const PERMANENT_DB_NAME = "permanentStore";
  const TEMP_STORE_NAME = "media";
  const SNAPSHOT_STORE_NAME = "snapshots";

  try {
    const tempDb = await openDB(TEMP_DB_NAME, 1, (db) => {
      if (!db.objectStoreNames.contains(TEMP_STORE_NAME)) {
        db.createObjectStore(TEMP_STORE_NAME, { keyPath: "key" });
      }
    });

    const mediaItems = await readAllFromStore(tempDb, TEMP_STORE_NAME);

    // if (mediaItems.length === 0) {
    //   console.warn("⚠️ No media to archive. Skipping.");
    //   tempDb.close();
    //   return;
    // }

    const permanentDb = await openDB(PERMANENT_DB_NAME, 1, (db) => {
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) {
        db.createObjectStore(SNAPSHOT_STORE_NAME, { keyPath: "id" });
      }
    });

    const snapshotId = generateUniqueId();

    const snapshotEntry = {
      id: snapshotId,
      createdAt: new Date().toISOString(),
      metadata,
      items: mediaItems || [],
    };

    await writeToStore(permanentDb, SNAPSHOT_STORE_NAME, snapshotEntry);

    await clearStore(tempDb, TEMP_STORE_NAME);
    tempDb.close();
    permanentDb.close();
  } catch (error) {
    // console.error("❌ [Error] Failed during archive process:", error);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "schedulePost") {
    copyAndClearMediaDBToPermanentStore(msg.payload || {});
    sendResponse({ success: true });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "getScheduledPosts") {
    (async () => {
      try {
        const db = await openDB("permanentStore", 1, (db) => {
          if (!db.objectStoreNames.contains("snapshots")) {
            db.createObjectStore("snapshots", { keyPath: "id" });
          }
        });

        const snapshots = await readAllFromStore(db, "snapshots");

        sendResponse({ success: true, snapshots }); // ✅ resolve properly
        db.close();
      } catch (err) {
        sendResponse({ success: false, error: err.message }); // ✅ fail properly
      }
    })();

    return true; // ✅ MUST return true for async
  }
});

async function startScheduleCronJob() {
  setInterval(async () => {
    try {
      const db = await openDB("permanentStore", 1);
      const tx = db.transaction("snapshots", "readonly");
      const store = tx.objectStore("snapshots");

      const request = store.getAll();
      request.onsuccess = async () => {
        const now = new Date();
        const snapshots = request.result || [];

        // CRITICAL FIX: Use for...of instead of forEach to properly await async operations
        for (const snapshot of snapshots) {
          const { id, metadata, items = [] } = snapshot;
          // CRITICAL FIX: Skip snapshots that already completed successfully
          if (!metadata?.schedule || triggeredSet.has(id) || snapshot.status === "success") continue;

          const { schedule, content } = metadata;
          const { frequency, startDate, time, recurring } = schedule;
          const [hours, minutes] = time.split(":").map(Number);

          const scheduled = new Date(startDate);
          scheduled.setHours(hours, minutes, 0, 0);

          const todayAtTime = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            hours,
            minutes,
            0,
            0
          );

          let shouldTrigger = false;

          // Map day index to day ID used in CompactScheduleModal
          const getDayId = (dayIndex) => {
            // dayIndex 0 = Sunday (matching JS Date.getDay())
            return dayIndex;
          };

          switch (frequency) {
            case "once":
              shouldTrigger = isWithinNextHour(scheduled, now);
              break;

            case "daily":
              shouldTrigger = isWithinNextHour(todayAtTime, now);
              break;

            case "weekly":
              const currentDayId = getDayId(now.getDay());
              if (recurring?.weekDays?.includes(currentDayId)) {
                shouldTrigger = isWithinNextHour(todayAtTime, now);
              }
              break;

            case "monthly":
              if (recurring?.monthDays?.includes(now.getDate())) {
                shouldTrigger = isWithinNextHour(todayAtTime, now);
              }
              break;

            default:
              console.error("Unknown scheduling frequency:", frequency);
              shouldTrigger = false;
              break;
          }

          if (shouldTrigger) {
            console.log("⏰ TRIGGERED:", id);
            console.log("📄 Content:", content);
            console.log("📎 Media Items:", items);
            triggeredSet.add(id);
            // CRITICAL FIX: Persist triggeredSet immediately to survive extension reload
            await persistState();

            // Automatically mark as done (for testing) after 3s
            await triggerPostFromSnapshot(metadata, items, id);
          }
        }
      };
    } catch (error) {
      console.error("❌ Cron job error:", error);
    }
  }, 30000); // Every 30 seconds (increased from 5s to reduce battery drain)
}

// Delete if done
// function markSnapshotAsDone(snapshotId) {
//   const request = indexedDB.open("permanentStore", 1);
//   request.onsuccess = () => {
//     const db = request.result;
//     const tx = db.transaction("snapshots", "readwrite");
//     const store = tx.objectStore("snapshots");

//     const deleteReq = store.delete(snapshotId);
//     deleteReq.onsuccess = () => {
//       triggeredSet.delete(snapshotId);
//       console.log(
//         `🗑️ Snapshot '${snapshotId}' removed from DB (Marked as Done).`
//       );
//     };
//     deleteReq.onerror = () => {
//       console.error(`❌ Failed to remove '${snapshotId}':`, deleteReq.error);
//     };
//   };
//   request.onerror = () => {
//     console.error("❌ Failed to open DB in markSnapshotAsDone:", request.error);
//   };
// }

// ✅ Manual/External trigger to mark as done
function markSnapshotAsDone(snapshotId) {
  const request = indexedDB.open("permanentStore", 1);

  request.onsuccess = () => {
    const db = request.result;
    const tx = db.transaction("snapshots", "readwrite");
    const store = tx.objectStore("snapshots");

    const getReq = store.get(snapshotId);

    getReq.onsuccess = () => {
      const snapshot = getReq.result;

      if (!snapshot) {
        console.warn(`⚠️ No snapshot found with ID: ${snapshotId}`);
        return;
      }

      // Update status
      snapshot.status = "success";

      const putReq = store.put(snapshot);

      putReq.onsuccess = () => {
        triggeredSet.delete(snapshotId);
      };

      putReq.onerror = () => {
        console.error(
          `❌ Failed to update snapshot '${snapshotId}':`,
          putReq.error
        );
      };
    };

    getReq.onerror = () => {
      console.error(`❌ Failed to get snapshot '${snapshotId}':`, getReq.error);
    };
  };

  request.onerror = () => {
    console.error("❌ Failed to open DB in markSnapshotAsDone:", request.error);
  };
}

function isWithinNextHour(scheduledTime, now) {
  const diff = now.getTime() - scheduledTime.getTime();
  return diff >= 0 && diff <= 60 * 120 * 1000;
}

async function triggerPostFromSnapshot(metadata, items, snapShotId) {
  // SECURITY FIX: Always verify premium status with server, never trust local storage
  let postsRemaining = await chrome.storage.sync.get(["postsRemaining"]);
  let userEmail = await chrome.storage.sync.get(["user"]);
  const email = userEmail.user?.email;
  
  let isPremium = false;
  if (email) {
    const premiumStatus = await verifyPremiumStatus(email);
    isPremium = premiumStatus.isPremium;
  }
  
  if (postsRemaining.postsRemaining <= 0 && !isPremium) {
    return;
  }

  (async () => {
    const groupLinks = metadata?.group?.urls?.slice() || [];
    const timeInSeconds = metadata?.timeInSeconds || 10;

    Object.assign(state, {
      isStopRequested: false,
      postsCompleted: [],
      groupLinks: groupLinks,
      remainingGroups: [],
    });

    updatePostingProgress("started");
    updatePostingStatus(`Starting scheduled post...`);
    chrome.storage.local.set({ showModal: true });

    for (let i = 0; i < groupLinks.length; i++) {
      if (state.isStopRequested) break;

      const groupLink = groupLinks[i];
      updatePostingStatus(`Posting to group ${i + 1} / ${groupLinks.length}`);

      // UI overlay
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "showOverlay" }, () => {
            if (chrome.runtime.lastError) {
              // Silently ignore - tab might not have content script
            }
          });
        }
      });

      // Open tab and start posting
      const tab = await createTab(groupLink);
      const images = await Promise.all(
        items
          .filter((item) => item?.value?.type?.startsWith("image"))
          .map(async (item) => ({
            type: "image",
            data: await blobToBase64(item.value.blob),
          }))
      );

      // Compose the post action
      const expandedText = expandSpintax(metadata?.content || "");
      const postAction = {
        action: "contentPostPost",
        post: {
          text: expandedText,
          scheduled: true,
          video_id: snapShotId, // placeholder IDs
          images,
        },
        background: metadata?.background || null,
      };
      // Post to group
      await postContent(tab.id, postAction);

      // Wait for feedback from content script
      chrome.storage.local.remove("operationDone");
      const responseHandled = await handleResponse();

      state.postsCompleted.push({
        link: groupLink,
        response: responseHandled ? "successful" : "failed",
      });

      // If snapshot post was successful, decrement postsRemaining for non-premium users
      if (responseHandled) {
        try {
          // SECURITY FIX: Verify premium status with server before decrementing posts
          let userEmail = await chrome.storage.sync.get(["user"]);
          const email = userEmail.user?.email;
          if (email) {
            const premiumStatus = await verifyPremiumStatus(email);
            if (!premiumStatus.isPremium) {
              chrome.storage.sync.get(["postsRemaining"], (res) => {
                const current = typeof res?.postsRemaining !== "undefined" ? res.postsRemaining : 6;
                const next = Math.max(0, current - 1);
                chrome.storage.sync.set({ postsRemaining: next });
              });
            }
          }
        } catch (e) {
          console.error("Error verifying premium status for snapshot post:", e);
        }
      }

      await cleanUpAfterPosting(tab.id);

      if (responseHandled && i + 1 < groupLinks.length) {
        await waitBeforeNextPost(timeInSeconds, i, groupLinks.length, metadata?.deliveryOptions);
      }

      await sleep(1);
    }

    finalizePosting(state.postsCompleted);
  })();
}

startScheduleCronJob();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "snapshotPort") {
    port.onMessage.addListener((msg) => {
      if (msg.action === "fetchSnapshotItems") {
        fetchSnapshotItemsInChunks(msg.snapshotId, port);
      }
    });
  }
});

async function fetchSnapshotItemsInChunks(snapshotId, port) {
  const CHUNK_SIZE = 1024 * 1024;

  const dbReq = indexedDB.open("permanentStore", 1);
  dbReq.onsuccess = () => {
    const database = dbReq.result;
    const tx = database.transaction("snapshots", "readonly");
    const store = tx.objectStore("snapshots");

    const request = store.get(snapshotId);

    request.onsuccess = async () => {
      const snapshot = request.result;

      if (!snapshot) {
        port.disconnect();
        return;
      }

      const items = snapshot.items || [];

      for (let i = 0; i < items.length; i++) {
        const { key, value } = items[i];
        const blob = value.blob;
        const arrayBuffer = await blob.arrayBuffer();
        const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE);

        for (let j = 0; j < totalChunks; j++) {
          const start = j * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength);
          const chunk = arrayBuffer.slice(start, end);

          port.postMessage({
            action: "receiveChunk",
            index: j,
            total: totalChunks,
            key,
            type: value.type,
            itemIndex: i,
            chunk: Array.from(new Uint8Array(chunk)),
          });
        }
      }

      port.postMessage({
        action: "allChunksSent",
        itemsCount: items.length,
      });

      database.close();
    };

    request.onerror = () => {
      database.close();
      port.disconnect();
    };
  };

  dbReq.onerror = () => {
    port.disconnect();
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action == "schedulePostDone") {
    if (typeof snapShotId !== "string") {
      return;
    }
    markSnapshotAsDone(msg.snapShotId);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "fetch-config") {
    (async () => {
      let config = null;
      const version = msg.version;
      const defaultFile = `https://firebasestorage.googleapis.com/v0/b/klyra-c84ad.firebasestorage.app/o/domselector.config.json?alt=media&token=455d1e16-066a-435f-abfa-8d792f33be7b`;

      try {
        const res = await fetch(`${defaultFile}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(res.statusText);
        config = await res.json();
      } catch (e) {
        try {
          const res2 = await fetch(`${defaultFile}`, {
            cache: "no-store",
          });
          if (!res2.ok) throw new Error(res2.statusText);
          config = await res2.json();
        } catch (e2) {
          console.log(e2);
          config = null;
        }
      }

      sendResponse(config); // Always respond with config (or null)
    })();

    return true; // Tell Chrome this is an async response
  }
});

//Firestore calls
importScripts("firebase-app-compat.js", "firebase-firestore-compat.js");

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCDBgRtDLY13s6dVvzcKouK5LYNy8Dqbr0",
  authDomain: "klyra-c84ad.firebaseapp.com",
  projectId: "klyra-c84ad",
  storageBucket: "klyra-c84ad.firebasestorage.app",
  messagingSenderId: "315865406417",
  appId: "1:315865406417:web:ee66e55bc07c042b9e1ef0",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Your Firebase project variables
const apiKey = "AIzaSyCDBgRtDLY13s6dVvzcKouK5LYNy8Dqbr0";
const projectId = "klyra-c84ad";
const storageBucket = "klyra-c84ad.firebasestorage.app";
const messagingSenderId = "315865406417";
const appId = "1:315865406417:web:ee66e55bc07c042b9e1ef0";

// Fetch Firestore document using REST API (with caching)
async function fetchSelectorsConfigREST(docId = "selectorsConfig") {
  try {
    const cacheKey = `firestoreConfig_${docId}`;
    const cacheMetaKey = `${cacheKey}_timestamp`;
    const SIX_HOURS = 6 * 60 * 60 * 1000; // 6 hours in ms

    // Check cache
    const cachedConfig = await chrome.storage.local.get([
      cacheKey,
      cacheMetaKey,
    ]);
    const lastFetched = cachedConfig[cacheMetaKey];
    const now = Date.now();

    if (
      cachedConfig[cacheKey] &&
      lastFetched &&
      now - lastFetched < SIX_HOURS
    ) {
      console.log("Config loaded from cache:", cachedConfig[cacheKey]);
      return cachedConfig[cacheKey];
    }

    // Otherwise, fetch from Firestore
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/default/documents/configs/${docId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();

    // Convert Firestore fields format to plain JSON
    const parsedData = {};
    if (data.fields) {
      for (const key in data.fields) {
        const valueObj = data.fields[key];
        if (valueObj.stringValue !== undefined)
          parsedData[key] = valueObj.stringValue;
        else if (valueObj.integerValue !== undefined)
          parsedData[key] = parseInt(valueObj.integerValue, 10);
        else if (valueObj.doubleValue !== undefined)
          parsedData[key] = parseFloat(valueObj.doubleValue);
        else if (valueObj.booleanValue !== undefined)
          parsedData[key] = valueObj.booleanValue;
        else if (valueObj.mapValue)
          parsedData[key] = parseFirestoreMap(valueObj.mapValue);
        else if (valueObj.arrayValue)
          parsedData[key] = parseFirestoreArray(valueObj.arrayValue);
        else parsedData[key] = null;
      }
    }

    // Store in cache
    await chrome.storage.local.set({
      [cacheKey]: parsedData,
      [cacheMetaKey]: now,
    });

    console.log("Config fetched via REST and cached:", parsedData);
    return parsedData;
  } catch (err) {
    console.error("Error fetching config via REST:", err);
    return null;
  }
}

// Helpers remain the same
function parseFirestoreMap(mapValue) {
  const obj = {};
  if (mapValue.fields) {
    for (const key in mapValue.fields) {
      const valueObj = mapValue.fields[key];
      if (valueObj.stringValue !== undefined) obj[key] = valueObj.stringValue;
      else if (valueObj.integerValue !== undefined)
        obj[key] = parseInt(valueObj.integerValue, 10);
      else if (valueObj.doubleValue !== undefined)
        obj[key] = parseFloat(valueObj.doubleValue);
      else if (valueObj.booleanValue !== undefined)
        obj[key] = valueObj.booleanValue;
      else if (valueObj.mapValue)
        obj[key] = parseFirestoreMap(valueObj.mapValue);
      else if (valueObj.arrayValue)
        obj[key] = parseFirestoreArray(valueObj.arrayValue);
      else obj[key] = null;
    }
  }
  return obj;
}

function parseFirestoreArray(arrayValue) {
  const arr = [];
  if (arrayValue.values) {
    for (const valueObj of arrayValue.values) {
      if (valueObj.stringValue !== undefined) arr.push(valueObj.stringValue);
      else if (valueObj.integerValue !== undefined)
        arr.push(parseInt(valueObj.integerValue, 10));
      else if (valueObj.doubleValue !== undefined)
        arr.push(parseFloat(valueObj.doubleValue));
      else if (valueObj.booleanValue !== undefined)
        arr.push(valueObj.booleanValue);
      else if (valueObj.mapValue)
        arr.push(parseFirestoreMap(valueObj.mapValue));
      else if (valueObj.arrayValue)
        arr.push(parseFirestoreArray(valueObj.arrayValue));
      else arr.push(null);
    }
  }
  return arr;
}

// Listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "fetch-firebase-config") {
    fetchSelectorsConfigREST("config").then(sendResponse);
    return true; // async
  }
});

// External message listener for webhook notifications from payment server
// This allows the payment server to notify the extension when premium status changes
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  console.log("External message received:", request, "from:", sender);
  
  if (request.action === "premiumStatusChanged" || request.action === "subscriptionUpdated") {
    console.log("Premium status change notification received for:", request.email);
    
    // Clear the cached premium status to force a fresh fetch
    chrome.storage.sync.remove(["isPremium"], () => {
      console.log("Cleared cached premium status");
      
      // Notify all extension pages (popup, options, etc.) to refresh
      chrome.runtime.sendMessage(
        { action: "premiumStatusChanged", email: request.email },
        () => {
          // Ignore errors if no receivers
          if (chrome.runtime.lastError) {
            console.log("No active receivers for premium status update");
          }
        }
      );
      
      sendResponse({ success: true, message: "Premium status update notification sent" });
    });
    
    return true; // Keep the message channel open for async response
  }
  
  sendResponse({ success: false, message: "Unknown action" });
});
