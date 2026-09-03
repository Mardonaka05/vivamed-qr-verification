# Google Cloud Console — API va Service Account infratuzilmasi

GCP loyihasi, Sheets/Drive API, Service Account, kalitlar va Worker uchun read-only ruxsatlar.

> Bu — loyiha davomida yozilgan asl texnik kitoblardan biri, o'zbek tilida.
> Ommaviy repo uchun real identifikatorlar (domen, Drive/Sheets ID, GCP loyiha,
> Worker nomi, elektron pochta, ism) o'rniga placeholder qo'yilgan, konsol
> skrinshotlari esa olib tashlangan.
> Inglizcha qisqartirilgan hujjatlar: [`../en/`](../en/)

---

**VivaMed Google Cloud Console**

**QR-verifikatsiya tizimi uchun texnik arxitektura, API, Service Account va xavfsizlik qo‘llanmasi**

**2-versiya • 2026**

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>Kitobning vazifasi<br />
</strong>Bu qo‘llanma faqat Google Cloud Console qismiga bag‘ishlangan. Maqsad — VivaMed QR-verifikatsiya tizimida Google Cloud’da nima uchun loyiha yaratildi, qaysi API’lar yoqildi, Service Account nima uchun kerak bo‘ldi, Worker Google’ga qanday autentifikatsiya qilishi va xavfsizlik qanday tashkil etilganini bosqichma-bosqich tushuntirish.</td>
</tr>
</tbody>
</table>

**Maxfiy private key va secret qiymatlar kitobga kiritilmagan.**

# Mundarija

1.  Google Cloud Console nima va bu tizimda qayerda turadi?

2.  Nega alohida Google Cloud Project yaratdik?

3.  VivaMed Verify Security project tuzilishi

4.  Google Sheets API — reyestrga dasturiy kirish

5.  Google Drive API — private PDF’larni o‘qish

6.  Service Account nima va nega VivaMed Verify Reader yaratildi?

7.  Nega Project IAM role bermadik?

8.  Viewer va Least Privilege xavfsizlik modeli

9.  Service Account JSON key va private_key

10. JWT, OAuth va Access Token oqimi

11. Read-only scopes nima uchun muhim?

12. Cloudflare Worker bilan Google Cloud bog‘lanishi

13. QR skaner vaqtida Google Cloud qayerda qatnashadi?

14. PDF ochilganda Google Drive API qanday ishlaydi?

15. Google Cloud’da qilgan ishlarimiz — amaliy ketma-ketlik

16. Xavfsizlik modeli va tahdidlar

17. Troubleshooting: nimadir ishlamasa qayerdan tekshiriladi?

18. Key rotation va texnik xizmat

19. Yakuniy arxitektura

20. Hamkasb yoki doktor uchun 2 daqiqalik tushuntirish

# 1. Google Cloud Console nima va bu tizimda qayerda turadi?

Google Cloud Console — Google’ning bulut xizmatlarini, API’larini, identifikatsiya va ruxsatlarni boshqarish paneli. Bizning tizimda u hujjatlar saqlanadigan joy emas. PDF’lar Google Drive’da, reyestr Google Sheets’da saqlanadi. Google Cloud Console esa Cloudflare Worker’ga shu resurslar bilan dasturiy va xavfsiz ishlash imkonini beradigan texnik boshqaruv markazi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>Eng muhim fikr<br />
</strong>Google Cloud Console = “hujjat ombori” emas. U = API eshiklari + Service Account + autentifikatsiya + ruxsat siyosati.</td>
</tr>
</tbody>
</table>

Rasm 1. Google Cloud Console’ning VivaMed verification tizimidagi asosiy roli.

# 2. Nega alohida Google Cloud Project yaratdik?

Cloudflare Worker Google serverida ishlamaydi. U Cloudflare infratuzilmasida ishlaydi. Worker Google Sheets yoki Google Drive’ga kirishga uringanda Google undan “Sen kimsan?” va “Senga nimaga ruxsat berilgan?” deb so‘raydi. Shu savollarga rasmiy javob berish uchun Google Cloud Project kerak bo‘ldi.

