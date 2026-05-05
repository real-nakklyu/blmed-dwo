// в”Ђв”Ђ FORM TYPE STATE в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
let currentForm = "standard";
let wcVariant   = "standard"; // "standard" | "bariatric"
let bedVariant  = "E0260";
const STORAGE_KEYS = {
  drafts: "bl_dwo_drafts_v1",
  patients: "bl_dwo_patient_presets_v1",
  physicians: "bl_dwo_physician_presets_v1",
  staff: "bl_dwo_staff_profile_v2",
  firebase: "bl_dwo_firebase_config_v1",
  preferences: "bl_dwo_form_preferences_v1"
};
const AUTOSAVE_DELAY = 500;
let autosaveTimer = null;
let preferenceSaveTimer = null;
let latestChecklist = [];
let selectedRecordId = "";
let currentCloudRecordId = "";
let cloudRecordsCache = [];
let packageRecordIds = [];
let faxPackagePageCountOverride = 0;
let packageRenderingInProgress = false;
let recordLookupMode = "patient";
let recordLookupResultsCache = [];
let firebaseReady = false;
let auth = null;
let db = null;
let authUser = null;
let authStateBound = false;
const FORM_FILE_LABELS = {
  standard: "DME",
  wheelchair: "WHEELCHAIR",
  bed: "HOSPITAL BED",
  hoyer: "HOYER LIFT",
  compression: "COMPRESSION",
  oxygen: "OXYGEN",
  nutrition: "NUTRITION"
};
const requestedParams = new URLSearchParams(window.location.search);
const requestedFormType = requestedParams.get("form");
const requestedRecordId = requestedParams.get("record");
const requestedCloneId = requestedParams.get("clone");
const requestedSeedRecordId = requestedParams.get("seedRecord");
const requestedSeedType = requestedParams.get("seedType");
let requestedRouteApplied = false;
if(requestedFormType || requestedRecordId || requestedCloneId || requestedSeedRecordId){
  document.documentElement.classList.add("route-loading");
}
const OFFICE_PHONE = "(305) 909-0880";
const OFFICE_FAX = "(305) 539-0880";
const THEME_STORAGE_KEY = "bl_dwo_theme_v1";
const GOOGLE_MAPS_API_KEY = "AIzaSyCuVhNBfn6mlvVJHsLA34ijvNXsnYemkVA";
const FORM_FONT_HREF = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Manrope:wght@400;500;600;700&family=IM+Fell+English:ital@0;1&display=swap";

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

// в”Ђв”Ђ WHEELCHAIR CRITERIA TEXT в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const WC_CRITERIA = [
  "The beneficiary has a mobility limitation that significantly impairs his/her ability to participate in one or more activities of daily living (MRADLs) such as toileting, feeding, dressing, grooming, and bathing in customary locations in the home.",
  "The beneficiary's mobility limitation cannot be sufficiently resolved by the use of an appropriately fitted cane or walker.",
  "The beneficiary's home provides adequate access between rooms, maneuvering space, and surfaces for use of the manual wheelchair that is provided.",
  "Use of a manual wheelchair will significantly improve the beneficiary's ability to participate in MRADLs and the beneficiary will use it on a regular basis in the home.",
  "The beneficiary cannot self-propel in a standard wheelchair in the home; and the beneficiary can and does self-propel in a lightweight wheelchair.",
  "The beneficiary has sufficient upper extremity function and other physical and mental capabilities needed to safely self-propel the manual wheelchair that is provided in the home during a typical day. Limitations of strength, endurance, range of motion, or coordination, presence of pain, or deformity or absence of one or both upper extremities are relevant to the assessment of upper extremity function.",
  "The beneficiary has a caregiver who is available, willing, and able to provide assistance with the wheelchair."
];

// в”Ђв”Ђ BED CRITERIA TEXT в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const BED_CRITERIA = [
  "The beneficiary has a medical condition which requires positioning of the body in ways not feasible with an ordinary bed. Elevation of the head/upper body less than 30 degrees does not usually require the use of a hospital bed.",
  "The beneficiary requires positioning of the body in ways not feasible with an ordinary bed in order to alleviate pain.",
  "The beneficiary requires the head of the bed to be elevated more than 30 degrees most of the time due to congestive heart failure, chronic pulmonary disease, or problems with aspiration.",
  "The beneficiary requires frequent changes in body position and/or has an immediate need for a change in body position.",
  "The beneficiary requires traction equipment, which can only be attached to a hospital bed."
];

const HOYER_CRITERIA = [
  "The beneficiary would be bed confined without the use of a patient lift.",
  "Transfer between the bed and a chair, wheelchair, or commode is required."
];

// в”Ђв”Ђ WHEELCHAIR CODES в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const WC_CODES = {
  standard: [
    {code:"K0001", desc:"STANDARD WHEELCHAIR"},
    {code:"K0195", desc:"ELEVATING LEG RESTS"},
    {code:"E0974", desc:"MANUAL WHEELCHAIR ACCESSORY, ANTI-ROLLBACK DEVICE"},
    {code:"E0978", desc:"WHEELCHAIR ACCESSORY, POSITIONING BELT/SAFETY BELT/PELVIC STRAP"},
    {code:"E2601", desc:"GENERAL USE WHEELCHAIR SEAT CUSHION"},
    {code:"E2611", desc:"POSITIONING WHEELCHAIR SEAT CUSHION, WIDTH LESS THAN 22 INCHES, ANY DEPTH"},
    {code:"", desc:""},
  ],
  lightweight: [
    {code:"K0003", desc:"LIGHTWEIGHT WHEELCHAIR"},
    {code:"K0195", desc:"ELEVATING LEG RESTS"},
    {code:"E0974", desc:"MANUAL WHEELCHAIR ACCESSORY, ANTI-ROLLBACK DEVICE"},
    {code:"E0978", desc:"WHEELCHAIR ACCESSORY, POSITIONING BELT/SAFETY BELT/PELVIC STRAP"},
    {code:"E2601", desc:"GENERAL USE WHEELCHAIR SEAT CUSHION"},
    {code:"E2611", desc:"POSITIONING WHEELCHAIR SEAT CUSHION, WIDTH LESS THAN 22 INCHES, ANY DEPTH"},
    {code:"", desc:""},
  ],
  bariatric: [
    {code:"K0007", desc:"EXTRA HEAVY DUTY WHEELCHAIR"},
    {code:"K0195", desc:"ELEVATING LEG RESTS"},
    {code:"E0974", desc:"MANUAL WHEELCHAIR ACCESSORY, ANTI-ROLLBACK DEVICE"},
    {code:"E0978", desc:"WHEELCHAIR ACCESSORY, POSITIONING BELT/SAFETY BELT/PELVIC STRAP"},
    {code:"E2602", desc:"GENERAL USE WHEELCHAIR SEAT CUSHION, BARIATRIC"},
    {code:"E2612", desc:"POSITIONING WHEELCHAIR SEAT CUSHION, BARIATRIC, WIDTH 22 INCHES OR GREATER"},
    {code:"", desc:""},
  ]
};

// в”Ђв”Ђ BED CODES в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const BED_CODES = {
  E0260: [
    {code:"E0260", desc:"SEMI-ELECTRIC HOSPITAL BED WITH HEAD AND FOOT ADJUSTMENT, INCLUDING BOTH SIDE RAILS AND A MATTRESS"},
    {code:"", desc:""},
    {code:"", desc:""},
  ],
  E0255: [
    {code:"E0255", desc:"HOSPITAL BED, FIXED HEIGHT, WITH ANY TYPE SIDE RAILS, WITH MATTRESS"},
    {code:"", desc:""},
    {code:"", desc:""},
  ],
  E0261: [
    {code:"E0261", desc:"HOSPITAL BED, SEMI-ELECTRIC, WITH ANY TYPE SIDE RAILS, WITH MATTRESS"},
    {code:"E0272", desc:"MATTRESS, INNERSPRING"},
    {code:"", desc:""},
    {code:"", desc:""},
  ],
  E0265: [
    {code:"E0265", desc:"FULL-ELECTRIC HOSPITAL BED WITH HEAD, FOOT, AND HEIGHT ADJUSTMENT, INCLUDING BOTH SIDE RAILS AND A MATTRESS"},
    {code:"", desc:""},
    {code:"", desc:""},
  ],
  E0303: [
    {code:"E0303", desc:"HOSPITAL BED, HEAVY DUTY, EXTRA WIDE, WITH WEIGHT CAPACITY GREATER THAN 350 POUNDS, BUT LESS THAN OR EQUAL TO 600 POUNDS, WITH ANY TYPE SIDE RAILS, WITH MATTRESS"},
    {code:"", desc:""},
    {code:"", desc:""},
  ]
};

const HOYER_CODES = [
  {code:"E0630", desc:"PATIENT LIFT, HYDRAULIC OR MECHANICAL, INCLUDES ANY SEAT, SLING"},
  {code:"E0635", desc:"PATIENT LIFT, ELECTRIC WITH SEAT OR SLING"},
  {code:"E0621", desc:"SLING OR SEAT, PATIENT LIFT, CANVAS OR NYLON"}
];

// в”Ђв”Ђ HOME / FORM NAVIGATION в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function showScreen(name){
  document.getElementById("home-screen").style.display = name === "home" ? "block" : "none";
  document.getElementById("records-screen").style.display = name === "records" ? "block" : "none";
  document.getElementById("form-screen").style.display = name === "form" ? "block" : "none";
}

function finishRouteLoading(){
  document.documentElement.classList.remove("route-loading");
}

async function createAccount(){
  if(!firebaseReady || !auth){
    setHomeStatus("auth-status", "Connect Firebase first, then create an account.", "status-warn");
    return;
  }
  const email = (document.getElementById("auth-email")?.value || "").trim();
  const password = document.getElementById("auth-password")?.value || "";
  if(!email || !password){
    setHomeStatus("auth-status", "Enter both email and password first.", "status-warn");
    return;
  }
  try{
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    if(db && cred?.user?.uid){
      await db.collection("users").doc(cred.user.uid).set({
        email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true });
    }
    setHomeStatus("auth-status", `Account created for ${email}.`, "status-ok");
  }catch(err){
    setHomeStatus("auth-status", err?.message || "Account could not be created.", "status-warn");
  }
}

async function signInAccount(){
  if(!firebaseReady || !auth){
    setHomeStatus("auth-status", "Connect Firebase first, then sign in.", "status-warn");
    return;
  }
  const email = (document.getElementById("auth-email")?.value || "").trim();
  const password = document.getElementById("auth-password")?.value || "";
  if(!email || !password){
    setHomeStatus("auth-status", "Enter both email and password first.", "status-warn");
    return;
  }
  try{
    await auth.signInWithEmailAndPassword(email, password);
    setHomeStatus("auth-status", `Signed in as ${email}.`, "status-ok");
  }catch(err){
    setHomeStatus("auth-status", err?.message || "Sign-in failed.", "status-warn");
  }
}

async function signOutAccount(){
  if(!auth){
    setHomeStatus("auth-status", "No active account is connected right now.", "status-warn");
    return;
  }
  try{
    await auth.signOut();
    setHomeStatus("auth-status", "Signed out.", "status-ok");
    showScreen("home");
  }catch(err){
    setHomeStatus("auth-status", err?.message || "Sign-out failed.", "status-warn");
  }
}

function openRecordsPage(){
  window.location.href = "records.html";
}

function openForm(type, preserveRecord){
  currentForm = type;
  if(!preserveRecord){
    currentCloudRecordId = "";
    selectedRecordId = "";
  }
  showScreen("form");
  finishRouteLoading();

  // Show/hide sections
  document.getElementById("section-order-standard").style.display    = type === "standard"   ? "" : "none";
  document.getElementById("section-order-standard").style.display    = (type === "standard" || type === "nutrition") ? "" : "none";
  document.getElementById("section-order-wheelchair").style.display  = type === "wheelchair"  ? "" : "none";
  document.getElementById("section-order-bed").style.display         = type === "bed"         ? "" : "none";
  document.getElementById("section-order-hoyer").style.display       = type === "hoyer"       ? "" : "none";
  document.getElementById("section-nutrition").style.display         = type === "nutrition"   ? "" : "none";
  document.getElementById("section-criteria-wheelchair").style.display = type === "wheelchair" ? "" : "none";
  document.getElementById("section-criteria-bed").style.display      = type === "bed"         ? "" : "none";
  document.getElementById("section-criteria-hoyer").style.display    = type === "hoyer"       ? "" : "none";
  document.getElementById("section-compression").style.display       = type === "compression" ? "" : "none";
  document.getElementById("section-oxygen").style.display            = type === "oxygen"       ? "" : "none";
  // Tag the sheet so print CSS knows which form is active
  document.querySelector(".sheet").setAttribute("data-form", type);

  // Oxygen has its own patient/physician sections вЂ” hide shared ones
  const isOxygen = type === "oxygen";
  document.getElementById("sec-notes").style.display      = isOxygen ? "none" : "";
  document.getElementById("sec-physician").style.display  = isOxygen ? "none" : "";
  const mainSig = document.querySelector(".sheet > .sig-block"); if(mainSig) mainSig.style.display = isOxygen ? "none" : "";
  const mainFootnote = document.querySelector(".sheet > .footnote"); if(mainFootnote) mainFootnote.style.display = isOxygen ? "none" : "";
  // Hide shared patient section for oxygen (it has its own)
  document.querySelectorAll(".sec").forEach(el => {
    if(el.id !== "sec-notes" && el.id !== "sec-physician" && !el.closest("#section-oxygen") && !el.closest("#section-compression") && !el.closest("#section-criteria-wheelchair") && !el.closest("#section-criteria-bed") && !el.closest("#section-criteria-hoyer")) {
      // Only hide the FIRST patient section (id-less .sec at top)
    }
  });
  // Show/hide the shared patient info block
  const sharedPatient = document.querySelector(".sheet > .sec:not([id])");
  if(sharedPatient) sharedPatient.style.display = isOxygen ? "none" : "";

  // Update section numbers
  const notesNum     = (type === "standard" || type === "compression" || type === "oxygen") ? "III." : "IV.";
  const physicianNum = (type === "standard" || type === "compression" || type === "oxygen") ? "IV."  : "V.";
  document.getElementById("notes-section-num").textContent     = notesNum + " Medical Justification";
  document.getElementById("physician-section-num").textContent = physicianNum + " Ordering Physician";
  document.getElementById("shared-order-stamp").textContent = type === "nutrition" ? "II. Nutrition Order" : "II. Equipment & Supply Order";
  document.getElementById("shared-refills-row").style.display = type === "nutrition" ? "none" : "";

  // Update form title
  const titles = {standard:"Durable Medical Equipment", wheelchair:"Manual Wheelchair DWO", bed:"Hospital Bed DWO", hoyer:"Hoyer Lift DWO", compression:"Compression Stocking Order", oxygen:"Oxygen Prescription", nutrition:"Nutrition DWO"};
  const ids    = {standard:"FORM BL-DWO", wheelchair:"FORM BL-WC", bed:"FORM BL-BED", hoyer:"FORM BL-HL", compression:"FORM BL-CS", oxygen:"FORM BL-O2", nutrition:"FORM BL-NUT"};
  document.getElementById("form-title-display").textContent = titles[type] || "Durable Medical Equipment";
  document.getElementById("form-id-display").textContent    = ids[type]    || "FORM BL-DWO";
  if(!preserveRecord) applyFormCarryForward(type);
  syncDocumentTitle();

  // Inject criteria text using specific selectors
  if(type === "wheelchair"){
    document.querySelectorAll(".wc-criteria-text").forEach((el,i) => {
      el.textContent = WC_CRITERIA[i] || "";
    });
    setWheelchairVariant("standard");
    if(!preserveRecord){
      // Check all YES boxes and Lifetime by default
      setTimeout(() => {
        document.querySelectorAll(".wc-yes").forEach(cb => cb.checked = true);
        const lt = document.getElementById("lon-lifetime");
        if(lt){ lt.checked = true; toggleLon(); }
      }, 50);
    }
  }
  if(type === "bed"){
    document.querySelectorAll(".bed-criteria-text").forEach((el,i) => {
      el.textContent = BED_CRITERIA[i] || "";
    });
    setBedVariant("E0260");
    if(!preserveRecord){
      // Check all YES boxes and Lifetime by default
      setTimeout(() => {
        document.querySelectorAll(".bed-yes").forEach(cb => cb.checked = true);
        const lt = document.getElementById("bed-lon-lifetime");
        if(lt){ lt.checked = true; toggleBedLon(); }
      }, 50);
    }
  }
  if(type === "hoyer"){
    document.querySelectorAll(".hoyer-criteria-text").forEach((el,i) => {
      el.textContent = HOYER_CRITERIA[i] || "";
    });
    syncHoyerRows();
    if(!preserveRecord){
      setTimeout(() => {
        document.querySelectorAll(".hoyer-yes").forEach(cb => cb.checked = true);
        const lt = document.getElementById("hoyer-lon-lifetime");
        if(lt){ lt.checked = true; toggleHoyerLon(); }
      }, 50);
    }
  }

  // Build standard rows
  if(type === "standard") buildStandardRows();

  // Move all drops to body
  setTimeout(() => {
    document.querySelectorAll(".drop").forEach(drop => {
      const ac = drop.closest(".ac");
      const input = ac ? ac.querySelector("input:not([type=hidden])") : null;
      if(!document.body.contains(drop) || drop.parentElement !== document.body){
        drop._linkedInput = input;
        document.body.appendChild(drop);
      }
    });
    syncDocumentTitle();
    syncWorkflowPanel();
  }, 50);
}

function goHome(){
  window.location.href = "index.html";
}

// в”Ђв”Ђ BUILD TABLE ROWS в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function buildStandardRows(){
  const tbody = document.getElementById("rows");
  if(tbody.children.length) return; // already built
  for(let i=1;i<=8;i++){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i}</td>
      <td class="col-hcpcs"><div class="ac" style="position:relative">
        <input id="hcpcs_${i}" type="text" placeholder="" autocomplete="off"
               oninput="hcpcsSearch(this,${i}); toUpper(this); onHcpcsChange(this,${i})"
               onblur="autoFillQty(${i})"/>
        <div class="drop" id="hd${i}"></div>
      </div></td>
      <td><input id="desc_${i}" type="text" placeholder="" oninput="trimTextToFit(this,12.5)"/></td>
      <td class="col-qty"><input id="qty_${i}" type="text" placeholder="" oninput="fitText(this,12.5,8)"/></td>`;
    tbody.appendChild(tr);
  }
}

function buildWheelchairRows(variant){
  const tbody = document.getElementById("wc-rows");
  const customValues = {};
  tbody.querySelectorAll("tr[data-wc-custom-row]").forEach(tr => {
    const row = tr.dataset.wcCustomRow;
    customValues[row] = {
      code: tr.querySelector("[data-role='code']")?.value || "",
      desc: tr.querySelector("[data-role='desc']")?.value || "",
      qty: tr.querySelector("[data-role='qty']")?.value || ""
    };
  });
  tbody.innerHTML = "";
  const ins = getInsuranceType();
  WC_CODES[variant].forEach((item, i) => {
    // Qty logic per PDF:
    // K0001, K0195 = 10 RR (Medicaid rental)
    // E0974, E0978, E2601/E2602, E2611/E2612 = 1 NU or 2 NU
    let qty = "";
    const wcCode = item.code;
    if(!wcCode){
      qty = "";
    } else if(wcCode === WC_CODES[variant][0].code || wcCode === "K0195"){
      // Main chair + leg rests = rental
      qty = ins === "medicare_commercial" ? "13 RR" : "10 RR";
    } else if(wcCode === "E0974"){
      qty = "2 NU";
    } else {
      qty = "1 NU";
    }
    const customValue = customValues[i] || {};
    const isCustomRow = !item.code && !item.desc;
    const tr = document.createElement("tr");
    if(isCustomRow) tr.dataset.wcCustomRow = String(i);
    tr.style.background = i%2===0 ? "rgba(255,255,255,.3)" : "transparent";
    tr.innerHTML = `
      <td style="text-align:center;font-size:10.5px;color:var(--rule-dk);font-weight:600">${i+1}</td>
      <td style="padding:5px 6px">
        ${i === 0
          ? `<div class="ac" style="position:relative">
               <input class="wc-code-input" data-row="${i}" type="text" value="${item.code}"
                      style="width:100%;border:none;background:transparent;font-family:'Courier Prime',monospace;font-size:12.5px;color:var(--ink);outline:none;padding:3px 4px"
                      autocomplete="off" oninput="wcCodeSearch(this,${i})" onblur="validateWcCode(this,${i})"/>
               <div class="drop" id="wcd${i}"></div>
             </div>`
          : isCustomRow
            ? `<div class="ac" style="position:relative">
                 <input id="wc-hcpcs-${i}" data-role="code" data-wc-custom-input type="text" value="${esc(customValue.code || "")}"
                        style="width:100%;border:none;background:transparent;font-family:'Courier Prime',monospace;font-size:12.5px;color:var(--ink);outline:none;padding:3px 4px"
                        autocomplete="off" oninput="wheelchairBlankSearch(this,${i}); toUpper(this)" onblur="autoFillWheelchairCustomQty(${i})"/>
                 <div class="drop" id="wc-drop-${i}"></div>
               </div>`
          : `<span style="font-family:'Courier Prime',monospace;font-size:12.5px;padding:3px 6px;display:block">${item.code}</span>`
        }
      </td>
      <td><input ${isCustomRow ? `id="wc-desc-${i}" data-role="desc"` : ""} type="text" value="${esc(isCustomRow ? customValue.desc || "" : item.desc)}" style="width:100%;border:none;background:transparent;font-family:'Courier Prime',monospace;font-size:12.5px;color:var(--ink);outline:none;padding:3px 4px" oninput="fitText(this,12.5,7)"/></td>
      <td style="text-align:center"><input ${isCustomRow ? `id="wc-qty-${i}" data-role="qty"` : ""} type="text" value="${esc(isCustomRow ? customValue.qty || "" : qty)}" style="width:100%;border:none;background:transparent;font-family:'Courier Prime',monospace;font-size:12px;color:var(--ink);outline:none;padding:3px;text-align:center"/></td>`;
    tbody.appendChild(tr);
  });
}

function buildBedRows(bedCode){
  const tbody = document.getElementById("bed-rows");
  tbody.innerHTML = "";
  const ins = getInsuranceType();
  const codes = BED_CODES[bedCode] || [];
  codes.forEach((item, i) => {
    // Default bed rule here is E0260: Medicaid purchase, Medicare/Commercial rental.
    // E0255, E0261, E0265, and E0303 use their own quantity rules below.
    let qty = "";
    if(item.code === ""){
      qty = ""; // blank row вЂ” no qty until code is entered
    } else if(item.code === "E0272"){
      qty = "1 NU"; // mattress always purchase
    } else if(bedCode === "E0261"){
      qty = "13 RR"; // E0261 is Medicare-only, always rental
    } else if(bedCode === "E0265"){
      qty = "1 NU"; // E0265 full-electric bed defaults to purchase for all insurances
    } else if(bedCode === "E0303"){
      qty = ins === "medicaid" ? "10 RR" : "13 RR"; // bariatric bed always rental
    } else if(bedCode === "E0255"){
      qty = "10 RR"; // E0255 always 10 RR
    } else {
      // E0260: Medicaid = 1 NU, Medicare/Commercial = 13 RR
      qty = ins === "medicare_commercial" ? "13 RR" : "1 NU";
    }
    const tr = document.createElement("tr");
    tr.style.background = i%2===0 ? "rgba(255,255,255,.3)" : "transparent";
    tr.innerHTML = `
      <td style="text-align:center;font-size:10.5px;color:var(--rule-dk);font-weight:600">${i+1}</td>
      <td style="padding:3px 6px">
        ${item.code === ""
          ? `<div class="ac" style="position:relative">
               <input type="text" value="" placeholder=""
                 id="bed-hcpcs-${i}-${bedCode}"
                 autocomplete="off"
                 style="width:100%;border:none;background:transparent;font-family:'Courier Prime',monospace;font-size:12.5px;color:var(--ink);outline:none;padding:3px 4px"
                 oninput="bedBlankSearch(this, ${i}, '${bedCode}'); toUpper(this)"/>
               <div class="drop" id="bed-drop-${i}-${bedCode}"></div>
             </div>`
          : `<span style="font-family:'Courier Prime',monospace;font-size:12.5px;padding:3px 6px;display:block">${item.code}</span>`
        }
      </td>
      <td><input type="text" id="bed-desc-${i}-${bedCode}" value="${item.desc}" style="width:100%;border:none;background:transparent;font-family:'Courier Prime',monospace;font-size:11.5px;color:var(--ink);outline:none;padding:3px 4px" oninput="fitText(this,11.5,7)"/></td>
      <td style="text-align:center"><input type="text" id="bed-qty-${i}-${bedCode}" value="${qty}" style="width:100%;border:none;background:transparent;font-family:'Courier Prime',monospace;font-size:12px;color:var(--ink);outline:none;padding:3px;text-align:center"/></td>`;
    tbody.appendChild(tr);
  });
}

function toggleHoyerLon(){
  const chk = document.getElementById("hoyer-lon-lifetime");
  const months = document.getElementById("hoyer-lon-months");
  if(!chk || !months) return;
  months.disabled = chk.checked;
  if(chk.checked) months.value = "";
}

function getSelectedHoyerCodes(){
  return HOYER_CODES.filter(item => document.getElementById(`hoyer-code-${item.code.toLowerCase()}`)?.checked);
}

function getHoyerDefaultQty(code){
  const ins = getInsuranceType();
  if(code === "E0635") return "1 NU";
  if(code === "E0630"){
    if(!ins) return "";
    return ins === "medicaid" ? "10 RR" : "13 RR";
  }
  if(!ins) return "";
  const itemType = getItemType(code, ins);
  return itemType === "purchase" ? "1 NU" : (ins === "medicaid" ? "10 RR" : "13 RR");
}

function syncHoyerRows(options = {}){
  const tbody = document.getElementById("hoyer-rows");
  if(!tbody) return;
  const preserveExisting = !!options.preserveExisting;
  const forceDefaultQty = !!options.forceDefaultQty;
  const existing = {};
  const currentOrder = [];
  tbody.querySelectorAll("tr").forEach(tr => {
    const code = (tr.querySelector("[data-role='code']")?.value || "").trim().toUpperCase();
    if(!code) return;
    currentOrder.push(code);
    existing[code] = {
      desc: tr.querySelector("[data-role='desc']")?.value || "",
      qty: tr.querySelector("[data-role='qty']")?.value || ""
    };
  });

  const checkedCodes = getSelectedHoyerCodes().map(item => item.code);
  const orderedCodes = [
    ...currentOrder.filter(code => checkedCodes.includes(code)),
    ...checkedCodes.filter(code => !currentOrder.includes(code))
  ];

  tbody.innerHTML = "";
  for(let i=0;i<5;i++){
    const code = orderedCodes[i] || "";
    const item = HOYER_CODES.find(entry => entry.code === code) || null;
    const prior = code ? (existing[code] || {}) : {};
    const defaultQty = code ? getHoyerDefaultQty(code) : "";
    const qtyValue = code
      ? (forceDefaultQty ? defaultQty : (preserveExisting && prior.qty !== undefined ? prior.qty : defaultQty))
      : "";
    const descValue = code
      ? (preserveExisting && prior.desc !== undefined && prior.desc !== "" ? prior.desc : item.desc)
      : "";
    const tr = document.createElement("tr");
    tr.style.background = i%2===0 ? "rgba(255,255,255,.3)" : "transparent";
    tr.innerHTML = `
      <td style="text-align:center;font-size:10.5px;color:var(--rule-dk);font-weight:600">${i+1}</td>
      <td style="padding:3px 6px"><input type="text" id="hoyer-hcpcs-${i}" data-role="code" value="${esc(code)}" readonly style="width:100%;border:none;background:transparent;font-family:'Courier Prime',monospace;font-size:12.5px;color:var(--ink);outline:none;padding:3px 4px"/></td>
      <td><input type="text" id="hoyer-desc-${i}" data-role="desc" value="${esc(descValue)}" style="width:100%;border:none;background:transparent;font-family:'Courier Prime',monospace;font-size:11.5px;color:var(--ink);outline:none;padding:3px 4px" oninput="fitText(this,11.5,7)"/></td>
      <td style="text-align:center"><input type="text" id="hoyer-qty-${i}" data-role="qty" value="${esc(qtyValue)}" style="width:100%;border:none;background:transparent;font-family:'Courier Prime',monospace;font-size:12px;color:var(--ink);outline:none;padding:3px;text-align:center" oninput="fitText(this,12,7)"/></td>`;
    tbody.appendChild(tr);
    fitText(tr.querySelector("[data-role='code']"), 12.5, 7);
    fitText(tr.querySelector("[data-role='desc']"), 11.5, 7);
    fitText(tr.querySelector("[data-role='qty']"), 12, 7);
  }
}

// в”Ђв”Ђ VARIANT SELECTORS в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function setWheelchairVariant(v){
  wcVariant = v;
  document.getElementById("wc-standard-btn").classList.toggle("active",    v==="standard");
  document.getElementById("wc-lightweight-btn").classList.toggle("active", v==="lightweight");
  document.getElementById("wc-bariatric-btn").classList.toggle("active",   v==="bariatric");
  buildWheelchairRows(v);
}

function setBedVariant(code){
  bedVariant = code;
  ["E0260","E0255","E0261","E0265","E0303"].forEach(c => {
    document.getElementById(`bed-${c.toLowerCase()}-btn`).classList.toggle("active", c===code);
  });
  buildBedRows(code);
}

// HCPCS search for blank bed rows
async function bedBlankSearch(el, rowIdx, bedCode){
  const q = el.value.trim();
  const dropId = `bed-drop-${rowIdx}-${bedCode}`;
  const drop = document.getElementById(dropId);
  if(!drop) return;
  if(q.length < 2){ closeDrop(drop); return; }
  clearTimeout(T[`bed-blank-${rowIdx}`]);
  T[`bed-blank-${rowIdx}`] = setTimeout(async() => {
    showLoad(drop, "Searching HCPCS...", el);
    try{
      const url = `https://clinicaltables.nlm.nih.gov/api/hcpcs/v3/search?sf=code,short_desc,long_desc&terms=${encodeURIComponent(q)}&maxList=8&ef=long_desc`;
      const r = await fetch(url);
      const d = await r.json();
      const codes = d[1]||[];
      const extra = d[2]||{};
      const longs = extra["long_desc"]||[];
      const disp  = d[3]||[];
      const items = codes.map((c,i) => ({
        code: c,
        desc: (longs[i]||"").trim() || (disp[i]||[])[1]||""
      }));
      renderCodes(drop, items, (code, desc) => {
        el.value = code.toUpperCase();
        // Fill desc and auto-qty
        const descEl = document.getElementById(`bed-desc-${rowIdx}-${bedCode}`);
        const qtyEl  = document.getElementById(`bed-qty-${rowIdx}-${bedCode}`);
        if(descEl){ descEl.value = desc; trimTextToFit(descEl, 11.5); }
        if(qtyEl){
          const ins = getInsuranceType();
          const itemType = getItemType(code, ins);
          if(itemType === "purchase") qtyEl.value = "1 NU";
          else qtyEl.value = ins === "medicare_commercial" ? "13 RR" : "10 RR";
          fitText(qtyEl, 12, 7);
        }
        closeDrop(drop);
        // Re-attach drop to body so it positions correctly
        setTimeout(() => {
          if(drop.parentElement !== document.body){
            drop._linkedInput = el;
            document.body.appendChild(drop);
          }
        }, 10);
      }, el);
    } catch(e){
      drop.innerHTML = `<div class="empty-row">Search unavailable</div>`;
      drop.classList.add("open");
    }
  }, 300);
}

