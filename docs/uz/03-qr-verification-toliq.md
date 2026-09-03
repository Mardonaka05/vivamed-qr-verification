# QR Verification tizimi — professional texnik kitob

Komponentlar, Service Account/JWT/OAuth, custom domain, ikki bosqichli havola, HMAC signed link, SHA-256, REVOKE va xavfsizlik qatlamlarining to'liq modeli.

> Bu — loyiha davomida yozilgan asl texnik kitoblardan biri, o'zbek tilida.
> Ommaviy repo uchun real identifikatorlar (domen, Drive/Sheets ID, GCP loyiha,
> Worker nomi, elektron pochta, ism) o'rniga placeholder qo'yilgan, konsol
> skrinshotlari esa olib tashlangan.
> Inglizcha qisqartirilgan hujjatlar: [`../en/`](../en/)

---

**VivaMed QR Verification Tizimi**

**Professional texnik kitob**

**Google Apps Script • Google Sheets • Google Drive • Google Cloud • Service Account • Cloudflare Worker • Custom Domain • Private PDF Gateway • QR Security**

**2026**

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Kitobning maqsadi<br />
</strong>Ushbu qo‘llanma VivaMed hujjatlarni QR orqali tekshirish tizimini boshidan oxirigacha tushuntiradi: hujjat qayerda yaratiladi, QR link qanday hosil bo‘ladi, Google Cloud nima uchun kerak, Cloudflare Worker nima qiladi, verify.example.com qanday ishlaydi, private PDF qanday beriladi, 5 daqiqalik signed link nimaning hisobiga ishlaydi va barcha xavfsizlik qatlamlari qayerda joylashgan.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

Maxfiy private key, Service Account JSON mazmuni va FILE_TICKET_SECRET qiymati ataylab kiritilmagan.

# Mundarija

1\. Tizimning maqsadi va eski/yangi arxitektura

2\. Komponentlar: kim nima qiladi?

3\. Google Apps Script: ichki hujjat backend’i

4\. Google Sheets: markaziy reyestr

5\. Google Drive: private PDF ombori

6\. Google Cloud Console: API va Service Account infratuzilmasi

7\. Service Account, OAuth, JWT va Access Token

8\. Cloudflare: DNS, nameserver va authoritative zone

9\. verify.example.com subdomeni va Custom Domain

10\. Cloudflare Worker: tizimning public backend’i

11\. Birinchi link: QR verification URL

12\. Birinchi linkdan ikkinchi linkka o‘tish

13\. Ikkinchi link: 5 daqiqalik private PDF URL

14\. exp, sig, HMAC-SHA256 va FILE_TICKET_SECRET

15\. Ikkinchi link Google Drive’dagi PDF’ga qanday yetib boradi?

16\. SHA-256: PDF fingerprinti

17\. REVOKED va real-time STATUS tekshiruvi

18\. QR cloning/replay xavfi va canonical PDF

19\. Xavfsizlik qatlamlari – to‘liq model

20\. Qaysi faylda va qaysi sahifada nima qilingan?

21\. Amalga oshirilgan testlar va faktik natijalar

22\. Troubleshooting

23\. Texnik xizmat va key rotation

24\. To‘liq end-to-end arxitektura

25\. Hamkasbga 3 daqiqada qanday tushuntirish mumkin?

# 1. Tizimning maqsadi va eski/yangi arxitektura

Maqsad: tasdiqlangan VivaMed PDF hujjatini QR orqali tekshirish, bekor qilingan hujjatni darhol bloklash va original PDF’ni Google Drive public linkisiz ko‘rsatish.

## 1.1. Eski model

| QR → Apps Script Web App → Sheets → public Drive link → User |
|--------------------------------------------------------------|

Eski modelda tasdiqlangan PDF “Anyone with the link” holatida bo‘lishi mumkin edi. Foydalanuvchi Google Drive linkiga chiqardi. Bu public sharing va Drive URL tarqalishi xavfini oshirardi.

