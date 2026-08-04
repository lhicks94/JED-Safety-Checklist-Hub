/*
  JE Dunn Safety Checklist Hub - Microsoft Backend Connector
  File: microsoft-backend.js

  Purpose:
  - Keeps GitHub Pages as the public checklist hub.
  - Sends submitted checklist data to a Microsoft Power Automate HTTP flow.
  - Power Automate can then create SharePoint/List records and save uploaded photos/PDF outputs in Microsoft 365 storage.

  IMPORTANT:
  - Replace POWER_AUTOMATE_SUBMISSION_URL with the HTTP POST URL from your Power Automate flow.
  - Do not paste personal passwords, client secrets, or confidential credentials into this file.
  - The public page remains worker-facing only. Dashboard access should be built separately and protected.

  Add this line right before </body> in index.html:
  <script src="microsoft-backend.js"></script>
*/

const POWER_AUTOMATE_SUBMISSION_URL = "https://defaulte5e66f9b9af247a3817953be49b044.90.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/23/workflows/f8d1b244e17d412ea567edfebeb39c29/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=1jJNMXlAiurdGlqqy56LsDLxxp-GzLuCkkjhqVgUBco";

function msSafeValue(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function msGetEffectiveCompany(fields) {
  if (!fields) return "Unknown";
  if (fields.company === "Other") return msSafeValue(fields.otherCompany) || "Other";
  return msSafeValue(fields.company) || "Unknown";
}

function msHasNegativeFinding(payload) {
  const negativeValues = ["Non-Compliant", "Unsafe Condition", "Unsafe Act", "Near Miss", "Deficient"];
  const responses = Array.isArray(payload.responses) ? payload.responses : [];
  const responseFinding = responses.some(item => negativeValues.includes(item.response));
  const observationFinding = negativeValues.includes(payload?.fields?.observationType || "");
  return responseFinding || observationFinding;
}

function msCreateSubmissionId(payload) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const company = msGetEffectiveCompany(payload.fields).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase();
  const checklist = msSafeValue(payload.checklistTitle || payload.checklistId).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}-${company}-${checklist}-${random}`;
}

function msReadFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function msGetPhotoPayloads() {
  const input = document.getElementById("photos");
  const files = Array.from(input?.files || []);
  const photoPayloads = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const dataUrl = await msReadFileAsDataUrl(file);
    const base64 = String(dataUrl).split(",")[1] || "";
    photoPayloads.push({
      fileName: file.name || `photo-${i + 1}.jpg`,
      contentType: file.type || "image/jpeg",
      size: file.size || 0,
      base64
    });
  }

  return photoPayloads;
}

function msShowBox(id, message, visible = true) {
  const box = document.getElementById(id);
  if (!box) return;
  box.innerHTML = message;
  box.classList.toggle("hidden", !visible);
}

function msDisableSubmit(form, disabled) {
  const button = form?.querySelector(".submit-btn");
  if (!button) return;
  button.disabled = disabled;
  button.textContent = disabled ? "Submitting..." : "Submit Checklist";
}

async function msPostSubmission(payload) {
  const response = await fetch(POWER_AUTOMATE_SUBMISSION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Power Automate submission failed: ${response.status} ${details}`);
  }

  return response.json().catch(() => ({ ok: true }));
}

// This overrides the front-end testing submit handler in index.html after this file loads.
window.handleSubmit = async function handleSubmit(event) {
  event.preventDefault();

  const form = event.target;
  const errors = typeof window.validateBeforeSubmit === "function" ? window.validateBeforeSubmit() : [];

  msShowBox("formErrors", "", false);
  msShowBox("formSuccess", "", false);

  if (!form.checkValidity() || errors.length) {
    form.reportValidity();
    if (errors.length) {
      msShowBox("formErrors", errors.map(e => `<div>${e}</div>`).join(""), true);
    }
    return;
  }

  if (!POWER_AUTOMATE_SUBMISSION_URL || POWER_AUTOMATE_SUBMISSION_URL.includes("PASTE_POWER_AUTOMATE")) {
    msShowBox("formErrors", "Microsoft backend URL is not configured yet. Replace the placeholder URL in microsoft-backend.js.", true);
    return;
  }

  let basePayload;
  try {
    basePayload = typeof window.collectFormData === "function" ? window.collectFormData(form) : null;
  } catch (error) {
    msShowBox("formErrors", "Submission data could not be prepared. Please notify Safety.", true);
    return;
  }

  if (!basePayload) {
    msShowBox("formErrors", "Submission data could not be found. Please notify Safety.", true);
    return;
  }

  msDisableSubmit(form, true);

  try {
    const submissionId = msCreateSubmissionId(basePayload);
    const companyName = msGetEffectiveCompany(basePayload.fields);
    const negativeFinding = msHasNegativeFinding(basePayload);
    const photos = await msGetPhotoPayloads();

    const payload = {
      submissionId,
      source: "github-pages-safety-checklist-hub",
      submittedAt: new Date().toISOString(),
      companyName,
      companyKey: companyName.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase(),
      checklistId: basePayload.checklistId || "",
      checklistTitle: basePayload.checklistTitle || "",
      date: basePayload.fields?.date || "",
      negativeFinding,
      fields: basePayload.fields || {},
      responses: Array.isArray(basePayload.responses) ? basePayload.responses : [],
      correctiveAction: basePayload.fields?.correctiveAction || "",
      photoCount: photos.length,
      photos
    };

    await msPostSubmission(payload);

    msShowBox(
      "formSuccess",
      `Submission successful. Thank you. Your checklist has been submitted.<br><br>Submission ID: ${submissionId}`,
      true
    );
    form.reset();
    if (typeof window.updateFindingLogic === "function") window.updateFindingLogic();
  } catch (error) {
    console.error(error);
    msShowBox("formErrors", "Submission could not be completed. Please notify Safety and try again.", true);
  } finally {
    msDisableSubmit(form, false);
  }
};
