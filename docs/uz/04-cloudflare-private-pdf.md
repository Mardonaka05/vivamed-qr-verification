# Cloudflare Worker, private Drive gateway va QR xavfsizligi

drive.google.com havolasi qanday yo'q qilindi, DNS delegatsiyasi, Custom Domain, request routing, private PDF gateway va 13 qatlamli himoya.

> Bu — loyiha davomida yozilgan asl texnik kitoblardan biri, o'zbek tilida.
> Ommaviy repo uchun real identifikatorlar (domen, Drive/Sheets ID, GCP loyiha,
> Worker nomi, elektron pochta, ism) o'rniga placeholder qo'yilgan, konsol
> skrinshotlari esa olib tashlangan.
> Inglizcha qisqartirilgan hujjatlar: [`../en/`](../en/)

---

**VivaMed QR Verification**

**Cloudflare Worker, private Google Drive gateway va QR xavfsizlik arxitekturasi**

**Professional texnik qo‘llanma • 2026**

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>Maqsad<br />
</strong>Ushbu kitob foydalanuvchi bajargan real ishlarni qayta tiklash, tushunish va boshqa mutaxassisga izchil tushuntirish uchun yozildi. Qaysi platformada, qaysi sahifada, qaysi fayl/funksiyada nima o‘zgargani alohida ko‘rsatiladi. Maxfiy kalit va secret qiymatlar kiritilmaydi.</td>
</tr>
</tbody>
</table>

# Mundarija

1.  Eski tizim va yangi arxitektura

2.  drive.google.com linki qanday yo‘qoldi

3.  example.com domeni va DNS delegatsiyasi

4.  verify.example.com subdomeni / Custom Domain

5.  Cloudflare Worker request routing

6.  Google Cloud bilan integratsiya

7.  Private PDF gateway

8.  QR skan xavfsizlik qatlamlari

9.  Apps Script va Registry’dagi o‘zgarishlar

10. Cloudflare sahifalarida nima sozlandi

11. Google Drive’da nima o‘zgardi

12. Testlar va real natijalar

13. Troubleshooting

14. Texnik audit checklist

15. Yakuniy arxitektura va 2 daqiqalik tushuntirish

# 1. Eski tizim va yangi arxitektura

Avval QR verification va PDF ko‘rish Google Apps Script hamda Google Drive public linkiga yaqin modelda ishlagan. Yangi arxitekturada public kirish Cloudflare Worker’ga ko‘chirildi, PDF esa Google Drive’da Restricted holatda qoldi.

|                                           |                                               |
|-------------------------------------------|-----------------------------------------------|
| **Eski model**                            | **Yangi model**                               |
| QR → Apps Script Web App                  | QR → verify.example.com → Cloudflare Worker  |
| PDF public sharing / Drive link           | PDF Restricted / Worker orqali private stream |
| Public endpoint Google tomonda            | Public endpoint Cloudflare Edge’da            |
| Drive URL foydalanuvchiga chiqishi mumkin | Drive URL foydalanuvchiga berilmaydi          |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td>ESKI:<br />
QR → Apps Script → Sheets → drive.google.com → PDF<br />
<br />
YANGI:<br />
QR → verify.example.com → Worker → Sheets API<br />
↓<br />
Drive API → private PDF → Worker → User</td>
</tr>
</tbody>
</table>

# 2. drive.google.com linki qanday “yo‘qoldi”?

Bu yerda Google Drive yo‘qolmagan. PDF hanuz Google Drive’da saqlanadi. O‘zgargan narsa — foydalanuvchi PDF’ga qanday yetib borishi. Endi browser Google Drive public URL’iga redirect qilinmaydi.

## 2.1. Apps Script’da public sharing olib tashlandi

