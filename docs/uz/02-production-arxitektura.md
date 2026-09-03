# Production arxitekturasi — to'liq texnik kitob (2-versiya)

Biznes muammodan production darajasigacha: Google qatlami, Cloudflare, Service Account, private verification, revoke, migratsiya, xavfsizlik testlari va ekspluatatsiya.

> Bu — loyiha davomida yozilgan asl texnik kitoblardan biri, o'zbek tilida.
> Ommaviy repo uchun real identifikatorlar (domen, Drive/Sheets ID, GCP loyiha,
> Worker nomi, elektron pochta, ism) o'rniga placeholder qo'yilgan, konsol
> skrinshotlari esa olib tashlangan.
> Inglizcha qisqartirilgan hujjatlar: [`../en/`](../en/)

---

**VIVAMED**

**Elektron Hujjat va QR Verifikatsiya Tizimi**

Arxitektura • Dasturlash • Xavfsizlik • Ekspluatatsiya

**TEXNIK KITOB — 2-VERSIYA**

*Yakuniy production arxitekturasining qisqa ko‘rinishi*

Holat: production-ready asosiy xavfsizlik bosqichlari testdan o‘tgan  
28.08.2026 • Toshkent

# Kirish

Ushbu kitob VivaMed elektron hujjat va QR orqali tekshirish tizimini qayta qurish, mustahkamlash va production darajasiga olib chiqish jarayonini boshidan oxirigacha hujjatlashtiradi. Maqsad — tizimni keyinchalik boshqa dasturchi, administrator yoki texnik mutaxassis qabul qilganda “nima qilingan?”, “qayerda qilingan?”, “nima uchun shunday qilingan?” va “nosozlik bo‘lsa qayerdan boshlash kerak?” savollariga javob topa olishi.

Kitob amalda bajarilgan ishlar asosida yozilgan. Unda Google Drive, Google Sheets, Google Apps Script, Google Cloud Service Account, Cloudflare Worker, custom domain, private PDF gateway, HMAC signed-link, REVOKE mexanizmi, SHA-256 fingerprint, permission migratsiyasi va yakuniy security testlar bir butun tizim sifatida tushuntiriladi.

|                                                                                                                                                      |
|------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Muhim —** Maxfiy secret qiymatlari va private key kitobga kiritilmagan. Ular Cloudflare Secret va Google credential sifatida alohida himoyalanadi. |

## Kitobdan qanday foydalanish

- 1–7-boblar: biznes muammo, hujjat lifecycle va Google qatlami.

- 8–14-boblar: Cloudflare, Service Account va private verification arxitekturasi.

- 15–18-boblar: revoke, migration va real security testlar.

- 19–22-boblar: ekspluatatsiya, recovery, maintenance va keyingi rivojlantirish.

# Mundarija

1\. Loyiha maqsadi va threat model

2\. Yakuniy arxitektura

3\. Google Drive strukturasi

4\. Google Sheets reyestri A–P

5\. Apps Script modul arxitekturasi

6\. Tasdiqlash pipeline: PDF → QR → SHA-256

7\. QR va public verification URL

8\. Cloudflare va verify.example.com

9\. Google Cloud Service Account

10\. Worker runtime secrets

11\. Worker → Google Sheets API

12\. Private PDF gateway

13\. 5 daqiqalik HMAC signed-link

14\. Drive Restricted va permission modeli

15\. REVOKE mexanizmi

16\. Eski PDF’larni bir martada private qilish

17\. Production hardening: health va workers.dev

18\. Yakuniy security testlar

19\. Operatsion qo‘llanma

20\. Nosozliklarni diagnostika qilish

21\. Recovery va rollback

22\. Maintenance va keyingi bosqichlar

Ilova A. Konfiguratsiya snapshoti

Ilova B. Muhim kod fragmentlari

Ilova C. Yakuniy checklist va atamalar

# 1. Loyiha maqsadi va threat model

VivaMed’dan tashqariga chiqqan PDF yoki qog‘oz hujjat keyinchalik bemor, tashkilot, ish beruvchi yoki boshqa uchinchi tomon tomonidan tekshirilishi mumkin. Oddiy blank, imzo yoki muhr hujjatning raqamli reyestrda haqiqiy ekanini isbotlamaydi. Shu sabab har bir tasdiqlangan hujjat unikal raqam va maxfiy token bilan reyestrga yoziladi; PDF ichidagi QR aynan shu yozuvga olib boradi.

## 1.1. Biz himoya qilayotgan narsalar

- Tasdiqlangan PDF nusxaning rasmiyligi.

