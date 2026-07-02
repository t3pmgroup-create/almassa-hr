/* ===================== نظام الماسة للموارد البشرية (Firebase) ===================== */

let auth, db, storage;

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

/* ---------- حساب حالة الإقامة ---------- */
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

function fmtDate(s){
  if(!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('ar-AE', { year:'numeric', month:'2-digit', day:'2-digit' });
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

/* استيراد أولي إذا كانت قاعدة البيانات فارغة (أول تشغيل فقط) */
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
  let expired=0, soon=0, ok=0, critical=0;
  EMPLOYEES.forEach(e=>{
    const s = getStatus(e);
    if(s.key==='expired') expired++;
    else if(s.key==='soon') soon++;
    else if(s.key==='ok') ok++;
    else if(s.key==='critical') critical++;
  });
  document.getElementById('kpiTotal').textContent = total;
  document.getElementById('kpiExpired').textContent = expired;
  document.getElementById('kpiSoon').textContent = soon;
  document.getElementById('kpiOk').textContent = ok;
  document.getElementById('kpiCritical').textContent = critical;
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

function applyFilters(list){
  return list.filter(e=>{
    if(currentFilter.q){
      const q = currentFilter.q.trim();
      if(!e.name.includes(q)) return false;
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

/* ---------- نافذة تفاصيل/تعديل الموظف ---------- */
function openEmployeeModal(id){
  activeEmployeeId = id;
  const emp = EMPLOYEES.find(e=>e.id===id);
  if(!emp) return;
  document.getElementById('modalTitle').textContent = emp.name;
  document.getElementById('modalBody').innerHTML = `
    <div class="modal-grid">
      <div><span class="lbl">الجنسية</span><span class="val">${emp.nationality||'—'}</span></div>
      <div><span class="lbl">الشركة</span><span class="val">${emp.company||'—'}</span></div>
      <div class="field"><label class="lbl">انتهاء بطاقة العمل</label><input type="date" id="editWorkCard" value="${emp.workCardExp||''}"></div>
      <div class="field"><label class="lbl">إصدار الإقامة</label><input type="date" id="editIssue" value="${emp.residencyIssue||''}"></div>
      <div class="field"><label class="lbl">انتهاء الإقامة</label><input type="date" id="editExp" value="${emp.residencyExp||''}"></div>
      <div class="field"><label class="lbl">ملاحظة</label><input type="text" id="editNote" value="${emp.note||''}"></div>
    </div>
    <button class="btn-gold" id="saveEmpBtn" style="margin-top:12px;">حفظ التعديلات</button>
    <p id="saveEmpStatus" class="muted" style="margin-top:8px;"></p>
    <hr class="divider">
    <h4 class="section-title">المستندات المرفقة</h4>
    <div id="docList" class="doc-list"><p class="muted">جاري التحميل...</p></div>
    <label class="upload-drop" id="uploadDrop">
      <input type="file" id="fileInput" multiple hidden>
      <span>📎 اسحب الملفات هنا أو اضغط للاختيار (تُرفع لجميع الفريق)</span>
    </label>
  `;
  document.getElementById('saveEmpBtn').addEventListener('click', saveEmployeeEdits);
  document.getElementById('fileInput').addEventListener('change', handleFiles);
  renderDocList();
  document.getElementById('modalOverlay').style.display = 'flex';
}

async function saveEmployeeEdits(){
  const status = document.getElementById('saveEmpStatus');
  status.textContent = 'جاري الحفظ...';
  const updates = {
    workCardExp: document.getElementById('editWorkCard').value || null,
    residencyIssue: document.getElementById('editIssue').value || null,
    residencyExp: document.getElementById('editExp').value || null,
    note: document.getElementById('editNote').value || ''
  };
  try{
    await db.collection('employees').doc(String(activeEmployeeId)).update(updates);
    status.textContent = 'تم الحفظ ✓ — التعديل ظاهر الآن لكل الفريق';
  }catch(e){
    status.textContent = 'تعذر الحفظ: ' + e.message;
  }
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
  document.getElementById('connectGoogleBtn').addEventListener('click', connectGoogle);
  document.getElementById('saveClientIdBtn').addEventListener('click', saveGoogleClientId);
  document.getElementById('addCalendarEventsBtn').addEventListener('click', addExpiryEventsToCalendar);

  document.querySelectorAll('.kpi-card').forEach(c=>{
    c.addEventListener('click', ()=>{
      currentFilter.status = c.dataset.status || '';
      document.getElementById('filterStatus').value = currentFilter.status;
      renderTable();
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
