# نظام الماسة للموارد البشرية

نظام ويب لمتابعة إقامات موظفي مجموعة الماسة (265 موظف)، بقاعدة بيانات مشتركة حقيقية (Firebase) — أي تعديل من أي موظف موارد بشرية يظهر فورًا لبقية الفريق، وتقدر تضيف أو تحذف حسابات الفريق في أي وقت بدون تعديل الكود.

## الملفات
- `index.html` — الواجهة الرئيسية
- `style.css` — التنسيق (كحلي/ذهبي)
- `app.js` — منطق النظام (Firebase Auth + Firestore + Storage)
- `employees-data.js` — البيانات الأولية (تُستورد تلقائيًا لقاعدة البيانات أول مرة فقط)
- `firebase-config.js` — إعدادات مشروعك في Firebase (تعبيها مرة وحدة)
- `netlify.toml` — إعدادات النشر

---

## الخطوة 1: إنشاء مشروع Firebase (مجاني)

1. ادخل https://console.firebase.google.com وسجّل دخول بحساب Google
2. Add project → سمّه مثلاً "almassa-hr" → أكمل الخطوات (تقدر تعطّل Google Analytics)
3. من القائمة الجانبية:
   - **Authentication** → Get started → فعّل مزود **Email/Password**
   - **Firestore Database** → Create database → اختر أي موقع قريب (مثل `eur3` أو `me-central1` إذا متوفر) → ابدأ في **وضع الإنتاج (Production mode)**
   - **Storage** → Get started → نفس الموقع → وضع الإنتاج
4. من ⚙️ Project settings → في تبويب General، انزل إلى "Your apps" → اضغط أيقونة الويب `</>` → سجّل اسم التطبيق → انسخ كائن `firebaseConfig`
5. الصق القيم داخل ملف `firebase-config.js` في مكان `FIREBASE_CONFIG` (كل الحقول: apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId)

## الخطوة 2: إضافة حسابات فريق الموارد البشرية

من Firebase Console → Authentication → Users → **Add user**، أدخل البريد وكلمة مرور مبدئية لكل موظف موارد بشرية (سعيد، أسماء، مريم، إلخ...، وأي عدد إضافي مستقبلًا). كل موظف يقدر يغيّر كلمة مروره لاحقًا من داخل النظام نفسه (الإعدادات → حسابي).

لحذف أو تعطيل أي شخص لاحقًا: نفس الصفحة → اختر المستخدم → Disable/Delete.

## الخطوة 3: قواعد الأمان (Security Rules)

هذه القواعد تسمح فقط للمسجّلين دخول (حسابات فريقك) بالقراءة/الكتابة، وتمنع أي زائر خارجي:

**Firestore rules** (Firestore Database → Rules):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**Storage rules** (Storage → Rules):
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```
انسخ كل قاعدة والصقها في مكانها، ثم اضغط **Publish**.

## الخطوة 4: النشر على Netlify

**الأسهل — السحب والإفلات:**
1. افتح https://app.netlify.com/drop
2. اسحب مجلد `almassa-hr` بالكامل (بعد ما تعبّي `firebase-config.js`)
3. سيصدر لك رابط مباشر خلال ثوانٍ

**عبر Git:** ارفع المجلد لمستودع، ثم من Netlify: New site from Git → Publish directory: `.`

**عبر CLI:**
```
npm install -g netlify-cli
cd almassa-hr
netlify deploy --prod
```

⚠️ بعد أول نشر، افتح الرابط وسجّل دخول بأحد حسابات الفريق — أول تسجيل دخول ناجح يستورد بيانات الـ 265 موظف تلقائيًا لقاعدة البيانات (يحصل مرة وحدة فقط).

## الخطوة 5 (اختياري): ربط Google Drive و Google Calendar
هذا التكامل منفصل عن Firebase ويعمل من متصفح المستخدم مباشرة:

1. ادخل https://console.cloud.google.com (يمكن استخدام نفس مشروع Firebase)
2. من "APIs & Services" فعّل: **Google Drive API** و **Google Calendar API**
3. من "Credentials" أنشئ **OAuth Client ID** من نوع **Web application**
4. أضف رابط موقعك على Netlify ضمن **Authorized JavaScript origins**
5. انسخ الـ Client ID والصقه من داخل النظام: الإعدادات والتكامل → Google Client ID
6. اضغط "ربط حساب Google"

**بديل بدون أي إعداد:** زر "تصدير تذكيرات (ICS)" في لوحة المتابعة يعمل فورًا بدون Client ID.

---

## كيف يعمل التزامن؟
- بيانات الموظفين (التواريخ، الملاحظات) محفوظة في Firestore — أي تعديل يحفظه أي شخص من الفريق يظهر فورًا للجميع (بدون Refresh).
- المستندات المرفقة تُرفع إلى Firebase Storage وتظهر لكل الفريق أيضًا.
- كل مستخدم يسجّل دخول بحسابه الخاص، وتقدر تتابع أي حساب رفع أي مستند (`uploadedBy` محفوظ مع كل ملف).

## ⚠️ تنبيه أمني
باسوردات حسابات الهيئة الاتحادية للهوية والجنسية (كانت في الشيت الثاني من ملف Excel الأصلي) **لم تُدرج** في هذا النظام عمدًا — يُفضّل إبقاؤها في مدير كلمات مرور منفصل وليس داخل أي تطبيق ويب حتى لو كان محميًا بتسجيل دخول.

## تحديث بيانات الموظفين لاحقًا
البيانات الأولى مستوردة تلقائيًا مرة واحدة من `employees-data.js`. أي تعديل بعد ذلك يتم مباشرة من داخل النظام (قاعدة البيانات هي المصدر الوحيد بعد الاستيراد الأول)، ولإضافة موظفين جدد بشكل جماعي مستقبلاً، أرسل لي الملف المحدث وسأجهز لك طريقة استيراد إضافية.