- Hujjatning ACTIVE yoki REVOKED holati.

- Google Drive’dagi PDF’ning public bo‘lib ketmasligi.

- Google Sheets reyestrining internetga ochilmasligi.

- Token topilsa ham /file havolasining cheksiz ishlamasligi.

- Alternativ workers.dev domenidan production tizimiga kirishni bloklash.

## 1.2. Asosiy threatlar

|                                    |                                                     |                                                      |
|------------------------------------|-----------------------------------------------------|------------------------------------------------------|
| **Threat**                         | **Oldingi xavf**                                    | **Hozirgi himoya**                                   |
| Hujjat raqamini taxmin qilish      | Ketma-ket docNo yolg‘iz yetarli bo‘lishi mumkin edi | QR token bilan juftlik                               |
| PDF public link tarqalishi         | Anyone with the link orqali qayta tarqatish         | Drive Restricted + Worker gateway                    |
| Bekor qilingan hujjat ishlatilishi | Eski PDF qo‘lda yurishda qoladi                     | REVOKED status har /file so‘rovda qayta tekshiriladi |
| Signed link nusxalanishi           | Link uzoq ishlashi mumkin                           | 5 daqiqalik exp + HMAC                               |
| Alternativ domen                   | workers.dev orqali bypass                           | Host restriction → 404                               |

# 2. Yakuniy production arxitektura

*Rasm 2.1. Yakuniy arxitektura: public user Google xizmatlariga bevosita chiqmaydi*

Arxitekturaning markaziy qarori — public verification va ichki hujjat yaratish qatlamlarini ajratish. Apps Script xodim tomondagi approval engine bo‘lib qoladi. Cloudflare Worker esa public read path’ni boshqaradi. Worker Google Sheets va Google Drive’ga Service Account orqali read-only kiradi.

Xodim → Apps Script → PDF + QR → Registry + Private Drive

↑

Foydalanuvchi → verify.example.com → Cloudflare Worker

↓

Service Account (read-only)

├─ Sheets API

└─ Drive API

|                                                                                                                                                             |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Arxitektura qarori —** Apps Script Web App rollback uchun saqlab qolingan, lekin production public verification path Worker → Google API orqali ishlaydi. |

# 3. Google Drive strukturasi

My Drive ichida hujjat lifecycle’ini jismonan ajratadigan uchta operatsion papka yaratildi. Bu papkalar koddagi holat bilan birga ishlaydi.

|                          |                                     |                              |
|--------------------------|-------------------------------------|------------------------------|
| **Papka**                | **Vazifa**                          | **Xavfsizlik roli**          |
| 01 — Tasdiqlanishi kerak | Xodim yuborgan kiruvchi hujjatlar   | Approval navbati             |
| 02 — Tasdiqlangan        | QR qo‘yilgan final PDF’lar          | Private / Restricted storage |
| 03 — Arxiv               | Tasdiqlangan hujjatning asl manbasi | Tarix va audit               |

VivaMed Hujjat NEW/

├── 01 — Tasdiqlanishi kerak

├── 02 — Tasdiqlangan

└── 03 — Arxiv

Final PDF Approved papkaga yozilgach, original manba Arxivga ko‘chadi. Registry yozuvi muvaffaqiyatsiz bo‘lsa, orphan PDF qoldirmaslik uchun cleanup mantiqi mavjud.

# 4. Google Sheets — markaziy reyestr

Reyestr tizimning haqiqat manbai (source of truth) hisoblanadi. Worker QR tokenni, statusni, fileId’ni va revoke ma’lumotlarini aynan shu jadvaldan o‘qiydi.

*Rasm 4.1. Google Sheets reyestrida A–P ustunlar va ACTIVE/SHA-256 ma’lumotlari*

|           |                     |                             |
|-----------|---------------------|-----------------------------|
| **Ustun** | **Nomi**            | **Ma’nosi**                 |
| A         | Hujjat raqami       | VM-PDF-YYYY-NNNNNN          |
| B         | Fayl nomi           | Final PDF nomi              |
| C         | File ID             | Approved PDF Drive ID       |
| D         | Manba File ID       | Original fayl ID            |
| E         | Yubordi             | Uploader audit              |
| F         | Yaratilgan sana     | Tasdiqlash vaqti            |
| G         | Tekshirish havolasi | Public QR URL               |
| H         | Jo‘natildi          | Email holati                |
| I         | Jo‘natilgan sana    | Email timestamp             |
| J         | Token               | QR bearer token             |
| K         | Tasdiqladi          | Approver audit              |
| L         | STATUS              | RESERVED/ACTIVE/REVOKED/... |
| M         | FILE_SHA256         | Final PDF fingerprint       |
| N         | REVOKED_AT          | Bekor qilingan vaqt         |
| O         | REVOKED_BY          | Bekor qilgan shaxs          |
| P         | REVOKE_REASON       | Bekor qilish sababi         |

