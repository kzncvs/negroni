// /tma/app.js

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const fileInput = document.getElementById("file");
const previewWrap = document.getElementById("previewWrap");
const preview = document.getElementById("preview");
const shareBtn = document.getElementById("shareBtn");
const downloadBtn = document.getElementById("downloadBtn");
const hint = document.getElementById("hint");

let originalFile = null;
let echoedFile = null;
let preparedInline = null; // PreparedInlineMessage for the current echoed file
let shareInFlight = false;

let downloadObjectUrl = null;
let inFlight = null; // AbortController for the echo request

function setHint(text) {
  hint.textContent = text || "";
}

function setDownload(file) {
  if (downloadObjectUrl) URL.revokeObjectURL(downloadObjectUrl);
  downloadObjectUrl = URL.createObjectURL(file);
  downloadBtn.href = downloadObjectUrl;
  downloadBtn.setAttribute("aria-disabled", "false");
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
  } catch (e) {
    throw new Error(`Unexpected response (${res.status})`);
  }

  if (!res.ok || !data?.ok || !data?.prepared_id) {
    throw new Error(data?.error || `Backend error (${res.status})`);
  }

  return {
    id: data.prepared_id,
    expiresAt: data.expiration_date
      ? Number(data.expiration_date) * 1000
      : null,
  };
}

if (tg?.onEvent) {
  tg.onEvent("shareMessageSent", () => {
    setHint("Shared to Telegram.");
  });
  tg.onEvent("shareMessageFailed", ({ error }) => {
    if (error === "MESSAGE_EXPIRED") {
      preparedInline = null;
    }
    setHint(`Share failed: ${error}`);
  });
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  originalFile = file;
  echoedFile = null;
  preparedInline = null;

  // Preview original immediately
  const tmpUrl = URL.createObjectURL(file);
  preview.src = tmpUrl;
  preview.onload = () => URL.revokeObjectURL(tmpUrl);

  previewWrap.classList.remove("hidden");

  // Download original while we prepare echoed
  setDownload(file);

  // Cancel any previous echo request
  if (inFlight) inFlight.abort();
  inFlight = new AbortController();

  shareBtn.disabled = true;
  setHint("Uploading to backend…");

  try {
    const echoed = await echoFileThroughBackend(file, inFlight.signal);
    echoedFile = echoed;

    // Make download link point to echoed file (optional)
    setDownload(echoedFile);

    // Now user can tap Share (a fresh gesture)
    shareBtn.disabled = false;

    setHint(
      telegramShareSupported()
        ? "Ready. Tap Share to send inside Telegram."
        : "Ready, but sharing works only in Telegram. Use Download or open this Mini App in Telegram."
    );
  } catch (e) {
    if (e?.name === "AbortError") return; // user picked another file quickly
    setHint(`Backend prepare failed: ${e?.message || String(e)}`);
    shareBtn.disabled = true; // no echoed file to share
  }
});

shareBtn.addEventListener("click", async () => {
  if (!echoedFile) {
    setHint("Not ready yet — pick a photo and wait for upload to finish.");
    return;
  }

  if (!telegramShareSupported()) {
    setHint(
      "Open this Mini App inside Telegram to share. Download is still available."
    );
    return;
  }

  const userId = getTelegramUserId();
  if (!userId) {
    setHint("Sharing requires Telegram — open this from inside the Telegram app.");
    return;
  }

  if (shareInFlight) return;
  shareInFlight = true;
  shareBtn.disabled = true;
  setHint("Preparing Telegram share…");

  try {
    const freshPrepared =
      preparedInline &&
      (!preparedInline.expiresAt || preparedInline.expiresAt > Date.now())
        ? preparedInline
        : await savePreparedInlineMessage(echoedFile, userId);

    preparedInline = freshPrepared;

    tg.shareMessage(freshPrepared.id, (ok) => {
      setHint(ok ? "Shared to Telegram." : "Share closed.");
    });
  } catch (e) {
    setHint(`Share failed: ${e?.message || String(e)}`);
    preparedInline = null;
  } finally {
    shareInFlight = false;
    shareBtn.disabled = false;
  }
});

window.addEventListener("beforeunload", () => {
  if (downloadObjectUrl) URL.revokeObjectURL(downloadObjectUrl);
  if (inFlight) inFlight.abort();
});
