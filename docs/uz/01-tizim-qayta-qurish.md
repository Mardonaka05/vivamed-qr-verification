# Tizimni qayta qurish, domen ishonchi va Cloudflare arxitekturasi

Birinchi kitob — nima uchun script.google.com yetarli emas, yangi arxitektura qarori, Google muhitini noldan qurish, domen va DNS.

> Bu — loyiha davomida yozilgan asl texnik kitoblardan biri, o'zbek tilida.
> Ommaviy repo uchun real identifikatorlar (domen, Drive/Sheets ID, GCP loyiha,
> Worker nomi, elektron pochta, ism) o'rniga placeholder qo'yilgan, konsol
> skrinshotlari esa olib tashlangan.
> Inglizcha qisqartirilgan hujjatlar: [`../en/`](../en/)

---

**VIVAMED HUJJAT**

**QR orqali hujjat haqiqiyligini tekshirish tizimi**

*Qayta qurish, domen ishonchi va Cloudflare arxitekturasi bo‘yicha texnik kitob*

|     |
|-----|

**Loyiha holati: Google backend deploy qilingan; Cloudflare DNS delegatsiyasi tarqalishi kutilmoqda**

Versiya 1.0 \| 27.08.2026 \| Toshkent

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>ICHKI HUJJAT</strong></p>
<p>Ushbu hujjatda loyiha arxitekturasi, konfiguratsiya tamoyillari va ichki texnik identifikatorlar haqida ma’lumot bor. Publik tarqatishdan oldin ichki ID va backend manzillarini olib tashlash tavsiya etiladi.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# **Kirish**

Ushbu kitob VivaMed Hujjat tizimini qayta qurish jarayonida qilingan amallarni, qabul qilingan arxitektura qarorlarini va ularning sabablarini bir joyga jamlaydi. Maqsad — olti oy yoki bir yil o‘tgach ham tizim nima uchun aynan shu ko‘rinishda qurilganini tushunish, nosozlik chiqsa qayerdan tekshirishni bilish va keyingi kengaytirishlarni tartibli amalga oshirish.

Loyiha oddiy QR generator emas. U hujjatni tasdiqlash, unikal raqam va token berish, PDF ustiga QR joylashtirish, reyestr yuritish, asl faylni arxivlash va tashqi foydalanuvchiga hujjat haqiqiyligini mustaqil tekshirtirish uchun mo‘ljallangan.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>ENG MUHIM QAROR</strong></p>
<p>Foydalanuvchi QR skaner qilganda script.google.com domenini emas, tashkilot nazoratidagi verify.example.com manzilini ko‘rishi kerak. Shu sabab Google Apps Script tashqi ko‘rinadigan sayt emas, backend sifatida qoldirildi; public kirish qatlami Cloudflare orqali qurilmoqda.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# **Mundarija**

- 1\. Muammo: hujjat haqiqiyligini kim tasdiqlaydi?

- 2\. Eski tizimning ishlash mantiqi

- 3\. script.google.com ishonch muammosi

- 4\. Yangi arxitektura qarori

- 5\. Google muhitini 0 dan qayta yaratish

- 6\. Google Drive infratuzilmasi

- 7\. Google Sheets reyestri va sozlamalar

- 8\. Apps Script loyihasi va modul arxitekturasi

- 9\. Public URL va backend URL ni ajratish

- 10\. Google Web App deployment

- 11\. example.com domenini tanlash

- 12\. DNS va nameserver nima?

- 13\. Cloudflare’ga domenni ulash

- 14\. registrator’dagi nameserver almashtirish

- 15\. Hozirgi status: DNS propagation

- 16\. Yakuniy reverse proxy oqimi

- 17\. Xavfsizlik tamoyillari

- 18\. Keyingi ishlar va test rejasi

- 19\. Nosozliklarni diagnostika qilish

- 20\. Atamalar lug‘ati va konfiguratsiya snapshoti

# **1. Muammo: hujjat haqiqiyligini kim tasdiqlaydi?**

Klinikadan tashqariga chiqqan PDF yoki qog‘oz hujjat uchinchi tomonga — bemorga, ish beruvchiga, bankka, sug‘urta tashkilotiga yoki boshqa muassasaga — yetib borgach, qabul qiluvchi tomon uning haqiqiyligini mustaqil tekshira olishi kerak. Oddiy blank, muhr yoki imzo zamonaviy grafik vositalar bilan taqlid qilinishi mumkin.