## 4.1. Status lifecycle

*Rasm 4.2. Hujjatning lifecycle va status oqimi*

|            |                                                    |                                            |
|------------|----------------------------------------------------|--------------------------------------------|
| **Status** | **Qachon ishlatiladi**                             | **Public natija**                          |
| RESERVED   | DocNo/token ajratilgan, final PDF hali tayyor emas | Topilmadi                                  |
| ACTIVE     | Final PDF va registry muvaffaqiyatli               | Hujjat haqiqiy                             |
| FAILED     | Approval pipeline xato bilan tugagan               | Topilmadi                                  |
| REVOKED    | Keyinchalik bekor qilingan                         | Hujjat bekor qilingan                      |
| EXPIRED    | Kelajakda amal muddati tugashi uchun               | Topilmadi yoki maxsus holat                |
| SUPERSEDED | Yangi versiya bilan almashtirilgan                 | Topilmadi yoki yangi hujjatga yo‘naltirish |

# 5. Google Apps Script modul arxitekturasi

Standalone Apps Script loyihasi xodim tomondagi hujjat yaratish va boshqarish engine’idir. Kod bir faylga tiqilmagan; vazifalar modul bo‘yicha ajratilgan.

|                 |                                                               |
|-----------------|---------------------------------------------------------------|
| **Fayl**        | **Rol**                                                       |
| appsscript.json | Manifest, OAuth scopes va Drive add-on konfiguratsiyasi       |
| Config.gs       | Sheets va Sozlamalar qiymatlarini o‘qish                      |
| Registry.gs     | DocNo/token rezerv, fill, revoke, send va verification lookup |
| PdfStamp.gs     | PDF ustiga QR va imzo/label joylashtirish                     |
| Code.gs         | Add-on UI, approval pipeline, mail, revoke                    |
| WebApp.gs       | Oldingi/rollback JSON backend                                 |
| Verify.html     | Apps Script’dagi oldingi verification UI                      |

## 5.1. Advanced Drive API

Drive API v3 advanced service yoqilgan. Bu Office fayllarni conversion qilish va permissionlarni aniq boshqarish kabi joylarda kerak bo‘ladi. Apps Script OAuth scopes Drive, Sheets, Gmail send, external request va user email kabi zarur huquqlar bilan cheklangan.

# 6. Tasdiqlash pipeline: PDF → QR → SHA-256

Approval jarayoni bir nechta transactional qadamdan iborat. Maqsad: registry va final PDF o‘zaro mos bo‘lsin, xato yuz bersa yarim tayyor hujjat qolmasin.

1.  Registry.reserve() orqali docNo va token ajratiladi.

2.  Public verify URL verify.example.com/v/\<docNo\>?t=\<token\> ko‘rinishida quriladi.

3.  Manba fayl PDF’ga konvertatsiya qilinadi.

4.  QR PNG yaratiladi.

5.  PdfStamp.stamp() final PDF bytes hosil qiladi.

6.  Aynan final bytes uchun SHA-256 hisoblanadi.

7.  Approved papkaga private PDF yoziladi.

8.  Registry.fill() fileId, verifyUrl va hashni yozib STATUS=ACTIVE qiladi.

9.  Original fayl Arxivga ko‘chadi.

var finalBytes = toByteArray\_(stamped);

var fileSha256 = sha256Hex\_(finalBytes);

var blob = Utilities.newBlob(finalBytes, MIME_PDF, newName);

newFile = approvedFolder.createFile(blob);

Registry.fill(reserved.row, {

fileName: newName,

fileId: newFile.getId(),

sourceId: fileId,

uploadedBy: uploadedBy,

approvedBy: approvedBy,

verifyUrl: verifyUrl,

fileSha256: fileSha256

});

|                                                                                                                                               |
|-----------------------------------------------------------------------------------------------------------------------------------------------|
| **Muhim o‘zgarish —** newFile.setSharing(ANYONE_WITH_LINK, VIEW) olib tashlandi. Shuning uchun yangi Approved PDF avtomatik public bo‘lmaydi. |

# 7. QR va public verification URL