Biz Google Cloud’da VivaMed verification infratuzilmasini boshqa tasodifiy xizmatlardan ajratib, alohida loyiha ichiga yig‘dik. Bu loyiha ichida faqat shu verification tizimiga kerak bo‘lgan API’lar va Service Account boshqariladi.

| **Element**          | **Bizdagi qiymat / maqsad**                                          |
|----------------------|----------------------------------------------------------------------|
| Project nomi         | VivaMed Verify Security                                              |
| Project ID           | <gcp-project-id>                                              |
| Vazifa               | Cloudflare Worker uchun Google API va identifikatsiya infratuzilmasi |
| Asosiy API’lar       | Google Sheets API, Google Drive API                                  |
| Asosiy identifikator | VivaMed Verify Reader Service Account                                |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>Nega alohida project foydali?<br />
</strong>Audit osonlashadi, ruxsatlar chalkashmaydi, keylarni aylantirish (rotation) aniq bo‘ladi va kelajakda aynan verification tizimiga tegishli xavfsizlik siyosatini alohida boshqarish mumkin.</td>
</tr>
</tbody>
</table>

# 3. VivaMed Verify Security project tuzilishi

Project ichidagi mantiqiy tuzilma quyidagicha:

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td>VivaMed Verify Security<br />
├── Google Sheets API<br />
├── Google Drive API<br />
├── IAM &amp; Admin<br />
│ └── Service Accounts<br />
│ └── VivaMed Verify Reader<br />
└── Credentials<br />
└── Service Account JSON key</td>
</tr>
</tbody>
</table>

Project o‘zi Drive fayllariga avtomatik ruxsat bermaydi. Project faqat Google tarafidagi texnik identifikatsiya va API muhitini yaratadi. Qaysi aniq Sheet va qaysi aniq Drive papkasini Service Account ko‘rishi esa keyinchalik Google Drive/Sheets sharing orqali berildi.

# 4. Google Sheets API — reyestrga dasturiy kirish

QR skaner qilinganda Worker hujjatning raqami, tokeni va STATUS holatini reyestrdan tekshirishi kerak. Reyestr Google Sheets’da. Oddiy odam jadvalni brauzer orqali ochadi, lekin Worker brauzerdagi tugmalarni bosmaydi. U Google Sheets API orqali jadval qiymatlarini JSON ko‘rinishida oladi.

## 4.1. API’ni nega Enabled qildik?

Google Sheets API yoqilmasa, Worker Google Sheets’ga dasturiy so‘rov yubora olmaydi. Shu sabab Google Cloud Console → APIs & Services orqali Google Sheets API yoqildi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td>Cloudflare Worker<br />
↓<br />
Google Sheets API<br />
↓<br />
VivaMed Hujjatlar Reyestri NEW<br />
↓<br />
Reyestr!A2:P<br />
↓<br />
docNo + token + STATUS + File ID</td>
</tr>
</tbody>
</table>

## 4.2. Worker Sheets’dan nimani o‘qiydi?

| **Ustun** | **Ma’lumot**        | **Verification uchun vazifasi**       |
|-----------|---------------------|---------------------------------------|
| A         | Hujjat raqami       | QR’dagi docNo bilan solishtirish      |
| C         | File ID             | Keyin private PDF’ni Drive’dan topish |
| J         | Token               | QR maxfiy tokenini tekshirish         |
| L         | STATUS              | ACTIVE / REVOKED / boshqa holat       |
| M         | FILE_SHA256         | Fayl fingerprinti                     |
| N–P       | REVOKE ma’lumotlari | Bekor qilingan sana, kim va sabab     |

# 5. Google Drive API — private PDF’larni o‘qish

Google Sheets faqat hujjat haqidagi ma’lumotlarni beradi. PDF faylning o‘zi Google Drive’dagi “02 — Tasdiqlangan” papkada saqlanadi. Bu PDF’lar Restricted holatda. Foydalanuvchi Drive’ning public linkini olmaydi.

## 5.1. Drive API nima qiladi?

