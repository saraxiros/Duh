"use strict";

/* =========================================================
   0. CONFIGURATION
   Update these two values to point at your real backend.
   ========================================================= */

// Replace with your real conversion endpoint, e.g. "https://api.yourapp.com/convert"
const API_ENDPOINT = "YOUR_BACKEND_ENDPOINT";

// 25 MB — adjust to whatever your backend can comfortably handle.
const MAX_FILE_SIZE = 25 * 1024 * 1024;

/* =========================================================
   1. ELEMENT REFERENCES
   ========================================================= */

const card = document.getElementById("converterCard");

const states = {
  upload: document.getElementById("stateUpload"),
  selected: document.getElementById("stateSelected"),
  processing: document.getElementById("stateProcessing"),
  success: document.getElementById("stateSuccess"),
  error: document.getElementById("stateError"),
};

const dropzone = document.getElementById("dropzone");
const chooseBtn = document.getElementById("chooseBtn");
const fileInput = document.getElementById("fileInput");
const uploadError = document.getElementById("uploadError");

const fileNameEl = document.getElementById("fileName");
const fileMetaEl = document.getElementById("fileMeta");
const removeFileBtn = document.getElementById("removeFileBtn");

const preserveFormattingToggle = document.getElementById("preserveFormatting");
const ocrLanguageSelect = document.getElementById("ocrLanguage");
const additionalRowsInput = document.getElementById("additionalRows");

const convertBtn = document.getElementById("convertBtn");
const progressFill = document.getElementById("progressFill");

const successDetail = document.getElementById("successDetail");
const downloadBtn = document.getElementById("downloadBtn");
const convertAnotherBtn = document.getElementById("convertAnotherBtn");

const errorDetail = document.getElementById("errorDetail");
const retryBtn = document.getElementById("retryBtn");

/* =========================================================
   2. APPLICATION STATE
   ========================================================= */

let selectedFile = null;      // the File currently chosen by the user
let conversionResult = null;  // { blob, filename } once a conversion succeeds
let dragCounter = 0;          // tracks nested dragenter/dragleave events

/* =========================================================
   3. UI STATE MANAGEMENT
   ========================================================= */

/**
 * Shows exactly one of the app's states and hides the rest.
 * @param {keyof typeof states} name
 */
function showState(name) {
  Object.entries(states).forEach(([key, section]) => {
    section.hidden = key !== name;
  });
}

function resetApp() {
  selectedFile = null;

  if (conversionResult && conversionResult.url) {
    URL.revokeObjectURL(conversionResult.url);
  }
  conversionResult = null;

  fileInput.value = "";
  hideUploadError();
  showState("upload");
}

/* =========================================================
   4. FILE VALIDATION
   ========================================================= */

function showUploadError(message) {
  uploadError.textContent = message;
  uploadError.hidden = false;
}

function hideUploadError() {
  uploadError.hidden = true;
  uploadError.textContent = "";
}

/**
 * Confirms a File is a PDF within the configured size limit.
 * @param {File} file
 * @returns {{ valid: boolean, message?: string }}
 */
function validateFile(file) {
  if (!file) {
    return { valid: false, message: "Please choose a PDF file." };
  }

  const looksLikePdfType = file.type === "application/pdf";
  const looksLikePdfName = file.name.toLowerCase().endsWith(".pdf");

  if (!looksLikePdfType && !looksLikePdfName) {
    return { valid: false, message: "Please choose a PDF file." };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      message: "This PDF is too large to process. Please choose a smaller file.",
    };
  }

  return { valid: true };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

/**
 * Best-effort, browser-only page count estimate.
 * Scans the raw bytes for "/Type /Page" object markers. This is a heuristic —
 * it can under- or over-count on some PDFs — so it's treated as optional
 * supplementary info, never as a guarantee.
 * @param {File} file
 * @returns {Promise<number|null>}
 */
async function estimatePageCount(file) {
  try {
    const text = await file.text();
    const matches = text.match(/\/Type\s*\/Page[^s]/g);
    return matches && matches.length > 0 ? matches.length : null;
  } catch (err) {
    console.warn("Page count estimation skipped:", err);
    return null;
  }
}

/* =========================================================
   5. FILE SELECTION
   ========================================================= */

async function handleFile(file) {
  const result = validateFile(file);

  if (!result.valid) {
    showUploadError(result.message);
    return;
  }

  hideUploadError();
  selectedFile = file;

  fileNameEl.textContent = file.name;
  fileMetaEl.textContent = formatBytes(file.size);

  showState("selected");

  const pageCount = await estimatePageCount(file);
  if (pageCount) {
    fileMetaEl.textContent = `${formatBytes(file.size)} · ~${pageCount} page${pageCount === 1 ? "" : "s"}`;
  }
}