async function wheelchairBlankSearch(el, rowIdx){
  const q = el.value.trim();
  const drop = document.getElementById(`wc-drop-${rowIdx}`);
  if(!drop) return;
  drop._linkedInput = el;
  if(q.length < 2){ closeDrop(drop); return; }
  clearTimeout(T[`wc-blank-${rowIdx}`]);
  T[`wc-blank-${rowIdx}`] = setTimeout(async() => {
    showLoad(drop, "Searching HCPCS...", el);
    try{
      const r = await fetch(`https://clinicaltables.nlm.nih.gov/api/hcpcs/v3/search?sf=code,short_desc,long_desc&terms=${encodeURIComponent(q)}&maxList=8&ef=long_desc`);
      const d = await r.json();
      const codes = d[1] || [];
      const extra = d[2] || {};
      const longs = extra["long_desc"] || [];
      const disp = d[3] || [];
      const items = codes.map((c, i) => ({
        code: c,
        desc: (longs[i] || "").trim() || (disp[i] || [])[1] || ""
      }));
      renderCodes(drop, items, (code, desc) => {
        el.value = String(code || "").toUpperCase();
        const descEl = document.getElementById(`wc-desc-${rowIdx}`);
        if(descEl){
          descEl.value = desc || "";
          trimTextToFit(descEl, 12.5);
        }
        autoFillWheelchairCustomQty(rowIdx);
        closeDrop(drop);
      }, el);
    }catch{
      drop.innerHTML = `<div class="empty-row">Search unavailable</div>`;
      drop.classList.add("open");
    }
  }, 300);
}

function autoFillWheelchairCustomQty(rowIdx){
  const codeEl = document.getElementById(`wc-hcpcs-${rowIdx}`);
  const qtyEl = document.getElementById(`wc-qty-${rowIdx}`);
  if(!codeEl || !qtyEl) return;
  const code = normalizeHcpcsCode(codeEl.value || "");
  if(!code){
    qtyEl.value = "";
    return;
  }
  if(String(qtyEl.value || "").trim()) return;
  const ins = getInsuranceType();
  if(code === "E0974") qtyEl.value = "2 NU";
  else {
    const itemType = getItemType(code, ins);
    qtyEl.value = itemType === "rental" ? (ins === "medicare_commercial" ? "13 RR" : "10 RR") : "1 NU";
  }
  fitText(qtyEl, 12, 7);
}

// в”Ђв”Ђ WC CODE SEARCH (K0001вЂ“K0009 range) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function wcCodeSearch(el, row){
  const q = el.value.trim();
  const drop = document.getElementById(`wcd${row}`);
  if(q.length < 2){ closeDrop(drop); return; }
  clearTimeout(T[`wc${row}`]);
  T[`wc${row}`] = setTimeout(async() => {
    showLoad(drop, "Searching HCPCS...", el);
    try{
      const r = await fetch(`https://clinicaltables.nlm.nih.gov/api/hcpcs/v3/search?sf=code,short_desc,long_desc&terms=${encodeURIComponent(q)}&maxList=8&ef=long_desc`);
      const d = await r.json();
      const codes = d[1]||[];
      const extra = d[2]||{};
      const longs = extra["long_desc"]||[];
      const disp  = d[3]||[];
      // Filter to K0001вЂ“K0009 range only
      const items = codes
        .map((c,i) => ({code:c, desc:(longs[i]||"").trim()||(disp[i]||[])[1]||""}))
        .filter(x => /^K000[1-9]$/.test(x.code));
      renderCodes(drop, items, (code, desc) => {
        el.value = code;
        // Update desc field in same row
        const descInput = document.querySelectorAll("#wc-rows tr")[row]?.querySelectorAll("input")[1];
        if(descInput){ descInput.value = desc; trimTextToFit(descInput,12.5); }
        closeDrop(drop);
      }, el);
    }catch{ closeDrop(drop); }
  }, 300);
}

function validateWcCode(el, row){
  const val = el.value.toUpperCase().trim();
  if(val && !/^K000[1-9]$/.test(val)){
    el.value = "K0001"; // reset to default if invalid
  }
}

// в”Ђв”Ђ LON TOGGLES в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function toggleLon(){
  const chk = document.getElementById("lon-lifetime");
  document.getElementById("lon-months").disabled = chk.checked;
  if(chk.checked) document.getElementById("lon-months").value = "";
}
function toggleBedLon(){
  const chk = document.getElementById("bed-lon-lifetime");
  document.getElementById("bed-lon-months").disabled = chk.checked;
  if(chk.checked) document.getElementById("bed-lon-months").value = "";
}

// в”Ђв”Ђ OVERRIDE updateAllQty for wheelchair/bed forms в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const _origUpdateAllQty = function(){
  for(let i=1;i<=10;i++) autoFillQty(i);
};
function updateAllQty(){
  _origUpdateAllQty();
  if(currentForm === "wheelchair") buildWheelchairRows(wcVariant);
  if(currentForm === "bed")        buildBedRows(bedVariant);
  if(currentForm === "hoyer")      syncHoyerRows({ preserveExisting: true, forceDefaultQty: true });
}

// в”Ђв”Ђ CLEAR FORM OVERRIDE в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ


// в”Ђв”Ђ TABLE ROWS в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const tbody=document.getElementById("rows");
for(let i=1;i<=10;i++){
  const tr=document.createElement("tr");
  tr.innerHTML=`<td>${i}</td>
    <td class="col-hcpcs"><div class="ac" style="position:relative">
      <input id="hcpcs_${i}" type="text" placeholder="" autocomplete="off" oninput="hcpcsSearch(this,${i}); toUpper(this); onHcpcsChange(this,${i})" onblur="autoFillQty(${i})"/>
      <div class="drop" id="hd${i}"></div></div></td>
    <td><input id="desc_${i}" type="text" placeholder="" oninput="trimTextToFit(this,12.5)"/></td>
    <td class="col-qty"><input id="qty_${i}" type="text" placeholder="" oninput="fitText(this,12.5,8)"/></td>`;
  tbody.appendChild(tr);
}

const T={};

// в”Ђв”Ђ PHONE FORMAT: 4079873262 в†’ (407) 987-3262 в”Ђв”Ђ
function dateMask(el){
  // Force US format (MM/DD/YYYY) regardless of browser or computer locale.
  let raw = String(el.value || "").trim();
  if(!raw){ el.value = ""; return; }

  let m = raw.match(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})$/);
  if(m){
    // YYYY-MM-DD -> MMDDYYYY
    raw = `${m[2].padStart(2,"0")}${m[3].padStart(2,"0")}${m[1]}`;
  } else {
    m = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
    if(m){
      // If a non-US locale produced DD/MM/YYYY and it is unambiguous, swap it.
      const a = parseInt(m[1],10);
      const b = parseInt(m[2],10);
      if(a > 12 && b <= 12){
        raw = `${String(b).padStart(2,"0")}${String(a).padStart(2,"0")}${m[3]}`;
      } else {
        raw = `${String(a).padStart(2,"0")}${String(b).padStart(2,"0")}${m[3]}`;
      }
    } else {
      raw = raw.replace(/\D/g,"");
      if(raw.length === 8 && /^(19|20)\d{6}$/.test(raw)){
        raw = raw.slice(4,6) + raw.slice(6,8) + raw.slice(0,4);
      }
    }
  }

  const v = raw.replace(/\D/g,"").slice(0,8);
  let mm = v.slice(0,2);
  let dd = v.slice(2,4);
  let yyyy = v.slice(4,8);

  if(mm.length === 2){
    mm = String(Math.min(Math.max(parseInt(mm,10) || 1, 1), 12)).padStart(2,"0");
  }
  if(dd.length === 2){
    dd = String(Math.min(Math.max(parseInt(dd,10) || 1, 1), 31)).padStart(2,"0");
  }

  let out = mm;
  if(dd.length) out += "/" + dd;
  if(yyyy.length) out += "/" + yyyy;
  el.value = out;
}

function normalizeUSDate(el){
  dateMask(el);
  const m = String(el.value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(!m) return;
  const mm = parseInt(m[1],10);
  let dd = parseInt(m[2],10);
  const yyyy = parseInt(m[3],10);
  const lastDay = new Date(yyyy, mm, 0).getDate();
  if(dd > lastDay) dd = lastDay;
  el.value = `${String(mm).padStart(2,"0")}/${String(dd).padStart(2,"0")}/${String(yyyy).padStart(4,"0")}`;
}

function initUSDateFields(){
  document.querySelectorAll(".us-date").forEach(el => {
    el.setAttribute("type", "text");
    el.setAttribute("inputmode", "numeric");
    el.setAttribute("autocomplete", "off");
    el.setAttribute("placeholder", "MM/DD/YYYY");
    if(el.value) normalizeUSDate(el);
  });
}

function fmtPhone(el){
  // strip everything except digits
  let d=el.value.replace(/\D/g,"").substring(0,10);
  if(d.length===0){el.value="";return;}
  if(d.length<=3)      el.value=`(${d}`;
  else if(d.length<=6) el.value=`(${d.slice(0,3)}) ${d.slice(3)}`;
  else                 el.value=`(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
}

let placesService = null;
let placesDetailsService = null;
let googleMapsPlacesLoadPromise = null;
const nativeAddressAutocompletes = new Map();
const ADDRESS_DROP_IDS = {
  "pat_addr": "pat_addr_drop",
  "phys_addr": "phys_addr_drop",
  "oxy-address": "oxy-addr-drop",
  "oxy-phys-addr": "oxy-phys-addr-drop"
};

function loadGoogleMapsPlaces(){
  if(window.google?.maps?.places) return Promise.resolve(true);
  if(googleMapsPlacesLoadPromise) return googleMapsPlacesLoadPromise;

  googleMapsPlacesLoadPromise = new Promise(resolve => {
    const existingScript = document.querySelector("script[data-google-maps-places]");
    if(existingScript){
      existingScript.addEventListener("load", () => resolve(true), { once: true });
      existingScript.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsPlaces = "true";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return googleMapsPlacesLoadPromise;
}

function getPlacesServices(){
  if(placesService && placesDetailsService) return { placesService, placesDetailsService };
  if(!window.google?.maps?.places) return null;
  placesService = new google.maps.places.AutocompleteService();
  placesDetailsService = new google.maps.places.PlacesService(document.createElement("div"));
  return { placesService, placesDetailsService };
}

function getAddressDropId(inputId){
  return ADDRESS_DROP_IDS[inputId] || "";
}

function getAddressLookupMessage(error){
  const code = String(error?.message || "");
  const normalizedCode = code.toUpperCase();
  if(code === "PLACES_UNAVAILABLE") return "Address lookup is not available right now.";
  if(code === "PLACES_TIMEOUT") return "Address lookup took too long. Please try again.";
  if(code === "REQUEST_DENIED") return "Address lookup is temporarily unavailable. Please enter the address manually or try again later.";
  if(normalizedCode.includes("BILLINGNOTENABLEDMAPERROR")) return "Address lookup is temporarily unavailable because Google Maps billing needs attention. Please enter the address manually for now.";
  if(normalizedCode.includes("REFERERNOTALLOWEDMAPERROR")) return "Address lookup is temporarily unavailable because this site is not authorized for the current Google Maps setup.";
  if(normalizedCode.includes("APINOTACTIVATEDMAPERROR")) return "Address lookup is temporarily unavailable because the required Google Maps APIs are not enabled.";
  if(code === "OVER_QUERY_LIMIT") return "Address lookup limit reached. Please try again shortly.";
  return "No addresses found.";
}

function openAddressDrop(drop, inputEl){
  if(inputEl) positionDrop(drop, inputEl);
  drop.classList.add("open");
}

function showAddressMessage(drop, inputEl, message){
  drop.innerHTML = `<div class="empty-row">${escapeHtml(message)}</div>`;
  openAddressDrop(drop, inputEl);
}

async function requestPlacePredictions(query){
  const loaded = await loadGoogleMapsPlaces();
  if(!loaded) return Promise.reject(new Error("PLACES_UNAVAILABLE"));
  const services = getPlacesServices();
  if(!services?.placesService) return Promise.reject(new Error("PLACES_UNAVAILABLE"));

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if(settled) return;
      settled = true;
      reject(new Error("PLACES_TIMEOUT"));
    }, 4000);

    try{
      services.placesService.getPlacePredictions(
        {
          input: query,
          componentRestrictions: { country: "us" },
          types: ["address"]
        },
        (predictions, status) => {
          if(settled) return;
          settled = true;
          clearTimeout(timer);
          if(status === google.maps.places.PlacesServiceStatus.OK && predictions){
            resolve(predictions);
            return;
          }
          if(status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS){
            resolve([]);
            return;
          }
          reject(new Error(status || "PLACES_ERROR"));
        }
      );
    }catch(error){
      if(settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    }
  });
}

// в”Ђв”Ђ ADDRESS AUTOCOMPLETE (Google Places API) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
async function addrSearch(inputId, dropId) {
  const el = document.getElementById(inputId);
  const drop = document.getElementById(dropId);
  if (!el || !drop) return;
  const q = el.value.trim();

  if (q.length < 3) {
    closeDrop(drop);
    return;
  }

  clearTimeout(T[dropId]);
  T[dropId] = setTimeout(async () => {
    const lookupToken = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    drop.dataset.lookupToken = lookupToken;
    showLoad(drop, "Looking up address...", el);
    try {
      const predictions = await requestPlacePredictions(q);
      if (drop.dataset.lookupToken !== lookupToken) return;

      const data = predictions.slice(0, 8).map(prediction => ({
        place_id: prediction.place_id,
        display_name: prediction.description,
        address: null
      }));

      const typedStreet = q.toUpperCase();

      data.sort((a, b) => {
        if (a.display_name.toUpperCase() === typedStreet) return -1;
        if (b.display_name.toUpperCase() === typedStreet) return 1;
        return 0;
      });

      dropEl(drop, data, inputId);
      openAddressDrop(drop, el);
    } catch (error) {
      if (drop.dataset.lookupToken !== lookupToken) return;
      console.error("Address search error:", error);
      showAddressMessage(drop, el, getAddressLookupMessage(error));
    }
  }, 300);
}

// Parse Google Places address components into a structured format
function parseAddressComponents(components) {
  const address = {
    street_number: '',
    street: '',
    city: '',
    state: '',
    postcode: '',
    country: ''
  };

  components.forEach(component => {
    const types = component.types;
    if (types.includes('street_number')) address.street_number = component.long_name;
    if (types.includes('route')) address.street = component.long_name;
    if (types.includes('locality')) address.city = component.long_name;
    if (types.includes('administrative_area_level_1')) address.state = component.short_name;
    if (types.includes('postal_code')) address.postcode = component.long_name;
    if (types.includes('country')) address.country = component.short_name;
  });

  return address;
}

function initGoogleAddressAutocompletes(){
  // Keep address search in our own dropdown so Google config issues surface
  // as friendly inline messages instead of a blocking vendor popup.
  nativeAddressAutocompletes.clear();
  Object.keys(ADDRESS_DROP_IDS).forEach(inputId => {
    const input = document.getElementById(inputId);
    if(!input) return;
    input.addEventListener("focus", loadGoogleMapsPlaces, { once: true });
    input.addEventListener("pointerdown", loadGoogleMapsPlaces, { once: true });
  });
}

// Build dropdown items from Places results
function dropEl(drop, data, inputId) {
  if (data.length === 0) {
    drop.innerHTML = `<div class="empty-row">No addresses found</div>`;
    drop.dataset.addressData = "[]";
    drop.dataset.inputId = inputId;
    return;
  }

  drop.innerHTML = data
    .map(
      (item, idx) => `
      <div class="di" data-index="${idx}" onclick="selectAddressFromDrop(event)">
        <div class="dc">${escapeHtml(item.display_name)}</div>
        <div class="ds">Google Maps</div>
      </div>
    `
    )
    .join('');

  // Store address data on dropdown container
  drop.dataset.addressData = JSON.stringify(data);
  drop.dataset.inputId = inputId;
}

async function fetchPlaceDetails(placeId) {
  const loaded = await loadGoogleMapsPlaces();
  if(!loaded) return null;
  const services = getPlacesServices();
  if (!services) return Promise.resolve(null);
  const { placesDetailsService } = services;
  return new Promise(resolve => {
    let settled = false;
    const timer = setTimeout(() => {
      if(settled) return;
      settled = true;
      resolve(null);
    }, 4000);

    placesDetailsService.getDetails(
      { placeId, fields: ["formatted_address", "address_components"] },
      (details, status) => {
        if(settled) return;
        settled = true;
        clearTimeout(timer);
        if (status === google.maps.places.PlacesServiceStatus.OK && details) {
          resolve({
            display_name: details.formatted_address || "",
            address: parseAddressComponents(details.address_components || [])
          });
        } else {
          resolve(null);
        }
      }
    );
  });
}

// Select an address from the dropdown
async function selectAddressFromDrop(event) {
  const dropItem = event.currentTarget;
  const drop = dropItem.parentElement;
  const inputId = drop.dataset.inputId;
  const addressData = JSON.parse(drop.dataset.addressData);
  const itemIndex = parseInt(dropItem.dataset.index);
  
  const selectedAddress = addressData[itemIndex];
  const el = document.getElementById(inputId);

  if (!el || !selectedAddress) return;

  el.value = selectedAddress.display_name;
  let resolved = null;
  try{
    resolved = selectedAddress.place_id ? await fetchPlaceDetails(selectedAddress.place_id) : null;
  }catch{
    resolved = null;
  }
  if (resolved?.display_name) {
    el.value = resolved.display_name;
  }
  el.dataset.addressObj = JSON.stringify(resolved?.address || selectedAddress.address || {});

  closeDrop(drop);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function closeDrop(drop) {
  drop.classList.remove('open');
  drop.innerHTML = '';
}

function openDrop(drop) {
  drop.classList.add('open');
}

function showLoad(drop, msg, el) {
  drop.innerHTML = `<div class="loading-row"><span class="spin"></span>${msg}</div>`;
  openDrop(drop);
}

// в”Ђв”Ђ ICD-10 в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
async function icdSearch(el,n){
  const q=el.value.trim();
  const drop=document.getElementById(`dx${n}d`);
  if(q.length<2){closeDrop(drop);return;}
  clearTimeout(T[`icd${n}`]);
  T[`icd${n}`]=setTimeout(async()=>{
    showLoad(drop,"Searching ICD-10...",el);
    try{
      const r=await fetch(`https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search?sf=code,name&terms=${encodeURIComponent(q)}&maxList=8`);
      const d=await r.json();
      const items=(d[3]||[]).map(x=>({code:x[0],desc:x[1]}));
      renderCodes(drop,items,(code,desc)=>selectIcd(n,code,desc),el);
    }catch{drop.innerHTML=`<div class="empty-row">Search unavailable</div>`;positionDrop(drop,el);drop.classList.add("open");}
  },280);
}

function selectIcd(n,code,desc){
  document.getElementById(`dx${n}v`).value=code;
  document.getElementById(`dx${n}s`).textContent=code; // code only, no description
  document.getElementById(`dx${n}w`).classList.add("sel");
  closeDrop(document.getElementById(`dx${n}d`));
}

function clearIcd(n){
  const w=document.getElementById(`dx${n}w`);
  const i=document.getElementById(`dx${n}i`);
  document.getElementById(`dx${n}v`).value="";
  document.getElementById(`dx${n}s`).textContent="";
  i.value="";i.style.display="";
  w.classList.remove("sel");
}

// в”Ђв”Ђ HCPCS вЂ” uses long_desc for full description в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
async function hcpcsSearch(el,row){
  const q=el.value.trim();
  const drop=document.getElementById(`hd${row}`);
  if(q.length<2){closeDrop(drop);return;}
  clearTimeout(T[`h${row}`]);
  T[`h${row}`]=setTimeout(async()=>{
    showLoad(drop,"Searching HCPCS...",el);
    try{
      // ef=long_desc fetches the full long description alongside the code
      const url=`https://clinicaltables.nlm.nih.gov/api/hcpcs/v3/search?sf=code,short_desc,long_desc&terms=${encodeURIComponent(q)}&maxList=8&ef=long_desc`;
      const r=await fetch(url);
      const d=await r.json();
      // d[1] = codes array, d[2] = extra fields {long_desc:[...]}, d[3] = display array
      const codes  = d[1]||[];
      const extra  = d[2]||{};
      const longDescs = extra["long_desc"]||[];
      const display   = d[3]||[];
      const items = codes.map((code,i)=>({
        code,
        // Use long_desc if available, fall back to display short desc
        desc: (longDescs[i]||"").trim() || (display[i]||[])[1]||""
      }));
      renderCodes(drop,items,(code,desc)=>{
        el.value=code.toUpperCase();
        const descEl=document.getElementById(`desc_${row}`);
        descEl.value=desc;
        trimTextToFit(descEl,12.5);
        autoFillQty(row);
        closeDrop(drop);
      },el);
    }catch(e){drop.innerHTML=`<div class="empty-row">Search unavailable</div>`;drop.classList.add("open");}
  },280);
}

