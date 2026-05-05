(function(){
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBSmZ8X_wpstpf2hJ1RHU5SzvdwIf7NRFQ",
    authDomain: "blmeddwo.firebaseapp.com",
    projectId: "blmeddwo",
    storageBucket: "blmeddwo.firebasestorage.app",
    messagingSenderId: "869405975518",
    appId: "1:869405975518:web:64e2667ccbb8db5931b34f"
  };

  let auth = null;
  let db = null;
  let authUser = null;
  let recordsCache = [];
  let recordsIndexCache = [];
  let userProfileCache = {};
  let pendingShortcutDwo = null;
  const MAX_SHORTCUT_ITEMS = 6;
  const MAX_PINNED_ITEMS = 12;
  const THEME_STORAGE_KEY = "bl_dwo_theme_v1";

  function esc(value){
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getStoredTheme(){
    try{
      return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
    }catch{
      return "light";
    }
  }

  function applyTheme(theme){
    const mode = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = mode;
    document.querySelectorAll(".theme-toggle").forEach(btn => {
      btn.textContent = mode === "dark" ? "Light Mode" : "Dark Mode";
      btn.title = mode === "dark" ? "Switch to light mode" : "Switch to dark mode";
      btn.setAttribute("aria-label", btn.title);
    });
  }

  function setStoredTheme(theme){
    try{
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }catch{}
    applyTheme(theme);
  }

  function toggleTheme(){
    setStoredTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  }

  function initThemeToggle(){
    applyTheme(getStoredTheme());
    if(document.querySelector(".theme-toggle")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    btn.onclick = toggleTheme;
    document.body.appendChild(btn);
    applyTheme(getStoredTheme());
  }

  function setStatus(id, message, className){
    const el = document.getElementById(id);
    if(!el) return;
    el.textContent = message;
    el.className = `portal-status${className ? ` ${className}` : ""}`;
  }

  function formatTimestamp(ts){
    if(!ts) return "";
    try{
      return new Date(ts).toLocaleString([], {
        month:"short",
        day:"numeric",
        year:"numeric",
        hour:"numeric",
        minute:"2-digit"
      });
    }catch{
      return "";
    }
  }

  function normalizeText(value){
    return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function normalizeDigits(value){
    return String(value || "").replace(/\D/g, "");
  }

  function getRecordFields(record){
    return record?.state?.fields || {};
  }

  function getRecordForm(record){
    return record?.state?.form || record?.form || "";
  }

  function getRecordSavedAt(record){
    return Number(record?.savedAtMs || record?.savedAt || 0);
  }

  function getFieldValue(fields, id){
    const value = fields?.[id];
    if(value === true || value === false) return value;
    return String(value || "").trim();
  }

  function getPatientFromRecord(record){
    const fields = getRecordFields(record);
    const form = getRecordForm(record);
    const oxygen = form === "oxygen";
    const name = oxygen ? getFieldValue(fields, "oxy-pat-name") : (getFieldValue(fields, "patient_name") || String(record?.patientName || "").trim());
    const dob = oxygen ? getFieldValue(fields, "oxy-dob") : (getFieldValue(fields, "dob") || String(record?.patientDob || "").trim());
    const phone = oxygen ? getFieldValue(fields, "oxy-phone") : getFieldValue(fields, "phone");
    const mobile = oxygen ? getFieldValue(fields, "oxy-mobile") : "";
    const insurance = oxygen ? "" : getFieldValue(fields, "insurance");
    const insuranceId = oxygen ? "" : getFieldValue(fields, "insurance_id");
    const address = oxygen ? getFieldValue(fields, "oxy-address") : getFieldValue(fields, "pat_addr");
    if(!name && !dob && !phone && !insuranceId) return null;
    const key = [normalizeText(name), normalizeDigits(dob), normalizeText(insuranceId), normalizeDigits(phone || mobile)].filter(Boolean).join("|") || `patient:${record.id}`;
    return {
      key,
      name,
      dob,
      phone: phone || mobile,
      insurance,
      insuranceId,
      address,
      label: name || "Unnamed patient"
    };
  }

  function getDoctorFromRecord(record){
    const fields = getRecordFields(record);
    const form = getRecordForm(record);
    const oxygen = form === "oxygen";
    const name = oxygen ? getFieldValue(fields, "oxy-phys-name") : getFieldValue(fields, "phys_name");
    const npi = oxygen ? getFieldValue(fields, "oxy-npi-search") : getFieldValue(fields, "npi_input");
    const phone = oxygen ? getFieldValue(fields, "oxy-phys-phone") : getFieldValue(fields, "phys_phone");
    const fax = oxygen ? getFieldValue(fields, "oxy-phys-fax") : getFieldValue(fields, "phys_fax");
    const address = oxygen ? getFieldValue(fields, "oxy-phys-addr") : getFieldValue(fields, "phys_addr");
    if(!name && !npi && !phone && !fax) return null;
    const key = [normalizeText(npi || name), normalizeDigits(fax), normalizeDigits(phone)].filter(Boolean).join("|") || `doctor:${record.id}`;
    return {
      key,
      name,
      npi,
      phone,
      fax,
      address,
      label: name || npi || "Unnamed doctor"
    };
  }

  function getRecordHcpcs(record){
    const fields = getRecordFields(record);
    const codes = [];
    Object.entries(fields).forEach(([key, value]) => {
      if(!value || !/hcpcs/i.test(key)) return;
      const code = String(value || "").trim().toUpperCase();
      if(code && !codes.includes(code)) codes.push(code);
    });
    return codes.slice(0, 6);
  }

  function getRecordDiagnoses(record){
    return Object.values(record?.state?.icdSelections || {}).map(value => String(value || "").trim().toUpperCase()).filter(Boolean);
  }

  function buildRecordIndex(record){
    const patient = getPatientFromRecord(record);
    const doctor = getDoctorFromRecord(record);
    const hcpcs = getRecordHcpcs(record);
    const diagnoses = getRecordDiagnoses(record);
    const searchParts = [
      record.patientName,
      record.patientDob,
      record.form,
      patient?.name,
      patient?.dob,
      patient?.phone,
      patient?.insurance,
      patient?.insuranceId,
      patient?.address,
      doctor?.name,
      doctor?.npi,
      doctor?.phone,
      doctor?.fax,
      doctor?.address,
      ...hcpcs,
      ...diagnoses
    ];
    const digitParts = [
      record.patientDob,
      patient?.phone,
      patient?.insuranceId,
      doctor?.npi,
      doctor?.phone,
      doctor?.fax
    ];
    return {
      record,
      patient,
      doctor,
      hcpcs,
      diagnoses,
      searchBlob: searchParts.map(value => normalizeText(value)).filter(Boolean).join(" "),
      digitsBlob: digitParts.map(value => normalizeDigits(value)).filter(Boolean).join(" ")
    };
  }

  function getLatestUniqueItems(items){
    const map = new Map();
    items.forEach(item => {
      if(!item?.key) return;
      const existing = map.get(item.key);
      if(!existing || Number(item.savedAtMs || 0) > Number(existing.savedAtMs || 0)){
        map.set(item.key, item);
      }
    });
    return Array.from(map.values()).sort((a,b) => Number(b.savedAtMs || 0) - Number(a.savedAtMs || 0));
  }

  function getPinnedPatients(){
    return Array.isArray(userProfileCache.pinnedPatients) ? userProfileCache.pinnedPatients : [];
  }

  function getPinnedDoctors(){
    return Array.isArray(userProfileCache.pinnedDoctors) ? userProfileCache.pinnedDoctors : [];
  }

  function isPinnedPatient(record){
    const patient = getPatientFromRecord(record);
    if(!patient) return false;
    return getPinnedPatients().some(item => item.key === patient.key);
  }

  function isPinnedDoctor(record){
    const doctor = getDoctorFromRecord(record);
    if(!doctor) return false;
    return getPinnedDoctors().some(item => item.key === doctor.key);
  }

  function getRecentPatients(){
    return getLatestUniqueItems(recordsIndexCache.map(item => item.patient ? ({
      key: item.patient.key,
      label: item.patient.label,
      subtitle: [item.patient.dob ? `DOB ${item.patient.dob}` : "", item.patient.insurance || ""].filter(Boolean).join(" | "),
      recordId: item.record.id,
      savedAtMs: getRecordSavedAt(item.record)
    }) : null)).slice(0, MAX_SHORTCUT_ITEMS);
  }

  function getRecentDoctors(){
    return getLatestUniqueItems(recordsIndexCache.map(item => item.doctor ? ({
      key: item.doctor.key,
      label: item.doctor.label,
      subtitle: [item.doctor.npi ? `NPI ${item.doctor.npi}` : "", item.doctor.fax ? `Fax ${item.doctor.fax}` : ""].filter(Boolean).join(" | "),
      recordId: item.record.id,
      savedAtMs: getRecordSavedAt(item.record)
    }) : null)).slice(0, MAX_SHORTCUT_ITEMS);
  }

  function resolvePinnedItem(pin, type){
    if(!pin) return null;
    const match = recordsIndexCache.find(item => {
      const source = type === "patient" ? item.patient : item.doctor;
      return source?.key === pin.key;
    }) || recordsIndexCache.find(item => item.record.id === pin.recordId);
    return {
      key: pin.key,
      label: pin.label,
      subtitle: pin.subtitle || "",
      recordId: match?.record?.id || pin.recordId || "",
      savedAtMs: match?.record ? getRecordSavedAt(match.record) : Number(pin.updatedAtMs || 0)
    };
  }

  function getResolvedPinnedPatients(){
    return getPinnedPatients().map(item => resolvePinnedItem(item, "patient")).filter(Boolean).slice(0, MAX_PINNED_ITEMS);
  }

  function getResolvedPinnedDoctors(){
    return getPinnedDoctors().map(item => resolvePinnedItem(item, "doctor")).filter(Boolean).slice(0, MAX_PINNED_ITEMS);
  }

  async function savePinnedCollections(updates){
    if(!authUser || !db) return;
    userProfileCache = { ...userProfileCache, ...updates };
    await withTimeout(db.collection("users").doc(authUser.uid).set(updates, { merge:true }), 12000);
  }

  function renderShortcutList(listId, items, type){
    const wrap = document.getElementById(listId);
    if(!wrap) return;
    if(!items.length){
      wrap.innerHTML = `<div class="shortcut-empty">No ${type.replace("-", " ")} saved yet.</div>`;
      return;
    }
    const sourceType = type.includes("doctor") ? "doctor" : "patient";
    wrap.innerHTML = items.map(item => `
      <div class="shortcut-item">
        <div>
          <strong>${esc(item.label || "Saved item")}</strong>
          <div class="shortcut-sub">${esc(item.subtitle || "Most recent saved DWO")}${item.savedAtMs ? `<br/>Last saved: ${esc(formatTimestamp(item.savedAtMs))}` : ""}</div>
        </div>
        <div class="shortcut-actions">
          ${item.recordId ? `<button class="btn btn-ghost" type="button" onclick="portalOpenRecord('${item.recordId}')">Open Latest</button>` : ""}
          ${item.recordId ? `<button class="btn btn-stamp" type="button" onclick="portalStartShortcutDwo('${item.recordId}','${sourceType}',decodeURIComponent('${encodeURIComponent(item.label || "Saved item")}'))">New DWO</button>` : ""}
          ${type === "pinned-patient" ? `<button class="btn btn-ghost" type="button" onclick="portalUnpinPatient(decodeURIComponent('${encodeURIComponent(item.key)}'))">Remove</button>` : ""}
          ${type === "pinned-doctor" ? `<button class="btn btn-ghost" type="button" onclick="portalUnpinDoctor(decodeURIComponent('${encodeURIComponent(item.key)}'))">Remove</button>` : ""}
        </div>
      </div>
    `).join("");
  }

  function renderShortcuts(){
    renderShortcutList("recent-patients-list", getRecentPatients(), "recent-patients");
    renderShortcutList("recent-doctors-list", getRecentDoctors(), "recent-doctors");
    renderShortcutList("pinned-patients-list", getResolvedPinnedPatients(), "pinned-patient");
    renderShortcutList("pinned-doctors-list", getResolvedPinnedDoctors(), "pinned-doctor");
  }

  function openShortcutDwoModal(recordId, sourceType, label){
    pendingShortcutDwo = { recordId, sourceType, label: String(label || "").trim() || "saved shortcut" };
    const title = document.getElementById("shortcut-dwo-modal-title");
    const text = document.getElementById("shortcut-dwo-modal-text");
    if(title) title.textContent = "Choose New DWO Form";
    if(text){
      text.textContent = sourceType === "doctor"
        ? `Choose which new DWO form should open with doctor details from ${pendingShortcutDwo.label}.`
        : sourceType === "record"
          ? `Choose which new DWO form should open with the same patient and doctor information from ${pendingShortcutDwo.label}.`
          : `Choose which new DWO form should open with patient details from ${pendingShortcutDwo.label}.`;
    }
    document.getElementById("shortcut-dwo-modal")?.classList.add("open");
  }

  function closeShortcutDwoModal(){
    pendingShortcutDwo = null;
    document.getElementById("shortcut-dwo-modal")?.classList.remove("open");
  }

  function confirmShortcutDwo(formType){
    if(!pendingShortcutDwo?.recordId){
      closeShortcutDwoModal();
      return;
    }
    const query = pendingShortcutDwo.sourceType === "record"
      ? new URLSearchParams({
          form: formType,
          clone: pendingShortcutDwo.recordId
        })
      : new URLSearchParams({
          form: formType,
          seedRecord: pendingShortcutDwo.recordId,
          seedType: pendingShortcutDwo.sourceType
        });
    window.location.href = `form.html?${query.toString()}`;
  }

  function getFriendlyAuthMessage(err, fallback){
    const code = err?.code || "";
    const messages = {
      "auth/wrong-password": "Password is incorrect.",
      "auth/invalid-credential": "Email or password is incorrect.",
      "auth/user-not-found": "No account was found with that email.",
      "auth/email-already-in-use": "An account with that email already exists.",
      "auth/weak-password": "Password must be at least 6 characters.",
      "auth/invalid-email": "Enter a valid email address.",
      "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
      "auth/invalid-action-code": "That verification link or code is no longer valid.",
      "auth/expired-action-code": "That verification link or code has expired."
    };
    return messages[code] || fallback;
  }

  function getFriendlyCloudMessage(err, fallback){
    const code = err?.code || err?.message || "";
    const messages = {
      "timeout": "Cloud request timed out. Check Firestore setup and your connection.",
      "permission-denied": "Cloud access is blocked by your Firestore rules.",
      "failed-precondition": "Create the Firestore Database in Firebase console, then publish the Firestore rules.",
      "unavailable": "The cloud database is unavailable right now."
    };
    return messages[code] || fallback;
  }

  function withTimeout(promise, ms){
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        window.setTimeout(() => {
          const error = new Error("timeout");
          error.code = "timeout";
          reject(error);
        }, ms);
      })
    ]);
  }

  function initFirebase(){
    if(!window.firebase) return false;
    if(!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    auth = firebase.auth();
    db = firebase.firestore();
    return true;
  }

  function getPage(){
    return document.body.dataset.page || "";
  }

  function getQueryParam(name){
    return new URLSearchParams(window.location.search).get(name) || "";
  }

  function redirectTo(path){
    window.location.href = path;
  }

  function redirectToVerify(email){
    const query = email ? `?email=${encodeURIComponent(email)}` : "";
    redirectTo(`verify-email.html${query}`);
  }

  function getEmailValue(){
    return (
      document.getElementById("login-email")?.value ||
      document.getElementById("signup-email")?.value ||
      ""
    ).trim();
  }

  function getPasswordValue(){
    return (
      document.getElementById("login-password")?.value ||
      document.getElementById("signup-password")?.value ||
      ""
    );
  }

  function getConfirmPasswordValue(){
    return document.getElementById("signup-password-confirm")?.value || "";
  }

  async function applyLoginPersistence(){
    if(!auth) return;
    const rememberInput = document.getElementById("login-remember") || document.getElementById("signup-remember");
    const remember = rememberInput ? !!rememberInput.checked : true;
    await auth.setPersistence(
      remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION
    );
  }

  async function loadProfile(){
    if(!authUser || !db) return {};
    const snap = await withTimeout(db.collection("users").doc(authUser.uid).get(), 12000);
    userProfileCache = snap.exists ? (snap.data() || {}) : {};
    return userProfileCache;
  }

  async function saveProfile(){
    if(!authUser || !db){
      setStatus("profile-status", "Sign in again before saving your profile.", "status-warn");
      return;
    }
    const saveButton = document.getElementById("profile-save-button");
    if(saveButton){
      saveButton.disabled = true;
      saveButton.textContent = "Saving...";
    }
    setStatus("profile-status", "Saving profile...", "");
    const payload = {
      email: authUser.email || "",
      accountName: (document.getElementById("profile-display-label")?.value || "").trim(),
      firstName: (document.getElementById("profile-first-name")?.value || "").trim(),
      lastName: (document.getElementById("profile-last-name")?.value || "").trim(),
      extension: (document.getElementById("profile-extension")?.value || "").trim(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    try{
      await withTimeout(db.collection("users").doc(authUser.uid).set(payload, { merge:true }), 12000);
      userProfileCache = { ...userProfileCache, ...payload };
      setStatus("profile-status", "Profile saved successfully.", "status-ok");
    }catch(err){
      setStatus("profile-status", getFriendlyCloudMessage(err, "Profile could not be saved."), "status-warn");
    }finally{
      if(saveButton){
        saveButton.disabled = false;
        saveButton.textContent = "Save Profile";
      }
    }
  }

  async function changePassword(){
    if(!authUser || !authUser.email){
      setStatus("password-status", "Sign in again before changing your password.", "status-warn");
      return;
    }
    const emailConfirm = (document.getElementById("profile-password-email")?.value || "").trim();
    const currentPassword = document.getElementById("profile-current-password")?.value || "";
    const newPassword = document.getElementById("profile-new-password")?.value || "";
    const confirmPassword = document.getElementById("profile-confirm-password")?.value || "";
    const button = document.getElementById("password-save-button");
    if(!emailConfirm || !currentPassword || !newPassword || !confirmPassword){
      setStatus("password-status", "Fill in your email, current password, and new password fields.", "status-warn");
      return;
    }
    if(emailConfirm.toLowerCase() !== String(authUser.email || "").toLowerCase()){
      setStatus("password-status", "Enter the same email address as the signed-in account.", "status-warn");
      return;
    }
    if(newPassword.length < 6){
      setStatus("password-status", "New password must be at least 6 characters.", "status-warn");
      return;
    }
    if(newPassword !== confirmPassword){
      setStatus("password-status", "New password and confirmation do not match.", "status-warn");
      return;
    }
    try{
      if(button){
        button.disabled = true;
        button.textContent = "Updating...";
      }
      setStatus("password-status", "Verifying current password and updating your password...", "");
      const credential = firebase.auth.EmailAuthProvider.credential(authUser.email, currentPassword);
      await withTimeout(authUser.reauthenticateWithCredential(credential), 12000);
      await withTimeout(authUser.updatePassword(newPassword), 12000);
      ["profile-current-password", "profile-new-password", "profile-confirm-password"].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = "";
      });
      setStatus("password-status", "Password updated successfully.", "status-ok");
    }catch(err){
      setStatus("password-status", getFriendlyAuthMessage(err, "Password could not be updated."), "status-warn");
    }finally{
      if(button){
        button.disabled = false;
        button.textContent = "Update Password";
      }
    }
  }

  async function fetchRecords(){
    if(!authUser || !db) return [];
    const snap = await withTimeout(
      db.collection("users").doc(authUser.uid).collection("records").orderBy("savedAtMs", "desc").get(),
      12000
    );
    recordsCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    recordsIndexCache = recordsCache.map(buildRecordIndex);
    return recordsCache;
  }

  function renderRecords(){
    const wrap = document.getElementById("records-list");
    if(!wrap) return;
    const q = normalizeText(document.getElementById("records-search")?.value || "");
    const digits = normalizeDigits(q);
    const filtered = recordsIndexCache.filter(item => {
      if(!q) return true;
      return item.searchBlob.includes(q) || (digits && item.digitsBlob.includes(digits));
    });
    if(!filtered.length){
      wrap.innerHTML = `<div class="portal-status">No records match that search.</div>`;
      return;
    }
    wrap.innerHTML = filtered.map(item => {
      const record = item.record;
      const patientPinned = isPinnedPatient(record);
      const doctorPinned = isPinnedDoctor(record);
      const subtitle = [
        item.doctor?.label || "",
        item.patient?.insurance || "",
        formatTimestamp(record.savedAtMs || record.savedAt)
      ].filter(Boolean).join(" | ");
      const meta = [
        item.patient?.dob ? `DOB: ${item.patient.dob}` : "DOB: Not entered",
        item.patient?.phone ? `Patient Phone: ${item.patient.phone}` : "",
        item.doctor?.label ? `Doctor: ${item.doctor.label}` : "",
        item.doctor?.npi ? `NPI: ${item.doctor.npi}` : "",
        item.doctor?.fax ? `Fax: ${item.doctor.fax}` : "",
        item.patient?.insurance ? `Insurance: ${item.patient.insurance}` : "",
        item.patient?.insuranceId ? `Insurance ID: ${item.patient.insuranceId}` : "",
        item.hcpcs.length ? `HCPCS: ${item.hcpcs.join(", ")}` : "",
        item.diagnoses.length ? `Diagnosis: ${item.diagnoses.join(", ")}` : "",
        `Saved: ${formatTimestamp(record.savedAtMs || record.savedAt)}`
      ].filter(Boolean).join("<br/>");
      return `
      <article class="record-card">
        <div class="record-head">
          <div>
            <h3>${esc(item.patient?.label || record.patientName || "Untitled Record")}</h3>
            <div class="record-subtitle">${esc(subtitle || "Saved DWO record")}</div>
          </div>
          <div class="record-form-badge">${esc(String(record.form || "").toUpperCase())}</div>
        </div>
        <div class="record-meta">${meta}</div>
        <div class="portal-actions record-actions">
          <button class="btn btn-stamp" type="button" onclick="portalOpenRecord('${record.id}')">Open Record</button>
          <button class="btn btn-stamp" type="button" onclick="portalCloneRecord('${record.id}',decodeURIComponent('${encodeURIComponent(item.patient?.label || record.patientName || "Saved record")}'))">New From This</button>
          ${item.patient ? `<button class="btn btn-ghost" type="button" onclick="portalTogglePinnedPatient('${record.id}')">${patientPinned ? "Unpin Patient" : "Pin Patient"}</button>` : ""}
          ${item.doctor ? `<button class="btn btn-ghost" type="button" onclick="portalTogglePinnedDoctor('${record.id}')">${doctorPinned ? "Unpin Doctor" : "Pin Doctor"}</button>` : ""}
          <button class="btn btn-ghost" type="button" onclick="portalDeleteRecord('${record.id}')">Delete</button>
        </div>
      </article>
    `;
    }).join("");
  }

  async function refreshRecords(){
    try{
      setStatus("records-status", "Loading records...", "");
      await fetchRecords();
      renderRecords();
      renderShortcuts();
      setStatus(
        "records-status",
        recordsCache.length ? `${recordsCache.length} records loaded. Search patient, doctor, insurance, HCPCS, diagnosis, or form type.` : "No records saved yet.",
        recordsCache.length ? "status-ok" : "status-warn"
      );
    }catch(err){
      setStatus("records-status", getFriendlyCloudMessage(err, "Records could not be loaded."), "status-warn");
    }
  }

  async function deleteRecord(recordId){
    if(!authUser || !db) return;
    try{
      await withTimeout(db.collection("users").doc(authUser.uid).collection("records").doc(recordId).delete(), 12000);
      await refreshRecords();
    }catch(err){
      setStatus("records-status", getFriendlyCloudMessage(err, "Record could not be deleted."), "status-warn");
    }
  }

  async function togglePinnedPatient(recordId){
    const record = recordsCache.find(item => item.id === recordId);
    const patient = getPatientFromRecord(record);
    if(!record || !patient){
      setStatus("records-status", "That record does not contain patient details to pin.", "status-warn");
      return;
    }
    try{
      const pinned = getPinnedPatients();
      const exists = pinned.some(item => item.key === patient.key);
      const next = exists
        ? pinned.filter(item => item.key !== patient.key)
        : [{ key: patient.key, label: patient.label, subtitle: [patient.dob ? `DOB ${patient.dob}` : "", patient.insurance || ""].filter(Boolean).join(" | "), recordId, updatedAtMs: Date.now() }, ...pinned].slice(0, MAX_PINNED_ITEMS);
      await savePinnedCollections({ pinnedPatients: next });
      renderRecords();
      renderShortcuts();
      setStatus("records-status", exists ? `${patient.label} removed from pinned patients.` : `${patient.label} pinned to your account.`, "status-ok");
    }catch(err){
      setStatus("records-status", getFriendlyCloudMessage(err, "Pinned patients could not be updated."), "status-warn");
    }
  }

  async function togglePinnedDoctor(recordId){
    const record = recordsCache.find(item => item.id === recordId);
    const doctor = getDoctorFromRecord(record);
    if(!record || !doctor){
      setStatus("records-status", "That record does not contain doctor details to pin.", "status-warn");
      return;
    }
    try{
      const pinned = getPinnedDoctors();
      const exists = pinned.some(item => item.key === doctor.key);
      const next = exists
        ? pinned.filter(item => item.key !== doctor.key)
        : [{ key: doctor.key, label: doctor.label, subtitle: [doctor.npi ? `NPI ${doctor.npi}` : "", doctor.fax ? `Fax ${doctor.fax}` : ""].filter(Boolean).join(" | "), recordId, updatedAtMs: Date.now() }, ...pinned].slice(0, MAX_PINNED_ITEMS);
      await savePinnedCollections({ pinnedDoctors: next });
      renderRecords();
      renderShortcuts();
      setStatus("records-status", exists ? `${doctor.label} removed from pinned doctors.` : `${doctor.label} pinned to your account.`, "status-ok");
    }catch(err){
      setStatus("records-status", getFriendlyCloudMessage(err, "Pinned doctors could not be updated."), "status-warn");
    }
  }

  async function unpinPatient(key){
    try{
      const next = getPinnedPatients().filter(item => item.key !== key);
      await savePinnedCollections({ pinnedPatients: next });
      renderRecords();
      renderShortcuts();
      setStatus("records-status", "Pinned patient removed.", "status-ok");
    }catch(err){
      setStatus("records-status", getFriendlyCloudMessage(err, "Pinned patient could not be removed."), "status-warn");
    }
  }

  async function unpinDoctor(key){
    try{
      const next = getPinnedDoctors().filter(item => item.key !== key);
      await savePinnedCollections({ pinnedDoctors: next });
      renderRecords();
      renderShortcuts();
      setStatus("records-status", "Pinned doctor removed.", "status-ok");
    }catch(err){
      setStatus("records-status", getFriendlyCloudMessage(err, "Pinned doctor could not be removed."), "status-warn");
    }
  }

  async function signIn(){
    const email = getEmailValue();
    const password = getPasswordValue();
    if(!email || !password){
      setStatus("login-status", "Enter both email and password.", "status-warn");
      return;
    }
    try{
      await applyLoginPersistence();
      const cred = await auth.signInWithEmailAndPassword(email, password);
      if(cred.user){
        await withTimeout(cred.user.reload(), 12000);
        if(!cred.user.emailVerified){
          setStatus("login-status", "Verify your email before signing in.", "status-warn");
          redirectToVerify(email);
          return;
        }
      }
      redirectTo("index.html");
    }catch(err){
      setStatus("login-status", getFriendlyAuthMessage(err, "Sign-in failed."), "status-warn");
    }
  }

  async function signUp(){
    const email = getEmailValue();
    const password = getPasswordValue();
    const confirmPassword = getConfirmPasswordValue();
    if(!email || !password){
      setStatus("signup-status", "Enter your email and password.", "status-warn");
      return;
    }
    if(password.length < 6){
      setStatus("signup-status", "Password must be at least 6 characters.", "status-warn");
      return;
    }
    if(password !== confirmPassword){
      setStatus("signup-status", "Passwords do not match.", "status-warn");
      return;
    }
    try{
      await applyLoginPersistence();
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await withTimeout(db.collection("users").doc(cred.user.uid).set({
        email,
        emailVerified: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true }), 12000);
      await withTimeout(cred.user.sendEmailVerification(), 12000);
      setStatus("signup-status", "Account created. Check your email for the verification link.", "status-ok");
      redirectToVerify(email);
    }catch(err){
      setStatus("signup-status", getFriendlyCloudMessage(err, getFriendlyAuthMessage(err, "Account could not be created.")), "status-warn");
    }
  }

  function getVerificationCodeValue(){
    const raw = (document.getElementById("verify-code")?.value || "").trim();
    if(!raw) return "";
    try{
      const parsed = new URL(raw);
      return parsed.searchParams.get("oobCode") || raw;
    }catch{
      const match = raw.match(/[?&]oobCode=([^&]+)/i);
      return match ? decodeURIComponent(match[1]) : raw;
    }
  }

  async function processVerificationState(markVerified){
    if(auth?.currentUser){
      await withTimeout(auth.currentUser.reload(), 12000);
      authUser = auth.currentUser;
      if(markVerified && db && authUser){
        await withTimeout(db.collection("users").doc(authUser.uid).set({
          email: authUser.email || "",
          emailVerified: !!authUser.emailVerified,
          verifiedAt: authUser.emailVerified ? firebase.firestore.FieldValue.serverTimestamp() : null
        }, { merge:true }), 12000);
      }
    }
  }

  async function resendVerificationEmail(){
    if(!authUser){
      setStatus("verify-status", "Sign in with your new account first if you need to resend the verification email.", "status-warn");
      return;
    }
    try{
      await withTimeout(authUser.sendEmailVerification(), 12000);
      setStatus("verify-status", "A new verification email has been sent.", "status-ok");
    }catch(err){
      setStatus("verify-status", getFriendlyAuthMessage(err, "Verification email could not be sent."), "status-warn");
    }
  }

  async function refreshVerificationStatus(){
    if(!authUser){
      setStatus("verify-status", "Open the verification email, then sign in again once your address is verified.", "status-warn");
      return;
    }
    try{
      await processVerificationState(true);
      if(authUser?.emailVerified){
        setStatus("verify-status", "Email verified. Redirecting to the home page...", "status-ok");
        window.setTimeout(() => redirectTo("index.html"), 500);
        return;
      }
      setStatus("verify-status", "Your email is not verified yet. Open the verification email and then try again.", "status-warn");
    }catch(err){
      setStatus("verify-status", getFriendlyAuthMessage(err, "Verification status could not be refreshed."), "status-warn");
    }
  }

  async function applyVerificationCode(){
    const code = getVerificationCodeValue();
    if(!code){
      setStatus("verify-status", "Paste the verification link or code from the email first.", "status-warn");
      return;
    }
    try{
      await withTimeout(auth.applyActionCode(code), 12000);
      await processVerificationState(true);
      if(authUser?.emailVerified){
        setStatus("verify-status", "Email verified successfully. Redirecting to the home page...", "status-ok");
        window.setTimeout(() => redirectTo("index.html"), 500);
      }else{
        setStatus("verify-status", "Email verified successfully. Please sign in to continue.", "status-ok");
        window.setTimeout(() => redirectTo("login.html"), 800);
      }
    }catch(err){
      setStatus("verify-status", getFriendlyAuthMessage(err, "That verification code is invalid or has expired."), "status-warn");
    }
  }

  async function signOut(){
    if(!auth) return;
    await auth.signOut();
    redirectTo("login.html");
  }

  async function returnToLogin(){
    try{
      if(auth?.currentUser && !auth.currentUser.emailVerified){
        await auth.signOut();
      }
    }catch{}
    redirectTo("login.html");
  }

  function renderHome(user, profile){
    const emailEl = document.getElementById("home-email");
    if(emailEl) emailEl.textContent = user.email || "";

    const note = document.getElementById("home-profile-note");
    if(note){
      const display = [
        profile.accountName || "",
        [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim(),
        profile.extension ? `Ext ${profile.extension}` : ""
      ].filter(Boolean).join(" | ");
      note.textContent = display || "Set up your profile for fax cover details.";
    }
  }

  function handlePage(user){
    const page = getPage();
    authUser = user || null;

    if(page === "login"){
      if(authUser?.emailVerified) redirectTo("index.html");
      else if(authUser && !authUser.emailVerified){
        setStatus("login-status", "An unverified account session is open. You can sign in again or finish verifying the email.", "status-warn");
      }
      return;
    }

    if(page === "signup"){
      if(authUser?.emailVerified) redirectTo("index.html");
      return;
    }

    if(page === "verify-email"){
      const verifyEmailEl = document.getElementById("verify-email-address");
      if(verifyEmailEl) verifyEmailEl.textContent = authUser?.email || getQueryParam("email") || "your email address";
      if(authUser?.emailVerified) redirectTo("index.html");
      return;
    }

    if(!authUser){
      redirectTo("login.html");
      return;
    }

    if(!authUser.emailVerified){
      redirectToVerify(authUser.email || "");
      return;
    }

    if(page === "home" || page === "manual"){
      renderHome(authUser, {});
      loadProfile()
        .then(profile => renderHome(authUser, profile))
        .catch(() => renderHome(authUser, {}));
      return;
    }

    if(page === "profile"){
      const emailField = document.getElementById("profile-email");
      if(emailField) emailField.value = authUser.email || "";
      const passwordEmailField = document.getElementById("profile-password-email");
      if(passwordEmailField) passwordEmailField.value = authUser.email || "";
      loadProfile()
        .then(profile => {
          if(document.getElementById("profile-display-label")) document.getElementById("profile-display-label").value = profile.accountName || "";
          if(document.getElementById("profile-first-name")) document.getElementById("profile-first-name").value = profile.firstName || "";
          if(document.getElementById("profile-last-name")) document.getElementById("profile-last-name").value = profile.lastName || "";
          if(document.getElementById("profile-extension")) document.getElementById("profile-extension").value = profile.extension || "";
        })
        .catch(() => {
          setStatus("profile-status", "Signed-in email loaded. Profile details can be updated here.", "");
        });
      return;
    }

    if(page === "records"){
      const search = document.getElementById("records-search");
      if(search) search.addEventListener("input", renderRecords);
      loadProfile()
        .catch(() => {
          userProfileCache = {};
        })
        .finally(() => {
          refreshRecords();
        });
    }
  }

  document.addEventListener("DOMContentLoaded", function(){
    initThemeToggle();
    if(!initFirebase()){
      ["login-status", "signup-status", "verify-status"].forEach(id => {
        setStatus(id, "The website could not connect right now.", "status-warn");
      });
      return;
    }
    const page = getPage();
    if(page === "login"){
      ["login-email", "login-password"].forEach(id => {
        document.getElementById(id)?.addEventListener("keydown", event => {
          if(event.key !== "Enter") return;
          event.preventDefault();
          signIn();
        });
      });
    }
    if(page === "signup"){
      ["signup-email", "signup-password", "signup-password-confirm"].forEach(id => {
        document.getElementById(id)?.addEventListener("keydown", event => {
          if(event.key !== "Enter") return;
          event.preventDefault();
          signUp();
        });
      });
    }
    if(page === "verify-email"){
      const codeField = document.getElementById("verify-code");
      codeField?.addEventListener("keydown", event => {
        if(event.key !== "Enter") return;
        event.preventDefault();
        applyVerificationCode();
      });
      const mode = getQueryParam("mode");
      const oobCode = getQueryParam("oobCode");
      if(mode === "verifyEmail" && oobCode){
        document.getElementById("verify-code").value = oobCode;
        applyVerificationCode();
      }
    }
    document.getElementById("shortcut-dwo-modal")?.addEventListener("click", event => {
      if(event.target?.id === "shortcut-dwo-modal") closeShortcutDwoModal();
    });
    document.addEventListener("keydown", event => {
      if(event.key === "Escape") closeShortcutDwoModal();
    });
    auth.onAuthStateChanged(handlePage);
  });

  window.portalSignIn = signIn;
  window.portalSignUp = signUp;
  window.portalSignOut = signOut;
  window.portalReturnToLogin = returnToLogin;
  window.portalResendVerification = resendVerificationEmail;
  window.portalRefreshVerification = refreshVerificationStatus;
  window.portalApplyVerificationCode = applyVerificationCode;
  window.portalSaveProfile = saveProfile;
  window.portalChangePassword = changePassword;
  window.portalDeleteRecord = deleteRecord;
  window.portalOpenRecord = function(recordId){
    window.location.href = `form.html?record=${encodeURIComponent(recordId)}`;
  };
  window.portalCloneRecord = function(recordId, label){
    openShortcutDwoModal(recordId, "record", label || "saved record");
  };
  window.portalStartShortcutDwo = openShortcutDwoModal;
  window.portalConfirmShortcutDwo = confirmShortcutDwo;
  window.portalCloseShortcutDwoModal = closeShortcutDwoModal;
  window.portalTogglePinnedPatient = togglePinnedPatient;
  window.portalTogglePinnedDoctor = togglePinnedDoctor;
  window.portalUnpinPatient = unpinPatient;
  window.portalUnpinDoctor = unpinDoctor;
})();
