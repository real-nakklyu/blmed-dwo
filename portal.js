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
      refreshRecords();
    }
  }

  document.addEventListener("DOMContentLoaded", function(){
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
})();