Tizimning asosiy g‘oyasi shundan iborat: tasdiqlangan har bir hujjat klinikaning markaziy reyestrida qayd etiladi va hujjat ichidagi QR aynan shu reyestrdagi yozuvga olib boradi. Hujjat raqami va maxfiy token mos kelsa, tekshiruv sahifasi “Hujjat haqiqiy” holatini ko‘rsatadi.

| **Muammo**  | **Oddiy yondashuv**              | **Yangi yondashuv**            |
|-------------|----------------------------------|--------------------------------|
| Haqiqiylik  | Telefon qilib so‘rash            | QR orqali real vaqt tekshiruvi |
| Ish vaqti   | Registratura ish vaqtiga bog‘liq | 24/7 ochiq tekshirish sahifasi |
| Dalil       | Og‘zaki tasdiq                   | Reyestr + unikal raqam + token |
| Qayta olish | Faylni qayta so‘rash             | Tasdiqlangan PDF havolasi      |

# **2. Eski tizimning ishlash mantiqi**

Avvalgi ishlagan tizim Google ekotizimiga qurilgan edi. Xodim hujjatni “Tasdiqlanishi kerak” papkasiga joylaydi, rahbar Drive yon panelidagi add-on orqali hujjatni ko‘radi va tasdiqlaydi yoki rad etadi. Tasdiqlangan hujjat PDF’ga o‘giriladi, QR qo‘yiladi, yangi fayl “Tasdiqlangan” papkaga tushadi, reyestrga yoziladi va asl fayl arxivga ko‘chadi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Eski va yangi tizimda saqlanadigan asosiy workflow</strong></p>
<p>Xodim hujjat yuklaydi</p>
<p>↓</p>
<p>Tasdiqlanishi kerak</p>
<p>↓</p>
<p>Rahbar add-on orqali tekshiradi</p>
<p>↓</p>
<p>Tasdiqlash / Rad etish</p>
<p>↓</p>
<p>PDF + QR + hujjat raqami + token</p>
<p>↓</p>
<p>Tasdiqlangan papka + Reyestr + Arxiv</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

Kod PDF, Word, Excel, PowerPoint va Google Docs/Sheets/Slides kabi bir nechta formatlarni qabul qilishga moslangan. Hujjat tasdiqlanganda PDF formatiga konvertatsiya qilinadi; QR esa faqat tasdiqlangan nusxaga qo‘yiladi.

# **3. script.google.com ishonch muammosi**

Amaliy testda telefon orqali QR skanerlanganda brauzer manzil satrida Google Apps Script domeni — script.google.com — ko‘rinishi aniqlandi. Texnik jihatdan bu to‘g‘ri, lekin tashqi foydalanuvchi nuqtai nazaridan ishonch signali kuchsiz edi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Nega bu muammo?</strong></p>
<p>Istalgan Google foydalanuvchisi Apps Script Web App yaratishi mumkin. Demak “script.google.com” domenining o‘zi hujjat aynan VivaMed yoki ma’lum bir tashkilotga tegishli ekanini ko‘rsatmaydi. Tekshiruvchi manzil satrida tashkilot nazoratidagi domenni ko‘rishi kerak.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

Shu nuqtada arxitektura o‘zgartirildi: Google Web App ichki backend bo‘lib qoladi, tashqi public verification manzili esa alohida domen/subdomen orqali ishlaydi.

# **4. Yangi arxitektura qarori**

Yangi modelda uchta qatlam aniq ajratildi: DNS, reverse proxy va Google backend. Bu ajratish tizimni ham brend nuqtai nazaridan, ham texnik boshqaruv nuqtai nazaridan ancha professional qiladi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Yakuniy public verification arxitekturasi</strong></p>
<p>Telefon / QR</p>
<p>↓</p>
<p>verify.example.com</p>
<p>↓</p>
<p>Cloudflare DNS</p>
<p>↓</p>
<p>Cloudflare Worker (reverse proxy)</p>
<p>↓</p>
<p>Google Apps Script Web App</p>
<p>↓</p>
<p>Google Sheets Reyestr + Google Drive PDF</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