// в”Ђв”Ђ NPI SEARCH via NLM npi_idv в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// Fields: NPI (cf), name.full, provider_type, addr_practice.phone,
//         addr_practice.fax, addr_practice.full, licenses[0].lic_number
async function npiSearch(el){
  const q=el.value.trim();
  const drop=document.getElementById("npi_drop");
  if(q.length<3){closeDrop(drop);return;}
  clearTimeout(T.npi);
  T.npi=setTimeout(async()=>{
    showLoad(drop,"Searching NPI registry...",el);
    try{
      // Request all needed extra fields
      const ef=[
        "name.full",
        "provider_type",
        "addr_practice.phone",
        "addr_practice.fax",
        "addr_practice.line1",
        "addr_practice.line2",
        "addr_practice.city",
        "addr_practice.state",
        "addr_practice.zip",
        "licenses"          // full licenses array вЂ” contains lic_number
      ].join(",");

      const url=`https://clinicaltables.nlm.nih.gov/api/npi_idv/v3/search?terms=${encodeURIComponent(q)}&maxList=8&ef=${encodeURIComponent(ef)}&sf=NPI,name.full`;
      const r=await fetch(url);
      const d=await r.json();

      // d[1] = NPI codes array
      // d[2] = extra fields hash  { "name.full": [...], "provider_type": [...], ... }
      // d[3] = display array (not used here)
      const npis   = d[1]||[];
      const extra  = d[2]||{};

      if(!npis.length){
        drop.innerHTML=`<div class="empty-row">No providers found</div>`;
        positionDrop(drop,el);
        drop.classList.add("open");return;
      }

      drop.innerHTML="";
      npis.forEach((npi,i)=>{
        const name    = (extra["name.full"]||[])[i]||"";
        const ptype   = (extra["provider_type"]||[])[i]||"";
        const phone   = (extra["addr_practice.phone"]||[])[i]||"";
        const fax     = (extra["addr_practice.fax"]||[])[i]||"";
        const line1   = (extra["addr_practice.line1"]||[])[i]||"";
        const line2   = (extra["addr_practice.line2"]||[])[i]||"";
        const city    = (extra["addr_practice.city"]||[])[i]||"";
        const state   = (extra["addr_practice.state"]||[])[i]||"";
        const zip     = (extra["addr_practice.zip"]||[])[i]||"";

        // licenses is an array of objects; grab first one's lic_number
        const licensesRaw = (extra["licenses"]||[])[i];
        let licNum="";
        try{
          // NLM returns complex fields as JSON strings
          const lics=typeof licensesRaw==="string"?JSON.parse(licensesRaw):licensesRaw;
          if(Array.isArray(lics)&&lics.length>0){
            // find primary or fall back to first
            const primary=lics.find(l=>l.primary_taxonomy===true||l.primary_taxonomy==="Y")||lics[0];
            licNum=primary.lic_number||primary.number||primary.id||"";
          }
        }catch(e){}

        // Build clean address
        const addrParts=[];
        const street=[line1,line2].filter(Boolean).join(" ");
        if(street) addrParts.push(street);
        if(city)   addrParts.push(city);
        const sz=[state,zip].filter(Boolean).join(" ");
        if(sz)     addrParts.push(sz);
        if(addrParts.length) addrParts.push("USA");
        const addrStr=addrParts.join(", ");

        // Format phone/fax as (xxx) xxx-xxxx if raw digits
        const fmtNum=s=>{
          const d=(s||"").replace(/\D/g,"");
          if(d.length===10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
          return s;
        };

        const div=document.createElement("div");
        div.className="di";
        div.innerHTML=`
          <span class="dn">${esc(name)}</span>
          <span class="ds">NPI: ${esc(npi)}${ptype?" &middot; "+esc(ptype):""}</span>
          <span class="ds">${esc(addrStr)}${phone?" &middot; "+esc(fmtNum(phone)):""}</span>`;

        div.addEventListener("mousedown",e=>{
          e.preventDefault();
          document.getElementById("npi_input").value  = npi;
          document.getElementById("phys_name").value  = name.toUpperCase();
          document.getElementById("phys_type").value  = ptype.toUpperCase();
          document.getElementById("phys_phone").value = fmtNum(phone);
          document.getElementById("phys_fax").value   = fmtNum(fax);
          document.getElementById("lic_num").value    = licNum.toUpperCase();
          document.getElementById("phys_addr").value  = addrStr;
          closeDrop(drop);
        });
        drop.appendChild(div);
      });
      positionDrop(drop,el);
      drop.classList.add("open");
    }catch(e){
      drop.innerHTML=`<div class="empty-row">NPI lookup unavailable</div>`;
      positionDrop(drop,el);
      drop.classList.add("open");
    }
  },400);
}

// в”Ђв”Ђ HCPCS CHANGE вЂ” clear desc+qty when code is deleted в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function onHcpcsChange(el, row){
  if(el.value.trim() === ""){
    const descEl = document.getElementById(`desc_${row}`);
    const qtyEl  = document.getElementById(`qty_${row}`);
    descEl.value = "";
    qtyEl.value  = "";
    clearQtyMeta(qtyEl);
    // Reset font sizes
    descEl.style.fontSize = "";
    qtyEl.style.fontSize  = "";
  }
}

// в”Ђв”Ђ FIT TEXT вЂ” shrinks font size as content grows в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// maxSize: default font size; minSize: smallest allowed
function fitText(el, maxSize, minSize) {
  // Reset to max so we can measure properly
  el.style.fontSize = maxSize + 'px';
  // Keep shrinking until text fits or we hit minSize
  let size = maxSize;
  while (el.scrollWidth > el.clientWidth + 2 && size > minSize) {
    size -= 0.5;
    el.style.fontSize = size + 'px';
  }
}

function trimTextToFit(el, maxSize){
  el.style.fontSize = maxSize + 'px';
  const original = String(el.value || "").replace(/\s+/g, " ").trim();
  if(!original) return;
  let next = original;
  while(el.scrollWidth > el.clientWidth + 2 && next.includes(" ")){
    next = next.replace(/\s+\S+$/, "").trim();
    el.value = next;
  }
  while(el.scrollWidth > el.clientWidth + 2 && next.length > 1){
    next = next.slice(0, -1).trim();
    el.value = next;
  }
}

// в”Ђв”Ђ AUTO UPPERCASE в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// Called on inputs that should auto-capitalize
function toUpper(el){
  const pos = el.selectionStart;
  el.value = el.value.toUpperCase();
  el.setSelectionRange(pos, pos);
}

// в”Ђв”Ђ SHARED в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function renderCodes(drop,items,onSelect,inputEl){
  if(!items.length){drop.innerHTML=`<div class="empty-row">No results found</div>`;if(inputEl)positionDrop(drop,inputEl);drop.classList.add("open");return;}
  drop.innerHTML="";
  items.forEach(item=>{
    const div=document.createElement("div");
    div.className="di";
    div.innerHTML=`<span class="dc">${esc(item.code)}</span><span class="dd">${esc(item.desc)}</span>`;
    div.addEventListener("mousedown",e=>{e.preventDefault();onSelect(item.code,item.desc);});
    drop.appendChild(div);
  });
  if(inputEl)positionDrop(drop,inputEl);
  drop.classList.add("open");
}

function positionDrop(drop, inputEl) {
  // Position dropdown using fixed coords so it always appears on top
  const rect = inputEl.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const dropH = Math.min(200, drop.scrollHeight || 200);
  drop.style.position  = 'fixed';
  drop.style.left      = rect.left + 'px';
  drop.style.width     = rect.width + 'px';
  drop.style.zIndex    = '99999';
  drop.style.right     = 'auto';
  // Show above if not enough space below
  if (spaceBelow < dropH + 8 && spaceAbove > spaceBelow) {
    drop.style.top    = 'auto';
    drop.style.bottom = (window.innerHeight - rect.top + 2) + 'px';
  } else {
    drop.style.bottom = 'auto';
    drop.style.top    = (rect.bottom + 2) + 'px';
  }
}
function showLoad(drop, msg, inputEl) {
  drop.innerHTML = `<div class="loading-row"><span class="spin"></span>${msg}</div>`;
  if (inputEl) positionDrop(drop, inputEl);
  drop.classList.add("open");
}
function closeDrop(drop){
  if(drop){ drop.classList.remove("open"); }
}
function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

document.addEventListener("click",e=>{
  document.querySelectorAll(".drop.open").forEach(d=>{
    // drop is now in body; check against the linked input's parent instead
    const input = d._linkedInput;
    const ac = input ? input.closest(".ac") : null;
    if(ac && !ac.contains(e.target) && !d.contains(e.target)) closeDrop(d);
    else if(!ac && !d.contains(e.target)) closeDrop(d);
  });
});

function syncCriteriaPair(target, yesClass, noClass){
  if(!target?.classList) return false;
  const isYes = target.classList.contains(yesClass);
  const isNo = target.classList.contains(noClass);
  if(!isYes && !isNo) return false;
  if(!target.checked) return true;
  const otherClass = isYes ? noClass : yesClass;
  const other = document.querySelector(`.${otherClass}[data-n="${target.dataset.n}"]`);
  if(other) other.checked = false;
  return true;
}

document.addEventListener("change", e => {
  const target = e.target;
  if(syncCriteriaPair(target, "wc-yes", "wc-not")) return;
  if(syncCriteriaPair(target, "bed-yes", "bed-not")) return;
  syncCriteriaPair(target, "hoyer-yes", "hoyer-not");
});

function resetCurrentFormState(){
  document.querySelectorAll("#form-screen input:not([type=hidden]),#form-screen select,#form-screen textarea").forEach(el => {
    if(el.closest(".no-form-state")) return;
    if(el.type === "checkbox" || el.type === "radio") el.checked = false;
    else el.value = "";
  });
  document.querySelectorAll("input[id^='qty_']").forEach(clearQtyMeta);
  if(document.getElementById("insurance")) document.getElementById("insurance").value = "";
  for(let i=1;i<=4;i++)clearIcd(i);
  currentCloudRecordId = "";
  selectedRecordId = "";
  packageRecordIds = [];
  updateAllQty();
  syncWorkflowPanel();
}

function clearForm(){
  if(!confirm("Clear all fields?"))return;
  resetCurrentFormState();
}

function startNewForm(type){
  resetCurrentFormState();
  openForm(type);
}

// в”Ђв”Ђ INSURANCE TYPE CLASSIFIER в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// Returns: "medicaid" | "medicare_commercial"
function getInsuranceType(){
  const ins = (document.getElementById("insurance").value || "").toUpperCase();
  if(!ins) return null;
  // Pure Medicaid plans (no Medicare/Commercial)
  const medicaidPlans = [
    "SUNSHINE MMA","SUNSHINE LTC",
    "AETNA MEDICAID",
    "HUMANA MMA","HUMANA LTC",
    "SIMPLY LTC",
    "FLORIDA COMMUNITY CARE",
    "MEDICAID",
    "AETNA MMA","AETNA LTC"  // MMA/LTC = Medicaid Managed Care / Long Term Care
  ];
  for(const p of medicaidPlans){
    if(ins === p) return "medicaid";
  }
  return "medicare_commercial"; // everything else
}


// в”Ђв”Ђ MEDICAID MONTHLY SUPPLY QTY RULES в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// Auto-filled from the Florida Medicaid DME / Medical Supplies fee schedule.
// Uses the fee schedule "Units" column, which represents the number of units
// billable within the same month for a one-month supply.
const MEDICAID_SUPPLY_QTY_RULES = {"A4206":{"u":60,"l":"720 PER YEAR"},"A4207":{"u":60,"l":"720 PER YEAR"},"A4208":{"u":60,"l":"720 PER YEAR"},"A4209":{"u":60,"l":"720 PER YEAR"},"A4213":{"u":31,"l":"372 PER YEAR"},"A4215":{"u":100,"l":"1200 PER YEAR"},"A4216":{"u":150,"l":"150 PER MONTH"},"A4217":{"u":1,"l":"31 UNITS PER MONTH"},"A4221":{"u":1,"l":"52 PER YEAR"},"A4222":{"u":7,"l":"MEDICAL NECESSITY UP TO 365 PER YEAR MAX"},"A4223":{"u":1,"l":"52 PER YEAR"},"A4230":{"u":1,"l":"12 BOXES PER YEAR"},"A4231":{"u":1,"l":"12 BOXES PER YEAR"},"A4232":{"u":1,"l":"12 BOXES PER YEAR"},"A4244":{"u":12,"l":"144 PER YEAR"},"A4245":{"u":2,"l":"24 PER YEAR"},"A4246":{"u":3,"l":"36 PER YEAR"},"A4247":{"u":2,"l":"2 BOXES PER MONTH"},"A4250":{"u":2,"l":"2 BOXES PER MONTH"},"A4265":{"u":6,"l":"72 PER YEAR"},"A4280":{"u":5,"l":"5 PER MONTH"},"A4310":{"u":2,"l":"24 PER YEAR"},"A4311":{"u":3,"l":"36 PER YEAR"},"A4312":{"u":3,"l":"36 PER YEAR"},"A4313":{"u":3,"l":"36 PER YEAR"},"A4314":{"u":2,"l":"24 PER YEAR"},"A4315":{"u":2,"l":"24 PER YEAR"},"A4316":{"u":2,"l":"24 PER YEAR"},"A4320":{"u":31,"l":"372 PER YEAR"},"A4322":{"u":12,"l":"144 PER YEAR"},"A4326":{"u":31,"l":"372 PER YEAR"},"A4327":{"u":1,"l":"1 PER YEAR"},"A4328":{"u":2,"l":"24 PER YEAR"},"A4330":{"u":31,"l":"372 PER YEAR"},"A4331":{"u":31,"l":"372 PER YEAR"},"A4332":{"u":200,"l":"200 PER MONTH"},"A4333":{"u":31,"l":"31 PER MONTH"},"A4338":{"u":3,"l":"36 PER YEAR"},"A4340":{"u":3,"l":"36 PER YEAR"},"A4344":{"u":3,"l":"36 PER YEAR"},"A4346":{"u":3,"l":"36 PER YEAR"},"A4349":{"u":35,"l":"35 PER MONTH"},"A4351":{"u":186,"l":"186 PER MONTH"},"A4352":{"u":186,"l":"186 PER MONTH"},"A4353":{"u":186,"l":"186 PER MONTH"},"A4354":{"u":3,"l":"36 PER YEAR"},"A4355":{"u":4,"l":"48 PER YEAR"},"A4356":{"u":1,"l":"1 PER YEAR"},"A4357":{"u":2,"l":"24 PER YEAR"},"A4358":{"u":5,"l":"60 PER YEAR"},"A4361":{"u":1,"l":"12 PER YEAR"},"A4362":{"u":20,"l":"240 PER YEAR"},"A4363":{"u":12,"l":"144 PER YEAR"},"A4364":{"u":4,"l":"48 PER YEAR"},"A4367":{"u":1,"l":"12 PER YEAR"},"A4368":{"u":200,"l":"200 PER MONTH"},"A4369":{"u":12,"l":"144 PER YEAR"},"A4371":{"u":12,"l":"144 PER YEAR"},"A4372":{"u":20,"l":"240 PER YEAR"},"A4373":{"u":31,"l":"372 PER YEAR"},"A4375":{"u":10,"l":"10 PER MONTH"},"A4376":{"u":10,"l":"10 PER MONTH"},"A4377":{"u":10,"l":"10 PER MONTH"},"A4378":{"u":10,"l":"10 PER MONTH"},"A4379":{"u":10,"l":"10 PER MONTH"},"A4380":{"u":20,"l":"240 PER YEAR"},"A4381":{"u":10,"l":"10 PER MONTH"},"A4382":{"u":10,"l":"10 PER MONTH"},"A4383":{"u":10,"l":"10 PER MONTH"},"A4384":{"u":10,"l":"10 PER MONTH"},"A4385":{"u":10,"l":"10 PER MONTH"},"A4387":{"u":10,"l":"10 PER MONTH"},"A4388":{"u":10,"l":"10 PER MONTH"},"A4389":{"u":10,"l":"10 PER MONTH"},"A4390":{"u":10,"l":"10 PER MONTH"},"A4391":{"u":10,"l":"10 PER MONTH"},"A4392":{"u":10,"l":"10 PER MONTH"},"A4393":{"u":10,"l":"10 PER MONTH"},"A4394":{"u":10,"l":"10 PER MONTH"},"A4395":{"u":31,"l":"31 PER MONTH"},"A4396":{"u":2,"l":"2 PER MONTH"},"A4398":{"u":2,"l":"24 PER YEAR"},"A4399":{"u":1,"l":"2 PER YEAR"},"A4400":{"u":1,"l":"6 PER YEAR"},"A4402":{"u":4,"l":"48 PER YEAR"},"A4404":{"u":31,"l":"372 PER YEAR"},"A4405":{"u":12,"l":"144 PER YEAR"},"A4406":{"u":12,"l":"144 PER YEAR"},"A4407":{"u":31,"l":"372 PER YEAR"},"A4408":{"u":31,"l":"372 PER YEAR"},"A4409":{"u":31,"l":"372 PER YEAR"},"A4410":{"u":31,"l":"372 PER YEAR"},"A4411":{"u":31,"l":"372 PER YEAR"},"A4412":{"u":31,"l":"31 PER MONTH"},"A4413":{"u":10,"l":"10 PER MONTH"},"A4414":{"u":31,"l":"372 PER YEAR"},"A4415":{"u":31,"l":"372 PER YEAR"},"A4416":{"u":31,"l":"31 PER MONTH"},"A4417":{"u":31,"l":"31 PER MONTH"},"A4418":{"u":31,"l":"31 PER MONTH"},"A4420":{"u":31,"l":"31 PER MONTH"},"A4421":{"u":1,"l":"12 PER YEAR"},"A4423":{"u":31,"l":"31 PER MONTH"},"A4424":{"u":31,"l":"31 PER MONTH"},"A4425":{"u":31,"l":"372 PER YEAR"},"A4426":{"u":31,"l":"372 PER YEAR"},"A4427":{"u":31,"l":"372 PER YEAR"},"A4428":{"u":31,"l":"372 PER YEAR"},"A4429":{"u":31,"l":"372 PER YEAR"},"A4430":{"u":31,"l":"372 PER YEAR"},"A4431":{"u":31,"l":"31 PER MONTH"},"A4432":{"u":31,"l":"31 PER MONTH"},"A4433":{"u":31,"l":"31 PER MONTH"},"A4434":{"u":31,"l":"372 PER YEAR"},"A4436":{"u":1,"l":"1 PER MONTH"},"A4437":{"u":1,"l":"1 PER MONTH"},"A4450":{"u":200,"l":"2400 PER YEAR"},"A4452":{"u":200,"l":"2400 PER YEAR"},"A4455":{"u":4,"l":"48 PER YEAR"},"A4456":{"u":100,"l":"100 PER MONTH"},"A4554":{"u":150,"l":"1800 PER YEAR"},"A4561":{"u":10,"l":"10 PER MONTH"},"A4562":{"u":10,"l":"10 PER MONTH"},"A4640":{"u":1,"l":"1 PER YEAR"},"A4927":{"u":4,"l":"48 PER YEAR"},"A4930":{"u":100,"l":"1200 PER YEAR"},"A5051":{"u":31,"l":"372 PER YEAR"},"A5052":{"u":31,"l":"372 PER YEAR"},"A5053":{"u":31,"l":"372 PER YEAR"},"A5054":{"u":31,"l":"372 PER YEAR"},"A5055":{"u":31,"l":"31 PER MONTH"},"A5056":{"u":1,"l":"10 PER MONTH"},"A5057":{"u":1,"l":"10 PER MONTH"},"A5061":{"u":31,"l":"372 PER YEAR"},"A5062":{"u":31,"l":"372 PER YEAR"},"A5063":{"u":31,"l":"372 PER YEAR"},"A5071":{"u":31,"l":"372 PER YEAR"},"A5072":{"u":31,"l":"372 PER YEAR"},"A5073":{"u":31,"l":"372 PER YEAR"},"A5081":{"u":1,"l":"6 PER YEAR"},"A5082":{"u":1,"l":"6 PER YEAR"},"A5093":{"u":10,"l":"120 PER YEAR"},"A5102":{"u":1,"l":"2 PER YEAR"},"A5105":{"u":1,"l":"2 PER YEAR"},"A5112":{"u":1,"l":"12 PER YEAR"},"A5113":{"u":1,"l":"4 PER YEAR"},"A5114":{"u":1,"l":"4 PER YEAR"},"A5120":{"u":50,"l":"600 PER YEAR"},"A5121":{"u":10,"l":"120 PER YEAR"},"A5122":{"u":10,"l":"120 PER YEAR"},"A5126":{"u":20,"l":"240 PER YEAR"},"A5131":{"u":3,"l":"3 PER MONTH"},"A5200":{"u":3,"l":"3 PER MONTH"},"A6022":{"u":31,"l":"31 PER MONTH"},"A6023":{"u":15,"l":"15 PER MONTH"},"A6024":{"u":31,"l":"31 PER MONTH"},"A6154":{"u":15,"l":"15 PER MONTH"},"A6196":{"u":31,"l":"31 PER MONTH"},"A6197":{"u":31,"l":"31 PER MONTH"},"A6199":{"u":31,"l":"31 PER MONTH"},"A6203":{"u":31,"l":"31 PER MONTH"},"A6204":{"u":31,"l":"31 PER MONTH"},"A6207":{"u":31,"l":"31 PER MONTH"},"A6209":{"u":31,"l":"31 PER MONTH"},"A6210":{"u":31,"l":"31 PER MONTH"},"A6211":{"u":31,"l":"31 PER MONTH"},"A6212":{"u":31,"l":"31 PER MONTH"},"A6214":{"u":31,"l":"31 PER MONTH"},"A6216":{"u":200,"l":"200 PER MONTH"},"A6219":{"u":62,"l":"62 PER MONTH"},"A6220":{"u":62,"l":"62 PER MONTH"},"A6222":{"u":31,"l":"31 PER MONTH"},"A6223":{"u":31,"l":"31 PER MONTH"},"A6224":{"u":31,"l":"31 PER MONTH"},"A6229":{"u":31,"l":"31 PER MONTH"},"A6231":{"u":31,"l":"31 PER MONTH"},"A6232":{"u":31,"l":"31 PER MONTH"},"A6233":{"u":31,"l":"31 PER MONTH"},"A6234":{"u":31,"l":"31 PER MONTH"},"A6235":{"u":31,"l":"31 PER MONTH"},"A6236":{"u":31,"l":"31 PER MONTH"},"A6237":{"u":31,"l":"31 PER MONTH"},"A6238":{"u":31,"l":"31 PER MONTH"},"A6240":{"u":31,"l":"31 PER MONTH"},"A6241":{"u":31,"l":"31 PER MONTH"},"A6242":{"u":31,"l":"31 PER MONTH"},"A6243":{"u":31,"l":"31 PER MONTH"},"A6244":{"u":31,"l":"31 PER MONTH"},"A6245":{"u":31,"l":"31 PER MONTH"},"A6246":{"u":31,"l":"31 PER MONTH"},"A6247":{"u":31,"l":"31 PER MONTH"},"A6248":{"u":15,"l":"15 PER MONTH"},"A6251":{"u":31,"l":"31 PER MONTH"},"A6252":{"u":31,"l":"31 PER MONTH"},"A6253":{"u":31,"l":"31 PER MONTH"},"A6254":{"u":31,"l":"31 PER MONTH"},"A6255":{"u":31,"l":"31 PER MONTH"},"A6257":{"u":31,"l":"31 PER MONTH"},"A6258":{"u":31,"l":"31 PER MONTH"},"A6259":{"u":31,"l":"31 PER MONTH"},"A6266":{"u":31,"l":"31 PER MONTH"},"A6402":{"u":200,"l":"200 PER MONTH"},"A6403":{"u":200,"l":"200 PER MONTH"},"A6441":{"u":31,"l":"31 PER MONTH"},"A6443":{"u":31,"l":"31 PER MONTH"},"A6444":{"u":31,"l":"31 PER MONTH"},"A6446":{"u":31,"l":"31 PER MONTH"},"A6447":{"u":31,"l":"31 PER MONTH"},"A6449":{"u":31,"l":"31 PER MONTH"},"A6450":{"u":31,"l":"31 PER MONTH"},"A6451":{"u":31,"l":"31 PER MONTH"},"A6452":{"u":31,"l":"31 PER MONTH"},"A6454":{"u":31,"l":"31 PER MONTH"},"A6456":{"u":31,"l":"31 PER MONTH"},"A6457":{"u":2,"l":"2 EVERY 6 MONTHS"},"A9276":{"u":"1 (per box)","l":"1 PER MONTH"},"A9277":{"u":1,"l":"2 PER YEAR"},"A9278":{"u":1,"l":"1 PER YEAR"},"A9900":{"u":1,"l":"MEDICAL NECESSITY"},"T4521":{"u":200,"l":"UP TO 200 PER MONTH Any combination of these codes can be billed but only up to 200 units.*","g":"CONTINENCE_SHARED_200"},"T4522":{"u":200,"l":"UP TO 200 PER MONTH Any combination of these codes can be billed but only up to 200 units.*","g":"CONTINENCE_SHARED_200"},"T4523":{"u":200,"l":"UP TO 200 PER MONTH Any combination of these codes can be billed but only up to 200 units.*","g":"CONTINENCE_SHARED_200"},"T4524":{"u":200,"l":"UP TO 200 PER MONTH Any combination of these codes can be billed but only up to 200 units.*","g":"CONTINENCE_SHARED_200"},"T4525":{"u":200,"l":"UP TO 200 PER MONTH Any combination of these codes can be billed but only up to 200 units.*","g":"CONTINENCE_SHARED_200"},"T4526":{"u":200,"l":"UP TO 200 PER MONTH Any combination of these codes can be billed but only up to 200 units.*","g":"CONTINENCE_SHARED_200"},"T4527":{"u":200,"l":"UP TO 200 PER MONTH Any combination of these codes can be billed but only up to 200 units.*","g":"CONTINENCE_SHARED_200"},"T4528":{"u":200,"l":"UP TO 200 PER MONTH Any combination of these codes can be billed but only up to 200 units.*","g":"CONTINENCE_SHARED_200"},"T4529":{"u":200,"l":"UP TO 200 PER MONTH Any combination of these codes can be billed but only up to 200 units.*","g":"CONTINENCE_SHARED_200"},"T4530":{"u":200,"l":"UP TO 200 PER MONTH Any combination of these codes can be billed but only up to 200 units.*","g":"CONTINENCE_SHARED_200"},"T4531":{"u":200,"l":"UP TO 200 PER MONTH Any combination of these codes can be billed but only up to 200 units.*","g":"CONTINENCE_SHARED_200"},"T4532":{"u":200,"l":"UP TO 200 PER MONTH Any combination of these codes can be billed but only up to 200 units.*","g":"CONTINENCE_SHARED_200"},"T4533":{"u":200,"l":"UP TO 200 PER MONTH Any combination of these codes can be billed but only up to 200 units.*","g":"CONTINENCE_SHARED_200"},"T4534":{"u":200,"l":"UP TO 200 PER MONTH Any combination of these codes can be billed but only up to 200 units.*","g":"CONTINENCE_SHARED_200"},"T4535":{"u":200,"l":"UP TO 200 PER MONTH Any combination of these codes can be billed but only up to 200 units.*","g":"CONTINENCE_SHARED_200"},"T4543":{"u":200,"l":"UP TO 200 PER MONTH Any combination of these codes can be billed but only up to 200 units.*","g":"CONTINENCE_SHARED_200"},"T4544":{"u":200,"l":"UP TO 200 PER MONTH Any combination of these codes can be billed but only up to 200 units.*","g":"CONTINENCE_SHARED_200"},"B4034":{"u":31,"l":"31 PER MONTH"},"B4035":{"u":31,"l":"31 PER MONTH"},"B4036":{"u":31,"l":"31 PER MONTH"},"B4081":{"u":8,"l":"96 PER YEAR"},"B4082":{"u":8,"l":"96 PER YEAR"},"B4083":{"u":15,"l":"180 PER YEAR"},"B4087":{"u":2,"l":"24 PER YEAR"},"B4088":{"u":1,"l":"6 PER YEAR"},"B4149":{"u":930,"l":"930 PER MONTH"},"B4150":{"u":930,"l":"930 PER MONTH"},"B4150SC":{"u":930,"l":"930 PER MONTH"},"B4152":{"u":930,"l":"930 PER MONTH"},"B4152SC":{"u":930,"l":"930 PER MONTH"},"B4153":{"u":930,"l":"930 PER MONTH"},"B4153SC":{"u":930,"l":"930 PER MONTH"},"B4154":{"u":930,"l":"930 PER MONTH"},"B4154SC":{"u":930,"l":"930 PER MONTH"},"B4155":{"u":930,"l":"930 PER MONTH"},"B4155SC":{"u":930,"l":"930 PER MONTH"},"B4157":{"u":930,"l":"930 PER MONTH"},"B4157SC":{"u":930,"l":"930 PER MONTH"},"B4160":{"u":930,"l":"930 PER MONTH"},"B4160SC":{"u":930,"l":"930 PER MONTH"},"B4161":{"u":930,"l":"930 PER MONTH"},"B4161SC":{"u":930,"l":"930 PER MONTH"},"B4162":{"u":930,"l":"930 PER MONTH"},"B4162SC":{"u":930,"l":"930 PER MONTH"}};