Worker avval File ID bo‘yicha metadata so‘raydi: fayl mavjudmi, nomi nima, MIME turi PDF’mi, parent papkasi aynan Approved papkami. So‘ng hammasi to‘g‘ri bo‘lsa \`alt=media\` orqali PDF byte stream olinadi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td>Worker<br />
↓<br />
Drive API metadata<br />
↓<br />
id + name + mimeType + parents<br />
↓<br />
Approved papka tekshiruvi<br />
↓<br />
application/pdf tekshiruvi<br />
↓<br />
files/{fileId}?alt=media<br />
↓<br />
Private PDF stream</td>
</tr>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>Muhim xavfsizlik natijasi<br />
</strong>Google Drive’da “Anyone with the link” kerak emas. PDF Restricted bo‘lsa ham Service Account Viewer sifatida API orqali o‘qiy oladi.</td>
</tr>
</tbody>
</table>

# 6. Service Account nima va nega VivaMed Verify Reader yaratildi?

Service Account — odam uchun emas, dastur yoki server uchun yaratiladigan Google identifikatoridir. Oddiy Gmail foydalanuvchi brauzerga kiradi; Service Account esa kod orqali Google API bilan ishlaydi.

Biz Cloudflare Worker uchun “VivaMed Verify Reader” nomli Service Account yaratdik. Worker Google’ga aynan shu identifikator nomidan murojaat qiladi.

| **Oddiy Google akkaunt**  | **Service Account**       |
|---------------------------|---------------------------|
| Odam foydalanadi          | Dastur/server foydalanadi |
| Login, brauzer, UI        | JWT/OAuth/API             |
| Keng kundalik funksiyalar | Aniq texnik vazifa        |
| Ko‘pincha interaktiv      | Avtomatik                 |

Rasm 2. Google Cloud Console’da Service Account konfiguratsiyasi ko‘rinishi.

# 7. Nega Project IAM role bermadik?

Service Account yaratishda Google project darajasida role berishni taklif qiladi. Masalan Editor, Viewer yoki boshqa IAM rollar. Biz verification Worker’ga project bo‘ylab keng huquq bermadik.

Sababi: Worker’ga butun Google Cloud projectni boshqarish kerak emas. Uning vazifasi faqat bitta reyestrni va Approved papkadagi private PDF’larni o‘qish.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>Qabul qilingan prinsip: Least Privilege<br />
</strong>Dasturga qancha huquq kerak bo‘lsa, faqat shuncha beriladi. Kengroq huquq xavfsizlikni kuchaytirmaydi, aksincha buzilish oqibatini kattalashtiradi.</td>
</tr>
</tbody>
</table>

Rasm 3. Service Account yaratishda role/permission bosqichi. Biz keng project roli berishdan qochdik.

# 8. Viewer va Least Privilege xavfsizlik modeli

Service Account’ga Google Sheets fayli va “02 — Tasdiqlangan” papka alohida share qilindi. Huquq — Viewer (Читатель). Demak Worker o‘qiydi, lekin yozmaydi.

| **Amal**                       | **Worker Service Account** |
|--------------------------------|----------------------------|
| Reyestrni o‘qish               | Ruxsat                     |
| Private PDF’ni o‘qish          | Ruxsat                     |
| Sheets’da STATUS o‘zgartirish  | Ruxsat yo‘q                |
| PDF o‘chirish                  | Ruxsat yo‘q                |
| PDF permissionini o‘zgartirish | Ruxsat yo‘q                |
| Yangi PDF yaratish             | Ruxsat yo‘q                |

Bu arxitekturada public internetga qaragan Worker buzilgan taqdirda ham uning Google tarafidagi huquqi cheklangan. Hujjat yaratish, tasdiqlash va REVOKE yozuvlari Apps Script tarafida qoladi.

# 9. Service Account JSON key va private_key

Service Account yaratildi, lekin Worker Google’ga “men aynan shu Service Accountman” deb kriptografik tarzda isbotlashi kerak. Shu uchun JSON key yaratildi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td>{<br />
"client_email": "vivamed-verify-reader@....iam.gserviceaccount.com",<br />
"private_key_id": "...",<br />
"private_key": "-----BEGIN PRIVATE KEY----- ...",<br />
"token_uri": "https://oauth2.googleapis.com/token"<br />
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
<td><strong>Maxfiylik qoidasi<br />
</strong>JSON fayl va ayniqsa `private_key` parolga teng darajada maxfiy. Uni chatga, GitHub’ga, Worker kodiga yoki screenshotga ochiq qo‘yish mumkin emas.</td>
</tr>
</tbody>
</table>

Biz JSON’ni Cloudflare Worker kodiga qotirib yozmadik. Uni Cloudflare Runtime Secrets ichida \`GCP_SERVICE_ACCOUNT_JSON\` sifatida saqladik. Worker ishlaganda secretni \`env.GCP_SERVICE_ACCOUNT_JSON\` orqali oladi.

# 10. JWT, OAuth va Access Token oqimi

Worker private key’ni har bir Google API so‘roviga yubormaydi. Avval Service Account nomidan imzolangan JWT yaratadi, uni Google OAuth token endpoint’iga yuboradi va vaqtinchalik Access Token oladi.

Rasm 4. Service Account credential’dan Google Access Token olish jarayoni.

## 10.1. JWT ichida nima bor?

| **Maydon** | **Mazmun**                       |
|------------|----------------------------------|
| iss        | Service Account email            |
| scope      | Drive readonly + Sheets readonly |
| aud        | Google OAuth token endpoint      |
| iat        | Token yaratilgan vaqt            |
| exp        | JWT amal qilish muddati          |
| alg        | RS256                            |

## 10.2. Google nima tekshiradi?

- JWT imzosi Service Account private key bilan to‘g‘ri imzolanganmi?

- Service Account haqiqatan mavjudmi?

- JWT muddati to‘g‘rimi?

- So‘ralgan scopes ruxsat etilgan formatdami?

- Audience Google OAuth endpoint’iga mosmi?

Hammasi to‘g‘ri bo‘lsa Google Access Token qaytaradi. Worker keyingi API so‘rovlariga \`Authorization: Bearer ACCESS_TOKEN\` headerini qo‘shadi.

# 11. Read-only scopes nima uchun muhim?

JWT yaratishda Worker Google’dan aynan qaysi vakolatlarni so‘rashini scope orqali bildiradi. Biz to‘liq write scope emas, read-only scope ishlatdik.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td>https://www.googleapis.com/auth/drive.readonly<br />
https://www.googleapis.com/auth/spreadsheets.readonly</td>
</tr>
</tbody>
</table>

Bu ikki qatlamli himoya beradi: 1) Service Account aniq Drive/Sheet resurslariga Viewer qilib share qilingan; 2) OAuth tokenning o‘zi ham read-only scope bilan olinadi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>Defense in depth<br />
</strong>Bir qatlam noto‘g‘ri sozlangan taqdirda ham ikkinchi qatlam huquqni cheklab turadi. Bu professional xavfsizlik arxitekturasining muhim prinsipi.</td>
</tr>
</tbody>
</table>

# 12. Cloudflare Worker bilan Google Cloud bog‘lanishi

Google Cloud Console Cloudflare’ga to‘g‘ridan-to‘g‘ri trafik yubormaydi. Bog‘lanish credential + OAuth + API orqali amalga oshadi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td>Google Cloud Console<br />
├── Project<br />
├── Sheets API enabled<br />
├── Drive API enabled<br />
└── Service Account + JSON key<br />
│<br />
▼<br />
Cloudflare Secret: GCP_SERVICE_ACCOUNT_JSON<br />
│<br />
▼<br />
Cloudflare Worker<br />
│<br />
▼<br />
JWT → Google OAuth → Access Token<br />
│<br />
┌───────┴────────┐<br />
▼ ▼<br />
Sheets API Drive API</td>
</tr>
</tbody>
</table>

Demak Google Cloud Console — sozlash va boshqarish paneli. Production vaqtda esa foydalanuvchi Console UI’ga kirmaydi. Real ishlaydigan komponentlar OAuth server, Sheets API, Drive API va Service Account identifikatsiyasidir.

# 13. QR skaner vaqtida Google Cloud qayerda qatnashadi?

Foydalanuvchi QR’ni skaner qilganda avval \`verify.example.com\` orqali Cloudflare Worker’ga HTTPS GET so‘rovi keladi. Google Cloud shu requestning birinchi qabul qiluvchisi emas. Google Cloud bosqichi Worker hujjatni reyestrdan tekshirishga kirishganda boshlanadi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td>Telefon<br />
↓ HTTPS GET<br />
verify.example.com/v/VM-PDF-...?t=...<br />
↓<br />
Cloudflare Edge<br />
↓<br />
Cloudflare Worker<br />
↓<br />
Service Account credential<br />
↓<br />
Google OAuth<br />
↓<br />
Access Token<br />
↓<br />
Google Sheets API<br />
↓<br />
Reyestr: docNo + token + STATUS</td>
</tr>
</tbody>
</table>

Agar hujjat ACTIVE bo‘lsa Worker “Hujjat haqiqiy” sahifasini chiqaradi. Agar REVOKED bo‘lsa “Hujjat bekor qilingan”. Token noto‘g‘ri bo‘lsa “Hujjat topilmadi”.

# 14. PDF ochilganda Google Drive API qanday ishlaydi?

Foydalanuvchi “Hujjatni ko‘rish”ni bosganda Worker 5 daqiqalik signed linkni tekshiradi. So‘ng STATUS’ni Sheets’dan yana tekshiradi. Hujjat hali ACTIVE bo‘lsa File ID bo‘yicha Drive API ishlaydi.

21. Worker signed linkdagi \`exp\`, \`mode\`, \`sig\` qiymatlarini tekshiradi.

22. Worker Google Sheets API orqali hujjat STATUS’ini yana tekshiradi.

23. File ID olinadi.

24. Drive API orqali metadata olinadi.

25. Faylning parent papkasi \`02 — Tasdiqlangan\` ekanligi tekshiriladi.

26. MIME type \`application/pdf\` ekanligi tekshiriladi.

27. Drive API \`alt=media\` orqali private PDF byte stream beradi.

28. Worker PDF’ni foydalanuvchiga \`verify.example.com\` domeni orqali uzatadi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>Nega STATUS yana tekshiriladi?<br />
</strong>Signed link 5 daqiqa ishlashi mumkin, lekin shu 5 daqiqa ichida hujjat REVOKE qilinishi ehtimoli bor. Shu sabab `/file` route PDF berishdan oldin reyestrni qayta tekshiradi.</td>
</tr>
</tbody>
</table>

# 15. Google Cloud’da qilgan ishlarimiz — amaliy ketma-ketlik

29. Google Cloud Console’ga kirdik.

30. Yangi project yaratdik: \`VivaMed Verify Security\`.

31. Project ID: \`<gcp-project-id>\`.

32. APIs & Services bo‘limidan Google Drive API’ni yoqdik.

33. Google Sheets API’ni yoqdik.

34. IAM & Admin → Service Accounts bo‘limiga kirdik.

35. \`VivaMed Verify Reader\` Service Account yaratdik.

36. Service Account’ga keng Project IAM role bermadik.

37. Service Account uchun JSON key yaratdik.

38. JSON credential’ni maxfiy saqladik.

39. Google Sheets reyestrini Service Account bilan Viewer qilib share qildik.

40. \`02 — Tasdiqlangan\` Drive papkasini Service Account bilan Viewer qilib share qildik.

41. JSON credential’ni Cloudflare’da \`GCP_SERVICE_ACCOUNT_JSON\` Secret qilib joylashtirdik.

42. Worker’da JWT/OAuth token olish funksiyalarini yozdik.

43. Worker Sheets API va Drive API’ga read-only access token bilan ulanadigan bo‘ldi.

44. \`/\_health/google\` orqali Google Auth + Sheets + Drive ulanishini test qildik.

45. Test muvaffaqiyatli bo‘lgach diagnostika endpointini public ishlab chiqarish muhitida yopdik.

Rasm 5. Google Cloud Console’ning API/sozlamalar qismidan foydalangan bosqichlardan biri.

Rasm 6. Service Account’ga ruxsat berish oynasi va minimal huquq yondashuvi.

# 16. Xavfsizlik modeli va tahdidlar

| **Tahdid**                                 | **Bizdagi himoya**                            |
|--------------------------------------------|-----------------------------------------------|
| Worker credential chiqib ketishi           | Secret; kodga yozilmagan; key rotation mumkin |
| Worker Sheets’ni o‘zgartirishi             | Viewer + spreadsheets.readonly                |
| Worker PDF o‘chirishi                      | Viewer + drive.readonly                       |
| Public Drive link tarqalishi               | PDF’lar Restricted                            |
| Noto‘g‘ri QR token                         | docNo + token verifikatsiyasi                 |
| Eski signed link                           | 5 daqiqalik expiration                        |
| REVOKED hujjat signed link bilan ochilishi | PDF berishdan oldin STATUS qayta tekshiriladi |
| Noto‘g‘ri File ID orqali boshqa fayl       | Approved parent folder + PDF MIME tekshiruvi  |

## 16.1. Nega Service Account maxsus Reader?

Nomining o‘zi ham arxitektura maqsadini aks ettiradi: bu identifikator verification uchun o‘qiydi. Hujjat hayot siklini boshqarish (approve, revoke, archive) Apps Scriptda qoladi.

# 17. Troubleshooting: nimadir ishlamasa qayerdan tekshiriladi?

| **Muammo**             | **Birinchi tekshiruv**       | **Ehtimoliy sabab**                                          |
|------------------------|------------------------------|--------------------------------------------------------------|
| Google Auth ishlamaydi | GCP_SERVICE_ACCOUNT_JSON     | JSON noto‘g‘ri, private key buzilgan yoki key bekor qilingan |
| Sheets ishlamaydi      | Sheets API + Sheet sharing   | API o‘chiq yoki Service Account Viewer emas                  |
| Drive ishlamaydi       | Drive API + Approved sharing | API o‘chiq yoki papka Service Account bilan share qilinmagan |
| PDF 404                | File ID va Drive metadata    | Reyestr File ID noto‘g‘ri yoki fayl mavjud emas              |
| PDF 403                | Parent folder                | Fayl Approved papkada emas                                   |
| OAuth error            | JWT vaqt/scopes/audience     | Credential yoki token request noto‘g‘ri                      |

## 17.1. Diagnostika tamoyili

Muammoni yuqoridan pastga tekshirish kerak: 1) credential bor-mi, 2) OAuth token olinadimi, 3) Sheets API ishlaydimi, 4) Drive API ishlaydimi, 5) aniq resource permission to‘g‘rimi. Shunda muammo qatlamini tez topish mumkin.

# 18. Key rotation va texnik xizmat

Service Account JSON key uzoq muddatli credential hisoblanadi. Uni cheksiz vaqtga o‘zgartirmasdan qoldirish tavsiya etilmaydi. Rejali key rotation xavfsizlikni oshiradi.

46. Google Cloud Console’da yangi Service Account key yaratiladi.

47. Yangi JSON maxfiy tarzda olinadi.

48. Cloudflare’dagi \`GCP_SERVICE_ACCOUNT_JSON\` Secret yangi qiymatga almashtiriladi.

49. Health/test orqali yangi key ishlashi tekshiriladi.

50. Shundan keyingina eski key Google Cloud Console’dan o‘chiriladi.

51. Hech qachon avval eski keyni o‘chirib, keyin yangi keyni sinamang.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>Kelajakdagi yuqori daraja<br />
</strong>Agar keyless arxitekturaga o‘tish zarur bo‘lsa, Workload Identity Federation kabi mexanizmlarni o‘rganish mumkin. Hozirgi tizimda Service Account JSON key + Cloudflare Secret ishlatilmoqda.</td>
</tr>
</tbody>
</table>

# 19. Yakuniy arxitektura

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td>GOOGLE CLOUD<br />
┌─────────────────────────────────────────────────────────┐<br />
│ Project: VivaMed Verify Security │<br />
│ │<br />
│ Google Sheets API Google Drive API │<br />
│ ▲ ▲ │<br />
│ │ │ │<br />
│ └──────── Access Token ─────┘ │<br />
│ ▲ │<br />
│ │ │<br />
│ Google OAuth Server │<br />
│ ▲ │<br />
│ │ JWT (RS256) │<br />
│ │ │<br />
│ Service Account: VivaMed Verify Reader │<br />
└──────────────────────┼──────────────────────────────────┘<br />
│ credential<br />
▼<br />
CLOUDFLARE WORKER<br />
│<br />
verify.example.com<br />
│<br />
▼<br />
Foydalanuvchi</td>
</tr>
</tbody>
</table>

Google Cloud Console qismi foydalanuvchiga ko‘rinmaydi, ammo Worker’ning Google resurslariga xavfsiz va nazoratlangan kirishi uchun asosiy infratuzilma vazifasini bajaradi.

# 20. Hamkasb yoki doktor uchun 2 daqiqalik tushuntirish

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>Qisqa tushuntirish matni<br />
</strong>Biz Google Cloud’da alohida `VivaMed Verify Security` loyihasini yaratdik. Maqsad — Cloudflare Worker’ga Google Sheets va private Google Drive bilan xavfsiz ishlash imkonini berish. Sheets API hujjatlar reyestrini o‘qish uchun, Drive API esa tasdiqlangan private PDF’ni olish uchun yoqildi. Worker odam emasligi sabab unga `VivaMed Verify Reader` Service Account yaratdik. U faqat Viewer va read-only huquqlarga ega. Service Account JSON key Cloudflare’da secret sifatida saqlanadi. Worker shu credential bilan JWT yaratib Google OAuth’dan vaqtinchalik Access Token oladi. Keyin aynan shu token bilan Sheets va Drive API’ga murojaat qiladi. Shuning uchun Worker Google’ga xavfsiz kiradi, lekin hujjatlarni o‘chira yoki o‘zgartira olmaydi.</td>
</tr>
</tbody>
</table>

## 20.1. Bitta jumlada

Google Cloud’da biz Cloudflare Worker uchun Google Sheets va private Google Drive’ga kiradigan, faqat o‘qish huquqiga ega bo‘lgan xavfsiz “xizmat akkaunti + API eshigi” yaratdik.

# Ilova A. Terminlar lug‘ati

| **Termin**      | **Sodda ta’rif**                                               |
|-----------------|----------------------------------------------------------------|
| Project         | Google Cloud’dagi texnik konteyner                             |
| API             | Dasturlar bir-biri bilan gaplashadigan rasmiy interfeys        |
| Service Account | Dastur/server uchun Google identifikatori                      |
| IAM             | Kim nimaga ruxsatli ekanini boshqarish tizimi                  |
| JSON key        | Service Account’ni kriptografik isbotlash credential’i         |
| JWT             | Imzolangan xizmat tokeni                                       |
| OAuth           | Google’dan vaqtinchalik access token olish protokoli           |
| Access Token    | Google API’ga vaqtinchalik ruxsatnoma                          |
| Scope           | Token qaysi turdagi ishlarni bajarishi mumkinligini belgilaydi |
| Readonly        | Faqat o‘qish; yozish/o‘chirish yo‘q                            |
| Least Privilege | Faqat zarur minimal huquq berish prinsipi                      |

# Ilova B. Production nazorat ro‘yxati

- Google Sheets API Enabled.

- Google Drive API Enabled.

- Service Account mavjud va faol.

- Service Account’ga Project Owner/Editor kabi keng rol berilmagan.

- Reyestr Viewer sifatida share qilingan.

- Approved papka Viewer sifatida share qilingan.

- Worker scopes read-only.

- GCP_SERVICE_ACCOUNT_JSON Cloudflare Secret sifatida saqlangan.

- Private key kodda yoki GitHub’da yo‘q.

- Key rotation rejasi mavjud.

- Worker PDF berishdan oldin STATUS va Approved parent’ni tekshiradi.