| **Qatlam**          | **Vazifa**                                       | **Foydalanuvchi ko‘radimi?** |
|---------------------|--------------------------------------------------|------------------------------|
| registrator               | Domen registratsiyasi                            | Yo‘q                         |
| Cloudflare DNS      | verify.example.com qayerga borishini boshqaradi | Bevosita emas                |
| Cloudflare Worker   | So‘rovni Google backend’ga proxy qiladi          | Yo‘q                         |
| Google Apps Script  | Hujjat raqami + tokenni tekshiradi               | Yo‘q                         |
| verify.example.com | Public verification manzili                      | Ha                           |

# **5. Google muhitini 0 dan qayta yaratish**

Tizimni eski Google resurslaridan to‘g‘ridan-to‘g‘ri ko‘chirish o‘rniga, yangi va ajratilgan infratuzilma yaratish qarori qabul qilindi. Maqsad — eski papkalar, eski reyestr, eski deploy va eski identifikatorlar bilan chalkashmaslik.

Jarayon boshida Google hisob nomi bo‘yicha chalkashlik bo‘ldi. Tekshiruvdan so‘ng target hisob aniqlandi va barcha yangi resurslar aynan shu hisob ostida “NEW” suffiksi bilan parallel yaratildi. Eski tizimga tegilmasligi qat’iy qoida sifatida belgilandi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Amaliy saboq</strong></p>
<p>Brauzerda bir nechta Google hisob bo‘lsa, Drive yoki Apps Script noto‘g‘ri profil bilan ochilishi mumkin. Har bir muhim amal oldidan faol accountni tekshirish — keyingi barcha ID va ruxsat muammolarining oldini oladi.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# **6. Google Drive infratuzilmasi**

My Drive ichida yangi loyiha ildiz papkasi va uchta operatsion papka yaratildi. Ularning vazifasi hujjatning lifecycle holatini jismonan ajratishdir.

| **Papka**                | **Vazifa**                            | **Holat**  |
|--------------------------|---------------------------------------|------------|
| VivaMed Hujjat NEW       | Yangi tizimning asosiy konteyneri     | Yaratilgan |
| 01 — Tasdiqlanishi kerak | Rahbar ko‘rigini kutayotgan hujjatlar | Yaratilgan |
| 02 — Tasdiqlangan        | QR va raqam qo‘yilgan yakuniy PDF’lar | Yaratilgan |
| 03 — Arxiv               | Asl fayllar va rad etilgan hujjatlar  | Yaratilgan |

Bunday uch bosqichli struktura “qayerda qaysi hujjat turishi kerak?” degan savolni soddalashtiradi va pending papkani operatsion navbat sifatida ishlatishga imkon beradi.

# **7. Google Sheets reyestri va sozlamalar**

Yangi Google Sheets fayli “VivaMed Hujjatlar Reyestri NEW” nomi bilan yaratildi. Unda ikkita varaq bor: “Reyestr” va “Sozlamalar”. Kod aynan shu nomlarni izlaydi.

| **Ustun** | **Nomi**            | **Mazmuni**               |
|-----------|---------------------|---------------------------|
| A         | Hujjat raqami       | VM-PDF-YIL-NNNNNN         |
| B         | Fayl nomi           | Tasdiqlangan PDF nomi     |
| C         | File ID             | Tasdiqlangan PDF Drive ID |
| D         | Manba File ID       | Asl hujjat ID             |
| E         | Yubordi             | Hujjatni yuklagan account |
| F         | Yaratilgan sana     | Tasdiqlangan vaqt         |
| G         | Tekshirish havolasi | QR ichidagi public URL    |
| H         | Jo‘natildi          | Email qabul qiluvchi      |
| I         | Jo‘natilgan sana    | Gmail yuborilgan vaqt     |
| J         | Token               | Maxfiy verification token |
| K         | Tasdiqladi          | Rahbar/account            |

“Sozlamalar” varag‘ida operatsion qiymatlar KEY/VALUE ko‘rinishida saqlanadi. SHEETS_ID esa Script Properties’da saqlanadi, chunki kod avval reyestr jadvalining o‘zini topishi kerak.