QR ichida Google Apps Script URL emas, klinika nazorat qiladigan public domen yoziladi. Bu foydalanuvchi ishonchi va keyingi arxitektura mustaqilligi uchun muhim.

https://verify.example.com/v/VM-PDF-2026-000009?t=\<TOKEN\>

Worker path’dan docNo’ni, query string’dan t tokenni oladi. Hujjat raqami topilib, token mos kelmasa ham foydalanuvchiga “token noto‘g‘ri” deyilmaydi; mavjudlikni oshkor qilmaslik uchun oddiy “Hujjat topilmadi” qaytariladi.

*Rasm 7.1. Mobil verification sahifasi: ACTIVE hujjat uchun “Hujjat haqiqiy” holati*

# 8. Cloudflare va verify.example.com

example.com domeni Cloudflare zone sifatida boshqarildi. verify.example.com subdomeni Worker’ga Custom Domain sifatida ulandi. Public foydalanuvchining manzil satrida Google domeni ko‘rinmaydi.

*Rasm 8.1. Worker’ga verify.example.com domenini ulash jarayoni*

*Rasm 8.2. Cloudflare Domains: production workers.dev URL va verify.example.com Custom Domain*

Cloudflare Worker nomi <worker-name>. Custom domain production uchun asosiy endpoint. workers.dev URL mavjud bo‘lsa ham host-level restriction sabab verification ishlamaydi.

# 9. Google Cloud Service Account

Public Worker Google hisobining shaxsiy sessiyasidan foydalana olmaydi. Shu sabab Google Cloud’da alohida read-only Service Account yaratildi. U faqat kerakli Sheet va Approved papkaga Viewer huquqi bilan qo‘shildi.

|                       |                                        |
|-----------------------|----------------------------------------|
| **Element**           | **Qiymat / tamoyil**                   |
| Google Cloud project  | VivaMed Verify Security                |
| Service Account       | VivaMed Verify Reader                  |
| Project IAM role      | Berilmagan — least privilege           |
| Google Drive API      | Enabled                                |
| Google Sheets API     | Enabled                                |
| Approved papka access | Viewer                                 |
| Registry Sheet access | Viewer                                 |
| OAuth scope           | drive.readonly + spreadsheets.readonly |

|                                                                                                                                                                                               |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Least privilege —** Service Account’ga butun Google Drive yoki Project-level keng rol berilmagan. Uning real imkoniyati share qilingan resurslar va read-only OAuth scope bilan cheklangan. |

# 10. Worker runtime variables va secrets

Cloudflare Worker konfiguratsiyasi kod ichiga credential yozmasdan environment orqali boshqariladi.

|                          |          |                                       |
|--------------------------|----------|---------------------------------------|
| **Nomi**                 | **Turi** | **Vazifa**                            |
| GCP_SERVICE_ACCOUNT_JSON | Secret   | Service Account credential JSON       |
| FILE_TICKET_SECRET       | Secret   | HMAC signed-link secret               |
| GOOGLE_SHEETS_ID         | Text     | Registry spreadsheet identifikatori   |
| APPROVED_FOLDER_ID       | Text     | Private Approved papka identifikatori |

|                                                                                                                                                                                |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Secret boshqaruvi —** Secret qiymatini screenshotga, Git repository’ga yoki chatga joylamaslik kerak. FILE_TICKET_SECRET kamida 32 bayt kuchli random qiymat bo‘lishi kerak. |

*Rasm 10.1. Cloudflare Worker konfiguratsiyasi va environment sozlamalari*

# 11. Worker → Google Sheets API

Verification jarayonida Worker Apps Script Web App’ga murojaat qilmaydi. Service Account JWT orqali Google OAuth access token olinadi va Sheets API’dan Reyesr!A2:P o‘qiladi.

const sheetsUrl =

"https://sheets.googleapis.com/v4/spreadsheets/" +

encodeURIComponent(env.GOOGLE_SHEETS_ID) +

"/values/" + encodeURIComponent("Reyestr!A2:P") +

"?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE";

Qidiruv eng yangi qatordan orqaga qarab bajariladi. docNo mos kelgach token constant-time taqqoslash bilan tekshiriladi. Blank legacy STATUS vaqtincha ACTIVE deb talqin qilinadi.

## 11.1. Google OAuth JWT

Worker Service Account private key bilan RS256 JWT assertion imzolaydi. aud — Google OAuth token endpoint, scope — faqat Drive/Sheets read-only. Access token olinib, keyingi API chaqiriqlarida Bearer token sifatida ishlatiladi.

# 12. Private PDF gateway