/* =========================================================
   6. DRAG & DROP + FILE PICKER WIRING
   ========================================================= */

function openFilePicker() {
  fileInput.click();
}

dropzone.addEventListener("click", (event) => {
  // The "Choose PDF" button handles its own click; avoid opening the
  // dialog twice when the click bubbles up from the button.
  if (event.target === chooseBtn) return;
  openFilePicker();
});

dropzone.addEventListener("keydown", (event) => {
  if (event.target !== dropzone) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openFilePicker();
  }
});

chooseBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  openFilePicker();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files && fileInput.files[0];
  if (file) handleFile(file);
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (eventName === "dragenter") dragCounter++;
    dropzone.classList.add("is-dragover");
  });
});

dropzone.addEventListener("dragleave", (event) => {
  event.preventDefault();
  event.stopPropagation();
  dragCounter = Math.max(0, dragCounter - 1);
  if (dragCounter === 0) dropzone.classList.remove("is-dragover");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  event.stopPropagation();
  dragCounter = 0;
  dropzone.classList.remove("is-dragover");

  const file = event.dataTransfer.files && event.dataTransfer.files[0];
  if (file) handleFile(file);
});

removeFileBtn.addEventListener("click", () => {
  resetApp();
});

/* =========================================================
   7. CONVERSION OPTIONS
   ========================================================= */

preserveFormattingToggle.addEventListener("click", () => {
  const isChecked = preserveFormattingToggle.getAttribute("aria-checked") === "true";
  preserveFormattingToggle.setAttribute("aria-checked", String(!isChecked));
});

additionalRowsInput.addEventListener("blur", () => {
  const min = Number(additionalRowsInput.min) || 0;
  const max = Number(additionalRowsInput.max) || 200;
  let value = parseInt(additionalRowsInput.value, 10);

  if (Number.isNaN(value)) value = min;
  value = Math.min(Math.max(value, min), max);

  additionalRowsInput.value = String(value);
});

function getSelectedOptions() {
  return {
    preserveFormatting: preserveFormattingToggle.getAttribute("aria-checked") === "true",
    ocrLanguage: ocrLanguageSelect.value,
    additionalRows: additionalRowsInput.value,
  };
}

/* =========================================================
   8. API COMMUNICATION
   ========================================================= */

/**
 * Sends the PDF and conversion options to the backend and returns the
 * generated Word document as a blob.
 * @param {File} file
 * @param {{preserveFormatting: boolean, ocrLanguage: string, additionalRows: string}} options
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
async function convertPDF(file, options) {
  const formData = new FormData();
  formData.append("pdf", file);
  formData.append("ocr_language", options.ocrLanguage);
  formData.append("preserve_formatting", String(options.preserveFormatting));
  formData.append("additional_rows", options.additionalRows);

  // Note: do not set a Content-Type header manually — the browser sets the
  // correct multipart boundary automatically when body is a FormData.
  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Conversion failed (${response.status}): ${errorText}`);
  }

  const blob = await response.blob();

  const disposition = response.headers.get("Content-Disposition") || "";
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
  const filename = filenameMatch
    ? filenameMatch[1]
    : file.name.replace(/\.pdf$/i, "") + ".docx";

  return { blob, filename };
}

/* =========================================================
   9. CONVERSION FLOW
   ========================================================= */

convertBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  showState("processing");
  progressFill.style.width = "";

  const options = getSelectedOptions();

  try {
    const { blob, filename } = await convertPDF(selectedFile, options);

    conversionResult = {
      blob,
      filename,
      url: URL.createObjectURL(blob),
    };

    successDetail.textContent = `${selectedFile.name} → ${filename}`;
    showState("success");
  } catch (err) {
    // Technical detail stays in the console; the UI stays calm and vague.
    console.error("Doc Converter: conversion request failed.", err);
    errorDetail.textContent = "We couldn't convert this document. Please try again.";
    showState("error");
  }
});

/* =========================================================
   10. DOWNLOAD HANDLING
   ========================================================= */

downloadBtn.addEventListener("click", () => {
  if (!conversionResult) return;

  const link = document.createElement("a");
  link.href = conversionResult.url;
  link.download = conversionResult.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

convertAnotherBtn.addEventListener("click", () => {
  resetApp();
});

retryBtn.addEventListener("click", () => {
  showState("selected");
});