| **Kalit**              | **Vazifa**                        |
|------------------------|-----------------------------------|
| CLINIC_NAME            | Tashkilot nomi                    |
| FOLDER_PENDING         | Kutilayotgan papka ID             |
| FOLDER_APPROVED        | Tasdiqlangan papka ID             |
| FOLDER_ARCHIVE         | Arxiv papka ID                    |
| PUBLIC_VERIFY_BASE_URL | Public verification bazaviy URL   |
| DOC_PREFIX             | Hujjat raqami prefiksi            |
| SIGNER\_\*             | PDF’dagi rahbar satri sozlamalari |
| QR\_\*                 | QR o‘lchami va joylashuvi         |
| SHOW_DOC_NO            | Hujjat raqamini PDF’da ko‘rsatish |

# **8. Apps Script loyihasi va modul arxitekturasi**

Yangi standalone Apps Script loyihasi “VivaMed Hujjat NEW” nomi bilan yaratildi. Drive API v3 advanced service qo‘shildi, manifest ko‘rinadigan qilindi va Script Properties ichiga yangi SHEETS_ID yozildi.

| **Fayl**        | **Mas’uliyat**                                         |
|-----------------|--------------------------------------------------------|
| Config.gs       | Sozlamalarni o‘qish, cache va diagnostika              |
| Registry.gs     | Raqam/token berish, reyestr yozish va qidirish         |
| PdfStamp.gs     | pdf-lib orqali QR va imzo satrini PDF’ga chizish       |
| Code.gs         | Drive add-on UI va tasdiqlash pipeline’i               |
| WebApp.gs       | Ochiq verification backend endpoint                    |
| Verify.html     | Haqiqiy / topilmadi sahifasi                           |
| appsscript.json | Scope, Drive trigger, Web App va tashqi URL ruxsatlari |

Modullar bir-biriga qatlamli tarzda ulanadi: Config poydevor, Registry va PdfStamp o‘rta qatlam, Code va WebApp esa interfeys qatlamidir. Bu arxitektura keyingi o‘zgarishlarni xavfsizroq qiladi.

# **9. Public URL va backend URL ni ajratish**

Eski modelda QR havolasi to‘g‘ridan-to‘g‘ri WEB_APP_URL asosida qurilgan. Yangi modelda bu atama ikkiga ajratildi: public URL va backend URL.

| **Turi**    | **Misol**                                    | **Kim uchun**           |
|-------------|----------------------------------------------|-------------------------|
| Public URL  | https://verify.example.com/v/VM-PDF-...?... | Telefon va QR           |
| Backend URL | https://script.google.com/macros/s/.../exec  | Cloudflare Worker uchun |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Muhim</strong></p>
<p>Google backend URL hech qachon QR’ga yozilmaydi. QR faqat PUBLIC_VERIFY_BASE_URL asosida quriladi. Shu orqali Google deploy URL kelajakda o‘zgarsa, eski QR’larni saqlab qolish osonlashadi.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# **10. Google Web App deployment**

Apps Script loyihasi Web App sifatida deploy qilindi. Deployment parametrlari “Execute as: Me” va “Who has access: Anyone” tamoyiliga moslab tanlandi, chunki QR tekshiruvchi tashqi foydalanuvchidan Google login talab qilinmasligi kerak.

Deployment paytida Google OAuth ogohlantirishi chiqdi. Bu loyiha yangi va Google tomonidan ommaviy verifikatsiyadan o‘tmaganligi sababli kutiladigan holat. Loyiha egasi sifatida kerakli Drive/Sheets/Gmail/external request ruxsatlari berildi va Web App backend URL olindi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Current backend</strong></p>
<p>Google Web App deployment URL muvaffaqiyatli olindi. U public manzil emas; Cloudflare Worker undan ichki backend sifatida foydalanadi.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# **11. example.com domenini tanlash**

Dastlab verify.vivamed.uz g‘oyasi muhokama qilindi, lekin amalda foydalanishga tayyor mavjud domen example.com ekani aniqlandi. Shuning uchun public verification subdomeni sifatida verify.example.com tanlandi.

Bu qaror kodni o‘zgartirishni talab qilmaydi: PUBLIC_VERIFY_BASE_URL konfiguratsion qiymat bo‘lgani uchun domen keyinchalik yana almashtirilsa, kodga tegmasdan faqat sozlamani yangilash mumkin.

# **12. DNS va nameserver nima?**