function normalizeHcpcsCode(code){
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g,"");
}

function getSupplyQtyRule(hcpcsCode, insuranceType){
  const code = normalizeHcpcsCode(hcpcsCode);
  if(!code || insuranceType !== "medicaid") return null;
  return MEDICAID_SUPPLY_QTY_RULES[code] || null;
}

function clearQtyMeta(qtyEl){
  if(!qtyEl) return;
  qtyEl.removeAttribute("title");
  delete qtyEl.dataset.qtySource;
  delete qtyEl.dataset.qtyRule;
}

function applySupplyQtyRule(qtyEl, rule){
  if(!qtyEl || !rule) return false;
  qtyEl.value = String(rule.u);
  qtyEl.dataset.qtySource = "medicaid_supply_limit";
  qtyEl.dataset.qtyRule = rule.l || "";
  let title = `Florida Medicaid monthly units: ${rule.u}`;
  if(rule.l) title += ` | Limit: ${rule.l}`;
  if(rule.g) title += " | Shared cap across related continence codes.";
  qtyEl.title = title;
  return true;
}

// в”Ђв”Ђ HCPCS PRICE LOOKUP TABLE в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// Approximate CMS fee schedule purchase prices for common DME codes.
// If purchase price < $300 в†’ always bill as purchase (1 NU)
// If purchase price >= $300 OR code is typically rental в†’ apply rental logic
// Source: CMS DMEPOS Fee Schedule (Florida/national averages)
const HCPCS_PRICES = {
  // в”Ђв”Ђ WALKERS / CANES / CRUTCHES (all under $300 вЂ” purchase) в”Ђв”Ђ
  "E0100":45,  "E0105":60,
  "E0110":85,  "E0111":90,  "E0112":95,  "E0113":100, "E0114":110, "E0116":105,
  "E0130":110, "E0135":130, "E0140":120, "E0141":125, "E0143":140, "E0144":150,
  "E0147":400, "E0148":410, "E0149":420, "E0153":55,  "E0154":65,  "E0155":75,
  "E0156":80,  "E0157":85,  "E0158":90,  "E0159":95,
  // в”Ђв”Ђ COMMODES (purchase) в”Ђв”Ђ
  "E0163":110, "E0165":145, "E0167":130, "E0168":200, "E0170":260, "E0171":280,
  // в”Ђв”Ђ BATH / SHOWER CHAIRS (purchase) в”Ђв”Ђ
  "E0240":65,  "E0241":70,  "E0242":75,  "E0243":80,  "E0244":90,
  "E0245":95,  "E0246":100, "E0247":110, "E0248":125,
  // в”Ђв”Ђ TRAPEZE / OVERBED TABLE (purchase) в”Ђв”Ђ
  "E0900":180, "E0910":120, "E0920":90,  "E0935":140, "E0936":145,
  "E0940":200, "E0941":210, "E0942":220, "E0943":230, "E0944":240, "E0945":250,
  "E0946":170, "E0947":180, "E0948":190,
  // в”Ђв”Ђ TRACTION EQUIPMENT (purchase) в”Ђв”Ђ
  "E0849":195, "E0850":200, "E0855":175, "E0856":185,
  // в”Ђв”Ђ CUSHIONS / POSITIONING (purchase if <$300) в”Ђв”Ђ
  "E0190":60,  "E0191":55,  "E0193":260, "E0194":270, "E0196":190,
  "E0197":180, "E0198":170, "E0199":160,
  // в”Ђв”Ђ TRANSFER BENCH / LIFT (purchase) в”Ђв”Ђ
  "E0155":75,  "E0156":80,  "E0157":85,
  // в”Ђв”Ђ HEAT/COLD THERAPY (purchase) в”Ђв”Ђ
  "E0200":45,  "E0202":50,  "E0203":55,  "E0205":60,  "E0210":65,
  "E0215":70,  "E0217":75,  "E0218":80,  "E0221":90,
  // в”Ђв”Ђ KNEE/BACK BRACES вЂ” L-codes (purchase) в”Ђв”Ђ
  "L0130":120, "L0174":140, "L0450":260, "L0452":280, "L0454":265,
  "L0456":270, "L0458":275, "L0460":285, "L0462":290,
  "L1800":180, "L1810":190, "L1820":200, "L1830":210, "L1831":220,
  "L1832":230, "L1833":240, "L1834":250, "L1836":260, "L1840":270,
  "L1843":280, "L1844":290, "L1845":295, "L1846":285, "L1847":275,
  "L1848":265, "L1850":255, "L1860":245,
  "L0636":270, "L0637":280, "L0638":290, "L0639":285, "L0640":275,
  "L0641":265, "L0642":255, "L0643":245, "L0648":290, "L0649":295,
  "L0650":285, "L0651":275,
  // в”Ђв”Ђ WRIST/HAND SPLINTS (purchase) в”Ђв”Ђ
  "L3900":75,  "L3901":80,  "L3904":85,  "L3905":90,  "L3906":95,
  "L3908":100, "L3912":110, "L3913":115, "L3915":120, "L3916":125,
  "L3917":130, "L3919":140, "L3921":145, "L3923":150, "L3925":155,
  "L3927":160, "L3929":165, "L3931":170, "L3933":180, "L3935":190,
  // в”Ђв”Ђ ANKLE/FOOT ORTHOTICS AFO (purchase) в”Ђв”Ђ
  "L1900":120, "L1902":130, "L1904":140, "L1906":150, "L1907":160,
  "L1910":170, "L1920":180, "L1930":190, "L1932":200, "L1940":210,
  "L1945":215, "L1950":220, "L1951":225, "L1960":230, "L1970":240,
  "L1971":250, "L1980":260, "L1990":270,
  // в”Ђв”Ђ CERVICAL COLLARS (purchase) в”Ђв”Ђ
  "L0120":55,  "L0130":65,  "L0140":75,  "L0150":85,  "L0160":95,
  "L0170":105, "L0172":115, "L0174":125,
  // в”Ђв”Ђ DIABETIC SUPPLIES / A-codes (purchase) в”Ђв”Ђ
  "A4230":30,  "A4231":35,  "A4232":25,  "A4233":20,
  "A4245":15,  "A4246":18,  "A4247":20,  "A4248":22,  "A4250":12,
  "A4253":50,  "A4256":25,  "A4258":30,  "A4259":35,
  "A5500":50,  "A5501":55,  "A5503":60,  "A5504":65,  "A5505":70,
  "A5506":75,  "A5507":80,  "A5508":85,  "A5510":90,  "A5512":95,
  "A5513":100, "A5514":105,
  // в”Ђв”Ђ OSTOMY SUPPLIES (purchase) в”Ђв”Ђ
  "A4361":30,  "A4362":35,  "A4363":25,  "A4364":20,  "A4366":18,
  "A4367":15,  "A4368":22,  "A4369":28,  "A4371":32,  "A4372":38,
  "A4373":42,  "A4374":48,  "A4375":52,  "A4376":58,  "A4377":62,
  "A4378":68,  "A4379":72,  "A4380":78,  "A4381":82,  "A4382":88,
  "A4383":92,  "A4384":98,  "A4385":102, "A4387":108, "A4388":112,
  "A4389":118, "A4390":122, "A4391":128, "A4392":132, "A4393":138,
  "A4394":142, "A4395":148, "A4396":152, "A4397":158, "A4398":162,
  "A4399":168, "A4400":172, "A4402":178,
  // в”Ђв”Ђ INCONTINENCE SUPPLIES (purchase) в”Ђв”Ђ
  "A4310":20,  "A4311":22,  "A4312":24,  "A4313":26,  "A4314":28,
  "A4315":30,  "A4316":32,  "A4320":35,  "A4321":38,  "A4322":42,
  "A4326":45,  "A4327":48,  "A4328":52,  "A4330":55,  "A4331":58,
  "A4332":62,  "A4333":65,  "A4334":68,  "A4335":72,  "A4336":75,
  "A4337":78,  "A4338":82,  "A4340":85,  "A4344":88,  "A4346":92,
  "A4347":95,  "A4349":98,  "A4351":102, "A4352":108, "A4353":112,
  "A4354":118, "A4355":122, "A4356":128, "A4357":132, "A4358":138,
  "A4360":142,
  // в”Ђв”Ђ NEBULIZER SUPPLIES (purchase) в”Ђв”Ђ
  "A7000":25,  "A7001":28,  "A7002":32,  "A7003":38,  "A7004":42,
  "A7005":48,  "A7006":52,  "A7007":58,  "A7008":62,  "A7009":68,
  "A7010":72,  "A7011":78,  "A7012":82,  "A7013":88,  "A7014":92,
  "A7015":98,  "A7016":102, "A7017":108,
  // в”Ђв”Ђ SURGICAL DRESSINGS (purchase) в”Ђв”Ђ
  "A6000":15,  "A6001":18,  "A6002":22,  "A6003":28,  "A6004":32,
  "A6005":38,  "A6006":42,  "A6007":48,  "A6008":52,  "A6009":58,
  "A6010":62,  "A6011":68,  "A6012":72,  "A6013":78,  "A6014":82,
  "A6015":88,  "A6016":92,  "A6017":98,  "A6018":102, "A6019":108,
  "A6020":112, "A6021":118, "A6022":122, "A6023":128, "A6024":132,
  "A6025":138, "A6026":142, "A6154":148, "A6196":152, "A6197":158,
  "A6198":162, "A6199":168, "A6200":172, "A6201":178, "A6202":182,
  "A6203":188, "A6204":192, "A6205":198, "A6206":202, "A6207":208,
  "A6208":212, "A6209":218, "A6210":222, "A6211":228, "A6212":232,
  "A6213":238, "A6214":242, "A6215":248, "A6216":252, "A6217":258,
  "A6218":262, "A6219":268, "A6220":272, "A6221":278, "A6222":282,
  "A6223":288, "A6224":292, "A6228":195, "A6229":200, "A6230":205,
  // в”Ђв”Ђ HOSPITAL BEDS (rental вЂ” >$300) в”Ђв”Ђ
  "E0250":1800,"E0251":1900,"E0255":2000,"E0256":2100,"E0260":2200,
  "E0261":2300,"E0265":2400,"E0266":2500,"E0270":2600,"E0271":2700,
  "E0272":2800,"E0273":2900,"E0274":3000,"E0275":3100,"E0276":3200,
  "E0277":3300,"E0280":1500,"E0290":1600,"E0291":1700,"E0292":1800,
  "E0293":1900,"E0294":2000,"E0295":2100,"E0296":2200,"E0297":2300,
  "E0301":2400,"E0302":2500,"E0303":2600,"E0304":2700,"E0305":2800,
  "E0310":2900,
  // в”Ђв”Ђ MATTRESSES/OVERLAYS (varies) в”Ђв”Ђ
  "E0181":180, "E0182":190, "E0183":200, "E0184":210, "E0185":220,
  "E0186":230, "E0187":240, "E0188":250, "E0189":260, "E0191":270,
  "E0193":280, "E0194":290, "E0196":295, "E0197":285, "E0199":275,
  // в”Ђв”Ђ WHEELCHAIRS (rental вЂ” >$300) в”Ђв”Ђ
  "E1130":500, "E1140":600, "E1150":700, "E1160":800, "E1161":900,
  "E1170":1000,"E1171":1100,"E1172":1200,"E1180":1300,"E1190":1400,
  "E1195":1500,"E1200":1600,"E1210":1700,"E1211":1800,"E1212":1900,
  "E1213":2000,"E1214":2100,"E1220":2200,"E1221":2300,"E1222":2400,
  "E1223":2500,"E1224":2600,"E1225":2700,"E1226":2800,"E1227":2900,
  "E1228":3000,"E1229":3100,"E1230":3200,"E1231":3300,"E1232":3400,
  "E1233":3500,"E1234":3600,"E1235":3700,"E1236":3800,"E1237":3900,
  "E1238":4000,
  "K0001":350, "K0002":450, "K0003":550, "K0004":650, "K0005":4500,
  "K0006":5000,"K0007":5500,"K0008":3000,"K0009":3500,"K0010":400,
  "K0011":450, "K0012":500, "K0013":550, "K0014":600,
  // в”Ђв”Ђ SCOOTERS (rental) в”Ђв”Ђ
  "K0800":1800,"K0801":2000,"K0802":2200,"K0806":2400,"K0807":2600,
  "K0808":2800,"K0812":3000,
  // в”Ђв”Ђ POWER WHEELCHAIRS Group 1-5 (all rental, all >$300) в”Ђв”Ђ
  "K0813":3500,"K0814":3600,"K0815":3700,"K0816":3800,
  "K0820":4000,"K0821":4100,"K0822":4200,
  "K0823":4500,"K0824":4800,"K0825":5000,"K0826":5200,"K0827":5500,
  "K0828":5800,"K0829":6000,
  "K0835":5500,"K0836":5600,"K0837":5700,"K0838":5800,"K0839":5900,"K0840":6000,
  "K0841":6500,"K0842":6600,"K0843":6700,
  "K0848":7000,"K0849":7100,"K0850":7200,"K0851":7300,"K0852":7400,
  "K0853":7500,"K0854":7600,"K0855":7700,"K0856":7800,"K0857":7900,
  "K0858":8000,"K0859":8100,"K0860":8200,"K0861":8300,"K0862":8400,
  "K0863":8500,"K0864":8600,
  "K0868":9000,"K0869":9100,"K0870":9200,"K0871":9300,
  "K0877":9500,"K0878":9600,"K0879":9700,"K0880":9800,
  "K0884":10000,"K0885":10200,"K0886":10400,
  "K0890":11000,"K0891":11200,"K0898":4000,
  // в”Ђв”Ђ CPAP / RESPIRATORY (rental) в”Ђв”Ђ
  "E0470":700, "E0471":800, "E0480":900, "E0482":1000,"E0484":1100,
  "E0485":1200,"E0486":1300,"E0487":1400,"E0561":200, "E0562":250,
  "E0601":800,
  // в”Ђв”Ђ OXYGEN EQUIPMENT (rental) в”Ђв”Ђ
  "E0431":2500,"E0433":2600,"E0434":2700,"E0435":2800,
  "E0439":2900,"E0440":3000,"E0441":3100,"E0442":3200,"E0443":3300,
  "E0444":3400,"E0445":3500,"E0446":3600,"E0447":3700,
  "E1390":2000,"E1391":2100,"E1392":2200,"E1405":2300,"E1406":2400,
  // в”Ђв”Ђ INFUSION PUMPS (rental) в”Ђв”Ђ
  "E0776":1200,"E0779":1300,"E0780":1400,"E0781":1500,"E0782":1600,
  "E0783":1700,"E0784":1800,"E0785":1900,"E0786":2000,
  // в”Ђв”Ђ LIFT EQUIPMENT (rental if >$300) в”Ђв”Ђ
  "E0621":800, "E0625":900, "E0627":1000,"E0628":1100,"E0629":1200,
  "E0630":1300,"E0635":1400,"E0636":1500,"E0637":1600,"E0638":1700,
  "E0639":1800,"E0640":1900,"E0641":2000,"E0642":2100,"E0650":2200,
  "E0651":2300,"E0652":2400,"E0655":2500,"E0660":2600,"E0665":2700,
  "E0666":2800,"E0667":2900,"E0668":3000,"E0669":3100,"E0670":3200,
  "E0671":3300,"E0672":3400,"E0673":3500,"E0675":1500,"E0676":1600,
  "E0691":1700,"E0692":1800,"E0693":1900,"E0694":2000,"E0695":2100,
  "E0700":2200,"E0705":2300,"E0710":2400,
};

// в”Ђв”Ђ HCPCS ITEM TYPE CLASSIFIER в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// Returns "purchase" if price < $300 or always-purchase category
// Returns "rental" otherwise
function getItemType(hcpcsCode, insuranceType){
  if(!hcpcsCode) return null;
  const code = normalizeHcpcsCode(hcpcsCode);
  const letter = code[0];

  // в”Ђв”Ђ SPECIAL CASES: insurance-dependent items в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  // E0147 (heavy duty walker), E0149 (bariatric walker), E0260 (semi-electric bed)
  // Medicaid в†’ purchase (1 NU), Medicare/Commercial в†’ rental
  if(["E0147","E0149","E0260"].includes(code)){
    const ins = insuranceType || getInsuranceType();
    return ins === "medicaid" ? "purchase" : "rental";
  }

  if(code === "E0265") return "purchase";

  // Check price lookup table first
  if(HCPCS_PRICES[code] !== undefined){
    return HCPCS_PRICES[code] < 300 ? "purchase" : "rental";
  }

  // For unknown codes, use category rules:
  // A-codes (supplies), B-codes, L-codes, S, T, V = purchase
  if(["A","B","L","S","T","V"].includes(letter)) return "purchase";

  // E-codes not in table: default rental (most equipment)
  if(letter === "E") return "rental";

  // K-codes rental ranges (all wheelchairs and power mobility devices):
  // K0001вЂ“K0109 = manual wheelchairs
  // K0800вЂ“K0898 = power mobility devices (scooters + power wheelchairs)
  // All of these are expensive rental items
  if(letter === "K"){
    const num = parseInt(code.slice(1));
    if(num >= 1   && num <= 109) return "rental";  // manual wheelchairs
    if(num >= 800 && num <= 898) return "rental";  // power wheelchairs & scooters
    return "purchase";
  }

  // Default: purchase
  return "purchase";
}

// в”Ђв”Ђ AUTO QTY FILLER в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function autoFillQty(row){
  const hcpcsRaw = (document.getElementById(`hcpcs_${row}`).value || "").trim();
  const qtyEl = document.getElementById(`qty_${row}`);
  if(!hcpcsRaw){
    qtyEl.value = "";
    clearQtyMeta(qtyEl);
    return;
  }

  const insType = getInsuranceType();
  if(!insType) return; // no insurance selected yet вЂ” don't overwrite

  const hcpcs = normalizeHcpcsCode(hcpcsRaw);
  const supplyRule = getSupplyQtyRule(hcpcs, insType);

  if(applySupplyQtyRule(qtyEl, supplyRule)){
    fitText(qtyEl, 12.5, 7);
    return;
  }

  clearQtyMeta(qtyEl);
  const itemType = getItemType(hcpcs, insType);

  if(itemType === "purchase"){
    qtyEl.value = "1 NU";
  } else {
    // rental
    qtyEl.value = insType === "medicaid" ? "10 RR" : "13 RR";
  }
  fitText(qtyEl, 12.5, 7);
}

function getStoredJson(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }catch{
    return fallback;
  }
}

