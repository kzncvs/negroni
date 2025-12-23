// /tma/app.js

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const uiImage = document.getElementById("uiImage");
const captureZone = document.getElementById("captureZone");
const shareZone = document.getElementById("shareZone");
const fileInput = document.getElementById("file");
const hint = document.getElementById("hint");

let originalFile = null;
let echoedFile = null;
let preparedInline = null; // { id, expiresAt }
let inFlightEcho = null; // AbortController
let blinkTimer = null;
let blinkIndex = 0;

function setHint(text) {
  hint.textContent = text || "";
}

function setUi(name) {
  uiImage.src = `./${name}`;
}

function stopBlink() {
  if (blinkTimer) clearInterval(blinkTimer);
  blinkTimer = null;
  blinkIndex = 0;
}

function startBlink(a, b) {
  stopBlink();
  const frames = [a, b];
  setUi(frames[0]);
  blinkIndex = 0;
  blinkTimer = setInterval(() => {
    blinkIndex = (blinkIndex + 1) % frames.length;
    setUi(frames[blinkIndex]);
  }, 1000);
}

function preloadImages(names) {
  names.forEach((n) => {
    const img = new Image();
    img.src = `./${n}`;
  });
}

function telegramShareSupported() {
  return Boolean(
    tg &&
      typeof tg.shareMessage === "function" &&
      (typeof tg.isVersionAtLeast !== "function" || tg.isVersionAtLeast("8.0"))
  );
}

function getTelegramUserId() {
  return tg?.initDataUnsafe?.user?.id ?? null;
}

function enableShare(enabled) {
  shareZone.disabled = !enabled;
  shareZone.style.pointerEvents = enabled ? "auto" : "none";
}

async function echoFileThroughBackend(file, signal) {
  const fd = new FormData();
  fd.append("file", file, file.name || "photo.jpg");

  const res = await fetch("https://api.negroni.work/echo", {
    method: "POST",
    body: fd,
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Echo failed: ${res.status} ${text}`.trim());
  }

  const blob = await res.blob();
  const outType = blob.type || file.type || "application/octet-stream";
  const outName = file.name || "photo.jpg";
  return new File([blob], outName, { type: outType });
}

async function savePreparedInlineMessage(file, userId) {
  const fd = new FormData();
  fd.append("file", file, file.name || "photo.jpg");
  fd.append("user_id", String(userId));

  const res = await fetch("https://api.negroni.work/save-prepared-inline", {
    method: "POST",
    body: fd,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Unexpected response (${res.status})`);
  }

  if (!res.ok || !data?.ok || !data?.prepared_id) {
    throw new Error(data?.error || `Backend error (${res.status})`);
  }

  return {
    id: data.prepared_id,
    expiresAt: data.expiration_date ? Number(data.expiration_date) * 1000 : null,
  };
}

function isPreparedValid(p) {
  if (!p) return false;
  if (!p.expiresAt) return true;
  return p.expiresAt > Date.now();
}

// Telegram share events (optional UX)
if (tg?.onEvent) {
  tg.onEvent("shareMessageSent", () => {
    setHint("Shared to Telegram.");
  });
  tg.onEvent("shareMessageFailed", ({ error }) => {
    if (error === "MESSAGE_EXPIRED") preparedInline = null;
    setHint(`Share failed: ${error}`);
  });
}

/**
 * UI states:
 * - idle: blink 1<->2, capture enabled, share disabled
 * - uploading: blink 3<->31, share disabled
 * - ready: blink 4<->5, share enabled
 */

function setIdleState() {
  originalFile = null;
  echoedFile = null;
  preparedInline = null;

  enableShare(false);
  setHint("");

  startBlink("1.jpg", "2.jpg");
}

async function setUploadingStateAndProcess(file) {
  // While waiting, blink 3 <-> 31
  enableShare(false);
  setHint("Processing…");
  startBlink("3.jpg", "31.jpg");

  // cancel previous echo
  if (inFlightEcho) inFlightEcho.abort();
  inFlightEcho = new AbortController();

  try {
    // 1) Echo through backend
    echoedFile = await echoFileThroughBackend(file, inFlightEcho.signal);

    // 2) Prepare Telegram share
    if (!telegramShareSupported()) {
      stopBlink();
      setUi("3.jpg");
      setHint("Open inside Telegram to share.");
      return;
    }

    const userId = getTelegramUserId();
    if (!userId) {
      stopBlink();
      setUi("3.jpg");
      setHint("Open inside Telegram to share.");
      return;
    }

    setHint("Preparing share…");
    preparedInline = await savePreparedInlineMessage(echoedFile, userId);

    // 3) Ready
    if (isPreparedValid(preparedInline)) {
      enableShare(true);
      setHint("Ready. Tap SHARE.");
      startBlink("4.jpg", "5.jpg");
    } else {
      preparedInline = null;
      stopBlink();
      setUi("3.jpg");
      setHint("Share prepare failed. Try again.");
    }
  } catch (e) {
    if (e?.name === "AbortError") return;
    preparedInline = null;
    enableShare(false);
    stopBlink();
    setUi("3.jpg");
    setHint(`Failed: ${e?.message || String(e)}`);
  }
}

/* --- Touch zones --- */

// Capture: open file picker/camera
captureZone.addEventListener("click", () => {
  fileInput.click();
});

// Share: share inside Telegram
shareZone.addEventListener("click", async () => {
  if (!telegramShareSupported()) {
    setHint("Open inside Telegram to share.");
    return;
  }
  if (!echoedFile) {
    setHint("No photo yet.");
    return;
  }

  const userId = getTelegramUserId();
  if (!userId) {
    setHint("Open inside Telegram to share.");
    return;
  }

  try {
    // If prepared expired/missing, recreate
    if (!isPreparedValid(preparedInline)) {
      enableShare(false);
      setHint("Refreshing share…");
      preparedInline = await savePreparedInlineMessage(echoedFile, userId);
      enableShare(isPreparedValid(preparedInline));
    }

    if (!isPreparedValid(preparedInline)) {
      setHint("Share is not ready yet.");
      return;
    }

    tg.shareMessage(preparedInline.id, (ok) => {
      setHint(ok ? "Shared to Telegram." : "Share closed.");
    });
  } catch (e) {
    preparedInline = null;
    enableShare(false);
    setHint(`Share failed: ${e?.message || String(e)}`);
  }
});

/* --- File capture handling --- */

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  originalFile = file;
  echoedFile = null;
  preparedInline = null;

  await setUploadingStateAndProcess(file);
});

/* --- boot --- */

preloadImages(["1.jpg", "2.jpg", "3.jpg", "31.jpg", "4.jpg", "5.jpg"]);
setIdleState();

window.addEventListener("beforeunload", () => {
  stopBlink();
  if (inFlightEcho) inFlightEcho.abort();
});
