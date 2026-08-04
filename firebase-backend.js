/*
  JE Dunn Safety Checklist Hub - Firebase Backend Connector
  File: firebase-backend.js

  Purpose:
  - Connects the public GitHub-hosted checklist hub to Firebase.
  - Saves submitted checklist data to Firestore.
  - Uploads submitted photos to Firebase Storage.
  - Groups records by Company / Trade Partner for the future admin dashboard.

  How to use:
  1. Create a Firebase project.
  2. Enable Firestore Database.
  3. Enable Firebase Storage.
  4. Enable Authentication for the future admin dashboard.
  5. Replace the firebaseConfig placeholder below with your Firebase web app config.
  6. Upload this file to the same GitHub repository as index.html.
  7. Add this script line at the very bottom of index.html, right before </body>:

     <script type="module" src="firebase-backend.js"></script>

  Important:
  - GitHub Pages is only the public HTML host.
  - Firebase is the backend that receives submissions and stores records/photos.
  - This file intentionally does not provide worker access to submitted records.
*/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

// Replace these values with your Firebase web app config.
const firebaseConfig = {
  apiKey: "PASTE_FIREBASE_API_KEY_HERE",
  authDomain: "PASTE_FIREBASE_AUTH_DOMAIN_HERE",
  projectId: "PASTE_FIREBASE_PROJECT_ID_HERE",
  storageBucket: "PASTE_FIREBASE_STORAGE_BUCKET_HERE",
  messagingSenderId: "PASTE_FIREBASE_MESSAGING_SENDER_ID_HERE",
  appId: "PASTE_FIREBASE_APP_ID_HERE"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const SUBMISSIONS_COLLECTION = "safetyChecklistSubmissions";
const STORAGE_ROOT = "safety-checklist-uploads";

function safeFolderName(value) {
  return String(value || "Unknown")
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase() || "UNKNOWN";
}

function getEffectiveCompany(fields) {
  if (!fields) return "Unknown";
  if (fields.company === "Other") return fields.otherCompany || "Other";
  return fields.company || "Unknown";
}

function getNegativeFindingFromPayload(payload) {
  const responses = Array.isArray(payload.responses) ? payload.responses : [];
  const negativeResponses = ["Non-Compliant", "Unsafe Condition", "Unsafe Act", "Near Miss", "Deficient"];
  return responses.some(row => negativeResponses.includes(row.response)) ||
    negativeResponses.includes(payload?.fields?.observationType || "");
}

function makeSubmissionId(payload, companyName) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const checklist = safeFolderName(payload.checklistTitle || payload.checklistId || "Checklist");
  const company = safeFolderName(companyName);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}-${company}-${checklist}-${random}`;
}

async function uploadPhotos(submissionId, companyName, checklistTitle, fileList) {
  const files = Array.from(fileList || []);
  const uploaded = [];
  const companyFolder = safeFolderName(companyName);
  const checklistFolder = safeFolderName(checklistTitle);

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${STORAGE_ROOT}/${companyFolder}/${checklistFolder}/${submissionId}/photo-${index + 1}.${extension}`;
    const storageRef = ref(storage, path);
    const result = await uploadBytes(storageRef, file, {
      contentType: file.type || "image/jpeg",
      customMetadata: {
        submissionId,
        companyName,
        checklistTitle
      }
    });
    const url = await getDownloadURL(result.ref);
    uploaded.push({
      name: file.name,
      path,
      url,
      size: file.size,
      type: file.type || "image/jpeg"
    });
  }

  return uploaded;
}

async function saveSubmission(payload, photos) {
  const companyName = getEffectiveCompany(payload.fields);
  const negativeFinding = getNegativeFindingFromPayload(payload);
  const submissionId = makeSubmissionId(payload, companyName);
  const companyKey = safeFolderName(companyName);
  const checklistKey = safeFolderName(payload.checklistTitle || payload.checklistId);

  const uploadedPhotos = await uploadPhotos(
    submissionId,
    companyName,
    payload.checklistTitle || "Checklist",
    photos
  );

  const record = {
    submissionId,
    companyName,
    companyKey,
    checklistId: payload.checklistId || "",
    checklistTitle: payload.checklistTitle || "",
    checklistKey,
    date: payload.fields?.date || "",
    submittedAtBrowser: payload.submittedAt || new Date().toISOString(),
    submittedAtServer: serverTimestamp(),
    fields: payload.fields || {},
    responses: Array.isArray(payload.responses) ? payload.responses : [],
    negativeFinding,
    correctiveAction: payload.fields?.correctiveAction || "",
    photoCount: uploadedPhotos.length,
    photos: uploadedPhotos,
    pdfStatus: "not_generated",
    status: "submitted",
    source: "public-checklist-hub"
  };

  await setDoc(doc(collection(db, SUBMISSIONS_COLLECTION), submissionId), record);
  return record;
}

function showBox(id, message, visible = true) {
  const box = document.getElementById(id);
  if (!box) return;
  box.innerHTML = message;
  box.classList.toggle("hidden", !visible);
}

function disableSubmit(form, disabled) {
  const button = form?.querySelector(".submit-btn");
  if (button) {
    button.disabled = disabled;
    button.textContent = disabled ? "Submitting..." : "Submit Checklist";
  }
}

// This overrides the front-end testing submit handler in index.html after this module loads.
window.handleSubmit = async function handleSubmit(event) {
  event.preventDefault();

  const form = event.target;
  const errors = typeof window.validateBeforeSubmit === "function"
    ? window.validateBeforeSubmit()
    : [];

  showBox("formErrors", "", false);
  showBox("formSuccess", "", false);

  if (!form.checkValidity() || errors.length) {
    form.reportValidity();
    if (errors.length) {
      showBox("formErrors", errors.map(e => `<div>${e}</div>`).join(""), true);
    }
    return;
  }

  let payload;
  try {
    payload = typeof window.collectFormData === "function"
      ? window.collectFormData(form)
      : null;
  } catch (error) {
    showBox("formErrors", "Submission data could not be prepared. Please notify Safety.", true);
    return;
  }

  if (!payload) {
    showBox("formErrors", "Submission data could not be found. Please notify Safety.", true);
    return;
  }

  const photosInput = document.getElementById("photos");
  const photos = photosInput?.files || [];

  disableSubmit(form, true);

  try {
    const saved = await saveSubmission(payload, photos);
    showBox(
      "formSuccess",
      `Submission successful. Thank you. Your checklist has been submitted.<br><br>Submission ID: ${saved.submissionId}`,
      true
    );
    form.reset();
    if (typeof window.updateFindingLogic === "function") window.updateFindingLogic();
  } catch (error) {
    console.error("Checklist submission failed:", error);
    showBox(
      "formErrors",
      "Submission could not be completed. Please notify Safety and try again.",
      true
    );
  } finally {
    disableSubmit(form, false);
  }
};

// Future admin dashboard will read from the safetyChecklistSubmissions collection.
window.JEDunnSafetyChecklistBackend = {
  saveSubmission,
  safeFolderName,
  getEffectiveCompany
};