function setStoredJson(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

function getUserScopedStorageKey(base){
  return `${base}_${authUser?.uid || "local"}`;
}

function getUserStoredJson(base, fallback){
  return getStoredJson(getUserScopedStorageKey(base), fallback);
}

function setUserStoredJson(base, value){
  setStoredJson(getUserScopedStorageKey(base), value);
}

function getDraftStore(){ return getStoredJson(STORAGE_KEYS.drafts, {}); }
function setDraftStore(store){ setStoredJson(STORAGE_KEYS.drafts, store); }
function getPatientPresetStore(){ return getStoredJson(STORAGE_KEYS.patients, []); }
function setPatientPresetStore(items){ setStoredJson(STORAGE_KEYS.patients, items.slice(0,12)); }
function getPhysicianPresetStore(){ return getStoredJson(STORAGE_KEYS.physicians, []); }
function setPhysicianPresetStore(items){ setStoredJson(STORAGE_KEYS.physicians, items.slice(0,12)); }
function getStaffProfile(){ return getStoredJson(STORAGE_KEYS.staff, null); }
function setStaffProfile(profile){ setStoredJson(STORAGE_KEYS.staff, profile); }
function getFormPreferenceStore(){ return getUserStoredJson(STORAGE_KEYS.preferences, { forms:{}, patients:{} }); }
function setFormPreferenceStore(store){ setUserStoredJson(STORAGE_KEYS.preferences, store); }

function formatTimestamp(ts){
  if(!ts) return "";
  try{
    return new Date(ts).toLocaleString([], {month:"short", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit"});
  }catch{
    return "";
  }
}

function setWorkflowMessage(id, message, className){
  const el = document.getElementById(id);
  if(!el) return;
  el.textContent = message;
  el.className = `workflow-note${className ? ` ${className}` : ""}`;
}

function setStatusMessage(id, message, className, baseClass){
  const el = document.getElementById(id);
  if(!el) return;
  el.textContent = message;
  el.className = `${baseClass}${className ? ` ${className}` : ""}`;
}

function setHomeStatus(id, message, className){
  setStatusMessage(id, message, className, "home-status");
}

function setRecordsPageStatus(message, className){
  setStatusMessage("records-page-status", message, className, "records-status");
}

function getCloudErrorMessage(error, fallback){
  const code = error?.code || error?.message || "";
  const messages = {
    "timeout": "Cloud request timed out. Check Firestore setup and your connection.",
    "permission-denied": "Cloud access is blocked by your Firestore rules.",
    "failed-precondition": "Create the Firestore Database in Firebase console, then publish the Firestore rules.",
    "unavailable": "The cloud database is unavailable right now."
  };
  return messages[code] || fallback;
}

function withCloudTimeout(promise, ms){
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

function getStaffDisplayName(profile){
  if(!profile) return "";
  return [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
}

function getFirebaseConfig(){
  const embedded = window.BLMED_FIREBASE_CONFIG;
  if(embedded && typeof embedded === "object") return embedded;
  return getStoredJson(STORAGE_KEYS.firebase, null);
}

function hasValidFirebaseConfig(config){
  const required = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
  return !!config && required.every(key => typeof config[key] === "string" && config[key].trim());
}

function loadFirebaseConfigIntoForm(){
  const config = getFirebaseConfig();
  const input = document.getElementById("firebase-config-input");
  if(input && config) input.value = JSON.stringify(config, null, 2);
}

function saveFirebaseConfig(){
  const input = document.getElementById("firebase-config-input");
  const raw = (input?.value || "").trim();
  if(!raw){
    setHomeStatus("firebase-status", "Paste your Firebase config JSON first.", "status-warn");
    return;
  }
  try{
    const parsed = JSON.parse(raw);
    if(!hasValidFirebaseConfig(parsed)) throw new Error("missing");
    setStoredJson(STORAGE_KEYS.firebase, parsed);
    setHomeStatus("firebase-status", "Cloud setup saved. Connecting now...", "status-ok");
    initFirebaseApp(true);
  }catch{
    setHomeStatus("firebase-status", "That Firebase config is not valid JSON for a web app.", "status-warn");
  }
}

function resetFirebaseConfig(){
  localStorage.removeItem(STORAGE_KEYS.firebase);
  firebaseReady = false;
  auth = null;
  db = null;
  authUser = null;
  setStaffProfile(null);
  cloudRecordsCache = [];
  currentCloudRecordId = "";
  selectedRecordId = "";
  if(document.getElementById("firebase-config-input")) document.getElementById("firebase-config-input").value = "";
  setHomeStatus("firebase-status", "Cloud setup cleared for this device.", "status-warn");
  setHomeStatus("auth-status", "Add your Firebase config, then create or sign in to an account.", "status-warn");
  setRecordsPageStatus("Cloud setup is not connected yet.", "status-warn");
  renderSavedRecords();
  renderCloudRecords();
  updateStaffStatus();
}

function initFirebaseApp(forceReload){
  const config = getFirebaseConfig();
  loadFirebaseConfigIntoForm();
  if(!hasValidFirebaseConfig(config)){
    firebaseReady = false;
    setHomeStatus("firebase-status", "Cloud setup is not connected yet.", "status-warn");
    setHomeStatus("auth-status", "Add your Firebase config, then create or sign in to an account.", "status-warn");
    setRecordsPageStatus("Cloud setup is not connected yet.", "status-warn");
    updateStaffStatus();
    return false;
  }
  try{
    if(!window.firebase){
      throw new Error("missing-sdk");
    }
    if(firebase.apps.length){
      const current = firebase.app().options || {};
      if(forceReload && current.projectId && current.projectId !== config.projectId){
        window.location.reload();
        return true;
      }
    }else{
      firebase.initializeApp(config);
    }
    auth = firebase.auth();
    db = firebase.firestore();
    firebaseReady = true;
    setHomeStatus("firebase-status", `Cloud connected to ${config.projectId}.`, "status-ok");
    setRecordsPageStatus("Sign in to load saved records.", "status-warn");
    if(!authStateBound){
      authStateBound = true;
      auth.onAuthStateChanged(async user => {
        authUser = user || null;
        updateStaffStatus();
        updateAuthStatus();
        if(authUser){
          await loadCloudProfile();
          await refreshCloudRecords();
          await applyRequestedRoute();
        }else{
          setStaffProfile(null);
          populateStaffProfileForm();
          cloudRecordsCache = [];
          currentCloudRecordId = "";
          selectedRecordId = "";
          renderSavedRecords();
          renderCloudRecords();
          setRecordsPageStatus("Sign in to view saved cloud records.", "status-warn");
          window.location.href = "login.html";
        }
      });
    }else{
      updateAuthStatus();
    }
    return true;
  }catch{
    firebaseReady = false;
    setHomeStatus("firebase-status", "Firebase could not initialize with that config.", "status-warn");
    setRecordsPageStatus("Cloud setup is not connected yet.", "status-warn");
    updateStaffStatus();
    return false;
  }
}

function updateAuthStatus(){
  if(!firebaseReady){
    setHomeStatus("auth-status", "Add your Firebase config, then create or sign in to an account.", "status-warn");
    return;
  }
  if(!authUser){
    setHomeStatus("auth-status", "Create an account or sign in to save records in the cloud.", "status-warn");
    return;
  }
  const profile = getStaffProfile() || {};
  const detail = getStaffDisplayName(profile);
  setHomeStatus("auth-status", `Signed in as ${authUser.email}${detail ? ` (${detail})` : ""}.`, "status-ok");
}

function populateStaffProfileForm(){
  const profile = getStaffProfile() || {};
  if(document.getElementById("staff_account_name")) document.getElementById("staff_account_name").value = profile.accountName || "";
  if(document.getElementById("staff_first_name")) document.getElementById("staff_first_name").value = profile.firstName || "";
  if(document.getElementById("staff_last_name")) document.getElementById("staff_last_name").value = profile.lastName || "";
  if(document.getElementById("staff_extension")) document.getElementById("staff_extension").value = profile.extension || "";
}

async function loadCloudProfile(){
  if(!firebaseReady || !db || !authUser) return null;
  try{
    const snap = await withCloudTimeout(db.collection("users").doc(authUser.uid).get(), 12000);
    const data = snap.exists ? (snap.data() || {}) : {};
    const profile = {
      accountName: data.accountName || "",
      firstName: data.firstName || "",
      lastName: data.lastName || "",
      extension: data.extension || ""
    };
    setStaffProfile(profile);
    populateStaffProfileForm();
    updateStaffStatus();
    return profile;
  }catch(error){
    setWorkflowMessage("record-status", getCloudErrorMessage(error, "Cloud profile could not be loaded right now."), "status-warn");
    updateStaffStatus();
    return null;
  }
}

function updateStaffStatus(){
  const profile = getStaffProfile();
  if(!authUser){
    setWorkflowMessage("staff-status", "Not signed in yet.", "status-warn");
    setWorkflowMessage("account-status", "Sign in from the home page to save records in the cloud.", "status-warn");
    setWorkflowMessage("fax-profile-status", "Optional staff details can be saved after sign-in.", "status-warn");
    return;
  }
  const displayName = getStaffDisplayName(profile);
  const label = profile?.accountName || authUser.email || "Signed-in user";
  const detail = [displayName, profile?.extension ? `Ext ${profile.extension}` : ""].filter(Boolean).join(" • ");
  setWorkflowMessage("staff-status", detail ? `${label} • ${detail}` : label, "status-ok");
  setWorkflowMessage("account-status", `Cloud archive connected for ${authUser.email}.`, "status-ok");
  setWorkflowMessage("fax-profile-status", detail ? `Fax cover will use ${detail}.` : "Fax cover will use Better Life defaults until staff details are added.", detail ? "status-ok" : "status-warn");
}

function openStaffProfileModal(){
  populateStaffProfileForm();
  document.getElementById("staff-profile-modal")?.classList.add("open");
}

function closeStaffProfileModal(){
  document.getElementById("staff-profile-modal")?.classList.remove("open");
}

function ensureStaffProfile(){
  updateStaffStatus();
  return true;
}

async function saveStaffProfile(){
  if(!authUser || !firebaseReady || !db){
    setWorkflowMessage("account-status", "Sign in first so staff details can be saved to the cloud.", "status-warn");
    return;
  }
  const accountName = (document.getElementById("staff_account_name")?.value || "").trim();
  const firstName = (document.getElementById("staff_first_name")?.value || "").trim();
  const lastName = (document.getElementById("staff_last_name")?.value || "").trim();
  const extension = (document.getElementById("staff_extension")?.value || "").trim();
  const profile = { accountName, firstName, lastName, extension };
  setStaffProfile(profile);
  try{
    await db.collection("users").doc(authUser.uid).set({
      email: authUser.email || "",
      accountName,
      firstName,
      lastName,
      extension,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true });
    updateStaffStatus();
    updateAuthStatus();
    syncFaxCover();
    setWorkflowMessage("record-status", "Staff details saved to your cloud profile.", "status-ok");
    closeStaffProfileModal();
  }catch{
    setWorkflowMessage("record-status", "Staff details could not be saved right now.", "status-warn");
  }
}

function getRecordLabel(record){
  return record?.patientName || `Untitled ${String(record?.form || currentForm).toUpperCase()} record`;
}

function getPatientDobValue(){
  const id = currentForm === "oxygen" ? "oxy-dob" : "dob";
  return (document.getElementById(id)?.value || "").trim();
}

function normalizeDob(value){
  return String(value || "").replace(/\D/g, "");
}

function renderSavedRecords(){
  const wrap = document.getElementById("records-list");
  if(!wrap) return;
  if(!authUser){
    wrap.innerHTML = `<div class="record-empty">Sign in to see recent cloud records.</div>`;
    return;
  }
  const records = cloudRecordsCache.slice(0,5);
  if(selectedRecordId && !cloudRecordsCache.some(item => item.id === selectedRecordId)) selectedRecordId = "";
  if(!records.length){
    wrap.innerHTML = `<div class="record-empty">No saved DWOs yet.</div>`;
    return;
  }
  wrap.innerHTML = "";
  records.forEach(record => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `record-chip${record.id === selectedRecordId ? " active" : ""}`;
    btn.innerHTML = `<strong>${esc(getRecordLabel(record))}</strong><span>${String(record.form || "").toUpperCase()} &middot; ${formatTimestamp(record.savedAtMs || record.savedAt)}</span>`;
    btn.onclick = () => {
      selectedRecordId = record.id;
      renderSavedRecords();
      setWorkflowMessage("record-status", `${getRecordLabel(record)} selected.`, "status-ok");
    };
    wrap.appendChild(btn);
  });
}

function createRecordSnapshot(){
  return {
    id: currentCloudRecordId || "",
    savedAt: Date.now(),
    savedAtMs: Date.now(),
    form: currentForm,
    patientName: getPatientFullName(),
    patientNameLower: getPatientFullName().toLowerCase(),
    patientDob: getPatientDobValue(),
    patientDobDigits: normalizeDob(getPatientDobValue()),
    state: getFormState(),
    owner: authUser?.email || "",
    ownerLabel: getStaffProfile()?.accountName || ""
  };
}

function renderCloudRecords(){
  const grid = document.getElementById("records-grid");
  if(!grid) return;
  updateQuickFillStatus();
  if(!authUser){
    grid.innerHTML = `<div class="records-empty">Sign in to view saved records.</div>`;
    return;
  }
  const search = (document.getElementById("records-search")?.value || "").trim().toLowerCase();
  const searchDigits = normalizeDob(search);
  const items = cloudRecordsCache.filter(record => {
    if(!search) return true;
    const name = String(record.patientName || "").toLowerCase();
    const dob = normalizeDob(record.patientDob || "");
    return name.includes(search) || (searchDigits && dob.includes(searchDigits));
  });
  if(!items.length){
    grid.innerHTML = `<div class="records-empty">No records match that patient name or DOB.</div>`;
    return;
  }
  grid.innerHTML = items.map(record => `
    <article class="records-card">
      <h3>${esc(getRecordLabel(record))}</h3>
      <div class="records-meta">
        DOB: ${esc(record.patientDob || "Not entered")}<br/>
        Form: ${esc(String(record.form || "").toUpperCase() || "UNKNOWN")}<br/>
        Saved: ${esc(formatTimestamp(record.savedAtMs || record.savedAt))}<br/>
        Account: ${esc(record.owner || authUser.email || "")}
      </div>
      <div class="records-actions">
        <button class="btn btn-stamp" type="button" onclick="openCloudRecord('${record.id}')">Open Record</button>
        <button class="btn btn-ghost" type="button" onclick="deleteCloudRecord('${record.id}')">Delete</button>
      </div>
    </article>
  `).join("");
}

async function refreshCloudRecords(){
  if(!firebaseReady || !db || !authUser){
    cloudRecordsCache = [];
    renderSavedRecords();
    renderCloudRecords();
    return [];
  }
  try{
    setRecordsPageStatus("Loading saved records...", "");
    const snap = await withCloudTimeout(
      db.collection("users").doc(authUser.uid).collection("records").orderBy("savedAtMs", "desc").get(),
      12000
    );
    cloudRecordsCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderSavedRecords();
    renderCloudRecords();
    renderDwoPackageBuilder();
    setRecordsPageStatus(cloudRecordsCache.length ? `${cloudRecordsCache.length} cloud record${cloudRecordsCache.length === 1 ? "" : "s"} loaded.` : "No cloud records have been saved yet.", cloudRecordsCache.length ? "status-ok" : "status-warn");
    return cloudRecordsCache;
  }catch(error){
    renderSavedRecords();
    renderCloudRecords();
    renderDwoPackageBuilder();
    setRecordsPageStatus(getCloudErrorMessage(error, "Records could not be loaded right now."), "status-warn");
    return [];
  }
}

function openCloudRecord(id){
  const record = cloudRecordsCache.find(item => item.id === id);
  if(!record?.state){
    setWorkflowMessage("record-status", "That saved record could not be opened.", "status-warn");
    return;
  }
  selectedRecordId = id;
  currentCloudRecordId = id;
  packageRecordIds = [];
  openForm(record.form || "standard", true);
  restoreFormState(record.state);
  renderSavedRecords();
  setWorkflowMessage("record-status", `Loaded ${getRecordLabel(record)} from cloud records.`, "status-ok");
}

function loadSelectedRecord(){
  if(!selectedRecordId){
    setWorkflowMessage("record-status", "Select a saved record first.", "status-warn");
    return;
  }
  openCloudRecord(selectedRecordId);
}

async function deleteCloudRecord(id){
  if(!firebaseReady || !db || !authUser){
    setWorkflowMessage("record-status", "Sign in first to manage cloud records.", "status-warn");
    return;
  }
  const record = cloudRecordsCache.find(item => item.id === id);
  if(!record){
    setWorkflowMessage("record-status", "That saved record no longer exists.", "status-warn");
    return;
  }
  try{
    await withCloudTimeout(db.collection("users").doc(authUser.uid).collection("records").doc(id).delete(), 12000);
    if(selectedRecordId === id) selectedRecordId = "";
    if(currentCloudRecordId === id) currentCloudRecordId = "";
    await refreshCloudRecords();
    setWorkflowMessage("record-status", `Deleted ${getRecordLabel(record)} from cloud records.`, "status-ok");
  }catch(error){
    setWorkflowMessage("record-status", getCloudErrorMessage(error, "Record could not be deleted right now."), "status-warn");
  }
}

function deleteSelectedRecord(){
  if(!selectedRecordId){
    setWorkflowMessage("record-status", "Select a saved record first.", "status-warn");
    return;
  }
  deleteCloudRecord(selectedRecordId);
}

function updateQuickFillStatus(){
  if(!document.getElementById("quick-fill-status")) return;
  if(!authUser){
    setWorkflowMessage("quick-fill-status", "Sign in to search your saved records for patients and doctors.", "status-warn");
    return;
  }
  if(!cloudRecordsCache.length){
    setWorkflowMessage("quick-fill-status", "No saved records yet. Save one form first, then you can search and reuse those patient and doctor details.", "status-warn");
    return;
  }
  setWorkflowMessage("quick-fill-status", `Search ${cloudRecordsCache.length} saved record${cloudRecordsCache.length === 1 ? "" : "s"} for patient or physician details.`, "status-ok");
}

function getRecordLookupConfig(mode){
  if(mode === "doctor"){
    return {
      title: "Find Doctor",
      text: "Search through saved records by physician name, NPI, fax, or phone, then reuse that doctor on the current form.",
      placeholder: "Search by physician name, NPI, fax, or phone",
      empty: "No physician matches were found in saved records.",
      action: "Use Doctor"
    };
  }
  if(mode === "record"){
    return {
      title: "Use Saved Record",
      text: "Search saved records and pull both patient and physician details into the form you are working on now. Order lines stay untouched.",
      placeholder: "Search by patient, doctor, DOB, NPI, or form type",
      empty: "No saved records matched that search.",
      action: "Use Patient + Doctor"
    };
  }
  return {
    title: "Find Patient",
    text: "Search through saved records by patient name, DOB, phone, or insurance ID, then reuse that patient on the current form.",
    placeholder: "Search by patient name, DOB, phone, or insurance ID",
    empty: "No patient matches were found in saved records.",
    action: "Use Patient"
  };
}

function getLookupFieldValue(fields, id){
  const value = fields?.[id];
  if(value === true) return true;
  if(value === false) return false;
  return String(value || "").trim();
}

function normalizeLookupText(value){
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function buildLookupDigits(){
  return Array.from(arguments).map(value => String(value || "").replace(/\D/g, "")).filter(Boolean).join(" ");
}

function buildLookupSearchText(){
  return Array.from(arguments).map(value => String(value || "").toLowerCase().trim()).filter(Boolean).join(" ");
}

function extractPatientProfileFromRecord(record){
  const fields = record?.state?.fields || {};
  const sourceForm = record?.state?.form || record?.form || "";
  const isOxygenSource = sourceForm === "oxygen";
  const name = isOxygenSource ? getLookupFieldValue(fields, "oxy-pat-name") : (getLookupFieldValue(fields, "patient_name") || String(record?.patientName || "").trim());
  const dob = isOxygenSource ? getLookupFieldValue(fields, "oxy-dob") : (getLookupFieldValue(fields, "dob") || String(record?.patientDob || "").trim());
  const address = isOxygenSource ? getLookupFieldValue(fields, "oxy-address") : getLookupFieldValue(fields, "pat_addr");
  const phone = isOxygenSource ? getLookupFieldValue(fields, "oxy-phone") : getLookupFieldValue(fields, "phone");
  const mobile = isOxygenSource ? getLookupFieldValue(fields, "oxy-mobile") : "";
  const insurance = isOxygenSource ? "" : getLookupFieldValue(fields, "insurance");
  const insuranceId = isOxygenSource ? "" : getLookupFieldValue(fields, "insurance_id");
  const height = isOxygenSource ? "" : getLookupFieldValue(fields, "height");
  const weight = isOxygenSource ? "" : getLookupFieldValue(fields, "weight");
  const genderMale = isOxygenSource ? !!fields["oxy-gender-m"] : false;
  const genderFemale = isOxygenSource ? !!fields["oxy-gender-f"] : false;
  if(!name && !dob && !phone && !insuranceId) return null;
  const normalizedName = normalizeLookupText(name);
  const normalizedDob = normalizeDob(dob);
  const normalizedInsuranceId = normalizeLookupText(insuranceId);
  const normalizedPhone = buildLookupDigits(phone, mobile);
  const dedupeKey = [normalizedName, normalizedDob, normalizedInsuranceId, normalizedPhone].some(Boolean)
    ? [normalizedName, normalizedDob, normalizedInsuranceId, normalizedPhone].join("|")
    : `patient:${record.id}`;
  return {
    kind: "patient",
    recordId: record.id,
    recordLabel: getRecordLabel(record),
    sourceForm,
    savedAt: record.savedAtMs || record.savedAt || 0,
    name,
    dob,
    address,
    phone,
    mobile,
    insurance,
    insuranceId,
    height,
    weight,
    genderMale,
    genderFemale,
    dedupeKey,
    searchBlob: buildLookupSearchText(name, dob, address, phone, mobile, insurance, insuranceId, record.form, record.patientName),
    digitsBlob: buildLookupDigits(dob, phone, mobile, insuranceId)
  };
}

function extractPhysicianProfileFromRecord(record){
  const fields = record?.state?.fields || {};
  const sourceForm = record?.state?.form || record?.form || "";
  const isOxygenSource = sourceForm === "oxygen";
  const npi = isOxygenSource ? getLookupFieldValue(fields, "oxy-npi-search") : getLookupFieldValue(fields, "npi_input");
  const lic = isOxygenSource ? getLookupFieldValue(fields, "oxy-lic-num") : getLookupFieldValue(fields, "lic_num");
  const name = isOxygenSource ? getLookupFieldValue(fields, "oxy-phys-name") : getLookupFieldValue(fields, "phys_name");
  const type = isOxygenSource ? getLookupFieldValue(fields, "oxy-phys-type") : getLookupFieldValue(fields, "phys_type");
  const phone = isOxygenSource ? getLookupFieldValue(fields, "oxy-phys-phone") : getLookupFieldValue(fields, "phys_phone");
  const fax = isOxygenSource ? getLookupFieldValue(fields, "oxy-phys-fax") : getLookupFieldValue(fields, "phys_fax");
  const address = isOxygenSource ? getLookupFieldValue(fields, "oxy-phys-addr") : getLookupFieldValue(fields, "phys_addr");
  if(!name && !npi && !phone && !fax) return null;
  const normalizedName = normalizeLookupText(name);
  const normalizedNpi = normalizeLookupText(npi);
  const normalizedFax = buildLookupDigits(fax);
  const normalizedPhone = buildLookupDigits(phone);
  const dedupeKey = [normalizedNpi || normalizedName, normalizedFax, normalizedPhone].some(Boolean)
    ? [normalizedNpi || normalizedName, normalizedFax, normalizedPhone].join("|")
    : `doctor:${record.id}`;
  return {
    kind: "doctor",
    recordId: record.id,
    recordLabel: getRecordLabel(record),
    sourceForm,
    savedAt: record.savedAtMs || record.savedAt || 0,
    npi,
    lic,
    name,
    type,
    phone,
    fax,
    address,
    dedupeKey,
    searchBlob: buildLookupSearchText(name, npi, lic, type, phone, fax, address, record.form),
    digitsBlob: buildLookupDigits(npi, phone, fax)
  };
}

function dedupeLookupProfiles(items){
  const map = new Map();
  items.forEach(item => {
    if(!item) return;
    const existing = map.get(item.dedupeKey);
    const existingScore = getLookupProfileScore(existing);
    const nextScore = getLookupProfileScore(item);
    if(!existing || nextScore > existingScore || (nextScore === existingScore && Number(item.savedAt || 0) > Number(existing.savedAt || 0))){
      map.set(item.dedupeKey, item);
    }
  });
  return Array.from(map.values()).sort((a,b) => Number(b.savedAt || 0) - Number(a.savedAt || 0));
}

function getLookupProfileScore(item){
  if(!item) return 0;
  if(item.kind === "doctor"){
    return [item.npi, item.lic, item.name, item.type, item.phone, item.fax, item.address].filter(Boolean).length;
  }
  return [item.name, item.dob, item.address, item.phone, item.mobile, item.insurance, item.insuranceId, item.height, item.weight, item.genderMale, item.genderFemale].filter(Boolean).length;
}

function getRecordLookupResults(mode, query){
  const search = normalizeLookupText(query);
  const digits = String(query || "").replace(/\D/g, "");
  if(mode === "doctor"){
    return dedupeLookupProfiles(cloudRecordsCache.map(extractPhysicianProfileFromRecord)).filter(item => {
      if(!search) return true;
      return item.searchBlob.includes(search) || (digits && item.digitsBlob.includes(digits));
    });
  }
  if(mode === "record"){
    return cloudRecordsCache.map(record => {
      const patient = extractPatientProfileFromRecord(record);
      const physician = extractPhysicianProfileFromRecord(record);
      return {
        kind: "record",
        recordId: record.id,
        record,
        patient,
        physician,
        sourceForm: record.form || record.state?.form || "",
        savedAt: record.savedAtMs || record.savedAt || 0,
        title: getRecordLabel(record),
        searchBlob: buildLookupSearchText(
          record.patientName,
          record.patientDob,
          record.form,
          patient?.name,
          patient?.dob,
          patient?.phone,
          patient?.insurance,
          patient?.insuranceId,
          physician?.name,
          physician?.npi,
          physician?.phone,
          physician?.fax
        ),
        digitsBlob: buildLookupDigits(
          record.patientDob,
          patient?.phone,
          patient?.insuranceId,
          physician?.npi,
          physician?.phone,
          physician?.fax
        )
      };
    }).filter(item => {
      if(!search) return true;
      return item.searchBlob.includes(search) || (digits && item.digitsBlob.includes(digits));
    }).sort((a,b) => Number(b.savedAt || 0) - Number(a.savedAt || 0));
  }
  return dedupeLookupProfiles(cloudRecordsCache.map(extractPatientProfileFromRecord)).filter(item => {
    if(!search) return true;
    return item.searchBlob.includes(search) || (digits && item.digitsBlob.includes(digits));
  });
}

function setRecordLookupStatus(message, className){
  const el = document.getElementById("record-lookup-status");
  if(!el) return;
  el.textContent = message;
  el.className = `lookup-status${className ? ` ${className}` : ""}`;
}

function renderRecordLookupResults(){
  const wrap = document.getElementById("record-lookup-results");
  if(!wrap) return;
  const cfg = getRecordLookupConfig(recordLookupMode);
  if(!authUser){
    recordLookupResultsCache = [];
    setRecordLookupStatus("Sign in to search saved records.", "status-warn");
    wrap.innerHTML = `<div class="lookup-empty">Saved patient and doctor lookups work from your cloud records, so sign in first to use this tool.</div>`;
    return;
  }
  if(!cloudRecordsCache.length){
    recordLookupResultsCache = [];
    setRecordLookupStatus("No saved records are available yet.", "status-warn");
    wrap.innerHTML = `<div class="lookup-empty">Save one record first, then this search will let you reuse that patient and physician on other forms.</div>`;
    return;
  }
  const query = document.getElementById("record-lookup-search")?.value || "";
  const items = getRecordLookupResults(recordLookupMode, query).slice(0, 24);
  recordLookupResultsCache = items;
  if(!items.length){
    setRecordLookupStatus(cfg.empty, "status-warn");
    wrap.innerHTML = `<div class="lookup-empty">${esc(cfg.empty)}</div>`;
    return;
  }
  setRecordLookupStatus(`${items.length} match${items.length === 1 ? "" : "es"} found${query ? " for that search" : " in recent saved records"}.`, "status-ok");
  wrap.innerHTML = items.map((item, index) => {
    if(recordLookupMode === "doctor"){
      const meta = [
        item.npi ? `NPI: ${item.npi}` : "",
        item.phone ? `Phone: ${item.phone}` : "",
        item.fax ? `Fax: ${item.fax}` : "",
        item.type ? `Specialty: ${item.type}` : "",
        item.address ? `Address: ${item.address}` : "",
        `Saved: ${formatTimestamp(item.savedAt)}`,
        `From: ${String(item.sourceForm || "").toUpperCase() || "UNKNOWN"}`
      ].filter(Boolean).join("<br/>");
      return `
        <article class="lookup-result">
          <div class="lookup-result-head">
            <div>
              <h3>${esc(item.name || item.npi || "Unnamed physician")}</h3>
              <div class="lookup-result-sub">${esc(item.recordLabel)}</div>
            </div>
            <span class="lookup-pill">${esc(String(item.sourceForm || "").toUpperCase() || "FORM")}</span>
          </div>
          <div class="lookup-result-meta">${meta}</div>
          <div class="lookup-result-actions">
            <button class="btn btn-stamp" type="button" onclick="useRecordLookupResult(${index})">${cfg.action}</button>
          </div>
        </article>
      `;
    }
    if(recordLookupMode === "record"){
      const meta = [
        item.patient?.name ? `Patient: ${item.patient.name}` : "Patient: Not saved",
        item.patient?.dob ? `DOB: ${item.patient.dob}` : "",
        item.physician?.name ? `Doctor: ${item.physician.name}` : "Doctor: Not saved",
        item.physician?.npi ? `NPI: ${item.physician.npi}` : "",
        `Saved: ${formatTimestamp(item.savedAt)}`
      ].filter(Boolean).join("<br/>");
      return `
        <article class="lookup-result">
          <div class="lookup-result-head">
            <div>
              <h3>${esc(item.title)}</h3>
              <div class="lookup-result-sub">${esc((item.physician?.name || item.patient?.dob) ? [item.patient?.dob ? `DOB ${item.patient.dob}` : "", item.physician?.name || ""].filter(Boolean).join(" • ") : "Saved record")}</div>
            </div>
            <span class="lookup-pill">${esc(String(item.sourceForm || "").toUpperCase() || "FORM")}</span>
          </div>
          <div class="lookup-result-meta">${meta}</div>
          <div class="lookup-result-actions">
            <button class="btn btn-stamp" type="button" onclick="useRecordLookupResult(${index})">${cfg.action}</button>
          </div>
        </article>
      `;
    }
    const meta = [
      item.dob ? `DOB: ${item.dob}` : "",
      item.phone ? `Phone: ${item.phone}` : "",
      item.insurance ? `Insurance: ${item.insurance}` : "",
      item.insuranceId ? `Insurance ID: ${item.insuranceId}` : "",
      item.address ? `Address: ${item.address}` : "",
      `Saved: ${formatTimestamp(item.savedAt)}`,
      `From: ${String(item.sourceForm || "").toUpperCase() || "UNKNOWN"}`
    ].filter(Boolean).join("<br/>");
    return `
      <article class="lookup-result">
        <div class="lookup-result-head">
          <div>
            <h3>${esc(item.name || "Unnamed patient")}</h3>
            <div class="lookup-result-sub">${esc(item.recordLabel)}</div>
          </div>
          <span class="lookup-pill">${esc(String(item.sourceForm || "").toUpperCase() || "FORM")}</span>
        </div>
        <div class="lookup-result-meta">${meta}</div>
        <div class="lookup-result-actions">
          <button class="btn btn-stamp" type="button" onclick="useRecordLookupResult(${index})">${cfg.action}</button>
        </div>
      </article>
    `;
  }).join("");
}

async function ensureCloudRecordsForLookup(forceRefresh){
  if(!authUser || !firebaseReady || !db){
    return false;
  }
  if(forceRefresh || !cloudRecordsCache.length){
    await refreshCloudRecords();
  }
  return true;
}

async function openRecordLookupModal(mode){
  recordLookupMode = mode || "patient";
  const cfg = getRecordLookupConfig(recordLookupMode);
  const modal = document.getElementById("record-lookup-modal");
  const search = document.getElementById("record-lookup-search");
  if(document.getElementById("record-lookup-title")) document.getElementById("record-lookup-title").textContent = cfg.title;
  if(document.getElementById("record-lookup-text")) document.getElementById("record-lookup-text").textContent = cfg.text;
  if(search){
    search.value = "";
    search.placeholder = cfg.placeholder;
  }
  modal?.classList.add("open");
  setRecordLookupStatus("Loading saved records...", "");
  await ensureCloudRecordsForLookup(false);
  renderRecordLookupResults();
  search?.focus();
}

function closeRecordLookupModal(){
  document.getElementById("record-lookup-modal")?.classList.remove("open");
}

async function refreshRecordLookupResults(){
  setRecordLookupStatus("Refreshing saved records...", "");
  await ensureCloudRecordsForLookup(true);
  renderRecordLookupResults();
}

function setFieldValue(id, value){
  const el = document.getElementById(id);
  if(!el) return;
  if(el.type === "checkbox" || el.type === "radio") el.checked = !!value;
  else el.value = value ?? "";
}

function applyPhoneFieldValue(id, value){
  setFieldValue(id, value || "");
  const el = document.getElementById(id);
  if(el && value) fmtPhone(el);
}

function fillCurrentPatientFields(profile){
  if(!profile) return false;
  if(currentForm === "oxygen"){
    setFieldValue("oxy-pat-name", profile.name || "");
    setFieldValue("oxy-dob", profile.dob || "");
    setFieldValue("oxy-address", profile.address || "");
    applyPhoneFieldValue("oxy-phone", profile.phone || "");
    applyPhoneFieldValue("oxy-mobile", profile.mobile || "");
    setFieldValue("oxy-gender-m", !!profile.genderMale);
    setFieldValue("oxy-gender-f", !!profile.genderFemale);
    return !!(profile.name || profile.dob || profile.phone || profile.address);
  }
  setFieldValue("patient_name", profile.name || "");
  setFieldValue("dob", profile.dob || "");
  setFieldValue("pat_addr", profile.address || "");
  applyPhoneFieldValue("phone", profile.phone || "");
  setFieldValue("insurance", profile.insurance || "");
  setFieldValue("insurance_id", profile.insuranceId || "");
  setFieldValue("height", profile.height || "");
  setFieldValue("weight", profile.weight || "");
  return !!(profile.name || profile.dob || profile.phone || profile.insurance);
}

function fillCurrentPhysicianFields(profile){
  if(!profile) return false;
  if(currentForm === "oxygen"){
    setFieldValue("oxy-npi-search", profile.npi || "");
    setFieldValue("oxy-lic-num", profile.lic || "");
    setFieldValue("oxy-phys-name", profile.name || "");
    setFieldValue("oxy-phys-type", profile.type || "");
    applyPhoneFieldValue("oxy-phys-phone", profile.phone || "");
    applyPhoneFieldValue("oxy-phys-fax", profile.fax || "");
    setFieldValue("oxy-phys-addr", profile.address || "");
    return !!(profile.name || profile.npi || profile.phone || profile.fax);
  }
  setFieldValue("npi_input", profile.npi || "");
  setFieldValue("lic_num", profile.lic || "");
  setFieldValue("phys_name", profile.name || "");
  setFieldValue("phys_type", profile.type || "");
  applyPhoneFieldValue("phys_phone", profile.phone || "");
  applyPhoneFieldValue("phys_fax", profile.fax || "");
  setFieldValue("phys_addr", profile.address || "");
  return !!(profile.name || profile.npi || profile.phone || profile.fax);
}

function getCurrentDoctorProfile(){
  if(currentForm === "oxygen"){
    return {
      npi: (document.getElementById("oxy-npi-search")?.value || "").trim(),
      lic: (document.getElementById("oxy-lic-num")?.value || "").trim(),
      name: (document.getElementById("oxy-phys-name")?.value || "").trim(),
      type: (document.getElementById("oxy-phys-type")?.value || "").trim(),
      phone: (document.getElementById("oxy-phys-phone")?.value || "").trim(),
      fax: (document.getElementById("oxy-phys-fax")?.value || "").trim(),
      address: (document.getElementById("oxy-phys-addr")?.value || "").trim()
    };
  }
  return {
    npi: (document.getElementById("npi_input")?.value || "").trim(),
    lic: (document.getElementById("lic_num")?.value || "").trim(),
    name: (document.getElementById("phys_name")?.value || "").trim(),
    type: (document.getElementById("phys_type")?.value || "").trim(),
    phone: (document.getElementById("phys_phone")?.value || "").trim(),
    fax: (document.getElementById("phys_fax")?.value || "").trim(),
    address: (document.getElementById("phys_addr")?.value || "").trim()
  };
}

function hasDoctorProfileValue(profile){
  return !!(profile?.name || profile?.npi || profile?.phone || profile?.fax || profile?.address);
}

function getPatientPreferenceKey(name, dob){
  const normalizedName = normalizeLookupText(name);
  const normalizedDob = normalizeDob(dob);
  if(!normalizedName || !normalizedDob) return "";
  return `${normalizedName}|${normalizedDob}`;
}

function getCurrentPatientPreferenceKey(){
  if(currentForm === "oxygen") return "";
  const name = document.getElementById("patient_name")?.value || "";
  const dob = document.getElementById("dob")?.value || "";
  return getPatientPreferenceKey(name, dob);
}

function captureCurrentFormPreferences(){
  const store = getFormPreferenceStore();
  store.forms = store.forms || {};
  store.patients = store.patients || {};

  const nextFormPref = { ...(store.forms[currentForm] || {}) };
  const subject = (document.getElementById("cover_subject")?.value || "").trim();
  if(subject) nextFormPref.coverSubject = subject;
  else delete nextFormPref.coverSubject;

  const doctorProfile = getCurrentDoctorProfile();
  if(hasDoctorProfileValue(doctorProfile)) nextFormPref.doctor = doctorProfile;
  else delete nextFormPref.doctor;

  nextFormPref.updatedAt = Date.now();
  if(Object.keys(nextFormPref).some(key => key !== "updatedAt")){
    store.forms[currentForm] = nextFormPref;
  }else{
    delete store.forms[currentForm];
  }

  if(currentForm !== "oxygen"){
    const patientKey = getCurrentPatientPreferenceKey();
    if(patientKey){
      const insurance = (document.getElementById("insurance")?.value || "").trim();
      const insuranceId = (document.getElementById("insurance_id")?.value || "").trim();
      const height = (document.getElementById("height")?.value || "").trim();
      const weight = (document.getElementById("weight")?.value || "").trim();
      if(insurance || insuranceId || height || weight){
        store.patients[patientKey] = {
          insurance,
          insuranceId,
          height,
          weight,
          updatedAt: Date.now()
        };
      }
    }
  }

  setFormPreferenceStore(store);
  return store;
}

function queuePreferenceSave(){
  clearTimeout(preferenceSaveTimer);
  preferenceSaveTimer = setTimeout(() => {
    captureCurrentFormPreferences();
  }, 180);
}

function applyFormCarryForward(formType){
  const store = getFormPreferenceStore();
  const formPref = store.forms?.[formType] || {};
  const subjectEl = document.getElementById("cover_subject");
  if(subjectEl && !String(subjectEl.value || "").trim() && formPref.coverSubject){
    subjectEl.value = formPref.coverSubject;
  }
  const doctorProfile = formPref.doctor;
  if(doctorProfile && !hasDoctorProfileValue(getCurrentDoctorProfile())){
    fillCurrentPhysicianFields(doctorProfile);
  }
  if(formType !== "oxygen") applyPatientInsuranceCarryForward();
}

function applyPatientInsuranceCarryForward(force){
  if(currentForm === "oxygen") return false;
  const patientKey = getCurrentPatientPreferenceKey();
  if(!patientKey) return false;
  const store = getFormPreferenceStore();
  const patientPref = store.patients?.[patientKey];
  if(!patientPref) return false;
  const insuranceEl = document.getElementById("insurance");
  const insuranceIdEl = document.getElementById("insurance_id");
  const heightEl = document.getElementById("height");
  const weightEl = document.getElementById("weight");
  let changed = false;
  if(insuranceEl && patientPref.insurance && (force || !String(insuranceEl.value || "").trim())){
    insuranceEl.value = patientPref.insurance;
    changed = true;
  }
  if(insuranceIdEl && patientPref.insuranceId && (force || !String(insuranceIdEl.value || "").trim())){
    insuranceIdEl.value = patientPref.insuranceId;
    changed = true;
  }
  if(heightEl && patientPref.height && (force || !String(heightEl.value || "").trim())){
    heightEl.value = patientPref.height;
    changed = true;
  }
  if(weightEl && patientPref.weight && (force || !String(weightEl.value || "").trim())){
    weightEl.value = patientPref.weight;
    changed = true;
  }
  if(changed){
    updateAllQty();
    queueAutosave();
    syncDocumentTitle();
  }
  return changed;
}

function getLinkedOpenDropForInput(inputEl){
  if(!inputEl) return null;
  return Array.from(document.querySelectorAll(".drop.open")).find(drop => drop._linkedInput === inputEl) || null;
}

function getSmartMatchScore(profile, query){
  const search = normalizeLookupText(query);
  const digits = String(query || "").replace(/\D/g, "");
  if(!search && !digits) return 0;
  let score = 0;
  const name = normalizeLookupText(profile?.name || "");
  if(search){
    if(name === search) score += 500;
    else if(name.startsWith(search)) score += 320;
    else if(name.includes(search)) score += 180;
    else if(profile?.searchBlob?.includes(search)) score += 90;
  }
  if(digits && profile?.digitsBlob?.includes(digits)) score += 140;
  score += Math.min(Number(profile?.savedAt || 0) / 100000000000, 20);
  return score;
}

function getSmartLookupProfiles(kind, query){
  const source = kind === "doctor"
    ? dedupeLookupProfiles(cloudRecordsCache.map(extractPhysicianProfileFromRecord))
    : dedupeLookupProfiles(cloudRecordsCache.map(extractPatientProfileFromRecord));
  return source
    .map(profile => ({ profile, score: getSmartMatchScore(profile, query) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.profile.savedAt || 0) - Number(a.profile.savedAt || 0))
    .map(item => item.profile)
    .slice(0, 6);
}

function renderSmartProfileSuggestions(drop, profiles, kind, inputEl){
  if(!drop) return;
  if(!profiles.length){
    drop.innerHTML = `<div class="empty-row">No saved ${kind === "doctor" ? "doctor" : "patient"} matches found.</div>`;
    positionDrop(drop, inputEl);
    drop.classList.add("open");
    return;
  }
  drop.innerHTML = "";
  profiles.forEach(profile => {
    const row = document.createElement("div");
    row.className = "di";
    const secondary = kind === "doctor"
      ? [
          profile.npi ? `NPI: ${profile.npi}` : "",
          profile.fax ? `Fax: ${profile.fax}` : "",
          profile.phone ? `Phone: ${profile.phone}` : ""
        ].filter(Boolean).join(" · ")
      : [
          profile.dob ? `DOB: ${profile.dob}` : "",
          profile.insurance ? `Insurance: ${profile.insurance}` : "",
          profile.phone ? `Phone: ${profile.phone}` : ""
        ].filter(Boolean).join(" · ");
    const source = [
      `From ${String(profile.sourceForm || "").toUpperCase() || "FORM"}`,
      formatTimestamp(profile.savedAt)
    ].filter(Boolean).join(" · ");
    row.innerHTML = `
      <span class="dn">${esc(profile.name || (kind === "doctor" ? "Saved doctor" : "Saved patient"))}</span>
      <span class="ds">${esc(secondary || profile.recordLabel || "")}</span>
      <span class="ds">${esc(source)}</span>
    `;
    row.addEventListener("mousedown", e => {
      e.preventDefault();
      if(kind === "doctor"){
        fillCurrentPhysicianFields(profile);
        setWorkflowMessage("quick-fill-status", `Loaded doctor ${profile.name || profile.npi || "profile"} from saved DWOs.`, "status-ok");
      }else{
        fillCurrentPatientFields(profile);
        applyPatientInsuranceCarryForward();
        setWorkflowMessage("quick-fill-status", `Loaded patient ${profile.name || "profile"} from saved DWOs.`, "status-ok");
      }
      closeDrop(drop);
      updateAllQty();
      queueAutosave();
      queuePreferenceSave();
      syncDocumentTitle();
      syncWorkflowPanel();
    });
    drop.appendChild(row);
  });
  positionDrop(drop, inputEl);
  drop.classList.add("open");
}

async function smartProfileSearch(inputEl, kind){
  const dropId = `${inputEl?.id || ""}_drop`;
  const drop = document.getElementById(dropId);
  if(!inputEl || !drop) return;
  const query = String(inputEl.value || "").trim();
  const digits = query.replace(/\D/g, "");
  if(query.length < 2 && digits.length < 3){
    closeDrop(drop);
    return;
  }
  clearTimeout(T[`smart-${inputEl.id}`]);
  T[`smart-${inputEl.id}`] = setTimeout(async() => {
    if(!authUser){
      drop.innerHTML = `<div class="empty-row">Sign in to search saved DWOs.</div>`;
      positionDrop(drop, inputEl);
      drop.classList.add("open");
      return;
    }
    showLoad(drop, "Searching saved DWOs...", inputEl);
    const ready = await ensureCloudRecordsForLookup(false);
    if(!ready || !cloudRecordsCache.length){
      drop.innerHTML = `<div class="empty-row">No saved DWOs available yet.</div>`;
      positionDrop(drop, inputEl);
      drop.classList.add("open");
      return;
    }
    renderSmartProfileSuggestions(drop, getSmartLookupProfiles(kind, query), kind, inputEl);
  }, 180);
}

function patientSmartSearch(inputEl){
  smartProfileSearch(inputEl, "patient");
}

function doctorSmartSearch(inputEl){
  smartProfileSearch(inputEl, "doctor");
}

function focusFieldAndSelect(el){
  if(!el || typeof el.focus !== "function") return;
  el.focus({ preventScroll:true });
  if(el.tagName === "INPUT" && el.type !== "checkbox" && el.type !== "radio" && typeof el.select === "function"){
    el.select();
  }
}

function isEditableElement(el){
  if(!el) return false;
  const tag = el.tagName;
  return el.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function isVisibleField(el){
  if(!el) return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && !!(el.offsetParent || el.getClientRects().length);
}

function selectFirstDropResultForInput(inputEl){
  const drop = getLinkedOpenDropForInput(inputEl);
  const item = drop?.querySelector(".di, .drop-row");
  if(!item) return false;
  item.dispatchEvent(new MouseEvent("mousedown", { bubbles:true, cancelable:true }));
  return true;
}

function focusNextFormField(currentEl){
  const fields = Array.from(document.querySelectorAll("#form-screen input:not([type=hidden]):not([disabled]), #form-screen select:not([disabled]), #form-screen textarea:not([disabled])"))
    .filter(el => !el.readOnly && isVisibleField(el));
  if(!fields.length) return;
  const currentIndex = fields.indexOf(currentEl);
  const next = fields[currentIndex + 1] || fields[0];
  focusFieldAndSelect(next);
}

function handleGlobalFormShortcuts(event){
  if(event.defaultPrevented) return;
  const target = event.target;
  const key = String(event.key || "");
  const lowerKey = key.toLowerCase();
  const modalSearch = document.getElementById("record-lookup-search");
  const modalOpen = document.getElementById("record-lookup-modal")?.classList.contains("open");

  if((event.ctrlKey || event.metaKey) && lowerKey === "s"){
    event.preventDefault();
    captureCurrentFormPreferences();
    saveRecordPackage();
    return;
  }
  if((event.ctrlKey || event.metaKey) && lowerKey === "p"){
    event.preventDefault();
    captureCurrentFormPreferences();
    handlePrint();
    return;
  }
  if(!event.ctrlKey && !event.metaKey && !event.altKey && key === "/" && !isEditableElement(target)){
    event.preventDefault();
    if(modalOpen){
      focusFieldAndSelect(modalSearch);
    }else{
      openRecordLookupModal("patient");
    }
    return;
  }
  if(event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && lowerKey === "p"){
    event.preventDefault();
    openRecordLookupModal("patient");
    return;
  }
  if(event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && lowerKey === "d"){
    event.preventDefault();
    openRecordLookupModal("doctor");
    return;
  }
  if(key === "Escape"){
    closeRecordLookupModal();
    document.querySelectorAll(".drop.open").forEach(closeDrop);
    return;
  }
  if(key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey) return;
  if(target?.id === "record-lookup-search" && modalOpen && recordLookupResultsCache.length){
    event.preventDefault();
    useRecordLookupResult(0);
    return;
  }
  if(!target?.closest?.("#form-screen") || target.tagName === "TEXTAREA") return;
  if(selectFirstDropResultForInput(target)) {
    event.preventDefault();
    return;
  }
  if(isEditableElement(target)){
    event.preventDefault();
    focusNextFormField(target);
  }
}

function getCurrentDateFileStamp(){
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const year = String(now.getFullYear());
  return `${month}-${day}-${year}`;
}

function syncDocumentTitle(){
  document.title = getPatientFileBase();
}

function finalizeRecordLookup(message, className){
  updateAllQty();
  queueAutosave();
  queuePreferenceSave();
  syncDocumentTitle();
  syncWorkflowPanel();
  closeRecordLookupModal();
  setWorkflowMessage("quick-fill-status", message, className || "status-ok");
}

function useRecordLookupResult(index){
  const item = recordLookupResultsCache[index];
  if(!item) return;
  if(recordLookupMode === "doctor"){
    if(!fillCurrentPhysicianFields(item)){
      setRecordLookupStatus("That saved record does not contain doctor details.", "status-warn");
      return;
    }
    finalizeRecordLookup(`Loaded doctor ${item.name || item.npi || "profile"} from saved records.`, "status-ok");
    return;
  }
  if(recordLookupMode === "record"){
    const patientApplied = fillCurrentPatientFields(item.patient);
    const physicianApplied = fillCurrentPhysicianFields(item.physician);
    if(!patientApplied && !physicianApplied){
      setRecordLookupStatus("That saved record does not contain reusable patient or doctor details.", "status-warn");
      return;
    }
    const summary = patientApplied && physicianApplied ? "patient and doctor" : (patientApplied ? "patient" : "doctor");
    finalizeRecordLookup(`Loaded ${summary} from ${item.title}.`, "status-ok");
    return;
  }
  if(!fillCurrentPatientFields(item)){
    setRecordLookupStatus("That saved record does not contain patient details.", "status-warn");
    return;
  }
  finalizeRecordLookup(`Loaded patient ${item.name || "profile"} from saved records.`, "status-ok");
}

function createCloneStateFromRecord(record, targetForm){
  const sourceState = record?.state || {};
  const sourceFormType = record?.form || sourceState.form || "standard";
  const formType = targetForm || sourceFormType;
  const patientProfile = extractPatientProfileFromRecord(record);
  const doctorProfile = extractPhysicianProfileFromRecord(record);
  const cloneState = {
    form: formType,
    fields: {
      ...buildSeedPatientFields(patientProfile, formType),
      ...buildSeedDoctorFields(doctorProfile, formType)
    },
    icdSelections: formType === "oxygen" ? {} : { ...(sourceState.icdSelections || {}) }
  };
  if(formType === sourceFormType && formType === "wheelchair" && sourceState.wcVariant) cloneState.wcVariant = sourceState.wcVariant;
  if(formType === sourceFormType && formType === "bed" && sourceState.bedVariant) cloneState.bedVariant = sourceState.bedVariant;
  return cloneState;
}

function buildSeedPatientFields(profile, targetForm){
  if(!profile) return {};
  if(targetForm === "oxygen"){
    return {
      "oxy-pat-name": profile.name || "",
      "oxy-dob": profile.dob || "",
      "oxy-address": profile.address || "",
      "oxy-phone": profile.phone || "",
      "oxy-mobile": profile.mobile || "",
      "oxy-gender-m": !!profile.genderMale,
      "oxy-gender-f": !!profile.genderFemale
    };
  }
  return {
    patient_name: profile.name || "",
    dob: profile.dob || "",
    pat_addr: profile.address || "",
    phone: profile.phone || "",
    insurance: profile.insurance || "",
    insurance_id: profile.insuranceId || "",
    height: profile.height || "",
    weight: profile.weight || ""
  };
}

function buildSeedDoctorFields(profile, targetForm){
  if(!profile) return {};
  if(targetForm === "oxygen"){
    return {
      "oxy-npi-search": profile.npi || "",
      "oxy-lic-num": profile.lic || "",
      "oxy-phys-name": profile.name || "",
      "oxy-phys-type": profile.type || "",
      "oxy-phys-phone": profile.phone || "",
      "oxy-phys-fax": profile.fax || "",
      "oxy-phys-addr": profile.address || ""
    };
  }
  return {
    npi_input: profile.npi || "",
    lic_num: profile.lic || "",
    phys_name: profile.name || "",
    phys_type: profile.type || "",
    phys_phone: profile.phone || "",
    phys_fax: profile.fax || "",
    phys_addr: profile.address || ""
  };
}

function createSeedStateFromRecord(record, targetForm, seedType){
  const formType = targetForm || record?.form || record?.state?.form || "standard";
  const normalizedSeedType = seedType === "doctor" ? "doctor" : "patient";
  const patientProfile = extractPatientProfileFromRecord(record);
  const doctorProfile = extractPhysicianProfileFromRecord(record);
  return {
    form: formType,
    fields: normalizedSeedType === "doctor"
      ? buildSeedDoctorFields(doctorProfile, formType)
      : buildSeedPatientFields(patientProfile, formType),
    icdSelections: normalizedSeedType === "patient" && formType !== "oxygen" ? { ...(record?.state?.icdSelections || {}) } : {}
  };
}

async function applyRequestedRoute(){
  if(requestedRouteApplied) return;
  if(requestedRecordId){
    if(!authUser || !db) return;
    try{
      const snap = await withCloudTimeout(
        db.collection("users").doc(authUser.uid).collection("records").doc(requestedRecordId).get(),
        12000
      );
      if(!snap.exists){
        setWorkflowMessage("record-status", "That saved record was not found.", "status-warn");
        requestedRouteApplied = true;
        finishRouteLoading();
        return;
      }
      const record = { id: snap.id, ...snap.data() };
      currentCloudRecordId = record.id;
      selectedRecordId = record.id;
      packageRecordIds = [];
      openForm(record.form || requestedFormType || "standard", true);
      restoreFormState(record.state);
      requestedRouteApplied = true;
      finishRouteLoading();
      return;
    }catch(error){
      setWorkflowMessage("record-status", getCloudErrorMessage(error, "Saved record could not be loaded right now."), "status-warn");
      finishRouteLoading();
      return;
    }
  }
  if(requestedSeedRecordId){
    if(!authUser || !db) return;
    try{
      const snap = await withCloudTimeout(
        db.collection("users").doc(authUser.uid).collection("records").doc(requestedSeedRecordId).get(),
        12000
      );
      if(!snap.exists){
        setWorkflowMessage("record-status", "That saved shortcut source was not found.", "status-warn");
        requestedRouteApplied = true;
        finishRouteLoading();
        return;
      }
      const sourceRecord = { id: snap.id, ...snap.data() };
      const targetForm = requestedFormType || sourceRecord.form || sourceRecord.state?.form || "standard";
      const seedState = createSeedStateFromRecord(sourceRecord, targetForm, requestedSeedType);
      resetCurrentFormState();
      openForm(targetForm);
      restoreFormState(seedState);
      currentCloudRecordId = "";
      selectedRecordId = "";
      setWorkflowMessage(
        "record-status",
        `Started a new ${String(targetForm).toUpperCase()} DWO with ${requestedSeedType === "doctor" ? "doctor" : "patient"} details from ${getRecordLabel(sourceRecord)}.`,
        "status-ok"
      );
      requestedRouteApplied = true;
      finishRouteLoading();
      return;
    }catch(error){
      setWorkflowMessage("record-status", getCloudErrorMessage(error, "That shortcut could not open a new DWO right now."), "status-warn");
      finishRouteLoading();
      return;
    }
  }
  if(requestedCloneId){
    if(!authUser || !db) return;
    try{
      const snap = await withCloudTimeout(
        db.collection("users").doc(authUser.uid).collection("records").doc(requestedCloneId).get(),
        12000
      );
      if(!snap.exists){
        setWorkflowMessage("record-status", "That source DWO was not found for cloning.", "status-warn");
        requestedRouteApplied = true;
        finishRouteLoading();
        return;
      }
      const sourceRecord = { id: snap.id, ...snap.data() };
      const targetForm = requestedFormType || sourceRecord.form || sourceRecord.state?.form || "standard";
      const cloneState = createCloneStateFromRecord(sourceRecord, targetForm);
      resetCurrentFormState();
      openForm(targetForm);
      restoreFormState(cloneState);
      currentCloudRecordId = "";
      selectedRecordId = "";
      setWorkflowMessage("record-status", `Started a new ${String(targetForm).toUpperCase()} DWO from ${getRecordLabel(sourceRecord)} with the same patient and doctor information.`, "status-ok");
      requestedRouteApplied = true;
      finishRouteLoading();
      return;
    }catch(error){
      setWorkflowMessage("record-status", getCloudErrorMessage(error, "That DWO could not be copied right now."), "status-warn");
      finishRouteLoading();
      return;
    }
  }
  if(requestedFormType){
    startNewForm(requestedFormType);
    requestedRouteApplied = true;
    finishRouteLoading();
  }
}

function getFormState(){
  const state = { form: currentForm, wcVariant, bedVariant, fields: {}, icdSelections: {} };
  document.querySelectorAll("#form-screen input, #form-screen select, #form-screen textarea").forEach(el => {
    if(el.closest(".no-form-state")) return;
    if(!el.id || el.type === "file") return;
    state.fields[el.id] = (el.type === "checkbox" || el.type === "radio") ? !!el.checked : el.value;
  });
  for(let i=1;i<=4;i++) state.icdSelections[`dx${i}`] = document.getElementById(`dx${i}v`)?.value || "";
  return state;
}

function applySavedFieldState(fields){
  Object.entries(fields || {}).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if(!el) return;
    if(el.type === "checkbox" || el.type === "radio") el.checked = !!value;
    else el.value = value ?? "";
  });
}

function restoreFormState(state){
  if(!state) return false;
  if(state.form && state.form !== currentForm) openForm(state.form, true);
  if(state.wcVariant && typeof setWheelchairVariant === "function") setWheelchairVariant(state.wcVariant);
  if(state.bedVariant && typeof setBedVariant === "function") setBedVariant(state.bedVariant);
  applySavedFieldState(state.fields);
  if(state.form === "hoyer" || currentForm === "hoyer"){
    syncHoyerRows();
    applySavedFieldState(state.fields);
  }
  for(let i=1;i<=4;i++){
    const code = state.icdSelections?.[`dx${i}`] || "";
    if(code) selectIcd(i, code, "");
    else clearIcd(i);
  }
  if(document.getElementById("lon-lifetime")) toggleLon();
  if(document.getElementById("bed-lon-lifetime")) toggleBedLon();
  if(document.getElementById("hoyer-lon-lifetime")) toggleHoyerLon();
  updateAllQty();
  if(state.form === "hoyer" || currentForm === "hoyer"){
    applySavedFieldState(state.fields);
    if(document.getElementById("hoyer-lon-lifetime")) toggleHoyerLon();
  }
  syncDocumentTitle();
  syncWorkflowPanel();
  return true;
}

function saveDraft(showMessage){
  const store = getDraftStore();
  store[currentForm] = { savedAt: Date.now(), state: getFormState() };
  setDraftStore(store);
  setWorkflowMessage("draft-status", `${showMessage ? "Draft saved" : "Autosaved"} ${currentForm} form ${formatTimestamp(store[currentForm].savedAt)}.`, showMessage ? "status-ok" : "");
  return store[currentForm];
}

function queueAutosave(){
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    if(document.getElementById("form-screen").style.display !== "none") saveDraft(false);
    refreshChecklist();
  }, AUTOSAVE_DELAY);
}

function loadDraft(){
  const draft = getDraftStore()[currentForm];
  if(!draft?.state){
    setWorkflowMessage("draft-status", `No saved ${currentForm} draft found yet.`, "status-warn");
    return;
  }
  restoreFormState(draft.state);
  setWorkflowMessage("draft-status", `Loaded ${currentForm} draft from ${formatTimestamp(draft.savedAt)}.`, "status-ok");
}

function exportDraft(){
  const payload = { exportedAt: new Date().toISOString(), state: getFormState() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dwo-${currentForm}-${new Date().toISOString().slice(0,19).replace(/[:T]/g,"-")}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setWorkflowMessage("draft-status", "Draft exported as JSON.", "status-ok");
}

function triggerImport(){
  document.getElementById("draft-import-input")?.click();
}

function importDraftFile(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      if(!data?.state) throw new Error("Missing state");
      restoreFormState(data.state);
      saveDraft(true);
    }catch{
      setWorkflowMessage("draft-status", "Import failed. Please choose a valid draft JSON file.", "status-warn");
    }
  };
  reader.readAsText(file);
}

function renderPresetSelect(selectId, items, placeholder){
  const select = document.getElementById(selectId);
  if(!select) return;
  select.innerHTML = `<option value="">${placeholder}</option>`;
  items.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = item.label;
    select.appendChild(opt);
  });
}