Eng katta xavfsizlik o‘zgarishi — PDF public Drive linkdan chiqarildi. ACTIVE verification sahifasi endi drive.google.com URL bermaydi. Worker /file/\<docNo\> route orqali PDF’ni private Drive’dan stream qiladi.

User

↓

verify.example.com/file/\<docNo\>?exp=...&mode=view&sig=...

↓

Worker signed ticketni tekshiradi

↓

Registry STATUS yana tekshiriladi

↓

Drive metadata: mimeType + parents

↓

Approved folder mosligi tekshiriladi

↓

Drive API ?alt=media

↓

application/pdf stream

Gateway har safar STATUS’ni qayta tekshiradi. Demak signed link yaratilgandan keyin hujjat REVOKED qilinsa, linkning 5 daqiqasi tugamagan bo‘lsa ham PDF berilmaydi.

## 12.1. Defense-in-depth checks

- exp va sig mavjud bo‘lishi shart.

- mode faqat view yoki download.

- HMAC imzo mos bo‘lishi shart.

- Registry yozuvi ACTIVE bo‘lishi shart.

- fileId mavjud bo‘lishi shart.

- Drive metadata mimeType application/pdf bo‘lishi shart.

- parents ichida APPROVED_FOLDER_ID bo‘lishi shart.

- Response no-store va nosniff headerlari bilan qaytariladi.

# 13. 5 daqiqalik HMAC signed-link

*Rasm 13.1. Signed-link qanday yaratiladi*

Hujjatni ko‘rish va yuklab olish tugmalari uchun alohida ticket yaratiladi. Message docNo.exp.mode formatida bo‘ladi. HMAC-SHA256 signature FILE_TICKET_SECRET bilan yaratiladi.

const exp = Math.floor(Date.now() / 1000) + 300;

const message = docNo + "." + exp + "." + mode;

const sig = await hmacSha256Base64Url\_(env.FILE_TICKET_SECRET, message);

Worker expired linkni 403 bilan rad etadi. Shuningdek exp juda uzoq kelajakda bo‘lsa ham rad etiladi; bu foydalanuvchi o‘zi uzun muddatli link yasashiga qarshi qo‘shimcha qatlam.

# 14. Google Drive Restricted permission modeli

Oldingi modelda Approved PDF yaratilgach ANYONE_WITH_LINK VIEW permission berilar edi. Private gateway ishlashi isbotlangach bu kod olib tashlandi. Natijada yangi PDF boshidan Restricted yaratiladi.

*Rasm 14.1. Google Drive sharing oynasi: umumiy link permissionini boshqarish*

*Rasm 14.2. Approved PDF uchun Restricted access holati*

Service Account Viewer sifatida qoladi. Demak public “Anyone with the link” yo‘q, lekin Worker API orqali PDF o‘qiy oladi. Bu test real mobil QR orqali tasdiqlandi: Restricted PDF verify.example.com orqali ochildi.

# 15. REVOKE mexanizmi

Tasdiqlangan hujjat keyinchalik xato, bekor qilish yoki boshqa biznes sababi bilan yaroqsiz deb topilishi mumkin. Bunda PDF’ni o‘chirib yuborish emas, audit trail saqlagan holda registry STATUS’ni REVOKED qilish to‘g‘ri.

ACTIVE

↓ administrator “Bekor qilish”

REVOKED

├─ REVOKED_AT

├─ REVOKED_BY

└─ REVOKE_REASON

↓

QR → “Hujjat bekor qilingan”

/file → PDF berilmaydi

Drive add-on ichida “Tasdiqlangan hujjatlar” bo‘limi yaratildi. ACTIVE hujjat tanlanadi, sabab kiritiladi va Registry.revoke() chaqiriladi. Real testda QR sahifasi “Hujjat bekor qilingan” holatga o‘tdi va PDF tugmalari ko‘rinmadi.

# 16. Eski Approved PDF’larni bir martada private qilish

Yangi hujjatlar Restricted bo‘lib yaratilishi yetarli emas edi; avval yaratilgan PDF’larda Anyone with the link permission qolgan bo‘lishi mumkin. Shu sabab bir martalik migration funksiyasi yozildi.

function restrictOldApprovedFilesOnce() {

const folder = DriveApp.getFolderById(APPROVED_FOLDER_ID);

const files = folder.getFiles();

while (files.hasNext()) {

const file = files.next();

const result = Drive.Permissions.list(file.getId(), {

fields: 'permissions(id,type,role)'

});

(result.permissions \|\| \[\]).forEach(function (permission) {

if (permission.type === 'anyone') {

Drive.Permissions.remove(file.getId(), permission.id);

}

});

}

}