Asosiy fayl: Code.gs. Hujjat tasdiqlanganda ilgari \`newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)\` chaqiruvi bor edi. Ushbu public sharing bloki olib tashlandi. Natijada yangi tasdiqlangan PDF avtomatik public bo‘lmaydi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>Fayl va funksiya<br />
</strong>Apps Script → Code.gs → `approveDocument_()` funksiyasi. Aynan shu yer hujjatning final PDF faylini yaratadi. Public sharing chaqiruvi shu funksiyadan olib tashlangan.</td>
</tr>
</tbody>
</table>

## 2.2. Eski public fayllar ham Restricted qilindi

Bir martalik migratsiya uchun \`restrictOldApprovedFilesOnce()\` funksiyasi qo‘shildi. U Approved papkadagi fayllarni ko‘rib, \`type=anyone\` permission bo‘lsa Drive API orqali olib tashladi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td>Natija:<br />
checked: 8<br />
publicPermissionsRemoved: 6<br />
errors: 0</td>
</tr>
</tbody>
</table>

Demak 8 ta fayl tekshirildi, 6 tasida public “anyone” permission o‘chirildi, xato bo‘lmadi.

## 2.3. PDF endi qanday beriladi?

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td>Google Drive (Restricted)<br />
↓ Drive API<br />
Cloudflare Worker<br />
↓ HTTP response: application/pdf<br />
verify.example.com/file/...<br />
↓<br />
Browser</td>
</tr>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>Texnik atama<br />
</strong>Bu model private file gateway / application proxy deb tushuntiriladi. Worker faylni Google Drive API’dan byte stream sifatida olib, foydalanuvchiga o‘z domeni ostida uzatadi.</td>
</tr>
</tbody>
</table>

# 3. example.com domeni va DNS delegatsiyasi

Asosiy domen \`example.com\` registrator’da ro‘yxatdan o‘tgan. Domen registratori o‘zgarmadi; faqat DNS boshqaruvi Cloudflare’ga delegatsiya qilindi.

|                         |                           |
|-------------------------|---------------------------|
| **Qatlam**              | **Bizdagi holat**         |
| Registrar               | registrator                     |
| Asosiy domen            | example.com              |
| Authoritative DNS       | Cloudflare                |
| Cloudflare nameserver 1 | ns1.cloudflare.com |
| Cloudflare nameserver 2 | ns2.cloudflare.com    |

registrator panelida domenning nameserverlari Cloudflare bergan nameserverlarga almashtirilgach, internetdagi DNS resolverlar \`example.com\` zonasi uchun javobni Cloudflare’dan ola boshladi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td>registrator (registrator)<br />
↓ NS delegation<br />
Cloudflare authoritative DNS<br />
↓<br />
example.com zone</td>
</tr>
</tbody>
</table>

# 4. verify.example.com subdomeni / Custom Domain

Verification uchun \`verify\` label tanlandi va \`verify.example.com\` hostname Cloudflare Worker’ga Custom Domain sifatida biriktirildi. Bu alohida VPS yoki papka emas.

## 4.1. Cloudflare UI yo‘li

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td>Cloudflare Dashboard<br />
→ Workers &amp; Pages<br />
→ <worker-name><br />
→ Domains<br />
→ Add Domain<br />
→ verify.example.com</td>
</tr>
</tbody>
</table>

Cloudflare Custom Domain’ni Worker bilan bog‘laydi, DNS routingni va HTTPS/TLS sertifikatini boshqaradi.

Rasm 1. Cloudflare Worker → Domains bo‘limida Custom Domain bog‘langan holat (test subdomen misoli).

## 4.2. Biz qaytadan qilgan test

Tushunishni mustahkamlash uchun yangi Worker \`<test-worker-name>\` yaratildi va \`demo2.example.com\` Custom Domain sifatida bog‘landi. Screenshotda Name = demo2.example.com, Environment = Production, Zone = example.com ko‘rinadi. Bu \`verify.example.com\`ning ayni mexanizmini qayta amalda ko‘rsatadi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td>demo2.example.com<br />
↓ Custom Domain mapping<br />
<test-worker-name> Worker</td>
</tr>
</tbody>
</table>

# 5. Cloudflare Worker request routing

Browser \`https://verify.example.com/...\` manzilini ochganda request Cloudflare Edge’ga keladi. Custom Domain mapping tufayli Cloudflare shu requestni \`<worker-name>\` Worker runtime’iga beradi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td>GET /v/VM-PDF-2026-000009?t=TOKEN HTTP/2<br />
Host: verify.example.com<br />
<br />
Cloudflare Edge<br />
→ Custom Domain mapping<br />
→ <worker-name><br />
→ fetch(request, env)</td>
</tr>
</tbody>
</table>

## 5.1. Host restriction

Worker kodida \`url.hostname\` tekshiruvi qo‘shildi. Host \`verify.example.com\` bo‘lmasa 404 Not Found qaytariladi. Shu sabab Worker’ning \`workers.dev\` texnik domeni production kirish nuqtasi sifatida ishlamaydi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td>if (url.hostname !== "verify.example.com") {<br />
return new Response("Not Found", { status: 404 });<br />
}</td>
</tr>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>Qayerda?<br />
</strong>Cloudflare → Workers &amp; Pages → <worker-name> → Edit code. Bu Worker source kodining request boshidagi host-check qismi.</td>
</tr>
</tbody>
</table>

# 6. Google Cloud bilan integratsiya

Worker Google Sheets va Google Drive’ga to‘g‘ridan-to‘g‘ri anonymous tarzda kira olmaydi. Google Cloud’da \`VivaMed Verify Reader\` Service Account yaratildi, Sheets API va Drive API yoqildi, read-only credential Cloudflare Secret sifatida berildi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td>Worker<br />
→ GCP_SERVICE_ACCOUNT_JSON Secret<br />
→ Service Account JWT (RS256)<br />
→ Google OAuth<br />
→ Access Token<br />
→ Sheets API / Drive API</td>
</tr>
</tbody>
</table>

|                                   |                                                     |
|-----------------------------------|-----------------------------------------------------|
| **Cloudflare runtime qiymati**    | **Vazifasi**                                        |
| GCP_SERVICE_ACCOUNT_JSON (Secret) | Service Account credential; OAuth uchun             |
| FILE_TICKET_SECRET (Secret)       | 5 daqiqalik file ticket HMAC imzosi                 |
| GOOGLE_SHEETS_ID (Text)           | Qaysi reyestr o‘qilishini ko‘rsatadi                |
| APPROVED_FOLDER_ID (Text)         | Qaysi Drive papka ruxsatli ekanini tekshirish uchun |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>Cloudflare UI yo‘li<br />
</strong>Worker → Settings / Bindings yoki Runtime variables and secrets. Secret qiymatlar kodga qotirib yozilmagan.</td>
</tr>
</tbody>
</table>

# 7. Private PDF gateway

Verification ACTIVE bo‘lgach, foydalanuvchiga Google Drive URL emas, Worker yaratgan qisqa muddatli \`/file/...\` URL beriladi.

|                                                |
|------------------------------------------------|
| /file/{docNo}?exp={epoch}&mode=view&sig={hmac} |

## 7.1. Signed ticket tarkibi

|              |                                           |
|--------------|-------------------------------------------|
| **Parametr** | **Ma’nosi**                               |
| docNo        | Hujjat raqami                             |
| exp          | Link tugash vaqti (epoch)                 |
| mode         | view yoki download                        |
| sig          | FILE_TICKET_SECRET bilan HMAC-SHA256 imzo |

## 7.2. Fayl berishdan oldingi tekshiruv

16. \`exp\` mavjud va integer ekanini tekshirish.

17. Muddati o‘tgan bo‘lsa rad etish.

18. Juda uzoq kelajak timestampini rad etish.

19. \`mode\` faqat view/download ekanini tekshirish.

20. HMAC \`sig\`ni tekshirish.

21. Sheets’dan hujjatni qayta o‘qish va STATUS=ACTIVE talab qilish.

22. Drive metadata olish.

23. Parent ichida APPROVED_FOLDER_ID borligini tekshirish.

24. MIME type = application/pdf talab qilish.

25. Shundan keyin \`alt=media\` bilan PDF stream olish.

# 8. QR skan xavfsizlik qatlamlari

|        |                           |                                                              |
|--------|---------------------------|--------------------------------------------------------------|
| **\#** | **Qatlam**                | **Nimani himoya qiladi**                                     |
| 1      | HTTPS/TLS                 | Telefon ↔ Cloudflare trafikini shifrlaydi                    |
| 2      | Rasmiy hostname check     | workers.dev kabi boshqa hostni 404 qiladi                    |
| 3      | docNo + token             | Faqat hujjat raqamini taxmin qilish yetmaydi                 |
| 4      | STATUS                    | ACTIVE va REVOKED holatini real vaqtda ajratadi              |
| 5      | Read-only Service Account | Worker Google resurslarini o‘zgartira olmaydi                |
| 6      | Cloudflare Secret         | Google private credential koddan ajratilgan                  |
| 7      | 5 daqiqalik expiry        | PDF URL doimiy access bo‘lib qolmaydi                        |
| 8      | HMAC signature            | URL parametrini soxtalashtirishni to‘sadi                    |
| 9      | STATUS re-check           | Signed URL hali tirik bo‘lsa ham REVOKED hujjat berilmaydi   |
| 10     | Approved-folder check     | Begona File ID bilan boshqa Drive fayl chiqarilmaydi         |
| 11     | PDF MIME check            | Faqat application/pdf stream qilinadi                        |
| 12     | Restricted Drive          | Anyone with link public access yo‘q                          |
| 13     | Security headers          | Cache, iframe, referrer va MIME sniffing xavfini kamaytiradi |

## 8.1. HMAC nima uchun muhim?

\`sig\` docNo + exp + mode qiymatlaridan maxfiy \`FILE_TICKET_SECRET\` bilan hosil qilinadi. Kimdir URL’da \`mode\`, \`exp\` yoki hujjat raqamini o‘zgartirsa, eski imzo mos kelmaydi. Secretni bilmagan odam yangi valid imzo yarata olmaydi.

## 8.2. STATUS ikki marta nega tekshiriladi?

Birinchi tekshiruv QR sahifasida. Ikkinchisi PDF file route’da. Shu bilan QR tekshirilgandan keyin hujjat REVOKE qilinsa, oldin berilgan 5 daqiqalik link orqali ham PDF chiqmaydi.

# 9. Apps Script va Registry’dagi o‘zgarishlar

|                         |                                |                                                                                |
|-------------------------|--------------------------------|--------------------------------------------------------------------------------|
| **Fayl**                | **Funksiya / qism**            | **Qilingan ish**                                                               |
| Code.gs                 | approveDocument\_()            | Final PDF yaratish; SHA-256 hisoblash; public sharing chaqiruvi olib tashlandi |
| Code.gs                 | sha256Hex\_()                  | Final PDF bytes uchun SHA-256 fingerprint                                      |
| Code.gs                 | restrictOldApprovedFilesOnce() | Eski Approved fayllardan \`anyone\` permissionlarni bir martalik olib tashlash |
| Code.gs                 | handleRevokeDocument(e)        | Tasdiqlangan hujjatni bekor qilish oqimi                                       |
| Registry.gs             | reserve()                      | docNo/token rezerv; STATUS=RESERVED                                            |
| Registry.gs             | fill()                         | Metadata + FILE_SHA256; STATUS=ACTIVE                                          |
| Registry.gs             | findForVerification()          | Verification uchun reyestr yozuvini topish; legacy blank status→ACTIVE         |
| Registry.gs             | revoke()                       | ACTIVE→REVOKED; sana, kim, sabab                                               |
| WebApp.gs / Verify.html | Legacy public verification     | Yangi production public path emas; rollback/ichki meros qismi                  |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>Muhim ajratish<br />
</strong>Apps Script — write/approval boshqaruvi. Cloudflare Worker — public read/verification gateway. Bu rollarni aralashtirmaslik tizimni xavfsizroq qiladi.</td>
</tr>
</tbody>
</table>

# 10. Cloudflare sahifalarida nima sozlandi?

|                                     |                                                                          |
|-------------------------------------|--------------------------------------------------------------------------|
| **Cloudflare sahifasi**             | **Qilingan sozlama**                                                     |
| Domain zone: example.com           | registrator nameserver delegatsiyasidan keyin zone Active                      |
| Workers & Pages → <worker-name> | Production Worker                                                        |
| Worker → Domains                    | verify.example.com Custom Domain                                        |
| Worker → Settings / Bindings        | GOOGLE_SHEETS_ID, APPROVED_FOLDER_ID                                     |
| Worker → Settings / Secrets         | GCP_SERVICE_ACCOUNT_JSON, FILE_TICKET_SECRET                             |
| Worker → Edit code                  | Host restriction, /v route, /file route, Google OAuth/API, HMAC, headers |
| Worker → workers.dev URL            | Production uchun host check bilan 404                                    |
| Temporary /\_health/google          | OAuth + Sheets + Drive diagnostika; production’da public route yopilgan  |

# 11. Google Drive’da nima o‘zgardi?

Approved papka Service Account bilan Viewer sifatida share qilingan. General access Restricted. Bu ikki maqsadga xizmat qiladi: oddiy foydalanuvchi Drive URL bilan PDF’ga kira olmaydi; Worker esa Service Account orqali Drive API’dan o‘qiy oladi.

|                                |                                            |
|--------------------------------|--------------------------------------------|
| **Subyekt**                    | **Huquq**                                  |
| Oddiy internet foydalanuvchisi | Restricted: to‘g‘ridan-to‘g‘ri access yo‘q |
| VivaMed Verify Reader          | Viewer: API orqali o‘qish mumkin           |
| Apps Script egasi / owner      | Hujjat yaratish va boshqarish              |

# 12. Testlar va real natijalar

|                            |                                 |                                  |
|----------------------------|---------------------------------|----------------------------------|
| **Test**                   | **Kutilgan natija**             | **Natija**                       |
| ACTIVE QR                  | Hujjat haqiqiy                  | Ishladi                          |
| Hujjatni ko‘rish           | verify.example.com ostida PDF  | Ishladi                          |
| Restricted PDF             | Worker orqali baribir ochilishi | Ishladi                          |
| Noto‘g‘ri token            | Hujjat topilmadi                | Ishladi                          |
| 5 daqiqadan eski file link | Havola muddati tugagan          | Ishladi                          |
| REVOKED hujjat             | Bekor qilingan; PDF yo‘q        | Ishladi                          |
| workers.dev                | 404 Not Found                   | Ishladi                          |
| Old Approved migration     | Public permission olib tashlash | 8 checked / 6 removed / 0 errors |

# 13. Troubleshooting

|                             |                                                                  |
|-----------------------------|------------------------------------------------------------------|
| **Belgi**                   | **Tekshirish**                                                   |
| verify domen ochilmaydi     | Cloudflare zone Active, Custom Domain status, DNS/TLS            |
| workers.dev ham ochilmaydi  | Host check ataylab 404 qilayotgan bo‘lishi mumkin                |
| QR “topilmadi”              | docNo va token; Registry A/J; Worker search                      |
| Google 401                  | Service Account credential/JWT/OAuth                             |
| Google 403                  | API enabledmi, Sheet/Folder Viewer sharing bormi, readonly scope |
| PDF 403/404                 | STATUS, File ID, parent folder, MIME type                        |
| Signed link expired         | QR’ni qayta skan qilib yangi ticket olish                        |
| REVOKED lekin PDF chiqyapti | /file route’dagi STATUS re-checkni tekshirish                    |

# 14. Texnik audit checklist

- registrator nameserverlari Cloudflare’ga delegatsiya qilingan.

- Cloudflare zone Active.

- verify.example.com Worker Custom Domain.

- workers.dev production host sifatida bloklangan.

- GCP credential faqat Secret’da.

- FILE_TICKET_SECRET faqat Secret’da.

- Service Account Project Owner/Editor emas.

- Sheet va Approved folder faqat Viewer.

- OAuth scopes read-only.

- Approved PDF’lar Restricted.

- Public setSharing kodi yo‘q.

- QR docNo + token bilan.

- STATUS=ACTIVE talab qilinadi.

- /file signed link 5 daqiqa.

- HMAC tekshiriladi.

- /file STATUS qayta tekshiradi.

- Drive parent va PDF MIME tekshiriladi.

- Cache-Control private,no-store.

- X-Content-Type-Options nosniff.

- Referrer-Policy no-referrer.

- X-Frame-Options DENY.

# 15. Yakuniy arxitektura

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td>Telefon / QR<br />
↓ HTTPS<br />
verify.example.com<br />
↓ Cloudflare Edge<br />
Custom Domain → <worker-name> Worker<br />
↓ host + docNo + token<br />
Google OAuth ← Service Account Secret<br />
↓ Access Token<br />
Google Sheets API → Registry STATUS<br />
↓ ACTIVE<br />
5-min HMAC signed /file link<br />
↓<br />
Worker: expiry + sig + STATUS re-check<br />
↓<br />
Google Drive API metadata<br />
↓ parent + MIME check<br />
Restricted PDF stream<br />
↓<br />
Cloudflare Worker<br />
↓<br />
Browser (verify.example.com)</td>
</tr>
</tbody>
</table>

## 15.1. 2 daqiqalik professional tushuntirish

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>Tayyor matn<br />
</strong>Biz hujjat verification’ini Cloudflare Worker’ga ko‘chirdik. `example.com` domenining DNS’i registrator’dan Cloudflare nameserverlariga delegatsiya qilingan va `verify.example.com` Worker’ga Custom Domain qilib biriktirilgan. PDF’lar Google Drive’da qoladi, lekin public sharing o‘chirilib Restricted qilingan. Worker Google Cloud Service Account orqali read-only OAuth token olib Sheets’dan STATUS va tokenni tekshiradi. ACTIVE bo‘lsa 5 daqiqalik HMAC-signed `/file` havola yaratadi. PDF berishda STATUS qayta tekshiriladi, Drive parent papka va MIME type validatsiya qilinadi. PDF Google Drive URL bilan emas, Worker orqali byte stream sifatida `verify.example.com` domeni ostida beriladi. Shu sabab public Drive link yo‘q, REVOKED hujjat bloklanadi va Worker Google resurslarini o‘zgartira olmaydi.</td>
</tr>
</tbody>
</table>

# Ilova: “qayerda nima bor?” tezkor xarita

|               |                                     |                                                    |
|---------------|-------------------------------------|----------------------------------------------------|
| **Platforma** | **Sahifa/fayl**                     | **Mas’uliyat**                                     |
| registrator         | Domain nameservers                  | Cloudflare NS delegatsiyasi                        |
| Cloudflare    | Zone: example.com                  | Authoritative DNS                                  |
| Cloudflare    | Workers & Pages → <worker-name> | Public verification backend                        |
| Cloudflare    | Domains                             | verify.example.com Custom Domain                  |
| Cloudflare    | Settings/Bindings/Secrets           | Google IDs va maxfiy credential                    |
| Cloudflare    | Worker source                       | Routing, OAuth, Sheets, Drive, signed file gateway |
| Google Cloud  | VivaMed Verify Security             | APIs + Service Account                             |
| Google Drive  | 02 — Tasdiqlangan                   | Restricted PDF storage                             |
| Google Sheets | Reyestr                             | docNo/token/status/File ID                         |
| Apps Script   | Code.gs                             | Approval/PDF generation/revoke UI helpers          |
| Apps Script   | Registry.gs                         | Reyestr state machine                              |
| Apps Script   | WebApp.gs + Verify.html             | Legacy verification web app                        |
