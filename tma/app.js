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

function canShareFile(file) {
  return (
    navigator.share &&
    navigator.canShare &&
    navigator.canShare({ files: [file] })
  );
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

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  originalFile = file;
  echoedFile = null;

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

    if (canShareFile(echoedFile)) {
      setHint("Ready. Tap Share → choose Telegram in the share sheet.");
    } else {
      setHint(
        "Ready, but sharing isn’t supported here. Use Download, then attach in Telegram manually."
      );
    }
  } catch (e) {
    if (e?.name === "AbortError") return; // user picked another file quickly
    setHint(`Backend prepare failed: ${e?.message || String(e)}`);
    shareBtn.disabled = true; // no echoed file to share
  }
});

shareBtn.addEventListener("click", async () => {
  // IMPORTANT: no await/async work before navigator.share() here
  if (!echoedFile) {
    setHint("Not ready yet — pick a photo and wait for upload to finish.");
    return;
  }

  if (!canShareFile(echoedFile)) {
    setHint("Sharing not supported here. Use Download.");
    return;
  }

  try {
    await navigator.share({
      files: [echoedFile],
      title: "Photo",
      text: "Shared from negroni.work Mini App",
    });
    setHint("Shared (or share sheet closed).");
  } catch (e) {
    // user cancel is common
    setHint(`Share cancelled/failed: ${e?.message || String(e)}`);
  }
});

window.addEventListener("beforeunload", () => {
  if (downloadObjectUrl) URL.revokeObjectURL(downloadObjectUrl);
  if (inFlight) inFlight.abort();
});