function getCurrentPatientPreset(){
  if(currentForm === "oxygen"){
    const name = (document.getElementById("oxy-pat-name")?.value || "").trim();
    const dob = (document.getElementById("oxy-dob")?.value || "").trim();
    if(!name) return null;
    return {
      id: `p_${Date.now()}`,
      label: `${name}${dob ? ` - ${dob}` : ""}`,
      fields: {
        "oxy-pat-name": name,
        "oxy-dob": dob,
        "oxy-address": document.getElementById("oxy-address")?.value || "",
        "oxy-phone": document.getElementById("oxy-phone")?.value || "",
        "oxy-mobile": document.getElementById("oxy-mobile")?.value || "",
        "oxy-gender-m": !!document.getElementById("oxy-gender-m")?.checked,
        "oxy-gender-f": !!document.getElementById("oxy-gender-f")?.checked
      }
    };
  }
  const name = (document.getElementById("patient_name")?.value || "").trim();
  const dob = (document.getElementById("dob")?.value || "").trim();
  if(!name) return null;
  return {
    id: `p_${Date.now()}`,
    label: `${name}${dob ? ` - ${dob}` : ""}`,
    fields: {
      patient_name: name,
      dob,
      pat_addr: document.getElementById("pat_addr")?.value || "",
      phone: document.getElementById("phone")?.value || "",
      insurance: document.getElementById("insurance")?.value || "",
      insurance_id: document.getElementById("insurance_id")?.value || "",
      height: document.getElementById("height")?.value || "",
      weight: document.getElementById("weight")?.value || ""
    }
  };
}