Real ishga tushirish natijasida 8 ta fayl tekshirildi, 6 ta public permission olib tashlandi, errors = 0. Qolgan 2 ta fayl allaqachon Restricted edi.

*Rasm 16.1. Deployment/version tarixini saqlash — migratsiya oldidan rollback imkoniyati*

# 17. Production hardening: health endpoint va workers.dev

## 17.1. Health endpoint

Integratsiya paytida /\_health/google endpoint orqali Google Auth, Sheets, Drive va Approved folder mosligi tekshirildi. Bu endpoint Service Account va API integratsiyasini izolatsiya qilib test qilish uchun juda foydali bo‘ldi.

{

"ok": true,

"googleAuth": true,

"sheets": true,

"drive": true,

"fileTicketSecret": true,

"approvedFolderIdMatches": true

}

Production yakunida public diagnostika ortiqcha ma’lumot oshkor qilmasligi uchun endpoint 404 Not Found qaytaradigan qilindi.

## 17.2. workers.dev host restriction

Worker’ning avtomatik workers.dev URL’i production public endpoint sifatida ishlamasligi kerak. Kod boshida hostname faqat verify.example.com bo‘lsa davom etadi; boshqa host uchun 404 qaytadi.

if (url.hostname !== "verify.example.com") {

return new Response("Not Found", { status: 404 });

}

*Rasm 17.1. Cloudflare Domains: workers.dev URL mavjud, lekin kod darajasida bloklangan*

# 18. Yakuniy security testlar

*Rasm 18.1. Defense-in-depth qatlamlari*

Production hardeningdan keyin testlar faqat “sahifa ochildimi?” darajasida emas, hujumga o‘xshash holatlar bilan tekshirildi.

*Rasm 18.2. Noto‘g‘ri yoki mos kelmaydigan verification ma’lumotlari uchun “Hujjat topilmadi” holati*

|                        |                                            |            |
|------------------------|--------------------------------------------|------------|
| **Test**               | **Kutilgan natija**                        | **Natija** |
| ACTIVE QR              | Hujjat haqiqiy                             | PASS       |
| Hujjatni ko‘rish       | verify.example.com/file orqali PDF        | PASS       |
| Restricted Drive       | Public share yo‘q bo‘lsa ham Worker ochadi | PASS       |
| REVOKED QR             | Hujjat bekor qilingan                      | PASS       |
| REVOKED /file          | PDF berilmaydi                             | PASS       |
| Expired signed link    | 5 daqiqadan keyin 403                      | PASS       |
| QR qayta scan          | Yangi signed link yaratiladi               | PASS       |
| Noto‘g‘ri t token      | Hujjat topilmadi                           | PASS       |
| workers.dev            | Not Found / 404                            | PASS       |
| Service Account health | Sheets + Drive read-only ishlaydi          | PASS       |

|                                                                                                               |
|---------------------------------------------------------------------------------------------------------------|
| **Production mezoni —** Asosiy xavfsizlik testlari real brauzer va mobil QR oqimida muvaffaqiyatli bajarildi. |

# 19. Operatsion qo‘llanma — kundalik foydalanish

## 19.1. Yangi hujjat tasdiqlash

10. Xodim faylni 01 — Tasdiqlanishi kerak papkaga joylaydi.

11. Drive add-on ochiladi va hujjat tanlanadi.

12. Tasdiqlash bajariladi.

13. Final PDF Approved papkaga tushadi.

14. Registry’da yangi ACTIVE qator paydo bo‘ladi.

15. Original fayl Arxivga o‘tadi.

16. PDF ichidagi QR telefonda tekshiriladi.

## 19.2. Hujjatni bekor qilish

17. Add-on → Tasdiqlangan hujjatlar.

18. ACTIVE hujjat tanlanadi.

19. Bekor qilish sababi yoziladi.

20. Hujjatni bekor qilish bosiladi.

21. Registry L/N/O/P yangilanadi.

22. QR tekshiruvda REVOKED chiqadi.

## 19.3. Email yuborish

Add-on tasdiqlangan final PDF’ni GmailApp orqali attachment sifatida yuborishi mumkin. Email yuborish holati Registry’da Jo‘natildi va Jo‘natilgan sana orqali audit qilinadi.

# 20. Nosozliklarni diagnostika qilish

