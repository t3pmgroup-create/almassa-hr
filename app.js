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
let currentFilter = { q:'', company:'', nationality:'', status:'' };
let activeEmployeeId = null;
let unsubscribeEmployees = null;

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

const CRITICAL_NOTES = ['هروب','مرفوض تجديد إقامة','تم الكنسلة'];

function getStatus(emp){
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
  return d.toLocaleDateString('ar-AE', { year:'numeric', month:'2-digit', day:'2-digit' });
}

function daysBetween(a,b){
  return Math.round((new Date(b) - new Date(a)) / 86400000);
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
    }catch(ex){
      err.textContent = translateAuthError(ex.code);
      err.style.display = 'block';
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', ()=>{
    if(unsubscribeEmployees) unsubscribeEmployees();
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
  subscribeEmployees();
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
  let passport=0, eid=0, workCard=0, residency=0, annual=0, sick=0, onLeaveAny=0;
  EMPLOYEES.forEach(e=>{
    if(isDocIssue(e.passportExp)) passport++;
    if(isDocIssue(e.emiratesIdExp)) eid++;
    if(isDocIssue(e.workCardExp)) workCard++;
    if(isDocIssue(e.residencyExp)) residency++;
    if(isOnLeaveToday(e,'سنوية')) annual++;
    if(isOnLeaveToday(e,'مرضية')) sick++;
    if(isOnLeaveToday(e)) onLeaveAny++;
  });
  document.getElementById('kpiTotal').textContent = total;
  document.getElementById('kpiTotalLabel').textContent = total;
  document.getElementById('kpiPassport').textContent = passport;
  document.getElementById('kpiEid').textContent = eid;
  document.getElementById('kpiWorkCard').textContent = workCard;
  document.getElementById('kpiResidency').textContent = residency;
  document.getElementById('kpiAnnualLeave').textContent = annual;
  document.getElementById('kpiSickLeave').textContent = sick;
  document.getElementById('kpiPresent').textContent = total - onLeaveAny;
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

function applyFilters(list){
  return list.filter(e=>{
    if(currentFilter.q){
      const q = normalizeAr(currentFilter.q);
      if(!normalizeAr(e.name).includes(q)) return false;
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

/* ---------- الجدول ---------- */
function renderTable(){
  const list = applyFilters(EMPLOYEES);
  const tbody = document.getElementById('tableBody');
  document.getElementById('resultCount').textContent = `${list.length} من ${EMPLOYEES.length}`;
  if(list.length === 0){
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">لا توجد نتائج مطابقة</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(e=>{
    const s = getStatus(e);
    return `<tr data-id="${e.id}" class="row-clickable">
      <td class="cell-name">${e.name}</td>
      <td>${e.nationality || '—'}</td>
      <td>${e.company || '—'}</td>
      <td>${fmtDate(e.residencyIssue)}</td>
      <td>${fmtDate(e.residencyExp)}</td>
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
  return { name:'', nationality:'', company:'', workCardExp:'', residencyIssue:'', residencyExp:'', note:'',
    passportExp:'', emiratesIdExp:'', phone:'', email:'', address:'', city:'', education:'', jobTitle:'',
    insuranceNumber:'', insuranceCompany:'', employmentStart:'', employmentEnd:'', employmentEndReason:'',
    salaryBasic:0, salaryAllowances:0, leaves:[] };
}

function openEmployeeModal(id){
  activeEmployeeId = id;
  const isNew = (id === null);
  const emp = isNew ? emptyEmployee() : EMPLOYEES.find(e=>e.id===id);
  if(!emp) return;
  document.getElementById('modalTitle').textContent = isNew ? 'إضافة موظف جديد' : emp.name;

  const cityOptions = ['<option value="">—</option>'].concat(
    CITIES.map(c=>`<option value="${c}" ${emp.city===c?'selected':''}>${c}</option>`)
  ).join('');
  const endReasonOptions = ['<option value="">—</option>'].concat(
    END_REASONS.map(r=>`<option value="${r}" ${emp.employmentEndReason===r?'selected':''}>${r}</option>`)
  ).join('');

  const tenureDays = emp.employmentStart ? daysBetween(emp.employmentStart, emp.employmentEnd || new Date().toISOString().slice(0,10)) : null;
  const salaryTotal = (parseFloat(emp.salaryBasic)||0) + (parseFloat(emp.salaryAllowances)||0);

  document.getElementById('modalBody').innerHTML = `
    <h4 class="section-title">البيانات الأساسية</h4>
    <div class="modal-grid">
      <div class="field"><label class="lbl">الاسم</label><input type="text" id="editName" value="${emp.name||''}"></div>
      <div class="field"><label class="lbl">الجنسية</label><input type="text" id="editNationality" value="${emp.nationality||''}"></div>
      <div class="field"><label class="lbl">الشركة</label><input type="text" id="editCompany" value="${emp.company||''}"></div>
      <div class="field"><label class="lbl">المهنة في الشركة</label><input type="text" id="editJobTitle" value="${emp.jobTitle||''}"></div>
      <div class="field"><label class="lbl">المؤهل الدراسي</label><input type="text" id="editEducation" value="${emp.education||''}"></div>
      <div class="field"><label class="lbl">ملاحظة</label><input type="text" id="editNote" value="${emp.note||''}"></div>
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
      <div class="field"><label class="lbl">انتهاء الهوية</label><input type="date" id="editEidExp" value="${emp.emiratesIdExp||''}"></div>
      <div class="field"><label class="lbl">انتهاء بطاقة العمل</label><input type="date" id="editWorkCard" value="${emp.workCardExp||''}"></div>
      <div class="field"><label class="lbl">إصدار الإقامة</label><input type="date" id="editIssue" value="${emp.residencyIssue||''}"></div>
      <div class="field"><label class="lbl">انتهاء الإقامة</label><input type="date" id="editExp" value="${emp.residencyExp||''}"></div>
    </div>

    <h4 class="section-title" style="margin-top:18px;">التأمين الصحي</h4>
    <div class="modal-grid">
      <div class="field"><label class="lbl">رقم التأمين الصحي</label><input type="text" id="editInsuranceNumber" value="${emp.insuranceNumber||''}"></div>
      <div class="field"><label class="lbl">شركة التأمين</label><input type="text" id="editInsuranceCompany" value="${emp.insuranceCompany||''}"></div>
    </div>

    <h4 class="section-title" style="margin-top:18px;">التوظيف والراتب</h4>
    <div class="modal-grid">
      <div class="field"><label class="lbl">تاريخ بدء العمل</label><input type="date" id="editEmpStart" value="${emp.employmentStart||''}"></div>
      <div class="field"><label class="lbl">تاريخ انتهاء العمل</label><input type="date" id="editEmpEnd" value="${emp.employmentEnd||''}"></div>
      <div class="field"><label class="lbl">سبب انتهاء العمل</label><select id="editEndReason">${endReasonOptions}</select></div>
      <div class="field"><label class="lbl">الراتب الأساسي</label><input type="number" id="editSalaryBasic" value="${emp.salaryBasic||0}"></div>
      <div class="field"><label class="lbl">البدلات</label><input type="number" id="editSalaryAllowances" value="${emp.salaryAllowances||0}"></div>
      <div><span class="lbl">الراتب الإجمالي</span><span class="val" id="salaryTotalDisplay">${salaryTotal.toLocaleString('ar-AE')} د.إ</span></div>
      ${tenureDays !== null ? `<div><span class="lbl">عدد أيام العمل بالشركة</span><span class="val">${tenureDays} يوم</span></div>` : ''}
    </div>

    <button class="btn-gold" id="saveEmpBtn" style="margin-top:16px;">${isNew ? 'إضافة الموظف' : 'حفظ التعديلات'}</button>
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
    document.getElementById('salaryTotalDisplay').textContent = t.toLocaleString('ar-AE') + ' د.إ';
  };
  basicInput.addEventListener('input', updateTotal);
  allowInput.addEventListener('input', updateTotal);

  document.getElementById('saveEmpBtn').addEventListener('click', isNew ? addNewEmployee : saveEmployeeEdits);

  if(!isNew){
    document.getElementById('fileInput').addEventListener('change', handleFiles);
    document.getElementById('addLeaveBtn').addEventListener('click', addLeave);
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
    phone: document.getElementById('editPhone').value.trim(),
    email: document.getElementById('editEmail').value.trim(),
    city: document.getElementById('editCity').value,
    address: document.getElementById('editAddress').value.trim(),
    passportExp: document.getElementById('editPassportExp').value || null,
    emiratesIdExp: document.getElementById('editEidExp').value || null,
    workCardExp: document.getElementById('editWorkCard').value || null,
    residencyIssue: document.getElementById('editIssue').value || null,
    residencyExp: document.getElementById('editExp').value || null,
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
  status.textContent = 'جاري الإضافة...';
  const newId = EMPLOYEES.length ? Math.max(...EMPLOYEES.map(e=>e.id)) + 1 : 1;
  data.id = newId;
  data.leaves = [];
  try{
    await db.collection('employees').doc(String(newId)).set(data);
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
  try{
    await db.collection('employees').doc(String(activeEmployeeId)).update(updates);
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
      leaves: firebase.firestore.FieldValue.arrayUnion(newLeave)
    });
    status.textContent = 'تمت إضافة الإجازة ✓';
    document.getElementById('leaveReason').value = '';
    document.getElementById('leaveStart').value = '';
    document.getElementById('leaveEnd').value = '';
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
      leaves: firebase.firestore.FieldValue.arrayRemove(leave)
    });
    setTimeout(renderLeaveList, 400);
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
    renderDocList();
    renderTable();
  }catch(e){ alert('تعذر الحذف: ' + e.message); }
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
  document.getElementById('addEmployeeBtn').addEventListener('click', ()=> openEmployeeModal(null));
  document.getElementById('connectGoogleBtn').addEventListener('click', connectGoogle);
  document.getElementById('saveClientIdBtn').addEventListener('click', saveGoogleClientId);
  document.getElementById('addCalendarEventsBtn').addEventListener('click', addExpiryEventsToCalendar);

  document.querySelectorAll('.kpi-card').forEach(c=>{
    c.addEventListener('click', ()=>{
      if(c.dataset.status !== undefined){
        currentFilter.status = c.dataset.status || '';
        document.getElementById('filterStatus').value = currentFilter.status;
        renderTable();
      }
    });
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