function saveCurrentPatientPreset(){
  const preset = getCurrentPatientPreset();
  if(!preset){
    setWorkflowMessage("patient-preset-status", "Add at least the patient name before saving a shortcut.", "status-warn");
    return;
  }
  const items = getPatientPresetStore().filter(item => item.label !== preset.label);
  items.unshift(preset);
  setPatientPresetStore(items);
  renderPatientPresets();
  setWorkflowMessage("patient-preset-status", `Saved ${preset.label}.`, "status-ok");
}

function applyPatientPreset(id){
  if(!id) return;
  const preset = getPatientPresetStore().find(item => item.id === id);
  if(!preset) return;
  Object.entries(preset.fields || {}).forEach(([fieldId, value]) => {
    const el = document.getElementById(fieldId);
    if(!el) return;
    if(el.type === "checkbox" || el.type === "radio") el.checked = !!value;
    else el.value = value;
  });
  updateAllQty();
  queueAutosave();
  queuePreferenceSave();
  syncDocumentTitle();
  document.getElementById("patient-preset-select").value = "";
  setWorkflowMessage("patient-preset-status", `Loaded ${preset.label}.`, "status-ok");
}

function renderPatientPresets(){
  renderPresetSelect("patient-preset-select", getPatientPresetStore(), "Load a saved patient...");
}

function getCurrentPhysicianPreset(){
  const prefix = currentForm === "oxygen" ? "oxy-" : "";
  const ids = {
    npi: prefix ? "oxy-npi-search" : "npi_input",
    lic: prefix ? "oxy-lic-num" : "lic_num",
    name: prefix ? "oxy-phys-name" : "phys_name",
    type: prefix ? "oxy-phys-type" : "phys_type",
    phone: prefix ? "oxy-phys-phone" : "phys_phone",
    fax: prefix ? "oxy-phys-fax" : "phys_fax",
    addr: prefix ? "oxy-phys-addr" : "phys_addr"
  };
  const name = (document.getElementById(ids.name)?.value || "").trim();
  const npi = (document.getElementById(ids.npi)?.value || "").trim();
  if(!name && !npi) return null;
  return {
    id: `d_${Date.now()}`,
    label: `${name || "Physician"}${npi ? ` - ${npi}` : ""}`,
    fields: {
      [ids.npi]: npi,
      [ids.lic]: document.getElementById(ids.lic)?.value || "",
      [ids.name]: name,
      [ids.type]: document.getElementById(ids.type)?.value || "",
      [ids.phone]: document.getElementById(ids.phone)?.value || "",
      [ids.fax]: document.getElementById(ids.fax)?.value || "",
      [ids.addr]: document.getElementById(ids.addr)?.value || ""
    }
  };
}

function saveCurrentPhysicianPreset(){
  const preset = getCurrentPhysicianPreset();
  if(!preset){
    setWorkflowMessage("physician-preset-status", "Add a physician name or NPI before saving a shortcut.", "status-warn");
    return;
  }
  const items = getPhysicianPresetStore().filter(item => item.label !== preset.label);
  items.unshift(preset);
  setPhysicianPresetStore(items);
  renderPhysicianPresets();
  setWorkflowMessage("physician-preset-status", `Saved ${preset.label}.`, "status-ok");
}

function applyPhysicianPreset(id){
  if(!id) return;
  const preset = getPhysicianPresetStore().find(item => item.id === id);
  if(!preset) return;
  Object.entries(preset.fields || {}).forEach(([fieldId, value]) => {
    const el = document.getElementById(fieldId);
    if(el) el.value = value;
  });
  queueAutosave();
  queuePreferenceSave();
  syncDocumentTitle();
  document.getElementById("physician-preset-select").value = "";
  setWorkflowMessage("physician-preset-status", `Loaded ${preset.label}.`, "status-ok");
}

function renderPhysicianPresets(){
  renderPresetSelect("physician-preset-select", getPhysicianPresetStore(), "Load a saved physician...");
}

function clearMissingHighlights(){
  document.querySelectorAll(".field-missing").forEach(el => el.classList.remove("field-missing"));
  document.querySelectorAll(".field-warning").forEach(el => {
    el.classList.remove("field-warning");
    el.removeAttribute("data-warning");
  });
}

function getWarningContainer(el){
  return el?.closest(".f") || el?.closest("td") || el?.closest(".workflow-card") || el?.parentElement || null;
}

function focusMissingField(item){
  const el = item?.id ? document.getElementById(item.id) : null;
  if(!el) return;
  if(typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior:"smooth", block:"center" });
  if(typeof el.focus === "function") el.focus({ preventScroll:true });
}

function hasValue(id){
  const el = document.getElementById(id);
  if(!el) return false;
  if(el.type === "checkbox" || el.type === "radio") return !!el.checked;
  return !!String(el.value || "").trim();
}

function hasNutritionMethodSelected(){
  return ["nutrition-method-oral", "nutrition-method-pump", "nutrition-method-gravity", "nutrition-method-syringes"]
    .some(id => !!document.getElementById(id)?.checked);
}

function hasCheckedInput(name){
  return !!document.querySelector(`input[name="${name}"]:checked`);
}

function hasCompressionCodeSelected(){
  return hasCheckedInput("cs-code") || (!!document.getElementById("cs-other-chk")?.checked && hasValue("cs-other-input"));
}

function hasCompressionOrderData(){
  return hasCheckedInput("cs-mmhg") && hasCheckedInput("cs-toe") && hasCheckedInput("cs-lat") && hasCompressionCodeSelected();
}

function getChecklistItems(){
  if(currentForm === "oxygen"){
    return [
      { id:"oxy-pat-name", label:"patient name" },
      { id:"oxy-dob", label:"patient DOB" },
      { id:"oxy-address", label:"patient address" },
      { id:"oxy-phone", label:"patient phone" },
      { id:"oxy-npi-search", label:"physician NPI" },
      { id:"oxy-phys-name", label:"physician name" },
      { id:"oxy-phys-phone", label:"physician phone" },
      { id:"oxy-phys-fax", label:"physician fax" },
      { id:"oxy-phys-addr", label:"physician address" },
      { id:"oxy-saturation", label:"O2 saturation" }
    ];
  }
  const items = [
    { id:"patient_name", label:"patient name" },
    { id:"dob", label:"patient DOB" },
    { id:"pat_addr", label:"patient address" },
    { id:"phone", label:"patient phone" },
    { id:"insurance", label:"insurance plan" },
    { id:"dx1v", label:"primary diagnosis" },
    { id:"npi_input", label:"physician NPI" },
    { id:"phys_name", label:"physician name" },
    { id:"phys_phone", label:"physician phone" },
    { id:"phys_fax", label:"physician fax" },
    { id:"phys_addr", label:"physician address" }
  ];
  if(currentForm === "nutrition"){
    items.push(
      { id:"nutrition-dosage", label:"dosage or concentration" },
      { id:"nutrition-frequency", label:"frequency of use" },
      { id:"nutrition-duration", label:"duration of infusion" }
    );
  }
  return items;
}

function hasOrderData(){
  if(currentForm === "standard" || currentForm === "nutrition"){
    for(let i=1;i<=10;i++) if(hasValue(`hcpcs_${i}`) || hasValue(`desc_${i}`)) return true;
    return false;
  }
  if(currentForm === "compression") return hasCompressionOrderData();
  if(currentForm === "hoyer") return getSelectedHoyerCodes().length > 0;
  if(currentForm === "oxygen") return true;
  return true;
}

function getMissingChecklistItems(){
  const missing = getChecklistItems().filter(item => !hasValue(item.id));
  if(currentForm === "nutrition" && !hasNutritionMethodSelected()){
    missing.push({ id:"nutrition-method-oral", label:"method of administration" });
  }
  if(currentForm === "compression"){
    if(!hasCheckedInput("cs-mmhg")) missing.push({ id:"cs-mmhg-15-20", label:"compression level" });
    if(!hasCheckedInput("cs-toe")) missing.push({ id:"cs-toe-closed", label:"toe type" });
    if(!hasCheckedInput("cs-lat")) missing.push({ id:"cs-lat-lt", label:"laterality" });
    if(!hasCompressionCodeSelected()) missing.push({ id:"cs-code-a6533", label:"garment code" });
  }else if(currentForm === "hoyer" && !hasOrderData()){
    missing.push({ id:"hoyer-code-e0630", label:"selected lift code" });
  }else if(!hasOrderData()){
    missing.push({ id: (currentForm === "standard" || currentForm === "nutrition") ? "hcpcs_1" : "", label: "ordered item details" });
  }
  return missing;
}

function refreshChecklist(){
  latestChecklist = getMissingChecklistItems();
  clearMissingHighlights();
  latestChecklist.forEach(item => {
    const el = item.id ? document.getElementById(item.id) : null;
    if(el){
      el.classList.add("field-missing");
      const wrap = getWarningContainer(el);
      if(wrap){
        wrap.classList.add("field-warning");
        wrap.dataset.warning = `Required: ${item.label}`;
      }
    }
  });
  if(!latestChecklist.length){
    setWorkflowMessage("checklist-status", "Ready to print. Key fields look filled in.", "status-ok");
  }else{
    const preview = latestChecklist.slice(0,4).map(item => item.label).join(", ");
    setWorkflowMessage("checklist-status", `Missing ${latestChecklist.length} item${latestChecklist.length === 1 ? "" : "s"}: ${preview}${latestChecklist.length > 4 ? ", ..." : ""}`, "status-warn");
  }
  return latestChecklist;
}

function showChecklistDetails(){
  const missing = refreshChecklist();
  if(!missing.length){
    setWorkflowMessage("checklist-status", "Ready to print. No missing checklist items were found.", "status-ok");
    return;
  }
  focusMissingField(missing[0]);
  setWorkflowMessage("checklist-status", `Finish the highlighted fields before saving or printing. First up: ${missing[0].label}.`, "status-warn");
}

function handlePrint(){
  const missing = refreshChecklist();
  if(missing.length){
    focusMissingField(missing[0]);
    setWorkflowMessage("checklist-status", `Printing is paused until the highlighted fields are filled. Start with ${missing[0].label}.`, "status-warn");
    return;
  }
  captureCurrentFormPreferences();
  setFaxMode(false);
  saveDraft(false);
  syncDocumentTitle();
  window.print();
}

function syncWorkflowPanel(){
  renderSavedRecords();
  renderDwoPackageBuilder();
  const draft = getDraftStore()[currentForm];
  setWorkflowMessage("draft-status", draft?.savedAt ? `Autosave available for ${currentForm} from ${formatTimestamp(draft.savedAt)}.` : "Autosaves locally while you type.");
  updateStaffStatus();
  updateQuickFillStatus();
  syncFaxCover();
  refreshChecklist();
}

function getPatientFullName(){
  return ((currentForm === "oxygen" ? document.getElementById("oxy-pat-name")?.value : document.getElementById("patient_name")?.value) || "").trim();
}