|                        |                                  |                                        |
|------------------------|----------------------------------|----------------------------------------|
| **Belgi**              | **Birinchi tekshiruv**           | **Keyingi tekshiruv**                  |
| QR “Topilmadi”         | docNo/token va STATUS            | Worker log + Sheets row                |
| PDF ochilmaydi         | signed link exp/sig              | fileId, parent, mimeType, Drive access |
| Google OAuth xato      | GCP_SERVICE_ACCOUNT_JSON         | key validity, scopes, clock            |
| Sheets xato            | GOOGLE_SHEETS_ID                 | Service Account Viewer share           |
| Drive xato             | APPROVED_FOLDER_ID               | Service Account Viewer share           |
| workers.dev ishlayapti | hostname guard deploy qilinganmi | active Worker version                  |
| Yangi PDF public       | ANYONE_WITH_LINK kod qolganmi    | Drive inherited permission             |
| REVOKED PDF ochilyapti | /file’da status re-check         | findRegistryByDocNo\_ logic            |

## 20.1. QUIC / HTTP3 holati

Bir testda brauzer ERR_QUIC_PROTOCOL_ERROR ko‘rsatdi. Bu Worker exception emas, transport darajasidagi HTTP/3/QUIC muammosi edi. Cloudflare HTTP/3 vaqtincha o‘chirilgach /\_health/google muvaffaqiyatli ishladi. Diagnostika paytida transport xatosini application xatosi bilan aralashtirmaslik muhim.

# 21. Recovery va rollback playbook

## 21.1. Worker deploy buzilsa

23. Cloudflare → Worker → Deployments/Versions.

24. Oxirgi ishlagan versiyani aniqlang.

25. Rollback/promote qiling.

26. verify.example.com/v/... bilan smoke test.

27. Private /file va REVOKED testini qayta bajaring.

## 21.2. Service Account key kompromat bo‘lsa

28. Google Cloud’da eski keyni revoke/delete qiling.

29. Yangi JSON key yarating.

30. Cloudflare GCP_SERVICE_ACCOUNT_JSON secretni yangilang.

31. Deploy/config apply qiling.

32. Health testni vaqtincha faollashtirib integratsiyani tekshiring.

33. Health endpointni yana yoping.

## 21.3. FILE_TICKET_SECRET kompromat bo‘lsa

Secretni almashtirish barcha avvalgi signed linklarni darhol yaroqsiz qiladi. QR verification sahifasi yangi secret bilan yangi ticket ishlab chiqaradi. Bu xususiyat incident response uchun foydali.

# 22. Maintenance va keyingi rivojlantirish

## 22.1. Muntazam tekshiruv

- Oyiga: Approved papkada Anyone permission qolmaganini audit qilish.

- Oyiga: REVOKED log va g‘ayrioddiy holatlarni ko‘rish.

- Har o‘zgarishdan oldin: Worker version/rollback nuqtasini tekshirish.

- Credential rotation siyosati: Service Account keyni rejalashtirilgan davrda almashtirish.

- Registry backup: Sheets eksport yoki version history siyosatini yuritish.

- Cloudflare rate limiting va bot/abuse monitoringni bosqichma-bosqich qo‘shish.

## 22.2. Keyingi xavfsizlik bosqichlari

|                              |                                                    |                    |
|------------------------------|----------------------------------------------------|--------------------|
| **Taklif**                   | **Nega kerak**                                     | **Ustuvorlik**     |
| Token hashing                | Sheets’da plaintext token saqlamaslik              | Yuqori             |
| Rate limiting                | Token brute-force va abuse’ni kamaytirish          | Yuqori             |
| Audit log                    | Verification/revoke hodisalarini markaziy kuzatish | O‘rta              |
| KV/D1 registry cache         | Katta reyestrda performance                        | O‘rta              |
| OTP/PIN                      | Juda sensitive PDF uchun ikkinchi faktor           | Kontekstga bog‘liq |
| Workload Identity Federation | Uzoq muddatli JSON keydan voz kechish              | Kelajak            |

|                                                                                                                               |
|-------------------------------------------------------------------------------------------------------------------------------|
| **Hozirgi holat —** Ushbu takliflar kelajakdagi rivojlantirish. Ularni kitob hozir ishlayotgan feature sifatida ko‘rsatmaydi. |

# Ilova A. Konfiguratsiya snapshoti

|                            |                                |
|----------------------------|--------------------------------|
| **Parametr**               | **Qiymat**                     |
| Public verification domain | https://verify.example.com    |
| Worker                     | <worker-name>              |
| Drive root                 | VivaMed Hujjat NEW             |
| Registry                   | VivaMed Hujjatlar Reyestri NEW |
| Doc prefix                 | VM-PDF                         |
| Public signer label        | Rahbar:                        |
| Public signer              | <SIGNER_NAME>                |
| Signed link TTL            | 300 soniya                     |
| Approved permission        | Restricted                     |
| Service Account role       | Viewer / read-only             |

