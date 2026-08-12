/*
  JE Dunn Safety Checklist Hub - Microsoft Backend v2
  Purpose:
  - Keeps the same public GitHub URL and same posted QR code.
  - Allows field users to add as many photos as needed by adding photo fields one at a time.
  - Compresses photos before submission to reduce upload size.
  - Generates a PDF report in the browser and sends it to Power Automate.
  - Sends all photo files and the PDF file to Power Automate as Base64 so they can be attached to the SharePoint item.

  IMPORTANT:
  - Replace POWER_AUTOMATE_SUBMISSION_URL with your existing Power Automate HTTP URL.
  - Keep this file named microsoft-backend.js so your existing index.html script tag continues to work.
  - You do NOT need a new QR code as long as the GitHub Pages URL stays the same.
*/

const POWER_AUTOMATE_SUBMISSION_URL = "https://defaulte5e66f9b9af247a3817953be49b044.90.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/23/workflows/f8d1b244e17d412ea567edfebeb39c29/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=1jJNMXlAiurdGlqqy56LsDLxxp-GzLuCkkjhqVgUBco";
const JSPDF_CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

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

function msLoadJsPdf() {
  return new Promise((resolve, reject) => {
    if (window.jspdf && window.jspdf.jsPDF) return resolve();
    const existing = document.querySelector(`script[src="${JSPDF_CDN_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = JSPDF_CDN_URL;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function msReadFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function msLoadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function msCompressImageFile(file, index) {
  const originalDataUrl = await msReadFileAsDataUrl(file);
  const img = await msLoadImage(originalDataUrl);
  const maxDimension = 1600;
  let width = img.width;
  let height = img.height;
  if (width > height && width > maxDimension) {
    height = Math.round(height * (maxDimension / width));
    width = maxDimension;
  } else if (height >= width && height > maxDimension) {
    width = Math.round(width * (maxDimension / height));
    height = maxDimension;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
  const base64 = dataUrl.split(",")[1] || "";
  const cleanName = (file.name || `photo-${index + 1}.jpg`).replace(/\.[^.]+$/, "");
  return {
    fileName: `${cleanName || `photo-${index + 1}`}.jpg`,
    contentType: "image/jpeg",
    size: Math.round((base64.length * 3) / 4),
    base64,
    dataUrl,
    width,
    height
  };
}

function msGetPhotoFiles() {
  const inputs = Array.from(document.querySelectorAll("input[data-photo-input='true']"));
  const files = [];
  inputs.forEach(input => {
    Array.from(input.files || []).forEach(file => files.push(file));
  });
  return files;
}

async function msGetPhotoPayloads() {
  const files = msGetPhotoFiles();
  const photos = [];
  for (let i = 0; i < files.length; i++) {
    photos.push(await msCompressImageFile(files[i], i));
  }
  return photos;
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

function msAddPhotoInput(container) {
  const count = container.querySelectorAll(".photo-input-row").length + 1;
  const row = document.createElement("div");
  row.className = "photo-input-row";
  row.style.cssText = "border:1px solid #d1d5db;border-radius:12px;padding:10px;margin:10px 0;background:#fff;";
  row.innerHTML = `
    <label style="display:block;font-weight:800;margin:0 0 6px;">Photo ${count}</label>
    <input data-photo-input="true"
       type="file"
       accept="image/*"
       style="width:100%;">
    <button type="button" class="remove-photo-btn" style="margin-top:8px;border:1px solid #d1d5db;background:#fff;color:#b91c1c;border-radius:10px;padding:8px 10px;font-weight:800;">Remove Photo</button>
  `;
  row.querySelector(".remove-photo-btn").addEventListener("click", () => {
    row.remove();
    msUpdatePhotoLabels(container);
  });
  container.appendChild(row);
}

function msUpdatePhotoLabels(container) {
  Array.from(container.querySelectorAll(".photo-input-row label")).forEach((label, index) => {
    label.textContent = `Photo ${index + 1}`;
  });
}

function msUpgradePhotoSection() {
  const oldInput = document.getElementById("photos");
  if (!oldInput) return;
  const section = oldInput.closest(".section") || oldInput.parentElement;
  if (!section || section.dataset.photoUpgrade === "true") return;
  section.dataset.photoUpgrade = "true";
  section.innerHTML = `
    <h3>Photos</h3>
    <div class="notice" style="border-left:5px solid #f4b000;background:#fff8e1;padding:12px;border-radius:10px;font-weight:700;color:#6b4e00;margin:12px 0;line-height:1.4;">
      Add as many photos as needed. For non-compliant findings, at least one photo is required.
    </div>
    <div id="photoInputContainer"></div>
    <button type="button" id="addPhotoButton" style="width:100%;background:#fff;border:2px solid #004b8d;color:#004b8d;border-radius:14px;padding:12px;font-size:1rem;font-weight:900;margin-top:8px;">+ Add Another Photo</button>
    <p class="photo-note">Use the button above to add additional photos. On mobile, each button press can open the camera or photo picker again.</p>
  `;
  const container = section.querySelector("#photoInputContainer");
  msAddPhotoInput(container);
  section.querySelector("#addPhotoButton").addEventListener("click", () => msAddPhotoInput(container));
}

// Patch renderForm so the upgraded photo section appears every time a checklist opens.
(function patchRenderFormForPhotos() {
  if (typeof window.renderForm !== "function") return;
  const originalRenderForm = window.renderForm;
  window.renderForm = function patchedRenderForm(config) {
    originalRenderForm(config);
    msUpgradePhotoSection();
  };
})();

// Replace the original photo validation with multiple-photo validation.
window.validateBeforeSubmit = function validateBeforeSubmit() {
  const errors = [];
  const company = document.getElementById("company");
  const other = document.getElementById("otherCompany");
  if (!company || !company.value) errors.push("Company / Trade Partner is required.");
  if (company && company.value === "Other" && other && !other.value.trim()) errors.push("Enter Company Name is required when Other is selected.");
  if (typeof window.hasNegativeFinding === "function" && window.hasNegativeFinding()) {
   
   
    if (msGetPhotoFiles().length === 0) errors.push("At least one photo is required for negative findings.");
  }
  return errors;
};

function msAddPdfHeader(doc, payload, submissionId) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(0, 75, 141);
  doc.rect(0, 0, pageWidth, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("JE Dunn Safety Checklist", 12, 14);
  doc.setFontSize(9);
  doc.text(payload.checklistTitle || "Checklist", pageWidth - 12, 14, { align: "right" });
  doc.setTextColor(31, 41, 55);
}

function msEnsureSpace(doc, y, needed) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - 15) {
    doc.addPage();
    return 28;
  }
  return y;
}

function msAddLabelValue(doc, label, value, x, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(label, x, y);
  doc.setFont("helvetica", "normal");
  doc.text(String(value || ""), x + 42, y);
}

async function msGeneratePdfBase64(payload, photos, submissionId) {
  await msLoadJsPdf();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "letter", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;
  let y = 28;

  msAddPdfHeader(doc, payload, submissionId);

  doc.setTextColor(0, 75, 141);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(payload.checklistTitle || "Safety Checklist", margin, y);
  y += 9;

  doc.setTextColor(31, 41, 55);
  msAddLabelValue(doc, "Submission ID:", submissionId, margin, y); y += 6;
  msAddLabelValue(doc, "Company:", payload.companyName, margin, y); y += 6;
  msAddLabelValue(doc, "Checklist Date:", payload.date, margin, y); y += 6;
  msAddLabelValue(doc, "Submitted At:", payload.submittedAt, margin, y); y += 6;
  msAddLabelValue(doc, "Negative Finding:", payload.negativeFinding ? "Yes" : "No", margin, y); y += 10;

  // Additional form fields
  doc.setTextColor(0, 75, 141);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("General Information", margin, y);
  y += 6;
  doc.setTextColor(31, 41, 55);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  Object.entries(payload.fields || {}).forEach(([key, value]) => {
    if (["company", "otherCompany", "date", "correctiveAction"].includes(key)) return;
    y = msEnsureSpace(doc, y, 7);
    const line = `${key}: ${value}`;
    const wrapped = doc.splitTextToSize(line, pageWidth - margin * 2);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 4.5 + 1;
  });

  // Responses
  y = msEnsureSpace(doc, y, 14);
  doc.setTextColor(0, 75, 141);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Checklist Responses", margin, y);
  y += 7;
  doc.setTextColor(31, 41, 55);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  (payload.responses || []).forEach((row, index) => {
    y = msEnsureSpace(doc, y, 12);
    const wrappedItem = doc.splitTextToSize(`${index + 1}. ${row.item}`, pageWidth - margin * 2 - 30);
    doc.setFont("helvetica", "bold");
    doc.text(row.response || "", pageWidth - margin, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.text(wrappedItem, margin, y);
    y += Math.max(6, wrappedItem.length * 4.5 + 2);
  });

  // Corrective action
  if (payload.correctiveAction) {
    y = msEnsureSpace(doc, y, 18);
    doc.setTextColor(0, 75, 141);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Corrective Action / Prevention Feedback", margin, y);
    y += 6;
    doc.setTextColor(31, 41, 55);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const wrapped = doc.splitTextToSize(payload.correctiveAction, pageWidth - margin * 2);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 4.5 + 6;
  }

  // Photos
  if (photos.length) {
    doc.addPage();
    y = 28;
    msAddPdfHeader(doc, payload, submissionId);
    doc.setTextColor(0, 75, 141);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Photos", margin, y);
    y += 8;

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      y = msEnsureSpace(doc, y, 95);
      doc.setTextColor(31, 41, 55);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`Photo ${i + 1}: ${photo.fileName}`, margin, y);
      y += 5;
      const maxW = pageWidth - margin * 2;
      const maxH = 82;
      let imgW = maxW;
      let imgH = imgW * (photo.height / photo.width);
      if (imgH > maxH) {
        imgH = maxH;
        imgW = imgH * (photo.width / photo.height);
      }
      const x = margin + (maxW - imgW) / 2;
      doc.addImage(photo.dataUrl, "JPEG", x, y, imgW, imgH);
      y += imgH + 8;
    }
  }

  const dataUri = doc.output("datauristring");
  return dataUri.split(",")[1] || "";
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

// Override submit behavior with PDF + multiple photo support.
window.handleSubmit = async function handleSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const errors = typeof window.validateBeforeSubmit === "function" ? window.validateBeforeSubmit() : [];
  msShowBox("formErrors", "", false);
  msShowBox("formSuccess", "", false);

  if (!form.checkValidity() || errors.length) {
    form.reportValidity();
    if (errors.length) msShowBox("formErrors", errors.map(e => `<div>${e}</div>`).join(""), true);
    return;
  }

  if (!POWER_AUTOMATE_SUBMISSION_URL || POWER_AUTOMATE_SUBMISSION_URL.includes("PASTE_YOUR_EXISTING")) {
    msShowBox("formErrors", "Microsoft backend URL is not configured. Paste the existing Power Automate URL into microsoft-backend.js.", true);
    return;
  }

  let basePayload;
  try {
    basePayload = typeof window.collectFormData === "function" ? window.collectFormData(form) : null;
  } catch (error) {
    console.error(error);
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
      source: "github-pages-safety-checklist-hub-v2",
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
      photos: photos.map(({ dataUrl, width, height, ...file }) => file),
      pdfFileName: `${submissionId}.pdf`,
      pdfBase64: ""
    };

    payload.pdfBase64 = await msGeneratePdfBase64(payload, photos, submissionId);
    await msPostSubmission(payload);

    msShowBox("formSuccess", `Submission successful. Thank you. Your checklist has been submitted.<br><br>Submission ID: ${submissionId}`, true);
    form.reset();
    if (typeof window.updateFindingLogic === "function") window.updateFindingLogic();
  } catch (error) {
    console.error("Checklist submission failed:", error);
    msShowBox("formErrors", "Submission could not be completed. Please notify Safety and try again.", true);
  } finally {
    msDisableSubmit(form, false);
  }
};
