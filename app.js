/* ===================== نظام الماسة للموارد البشرية (Firebase) ===================== */

let auth, db, storage;
let nationalityChart = null;

function initFirebase(){
  const cfg = window.FIREBASE_CONFIG;
  if(!cfg || cfg.apiKey.includes('ضع-API-KEY')){
    document.getElementById('configWarning').style.display = 'block';
    return false;
  }
  firebase.initializeApp(cfg);
  auth = firebase.auth();
  db = firebase.firestore();
  storage = firebase.storage();
  return true;
}

const DB = { // إعدادات محلية فقط (لا تتعلق ببيانات الموظفين) — تبقى محلية للجهاز
  get(key, fallback){ try{ const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }catch(e){ return fallback; } },
  set(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
};

/* ---------- حالة عامة ---------- */
let EMPLOYEES = [];
let TEAM = [];
let TASKS = [];
let currentFilter = { q:'', company:'', nationality:'', status:'', kpi:'' };
let activeEmployeeId = null;
let unsubscribeEmployees = null;
let unsubscribeTeam = null;
let unsubscribeTasks = null;
let unsubscribeChat = null;
let unsubscribeLoginLogs = null;
let LOGIN_LOGS = [];
let unsubscribeVehicles = null;
let VEHICLES = [];
let activeVehicleId = null;
let vehicleFilter = { q:'' };
const PLATE_EMIRATES = ['دبي','أبوظبي','الشارقة','عجمان','أم القيوين','رأس الخيمة','الفجيرة'];

const CITIES = ['أبوظبي','دبي','الشارقة','عجمان','أم القيوين','رأس الخيمة','الفجيرة','العين'];
const END_REASONS = ['استقالة','إنهاء خدمات','هروب','أخرى'];
const LEAVE_TYPES = ['سنوية','مرضية','أخرى'];

/* ---------- حساب الأيام والحالة ---------- */
function daysUntil(dateStr){
  if(!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr);
  return Math.round((d - today) / 86400000);
}

const CRITICAL_NOTES = ['هروب','مرفوض تجديد إقامة'];

const MANUAL_STATUS_OPTIONS = ['هروب','مرفوض تجديد إقامة','تحت التجديد','قيد الإلغاء','تم الإلغاء','قيد إنهاء الخدمات','تم إنهاء الخدمات','إعارة','موظف جديد','أخرى'];
const REPORT_AUTHORITIES = ['وزارة الموارد البشرية والتوطين','هيئة الهوية والجنسية والإقامة'];
const DISPUTE_AUTHORITIES = ['الشرطة','المحاكم','وزارة الموارد البشرية والتوطين','هيئة الهوية والجنسية والإقامة'];

const NATIONALITIES = [
  'الإمارات','السعودية','الكويت','قطر','البحرين','عمان','اليمن','الأردن','فلسطين','لبنان','سوريا','العراق','مصر','السودان','ليبيا','تونس','الجزائر','المغرب','موريتانيا','الصومال','جيبوتي','جزر القمر',
  'الهند','باكستان','بنغلاديش','سريلانكا','نيبال','بوتان','المالديف','أفغانستان','إيران','تركيا',
  'الفلبين','إندونيسيا','ماليزيا','تايلاند','فيتنام','ميانمار','كمبوديا','لاوس','سنغافورة','بروناي',
  'الصين','اليابان','كوريا الجنوبية','كوريا الشمالية','منغوليا','تايوان','هونغ كونغ',
  'كازاخستان','أوزبكستان','تركمانستان','طاجيكستان','قيرغيزستان','أذربيجان','أرمينيا','جورجيا',
  'إثيوبيا','إريتريا','كينيا','أوغندا','تنزانيا','رواندا','بوروندي','جنوب السودان','تشاد','النيجر','مالي','السنغال','غانا','نيجيريا','الكاميرون','ساحل العاج','غينيا','سيراليون','ليبيريا','بنين','توغو','بوركينا فاسو','غامبيا','غينيا بيساو','الرأس الأخضر',
  'جنوب أفريقيا','زيمبابوي','زامبيا','ملاوي','موزمبيق','ناميبيا','بوتسوانا','ليسوتو','إسواتيني','أنغولا','الكونغو الديمقراطية','الكونغو','الغابون','غينيا الاستوائية','مدغشقر','موريشيوس','سيشل',
  'المملكة المتحدة','أيرلندا','فرنسا','ألمانيا','إيطاليا','إسبانيا','البرتغال','هولندا','بلجيكا','لوكسمبورغ','سويسرا','النمسا','السويد','النرويج','الدنمارك','فنلندا','آيسلندا',
  'بولندا','التشيك','سلوفاكيا','المجر','رومانيا','بلغاريا','صربيا','كرواتيا','سلوفينيا','البوسنة والهرسك','الجبل الأسود','مقدونيا الشمالية','ألبانيا','اليونان','قبرص','مالطا',
  'أوكرانيا','روسيا','بيلاروسيا','مولدوفا','إستونيا','لاتفيا','ليتوانيا',
  'الولايات المتحدة','كندا','المكسيك','البرازيل','الأرجنتين','تشيلي','كولومبيا','بيرو','فنزويلا','الإكوادور','بوليفيا','باراغواي','أوروغواي','كوبا','جامايكا','هايتي','الدومينيكان','بنما','كوستاريكا','نيكاراغوا','هندوراس','السلفادور','غواتيمالا',
  'أستراليا','نيوزيلندا','فيجي','بابوا غينيا الجديدة','كيريباتي','ناورو','بالاو','جزر مارشال','ميكرونيزيا','ساموا','تونغا','توفالو','جزر سليمان','فانواتو',
  'أندورا','ليختنشتاين','موناكو','سان مارينو','الفاتيكان','كوسوفو',
  'تيمور الشرقية','ساو تومي وبرينسيبي',
  'باهاماس','بربادوس','ترينيداد وتوباغو','سانت لوسيا','غرينادا','دومينيكا','سانت فينسنت والغرينادين','سانت كيتس ونيفيس','أنتيغوا وبربودا','سورينام','غيانا','بليز',
  'غير محدد'
];

const MANUAL_STATUS_CONFIG = {
  'هروب': { key:'critical', cls:'badge-critical' },
  'مرفوض تجديد إقامة': { key:'critical', cls:'badge-critical' },
  'تحت التجديد': { key:'renewing', cls:'badge-renewing' },
  'قيد الإلغاء': { key:'cancelling', cls:'badge-soon' },
  'تم الإلغاء': { key:'cancelled', cls:'badge-critical' },
  'قيد إنهاء الخدمات': { key:'terminating', cls:'badge-soon' },
  'تم إنهاء الخدمات': { key:'terminated', cls:'badge-critical' },
  'إعارة': { key:'seconded', cls:'badge-seconded' },
  'موظف جديد': { key:'new', cls:'badge-ok' },
  'أخرى': { key:'other', cls:'badge-unknown' }
};

function getStatus(emp){
  if(emp.manualStatus && MANUAL_STATUS_CONFIG[emp.manualStatus]){
    const cfg = MANUAL_STATUS_CONFIG[emp.manualStatus];
    const label = emp.manualStatus === 'أخرى' ? (emp.manualStatusReason || 'أخرى') : emp.manualStatus;
    return { key:cfg.key, label, cls:cfg.cls };
  }
  // توافق مع البيانات القديمة المستوردة (الحالة كانت مكتوبة داخل حقل الملاحظة)
  if(emp.note && emp.note.includes('تم الكنسلة')){
    return { key:'cancelled', label:'تم الإلغاء', cls:'badge-critical' };
  }
  if(emp.note && CRITICAL_NOTES.some(n => emp.note.includes(n))){
    return { key:'critical', label: emp.note, cls:'badge-critical' };
  }
  if(emp.note && emp.note.includes('تحت التجديد')){
    return { key:'renewing', label:'تحت التجديد', cls:'badge-renewing' };
  }
  if(emp.note && emp.note.includes('إعارة')){
    return { key:'seconded', label:'إعارة', cls:'badge-seconded' };
  }
  const d = daysUntil(emp.residencyExp);
  if(d === null) return { key:'unknown', label:'غير محدد', cls:'badge-unknown' };
  if(d < 0) return { key:'expired', label:`منتهية منذ ${Math.abs(d)} يوم`, cls:'badge-expired' };
  if(d <= 60) return { key:'soon', label:`تنتهي خلال ${d} يوم`, cls:'badge-soon' };
  return { key:'ok', label:'سارية', cls:'badge-ok' };
}

// حالة عامة لأي تاريخ وثيقة (جواز/هوية/بطاقة عمل/إقامة)
function isDocIssue(dateStr){
  const d = daysUntil(dateStr);
  return d !== null && d <= 60; // منتهية أو تنتهي خلال 60 يوم
}

function fmtDate(s){
  if(!s) return '—';
  const d = new Date(s);
  if(isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2,'0');
  const month = String(d.getMonth()+1).padStart(2,'0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function fmtDateTime(ts){
  if(!ts) return null;
  const d = (ts && typeof ts.toDate === 'function') ? ts.toDate() : new Date(ts);
  if(isNaN(d.getTime())) return null;
  const day = String(d.getDate()).padStart(2,'0');
  const month = String(d.getMonth()+1).padStart(2,'0');
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  return `${day}/${month}/${year} ${hh}:${mm}`;
}

// يضيف تأكيد نصي (يوم/شهر/سنة) تحت كل حقل تاريخ داخل حاوية معيّنة، بغض النظر عن شكل عرض التقويم بالمتصفح
function attachDatePreviews(container){
  if(!container) return;
  container.querySelectorAll('input[type="date"]').forEach(inp=>{
    let preview = inp.nextElementSibling;
    if(!preview || !preview.classList.contains('date-preview')){
      preview = document.createElement('span');
      preview.className = 'date-preview';
      inp.insertAdjacentElement('afterend', preview);
    }
    const update = ()=>{ preview.textContent = inp.value ? ('المُدخل: ' + fmtDate(inp.value)) : ''; };
    update();
    inp.addEventListener('input', update);
  });
}

function daysBetween(a,b){
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function getEmployeeNumber(id){
  return 'AM-' + String(id).padStart(4,'0');
}

/* ---------- الإجازات ---------- */
function isOnLeaveToday(emp, type){
  if(!emp.leaves || !emp.leaves.length) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  return emp.leaves.some(l=>{
    if(type && l.type !== type) return false;
    const s = new Date(l.startDate), e = new Date(l.endDate);
    return s <= today && today <= e;
  });
}

function leavesOverlap(leaves, start, end, excludeId){
  const s1 = new Date(start), e1 = new Date(end);
  return (leaves||[]).some(l=>{
    if(excludeId && l.id === excludeId) return false;
    const s2 = new Date(l.startDate), e2 = new Date(l.endDate);
    return s1 <= e2 && s2 <= e1;
  });
}

/* ---------- المصادقة ---------- */
function initAuth(){
  const ok = initFirebase();
  if(!ok){ showLogin(); return; }

  auth.onAuthStateChanged(user=>{
    if(user){
      const emailEl = document.getElementById('currentUserEmail');
      if(emailEl) emailEl.textContent = user.email;
      showApp();
    } else {
      showLogin();
    }
  });

  document.getElementById('loginForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = document.getElementById('emailInput').value.trim();
    const pass = document.getElementById('passInput').value;
    const remember = document.getElementById('rememberMe').checked;
    const err = document.getElementById('loginError');
    err.style.display = 'none';
    try{
      await auth.setPersistence(remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
      await auth.signInWithEmailAndPassword(email, pass);
      logActivity('دخول', '');
    }catch(ex){
      err.textContent = translateAuthError(ex.code);
      err.style.display = 'block';
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', ()=>{
    if(auth.currentUser) logActivity('خروج', '');
    if(unsubscribeEmployees) unsubscribeEmployees();
    if(unsubscribeTeam) unsubscribeTeam();
    if(unsubscribeTasks) unsubscribeTasks();
    if(unsubscribeChat) unsubscribeChat();
    if(unsubscribeLoginLogs) unsubscribeLoginLogs();
    auth.signOut();
  });
}

function translateAuthError(code){
  const map = {
    'auth/invalid-email':'صيغة البريد الإلكتروني غير صحيحة',
    'auth/user-not-found':'لا يوجد حساب بهذا البريد',
    'auth/wrong-password':'كلمة المرور غير صحيحة',
    'auth/invalid-credential':'بيانات الدخول غير صحيحة',
    'auth/too-many-requests':'محاولات كثيرة، حاول لاحقًا',
    'auth/user-disabled':'هذا الحساب معطّل، تواصل مع مسؤول النظام'
  };
  return map[code] || ('تعذر تسجيل الدخول: ' + code);
}

function showLogin(){
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appScreen').style.display = 'none';
}
function showApp(){
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'flex';
  boot();
}

/* ---------- الإقلاع ---------- */
async function boot(){
  bindUI();
  loadSettingsIntoForm();
  await ensureSeedData();
  await ensureTeamMember();
  subscribeEmployees();
  subscribeTeam();
  subscribeTasks();
  subscribeChat();
  subscribeLoginLogs();
  subscribeVehicles();
}

function sanitizeEmailId(email){
  return email.replace(/[^a-zA-Z0-9]/g,'_');
}

async function ensureTeamMember(){
  const user = auth.currentUser;
  if(!user) return;
  const id = sanitizeEmailId(user.email);
  const ref = db.collection('team').doc(id);
  const snap = await ref.get();
  if(!snap.exists){
    await ref.set({ email:user.email, name:user.email.split('@')[0] });
  }
}

function resolveName(email){
  const m = TEAM.find(t=>t.email===email);
  return (m && m.name) || email;
}

function subscribeTeam(){
  if(unsubscribeTeam) unsubscribeTeam();
  unsubscribeTeam = db.collection('team').onSnapshot(snap=>{
    TEAM = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    populateAssigneeSelect();
    renderChatMessages();
    renderTasks();
  });
}

function populateAssigneeSelect(){
  const sel = document.getElementById('taskAssignee');
  if(!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">غير مسندة</option>' + TEAM.map(t=>`<option value="${t.email}">${t.name} (${t.email})</option>`).join('');
  sel.value = cur;
}

async function ensureSeedData(){
  const snap = await db.collection('employees').limit(1).get();
  if(!snap.empty) return;
  setSyncStatus('· جاري تحميل البيانات الأولية...');
  const batchArr = [];
  let batch = db.batch();
  EMPLOYEES_SEED.forEach((emp, i)=>{
    const ref = db.collection('employees').doc(String(emp.id));
    batch.set(ref, emp);
    if((i+1) % 400 === 0){ batchArr.push(batch); batch = db.batch(); }
  });
  batchArr.push(batch);
  for(const b of batchArr){ await b.commit(); }
}

function subscribeEmployees(){
  setSyncStatus('· جاري الاتصال...');
  if(unsubscribeEmployees) unsubscribeEmployees();
  unsubscribeEmployees = db.collection('employees').onSnapshot(snapshot=>{
    EMPLOYEES = snapshot.docs.map(d=>({ id: parseInt(d.id), ...d.data() }))
      .sort((a,b)=>a.id-b.id);
    renderKPIs();
    renderNationalityChart();
    populateFilters();
    renderTable();
    setSyncStatus('· متصل ومتزامن مع الفريق ✓');
  }, err=>{
    console.error(err);
    setSyncStatus('· تعذّر الاتصال بقاعدة البيانات');
  });
}

function setSyncStatus(text){
  const el = document.getElementById('syncStatus');
  if(el) el.textContent = text;
}

/* ---------- واجهة KPI ---------- */
function renderKPIs(){
  const total = EMPLOYEES.length;
  let passport=0, eid=0, workCard=0, residency=0, license=0, annual=0, sick=0, present=0, newEmp=0, cancelling=0, terminated=0, cancelledOnly=0, absconding=0, renewalRejected=0, laborDispute=0, unauthorizedAbsence=0, currentActive=0;
  EMPLOYEES.forEach(e=>{
    if(isDocIssue(e.passportExp)) passport++;
    if(isDocIssue(e.emiratesIdExp)) eid++;
    if(isDocIssue(e.workCardExp)) workCard++;
    if(isDocIssue(e.residencyExp)) residency++;
    if(isDocIssue(e.licenseExp)) license++;
    if(isOnLeaveToday(e,'سنوية')) annual++;
    if(isOnLeaveToday(e,'مرضية')) sick++;
    if(!isExcludedFromPresent(e)) present++;
    const sKey = getStatus(e).key;
    if(sKey === 'new') newEmp++;
    if(sKey === 'cancelling' || sKey === 'terminating') cancelling++;
    if(sKey === 'cancelled' || sKey === 'terminated') terminated++;
    if(sKey === 'cancelled') cancelledOnly++;
    if(!['cancelled','terminated'].includes(sKey)) currentActive++;
    if(hasStatusValue(e,'هروب')) absconding++;
    if(hasStatusValue(e,'مرفوض تجديد إقامة')) renewalRejected++;
    if(e.hasLaborDispute) laborDispute++;
    if(e.hasUnauthorizedAbsence) unauthorizedAbsence++;
  });
  document.getElementById('kpiTotal').textContent = total;
  document.getElementById('kpiTotalLabel').textContent = total;
  document.getElementById('kpiPassport').textContent = passport;
  document.getElementById('kpiEid').textContent = eid;
  document.getElementById('kpiWorkCard').textContent = workCard;
  document.getElementById('kpiResidency').textContent = residency;
  document.getElementById('kpiLicense').textContent = license;
  document.getElementById('kpiAnnualLeave').textContent = annual;
  document.getElementById('kpiSickLeave').textContent = sick;
  document.getElementById('kpiPresent').textContent = present;
  document.getElementById('kpiNew').textContent = newEmp;
  document.getElementById('kpiCancelling').textContent = cancelling;
  document.getElementById('kpiTerminated').textContent = terminated;
  document.getElementById('kpiCancelledOnly').textContent = cancelledOnly;
  document.getElementById('kpiAbsconding').textContent = absconding;
  document.getElementById('kpiRenewalRejected').textContent = renewalRejected;
  document.getElementById('kpiLaborDispute').textContent = laborDispute;
  document.getElementById('kpiUnauthorizedAbsence').textContent = unauthorizedAbsence;
  document.getElementById('kpiCurrentActive').textContent = currentActive;
}

/* ---------- رسم بياني حسب الجنسية ---------- */
function renderNationalityChart(){
  const canvas = document.getElementById('nationalityChart');
  if(!canvas || typeof Chart === 'undefined') return;
  const counts = {};
  EMPLOYEES.forEach(e=>{
    const n = e.nationality || 'غير محدد';
    counts[n] = (counts[n]||0) + 1;
  });
  const labels = Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);
  const data = labels.map(l=>counts[l]);
  if(nationalityChart) nationalityChart.destroy();
  nationalityChart = new Chart(canvas.getContext('2d'), {
    type:'bar',
    data:{ labels, datasets:[{ label:'عدد الموظفين', data, backgroundColor:'#d4af37' }] },
    options:{
      responsive:true,
      plugins:{ legend:{ display:false } },
      scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } } }
    }
  });
}

/* ---------- الفلاتر ---------- */
function populateFilters(){
  const companies = [...new Set(EMPLOYEES.map(e=>e.company).filter(Boolean))].sort();
  const nats = [...new Set(EMPLOYEES.map(e=>e.nationality).filter(Boolean))].sort();
  const compSel = document.getElementById('filterCompany');
  const natSel = document.getElementById('filterNationality');
  const curCompany = compSel.value, curNat = natSel.value;
  compSel.innerHTML = '<option value="">كل الشركات</option>' + companies.map(c=>`<option value="${c}">${c}</option>`).join('');
  natSel.innerHTML = '<option value="">كل الجنسيات</option>' + nats.map(n=>`<option value="${n}">${n}</option>`).join('');
  compSel.value = curCompany; natSel.value = curNat;
}

function normalizeAr(s){
  return (s||'').toString()
    .replace(/[إأآا]/g,'ا')
    .replace(/ى/g,'ي')
    .replace(/ة/g,'ه')
    .replace(/[ًٌٍَُِّْ]/g,'')
    .replace(/\s+/g,' ')
    .trim()
    .toLowerCase();
}

function hasStatusValue(emp, value){
  return emp.manualStatus === value || (emp.note && emp.note.includes(value));
}

// يحدد هل الموظف يُستبعد من مؤشر "على الدوام" (ملغي/منتهي الخدمة، هروب، إجازة، منازعة عمالية، غياب بدون عذر)
function isExcludedFromPresent(emp){
  const sKey = getStatus(emp).key;
  if(sKey === 'cancelled' || sKey === 'terminated') return true;
  if(hasStatusValue(emp,'هروب')) return true;
  if(isOnLeaveToday(emp)) return true;
  if(emp.hasLaborDispute) return true;
  if(emp.hasUnauthorizedAbsence) return true;
  return false;
}

function matchesKpi(e, kpi){
  switch(kpi){
    case 'passport': return isDocIssue(e.passportExp);
    case 'eid': return isDocIssue(e.emiratesIdExp);
    case 'workcard': return isDocIssue(e.workCardExp);
    case 'residency': return isDocIssue(e.residencyExp);
    case 'license': return isDocIssue(e.licenseExp);
    case 'annual': return isOnLeaveToday(e,'سنوية');
    case 'sick': return isOnLeaveToday(e,'مرضية');
    case 'present': return !isExcludedFromPresent(e);
    case 'new': return getStatus(e).key === 'new';
    case 'cancelling': return ['cancelling','terminating'].includes(getStatus(e).key);
    case 'terminated': return ['cancelled','terminated'].includes(getStatus(e).key);
    case 'cancelled_only': return getStatus(e).key === 'cancelled';
    case 'absconding': return hasStatusValue(e,'هروب');
    case 'renewal_rejected': return hasStatusValue(e,'مرفوض تجديد إقامة');
    case 'labor_dispute': return !!e.hasLaborDispute;
    case 'unauthorized_absence': return !!e.hasUnauthorizedAbsence;
    case 'current_active': return !['cancelled','terminated'].includes(getStatus(e).key);
    default: return true;
  }
}

function applyFilters(list){
  return list.filter(e=>{
    if(currentFilter.kpi && !matchesKpi(e, currentFilter.kpi)) return false;
    if(currentFilter.q){
      const q = normalizeAr(currentFilter.q);
      const qRaw = currentFilter.q.trim().toLowerCase();
      const matchName = normalizeAr(e.name).includes(q);
      const matchEmpNum = getEmployeeNumber(e.id).toLowerCase().includes(qRaw) || String(e.id).includes(qRaw);
      const matchPhone = (e.phone||'').toLowerCase().includes(qRaw);
      const matchEmail = (e.email||'').toLowerCase().includes(qRaw);
      const matchWorkCard = (e.workCardNumber||'').toLowerCase().includes(qRaw);
      const matchPassport = (e.passportNumber||'').toLowerCase().includes(qRaw);
      const matchEid = (e.emiratesIdNumber||'').toLowerCase().includes(qRaw);
      if(!matchName && !matchEmpNum && !matchPhone && !matchEmail && !matchWorkCard && !matchPassport && !matchEid) return false;
    }
    if(currentFilter.company && e.company !== currentFilter.company) return false;
    if(currentFilter.nationality && e.nationality !== currentFilter.nationality) return false;
    if(currentFilter.status){
      const s = getStatus(e);
      if(s.key !== currentFilter.status) return false;
    }
    return true;
  });
}

function activeLeave(emp, type){
  if(!emp.leaves || !emp.leaves.length) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  return emp.leaves.find(l=> l.type===type && new Date(l.startDate)<=today && today<=new Date(l.endDate));
}

function getColumnConfig(kpi){
  switch(kpi){
    case 'passport': return { issueLabel:'—', expLabel:'انتهاء الجواز', issue:()=>null, exp:e=>e.passportExp };
    case 'eid': return { issueLabel:'—', expLabel:'انتهاء الهوية', issue:()=>null, exp:e=>e.emiratesIdExp };
    case 'workcard': return { issueLabel:'—', expLabel:'انتهاء بطاقة العمل', issue:()=>null, exp:e=>e.workCardExp };
    case 'annual': return { issueLabel:'بداية الإجازة', expLabel:'نهاية الإجازة', issue:e=>(activeLeave(e,'سنوية')||{}).startDate, exp:e=>(activeLeave(e,'سنوية')||{}).endDate };
    case 'sick': return { issueLabel:'بداية الإجازة', expLabel:'نهاية الإجازة', issue:e=>(activeLeave(e,'مرضية')||{}).startDate, exp:e=>(activeLeave(e,'مرضية')||{}).endDate };
    default: return { issueLabel:'إصدار الإقامة', expLabel:'انتهاء الإقامة', issue:e=>e.residencyIssue, exp:e=>e.residencyExp };
  }
}

const STATUS_SEVERITY = {
  'critical':1, 'cancelled':2, 'terminated':2, 'expired':3,
  'cancelling':4, 'terminating':4, 'soon':5, 'other':6,
  'renewing':7, 'seconded':8, 'new':9, 'unknown':10, 'ok':11
};

/* ---------- الجدول ---------- */
function renderTable(){
  const col = getColumnConfig(currentFilter.kpi);
  const list = applyFilters(EMPLOYEES).slice().sort((a,b)=>{
    const ra = STATUS_SEVERITY[getStatus(a).key] ?? 99;
    const rb = STATUS_SEVERITY[getStatus(b).key] ?? 99;
    if(ra !== rb) return ra - rb;
    const da = daysUntil(col.exp(a));
    const db = daysUntil(col.exp(b));
    const va = da === null ? Infinity : da;
    const vb = db === null ? Infinity : db;
    return va - vb;
  });
  const tbody = document.getElementById('tableBody');
  document.getElementById('resultCount').textContent = `${list.length} من ${EMPLOYEES.length}`;
  document.getElementById('colIssueHeader').textContent = col.issueLabel;
  document.getElementById('colExpHeader').textContent = col.expLabel;
  if(list.length === 0){
    tbody.innerHTML = `<tr><td colspan="10" class="empty-state">لا توجد نتائج مطابقة</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map((e,idx)=>{
    const s = getStatus(e);
    const d = daysUntil(col.exp(e));
    let daysLeftText = '—';
    if(d !== null){
      daysLeftText = d < 0 ? `منتهي منذ ${Math.abs(d)} يوم` : `خلال ${d} يوم`;
    }
    return `<tr data-id="${e.id}" class="row-clickable">
      <td>${idx+1}</td>
      <td class="cell-name">${e.name}</td>
      <td>${getEmployeeNumber(e.id)}</td>
      <td>${e.nationality || '—'}</td>
      <td>${e.company || '—'}</td>
      <td>${fmtDate(col.issue(e))}</td>
      <td>${fmtDate(col.exp(e))}</td>
      <td>${daysLeftText}</td>
      <td><span class="badge ${s.cls}">${s.label}</span></td>
      <td class="cell-docs" id="docCount_${e.id}">…</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('tr[data-id]').forEach(tr=>{
    const id = parseInt(tr.dataset.id);
    tr.addEventListener('click', ()=> openEmployeeModal(id));
    db.collection('employees').doc(String(id)).collection('documents').get().then(s=>{
      const el = document.getElementById('docCount_'+id);
      if(el) el.textContent = s.size ? `📎 ${s.size}` : '—';
    }).catch(()=>{});
  });
}

/* ---------- نافذة تفاصيل/تعديل/إضافة الموظف ---------- */
function emptyEmployee(){
  return { name:'', nationality:'', company:'', workCardExp:'', workCardNumber:'', residencyIssue:'', residencyExp:'', note:'',
    manualStatus:'', manualStatusReason:'', renewalRejectedNote:'',
    abscondingDate:'', abscondingAuthorities:[],
    hasLaborDispute:false, laborDisputeDate:'', laborDisputeAuthorities:[], laborDisputeNote:'',
    hasUnauthorizedAbsence:false, unauthorizedAbsenceDate:'', unauthorizedAbsenceNote:'',
    passportExp:'', passportNumber:'', emiratesIdExp:'', emiratesIdNumber:'', phone:'', email:'', address:'', city:'', education:'', jobTitle:'',
    licenseNumber:'', licenseExp:'',
    insuranceNumber:'', insuranceCompany:'', employmentStart:'', employmentEnd:'', employmentEndReason:'',
    salaryBasic:0, salaryAllowances:0, leaves:[] };
}

function openEmployeeModal(id){
  activeEmployeeId = id;
  const isNew = (id === null);
  const emp = isNew ? emptyEmployee() : EMPLOYEES.find(e=>e.id===id);
  if(!emp) return;
  document.getElementById('modalTitle').textContent = isNew ? 'إضافة موظف جديد' : `${emp.name} — ${getEmployeeNumber(emp.id)}`;

  const lastEditText = fmtDateTime(emp.lastEditedAt);
  const lastEditHtml = (!isNew && lastEditText) ?
    `<p class="last-edit-info">آخر تعديل: <strong>${emp.lastEditedBy||'—'}</strong> — ${lastEditText}</p>` : '';

  const cityOptions = ['<option value="">—</option>'].concat(
    CITIES.map(c=>`<option value="${c}" ${emp.city===c?'selected':''}>${c}</option>`)
  ).join('');
  const endReasonOptions = ['<option value="">—</option>'].concat(
    END_REASONS.map(r=>`<option value="${r}" ${emp.employmentEndReason===r?'selected':''}>${r}</option>`)
  ).join('');

  const tenureDays = emp.employmentStart ? daysBetween(emp.employmentStart, emp.employmentEnd || new Date().toISOString().slice(0,10)) : null;
  const salaryTotal = (parseFloat(emp.salaryBasic)||0) + (parseFloat(emp.salaryAllowances)||0);

  document.getElementById('modalBody').innerHTML = `
    ${lastEditHtml}
    <h4 class="section-title">البيانات الأساسية</h4>
    <div class="modal-grid">
      <div class="field"><label class="lbl">الاسم</label><input type="text" id="editName" value="${emp.name||''}"></div>
      <div class="field"><label class="lbl">الجنسية</label>
        <select id="editNationality">
          <option value="">— اختر الجنسية —</option>
          ${(!emp.nationality || NATIONALITIES.includes(emp.nationality)) ? '' : `<option value="${emp.nationality}" selected>${emp.nationality} (قيمة سابقة)</option>`}
          ${[...NATIONALITIES].sort((a,b)=>a.localeCompare(b,'ar')).map(n=>`<option value="${n}" ${emp.nationality===n?'selected':''}>${n}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label class="lbl">الشركة</label><input type="text" id="editCompany" value="${emp.company||''}"></div>
      <div class="field"><label class="lbl">المهنة في الشركة</label><input type="text" id="editJobTitle" value="${emp.jobTitle||''}"></div>
      <div class="field"><label class="lbl">المؤهل الدراسي</label><input type="text" id="editEducation" value="${emp.education||''}"></div>
      <div class="field"><label class="lbl">ملاحظة</label><input type="text" id="editNote" value="${emp.note||''}"></div>
      <div class="field"><label class="lbl">الحالة اليدوية</label>
        <select id="editManualStatus">
          <option value="">— بدون (تُحسب تلقائيًا من التواريخ)</option>
          ${MANUAL_STATUS_OPTIONS.map(s=>`<option value="${s}" ${emp.manualStatus===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="field" id="manualStatusReasonWrap" style="${emp.manualStatus==='أخرى'?'':'display:none;'}">
        <label class="lbl">السبب (لحالة أخرى)</label>
        <input type="text" id="editManualStatusReason" value="${emp.manualStatusReason||''}">
      </div>
      <div class="field" id="renewalRejectedNoteWrap" style="${emp.manualStatus==='مرفوض تجديد إقامة'?'':'display:none;'} grid-column:1/-1;">
        <label class="lbl">ملاحظة رفض التجديد</label>
        <input type="text" id="editRenewalRejectedNote" value="${emp.renewalRejectedNote||''}">
      </div>
      <div id="abscondingWrap" style="${emp.manualStatus==='هروب'?'':'display:none;'} grid-column:1/-1;">
        <div class="modal-grid">
          <div class="field"><label class="lbl">تاريخ بلاغ الهروب</label><input type="date" id="editAbscondingDate" value="${emp.abscondingDate||''}"></div>
          <div class="field">
            <label class="lbl">جهة البلاغ</label>
            ${REPORT_AUTHORITIES.map((a,i)=>`<label style="display:flex; align-items:center; gap:6px; font-size:13px; margin-top:6px;">
              <input type="checkbox" class="abscondingAuthorityChk" value="${a}" ${(emp.abscondingAuthorities||[]).includes(a)?'checked':''}> ${a}
            </label>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <h4 class="section-title" style="margin-top:18px;">التواصل والسكن</h4>
    <div class="modal-grid">
      <div class="field"><label class="lbl">رقم التواصل</label><input type="text" id="editPhone" value="${emp.phone||''}"></div>
      <div class="field"><label class="lbl">البريد الإلكتروني</label><input type="email" id="editEmail" value="${emp.email||''}"></div>
      <div class="field"><label class="lbl">المدينة</label><select id="editCity">${cityOptions}</select></div>
      <div class="field"><label class="lbl">عنوان السكن</label><input type="text" id="editAddress" value="${emp.address||''}"></div>
    </div>

    <h4 class="section-title" style="margin-top:18px;">تواريخ الوثائق</h4>
    <div class="modal-grid">
      <div class="field"><label class="lbl">انتهاء الجواز</label><input type="date" id="editPassportExp" value="${emp.passportExp||''}"></div>
      <div class="field"><label class="lbl">رقم الجواز</label><input type="text" id="editPassportNumber" value="${emp.passportNumber||''}"></div>
      <div class="field"><label class="lbl">انتهاء الهوية</label><input type="date" id="editEidExp" value="${emp.emiratesIdExp||''}"></div>
      <div class="field"><label class="lbl">رقم الهوية</label><input type="text" id="editEidNumber" value="${emp.emiratesIdNumber||''}"></div>
      <div class="field"><label class="lbl">انتهاء بطاقة العمل</label><input type="date" id="editWorkCard" value="${emp.workCardExp||''}"></div>
      <div class="field"><label class="lbl">رقم بطاقة العمل</label><input type="text" id="editWorkCardNumber" value="${emp.workCardNumber||''}"></div>
      <div class="field"><label class="lbl">إصدار الإقامة</label><input type="date" id="editIssue" value="${emp.residencyIssue||''}"></div>
      <div class="field"><label class="lbl">انتهاء الإقامة</label><input type="date" id="editExp" value="${emp.residencyExp||''}"></div>
      <div class="field"><label class="lbl">رقم رخصة القيادة</label><input type="text" id="editLicenseNumber" value="${emp.licenseNumber||''}"></div>
      <div class="field"><label class="lbl">انتهاء رخصة القيادة</label><input type="date" id="editLicenseExp" value="${emp.licenseExp||''}"></div>
    </div>

    <h4 class="section-title" style="margin-top:18px;">التأمين الصحي</h4>
    <div class="modal-grid">
      <div class="field"><label class="lbl">رقم التأمين الصحي</label><input type="text" id="editInsuranceNumber" value="${emp.insuranceNumber||''}"></div>
      <div class="field"><label class="lbl">شركة التأمين</label><input type="text" id="editInsuranceCompany" value="${emp.insuranceCompany||''}"></div>
    </div>

    <h4 class="section-title" style="margin-top:18px;">منازعة عمالية</h4>
    <div class="modal-grid">
      <div class="field">
        <label style="display:flex; align-items:center; gap:8px; font-size:14px; font-weight:700;">
          <input type="checkbox" id="editHasLaborDispute" ${emp.hasLaborDispute ? 'checked':''}> يوجد منازعة عمالية
        </label>
      </div>
    </div>
    <div id="laborDisputeWrap" style="${emp.hasLaborDispute ? '' : 'display:none;'} margin-top:10px;">
      <div class="modal-grid">
        <div class="field"><label class="lbl">تاريخ المنازعة</label><input type="date" id="editLaborDisputeDate" value="${emp.laborDisputeDate||''}"></div>
        <div class="field">
          <label class="lbl">الجهة</label>
          ${DISPUTE_AUTHORITIES.map(a=>`<label style="display:flex; align-items:center; gap:6px; font-size:13px; margin-top:6px;">
            <input type="checkbox" class="laborDisputeAuthorityChk" value="${a}" ${(emp.laborDisputeAuthorities||[]).includes(a)?'checked':''}> ${a}
          </label>`).join('')}
        </div>
        <div class="field" style="grid-column:1/-1;"><label class="lbl">ملاحظة المنازعة (قابلة للتحديث)</label><input type="text" id="editLaborDisputeNote" value="${emp.laborDisputeNote||''}"></div>
      </div>
    </div>

    <h4 class="section-title" style="margin-top:18px;">غياب بدون عذر</h4>
    <div class="modal-grid">
      <div class="field">
        <label style="display:flex; align-items:center; gap:8px; font-size:14px; font-weight:700;">
          <input type="checkbox" id="editHasUnauthorizedAbsence" ${emp.hasUnauthorizedAbsence ? 'checked':''}> يوجد غياب بدون عذر
        </label>
      </div>
    </div>
    <div id="unauthorizedAbsenceWrap" style="${emp.hasUnauthorizedAbsence ? '' : 'display:none;'} margin-top:10px;">
      <div class="modal-grid">
        <div class="field"><label class="lbl">تاريخ الغياب</label><input type="date" id="editUnauthorizedAbsenceDate" value="${emp.unauthorizedAbsenceDate||''}"></div>
        <div class="field" style="grid-column:2/-1;"><label class="lbl">ملاحظة</label><input type="text" id="editUnauthorizedAbsenceNote" value="${emp.unauthorizedAbsenceNote||''}"></div>
      </div>
    </div>

    <h4 class="section-title" style="margin-top:18px;">التوظيف والراتب</h4>
    <div class="modal-grid">
      <div class="field"><label class="lbl">تاريخ بدء العمل</label><input type="date" id="editEmpStart" value="${emp.employmentStart||''}"></div>
      <div class="field"><label class="lbl">تاريخ انتهاء العمل</label><input type="date" id="editEmpEnd" value="${emp.employmentEnd||''}"></div>
      <div class="field"><label class="lbl">سبب انتهاء العمل</label><select id="editEndReason">${endReasonOptions}</select></div>
      <div class="field"><label class="lbl">الراتب الأساسي</label><input type="number" id="editSalaryBasic" value="${emp.salaryBasic||0}"></div>
      <div class="field"><label class="lbl">البدلات</label><input type="number" id="editSalaryAllowances" value="${emp.salaryAllowances||0}"></div>
      <div><span class="lbl">الراتب الإجمالي</span><span class="val" id="salaryTotalDisplay">${salaryTotal.toLocaleString('en-US')} د.إ</span></div>
      ${tenureDays !== null ? `<div><span class="lbl">عدد أيام العمل بالشركة</span><span class="val">${tenureDays} يوم</span></div>` : ''}
    </div>

    <div class="btn-row" style="margin-top:16px;">
      <button class="btn-gold" id="saveEmpBtn">${isNew ? 'إضافة الموظف' : 'حفظ التعديلات'}</button>
      ${!isNew ? `<button class="btn-secondary" id="exportOneExcelBtn">📥 تصدير Excel</button>
      <button class="btn-secondary" id="printEmpBtn">🖨️ طباعة</button>` : ''}
    </div>
    <p id="saveEmpStatus" class="muted" style="margin-top:8px;"></p>

    ${isNew ? '<p class="muted" style="margin-top:10px;">بعد إضافة الموظف، افتحه مرة ثانية من الجدول لإرفاق مستندات أو إضافة إجازات.</p>' : `
    <hr class="divider">
    <h4 class="section-title">الإجازات</h4>
    <div id="leaveList" class="doc-list"></div>
    <div class="modal-grid" style="margin-top:8px;">
      <div class="field"><label class="lbl">نوع الإجازة</label>
        <select id="leaveType">${LEAVE_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('')}</select>
      </div>
      <div class="field"><label class="lbl">السبب</label><input type="text" id="leaveReason" placeholder="اختياري إلا لنوع أخرى"></div>
      <div class="field"><label class="lbl">تاريخ البداية</label><input type="date" id="leaveStart"></div>
      <div class="field"><label class="lbl">تاريخ النهاية</label><input type="date" id="leaveEnd"></div>
    </div>
    <button class="btn-secondary" id="addLeaveBtn" style="margin-top:8px;">+ إضافة إجازة</button>
    <p id="leaveStatus" class="muted" style="margin-top:8px;"></p>

    <hr class="divider">
    <h4 class="section-title">المستندات المرفقة</h4>
    <div id="docList" class="doc-list"><p class="muted">جاري التحميل...</p></div>
    <label class="upload-drop" id="uploadDrop">
      <input type="file" id="fileInput" multiple hidden>
      <span>📎 اسحب الملفات هنا أو اضغط للاختيار (تُرفع لجميع الفريق)</span>
    </label>`}
  `;

  // تحديث الراتب الإجمالي مباشرة عند الكتابة
  const basicInput = document.getElementById('editSalaryBasic');
  const allowInput = document.getElementById('editSalaryAllowances');
  const updateTotal = ()=>{
    const t = (parseFloat(basicInput.value)||0) + (parseFloat(allowInput.value)||0);
    document.getElementById('salaryTotalDisplay').textContent = t.toLocaleString('en-US') + ' د.إ';
  };
  basicInput.addEventListener('input', updateTotal);
  allowInput.addEventListener('input', updateTotal);
  attachDatePreviews(document.getElementById('modalBody'));

  document.getElementById('editManualStatus').addEventListener('change', (e)=>{
    document.getElementById('manualStatusReasonWrap').style.display = (e.target.value === 'أخرى') ? '' : 'none';
    document.getElementById('renewalRejectedNoteWrap').style.display = (e.target.value === 'مرفوض تجديد إقامة') ? '' : 'none';
    document.getElementById('abscondingWrap').style.display = (e.target.value === 'هروب') ? '' : 'none';
  });
  document.getElementById('editHasLaborDispute').addEventListener('change', (e)=>{
    document.getElementById('laborDisputeWrap').style.display = e.target.checked ? '' : 'none';
  });
  document.getElementById('editHasUnauthorizedAbsence').addEventListener('change', (e)=>{
    document.getElementById('unauthorizedAbsenceWrap').style.display = e.target.checked ? '' : 'none';
  });

  document.getElementById('saveEmpBtn').addEventListener('click', isNew ? addNewEmployee : saveEmployeeEdits);

  if(!isNew){
    document.getElementById('fileInput').addEventListener('change', handleFiles);
    document.getElementById('addLeaveBtn').addEventListener('click', addLeave);
    document.getElementById('exportOneExcelBtn').addEventListener('click', ()=> exportEmployeeExcel(emp));
    document.getElementById('printEmpBtn').addEventListener('click', ()=> printEmployee(emp));
    renderDocList();
    renderLeaveList();
  }
  document.getElementById('modalOverlay').style.display = 'flex';
}

function collectEmployeeForm(){
  return {
    name: document.getElementById('editName').value.trim(),
    nationality: document.getElementById('editNationality').value.trim(),
    company: document.getElementById('editCompany').value.trim(),
    jobTitle: document.getElementById('editJobTitle').value.trim(),
    education: document.getElementById('editEducation').value.trim(),
    note: document.getElementById('editNote').value || '',
    manualStatus: document.getElementById('editManualStatus').value || '',
    manualStatusReason: document.getElementById('editManualStatusReason') ? document.getElementById('editManualStatusReason').value.trim() : '',
    renewalRejectedNote: document.getElementById('editRenewalRejectedNote') ? document.getElementById('editRenewalRejectedNote').value.trim() : '',
    abscondingDate: document.getElementById('editAbscondingDate') ? (document.getElementById('editAbscondingDate').value || null) : null,
    abscondingAuthorities: Array.from(document.querySelectorAll('.abscondingAuthorityChk:checked')).map(c=>c.value),
    hasLaborDispute: document.getElementById('editHasLaborDispute') ? document.getElementById('editHasLaborDispute').checked : false,
    laborDisputeDate: document.getElementById('editLaborDisputeDate') ? (document.getElementById('editLaborDisputeDate').value || null) : null,
    laborDisputeAuthorities: Array.from(document.querySelectorAll('.laborDisputeAuthorityChk:checked')).map(c=>c.value),
    laborDisputeNote: document.getElementById('editLaborDisputeNote') ? document.getElementById('editLaborDisputeNote').value.trim() : '',
    hasUnauthorizedAbsence: document.getElementById('editHasUnauthorizedAbsence') ? document.getElementById('editHasUnauthorizedAbsence').checked : false,
    unauthorizedAbsenceDate: document.getElementById('editUnauthorizedAbsenceDate') ? (document.getElementById('editUnauthorizedAbsenceDate').value || null) : null,
    unauthorizedAbsenceNote: document.getElementById('editUnauthorizedAbsenceNote') ? document.getElementById('editUnauthorizedAbsenceNote').value.trim() : '',
    phone: document.getElementById('editPhone').value.trim(),
    email: document.getElementById('editEmail').value.trim(),
    city: document.getElementById('editCity').value,
    address: document.getElementById('editAddress').value.trim(),
    passportExp: document.getElementById('editPassportExp').value || null,
    passportNumber: document.getElementById('editPassportNumber').value.trim(),
    emiratesIdExp: document.getElementById('editEidExp').value || null,
    emiratesIdNumber: document.getElementById('editEidNumber').value.trim(),
    workCardExp: document.getElementById('editWorkCard').value || null,
    workCardNumber: document.getElementById('editWorkCardNumber').value.trim(),
    residencyIssue: document.getElementById('editIssue').value || null,
    residencyExp: document.getElementById('editExp').value || null,
    licenseNumber: document.getElementById('editLicenseNumber').value.trim(),
    licenseExp: document.getElementById('editLicenseExp').value || null,
    insuranceNumber: document.getElementById('editInsuranceNumber').value.trim(),
    insuranceCompany: document.getElementById('editInsuranceCompany').value.trim(),
    employmentStart: document.getElementById('editEmpStart').value || null,
    employmentEnd: document.getElementById('editEmpEnd').value || null,
    employmentEndReason: document.getElementById('editEndReason').value || '',
    salaryBasic: parseFloat(document.getElementById('editSalaryBasic').value) || 0,
    salaryAllowances: parseFloat(document.getElementById('editSalaryAllowances').value) || 0
  };
}

async function addNewEmployee(){
  const status = document.getElementById('saveEmpStatus');
  const data = collectEmployeeForm();
  if(!data.name){ status.textContent = 'الاسم مطلوب'; return; }
  if(data.manualStatus === 'أخرى' && !data.manualStatusReason){
    status.textContent = 'اكتب السبب عند اختيار حالة "أخرى"';
    return;
  }
  status.textContent = 'جاري الإضافة...';
  const newId = EMPLOYEES.length ? Math.max(...EMPLOYEES.map(e=>e.id)) + 1 : 1;
  data.id = newId;
  data.leaves = [];
  data.lastEditedBy = auth.currentUser.email;
  data.lastEditedAt = firebase.firestore.FieldValue.serverTimestamp();
  try{
    await db.collection('employees').doc(String(newId)).set(data);
    logActivity('إضافة موظف', `أضاف الموظف: ${data.name}`);
    status.textContent = 'تمت الإضافة ✓';
    setTimeout(()=>{ document.getElementById('modalOverlay').style.display = 'none'; }, 700);
  }catch(e){
    status.textContent = 'تعذرت الإضافة: ' + e.message;
  }
}

async function saveEmployeeEdits(){
  const status = document.getElementById('saveEmpStatus');
  status.textContent = 'جاري الحفظ...';
  const updates = collectEmployeeForm();
  if(updates.manualStatus === 'أخرى' && !updates.manualStatusReason){
    status.textContent = 'اكتب السبب عند اختيار حالة "أخرى"';
    return;
  }
  updates.lastEditedBy = auth.currentUser.email;
  updates.lastEditedAt = firebase.firestore.FieldValue.serverTimestamp();
  try{
    await db.collection('employees').doc(String(activeEmployeeId)).update(updates);
    logActivity('تعديل موظف', `عدّل بيانات الموظف: ${updates.name || activeEmployeeId}`);
    status.textContent = 'تم الحفظ ✓ — التعديل ظاهر الآن لكل الفريق';
  }catch(e){
    status.textContent = 'تعذر الحفظ: ' + e.message;
  }
}

/* ---------- الإجازات: إضافة وعرض ---------- */
function renderLeaveList(){
  const emp = EMPLOYEES.find(e=>e.id===activeEmployeeId);
  const el = document.getElementById('leaveList');
  const leaves = (emp && emp.leaves) || [];
  if(!leaves.length){ el.innerHTML = '<p class="muted">لا توجد إجازات مسجلة بعد.</p>'; return; }
  el.innerHTML = leaves.slice().sort((a,b)=> new Date(b.startDate)-new Date(a.startDate)).map(l=>`
    <div class="doc-item">
      <span class="doc-name">🗓️ ${l.type}${l.reason ? ' — '+l.reason : ''} (${fmtDate(l.startDate)} → ${fmtDate(l.endDate)}، ${l.days} يوم)</span>
      <div class="doc-actions">
        <button class="btn-tiny danger" onclick="removeLeave('${l.id}')">حذف</button>
      </div>
    </div>`).join('');
}

async function addLeave(){
  const status = document.getElementById('leaveStatus');
  const type = document.getElementById('leaveType').value;
  const reason = document.getElementById('leaveReason').value.trim();
  const start = document.getElementById('leaveStart').value;
  const end = document.getElementById('leaveEnd').value;
  if(!start || !end){ status.textContent = 'حدد تاريخ البداية والنهاية'; return; }
  if(new Date(end) < new Date(start)){ status.textContent = 'تاريخ النهاية قبل البداية'; return; }
  if(type === 'أخرى' && !reason){ status.textContent = 'اكتب سبب الإجازة عند اختيار "أخرى"'; return; }

  const emp = EMPLOYEES.find(e=>e.id===activeEmployeeId);
  const existingLeaves = (emp && emp.leaves) || [];
  if(leavesOverlap(existingLeaves, start, end)){
    status.textContent = 'يوجد تعارض مع إجازة مسجلة مسبقًا لنفس الموظف بهذه الفترة';
    return;
  }

  const days = daysBetween(start, end) + 1;
  const newLeave = { id: 'lv_' + Date.now(), type, reason, startDate: start, endDate: end, days };
  status.textContent = 'جاري الحفظ...';
  try{
    await db.collection('employees').doc(String(activeEmployeeId)).update({
      leaves: firebase.firestore.FieldValue.arrayUnion(newLeave),
      lastEditedBy: auth.currentUser.email,
      lastEditedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    logActivity('إضافة إجازة', `أضاف إجازة (${type}) لـ ${emp.name} من ${start} إلى ${end}`);
    status.textContent = 'تمت إضافة الإجازة ✓';
    document.getElementById('leaveReason').value = '';
    document.getElementById('leaveStart').value = '';
    document.getElementById('leaveEnd').value = '';
    document.getElementById('leaveStart').dispatchEvent(new Event('input'));
    document.getElementById('leaveEnd').dispatchEvent(new Event('input'));
    setTimeout(renderLeaveList, 400);
  }catch(e){
    status.textContent = 'تعذر الحفظ: ' + e.message;
  }
}

async function removeLeave(leaveId){
  if(!confirm('حذف هذه الإجازة؟')) return;
  const emp = EMPLOYEES.find(e=>e.id===activeEmployeeId);
  const leave = (emp.leaves||[]).find(l=>l.id===leaveId);
  if(!leave) return;
  try{
    await db.collection('employees').doc(String(activeEmployeeId)).update({
      leaves: firebase.firestore.FieldValue.arrayRemove(leave),
      lastEditedBy: auth.currentUser.email,
      lastEditedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    logActivity('حذف إجازة', `حذف إجازة (${leave.type}) لـ ${emp.name}`);
    setTimeout(renderLeaveList, 400);
  }catch(e){ alert('تعذر الحذف: ' + e.message); }
}

/* ---------- المهام الجماعية ---------- */
function subscribeTasks(){
  if(unsubscribeTasks) unsubscribeTasks();
  unsubscribeTasks = db.collection('tasks').orderBy('createdAt','desc').onSnapshot(snap=>{
    TASKS = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    renderTasks();
  }, err=> console.error(err));
}

function renderTasks(){
  const el = document.getElementById('taskList');
  if(!el) return;
  if(!TASKS.length){ el.innerHTML = '<p class="muted">لا توجد مهام حاليًا.</p>'; return; }
  const today = new Date(); today.setHours(0,0,0,0);
  el.innerHTML = TASKS.map(t=>{
    const assigneeName = t.assignedTo ? resolveName(t.assignedTo) : 'غير مسندة';
    const createdByName = resolveName(t.createdBy);
    const assignedDate = fmtDateTime(t.createdAt);
    const isOverdue = !t.done && t.dueDate && new Date(t.dueDate) < today;
    return `<div class="task-item ${t.done ? 'done':''}">
      <input type="checkbox" ${t.done?'checked':''} onchange="toggleTaskDone('${t.id}', this.checked)">
      <div class="task-body">
        <div class="task-text">${t.text} ${t.done ? '<span class="badge badge-ok" style="margin-inline-start:6px;">✓ تمت</span>' : (isOverdue ? '<span class="badge badge-expired" style="margin-inline-start:6px;">متأخرة</span>' : '')}</div>
        <div class="task-meta">مسندة إلى: ${assigneeName} · بواسطة: ${createdByName}</div>
        <div class="task-meta">تاريخ الإسناد: ${assignedDate || '—'} ${t.dueDate ? ' · تاريخ الانتهاء: ' + fmtDate(t.dueDate) : ''}</div>
      </div>
      <button class="task-del" onclick="deleteTask('${t.id}')">✕</button>
    </div>`;
  }).join('');
}

async function addTask(){
  const text = document.getElementById('taskText').value.trim();
  const assignedTo = document.getElementById('taskAssignee').value;
  const dueDate = document.getElementById('taskDueDate').value || null;
  if(!text) return;
  try{
    await db.collection('tasks').add({
      text, assignedTo, dueDate,
      createdBy: auth.currentUser.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      done:false
    });
    logActivity('إضافة مهمة', `أضاف مهمة: ${text}`);
    document.getElementById('taskText').value = '';
    document.getElementById('taskDueDate').value = '';
    document.getElementById('taskDueDate').dispatchEvent(new Event('input'));
  }catch(e){ alert('تعذرت إضافة المهمة: ' + e.message); }
}

async function toggleTaskDone(id, val){
  try{
    await db.collection('tasks').doc(id).update({ done: val, doneAt: val ? firebase.firestore.FieldValue.serverTimestamp() : null });
    const t = TASKS.find(x=>x.id===id);
    logActivity(val ? 'إنجاز مهمة' : 'إعادة فتح مهمة', t ? t.text : id);
  }catch(e){ alert('تعذر التحديث: ' + e.message); }
}

async function deleteTask(id){
  if(!confirm('حذف هذه المهمة؟')) return;
  const t = TASKS.find(x=>x.id===id);
  try{
    await db.collection('tasks').doc(id).delete();
    logActivity('حذف مهمة', t ? t.text : id);
  }
  catch(e){ alert('تعذر الحذف: ' + e.message); }
}

/* ---------- دردشة الفريق ---------- */
function subscribeChat(){
  if(unsubscribeChat) unsubscribeChat();
  unsubscribeChat = db.collection('chat_messages').orderBy('createdAt','desc').limit(150).onSnapshot(snap=>{
    const msgs = snap.docs.map(d=>({ id:d.id, ...d.data() })).reverse();
    renderChatMessages(msgs);
  }, err=> console.error(err));
}

let LAST_CHAT_MSGS = [];
function renderChatMessages(msgs){
  if(msgs) LAST_CHAT_MSGS = msgs;
  const el = document.getElementById('chatMessages');
  if(!el) return;
  const myEmail = auth.currentUser && auth.currentUser.email;
  el.innerHTML = LAST_CHAT_MSGS.map(m=>{
    const mine = m.senderEmail === myEmail;
    const time = fmtDateTime(m.createdAt) || '';
    const attach = m.attachmentUrl ? `<a class="attachment" target="_blank" href="${m.attachmentUrl}">📎 ${m.attachmentName}</a>` : '';
    return `<div class="chat-msg ${mine?'mine':''}">
      <div class="sender">${resolveName(m.senderEmail)}</div>
      ${m.text ? `<div class="text">${m.text}</div>` : ''}
      ${attach}
      <div class="time">${time}</div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

async function sendChatMessage(){
  const input = document.getElementById('chatTextInput');
  const text = input.value.trim();
  if(!text) return;
  input.value = '';
  try{
    await db.collection('chat_messages').add({
      text, senderEmail: auth.currentUser.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }catch(e){ alert('تعذر الإرسال: ' + e.message); }
}

async function sendChatAttachment(file){
  const caption = document.getElementById('chatTextInput').value.trim();
  document.getElementById('chatTextInput').value = '';
  const path = `chat_attachments/${Date.now()}_${file.name}`;
  const ref = storage.ref().child(path);
  try{
    await ref.put(file);
    const url = await ref.getDownloadURL();
    await db.collection('chat_messages').add({
      text: caption, attachmentUrl: url, attachmentName: file.name,
      senderEmail: auth.currentUser.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }catch(e){ alert('تعذر رفع المرفق: ' + e.message); }
}


/* ---------- سجل الدخول والخروج والأعمال ---------- */
function logActivity(type, details){
  const email = auth.currentUser && auth.currentUser.email;
  if(!email) return;
  db.collection('activity_logs').add({
    email, type, details: details || '',
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(err=> console.error('activity log error', err));
}

function subscribeLoginLogs(){
  if(unsubscribeLoginLogs) unsubscribeLoginLogs();
  unsubscribeLoginLogs = db.collection('activity_logs').orderBy('timestamp','desc').limit(300).onSnapshot(snap=>{
    LOGIN_LOGS = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    renderLoginLogs();
  }, err=> console.error(err));
}

function fmtDayDate(ts){
  if(!ts) return '—';
  const d = (ts && typeof ts.toDate === 'function') ? ts.toDate() : new Date(ts);
  if(isNaN(d.getTime())) return '—';
  const days = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  const day = String(d.getDate()).padStart(2,'0');
  const month = String(d.getMonth()+1).padStart(2,'0');
  return `${days[d.getDay()]} ${day}/${month}/${d.getFullYear()}`;
}
function fmtTimeOnly(ts){
  if(!ts) return '—';
  const d = (ts && typeof ts.toDate === 'function') ? ts.toDate() : new Date(ts);
  if(isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

const LOG_TYPE_BADGE = {
  'دخول':'badge-ok', 'خروج':'badge-unknown',
  'إضافة موظف':'badge-renewing', 'تعديل موظف':'badge-soon',
  'إضافة إجازة':'badge-seconded', 'حذف إجازة':'badge-critical',
  'رفع مستند':'badge-renewing', 'حذف مستند':'badge-critical',
  'إضافة مهمة':'badge-renewing', 'إنجاز مهمة':'badge-ok',
  'إعادة فتح مهمة':'badge-soon', 'حذف مهمة':'badge-critical'
};

function renderLoginLogs(){
  const el = document.getElementById('loginLogsBody');
  if(!el) return;
  if(!LOGIN_LOGS.length){ el.innerHTML = '<tr><td colspan="5" class="empty-state">لا يوجد سجل بعد</td></tr>'; return; }
  el.innerHTML = LOGIN_LOGS.map(l=>{
    const badgeCls = LOG_TYPE_BADGE[l.type] || 'badge-unknown';
    return `<tr>
      <td>${l.email}</td>
      <td><span class="badge ${badgeCls}">${l.type}</span></td>
      <td>${l.details || '—'}</td>
      <td>${fmtDayDate(l.timestamp)}</td>
      <td>${fmtTimeOnly(l.timestamp)}</td>
    </tr>`;
  }).join('');
}

function exportLoginLogsExcel(){
  const rows = LOGIN_LOGS.map(l=>({
    'البريد الإلكتروني': l.email,
    'النوع': l.type,
    'التفاصيل': l.details || '',
    'اليوم والتاريخ': fmtDayDate(l.timestamp),
    'الوقت': fmtTimeOnly(l.timestamp)
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'سجل الدخول والأعمال');
  XLSX.writeFile(wb, `سجل-الدخول-والاعمال-${new Date().toISOString().slice(0,10)}.xlsx`);
}

function printLoginLogs(){
  const rows = LOGIN_LOGS.map(l=>`<tr><td>${l.email}</td><td>${l.type}</td><td>${l.details||'—'}</td><td>${fmtDayDate(l.timestamp)}</td><td>${fmtTimeOnly(l.timestamp)}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>سجل الدخول والأعمال</title>
  <style>
    body{ font-family:Arial,sans-serif; padding:30px; color:#111; }
    h1{ font-size:20px; border-bottom:3px solid #d4af37; padding-bottom:8px; }
    table{ width:100%; border-collapse:collapse; margin-top:14px; }
    td,th{ border:1px solid #ccc; padding:8px 10px; font-size:13px; text-align:right; }
  </style></head><body>
  <h1>نظام الماسة للموارد البشرية — سجل الدخول والأعمال</h1>
  <table><tr><th>البريد الإلكتروني</th><th>النوع</th><th>التفاصيل</th><th>اليوم والتاريخ</th><th>الوقت</th></tr>${rows}</table>
  <p style="margin-top:24px; font-size:11px; color:#777;">تم إنشاء هذا التقرير تلقائيًا بتاريخ ${fmtDate(new Date())}</p>
  </body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.onload = ()=> w.print();
}


/* ---------- المركبات ---------- */
function getVehicleStatus(v){
  const insD = daysUntil(v.insuranceExp);
  const regD = daysUntil(v.registrationExp);
  const worst = [insD, regD].filter(d=>d!==null);
  if(!worst.length) return { key:'unknown', label:'غير محدد', cls:'badge-unknown' };
  const minD = Math.min(...worst);
  if(minD < 0) return { key:'expired', label:`منتهي منذ ${Math.abs(minD)} يوم`, cls:'badge-expired' };
  if(minD <= 60) return { key:'soon', label:`تنتهي خلال ${minD} يوم`, cls:'badge-soon' };
  return { key:'ok', label:'سارية', cls:'badge-ok' };
}

function subscribeVehicles(){
  if(unsubscribeVehicles) unsubscribeVehicles();
  unsubscribeVehicles = db.collection('vehicles').onSnapshot(snap=>{
    VEHICLES = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    renderVehiclesTable();
    renderVehicleKPI();
  }, err=> console.error(err));
}

function renderVehicleKPI(){
  const el = document.getElementById('kpiVehicleExp');
  if(!el) return;
  const count = VEHICLES.filter(v=> getVehicleStatus(v).key==='expired' || getVehicleStatus(v).key==='soon').length;
  el.textContent = count;
}

function renderVehiclesTable(){
  const tbody = document.getElementById('vehicleTableBody');
  if(!tbody) return;
  let list = VEHICLES.slice();
  if(vehicleFilter.q){
    const q = normalizeAr(vehicleFilter.q);
    const qRaw = vehicleFilter.q.trim().toLowerCase();
    list = list.filter(v=>{
      const driverName = v.isExternalDriver ? (v.externalDriverName||'') : (v.assignedToName||'');
      return normalizeAr(driverName).includes(q) || (v.vehicleNumber||'').toLowerCase().includes(qRaw);
    });
  }
  document.getElementById('vehicleResultCount').textContent = `${list.length} من ${VEHICLES.length}`;
  if(!list.length){ tbody.innerHTML = '<tr><td colspan="9" class="empty-state">لا توجد نتائج مطابقة</td></tr>'; return; }
  const sorted = list.sort((a,b)=>{
    const order = {expired:1, soon:2, unknown:3, ok:4};
    return (order[getVehicleStatus(a).key]||9) - (order[getVehicleStatus(b).key]||9);
  });
  tbody.innerHTML = sorted.map(v=>{
    const s = getVehicleStatus(v);
    const driverName = v.isExternalDriver ? `${v.externalDriverName||'—'} (خارجي)` : (v.assignedToName||'—');
    return `<tr data-id="${v.id}" class="row-clickable">
      <td class="cell-name">${v.vehicleNumber||'—'}</td>
      <td>${v.plateEmirate||'—'}</td>
      <td>${v.vehicleType||'—'}</td>
      <td>${driverName}</td>
      <td>${fmtDate(v.receivedDate)}</td>
      <td>${fmtDate(v.registrationExp)}</td>
      <td>${fmtDate(v.insuranceExp)}</td>
      <td><span class="badge ${s.cls}">${s.label}</span></td>
      <td class="cell-docs" id="vehDocCount_${v.id}">…</td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('tr[data-id]').forEach(tr=>{
    const id = tr.dataset.id;
    tr.addEventListener('click', ()=> openVehicleModal(id));
    db.collection('vehicles').doc(id).collection('documents').get().then(s=>{
      const el = document.getElementById('vehDocCount_'+id);
      if(el) el.textContent = s.size ? `📎 ${s.size}` : '—';
    }).catch(()=>{});
  });
}

function openVehicleModal(id){
  activeVehicleId = id;
  const isNew = (id === null);
  const v = isNew ? { vehicleNumber:'', plateEmirate:'', vehicleType:'', assignedTo:'', assignedToName:'', isExternalDriver:false, externalDriverName:'', externalDriverPhone:'', receivedDate:'', registrationExp:'', insuranceExp:'', note:'' } : VEHICLES.find(x=>x.id===id);
  if(!v) return;
  document.getElementById('modalTitle').textContent = isNew ? 'إضافة مركبة جديدة' : `مركبة: ${v.vehicleNumber}`;
  const empOptions = EMPLOYEES.map(e=>`<option value="${e.name} — ${getEmployeeNumber(e.id)}">`).join('');
  const currentEmpLabel = (!isNew && v.assignedTo) ? (()=>{
    const emp = EMPLOYEES.find(x=>String(x.id)===String(v.assignedTo));
    return emp ? `${emp.name} — ${getEmployeeNumber(emp.id)}` : '';
  })() : '';
  const emirateOptions = ['<option value="">— اختر —</option>'].concat(
    PLATE_EMIRATES.map(em=>`<option value="${em}" ${v.plateEmirate===em?'selected':''}>${em}</option>`)
  ).join('');
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-grid">
      <div class="field"><label class="lbl">رقم المركبة</label><input type="text" id="vehNumber" value="${v.vehicleNumber||''}"></div>
      <div class="field"><label class="lbl">إمارة اللوحة</label><select id="vehPlateEmirate">${emirateOptions}</select></div>
      <div class="field"><label class="lbl">نوع المركبة</label><input type="text" id="vehType" value="${v.vehicleType||''}"></div>
      <div class="field"><label class="lbl">تاريخ الاستلام</label><input type="date" id="vehReceivedDate" value="${v.receivedDate||''}"></div>
      <div class="field"><label class="lbl">انتهاء الملكية / الترخيص</label><input type="date" id="vehRegistrationExp" value="${v.registrationExp||''}"></div>
      <div class="field"><label class="lbl">انتهاء التأمين</label><input type="date" id="vehInsuranceExp" value="${v.insuranceExp||''}"></div>
    </div>

    <h4 class="section-title" style="margin-top:18px;">السائق / مستلم المركبة</h4>
    <div class="modal-grid">
      <div class="field">
        <label style="display:flex; align-items:center; gap:8px; font-size:14px; font-weight:700;">
          <input type="checkbox" id="vehIsExternal" ${v.isExternalDriver ? 'checked':''}> سائق خارجي (غير مسجل بالنظام)
        </label>
      </div>
    </div>
    <div id="vehInternalDriverWrap" style="${v.isExternalDriver ? 'display:none;' : ''} margin-top:8px;">
      <div class="modal-grid">
        <div class="field">
          <label class="lbl">من مستلم المركبة (اكتب للبحث بالاسم)</label>
          <input type="text" id="vehAssignedToSearch" list="empNamesList" value="${currentEmpLabel}" placeholder="ابحث عن اسم الموظف...">
          <datalist id="empNamesList">${empOptions}</datalist>
        </div>
      </div>
    </div>
    <div id="vehExternalDriverWrap" style="${v.isExternalDriver ? '' : 'display:none;'} margin-top:8px;">
      <div class="modal-grid">
        <div class="field"><label class="lbl">اسم السائق الخارجي</label><input type="text" id="vehExternalName" value="${v.externalDriverName||''}"></div>
        <div class="field"><label class="lbl">رقم تواصل السائق الخارجي</label><input type="text" id="vehExternalPhone" value="${v.externalDriverPhone||''}"></div>
      </div>
    </div>

    <div class="field" style="margin-top:10px;"><label class="lbl">ملاحظة</label><input type="text" id="vehNote" value="${v.note||''}"></div>

    <div class="btn-row" style="margin-top:16px;">
      <button class="btn-gold" id="saveVehicleBtn">${isNew ? 'إضافة المركبة' : 'حفظ التعديلات'}</button>
      ${!isNew ? `<button class="btn-secondary" id="deleteVehicleBtn">🗑️ حذف المركبة</button>` : ''}
    </div>
    <p id="vehicleSaveStatus" class="muted" style="margin-top:8px;"></p>
    ${!isNew ? `
    <hr class="divider">
    <h4 class="section-title">مستندات المركبة</h4>
    <div id="vehDocList" class="doc-list"><p class="muted">جاري التحميل...</p></div>
    <label class="upload-drop" id="vehUploadDrop">
      <input type="file" id="vehFileInput" multiple hidden>
      <span>📎 اسحب الملفات هنا أو اضغط للاختيار (استمارة، بوليصة تأمين...)</span>
    </label>` : ''}
  `;
  attachDatePreviews(document.getElementById('modalBody'));
  document.getElementById('vehIsExternal').addEventListener('change', (e)=>{
    document.getElementById('vehInternalDriverWrap').style.display = e.target.checked ? 'none' : '';
    document.getElementById('vehExternalDriverWrap').style.display = e.target.checked ? '' : 'none';
  });
  document.getElementById('saveVehicleBtn').addEventListener('click', isNew ? addNewVehicle : saveVehicleEdits);
  if(!isNew){
    document.getElementById('deleteVehicleBtn').addEventListener('click', deleteVehicle);
    document.getElementById('vehFileInput').addEventListener('change', handleVehicleFiles);
    renderVehicleDocList();
  }
  document.getElementById('modalOverlay').style.display = 'flex';
}

function collectVehicleForm(){
  const isExternal = document.getElementById('vehIsExternal').checked;
  let empId = '', empName = '';
  if(!isExternal){
    const typed = document.getElementById('vehAssignedToSearch').value.trim();
    const m = typed.match(/AM-(\d+)\s*$/);
    if(m){
      const emp = EMPLOYEES.find(e=> String(e.id) === String(parseInt(m[1],10)));
      if(emp){ empId = emp.id; empName = emp.name; }
    }
  }
  return {
    vehicleNumber: document.getElementById('vehNumber').value.trim(),
    plateEmirate: document.getElementById('vehPlateEmirate').value || '',
    vehicleType: document.getElementById('vehType').value.trim(),
    isExternalDriver: isExternal,
    assignedTo: empId || '',
    assignedToName: empName,
    externalDriverName: isExternal ? document.getElementById('vehExternalName').value.trim() : '',
    externalDriverPhone: isExternal ? document.getElementById('vehExternalPhone').value.trim() : '',
    receivedDate: document.getElementById('vehReceivedDate').value || null,
    registrationExp: document.getElementById('vehRegistrationExp').value || null,
    insuranceExp: document.getElementById('vehInsuranceExp').value || null,
    note: document.getElementById('vehNote').value.trim()
  };
}

async function addNewVehicle(){
  const status = document.getElementById('vehicleSaveStatus');
  const data = collectVehicleForm();
  if(!data.vehicleNumber){ status.textContent = 'رقم المركبة مطلوب'; return; }
  status.textContent = 'جاري الإضافة...';
  try{
    await db.collection('vehicles').add(data);
    logActivity('إضافة مركبة', `أضاف مركبة: ${data.vehicleNumber}`);
    status.textContent = 'تمت الإضافة ✓';
    setTimeout(()=>{ document.getElementById('modalOverlay').style.display = 'none'; }, 700);
  }catch(e){ status.textContent = 'تعذرت الإضافة: ' + e.message; }
}

async function saveVehicleEdits(){
  const status = document.getElementById('vehicleSaveStatus');
  status.textContent = 'جاري الحفظ...';
  const data = collectVehicleForm();
  try{
    await db.collection('vehicles').doc(activeVehicleId).update(data);
    logActivity('تعديل مركبة', `عدّل بيانات المركبة: ${data.vehicleNumber}`);
    status.textContent = 'تم الحفظ ✓';
  }catch(e){ status.textContent = 'تعذر الحفظ: ' + e.message; }
}

async function deleteVehicle(){
  if(!confirm('حذف هذه المركبة نهائيًا؟')) return;
  const v = VEHICLES.find(x=>x.id===activeVehicleId);
  try{
    await db.collection('vehicles').doc(activeVehicleId).delete();
    logActivity('حذف مركبة', v ? v.vehicleNumber : activeVehicleId);
    document.getElementById('modalOverlay').style.display = 'none';
  }catch(e){ alert('تعذر الحذف: ' + e.message); }
}

function vehicleDocsRef(vehId){
  return db.collection('vehicles').doc(vehId).collection('documents');
}

async function renderVehicleDocList(){
  const el = document.getElementById('vehDocList');
  try{
    const snap = await vehicleDocsRef(activeVehicleId).orderBy('addedAt','desc').get();
    if(snap.empty){ el.innerHTML = '<p class="muted">لا توجد مستندات مرفقة بعد.</p>'; return; }
    el.innerHTML = snap.docs.map(d=>{
      const doc = d.data();
      return `<div class="doc-item">
        <span class="doc-name">📄 ${doc.name}</span>
        <div class="doc-actions">
          <a target="_blank" href="${doc.url}" class="btn-tiny">فتح/تنزيل</a>
          <button class="btn-tiny danger" onclick="removeVehicleDoc('${d.id}','${doc.path}')">حذف</button>
        </div>
      </div>`;
    }).join('');
  }catch(e){ el.innerHTML = '<p class="muted">تعذر تحميل المستندات: '+e.message+'</p>'; }
}

async function handleVehicleFiles(e){
  const files = Array.from(e.target.files);
  for(const f of files){
    const path = `vehicle_documents/${activeVehicleId}/${Date.now()}_${f.name}`;
    const ref = storage.ref().child(path);
    try{
      await ref.put(f);
      const url = await ref.getDownloadURL();
      await vehicleDocsRef(activeVehicleId).add({
        name:f.name, url, path, size:f.size,
        addedAt: firebase.firestore.FieldValue.serverTimestamp(),
        uploadedBy: auth.currentUser.email
      });
    }catch(err){ alert('فشل رفع الملف ' + f.name + ': ' + err.message); }
  }
  renderVehicleDocList();
  renderVehiclesTable();
}

async function removeVehicleDoc(docId, path){
  if(!confirm('حذف هذا المستند نهائيًا؟')) return;
  try{
    await storage.ref().child(path).delete().catch(()=>{});
    await vehicleDocsRef(activeVehicleId).doc(docId).delete();
    renderVehicleDocList();
    renderVehiclesTable();
  }catch(e){ alert('تعذر الحذف: ' + e.message); }
}


/* ---------- المستندات (Firebase Storage + Firestore) ---------- */
function docsRef(empId){
  return db.collection('employees').doc(String(empId)).collection('documents');
}

async function renderDocList(){
  const el = document.getElementById('docList');
  try{
    const snap = await docsRef(activeEmployeeId).orderBy('addedAt','desc').get();
    if(snap.empty){ el.innerHTML = '<p class="muted">لا توجد مستندات مرفقة بعد.</p>'; return; }
    el.innerHTML = snap.docs.map(d=>{
      const doc = d.data();
      return `<div class="doc-item">
        <span class="doc-name">📄 ${doc.name}</span>
        <div class="doc-actions">
          <a target="_blank" href="${doc.url}" class="btn-tiny">فتح/تنزيل</a>
          <button class="btn-tiny danger" onclick="removeDoc('${d.id}','${doc.path}')">حذف</button>
        </div>
      </div>`;
    }).join('');
  }catch(e){
    el.innerHTML = '<p class="muted">تعذر تحميل المستندات: '+e.message+'</p>';
  }
}

async function handleFiles(e){
  const files = Array.from(e.target.files);
  for(const f of files){
    const path = `documents/${activeEmployeeId}/${Date.now()}_${f.name}`;
    const ref = storage.ref().child(path);
    try{
      await ref.put(f);
      const url = await ref.getDownloadURL();
      await docsRef(activeEmployeeId).add({
        name:f.name, url, path, size:f.size,
        addedAt: firebase.firestore.FieldValue.serverTimestamp(),
        uploadedBy: auth.currentUser.email
      });
      await db.collection('employees').doc(String(activeEmployeeId)).update({
        lastEditedBy: auth.currentUser.email,
        lastEditedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      const empForLog = EMPLOYEES.find(x=>x.id===activeEmployeeId);
      logActivity('رفع مستند', `رفع مستند (${f.name}) لـ ${empForLog ? empForLog.name : activeEmployeeId}`);
    }catch(err){
      alert('فشل رفع الملف ' + f.name + ': ' + err.message);
    }
  }
  renderDocList();
  renderTable();
}

async function removeDoc(docId, path){
  if(!confirm('حذف هذا المستند نهائيًا؟')) return;
  try{
    await storage.ref().child(path).delete().catch(()=>{});
    await docsRef(activeEmployeeId).doc(docId).delete();
    await db.collection('employees').doc(String(activeEmployeeId)).update({
      lastEditedBy: auth.currentUser.email,
      lastEditedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    const empForLog = EMPLOYEES.find(x=>x.id===activeEmployeeId);
    logActivity('حذف مستند', `حذف مستند لـ ${empForLog ? empForLog.name : activeEmployeeId}`);
    renderDocList();
    renderTable();
  }catch(e){ alert('تعذر الحذف: ' + e.message); }
}

/* ---------- تصدير Excel ---------- */
const EXCEL_FIELD_MAP = [
  ['name','الاسم'],['nationality','الجنسية'],['company','الشركة'],['jobTitle','المهنة'],['education','المؤهل الدراسي'],
  ['phone','رقم التواصل'],['email','البريد الإلكتروني'],['city','المدينة'],['address','عنوان السكن'],
  ['passportExp','انتهاء الجواز'],['passportNumber','رقم الجواز'],
  ['emiratesIdExp','انتهاء الهوية'],['emiratesIdNumber','رقم الهوية'],
  ['workCardNumber','رقم بطاقة العمل'],['workCardExp','انتهاء بطاقة العمل'],
  ['residencyIssue','إصدار الإقامة'],['residencyExp','انتهاء الإقامة'],
  ['licenseNumber','رقم رخصة القيادة'],['licenseExp','انتهاء رخصة القيادة'],
  ['insuranceNumber','رقم التأمين الصحي'],['insuranceCompany','شركة التأمين'],
  ['employmentStart','تاريخ بدء العمل'],['employmentEnd','تاريخ انتهاء العمل'],['employmentEndReason','سبب انتهاء العمل'],
  ['salaryBasic','الراتب الأساسي'],['salaryAllowances','البدلات'],
  ['manualStatus','الحالة اليدوية'],['manualStatusReason','سبب الحالة (أخرى)'],
  ['renewalRejectedNote','ملاحظة رفض التجديد'],
  ['abscondingDate','تاريخ بلاغ الهروب'],['abscondingAuthorities','جهة بلاغ الهروب'],
  ['hasLaborDispute','يوجد منازعة عمالية'],['laborDisputeDate','تاريخ المنازعة'],
  ['laborDisputeAuthorities','جهة المنازعة'],['laborDisputeNote','ملاحظة المنازعة'],
  ['hasUnauthorizedAbsence','يوجد غياب بدون عذر'],['unauthorizedAbsenceDate','تاريخ الغياب'],['unauthorizedAbsenceNote','ملاحظة الغياب'],
  ['note','ملاحظة']
];

function employeeToRow(e){
  const row = { 'الرقم الوظيفي': getEmployeeNumber(e.id) };
  EXCEL_FIELD_MAP.forEach(([key,label])=>{
    let val = e[key] ?? '';
    if(Array.isArray(val)) val = val.join('، ');
    if(typeof val === 'boolean') val = val ? 'نعم' : 'لا';
    row[label] = val;
  });
  row['الراتب الإجمالي'] = (parseFloat(e.salaryBasic)||0) + (parseFloat(e.salaryAllowances)||0);
  return row;
}

function exportAllEmployeesExcel(){
  const rows = applyFilters(EMPLOYEES).map(employeeToRow);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'الموظفون');
  XLSX.writeFile(wb, `موظفو-الماسة-${new Date().toISOString().slice(0,10)}.xlsx`);
}

function exportEmployeeExcel(emp){
  const row = employeeToRow(emp);
  const detailRows = Object.entries(row).map(([label,value])=>({ 'البيان':label, 'القيمة':value }));
  const ws = XLSX.utils.json_to_sheet(detailRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'بيانات الموظف');
  if(emp.leaves && emp.leaves.length){
    const leaveRows = emp.leaves.map(l=>({ 'النوع':l.type, 'السبب':l.reason||'', 'البداية':l.startDate, 'النهاية':l.endDate, 'عدد الأيام':l.days }));
    const wsLeaves = XLSX.utils.json_to_sheet(leaveRows);
    XLSX.utils.book_append_sheet(wb, wsLeaves, 'الإجازات');
  }
  XLSX.writeFile(wb, `${emp.name || 'موظف'}.xlsx`);
}

/* ---------- الطباعة ---------- */
function printEmployee(emp){
  const s = getStatus(emp);
  const salaryTotal = (parseFloat(emp.salaryBasic)||0) + (parseFloat(emp.salaryAllowances)||0);
  const leaveRows = (emp.leaves||[]).map(l=>`<tr><td>${l.type}</td><td>${l.reason||'—'}</td><td>${fmtDate(l.startDate)}</td><td>${fmtDate(l.endDate)}</td><td>${l.days}</td></tr>`).join('');
  let extraStatusHtml = '';
  if(emp.manualStatus === 'هروب'){
    extraStatusHtml += `<div class="section">تفاصيل بلاغ الهروب</div>
    <table><tr><td>تاريخ البلاغ</td><td>${fmtDate(emp.abscondingDate)}</td><td>جهة البلاغ</td><td>${(emp.abscondingAuthorities||[]).join('، ')||'—'}</td></tr></table>`;
  }
  if(emp.manualStatus === 'مرفوض تجديد إقامة' && emp.renewalRejectedNote){
    extraStatusHtml += `<div class="section">ملاحظة رفض التجديد</div><table><tr><td>${emp.renewalRejectedNote}</td></tr></table>`;
  }
  if(emp.hasLaborDispute){
    extraStatusHtml += `<div class="section">تفاصيل المنازعة العمالية</div>
    <table><tr><td>تاريخ المنازعة</td><td>${fmtDate(emp.laborDisputeDate)}</td><td>الجهة</td><td>${(emp.laborDisputeAuthorities||[]).join('، ')||'—'}</td></tr>
    <tr><td>ملاحظة</td><td colspan="3">${emp.laborDisputeNote||'—'}</td></tr></table>`;
  }
  if(emp.hasUnauthorizedAbsence){
    extraStatusHtml += `<div class="section">غياب بدون عذر</div>
    <table><tr><td>تاريخ الغياب</td><td>${fmtDate(emp.unauthorizedAbsenceDate)}</td><td>ملاحظة</td><td>${emp.unauthorizedAbsenceNote||'—'}</td></tr></table>`;
  }
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${emp.name}</title>
  <style>
    body{ font-family:Arial,sans-serif; padding:30px; color:#111; }
    h1{ font-size:20px; border-bottom:3px solid #d4af37; padding-bottom:8px; }
    table{ width:100%; border-collapse:collapse; margin-top:14px; }
    td,th{ border:1px solid #ccc; padding:8px 10px; font-size:13px; text-align:right; }
    .section{ margin-top:20px; font-weight:bold; font-size:14px; background:#f5f5f5; padding:6px 10px; }
  </style></head><body>
  <h1>نظام الماسة للموارد البشرية — بطاقة موظف</h1>
  <p><strong>${emp.name}</strong> — الرقم الوظيفي: ${getEmployeeNumber(emp.id)} — الحالة: ${s.label}</p>
  <div class="section">البيانات الأساسية</div>
  <table>
    <tr><td>الجنسية</td><td>${emp.nationality||'—'}</td><td>الشركة</td><td>${emp.company||'—'}</td></tr>
    <tr><td>المهنة</td><td>${emp.jobTitle||'—'}</td><td>المؤهل الدراسي</td><td>${emp.education||'—'}</td></tr>
    <tr><td>رقم التواصل</td><td>${emp.phone||'—'}</td><td>البريد الإلكتروني</td><td>${emp.email||'—'}</td></tr>
    <tr><td>المدينة</td><td>${emp.city||'—'}</td><td>عنوان السكن</td><td>${emp.address||'—'}</td></tr>
  </table>
  <div class="section">الوثائق</div>
  <table>
    <tr><td>رقم الجواز</td><td>${emp.passportNumber||'—'}</td><td>انتهاء الجواز</td><td>${fmtDate(emp.passportExp)}</td></tr>
    <tr><td>رقم الهوية</td><td>${emp.emiratesIdNumber||'—'}</td><td>انتهاء الهوية</td><td>${fmtDate(emp.emiratesIdExp)}</td></tr>
    <tr><td>رقم بطاقة العمل</td><td>${emp.workCardNumber||'—'}</td><td>انتهاء بطاقة العمل</td><td>${fmtDate(emp.workCardExp)}</td></tr>
    <tr><td>رقم رخصة القيادة</td><td>${emp.licenseNumber||'—'}</td><td>انتهاء الرخصة</td><td>${fmtDate(emp.licenseExp)}</td></tr>
    <tr><td>إصدار الإقامة</td><td>${fmtDate(emp.residencyIssue)}</td><td>انتهاء الإقامة</td><td>${fmtDate(emp.residencyExp)}</td></tr>
  </table>
  <div class="section">التأمين والتوظيف والراتب</div>
  <table>
    <tr><td>رقم التأمين الصحي</td><td>${emp.insuranceNumber||'—'}</td><td>شركة التأمين</td><td>${emp.insuranceCompany||'—'}</td></tr>
    <tr><td>تاريخ بدء العمل</td><td>${fmtDate(emp.employmentStart)}</td><td>تاريخ انتهاء العمل</td><td>${fmtDate(emp.employmentEnd)}</td></tr>
    <tr><td>سبب انتهاء العمل</td><td>${emp.employmentEndReason||'—'}</td><td>الراتب الإجمالي</td><td>${salaryTotal.toLocaleString('en-US')} د.إ</td></tr>
  </table>
  ${extraStatusHtml}
  ${leaveRows ? `<div class="section">الإجازات</div><table><tr><th>النوع</th><th>السبب</th><th>البداية</th><th>النهاية</th><th>عدد الأيام</th></tr>${leaveRows}</table>` : ''}
  <p style="margin-top:24px; font-size:11px; color:#777;">تم إنشاء هذا التقرير تلقائيًا من نظام الماسة للموارد البشرية بتاريخ ${fmtDate(new Date())}</p>
  </body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.onload = ()=> w.print();
}

/* ---------- تصدير تقويم ICS (يعمل بدون أي إعداد) ---------- */
function exportICS(){
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Almassa HR//AR'];
  EMPLOYEES.forEach(e=>{
    if(!e.residencyExp) return;
    const expDate = new Date(e.residencyExp);
    const reminder = new Date(expDate.getTime() - 30*86400000);
    const dt = reminder.toISOString().slice(0,10).replace(/-/g,'');
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.id}-${dt}@almassa-hr`);
    lines.push(`DTSTART;VALUE=DATE:${dt}`);
    lines.push(`SUMMARY:تجديد إقامة - ${e.name} (${e.company||''})`);
    lines.push(`DESCRIPTION:تنتهي إقامة الموظف ${e.name} بتاريخ ${e.residencyExp}. يرجى بدء إجراءات التجديد.`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], {type:'text/calendar'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'تذكيرات-تجديد-الاقامات.ics';
  a.click();
}

/* ---------- تكامل Google (Drive + Calendar) ---------- */
const GDRIVE = { token:null, tokenClient:null };

function loadSettingsIntoForm(){
  const clientId = DB.get('amhr_google_client_id','');
  document.getElementById('googleClientId').value = clientId;
  updateGoogleStatus();
  const user = auth.currentUser;
  if(user){
    db.collection('team').doc(sanitizeEmailId(user.email)).get().then(snap=>{
      if(snap.exists) document.getElementById('displayNameInput').value = snap.data().name || '';
    });
  }
}

function saveGoogleClientId(){
  const val = document.getElementById('googleClientId').value.trim();
  DB.set('amhr_google_client_id', val);
  updateGoogleStatus();
  alert('تم حفظ معرّف Google Client ID');
}

function updateGoogleStatus(){
  const clientId = DB.get('amhr_google_client_id','');
  const statusEl = document.getElementById('googleStatus');
  if(!clientId){
    statusEl.textContent = 'لم يتم إعداد Google Client ID بعد — راجع ملف README لخطوات الإعداد.';
    statusEl.className = 'muted';
  } else if(GDRIVE.token){
    statusEl.textContent = 'متصل بحساب Google ✅';
    statusEl.className = 'ok-text';
  } else {
    statusEl.textContent = 'تم إعداد المعرف، اضغط "ربط حساب Google" للاتصال.';
    statusEl.className = 'muted';
  }
}

function connectGoogle(){
  const clientId = DB.get('amhr_google_client_id','');
  if(!clientId){ alert('الرجاء إدخال Google Client ID أولاً في الإعدادات'); return; }
  if(typeof google === 'undefined'){ alert('تعذر تحميل مكتبة Google، تأكد من الاتصال بالإنترنت'); return; }
  GDRIVE.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events',
    callback: (resp)=>{
      if(resp.access_token){
        GDRIVE.token = resp.access_token;
        updateGoogleStatus();
        alert('تم الاتصال بنجاح بحساب Google');
      }
    }
  });
  GDRIVE.tokenClient.requestAccessToken();
}

async function addExpiryEventsToCalendar(){
  if(!GDRIVE.token){ alert('اربط حساب Google أولاً من الإعدادات'); return; }
  const upcoming = EMPLOYEES.filter(e=>{
    const d = daysUntil(e.residencyExp);
    return d !== null && d >= 0 && d <= 90;
  });
  if(!upcoming.length){ alert('لا توجد إقامات تنتهي خلال 90 يومًا القادمة'); return; }
  let count = 0;
  for(const e of upcoming){
    const expDate = new Date(e.residencyExp);
    const reminder = new Date(expDate.getTime() - 30*86400000);
    const dateStr = reminder.toISOString().slice(0,10);
    const event = {
      summary: `تجديد إقامة - ${e.name}`,
      description: `تنتهي إقامة ${e.name} (${e.company}) بتاريخ ${e.residencyExp}`,
      start: { date: dateStr },
      end: { date: dateStr }
    };
    try{
      await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method:'POST',
        headers:{ 'Authorization':`Bearer ${GDRIVE.token}`, 'Content-Type':'application/json' },
        body: JSON.stringify(event)
      });
      count++;
    }catch(err){ console.error(err); }
  }
  alert(`تم إضافة ${count} تذكير إلى Google Calendar`);
}

/* ---------- ربط الأحداث العامة ---------- */
function bindUI(){
  document.getElementById('searchInput').addEventListener('input', e=>{
    currentFilter.q = e.target.value; renderTable();
  });
  document.getElementById('filterCompany').addEventListener('change', e=>{
    currentFilter.company = e.target.value; renderTable();
  });
  document.getElementById('filterNationality').addEventListener('change', e=>{
    currentFilter.nationality = e.target.value; renderTable();
  });
  document.getElementById('filterStatus').addEventListener('change', e=>{
    currentFilter.status = e.target.value; renderTable();
  });
  document.getElementById('modalClose').addEventListener('click', ()=>{
    document.getElementById('modalOverlay').style.display = 'none';
  });
  document.getElementById('modalOverlay').addEventListener('click', (e)=>{
    if(e.target.id === 'modalOverlay') document.getElementById('modalOverlay').style.display = 'none';
  });
  document.getElementById('exportIcsBtn').addEventListener('click', exportICS);
  document.getElementById('exportAllExcelBtn').addEventListener('click', exportAllEmployeesExcel);
  document.getElementById('addEmployeeBtn').addEventListener('click', ()=> openEmployeeModal(null));
  const addVehicleBtn = document.getElementById('addVehicleBtn');
  if(addVehicleBtn) addVehicleBtn.addEventListener('click', ()=> openVehicleModal(null));
  const vehicleSearchInput = document.getElementById('vehicleSearchInput');
  if(vehicleSearchInput){
    vehicleSearchInput.addEventListener('input', e=>{
      vehicleFilter.q = e.target.value;
      renderVehiclesTable();
    });
  }
  document.getElementById('connectGoogleBtn').addEventListener('click', connectGoogle);
  document.getElementById('saveClientIdBtn').addEventListener('click', saveGoogleClientId);
  document.getElementById('addCalendarEventsBtn').addEventListener('click', addExpiryEventsToCalendar);
  document.getElementById('exportLoginLogsBtn').addEventListener('click', exportLoginLogsExcel);
  document.getElementById('printLoginLogsBtn').addEventListener('click', printLoginLogs);

  const kpiLabels = {
    total:'', passport:'انتهاء الجواز', eid:'انتهاء الهوية', workcard:'انتهاء بطاقة العمل',
    residency:'انتهاء الإقامة', annual:'في إجازة سنوية', sick:'في إجازة مرضية', present:'على الدوام',
    license:'انتهاء رخصة القيادة',
    new:'موظفين جدد', cancelling:'قيد الإلغاء / إنهاء الخدمات', terminated:'منتهية الخدمة',
    cancelled_only:'ملغي', absconding:'بلاغ هروب', renewal_rejected:'رفض التجديد',
    labor_dispute:'منازعة عمالية', unauthorized_absence:'غياب بدون عذر', current_active:'الموظفين الحاليين'
  };
  document.querySelectorAll('.kpi-card').forEach(c=>{
    c.addEventListener('click', ()=>{
      const kpi = c.dataset.kpi;
      if(kpi === 'vehicle_exp'){
        document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));
        document.querySelector('.nav-item[data-view="vehicles"]').classList.add('active');
        document.querySelectorAll('.view').forEach(v=>v.style.display='none');
        document.getElementById('view-vehicles').style.display = 'block';
        return;
      }
      currentFilter.kpi = (kpi === 'total') ? '' : kpi;
      currentFilter.status = ''; currentFilter.q=''; currentFilter.company=''; currentFilter.nationality='';
      document.getElementById('searchInput').value = '';
      document.getElementById('filterCompany').value = '';
      document.getElementById('filterNationality').value = '';
      document.getElementById('filterStatus').value = '';
      const badge = document.getElementById('kpiFilterBadge');
      if(currentFilter.kpi){
        badge.style.display = 'inline-block';
        badge.textContent = `فلتر: ${kpiLabels[kpi]} ✕`;
      } else {
        badge.style.display = 'none';
      }
      renderTable();
    });
  });
  document.getElementById('kpiFilterBadge').addEventListener('click', ()=>{
    currentFilter.kpi = '';
    document.getElementById('kpiFilterBadge').style.display = 'none';
    renderTable();
  });

  document.querySelectorAll('.nav-item').forEach(item=>{
    item.addEventListener('click', ()=>{
      document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));
      item.classList.add('active');
      const view = item.dataset.view;
      document.querySelectorAll('.view').forEach(v=>v.style.display='none');
      document.getElementById('view-'+view).style.display = 'block';
    });
  });

  document.getElementById('addTaskBtn').addEventListener('click', addTask);
  attachDatePreviews(document.getElementById('view-tasks'));
  document.getElementById('chatSendBtn').addEventListener('click', sendChatMessage);
  document.getElementById('chatTextInput').addEventListener('keydown', e=>{
    if(e.key === 'Enter'){ e.preventDefault(); sendChatMessage(); }
  });
  document.getElementById('chatFileInput').addEventListener('change', e=>{
    const f = e.target.files[0];
    if(f) sendChatAttachment(f);
    e.target.value = '';
  });

  const saveDisplayNameBtn = document.getElementById('saveDisplayNameBtn');
  if(saveDisplayNameBtn){
    saveDisplayNameBtn.addEventListener('click', async ()=>{
      const name = document.getElementById('displayNameInput').value.trim();
      if(!name) return;
      try{
        await db.collection('team').doc(sanitizeEmailId(auth.currentUser.email)).set({ email:auth.currentUser.email, name }, { merge:true });
        alert('تم حفظ الاسم');
      }catch(e){ alert('تعذر الحفظ: ' + e.message); }
    });
  }

  const changePassBtn = document.getElementById('changePassBtn');
  if(changePassBtn){
    changePassBtn.addEventListener('click', async ()=>{
      const newP = document.getElementById('newPass').value;
      if(newP.length < 6){ alert('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل'); return; }
      try{
        await auth.currentUser.updatePassword(newP);
        alert('تم تغيير كلمة المرور بنجاح');
        document.getElementById('newPass').value='';
      }catch(e){
        alert('تعذر التغيير: ' + e.message + ' (قد تحتاج تسجيل خروج ودخول مرة أخرى ثم إعادة المحاولة)');
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', initAuth);
