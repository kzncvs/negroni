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
let objectUrl = null;

function setHint(text) {
  hint.textContent = text || "";
}

function setDownload(file) {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  downloadBtn.href = objectUrl;
  downloadBtn.setAttribute("aria-disabled", "false");
}

function canShareFile(file) {
  return (
    navigator.share &&
    navigator.canShare &&
    navigator.canShare({ files: [file] })
  );
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  currentFile = file;

  // Preview
  const url = URL.createObjectURL(file);
  preview.src = url;
  preview.onload = () => URL.revokeObjectURL(url);

  previewWrap.classList.remove("hidden");
  shareBtn.disabled = false;

  setDownload(file);

  if (canShareFile(file)) {
    setHint("Tap Share → choose Telegram in the system share sheet.");
  } else {
    setHint("Share is not supported here. Use Download, then attach in Telegram manually.");
  }
});

shareBtn.addEventListener("click", async () => {
  if (!currentFile) return;

  if (!canShareFile(currentFile)) {
    setHint("Sharing not supported. Use Download instead.");
    return;
  }

  try {
    await navigator.share({
      files: [currentFile],
      title: "Photo",
      text: "Shared from negroni.work Mini App",
    });
    setHint("Shared (or share sheet closed).");
  } catch (e) {
    // User cancel is common; don’t treat as fatal
    setHint("Share cancelled or failed. You can still Download.");
  }
});
