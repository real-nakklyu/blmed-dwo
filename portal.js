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

  function esc(value){
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  function getFriendlyAuthMessage(err, fallback){
    const code = err?.code || "";
    const messages = {
      "auth/wrong-password": "Password is incorrect.",
      "auth/invalid-credential": "Email or password is incorrect.",
      "auth/user-not-found": "No account was found with that email.",
      "auth/email-already-in-use": "An account with that email already exists.",
      "auth/weak-password": "Password must be at least 6 characters.",
      "auth/invalid-email": "Enter a valid email address.",
      "auth/too-many-requests": "Too many attempts. Please wait a moment and try again."
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

  async function applyLoginPersistence(){
    if(!auth) return;
    const remember = !!document.getElementById("login-remember")?.checked;
    await auth.setPersistence(
      remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION
    );
  }

  async function loadProfile(){
    if(!authUser || !db) return {};
    const snap = await withTimeout(db.collection("users").doc(authUser.uid).get(), 12000);
    return snap.exists ? (snap.data() || {}) : {};
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

  async function fetchRecords(){
    if(!authUser || !db) return [];
    const snap = await withTimeout(
      db.collection("users").doc(authUser.uid).collection("records").orderBy("savedAtMs", "desc").get(),
      12000
    );
    recordsCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return recordsCache;
  }

  function renderRecords(){
    const wrap = document.getElementById("records-list");
    if(!wrap) return;
    const q = (document.getElementById("records-search")?.value || "").trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const filtered = recordsCache.filter(record => {
      if(!q) return true;
      const name = String(record.patientName || "").toLowerCase();
      const dob = String(record.patientDob || "").replace(/\D/g, "");
      return name.includes(q) || (digits && dob.includes(digits));
    });
    if(!filtered.length){
      wrap.innerHTML = `<div class="portal-status">No records match that search.</div>`;
      return;
    }
    wrap.innerHTML = filtered.map(record => `
      <article class="record-card">
        <h3>${esc(record.patientName || "Untitled Record")}</h3>
        <div class="record-meta">
          DOB: ${esc(record.patientDob || "Not entered")}<br/>
          Form: ${esc(String(record.form || "").toUpperCase())}<br/>
          Saved: ${esc(formatTimestamp(record.savedAtMs || record.savedAt))}
        </div>
        <div class="portal-actions">
          <button class="btn btn-stamp" type="button" onclick="portalOpenRecord('${record.id}')">Open Record</button>
          <button class="btn btn-ghost" type="button" onclick="portalDeleteRecord('${record.id}')">Delete</button>
        </div>
      </article>
    `).join("");
  }

  async function refreshRecords(){
    try{
      setStatus("records-status", "Loading records...", "");
      await fetchRecords();
      renderRecords();
      setStatus(
        "records-status",
        recordsCache.length ? `${recordsCache.length} records loaded.` : "No records saved yet.",
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

  async function signIn(){
    const email = (document.getElementById("login-email")?.value || "").trim();
    const password = document.getElementById("login-password")?.value || "";
    if(!email || !password){
      setStatus("login-status", "Enter both email and password.", "status-warn");
      return;
    }
    try{
      await applyLoginPersistence();
      await auth.signInWithEmailAndPassword(email, password);
      window.location.href = "index.html";
    }catch(err){
      setStatus("login-status", getFriendlyAuthMessage(err, "Sign-in failed."), "status-warn");
    }
  }

  async function signUp(){
    const email = (document.getElementById("login-email")?.value || "").trim();
    const password = document.getElementById("login-password")?.value || "";
    if(!email || !password){
      setStatus("login-status", "Enter both email and password.", "status-warn");
      return;
    }
    try{
      await applyLoginPersistence();
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await withTimeout(db.collection("users").doc(cred.user.uid).set({
        email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true }), 12000);
      window.location.href = "index.html";
    }catch(err){
      setStatus("login-status", getFriendlyCloudMessage(err, getFriendlyAuthMessage(err, "Account could not be created.")), "status-warn");
    }
  }

  async function signOut(){
    if(!auth) return;
    await auth.signOut();
    window.location.href = "login.html";
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
    const page = document.body.dataset.page || "";
    authUser = user || null;

    if(page === "login"){
      if(authUser) window.location.href = "index.html";
      return;
    }

    if(!authUser){
      window.location.href = "login.html";
      return;
    }

    if(page === "home"){
      renderHome(authUser, {});
      loadProfile()
        .then(profile => renderHome(authUser, profile))
        .catch(() => renderHome(authUser, {}));
      return;
    }

    if(page === "profile"){
      const emailField = document.getElementById("profile-email");
      if(emailField) emailField.value = authUser.email || "";
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
      refreshRecords();
    }
  }

  document.addEventListener("DOMContentLoaded", function(){
    if(!initFirebase()){
      setStatus("login-status", "The website could not connect right now.", "status-warn");
      return;
    }
    if(document.body.dataset.page === "login"){
      ["login-email", "login-password"].forEach(id => {
        document.getElementById(id)?.addEventListener("keydown", event => {
          if(event.key !== "Enter") return;
          event.preventDefault();
          signIn();
        });
      });
    }
    auth.onAuthStateChanged(handlePage);
  });

  window.portalSignIn = signIn;
  window.portalSignUp = signUp;
  window.portalSignOut = signOut;
  window.portalSaveProfile = saveProfile;
  window.portalDeleteRecord = deleteRecord;
  window.portalOpenRecord = function(recordId){
    window.location.href = `form.html?record=${encodeURIComponent(recordId)}`;
  };
})();