## 1.2. Hozirgi model

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>Ichki yozish tomoni:<br />
Xodim → Apps Script → Sheets + Restricted Drive<br />
<br />
Public o‘qish tomoni:<br />
User → verify.example.com → Cloudflare Worker → Service Account → Sheets API / Drive API</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Arxitektura prinsipi<br />
</strong>Apps Script hujjatni yaratadi va boshqaradi. Cloudflare Worker public verificationni bajaradi. Google Drive public emas. Worker Google API orqali private PDF’ni oladi.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 2. Komponentlar: kim nima qiladi?

| **Komponent**        | **Asosiy vazifa**                                                                          |
|----------------------|--------------------------------------------------------------------------------------------|
| Google Apps Script   | Hujjat tasdiqlash, QR bosish, reyestrga yozish, REVOKE va ichki boshqaruv.                 |
| Google Sheets        | Hujjatning rasmiy reyestri: docNo, token, File ID, STATUS, SHA-256 va revoke ma’lumotlari. |
| Google Drive         | Tasdiqlangan private PDF fayllar ombori.                                                   |
| Google Cloud Project | Google API va Service Account uchun texnik loyiha/konteyner.                               |
| Service Account      | Cloudflare Worker’ning Google ichidagi texnik identifikatori.                              |
| Cloudflare DNS       | example.com DNS boshqaruvi va subdomen routing.                                           |
| Cloudflare Worker    | Public backend: QR tekshirish, signed link yaratish, PDF gateway.                          |
| verify.example.com  | Foydalanuvchi ko‘radigan rasmiy public hostname.                                           |

# 3. Google Apps Script: ichki hujjat backend’i

Apps Script public verificationning asosiy fronti bo‘lib qolmagan. Hozir uning roli ichki write-side backend: xodim hujjatni tasdiqlaydi, PDFga QR qo‘yiladi, reyestr yangilanadi va status boshqariladi.

## 3.1. Asosiy fayllar

| **Fayl**        | **Vazifa**                                                                                              |
|-----------------|---------------------------------------------------------------------------------------------------------|
| Config.gs       | Sozlamalar: papka IDlari, PUBLIC_VERIFY_BASE_URL, QR o‘lchami, klinika va hujjat parametrlarini o‘qish. |
| Registry.gs     | Reyestr A–P ustunlari, reserve/fill/find/revoke/markSent va STATUS logikasi.                            |
| Code.gs         | Tasdiqlash oqimi, final PDF bytes, SHA-256, Drive’ga saqlash, revoke UI va boshqa ichki funksiyalar.    |
| PdfStamp.gs     | PDFga QR va hujjat rekvizitlarini bosish.                                                               |
| WebApp.gs       | Apps Script Web App endpointi; rollback/ichki legacy uchun saqlangan.                                   |
| Verify.html     | Eski/Apps Script verification sahifasi uchun HTML.                                                      |
| appsscript.json | OAuth scopes, Drive advanced service va Apps Script manifest.                                           |

## 3.2. Muhim o‘zgarish: public sharing olib tashlandi