Ichki identifikatorlar (Sheet ID, Folder ID, Project ID) deployment konfiguratsiyasida saqlanadi. Ular secret emas, lekin production hujjatlarda zarurat bo‘lmasa ommaga tarqatilmasligi tavsiya etiladi.

# Ilova B. Muhim kod fragmentlari

## B.1. Host restriction

const url = new URL(request.url);

if (url.hostname !== "verify.example.com") {

return new Response("Not Found", {

status: 404,

headers: { "Cache-Control": "no-store" }

});

}

## B.2. /file route

const fileMatch = url.pathname.match(/^\\file\\(\[^/\]+)\\?\$/);

if (fileMatch) {

const fileDocNo = decodeURIComponent(fileMatch\[1\]).trim();

return await servePrivateFile\_(request, env, fileDocNo);

}

## B.3. Expiration check

const expNumber = Number(exp);

const now = Math.floor(Date.now() / 1000);

if (expNumber \< now) {

return privateErrorResponse\_(

"Havola muddati tugagan. QR kodni qayta skanerlang.", 403

);

}

## B.4. Approved parent check

if (!parents.includes(env.APPROVED_FOLDER_ID)) {

return privateErrorResponse\_("Faylga ruxsat yo'q.", 403);

}

if (metadata.mimeType !== "application/pdf") {

return privateErrorResponse\_("Fayl PDF formatida emas.", 415);

}

## B.5. Legacy permission cleanup

if (permission.type === 'anyone') {

Drive.Permissions.remove(fileId, permission.id);

}

# Ilova C. Yakuniy production checklist

☑ verify.example.com Custom Domain Worker’ga ulangan

☑ Worker → Google OAuth ishlaydi

☑ Worker → Sheets API ishlaydi

☑ Worker → Drive API ishlaydi

☑ FILE_TICKET_SECRET Secret sifatida saqlangan

☑ Approved PDF’lar Restricted

☑ Yangi PDF public sharing olmaydi

☑ Eski public permissionlar olib tashlangan

☑ ACTIVE QR ishlaydi

☑ REVOKED QR ishlaydi

☑ /file REVOKED holatda bloklanadi

☑ Signed link 5 daqiqada eskiradi

☑ Noto‘g‘ri QR token “Topilmadi” qaytaradi

☑ workers.dev 404

☑ /\_health/google production’da yopilgan

☑ Rollback uchun Worker version history mavjud

# Atamalar lug‘ati

|                  |                                                     |
|------------------|-----------------------------------------------------|
| **Atama**        | **Izoh**                                            |
| QR token         | Hujjat raqamiga bog‘langan bearer secret            |
| Service Account  | Server-to-server Google identifikatori              |
| JWT              | OAuth access token olish uchun imzolangan assertion |
| HMAC             | Secret bilan message integrity imzosi               |
| SHA-256          | PDF fingerprint hash                                |
| Restricted       | Google Drive public link o‘chiq holat               |
| REVOKED          | Oldin tasdiqlangan, keyin bekor qilingan hujjat     |
| Worker           | Cloudflare edge runtime’dagi public gateway         |
| Signed link      | Muddati va imzosi tekshiriladigan vaqtinchalik URL  |
| Defense-in-depth | Bir-biridan mustaqil bir nechta himoya qatlami      |

# Xulosa

VivaMed Hujjat tizimi oddiy “QR qo‘yadigan skript”dan ko‘p qatlamli verification platformaga aylantirildi. Ichki approval jarayoni Google Apps Script’da, reyestr Google Sheets’da, final PDF Google Drive’da private saqlanadi. Public foydalanuvchi esa faqat verify.example.com orqali Cloudflare Worker bilan ishlaydi.

Eng muhim natija: Drive PDF endi public emas; Worker read-only Service Account orqali kerakli faylni oladi, signed ticketni tekshiradi, statusni qayta tasdiqlaydi va faqat ACTIVE hujjatni 5 daqiqalik ruxsat bilan stream qiladi. REVOKED hujjat, noto‘g‘ri token, expired link va workers.dev bypass real testlarda bloklandi.

|                                                                                                                                                                                |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Yakuniy holat —** Asosiy production security bosqichlari yakunlandi. Keyingi evolyutsiya — token hashing, rate limiting, audit log va keyless identity tomon harakat qilish. |