DNS — domen nomini texnik manzilga bog‘laydigan internet katalogi. Foydalanuvchi verify.example.com deb yozganda brauzer avval DNS’dan “bu nom qayerga tegishli?” deb so‘raydi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>DNS va proxy farqi</strong></p>
<p>Domen nomi: verify.example.com</p>
<p>↓</p>
<p>DNS: “bu nom Cloudflare’da boshqariladi”</p>
<p>↓</p>
<p>Worker: “so‘rovni Google backend’ga olib boraman”</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

Nameserver esa “shu domen bo‘yicha DNS savollariga qaysi servis javob beradi?” degan yuqori darajadagi ko‘rsatkichdir. Oldin example.com uchun registrator nameserverlari javob berardi. Endi bu rol Cloudflare nameserverlariga topshirilmoqda.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>DNS proxy emas</strong></p>
<p>DNS faqat yo‘lni ko‘rsatadi. Reverse proxy esa so‘rovni qabul qiladi, backend’ga yuboradi va javobni foydalanuvchiga qaytaradi. Bizda DNS — Cloudflare DNS; proxy — Cloudflare Worker.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# **13. Cloudflare’ga domenni ulash**

Cloudflare’da yangi zone sifatida example.com qo‘shildi. Domen uchun mavjud DNS record topilmadi. Bu holat xavfli emas, chunki domen oldindan sayt, korporativ email yoki boshqa xizmatlar uchun ishlatilmagan.

Shu sabab existing A/MX/TXT yozuvlarni migratsiya qilish talabi bo‘lmadi. DNSSEC registrator’da faol emasligi ham tekshirildi; demak eski DS record yangi nameserver delegatsiyasiga xalaqit bermaydi.

# **14. registrator’dagi nameserver almashtirish**

Domen registratori registrator’da qoldi. Domenni boshqa registratorga transfer qilish amalga oshirilmadi. Faqat “example.com bo‘yicha DNS’ni kim boshqaradi?” degan delegatsiya o‘zgartirildi.

| **Oldingi nameserver** | **Yangi nameserver**      |
|------------------------|---------------------------|
| dns1.ahost.uz          | ns1.cloudflare.com |
| dns2.ahost.uz          | ns2.cloudflare.com    |
| ns1.ahost.cloud        | — olib tashlandi          |
| ns2.ahost.cloud        | — olib tashlandi          |

registrator interfeysida “Использовать собственные неймсерверы” tanlandi, Cloudflare bergan ikki nameserver kiritildi va o‘zgarish saqlandi.

# **15. Hozirgi status: DNS propagation**

Hozirgi vaqtda registrator yangi nameserver delegatsiyasini qabul qilgan. Cloudflare esa internet bo‘ylab bu o‘zgarish tarqalishini kutmoqda. Dashboard’da “Waiting for your registrar to propagate your new nameservers” holati ko‘rinmoqda.

| **Google infratuzilma** | **BAJARILDI** | Drive, Sheets, Apps Script project va Script Property tayyor. |
|-------------------------|---------------|---------------------------------------------------------------|

| **Google Web App** | **BAJARILDI** | Backend deployment URL olindi. |
|--------------------|---------------|--------------------------------|

| **Cloudflare zone** | **BAJARILDI** | example.com Cloudflare’ga qo‘shildi. |
|---------------------|---------------|---------------------------------------|

| **registrator nameserver** | **BAJARILDI** | Cloudflare NS’lari saqlandi. |
|----------------------|---------------|------------------------------|

| **DNS propagation** | **KUTILMOQDA** | Cloudflare zone Active bo‘lishi kutilmoqda. |
|---------------------|----------------|---------------------------------------------|

| **Worker proxy** | **KEYINGI** | Zone Active bo‘lgach yaratiladi. |
|------------------|-------------|----------------------------------|

| **Real QR E2E test** | **KEYINGI** | Worker va subdomain ulangach bajariladi. |
|----------------------|-------------|------------------------------------------|

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Nimani kutyapmiz?</strong></p>
<p>Internet resolverlari example.com uchun authoritative nameserver sifatida ns1.cloudflare.com va ns2.cloudflare.com ni ko‘ra boshlashini. Shunda Cloudflare zone “Active” holatiga o‘tadi.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# **16. Yakuniy reverse proxy oqimi**