function getPatientFileBase(){
  const raw = getPatientFullName();
  const formLabel = FORM_FILE_LABELS[currentForm] || currentForm.toUpperCase();
  const dateStamp = getCurrentDateFileStamp();
  if(!raw) return `UNKNOWN PATIENT - ${formLabel} - ${dateStamp}`;
  let cleaned = raw.replace(/\s+/g, " ").trim();
  if(cleaned.includes(",")){
    cleaned = cleaned.split(",").map(x => x.trim()).filter(Boolean).join(" ");
  }else{
    const parts = cleaned.split(" ").filter(Boolean);
    if(parts.length > 1){
      const last = parts[parts.length - 1];
      const first = parts.slice(0, parts.length - 1).join(" ");
      cleaned = `${last} ${first}`;
    }
  }
  return `${cleaned.toUpperCase()} - ${formLabel} - ${dateStamp}`.replace(/[\\/:*?"<>|]+/g, "");
}

const FAX_TYPE_OPTIONS = [
  { key:"urgent", label:"Urgent" },
  { key:"review", label:"For Review" },
  { key:"comment", label:"Please Comment" },
  { key:"reply", label:"Please Reply" },
  { key:"recycle", label:"Please Recycle" }
];

function getSelectedFaxTypes(){
  return FAX_TYPE_OPTIONS
    .filter(option => document.getElementById(`cover_type_${option.key}`)?.checked)
    .map(option => option.key);
}

function syncFaxTypePreview(){
  const selected = getSelectedFaxTypes();
  const active = new Set(selected.length ? selected : ["review"]);
  FAX_TYPE_OPTIONS.forEach(option => {
    document.getElementById(`fax-preview-type-${option.key}`)?.classList.toggle("checked", active.has(option.key));
  });
}

function getFormDisplayLabel(form){
  return FORM_FILE_LABELS[form] || String(form || "DWO").toUpperCase();
}

function getPackageOrderSummary(record){
  const fields = record?.state?.fields || {};
  const form = record?.state?.form || record?.form || "";
  if(form === "standard" || form === "nutrition"){
    for(let i=1;i<=10;i++){
      const code = String(fields[`hcpcs_${i}`] || "").trim().toUpperCase();
      const desc = String(fields[`desc_${i}`] || "").trim();
      if(code || desc) return [code, desc].filter(Boolean).join(" ");
    }
  }
  if(form === "hoyer"){
    const selected = [
      fields["hoyer-code-e0630"] ? "E0630 Patient lift" : "",
      fields["hoyer-code-e0635"] ? "E0635 Hydraulic lift" : "",
      fields["hoyer-code-e0621"] ? "E0621 Sling" : ""
    ].filter(Boolean);
    if(selected.length) return selected.join(", ");
  }
  if(form === "compression"){
    const other = String(fields["cs-other-input"] || "").trim();
    if(other) return other;
    const code = Object.keys(fields).find(key => /^cs-code-/i.test(key) && fields[key]);
    if(code) return code.replace(/^cs-code-/i, "").toUpperCase();
  }
  if(form === "oxygen"){
    const saturation = String(fields["oxy-saturation"] || "").trim();
    return saturation ? `O2 saturation ${saturation}` : "Oxygen prescription";
  }
  return "";
}

function getPackageRecordLabel(record){
  const summary = getPackageOrderSummary(record);
  return [getFormDisplayLabel(record?.form || record?.state?.form), summary].filter(Boolean).join(" - ");
}

function normalizePackageDigits(value){
  return String(value || "").replace(/\D/g, "");
}

function getPackageCurrentRecordSnapshot(){
  const record = createRecordSnapshot();
  record.id = currentCloudRecordId || "__current_dwo__";
  record.savedAtMs = Date.now();
  return record;
}

function patientMatchesForPackage(a, b){
  if(!a || !b) return false;
  const aName = normalizeLookupText(a.name);
  const bName = normalizeLookupText(b.name);
  const aDob = normalizeDob(a.dob);
  const bDob = normalizeDob(b.dob);
  if(aName && bName && aDob && bDob) return aName === bName && aDob === bDob;
  const aInsurance = normalizeLookupText(a.insuranceId);
  const bInsurance = normalizeLookupText(b.insuranceId);
  if(aName && bName && aInsurance && bInsurance) return aName === bName && aInsurance === bInsurance;
  const aPhone = normalizePackageDigits(a.phone || a.mobile);
  const bPhone = normalizePackageDigits(b.phone || b.mobile);
  return !!(aName && bName && aName === bName && aPhone && bPhone && aPhone === bPhone);
}

function doctorMatchesForPackage(a, b){
  if(!a || !b) return false;
  const aNpi = normalizePackageDigits(a.npi);
  const bNpi = normalizePackageDigits(b.npi);
  if(aNpi && bNpi) return aNpi === bNpi;
  const aName = normalizeLookupText(a.name);
  const bName = normalizeLookupText(b.name);
  const aFax = normalizePackageDigits(a.fax);
  const bFax = normalizePackageDigits(b.fax);
  if(aName && bName && aFax && bFax) return aName === bName && aFax === bFax;
  const aPhone = normalizePackageDigits(a.phone);
  const bPhone = normalizePackageDigits(b.phone);
  return !!(aName && bName && aName === bName && aPhone && bPhone && aPhone === bPhone);
}

function recordMatchesCurrentPackage(record){
  if(!record?.state) return false;
  const currentRecordIds = Array.from(new Set([currentCloudRecordId, requestedRecordId].filter(Boolean)));
  if(record.id && currentRecordIds.includes(record.id)) return false;
  const currentRecord = getPackageCurrentRecordSnapshot();
  return patientMatchesForPackage(extractPatientProfileFromRecord(currentRecord), extractPatientProfileFromRecord(record))
    && doctorMatchesForPackage(extractPhysicianProfileFromRecord(currentRecord), extractPhysicianProfileFromRecord(record));
}

function getEligiblePackageRecords(){
  return cloudRecordsCache
    .filter(recordMatchesCurrentPackage)
    .sort((a,b) => Number(b.savedAtMs || b.savedAt || 0) - Number(a.savedAtMs || a.savedAt || 0));
}

function getSelectedPackageRecords(){
  const byId = new Map(cloudRecordsCache.map(record => [record.id, record]));
  return packageRecordIds.map(id => byId.get(id)).filter(Boolean).filter(recordMatchesCurrentPackage);
}

function renderDwoPackageBuilder(){
  if(packageRenderingInProgress) return;
  const list = document.getElementById("package-list");
  const select = document.getElementById("package-dwo-select");
  const status = document.getElementById("package-status");
  if(!list || !select || !status) return;
  const eligible = getEligiblePackageRecords();
  const eligibleIds = new Set(eligible.map(record => record.id));
  packageRecordIds = packageRecordIds.filter(id => eligibleIds.has(id));
  const selectedIds = new Set(packageRecordIds);
  const selected = getSelectedPackageRecords();
  list.innerHTML = selected.map(record => `
    <div class="package-item">
      <div>
        <strong>${esc(getRecordLabel(record))}</strong>
        <span>${esc(getPackageRecordLabel(record))} - ${esc(formatTimestamp(record.savedAtMs || record.savedAt))}</span>
      </div>
      <button class="package-remove" type="button" aria-label="Remove ${esc(getRecordLabel(record))}" onclick="removeDwoPackageRecord('${record.id}')">x</button>
    </div>
  `).join("");
  select.innerHTML = `<option value="">Add another saved DWO...</option>` + eligible
    .filter(record => !selectedIds.has(record.id))
    .map(record => `<option value="${esc(record.id)}">${esc(getPackageRecordLabel(record))} - ${esc(getRecordLabel(record))} - ${esc(formatTimestamp(record.savedAtMs || record.savedAt))}</option>`)
    .join("");
  select.disabled = !authUser || !eligible.some(record => !selectedIds.has(record.id));
  const totalForms = selected.length + 1;
  if(selected.length){
    status.textContent = `Full package enabled: cover sheet plus ${totalForms} DWO pages for this patient and doctor.`;
    status.className = "workflow-note status-ok";
  }else if(!authUser){
    status.textContent = "Sign in and save records to add other DWO types to this fax package.";
    status.className = "workflow-note status-warn";
  }else if(!eligible.length){
    status.textContent = "Default: this package includes only the current DWO. Matching saved DWOs for the same patient and doctor will appear here.";
    status.className = "workflow-note";
  }else{
    status.textContent = "Default: current DWO only. Add a matching saved DWO to make a full package.";
    status.className = "workflow-note";
  }
}

function addDwoPackageRecord(id){
  if(!id || packageRecordIds.includes(id)) return;
  const record = cloudRecordsCache.find(item => item.id === id);
  if(!record || !recordMatchesCurrentPackage(record)){
    setWorkflowMessage("package-status", "Only saved DWOs for the same patient and ordering doctor can be added.", "status-warn");
    renderDwoPackageBuilder();
    return;
  }
  packageRecordIds.push(id);
  renderDwoPackageBuilder();
  syncFaxCover();
}

function removeDwoPackageRecord(id){
  packageRecordIds = packageRecordIds.filter(item => item !== id);
  renderDwoPackageBuilder();
  syncFaxCover();
}

function clearDwoPackage(){
  packageRecordIds = [];
  renderDwoPackageBuilder();
  syncFaxCover();
}

function syncFaxCover(){
  const staff = getStaffProfile();
  const staffName = getStaffDisplayName(staff);
  const staffLine = staff?.extension ? `Ext ${staff.extension}` : "";
  const toName = (document.getElementById("cover_to_name")?.value || document.getElementById(currentForm === "oxygen" ? "oxy-phys-name" : "phys_name")?.value || "").trim();
  const toFax = (document.getElementById("cover_to_fax")?.value || document.getElementById(currentForm === "oxygen" ? "oxy-phys-fax" : "phys_fax")?.value || "").trim();
  const attn = (document.getElementById("cover_attn")?.value || "").trim();
  const subject = (document.getElementById("cover_subject")?.value || `${document.getElementById("form-title-display")?.textContent || "DWO Form"} Signature Request`).trim();
  const notes = (document.getElementById("cover_notes")?.value || "").trim();
  const patient = getPatientFullName();
  const set = (id, value) => {
    const el = document.getElementById(id);
    if(el) el.textContent = value || " ";
  };
  set("fax-preview-to-name", toName);
  set("fax-preview-to-fax", toFax);
  set("fax-preview-attn", attn);
  set("fax-preview-date", new Date().toLocaleDateString());
  set("fax-preview-patient", patient);
  const dwoPageCount = Math.max(1, Number(faxPackagePageCountOverride) || (getSelectedPackageRecords().length + 1));
  set("fax-preview-pages", `${dwoPageCount + 1} total (cover + ${dwoPageCount} DWO page${dwoPageCount === 1 ? "" : "s"})`);
  set("fax-preview-subject", subject);
  set("fax-preview-notes", notes || "Please sign and return the attached DWO form.");
  syncFaxTypePreview();
  const fromEl = document.getElementById("fax-preview-from");
  if(fromEl){
    const topLine = staff?.accountName || authUser?.email || "Better Life Medical";
    const secondLine = staffName || "Better Life Team";
    fromEl.textContent = [
      topLine,
      secondLine,
      `Ph ${OFFICE_PHONE}`,
      `Fx ${OFFICE_FAX}`,
      staffLine || ""
    ].filter(Boolean).join("\n");
  }
  const faxBaseMessage = toFax
    ? `Fax package ready for ${toName || "doctor office"} at ${toFax}.`
    : "Use fax package print for a cover sheet plus the A4 form.";
  const faxTypeHint = getSelectedFaxTypes().length ? "" : " Fax type will default to For Review.";
  setWorkflowMessage("fax-status", `${faxBaseMessage}${faxTypeHint}`);
}

function setFaxMode(enabled){
  document.body.classList.toggle("fax-cover-enabled", !!enabled);
  syncFaxCover();
}

function handleFaxPrint(){
  const missing = refreshChecklist();
  if(missing.length){
    focusMissingField(missing[0]);
    setWorkflowMessage("checklist-status", `Fax printing is paused until the highlighted fields are filled. Start with ${missing[0].label}.`, "status-warn");
    return;
  }
  if(getSelectedPackageRecords().length){
    handleMultiDwoFaxPrint();
    return;
  }
  captureCurrentFormPreferences();
  syncFaxCover();
  setFaxMode(true);
  syncDocumentTitle();
  window.print();
}

function markPaperAsPackagePage(html){
  return String(html || "").replace('class="paper"', 'class="paper fax-package-paper"');
}

function serializeLiveFormNode(node){
  if(!node) return "";
  const clone = node.cloneNode(true);
  const sourceControls = node.querySelectorAll("input, textarea, select");
  const cloneControls = clone.querySelectorAll("input, textarea, select");
  sourceControls.forEach((source, index) => {
    const target = cloneControls[index];
    if(!target) return;
    const tag = source.tagName;
    if(tag === "TEXTAREA"){
      target.textContent = source.value || "";
      return;
    }
    if(tag === "SELECT"){
      Array.from(target.options).forEach((option, optionIndex) => {
        if(source.options[optionIndex]?.selected) option.setAttribute("selected", "selected");
        else option.removeAttribute("selected");
      });
      return;
    }
    if(source.type === "checkbox" || source.type === "radio"){
      if(source.checked) target.setAttribute("checked", "checked");
      else target.removeAttribute("checked");
      return;
    }
    if(source.type !== "file"){
      target.setAttribute("value", source.value || "");
    }
  });
  return clone.outerHTML;
}

function renderPaperHtmlForPackageRecord(record){
  if(!record?.state) return "";
  restoreFormState(record.state);
  syncDocumentTitle();
  return markPaperAsPackagePage(serializeLiveFormNode(document.querySelector(".paper")));
}

function getFormStylesheetMarkup(){
  const fontHref = FORM_FONT_HREF.replace(/&/g, "&amp;");
  const cssHref = new URL("form.css", window.location.href).href;
  return `<link rel="stylesheet" href="${fontHref}"/><link rel="stylesheet" href="${cssHref}"/>`;
}

function buildMultiDwoPackageHtml(packageRecords){
  const originalState = getFormState();
  const originalForm = currentForm;
  const originalCloudRecordId = currentCloudRecordId;
  const originalSelectedRecordId = selectedRecordId;
  let paperHtml = "";
  try{
    packageRenderingInProgress = true;
    paperHtml = packageRecords.map(renderPaperHtmlForPackageRecord).filter(Boolean).join("");
  }finally{
    packageRenderingInProgress = false;
    openForm(originalForm, true);
    restoreFormState(originalState);
    currentCloudRecordId = originalCloudRecordId;
    selectedRecordId = originalSelectedRecordId;
    renderSavedRecords();
    renderDwoPackageBuilder();
    syncDocumentTitle();
  }
  faxPackagePageCountOverride = Math.max(1, packageRecords.length);
  syncFaxCover();
  setFaxMode(true);
  const stylesheetMarkup = getFormStylesheetMarkup();
  const coverHtml = serializeLiveFormNode(document.querySelector(".fax-cover-wrap"));
  const packageStyle = `
    @media print{
      .fax-cover-wrap{break-after:page;page-break-after:always}
      .fax-package-paper + .fax-package-paper{break-before:page;page-break-before:always}
    }
    @media screen{
      .fax-package-paper{margin-bottom:24px}
    }
  `;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${getPatientFileBase()} PACKAGE</title>${stylesheetMarkup}<style>${packageStyle}</style></head><body class="fax-cover-enabled">${coverHtml}${paperHtml}</body></html>`;
}

function handleMultiDwoFaxPrint(){
  const savedPackageRecords = getSelectedPackageRecords();
  if(!savedPackageRecords.length){
    renderDwoPackageBuilder();
    syncFaxCover();
    return;
  }
  captureCurrentFormPreferences();
  const packageRecords = [getPackageCurrentRecordSnapshot(), ...savedPackageRecords];
  const printWindow = window.open("", "_blank");
  if(!printWindow){
    setWorkflowMessage("fax-status", "The full package print window was blocked. Allow pop-ups for this site and try again.", "status-warn");
    return;
  }
  const html = buildMultiDwoPackageHtml(packageRecords);
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  faxPackagePageCountOverride = 0;
  setFaxMode(false);
  setWorkflowMessage("fax-status", `Full package ready: cover sheet plus ${packageRecords.length} DWO pages.`, "status-ok");
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 300);
}

function buildStandalonePackageHtml(includeFaxCover){
  syncFaxCover();
  const stylesheetMarkup = getFormStylesheetMarkup();
  const coverHtml = includeFaxCover ? document.querySelector(".fax-cover-wrap")?.outerHTML || "" : "";
  const paperHtml = document.querySelector(".paper")?.outerHTML || "";
  const bodyClass = includeFaxCover ? "fax-cover-enabled" : "";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${getPatientFileBase()}</title>${stylesheetMarkup}</head><body class="${bodyClass}">${coverHtml}${paperHtml}</body></html>`;
}

async function saveRecordPackage(){
  if(!firebaseReady || !db || !authUser){
    setWorkflowMessage("record-status", "Sign in from the home page before saving to cloud records.", "status-warn");
    setHomeStatus("auth-status", "Sign in before saving cloud records.", "status-warn");
    return;
  }
  const missing = refreshChecklist();
  if(missing.length){
    focusMissingField(missing[0]);
    setWorkflowMessage("checklist-status", `Saving is paused until the highlighted fields are filled. Start with ${missing[0].label}.`, "status-warn");
    return;
  }
  try{
    captureCurrentFormPreferences();
    syncDocumentTitle();
    setWorkflowMessage("record-status", "Saving record to cloud...", "");
    const record = createRecordSnapshot();
    const ref = currentCloudRecordId
      ? db.collection("users").doc(authUser.uid).collection("records").doc(currentCloudRecordId)
      : db.collection("users").doc(authUser.uid).collection("records").doc();
    record.id = ref.id;
    record.savedAtMs = Date.now();
    await withCloudTimeout(ref.set({
      ...record,
      savedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true }), 12000);
    currentCloudRecordId = ref.id;
    selectedRecordId = ref.id;
    await refreshCloudRecords();
    setWorkflowMessage("record-status", `Saved ${getRecordLabel(record)} to cloud records.`, "status-ok");
    setRecordsPageStatus(`${getRecordLabel(record)} is saved and searchable in cloud records.`, "status-ok");
  }catch(error){
    setWorkflowMessage("record-status", getCloudErrorMessage(error, "Cloud save failed. Please check your connection and try again."), "status-warn");
  }
}

// Update all rows when insurance changes вЂ” handled by combined version above

// Move all .drop elements to <body> so they are NEVER clipped by any parent
// This is the only reliable way to ensure they always appear on top
document.addEventListener("DOMContentLoaded", function() {
  initThemeToggle();
  if(!requestedFormType && !requestedRecordId && !requestedCloneId && !requestedSeedRecordId){
    window.location.replace("index.html");
    return;
  }
  document.querySelectorAll(".drop").forEach(drop => {
    // Store reference to the input inside the same .ac wrapper
    const ac = drop.closest(".ac");
    const input = ac ? ac.querySelector("input:not([type=hidden])") : null;
    drop._linkedInput = input;
    document.body.appendChild(drop); // move to body
  });
  initGoogleAddressAutocompletes();
  initUSDateFields();
  loadFirebaseConfigIntoForm();
  initFirebaseApp(false);
  renderPatientPresets();
  renderPhysicianPresets();
  syncWorkflowPanel();
  renderCloudRecords();
  if((requestedFormType || requestedCloneId || requestedSeedRecordId) && !requestedRecordId){
    applyRequestedRoute();
  }
  const recordsSearch = document.getElementById("records-search");
  if(recordsSearch){
    recordsSearch.addEventListener("input", () => renderCloudRecords());
  }
  document.addEventListener("input", e => {
    if(!e.target?.id || !e.target.closest("#form-screen")) return;
    if(e.target.closest(".no-form-state")) return;
    queueAutosave();
    queuePreferenceSave();
    syncDocumentTitle();
    syncFaxCover();
    renderDwoPackageBuilder();
  });
  document.addEventListener("change", e => {
    if(!e.target?.id || !e.target.closest("#form-screen")) return;
    if(e.target.closest(".no-form-state")) return;
    queueAutosave();
    queuePreferenceSave();
    if(e.target.id === "patient_name" || e.target.id === "dob") applyPatientInsuranceCarryForward();
    syncDocumentTitle();
    syncFaxCover();
    renderDwoPackageBuilder();
  });
  const importInput = document.getElementById("draft-import-input");
  if(importInput){
    importInput.addEventListener("change", e => {
      importDraftFile(e.target.files?.[0]);
      e.target.value = "";
    });
  }
  const recordLookupSearch = document.getElementById("record-lookup-search");
  if(recordLookupSearch){
    recordLookupSearch.addEventListener("input", () => renderRecordLookupResults());
  }
  document.getElementById("record-lookup-modal")?.addEventListener("click", e => {
    if(e.target?.id === "record-lookup-modal") closeRecordLookupModal();
  });
  document.addEventListener("keydown", handleGlobalFormShortcuts);
  document.getElementById("staff-profile-modal")?.addEventListener("click", e => {
    if(e.target?.id === "staff-profile-modal") closeStaffProfileModal();
  });
  window.addEventListener("afterprint", () => setFaxMode(false));
  syncDocumentTitle();
});

// Reposition open dropdowns on scroll or resize
["scroll","resize"].forEach(evt =>
  window.addEventListener(evt, () => {
    document.querySelectorAll(".drop.open").forEach(drop => {
      if (drop._linkedInput) positionDrop(drop, drop._linkedInput);
    });
  }, true)
);





// в”Ђв”Ђ OXYGEN NPI SEARCH в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
async function oxyNpiSearch(el){
  const q = el.value.trim();
  const drop = document.getElementById("oxy-npi-drop");
  if(!drop) return;
  if(q.length < 3){ closeDrop(drop); return; }
  clearTimeout(T["oxy-npi"]);
  T["oxy-npi"] = setTimeout(async() => {
    showLoad(drop, "Searching NPI registry...", el);
    try{
      const ef = [
        "name.full",
        "provider_type",
        "addr_practice.phone",
        "addr_practice.fax",
        "addr_practice.line1",
        "addr_practice.line2",
        "addr_practice.city",
        "addr_practice.state",
        "addr_practice.zip",
        "licenses"
      ].join(",");
      const url = `https://clinicaltables.nlm.nih.gov/api/npi_idv/v3/search?terms=${encodeURIComponent(q)}&maxList=8&ef=${encodeURIComponent(ef)}&sf=NPI,name.full`;
      const r = await fetch(url);
      const d = await r.json();
      const codes = d[1]||[];
      const extra = d[2]||{};
      const names = extra["name.full"]||[];
      const types = extra["provider_type"]||[];
      const phones= extra["addr_practice.phone"]||[];
      const faxes = extra["addr_practice.fax"]||[];
      const lines1 = extra["addr_practice.line1"]||[];
      const lines2 = extra["addr_practice.line2"]||[];
      const cities= extra["addr_practice.city"]||[];
      const states= extra["addr_practice.state"]||[];
      const zips  = extra["addr_practice.zip"]||[];
      const lics  = extra["licenses"]||[];
      if(!codes.length){ drop.innerHTML=`<div class="empty-row">No results found</div>`; drop.classList.add("open"); positionDrop(drop,el); return; }
      drop.innerHTML=""; drop.classList.add("open"); positionDrop(drop,el);
      codes.forEach((npi,i)=>{
        const row = document.createElement("div");
        row.className="drop-row";
        const name = (names[i]||"").trim();
        const type = (types[i]||"").trim();
        const phone = (phones[i] || "").trim();
        const fax = (faxes[i] || "").trim();
        const line1 = (lines1[i] || "").trim();
        const line2 = (lines2[i] || "").trim();
        const city = (cities[i] || "").trim();
        const state = (states[i] || "").trim();
        const zip = (zips[i] || "").trim();
        const street = [line1, line2].filter(Boolean).join(" ");
        const addrParts = [];
        if(street) addrParts.push(street);
        if(city) addrParts.push(city);
        const stateZip = [state, zip].filter(Boolean).join(" ");
        if(stateZip) addrParts.push(stateZip);
        if(addrParts.length) addrParts.push("USA");
        const addr = addrParts.join(", ");
        let licNum = "";
        try{
          const rawLicenses = lics[i];
          const parsedLicenses = typeof rawLicenses === "string" ? JSON.parse(rawLicenses) : rawLicenses;
          if(Array.isArray(parsedLicenses) && parsedLicenses.length){
            const primary = parsedLicenses.find(item => item.primary_taxonomy === true || item.primary_taxonomy === "Y") || parsedLicenses[0];
            licNum = primary?.lic_number || primary?.number || primary?.id || "";
          }
        }catch(e){}
        row.innerHTML=`<strong>${esc(name||npi)}</strong><span style="color:#888;font-size:11px;margin-left:8px">${esc(type)}</span><span style="color:#aaa;font-size:10px;margin-left:8px">${esc(npi)}</span>`;
        row.onclick=()=>{
          el.value=npi;
          document.getElementById("oxy-phys-name").value=name.toUpperCase();
          document.getElementById("oxy-phys-type").value=(type||"").toUpperCase();
          const rawPhone=phone.replace(/\D/g,"");
          if(rawPhone.length===10) document.getElementById("oxy-phys-phone").value=`(${rawPhone.slice(0,3)}) ${rawPhone.slice(3,6)}-${rawPhone.slice(6)}`;
          else document.getElementById("oxy-phys-phone").value = phone;
          const rawFax=fax.replace(/\D/g,"");
          if(rawFax.length===10) document.getElementById("oxy-phys-fax").value=`(${rawFax.slice(0,3)}) ${rawFax.slice(3,6)}-${rawFax.slice(6)}`;
          else document.getElementById("oxy-phys-fax").value = fax;
          if(addr) document.getElementById("oxy-phys-addr").value=addr;
          if(licNum && document.getElementById("oxy-lic-num")) document.getElementById("oxy-lic-num").value=licNum.toUpperCase();
          closeDrop(drop);
        };
        drop.appendChild(row);
      });
    }catch(e){
      drop.innerHTML=`<div class="empty-row">NPI lookup unavailable</div>`;
      positionDrop(drop,el);
      drop.classList.add("open");
    }
  }, 300);
}

// Patch clearForm so every form resets fully, including checkboxes and form variants.
const _origClear = clearForm;
clearForm = function(){
  if(!confirm("Clear all fields?")) return;

  document.querySelectorAll("input:not([type=hidden]), textarea").forEach(el => {
    if(el.type === "checkbox" || el.type === "radio") el.checked = false;
    else el.value = "";
  });

  document.querySelectorAll("select").forEach(el => el.value = "");
  for(let i=1;i<=4;i++) clearIcd(i);

  if(typeof setWheelchairVariant === "function") setWheelchairVariant("standard");
  if(typeof setBedVariant === "function") setBedVariant("E0260");

  const lon = document.getElementById("lon-months");
  if(lon){ lon.disabled = false; lon.value = ""; }
  const bedLon = document.getElementById("bed-lon-months");
  if(bedLon){ bedLon.disabled = false; bedLon.value = ""; }
  const hoyerLon = document.getElementById("hoyer-lon-months");
  if(hoyerLon){ hoyerLon.disabled = false; hoyerLon.value = ""; }

  const wcLifetime = document.getElementById("lon-lifetime");
  if(wcLifetime) wcLifetime.checked = false;
  const bedLifetime = document.getElementById("bed-lon-lifetime");
  if(bedLifetime) bedLifetime.checked = false;
  const hoyerLifetime = document.getElementById("hoyer-lon-lifetime");
  if(hoyerLifetime) hoyerLifetime.checked = false;

  updateAllQty();
  clearMissingHighlights();
  queueAutosave();
  syncWorkflowPanel();
};
