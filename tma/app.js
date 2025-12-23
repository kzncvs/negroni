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

let currentFile = null;
let downloadObjectUrl = null;

function setHint(text) {
  hint.textContent = text || "";
}

function setDownload(file) {
  // Revoke previous URL to avoid leaks
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

async function echoFileThroughBackend(file) {
  const fd = new FormData();
  fd.append("file", file, file.name || "photo.jpg");

  const res = await fetch("https://api.negroni.work/echo", {
    method: "POST",
    body: fd,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Echo failed: ${res.status} ${text}`);
  }

  const blob = await res.blob();
  const outType = blob.type || file.type || "application/octet-stream";
  const outName = file.name || "photo.jpg";
  return new File([blob], outName, { type: outType });
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  currentFile = file;

  // Preview
  const tmpUrl = URL.createObjectURL(file);
  preview.src = tmpUrl;
  preview.onload = () => URL.revokeObjectURL(tmpUrl);

  previewWrap.classList.remove("hidden");
  shareBtn.disabled = false;

  // Download original (not echoed)
  setDownload(file);

  if (canShareFile(file)) {
    setHint("Tap Share → choose Telegram in the system share sheet.");
  } else {
    setHint(
      "Share is not supported here. Use Download, then attach in Telegram manually."
    );
  }
});

shareBtn.addEventListener("click", async () => {
  if (!currentFile) return;

  shareBtn.disabled = true;
  setHint("Uploading…");

  try {
    const echoed = await echoFileThroughBackend(currentFile);

    // Update download link to echoed file too (optional)
    setDownload(echoed);

    if (canShareFile(echoed)) {
      setHint("Opening share sheet…");
      await navigator.share({
        files: [echoed],
        title: "Photo",
        text: "Shared from negroni.work Mini App",
      });
      setHint("Shared (or share sheet closed).");
    } else {
      setHint(
        "Sharing not supported here. Use Download, then attach in Telegram manually."
      );
    }
  } catch (e) {
    setHint("Backend echo/share failed. You can still Download.");
  } finally {
    shareBtn.disabled = false;
  }
});

// Cleanup object URL on page unload
window.addEventListener("beforeunload", () => {
  if (downloadObjectUrl) URL.revokeObjectURL(downloadObjectUrl);
});