Cloudflare Active bo‘lgach, Worker yaratiladi va verify.example.com Custom Domain sifatida Worker’ga ulanadi. Worker URL path ichidan hujjat raqamini va query string ichidan tokenni olib, ularni Google Web App backend formatiga o‘giradi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Reverse proxy transformatsiyasi</strong></p>
<p>Foydalanuvchi:</p>
<p>https://verify.example.com/v/VM-PDF-2026-000001?t=TOKEN</p>
<p>Cloudflare Worker ichida:</p>
<p>DOC = VM-PDF-2026-000001</p>
<p>TOKEN = ...</p>
<p>Backend so‘rovi:</p>
<p>https://script.google.com/macros/s/.../exec?d=VM-PDF-2026-000001&amp;t=TOKEN</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

Brauzer adres satrida verify.example.com qoladi. Google URL foydalanuvchiga ochilmaydi. Shu nuqtada loyiha boshida aniqlangan ishonch muammosi texnik jihatdan hal bo‘ladi.

# **17. Xavfsizlik tamoyillari**

- Hujjat raqami ketma-ket bo‘lsa ham, token tasodifiy bo‘lishi kerak.

- Noto‘g‘ri token uchun “token xato” degan javob berilmaydi; oddiy “topilmadi” ko‘rsatiladi.

- Google Sheets reyestri public qilinmaydi.

- Cloudflare Worker Google backend URL’ni foydalanuvchidan yashiradi.

- PUBLIC_VERIFY_BASE_URL kodga hardcode qilinmaydi; Sheets sozlamasidan o‘qiladi.

- Eski tizim yangi tizimdan ajratilgan; eski ID’lar yangi konfiguratsiyada ishlatilmaydi.

- Tasdiqlangan PDF yaratilib, registry yozuvi xato bersa orphan fayl qolmasligi uchun cleanup/rollback mantiqi kerak.

- api.qrserver.com ga verification URL yuborilishi tashqi dependency hisoblanadi; kelajakda QR generation’ni lokal qilish xavfsizroq.

# **18. Keyingi ishlar va test rejasi**

DNS Active bo‘lgach qolgan ishlar quyidagi qat’iy tartibda bajariladi:

1.  Cloudflare Worker yaratish.

2.  Google Apps Script backend URL’ni Worker konfiguratsiyasiga berish.

3.  verify.example.com ni Worker Custom Domain sifatida ulash.

4.  Google Sheets’dagi PUBLIC_VERIFY_BASE_URL qiymatini https://verify.example.com ga yakuniy tekshirish.

5.  Drive add-on test deploymentini o‘rnatish.

6.  Pending papkaga test PDF joylash.

7.  Rahbar sifatida hujjatni tasdiqlash.

8.  Approved papkada QR’li PDF yaratilganini tekshirish.

9.  Reyestr A-K ustunlari to‘ldirilganini tekshirish.

10. Telefon bilan QR skaner qilib address bar’da verify.example.com qolishini tekshirish.

11. Noto‘g‘ri token va mavjud bo‘lmagan docNo testlarini bajarish.

12. Gmail orqali attachment yuborishni test qilish.

# **19. Nosozliklarni diagnostika qilish**

| **Belgi**                      | **Ehtimoliy sabab**                            | **Tekshiruv**                                          |
|--------------------------------|------------------------------------------------|--------------------------------------------------------|
| Cloudflare Pending uzoq qoladi | NS delegatsiya hali tarqalmagan yoki noto‘g‘ri | registrator’da aynan adaline/jose NS saqlanganini tekshirish |
| verify.example.com ochilmaydi | Worker custom domain ulanmagan                 | Cloudflare Worker → Domains & Routes                   |
| Hujjat topilmadi               | docNo/token mos emas yoki registry yozilmagan  | Reyestr A, C, J ustunlarini tekshirish                 |
| PDF yaratilmaydi               | pdf-lib yoki conversion xatosi                 | Apps Script Executions log                             |
| QR yaratilmaydi                | qrserver.com so‘rovi xato                      | UrlFetch response code                                 |
| Add-on Drive’da ko‘rinmaydi    | Manifest yoki test deployment muammosi         | appsscript.json + test deployment + Drive refresh      |
| Email yuborilmaydi             | Gmail scope/ruxsat yoki recipient xato         | OAuth scopes + execution log                           |

# **20. Atamalar lug‘ati va konfiguratsiya snapshoti**