Code.gs ichidagi \`newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)\` chaqiruvi olib tashlandi. Shuning uchun yangi tasdiqlangan PDF avtomatik ravishda public qilinmaydi.

## 3.3. Oldingi fayllarni Restricted qilish

Bir martalik \`restrictOldApprovedFilesOnce()\` funksiyasi orqali Approved papkadagi eski “anyone” permissionlar olib tashlandi. Test natijasi: 8 fayl tekshirildi, 6 ta public permission olib tashlandi, 0 xato.

# 4. Google Sheets: markaziy reyestr

Google Sheets – tizimning “haqiqat manbai” (source of truth). Worker QR’ni tekshirayotganda ACTIVE yoki REVOKED holatini aynan shu reyestrdan real vaqtda o‘qiydi.

| **Ustun** | **Ma’lumot**  | **Vazifa**                     |
|-----------|---------------|--------------------------------|
| A         | Hujjat raqami | docNo                          |
| B         | Fayl nomi     | Ko‘rsatiladigan nom            |
| C         | File ID       | Drive’dagi private PDF manzili |
| J         | Token         | QR verification token          |
| L         | STATUS        | ACTIVE/REVOKED va boshqalar    |
| M         | FILE_SHA256   | PDF fingerprinti               |
| N         | REVOKED_AT    | Bekor qilingan vaqt            |
| O         | REVOKED_BY    | Kim bekor qilgani              |
| P         | REVOKE_REASON | Sabab                          |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Muhim<br />
</strong>QR kod ACTIVE yoki REVOKED holatni o‘zida saqlamaydi. Worker har requestda Sheets’dan STATUS’ni o‘qiydi.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 5. Google Drive: private PDF ombori

Tasdiqlangan PDF’lar \`02 — Tasdiqlangan\` papkada turadi. Papka va fayllar public emas. Service Account bu papkaga Viewer sifatida qo‘shilgan.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>Google Drive<br />
└── 02 — Tasdiqlangan<br />
└── VM-PDF-2026-000009.pdf [Restricted]</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

Foydalanuvchi drive.google.com linkini olmaydi. Worker File ID orqali Drive API’dan PDF bytes’ni oladi va o‘z domenidan userga uzatadi.

# 6. Google Cloud Console: API va Service Account infratuzilmasi

Google Cloud Project – hujjatlar saqlanadigan joy emas. U Cloudflare Worker’ga Google servislariga dasturiy kirish uchun API va texnik identifikatsiya infratuzilmasini beradi.

| **Element**       | **Bizdagi holat**                 |
|-------------------|-----------------------------------|
| Project           | VivaMed Verify Security           |
| Project ID        | <gcp-project-id>           |
| Google Sheets API | Enabled                           |
| Google Drive API  | Enabled                           |
| Service Account   | VivaMed Verify Reader             |
| Project IAM       | Keng Owner/Editor roli berilmagan |

Rasm 1. Google Cloud Project, Service Account va Google APIlar o‘rtasidagi rol taqsimoti.

# 7. Service Account, OAuth, JWT va Access Token

Cloudflare Worker Google serverida ishlamaydi. Shuning uchun Google’ga “kim” ekanini isbotlashi kerak. \`VivaMed Verify Reader\` Service Account – Workerning Google ichidagi texnik identifikatori.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>Worker<br />
↓<br />
Service Account credential<br />
↓<br />
JWT (RS256)<br />
↓<br />
Google OAuth token endpoint<br />
↓<br />
Access Token<br />
↓<br />
Sheets API / Drive API</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

Rasm 2. Service Account credential → JWT → OAuth → Access Token oqimi.

## 7.1. Viewer + read-only

Service Account reyestr va Approved papkaga Viewer qilib share qilingan. OAuth scopes ham \`spreadsheets.readonly\` va \`drive.readonly\`. Shuning uchun public Worker hujjatni o‘chira, STATUS’ni o‘zgartira yoki permissionni almashtira olmaydi.

# 8. Cloudflare: DNS, nameserver va authoritative zone

example.com domeni registrator’da ro‘yxatdan o‘tgan. Domen ownership registratorda qolgan, lekin DNS boshqaruvi Cloudflare’ga delegatsiya qilingan.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>registrator registrar<br />
↓ nameserver delegation<br />
ns1.cloudflare.com<br />
ns2.cloudflare.com<br />
↓<br />
Cloudflare authoritative DNS zone: example.com</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

Nameserver almashtirilgach, internet \`example.com\` ostidagi hostname va DNS yozuvlarini Cloudflare’dan so‘raydi.

# 9. verify.example.com subdomeni va Custom Domain

Verification uchun \`verify.example.com\` hostname tanlandi va \`<worker-name>\` Worker’ga Custom Domain sifatida biriktirildi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>verify.example.com<br />
↓<br />
Cloudflare DNS / Edge<br />
↓<br />
Custom Domain mapping<br />
↓<br />
<worker-name> Worker</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

Bu subdomen alohida VPS yoki registrator papkasi emas. Bu Cloudflare Worker’ga bog‘langan hostname. Cloudflare HTTPS/TLS sertifikat va routingni boshqaradi.

## 9.1. Qayta o‘rganish uchun test

Amaliy testda \`<test-worker-name>\` Worker yaratildi va unga \`demo2.example.com\` Custom Domain qo‘shildi. Bu subdomen yaratish mantiqini production’ga tegmasdan qayta ko‘rsatdi.

Rasm 3. Cloudflare Worker Domains sahifasi: demo2.example.com Custom Domain sifatida biriktirilgan.

# 10. Cloudflare Worker: tizimning public backend’i

Worker – Cloudflare edge infratuzilmasida ishlaydigan JavaScript backend. U foydalanuvchidan kelgan requestni qabul qiladi, URL’ni tahlil qiladi, Google API’lar bilan ishlaydi va HTML/PDF response qaytaradi.

## 10.1. Production hostname cheklovi

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>if (url.hostname !== "verify.example.com") {<br />
return new Response("Not Found", { status: 404 });<br />
}</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

Natija: rasmiy \`verify.example.com\` ishlaydi; texnik \`\*.workers.dev\` endpoint to‘g‘ridan-to‘g‘ri ishlatilmaydi.

## 10.2. Runtime variables va secrets

| **Nomi**                 | **Turi** | **Vazifa**                                            |
|--------------------------|----------|-------------------------------------------------------|
| GOOGLE_SHEETS_ID         | Text     | Qaysi reyestr o‘qilishini bildiradi                   |
| APPROVED_FOLDER_ID       | Text     | Qaysi Drive papka official Approved ekanini bildiradi |
| GCP_SERVICE_ACCOUNT_JSON | Secret   | Google OAuth uchun Service Account credential         |
| FILE_TICKET_SECRET       | Secret   | 5 daqiqalik PDF linklarni HMAC bilan imzolash         |

# 11. Birinchi link: QR verification URL

QR kod ichida doimiy verification URL bo‘ladi:

| https://verify.example.com/v/{docNo}?t={token} |
|-------------------------------------------------|

Misol:

| https://verify.example.com/v/VM-PDF-2026-000009?t=ABC123XYZ |
|--------------------------------------------------------------|

| **Qism**            | **Ma’nosi**                   |
|---------------------|-------------------------------|
| https://            | TLS/HTTPS                     |
| verify.example.com | Worker’ga bog‘langan hostname |
| /v/                 | Verification route            |
| VM-PDF-...          | docNo – hujjat raqami         |
| ?t=...              | QR verification token         |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Muhim<br />
</strong>Kamera bilan QR skan qilish va QR ichidagi `/v/...?...t=...` linkni browserga qo‘lda qo‘yish Worker uchun bir xil HTTP requestdir.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 12. Birinchi linkdan ikkinchi linkka o‘tish

Birinchi link ochilganda Worker docNo va tokenni oladi, Sheets’dan shu juftlikni qidiradi va STATUS’ni tekshiradi. ACTIVE bo‘lsa Worker verification HTML sahifasini yaratadi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>1-link /v/...?...t=...<br />
↓<br />
Worker<br />
↓<br />
Sheets API<br />
↓<br />
docNo + token mosmi?<br />
↓<br />
STATUS = ACTIVE<br />
↓<br />
Worker yangi PDF access link yaratadi<br />
↓<br />
[ Hujjatni ko‘rish ] tugmasiga qo‘yadi</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

Demak birinchi URL “ikkinchi URLga o‘zi aylanmaydi”. Worker yangi URL hisoblab yaratadi va HTML tugmasining \`href\` atributiga joylaydi.

# 13. Ikkinchi link: 5 daqiqalik private PDF URL

Ikkinchi link Google Drive linki emas. U Worker yaratadigan vaqtinchalik access URL:

| https://verify.example.com/file/{docNo}?exp={timestamp}&mode=view&sig={signature} |
|------------------------------------------------------------------------------------|

| **Qism** | **Vazifa**                         |
|----------|------------------------------------|
| /file/   | Private PDF gateway route          |
| docNo    | Qaysi hujjat                       |
| exp      | Link tugash vaqti                  |
| mode     | view yoki download                 |
| sig      | HMAC-SHA256 natijasidagi signature |

Bu link alohida bazaga saqlanmaydi. U stateless signed URL: barcha public parametrlar URL ichida; maxfiy \`FILE_TICKET_SECRET\` esa Cloudflare Secret’da qoladi.

# 14. exp, sig, HMAC-SHA256 va FILE_TICKET_SECRET

## 14.1. exp nima?

\`exp\` = expiry time. Worker hozirgi Unix vaqtiga 300 sekund qo‘shadi. 300 sekund = 5 daqiqa.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>now = current Unix time<br />
exp = now + 300</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

Masalan 15:00 da link yaratilsa, exp 15:05 vaqtini ifodalovchi Unix timestamp bo‘ladi.

## 14.2. sig nima?

\`sig\` – linkning kriptografik imzosi. Worker \`docNo + exp + mode\` matnini \`FILE_TICKET_SECRET\` maxfiy kaliti bilan HMAC-SHA256 orqali imzolaydi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>message = docNo + "." + exp + "." + mode<br />
HMAC-SHA256(message, FILE_TICKET_SECRET)<br />
↓<br />
sig</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## 14.3. Nega expni qo‘lda uzaytirib bo‘lmaydi?

Kimdir URL’dagi expni 15:05 dan 20:00 ga o‘zgartirsa, eski sig endi mos kelmaydi. Chunki sig original exp qiymatini ham imzolagan. Yangi to‘g‘ri sig yaratish uchun FILE_TICKET_SECRET kerak.

## 14.4. 5 daqiqadan keyin nima bo‘ladi?

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>if (now &gt; exp)<br />
→ expired<br />
→ PDF berilmaydi<br />
→ “Havola muddati tugagan. QR kodni qayta skanerlang.”</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Eng muhim farq<br />
</strong>5 daqiqa STATUS’ga tegishli emas. Hujjat ACTIVE bo‘lib qoladi. Faqat ikkinchi `/file/...` access link muddati tugaydi. QR `/v/...` link qayta ochilsa, ACTIVE bo‘lsa yangi exp va yangi sig bilan yangi 5 daqiqalik link yaratiladi.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 15. Ikkinchi link Google Drive’dagi PDF’ga qanday yetib boradi?

Ikkinchi link Google Drive URL emas. U Worker’ning \`/file/\` endpointidir. Worker avval URL xavfsizligini tekshiradi, keyin Sheets’dan File ID oladi va Drive API orqali aynan shu private faylni o‘qiydi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>/file/{docNo}?exp=...&amp;mode=view&amp;sig=...<br />
↓<br />
Worker: sig + exp<br />
↓<br />
Sheets: STATUS hali ACTIVE mi?<br />
↓<br />
Sheets: File ID<br />
↓<br />
Drive API metadata<br />
↓<br />
Approved parent? PDF MIME?<br />
↓<br />
files/{fileId}?alt=media<br />
↓<br />
PDF byte stream<br />
↓<br />
Worker<br />
↓<br />
Browser</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

Foydalanuvchi drive.google.com’ga redirect qilinmaydi. Browser URL’i verify.example.com ostida qoladi. Google Drive faqat origin/private storage rolini bajaradi.

# 16. SHA-256: PDF fingerprinti

SHA-256 PDFning raqamli “barmoq izi”. Final PDF bytes’dan 64 belgili hexadecimal hash hisoblanadi va FILE_SHA256 ustuniga yoziladi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>Original PDF bytes<br />
↓ SHA-256<br />
64-hex fingerprint<br />
↓<br />
FILE_SHA256</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

PDFdagi bitta byte o‘zgarsa ham hash deyarli butunlay o‘zgaradi. SHA-256 link imzosi emas; HMAC-SHA256 esa secret bilan signed link yaratish uchun ishlatiladi.

| **Texnologiya** | **Nima uchun**                                  |
|-----------------|-------------------------------------------------|
| SHA-256         | PDF aynan o‘sha faylmi? fingerprint             |
| HMAC-SHA256     | PDF access linkini Worker yaratganmi? signature |

# 17. REVOKED va real-time STATUS tekshiruvi

Hujjat ACTIVE bo‘lganida QR ishlaydi. Administrator Apps Script orqali hujjatni REVOKED qilsa, STATUS reyestrda o‘zgaradi. QR ichidagi eski token o‘zgarmasa ham Worker yangi requestda REVOKED holatini ko‘radi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>QR → Worker → Sheets → STATUS = REVOKED<br />
↓<br />
“Hujjat bekor qilingan”<br />
↓<br />
PDF berilmaydi</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

Bundan tashqari \`/file/\` link ochilganda STATUS yana qayta tekshiriladi. Shu sabab linkning exp muddati hali tugamagan bo‘lsa ham hujjat REVOKED bo‘lsa PDF berilmaydi.

# 18. QR cloning/replay xavfi va canonical PDF

Kimdir tasodifiy fake token yaratishi mumkin, lekin reyestrdagi docNo + token juftligiga mos kelmasa verification o‘tmaydi. Biroq haqiqiy QR kodni boshqa soxta qog‘ozga nusxalab qo‘yish – real replay/cloning xavfi.

Shu sabab verificationning ishonchli ma’nosi “QR bor ekan – qog‘oz haqiqiy” emas. To‘g‘ri model: QR serverdagi canonical/original yozuvga olib boradi. Foydalanuvchi sahifadagi rekvizitlar va original private PDF’ni qo‘lidagi hujjat bilan solishtiradi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Tavsiya<br />
</strong>Verification sahifasida hujjat raqami, turi, yaratilgan sana, tasdiqlovchi va “Original PDF’ni ko‘rish” aniq ko‘rsatilishi QR cloning xavfini sezilarli kamaytiradi.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 19. Xavfsizlik qatlamlari – to‘liq model

| **Qatlam**                         | **Himoya**                                    |
|------------------------------------|-----------------------------------------------|
| HTTPS/TLS                          | Telefon ↔ Cloudflare trafik shifrlangan       |
| Official hostname                  | Faqat verify.example.com production endpoint |
| docNo + token                      | Random URL guessingga qarshi verification     |
| STATUS                             | ACTIVE/REVOKED real-time nazorat              |
| Service Account Viewer             | Worker Google’da faqat o‘qiydi                |
| Read-only OAuth scopes             | drive.readonly + spreadsheets.readonly        |
| Restricted Drive                   | Anyone with link olib tashlangan              |
| 5 min exp                          | PDF access qisqa muddatli                     |
| HMAC sig                           | exp/mode/docNo manipulyatsiyasiga qarshi      |
| STATUS re-check                    | Signed link vaqtida ham REVOKED bloklanadi    |
| Approved parent check              | Begona Drive file ID bloklanadi               |
| PDF MIME check                     | PDF bo‘lmagan obyekt rad qilinadi             |
| Cache-Control no-store             | Public cache xavfini kamaytiradi              |
| nosniff / no-referrer / frame deny | Web response hardening                        |

# 20. Qaysi faylda va qaysi sahifada nima qilingan?

## 20.1. Google Apps Script

| **Joy**         | **Ish**                                                                                                             |
|-----------------|---------------------------------------------------------------------------------------------------------------------|
| Code.gs         | Approval oqimi, final bytes, SHA-256, public sharingni olib tashlash, old approved permission migration, revoke UI. |
| Registry.gs     | A–P reyestr, STATUS, findForVerification, revoke, ACTIVE/REVOKED.                                                   |
| Config.gs       | PUBLIC_VERIFY_BASE_URL va papka/reyestr parametrlarini o‘qish.                                                      |
| PdfStamp.gs     | QR linkni PDFga joylashtirish.                                                                                      |
| appsscript.json | Drive va Sheets scopes, Drive API advanced service.                                                                 |

## 20.2. Google Cloud Console

| **Sahifa**                     | **Ish**                                        |
|--------------------------------|------------------------------------------------|
| APIs & Services                | Google Drive API va Google Sheets API Enabled. |
| IAM & Admin → Service Accounts | VivaMed Verify Reader yaratildi.               |
| Service Account → Keys         | JSON credential yaratildi; qiymati maxfiy.     |
| Project IAM                    | Keng Owner/Editor roli berilmadi.              |

## 20.3. Google Drive/Sheets

| **Sahifa**                             | **Ish**                                            |
|----------------------------------------|----------------------------------------------------|
| 02 — Tasdiqlangan → Share              | Service Account Viewer; General access Restricted. |
| VivaMed Hujjatlar Reyestri NEW → Share | Service Account Viewer.                            |

## 20.4. Cloudflare

| **Sahifa**                                    | **Ish**                                                                             |
|-----------------------------------------------|-------------------------------------------------------------------------------------|
| Zone: example.com                            | DNS Cloudflare nameserverlarga delegatsiya.                                         |
| Workers & Pages → <worker-name>           | Production Worker.                                                                  |
| Worker → Domains                              | verify.example.com Custom Domain.                                                  |
| Worker → Settings → Runtime variables/secrets | GOOGLE_SHEETS_ID, APPROVED_FOLDER_ID, GCP_SERVICE_ACCOUNT_JSON, FILE_TICKET_SECRET. |
| Worker → Edit code                            | /v/ verification, /file/ gateway, host check, OAuth, HMAC, expiry, Drive streaming. |

**Muhim:** Cloudflare Worker kodi Apps Script \`.gs\` fayllaridan alohida. U Cloudflare Worker editorida saqlanadi/deploy qilinadi.

# 21. Amalga oshirilgan testlar va faktik natijalar

- Google OAuth + Sheets + Drive diagnostikasi muvaffaqiyatli: googleAuth=true, sheets=true, drive=true.

- Private PDF Restricted holatda ham verify.example.com orqali ochildi.

- Eski \`/file/\` signed URL 5 daqiqadan keyin “Havola muddati tugagan” deb rad qilindi.

- Noto‘g‘ri token bilan verification “Hujjat topilmadi” deb qaytdi.

- workers.dev production host restriction testi “Not Found” berdi.

- ACTIVE hujjat QR orqali “Hujjat haqiqiy” deb chiqdi va private PDF ochildi.

- REVOKED testida QR “Hujjat bekor qilingan” deb chiqdi va PDF access bloklandi.

- Old approved migration: 8 fayl tekshirildi, 6 public permission olib tashlandi, 0 error.

# 22. Troubleshooting

| **Belgi**              | **Tekshiriladigan joy**    | **Ehtimoliy sabab**                               |
|------------------------|----------------------------|---------------------------------------------------|
| 401 / OAuth error      | GCP_SERVICE_ACCOUNT_JSON   | Credential/key noto‘g‘ri yoki bekor qilingan      |
| 403 Sheets             | Sheets API + share         | API o‘chiq yoki Service Account Viewer emas       |
| 403 Drive              | Drive API + Approved share | Papka ruxsati yo‘q                                |
| Hujjat topilmadi       | docNo + token              | Token yoki hujjat raqami mos emas                 |
| Havola muddati tugagan | /file exp                  | 5 daqiqalik access tugagan                        |
| Signature invalid      | sig/HMAC                   | URL parametri o‘zgartirilgan yoki secret mos emas |
| PDF bermaydi           | STATUS / parent / MIME     | REVOKED, Approved papkada emas yoki PDF emas      |

# 23. Texnik xizmat va key rotation

1.  Yangi Service Account key yarating.

2.  Cloudflare’dagi GCP_SERVICE_ACCOUNT_JSON Secretni yangi credential bilan almashtiring.

3.  Integratsiyani test qiling.

4.  Faqat yangi key ishlayotgani tasdiqlangandan keyin eski keyni Google Cloud’dan o‘chiring.

5.  FILE_TICKET_SECRET oshkor bo‘lsa, uni ham yangi random secretga rotate qiling; eski signed URLlar darhol yaroqsiz bo‘ladi.

# 24. To‘liq end-to-end arxitektura

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>XODIM TOMONI<br />
Employee<br />
↓<br />
Apps Script<br />
├─ Registry.gs → Google Sheets<br />
├─ Code.gs → SHA-256 + Approved PDF<br />
└─ PdfStamp.gs → QR (/v/{docNo}?t={token})<br />
<br />
PUBLIC TOMON<br />
User QR scan<br />
↓<br />
verify.example.com<br />
↓<br />
Cloudflare Worker<br />
↓<br />
Service Account OAuth<br />
↓<br />
Sheets API: docNo + token + STATUS<br />
↓ ACTIVE<br />
Worker: exp + mode + HMAC → sig<br />
↓<br />
/file/{docNo}?exp=...&amp;mode=view&amp;sig=...<br />
↓<br />
Worker: exp + sig + STATUS re-check<br />
↓<br />
Drive API: File ID + Approved parent + PDF MIME<br />
↓<br />
Restricted PDF stream<br />
↓<br />
verify.example.com → User</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 25. Hamkasbga 3 daqiqada qanday tushuntirish mumkin?

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Qisqa professional tushuntirish<br />
</strong>Bizda hujjat Apps Script orqali tasdiqlanadi, QR va reyestr yozuvi yaratiladi, PDF esa Google Drive’da Restricted holatda saqlanadi. QR ichidagi birinchi `/v/` link Cloudflare Worker’ga boradi. Worker Service Account orqali Google Sheets’dan docNo, token va STATUS’ni tekshiradi. ACTIVE bo‘lsa Worker 5 daqiqalik ikkinchi `/file/` link yaratadi. Bu linkda exp, mode va HMAC-SHA256 bilan yaratilgan sig bor. User PDF’ni ochganda Worker exp va sig’ni tekshiradi, STATUS’ni yana o‘qiydi, Drive API orqali private PDF’ni File ID bilan olib userga verify.example.com domeni ostida uzatadi. Shu sabab Drive public emas, Drive URL ko‘rinmaydi va REVOKED hujjat darhol bloklanadi.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# Ilova A. Eng muhim formulalar

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th>QR link:<br />
https://verify.example.com/v/{docNo}?t={token}<br />
<br />
PDF link:<br />
https://verify.example.com/file/{docNo}?exp={exp}&amp;mode={mode}&amp;sig={sig}<br />
<br />
Expiry:<br />
exp = now + 300<br />
<br />
Signature message:<br />
message = docNo + "." + exp + "." + mode<br />
<br />
Signature:<br />
sig = HMAC-SHA256(message, FILE_TICKET_SECRET)</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# Ilova B. Terminlar lug‘ati

| **Termin**         | **Ma’nosi**                                                |
|--------------------|------------------------------------------------------------|
| docNo              | Hujjatning rasmiy raqami                                   |
| token              | QR verification uchun maxfiy/tasodifiy qiymat              |
| STATUS             | ACTIVE, REVOKED va boshqa hujjat holatlari                 |
| File ID            | Google Drive’dagi faylning noyob identifikatori            |
| SHA-256            | PDF fingerprint algoritmi                                  |
| HMAC-SHA256        | Secret bilan message imzolash algoritmi                    |
| sig                | HMAC natijasi – signed link signature                      |
| exp                | Signed link expiry timestamp                               |
| Service Account    | Dastur/server uchun Google identifikatori                  |
| OAuth Access Token | Google API’ga vaqtinchalik ruxsat tokeni                   |
| Custom Domain      | Hostname’ni Worker’ga bog‘lash                             |
| Private Gateway    | Private faylni oraliq backend orqali nazorat bilan uzatish |