| **Atama**           | **Ma’nosi**                                                               |
|---------------------|---------------------------------------------------------------------------|
| DNS                 | Domen nomini texnik yo‘nalishga bog‘laydigan tizim                        |
| Nameserver          | Domen DNS zonasiga authoritative javob beradigan server                   |
| Registrar           | Domen registratsiyasini yuritadigan tashkilot; bu loyihada registrator          |
| Cloudflare zone     | Cloudflare boshqarayotgan domen DNS zonasi                                |
| Worker              | Cloudflare edge’da ishlaydigan serverless kod; reverse proxy vazifasi     |
| Reverse proxy       | Foydalanuvchi so‘rovini qabul qilib, boshqa backend’ga yuboradigan vosita |
| Apps Script Web App | Google’da ishlayotgan verification backend                                |
| Registry            | Tasdiqlangan hujjatlar ro‘yxati                                           |
| Token               | Hujjat raqamiga qo‘shimcha tasodifiy maxfiy kalit                         |
| Propagation         | DNS o‘zgarishining internet resolverlari bo‘ylab tarqalish jarayoni       |

## **Ichki konfiguratsiya snapshoti**

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Maxfiylik eslatmasi</strong></p>
<p>Quyidagi qiymatlar parol emas, lekin operatsion identifikatorlar hisoblanadi. Ushbu hujjat tashqariga yuborilsa, ularni olib tashlash yoki maskalash tavsiya etiladi.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

| **Parametr**                | **Joriy qiymat / holat**                                                                                         |
|-----------------------------|------------------------------------------------------------------------------------------------------------------|
| Target Google account       | <email>                                                                                          |
| Drive root                  | VivaMed Hujjat NEW                                                                                               |
| Spreadsheet                 | VivaMed Hujjatlar Reyestri NEW                                                                                   |
| Spreadsheet ID              | <google-id>                                                                     |
| Pending Folder ID           | <google-id>                                                                                |
| Approved Folder ID          | <google-id>                                                                                |
| Archive Folder ID           | <google-id>                                                                                |
| Apps Script Project ID      | <google-id>                                                        |
| Google backend URL          | https://script.google.com/macros/s/<apps-script-deployment-id>/exec |
| Cloudflare NS1              | ns1.cloudflare.com                                                                                        |
| Cloudflare NS2              | ns2.cloudflare.com                                                                                           |
| Rejalashtirilgan public URL | https://verify.example.com                                                                                      |
| Cloudflare holati           | Nameserver propagation kutilmoqda                                                                                |

# **Xulosa**

Loyiha hozir muhim burilish nuqtasida: Google ichki backend qismi alohida va yangi infratuzilmada tayyorlandi, public domen arxitekturasi tanlandi, example.com Cloudflare’ga delegatsiya qilindi va registrator’da nameserverlar muvaffaqiyatli almashtirildi. Hozir DNS propagation tugashi kutilmoqda.

Keyingi bosqich — Cloudflare Worker orqali reverse proxy yaratish. Aynan shu bosqichdan so‘ng QR skaner qilgan foydalanuvchi script.google.com emas, verify.example.com domenini ko‘radi. Shundan keyin real PDF, QR, reyestr, token va Gmail jarayonlari end-to-end sinovdan o‘tkaziladi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Loyihaning bosh tamoyili</strong></p>
<p>Hujjat haqiqiyligi faqat dizayn yoki muhr bilan emas, tashkilot nazoratidagi domen + markaziy reyestr + unikal hujjat raqami + maxfiy token kombinatsiyasi bilan tasdiqlanadi.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# **Ilova: yakuniy ishga tushirish checklisti**

> ○ Cloudflare zone Active bo‘ldi.
>
> ○ Worker deploy qilindi.
>
> ○ verify.example.com Worker’ga ulandi.
>
> ○ HTTPS sertifikat faol.
>
> ○ PUBLIC_VERIFY_BASE_URL to‘g‘ri.
>
> ○ Drive add-on test deployment o‘rnatildi.
>
> ○ Test PDF tasdiqlandi.
>
> ○ Reyestr to‘ldi.
>
> ○ QR telefonda ochildi.
>
> ○ Address bar’da verify.example.com saqlandi.
>
> ○ Noto‘g‘ri token “Topilmadi” qaytardi.
>
> ○ Gmail attachment test muvaffaqiyatli.
