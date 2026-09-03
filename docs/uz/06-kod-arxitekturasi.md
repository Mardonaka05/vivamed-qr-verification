# Kod arxitekturasi — har bir fayl nima qiladi va nima uchun

Add-on'ning asosiy cheklovi, fayllar xaritasi, modul-modul tahlil, SyncPromise va boshqa muhandislik hiylalari, zaif nuqtalar.

> Bu — loyiha davomida yozilgan asl texnik kitoblardan biri, o'zbek tilida.
> Ommaviy repo uchun real identifikatorlar (domen, Drive/Sheets ID, GCP loyiha,
> Worker nomi, elektron pochta, ism) o'rniga placeholder qo'yilgan, konsol
> skrinshotlari esa olib tashlangan.
> Inglizcha qisqartirilgan hujjatlar: [`../en/`](../en/)

---

**V I V A M E D C E N T E R**

**VivaMed Hujjat**

Kod arxitekturasi

*Har bir fayl nima qiladi, nima bilan bog’langan va nima uchun aynan shunday yozilgan*

Google Apps Script · Workspace Add-on · 7 fayl

Uchinchi kitob · 2026-yil avgust

Ichki foydalanish uchun

**Mundarija**


**Kirish**

Bu — uchinchi kitob. Birinchisi tizim nima qilishini tushuntirdi, ikkinchisi uni xodimlarga qanday yetkazishni. Bu kitob esa bitta savolga javob beradi: kodning o’zi qanday tuzilgan va nima uchun aynan shunday.

Loyihada yettita fayl bor. Ularning nomiga qarab vazifasini taxmin qilish qiyin emas, lekin nima uchun aynan shu bo’linish tanlangani, qaysi joyda muhandislik hiylasi ishlatilgani va qaysi qaror qanday muammoni oldini olgani — buni faqat kodni o’qib bilish mumkin. Olti oydan keyin buni hech kim eslamaydi.

**Kitob kimga**

- **Loyihani boshqaradigan odamga** — tizimning qaysi qismi nimaga javobgar ekanini bilish uchun

- **Kelajakdagi dasturchiga** — kodni o’zgartirishdan oldin nima uchun shunday yozilganini tushunish uchun

- **Tekshiruvchiga** — xavfsizlik va ma’lumot oqimi qanday tashkil etilganini ko’rish uchun

**Kitob tuzilishi**

| **Bo’lim** | **Mazmuni**                                                     |
|------------|-----------------------------------------------------------------|
| 1          | Asosiy cheklov — hamma qarorning ildizi                         |
| 2          | Fayllar xaritasi va ikkita yuz                                  |
| 3–9        | Har bir fayl alohida: vazifasi, bog’lanishi, g’oyasi, zaif joyi |
| 10         | Tashqi bog’liqliklar                                            |
| 11         | To’liq oqim — o’n bir qadam                                     |
| 12         | Zaif nuqtalar va tavsiyalar                                     |
| Ilova      | Integratsiya matritsasi                                         |

**1-bob. Asosiy cheklov**

*Butun kodning shakli bitta texnik faktdan kelib chiqadi. Uni tushunmasdan qolgan hamma narsa g’alati ko’rinadi.*

**1.1. Har bosish — alohida hayot**

**Add-on’da har bir bosish — alohida, nol holatdan boshlanadigan ishga tushirish.**

Xodim tugmani bosadi. Google Apps Script’ni chaqiradi. Kod bitta Card obyektini qaytaradi. Google uni panelda chizadi. Ishga tushirish tugaydi. Keyingi bosishda hammasi qaytadan boshlanadi — xotira yo’q, global o’zgaruvchilar saqlanmaydi.

Oddiy veb-ilovadan farqi tub. U yerda server ishlab turadi, sessiya bor, oraliq holat saqlanadi. Bu yerda hech narsa yo’q — har chaqiruv toza sahifadan boshlanadi.

**1.2. To’rtta oqibat**

| **Oqibat**          | **Kodda qanday ko’rinadi**                                        |
|---------------------|-------------------------------------------------------------------|
| Holat saqlanmaydi   | Holat tashqarida yashaydi: papka = holat, Sheets qatori = yozuv   |
| Kutib bo’lmaydi     | SyncPromise — Promise’ni navbatga qo’ymasdan darhol bajaradi      |
| Har safar noldan    | pdf-lib har chaqiruvda qayta yuklanadi, sozlamalar qayta o’qiladi |
| Natija darhol kerak | Funksiya Card qaytarishi shart — async qilib bo’lmaydi            |

Shu to’rt qatorni tushunsangiz, kodning qolgan barcha «g’alati» joyi mantiqiy ko’rinadi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>AMALIY OQIBAT</strong></p>
<p>«Ekranda yuklanmoqda» degan oraliq holat texnik jihatdan <strong>mavjud emas</strong>. Kod natijani qaytarib ulgurishi shart. Aynan shu xususiyat keyinchalik pdf-lib bilan bog’liq eng katta to’siqni keltirib chiqardi — 6-bobga qarang.</p></td>
</tr>
</tbody>
</table>

**2-bob. Fayllar xaritasi**

**2.1. Modul tizimi yo’q**

Apps Script’da import ham, export ham yo’q. Google barcha .gs fayllarni bitta katta faylga yopishtiradi va hamma funksiya bitta umumiy nomlar fazosida yashaydi. Config.gs da e’lon qilingan Config obyekti Registry.gs ichida to’g’ridan-to’g’ri ko’rinadi — hech narsani ulash shart emas.

Fayllarga bo’lish — bu faqat inson uchun tartib. Google uchun farqi yo’q.

Shundan kelib chiqib, nomlar to’qnashmasligi uchun har bir modul IIFE naqshida yozilgan — darhol chaqiriladigan funksiya ichida:

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>var Config = (function () {</p>
<p>function sheetsId() { ... } // ichki — tashqarida ko’rinmaydi</p>
<p>function settingsSheet() { ... } // ichki</p>
<p>function get(key, fallback) { ... }</p>
<p>function all() { ... }</p>
<p>return { get: get, all: all }; // faqat shular chiqadi</p>
<p>})();</p></td>
</tr>
</tbody>
</table>

Foydasi aniq: PdfStamp.gs ichidagi num\_ funksiyasi boshqa fayldagi yordamchiga xalaqit bermaydi.

**2.2. Bog’lanish piramidasi**

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>appsscript.json</p>
<p>(kod emas — e’lon)</p>
<p>┌─────────────────┴─────────────────┐</p>
<p>│ │</p>
<p>ADD-ON YUZI MIJOZ YUZI</p>
<p>xodim · yozadi anonim · o’qiydi</p>
<p>│ │</p>
<p>code.gs WebApp.gs</p>
<p>│ │</p>
<p>┌────┴──────┐ Verify.html</p>
<p>▼ ▼ │</p>
<p>Registry.gs PdfStamp.gs │</p>
<p>│ │ │</p>
<p>└───────────┴───────► Config.gs ◄──────────┘</p>
<p>poydevor</p>
<p>│</p>
<p>┌─────────┴─────────┐</p>
<p>▼ ▼</p>
<p>Script Properties Sheets · Sozlamalar</p>
<p>(SHEETS_ID) (qolgan hammasi)</p></td>
</tr>
</tbody>
</table>

Bu qat’iy piramida: yuqoridagilar quyidagilarga tayanadi, aylanma bog’lanish yo’q. Shuning uchun har bir modulni alohida tushunish va o’zgartirish mumkin.

**2.3. Ikkita yuz, bitta tana**

Bitta loyihada ikkita mustaqil kirish nuqtasi bor va ular qarama-qarshi huquqlar bilan ishlaydi. Bu tasodif emas — xavfsizlikning asosi.

|                     | **Add-on**          | **Web App**      |
|---------------------|---------------------|------------------|
| Kim ishga tushiradi | Xodim yoki rahbar   | Anonim odam      |
| Kimning nomidan     | O’sha foydalanuvchi | Egasi (owner)    |
| Nima qila oladi     | O’qish va yozish    | Faqat o’qish     |
| Kirish nuqtalari    | Ko’p — har tugma    | Bitta — doGet    |
| Login               | Talab qilinadi      | Talab qilinmaydi |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>NEGA BU MUHIM</strong></p>
<p>Ochiq sahifa <em>texnik jihatdan</em> hech narsani o’zgartira olmaydi — unga faqat bitta funksiya ochiq va u faqat o’qiydi. Ya’ni himoya parolga emas, <strong>yuzaning kichikligiga</strong> qurilgan.</p></td>
</tr>
</tbody>
</table>

**3-BOB · E’LON QATLAMI**

**appsscript.json**

*Bu kod emas. Bu — Google’ga aytiladigan to’rt gap. Fayl bajarilmaydi, faqat o’qiladi.*

**Kim bilan bog’langan**

| **Yo’nalish**   | **Nima**                                                                                       |
|-----------------|------------------------------------------------------------------------------------------------|
| Kimni chaqiradi | onHomePage va onDriveItemsSelected — nomlar code.gs dagi funksiyalarga aynan mos kelishi shart |
| Nimani yoqadi   | Drive Advanced Service v3 — code.gs dagi Drive.Files.copy uchun                                |
| Kim tahrirlaydi | Faqat dasturchi, Apps Script muharririda                                                       |

**To’rt gap**

- **addOns —** «meni Drive’da ko’rsat; panel ochilganda onHomePage, fayl tanlanganda onDriveItemsSelected ni chaqir».

- **oauthScopes —** yettita ruxsat. Foydalanuvchi birinchi ishlatganda aynan shu ro’yxatga rozilik beradi.

- **urlFetchWhitelist —** «men faqat unpkg.com va api.qrserver.com ga chiqaman». Google buni majburlaydi.

- **webapp —** ANYONE_ANONYMOUS va USER_DEPLOYING. Mijoz loginsiz kiradi, lekin kod egasining huquqlari bilan ishlaydi.

**Nima uchun urlFetchWhitelist majburiy**

Sabab xavfsizlik. Add-on tashqi manzilga so’rov yubora olsa, uni keyinchalik yangilab, maxfiy ma’lumotni begona serverga jo’natish mumkin bo’lardi. Google buni oldini oladi: barcha manzillar oldindan e’lon qilinishi shart va har biri HTTPS bo’lishi, to’liq domenga ega bo’lishi va slash bilan tugashi lozim.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>"urlFetchWhitelist": [</p>
<p>"https://unpkg.com/pdf-lib@1.17.1/",</p>
<p>"https://api.qrserver.com/v1/create-qr-code/"</p>
<p>]</p></td>
</tr>
</tbody>
</table>

Qo’shimcha kuzatuv: test deployment uchun bu ro’yxat majburiy emas, faqat versiyalangan deployment uchun talab qilinadi. Loyihada birinchi jiddiy deploy xatosi aynan shu bo’limning yo’qligidan kelib chiqqan.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>UCHRAGAN XATO</strong></p>
<p>Manifest tasodifan eski, bo’sh holatga qaytganda add-on Drive panelidan jimgina g’oyib bo’lgan. Xato xabari chiqmaydi — kod ishlayveradi, shunchaki Drive uni ko’rmay qo’yadi. Sababini topish uchun vaqt ketgan.</p>
<p>Tavsiya: Apps Script bilan ishlaganda <strong>bitta yorliqdan</strong> foydalaning va uzoq tanaffusdan keyin har doim F5 bosing.</p></td>
</tr>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>KUZATUV</strong></p>
<p>Ruxsatlar orasida auth/drive bor — bu to’liq huquq, ya’ni foydalanuvchining barcha Drive fayllariga kirish. Internal rejimda muammo emas, lekin kerakligidan kengroq. Kelajakda ommaviy nashr o’ylansa, bu Google’ning xavfsizlik baholovini talab qiladi.</p></td>
</tr>
</tbody>
</table>

**4-BOB · POYDEVOR QATLAMI**

**Config.gs**

*Sozlamalar varag’i bilan yagona aloqa kanali. Hech bir boshqa modul jadvalga to’g’ridan-to’g’ri murojaat qilmaydi.*

**Kim bilan bog’langan**

| **Yo’nalish**   | **Nima**                                                                             |
|-----------------|--------------------------------------------------------------------------------------|
| Nimadan o’qiydi | Script Properties → SHEETS_ID. Sheets → «Sozlamalar» varag’i, faqat A va B ustunlari |
| Kim ishlatadi   | code.gs, Registry.gs, PdfStamp.gs, WebApp.gs — ya’ni hamma                           |
| Kim yozadi      | Hech kim. set() funksiyasi bor, lekin kodda chaqirilmaydi                            |

**4.1. Yagona darvoza g’oyasi**

Bitta joyda kesh, bitta joyda xatolik matni, bitta joyda zaxira qiymatlar. Agar har modul jadvalni o’zi o’qiganida, bu uch narsa besh joyga tarqalgan bo’lardi va biri o’zgarganda qolganlari eskirgan holda qolardi.

**4.2. Kalit–qiymat uslubi**

Sozlamalar varag’ida A ustun — savol, B ustun — javob. Kod butun diapazonni o’qib, lug’at yasaydi:

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>sh.getRange(1, 1, last, 2).getValues().forEach(function (r) {</p>
<p>var k = String(r[0] || ’’).trim();</p>
<p>if (k) out[k] = String(r[1] ...).trim();</p>
<p>});</p></td>
</tr>
</tbody>
</table>

Bundan amaliy qoidalar chiqadi:

| **Qoida**                  | **Ma’nosi**                                                 |
|----------------------------|-------------------------------------------------------------|
| Qator tartibi ahamiyatsiz  | DOC_PREFIX ni birinchi qatorga ko’chirsangiz ham ishlaydi   |
| Bo’sh qatorlar o’tkaziladi | Kalit bo’sh bo’lsa e’tiborsiz qoldiriladi                   |
| Sarlavha kerak emas        | Shuning uchun varaqda «Kalit \| Qiymat» sarlavhasi yo’q     |
| Faqat A va B o’qiladi      | C, D, E ustunlariga izoh yozing — kod ularni ko’rmaydi      |
| Katta-kichik harfga sezgir | clinic_name ≠ CLINIC_NAME. Ishlamaydi va xato ham bermaydi  |
| Bo’shliqlar tozalanadi     | Oldi-keyin bo’shliq muammo emas                             |
| Hamma qiymat — matn        | Son yoki ha/yo’q kerak bo’lsa, ishlatilgan joyda o’giriladi |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>FOYDALI MASLAHAT</strong></p>
<p>C ustuniga <strong>izoh yozing</strong> — bu papka nima uchun, kim o’zgartirdi, qachon. Kod uni butunlay ko’rmaydi, lekin keyingi odam uchun bu oltin qimmatga ega bo’ladi.</p></td>
</tr>
</tbody>
</table>

**4.3. Uchta vazifa**

- **O’qish va keshlash.** Butun varaq bir marta o’qiladi va CacheService’da 60 soniya saqlanadi. Amaliy oqibat: jadvaldagi o’zgarish darhol emas, bir daqiqa ichida kuchga kiradi.

- **Zaxira qiymat.** get(key, fallback) — jadvalda kalit bo’lmasa tizim to’xtamaydi. Bu yangi sozlama qo’shishni osonlashtiradi, lekin ayni paytda eng katta xavf manbai.

- **Diagnostika.** diagnose() o’rnatishni tekshirib, muammolar ro’yxatini qaytaradi va u panelning bosh sahifasida chiqadi. Bu UX qarori: xodim noaniq xato o’rniga aniq ko’rsatma ko’radi.

**4.4. Tovuq va tuxum masalasi**

SHEETS_ID jadvalning ichida bo’la olmaydi — jadvalni ochish uchun uning ID’si kerak. Shuning uchun u yagona istisno sifatida Script Properties’da yashaydi va add-on’ning «Sozlamalar» kartasidan bir marta kiritiladi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>JIDDIY XAVF · KO’RINMAYOTGAN KALITLAR</strong></p>
<p>Jadvalda <strong>8 ta</strong> kalit bor. Kod esa <strong>18 tasini</strong> qidiradi.</p>
<p>Topilmagan 10 tasi uchun kod ichidagi zaxira qiymat jimgina ishlaydi — jumladan SIGNER_NAME uchun qattiq yozilgan <strong>«<SIGNER_NAME>»</strong>, u har bir tasdiqlangan hujjatga bosiladi.</p>
<p>Bu butun g’oyaning buzilishi: varaq aynan «kodga tegmasdan o’zgartirish» uchun yaratilgan edi, hujjatdagi eng ko’rinadigan narsa — imzo egasining ismi — esa kod ichida qolgan. Rahbar almashsa hech kim sezmasdan noto’g’ri ism bilan tibbiy hujjat chiqaveradi.</p></td>
</tr>
</tbody>
</table>

**4.5. Yetishmayotgan kalitlar ro’yxati**

| **Kalit**       | **Zaxira qiymat**    | **Nima qiladi**        |
|-----------------|----------------------|------------------------|
| SIGNER_NAME     | <SIGNER_NAME>      | Imzolovchi ismi        |
| SIGNER_LABEL    | Rahbar:              | Imzo yorlig’i          |
| SIGNER_SIZE     | 10                   | Shrift o’lchami        |
| QR_SIZE         | 80                   | QR tomoni, punktda     |
| QR_MARGIN_RIGHT | 330                  | O’ng chetdan masofa    |
| QR_BOTTOM       | 100                  | Pastdan balandlik      |
| QR_GAP          | 26                   | Matn bilan QR orasi    |
| QR_X            | 0                    | Aniq X koordinatasi    |
| QR_CAPTION      | QR orqali tekshirish | QR ostidagi izoh       |
| SHOW_DOC_NO     | ha                   | Raqamni PDF’ga chizish |

Bu o’n qatorni jadvalga qo’shish besh daqiqalik ish. Kod umuman o’zgarmaydi — u allaqachon ularni qidiryapti, topa olmayapti xolos.

**5-BOB · MA’LUMOT QATLAMI**

**Registry.gs**

*«Reyestr» varag’i bilan ishlaydi: raqam beradi, qidiradi, jo’natishni belgilaydi. Loyihaning eng nozik mantig’i shu yerda.*

**Kim bilan bog’langan**

| **Yo’nalish**   | **Nima**                                                              |
|-----------------|-----------------------------------------------------------------------|
| Nimaga tayanadi | Config.spreadsheet() va Config.get(’DOC_PREFIX’)                      |
| Kim chaqiradi   | code.gs → reserve, fill, markFailed, markSent. WebApp.gs → faqat find |
| Nimaga yozadi   | Sheets, «Reyestr» varag’i, A–K ustunlari                              |

**5.1. Asosiy qaror — raqam og’ir ishdan oldin band qilinadi**

PDF ishlovi 10–30 soniya davom etadi. Agar raqam ishlov oxirida berilsa, ikki xodim bir vaqtda tugmani bosganda ikkalasi ham «oxirgi raqam 21» deb ko’radi va bir xil raqam oladi.

Reyestr uchun bu halokat: ikkita boshqa hujjat bir xil raqam bilan chiqadi va tekshirish tizimi ishonchsiz bo’lib qoladi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>reserve() ────► [og’ir ish: PDF · QR · saqlash] ────► fill()</p>
<p>▲ ▲</p>
<p>QULF ostida qulfsiz</p>
<p>~0.3 soniya 10–30 soniya</p>
<p>faqat 2 katak: qolgan 8 katak</p>
<p>raqam + token</p></td>
</tr>
</tbody>
</table>

LockService 30 soniya kutishga tayyor, lekin amalda qulf 0.3 soniya ushlanadi. Shuning uchun boshqa xodimlar navbatda turmaydi — PDF ishlovi qulfsiz ketadi.

**5.2. Token — asosiy himoya**

Hujjat raqamlari ketma-ket: 000012, 000013, 000014. Agar tekshirish sahifasi faqat raqam bo’yicha ishlasa, bitta hujjatni ko’rgan odam manzildagi raqamni qo’lda o’zgartirib, boshqa mijozlarning tibbiy hujjatlarini ketma-ket ochib chiqishi mumkin.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>Utilities.getUuid().replace(/-/g, ’’).substring(0, 12)</p>
<p>// natija: a3f9c21b8e04</p>
<p>// 12 o’n oltilik belgi = 48 bit = 281 trillion variant</p></td>
</tr>
</tbody>
</table>

Muhim tafsilot: raqam chiroyli va ketma-ket qolaveradi — bu hisobot va arxiv uchun qulay. Token esa faqat havolada ishlatiladi va hujjatga chizilmaydi.

**5.3. Xato bo’lganda qator o’chirilmaydi**

markFailed qatorni XATO: deb belgilaydi. Ikki sabab bor. Birinchisi — o’chirilsa raqamlar orasida bo’shliq qoladi va keyingi hisoblash chalkashadi. Ikkinchisi — «bu raqam berilgan edi, lekin hujjat chiqmadi» degan iz audit uchun foydali.

**5.4. Xatoni oshkor qilmaslik**

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>function find(docNo, token) {</p>
<p>...</p>
<p>var stored = String(values[i][9] || ’’).trim();</p>
<p>if (stored &amp;&amp; String(token || ’’).trim() !== stored) return null;</p>
<p>...</p>
<p>}</p></td>
</tr>
</tbody>
</table>

Token mos kelmasa funksiya null qaytaradi — sahifa «topilmadi» deydi, «token noto’g’ri» demaydi. Ataylab: noto’g’ri tokenli odamga hujjat **mavjudligini** ham bildirmaslik kerak.

Yana bir nozik joy: find() teskari yo’nalishda, oxirgi qatordan boshlab qidiradi. Ya’ni raqam takrorlansa, eng oxirgisi ustun keladi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>TESHIK</strong></p>
<p>Yuqoridagi shart if (stored &amp;&amp; ...) shaklida. Token katagi <strong>bo’sh</strong> bo’lsa shart butunlay o’tkazib yuboriladi va hujjat tokensiz qaytariladi.</p>
<p>Hozir reserve() har doim token yozadi, lekin J ustuni tozalansa yoki qator qo’lda qo’shilsa — himoya yo’qoladi va raqamlarni ketma-ket terib chiqish mumkin bo’ladi.</p>
<p>To’g’risi: if (!stored || String(token || ’’).trim() !== stored) return null;</p></td>
</tr>
</tbody>
</table>

**6-BOB · ISHLOV QATLAMI**

**PdfStamp.gs**

*PDF baytlariga QR-kod va imzo satrini chizadi. Texnik jihatdan eng murakkab fayl — to’rtta muhandislik hiylasi ustiga qurilgan.*

**Kim bilan bog’langan**

| **Yo’nalish**  | **Nima**                                                                 |
|----------------|--------------------------------------------------------------------------|
| Nimadan oladi  | Config → 10 ta QR va imzo sozlamasi. unpkg.com → pdf-lib 1.17.1, ~1.4 MB |
| Kim chaqiradi  | Faqat code.gs → PdfStamp.stamp(bytes, qrPng, docNo, placement, clinic)   |
| Nima qaytaradi | Yangi PDF baytlari, Uint8Array shaklida                                  |

**6.1. Birinchi hiyla — SyncPromise**

Bu loyihaning eng katta to’sig’i edi va uni yechish uchun eng ko’p vaqt ketgan.

Apps Script sinxron muhit, pdf-lib esa Promise ustiga qurilgan. JavaScript qoidasiga ko’ra .then() ichidagi kod mikrovazifa navbatiga tushadi va joriy funksiya tugagandan keyin bajariladi:

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>var out = null;</p>
<p>pdf.save().then(function (s) { out = s; });</p>
<p>if (!out) throw new Error(...); // ← bu yerga out hali null</p></td>
</tr>
</tbody>
</table>

Odatdagi JavaScript’da bu muammo emas — async/await ishlatiladi. Lekin add-on funksiyasi Card obyektini qaytarishi shart, Promise emas. Ya’ni handleApprove ni async qilib bo’lmaydi.

Yechim: pdf-lib yuklanishidan oldin global Promise ni almashtirish. O’zimizning versiyamiz .then ni kechiktirmasdan, o’sha zahoti bajaradi:

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>SyncPromise.prototype.then = function (onFulfilled, onRejected) {</p>
<p>var self = this;</p>
<p>return new SyncPromise(function (resolve, reject) {</p>
<p>if (self._state === ’fulfilled’) {</p>
<p>resolve(onFulfilled(self._value)); // darhol, kechikishsiz</p>
<p>} else if (...) { ... }</p>
<p>});</p>
<p>};</p>
<p>// pdf-lib yuklashdan oldin global Promise almashtiriladi</p>
<p>globalThis.Promise = SyncPromise;</p>
<p>eval(src);</p>
<p>globalThis.Promise = native;</p></td>
</tr>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>NEGA BU ISHLAYDI</strong></p>
<p>pdf-lib ichida <strong>haqiqiy kutish yo’q</strong> — faqat hisoblash. Agar u tarmoq so’rovi yoki fayl o’qish qilganida, bu usul ishlamas edi. Ya’ni yechim universal emas, aynan shu kutubxonaga mos.</p></td>
</tr>
</tbody>
</table>

**6.2. Ikkinchi hiyla — bayt formati**

Apps Script getBytes() bilan **ishorali** baytlar qaytaradi, ya’ni qiymatlar −128 dan 127 gacha. pdf-lib esa Uint8Array kutadi, ya’ni 0 dan 255 gacha. Kirishda va chiqishda o’girish shart:

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>// kirish</p>
<p>var bytes = new Uint8Array(src.getBlob().getBytes());</p>
<p>// chiqish</p>
<p>function toByteArray_(u8) {</p>
<p>var out = [];</p>
<p>for (var i = 0; i &lt; u8.length; i++) {</p>
<p>out.push(u8[i] &gt; 127 ? u8[i] - 256 : u8[i]);</p>
<p>}</p>
<p>return out;</p>
<p>}</p></td>
</tr>
</tbody>
</table>

Bu qilinmasa PDF jimgina buziladi — xato chiqmaydi, fayl shunchaki ochilmaydi. Bunday xatoni topish qiyin, chunki hech qanday belgi bermaydi.

**6.3. Uchinchi hiyla — setTimeout polifili**

Apps Script’da setTimeout funksiyasi umuman mavjud emas, pdf-lib esa uni ishlatadi. Shuning uchun oddiy polifil yozilgan:

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>function setTimeout(func, delay) {</p>
<p>Utilities.sleep(delay || 0);</p>
<p>return func();</p>
<p>}</p></td>
</tr>
</tbody>
</table>

**6.4. To’rtinchi hiyla — koordinatalar**

PDF’da nol nuqta pastki chap burchakda joylashgan va y o’qi yuqoriga o’sadi. Bu brauzerdagining aksi. QR pastki o’ng burchakka tushishi uchun:

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>var x = W - qrSize - marginR; // o’ng chetdan</p>
<p>var y = marginB; // pastdan</p>
<p>page.drawImage(qr, { x: x, y: y, width: qrSize, height: qrSize });</p></td>
</tr>
</tbody>
</table>

**6.5. Shrift cheklovi**

Standart Helvetica shrifti kirill harflarini va o’zbek apostrofini bilmaydi. Shuning uchun barcha matn asciiSafe\_ funksiyasidan o’tkaziladi — noma’lum belgilar olib tashlanadi.

Amaliy oqibat: hujjatga o’zbekcha yoki ruscha matn chizib bo’lmaydi. Kelajakda TTF shriftni Drive’ga yuklab, pdf-lib’ning fontkit kengaytmasi bilan ulash kerak bo’ladi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>DIQQAT · QR JOYLASHUVI</strong></p>
<p>QR_MARGIN_RIGHT ning kod ichidagi zaxirasi <strong>330</strong>. A4 uchun bu 595 − 80 − 330 = 185pt, ya’ni QR pastki <strong>o’rtada</strong>, o’ng burchakda emas.</p>
<p>Jadvalda bu kalit yo’q, demak hozir aynan shu qiymat ishlayapti. Bitta hujjatni chop etib ko’ring — ko’rinish texnik hujjatda tasvirlanganidan farq qilishi mumkin.</p></td>
</tr>
</tbody>
</table>

**7-BOB · INTERFEYS VA DIRIJYOR**

**code.gs**

*Eng katta fayl va yagona joy, u yerda hamma narsa birlashadi. Ikki qismdan iborat: kartalarni quruvchi interfeys va butun oqimni boshqaruvchi approveDocument\_.*

**Kim bilan bog’langan**

| **Yo’nalish**   | **Nima**                                                                                          |
|-----------------|---------------------------------------------------------------------------------------------------|
| Nimaga tayanadi | Config, Registry, PdfStamp — uchalasi ham                                                         |
| Qaysi servislar | Drive, Sheets (Registry orqali), Gmail, qrserver.com                                              |
| Kim chaqiradi   | Google → onHomePage, onDriveItemsSelected. Tugmalar → handleApprove, handleReject, handleSendMail |

**7.1. Uchta karta**

| **Karta**   | **Qachon ko’rinadi**                                 | **Ichida nima bor**                                       |
|-------------|------------------------------------------------------|-----------------------------------------------------------|
| Bosh sahifa | Panel ochilganda                                     | Diagnostika, kutilayotganlar ro’yxati, sozlamalar tugmasi |
| Hujjat      | Ro’yxatdan tanlanganda yoki Drive’da fayl bosilganda | Fayl ma’lumoti, QR joylashuvi, Tasdiqlash / Rad etish     |
| Natija      | Tasdiqlangach                                        | Hujjat raqami, havolalar, Gmail formasi                   |

Panelda o’z HTML kodini chizib bo’lmaydi. Google tayyor elementlar to’plamini beradi — matn, tugma, kiritish maydoni, ochiluvchi ro’yxat — va ular CardService orqali koddan yig’iladi. Bu cheklov, lekin foydasi bor: panel telefonda ham, kompyuterda ham bir xil ishlaydi va CSS yozish kerak emas.

**7.2. Papka = holat**

Drive’da «status» degan maydon yo’q. Shuning uchun faylning jismoniy joyi uning holatini bildiradi. Bu loyihaning eng chiroyli qarorlaridan biri.

| **Papka**       | **Nimani bildiradi**       | **Kod bilan aloqasi**                                               |
|-----------------|----------------------------|---------------------------------------------------------------------|
| FOLDER_PENDING  | Tasdiqlashni kutmoqda      | listPending\_() shu papkani o’qib «Kutilmoqda: N ta» deb ko’rsatadi |
| FOLDER_APPROVED | Tasdiqlangan, raqam olgan  | Yangi PDF shu yerga saqlanadi                                       |
| FOLDER_ARCHIVE  | Asl nusxa yoki rad etilgan | Manba fayl shu yerga ko’chadi                                       |

Ya’ni papkaga fayl tashlash = so’rov yuborish. Alohida tugma, alohida xabar, alohida forma kerak emas — papkaning o’zi so’rov.

Bundan tashqari vazifalar ajratiladi: xodim yuklaydi, rahbar tasdiqlaydi. Reyestrning E va K ustunlari shu ikki odamni yozadi.

**7.3. Fayl turlari — uch xil yo’l**

Kod istalgan turdagi hujjatni PDF baytlariga aylantiradi, lekin uch xil usul bilan:

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>PDF ──► to’g’ridan-to’g’ri baytlar</p>
<p>Google Docs / Sheets / ──► getAs(PDF)</p>
<p>Slides / Drawings</p>
<p>Word · Excel · PPT · RTF ──► vaqtinchalik Google nusxasi</p>
<p>CSV · ODT · ODS · ODP ──► getAs(PDF)</p>
<p>──► nusxa o’chiriladi (finally)</p></td>
</tr>
</tbody>
</table>

**Asl fayl hech qachon o’zgartirilmaydi.** Word hujjati arxivga o’zgarishsiz ketadi — bu qasddan qilingan qaror, chunki asl nusxa dalil vazifasini bajaradi. Reyestrning D ustuni (Manba File ID) aynan shu faylga ishora qiladi.

**7.4. Qadamlar tartibi nega aynan shunday**

- Raqam ikkinchi qadamda, ya’ni og’ir ishlardan oldin band qilinadi — bir vaqtda ishlaydigan xodimlar bir xil raqam olmasligi uchun.

- Fayl to’qqizinchi qadamda ulashiladi. Agar bu bosqichda xato chiqsa, butun amal bekor qilinadi — ulashilmagan hujjatni mijoz ocha olmaydi va bunday hujjat foydasiz.

- Reyestr o’ninchi qadamda, ya’ni hamma narsa muvaffaqiyatli bo’lgandan keyin to’ldiriladi. Shu sababli reyestrda faqat haqiqatan mavjud hujjatlar bo’ladi.

**7.5. Xato boshqaruvi**

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>try {</p>
<p>... butun ishlov ...</p>
<p>} catch (err) {</p>
<p>Registry.markFailed(reserved.row, err.message || err);</p>
<p>throw err;</p>
<p>} finally {</p>
<p>cleanupTemp_(tempIds); // vaqtinchalik nusxalar o’chadi</p>
<p>}</p></td>
</tr>
</tbody>
</table>

finally bloki muhim: ishlov uzilsa ham vaqtinchalik Google nusxalari qolib ketmaydi. Aks holda ular Drive’da to’planib borardi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>ENG JIDDIY XATO · TAKRORIY TASDIQLASH</strong></p>
<p>Asl faylni arxivga ko’chirish try/catch ichida va xato jimgina yutiladi. Ko’chirish ishlamasa fayl PENDING da qoladi, rahbar ertaga uni yana ko’radi va yana bosadi.</p>
<p>Natija: bitta hujjatga <strong>ikkita raqam va ikkita QR</strong> beriladi, ikkalasi ham reyestrda «haqiqiy» bo’lib turadi. Tibbiy hujjat uchun bu jiddiy.</p>
<p>Ehtimoli yuqori, chunki moveFile_ Shared Drive uchun eskirgan DriveApp.addFile() usulini ishlatadi. To’g’ri yo’l — Drive.Files.update bilan addParents / removeParents va supportsAllDrives: true.</p></td>
</tr>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>IKKITA KICHIKROQ KAMCHILIK</strong></p>
<p>1. «Yaratdi» ustuni bo’shab qolmoqda. src.getOwner() Shared Drive fayllarida null qaytaradi — u yerdagi fayllar tashkilotga tegishli, shaxsga emas. Reyestrning 22-qatoriga qarang: K to’lgan, E bo’sh.</p>
<p>2. listPending_ 20 tadan keyin saralaydi. Drive bergan birinchi 20 ta olinib, keyin tartiblanadi — bu «eng yangi 20 ta» emas. Papkada 25 ta hujjat to’planib qolsa, eng yangisi ro’yxatga tushmasligi mumkin.</p></td>
</tr>
</tbody>
</table>

**8-BOB · OCHIQ INTERFEYS**

**WebApp.gs**

*Butun tizimning tashqi dunyoga ochilgan yagona eshigi. Bitta funksiya, o’ttiz qator.*

**Kim bilan bog’langan**

| **Yo’nalish**   | **Nima**                                                 |
|-----------------|----------------------------------------------------------|
| Nimaga tayanadi | Config.get(’CLINIC_NAME’) va Registry.find(docNo, token) |
| Kim chaqiradi   | Google — QR skanerlanganda doGet(e)                      |
| Nimaga uzatadi  | Verify.html shabloni                                     |

**8.1. Ikki parametr**

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>https://script.google.com/macros/s/AKfycb.../exec</p>
<p>?d=VM-PDF-2026-000025</p>
<p>&amp;t=a3f9c21b8e04</p></td>
</tr>
</tbody>
</table>

d — hujjat raqami, t — token. Ikkalasi ham to’g’ri bo’lgandagina hujjat ko’rsatiladi.

**8.2. Xato yuz bersa tafsilot bermaydi**

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>try {</p>
<p>clinic = Config.get(’CLINIC_NAME’, DEFAULT_CLINIC);</p>
<p>if (docNo) rec = Registry.find(docNo, token);</p>
<p>} catch (err) {</p>
<p>rec = null;</p>
<p>}</p></td>
</tr>
</tbody>
</table>

Tashqi odam tizimning ichki holati haqida hech narsa bilmaydi. Jadval ochilmadimi, varaq yo’qmi, token noto’g’rimi — hammasi bir xil «topilmadi» ko’rinishida chiqadi.

**8.3. Ochiq sahifaning huquqlari**

Tekshirish sahifasi egasining huquqlari bilan ishlaydi. Bu xavfli ko’rinishi mumkin, lekin amalda cheklovlar qat’iy:

- Faqat bitta funksiya ochiq — doGet

- U faqat o’qiydi, hech narsa o’zgartirmaydi

- Faqat bitta hujjatni qaytaradi, ro’yxat bermaydi

- Token mos kelmasa hech narsa ko’rsatmaydi

- Xato yuz berganda tafsilot chiqarmaydi

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>KUZATUV · KVOTA</strong></p>
<p>Har bir tekshirishda Registry.find butun reyestrni o’qiydi. Sahifa anonim ochiq bo’lgani uchun uni ko’p marta chaqirish mumkin. Reyestr o’n minglab qatorga yetganda bu sekinlashadi va Sheets kvotasiga urilishi mumkin.</p>
<p>Kelajakda yechim: qidiruvni keshlash yoki reyestrni yillar bo’yicha ajratish.</p></td>
</tr>
</tbody>
</table>

**9-BOB · KO’RINISH QATLAMI**

**Verify.html**

*Mijoz ko’radigan yagona ekran. Ikki holati bor: yashil «Hujjat haqiqiy» va qizil «Topilmadi».*

**Kim bilan bog’langan**

| **Yo’nalish**           | **Nima**                                                                        |
|-------------------------|---------------------------------------------------------------------------------|
| Ma’lumotni kimdan oladi | WebApp.gs shablon o’zgaruvchilari: rec, clinic, downloadUrl, viewUrl, createdAt |
| JavaScript              | Yo’q. Butunlay server tomonda render qilinadi                                   |
| Tashqi resurs           | Yo’q. Barcha CSS fayl ichida                                                    |

**9.1. Shablon sintaksisi**

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>&lt;? if (rec) { ?&gt;</p>
<p>&lt;div class="badge ok"&gt;Hujjat haqiqiy&lt;/div&gt;</p>
<p>&lt;div class="no"&gt;&lt;?= rec.docNo ?&gt;&lt;/div&gt;</p>
<p>&lt;? } else { ?&gt;</p>
<p>&lt;div class="badge bad"&gt;Topilmadi&lt;/div&gt;</p>
<p>&lt;? } ?&gt;</p></td>
</tr>
</tbody>
</table>

\<?= ... ?\> sintaksisi HTML belgilarini **avtomatik ekranlaydi** — ya’ni fayl nomida \<script\> bo’lsa ham xavf yo’q. Himoyalanmagan varianti \<?!= ... ?\> va u bu yerda ishlatilmagan. Bu to’g’ri qaror.

**9.2. JavaScript umuman yo’q**

Sahifa to’liq tayyor holda yetkaziladi. Bu tezlik va ishonchlilik uchun to’g’ri qaror — mijozning telefoni qanday bo’lishidan, internet qanchalik sekin bo’lishidan qat’i nazar ishlaydi.

**9.3. Brend bog’lanishi**

Sahifadagi asosiy rang \#0B6B5B — manifestdagi primaryColor bilan bir xil. Ya’ni add-on paneli va tekshirish sahifasi vizual jihatdan bog’langan. Bu kichik tafsilot, lekin mijoz uchun «bu haqiqatan o’sha klinika» degan signal beradi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>MAXFIYLIK MASALASI</strong></p>
<p>Sahifa rec.fileName ni ochiq ko’rsatadi. Reyestrdagi haqiqiy nomlar, masalan: 23-палата строй базар — VM-PDF-2026-000012.pdf.</p>
<p>QR-kodni skanerlagan <strong>har qanday</strong> odam buni ko’radi. Fayl nomlariga bemor, palata yoki tashxis bilan bog’liq narsa tushsa, bu shaxsiy tibbiy ma’lumot oshkorligi.</p>
<p>Sahifada fayl nomi umuman kerak emas — hujjat raqami, sana va tashkilot nomi yetarli. Bitta qatorni olib tashlash kifoya.</p></td>
</tr>
</tbody>
</table>

**10-bob. Tashqi bog’liqliklar**

*Beshta xizmat. Uchtasi Google’ning o’zi — ular Apps Script bilan bir muhitda va ishonchli. Ikkitasi tashqi — ular tizimning zaif nuqtasi.*

| **Xizmat**                | **Nima uchun**                                 | **Ishlamasa**              | **Yo’q qilish yo’li**                                      |
|---------------------------|------------------------------------------------|----------------------------|------------------------------------------------------------|
| Drive (ichki)             | Fayl o’qish, PDF saqlash, ulashish, ko’chirish | Tizim to’xtaydi            | —                                                          |
| Sheets (ichki)            | Sozlamalar, raqam berish, reyestr, qidiruv     | Tizim to’xtaydi            | —                                                          |
| Gmail (ichki)             | Hujjatni mijozga jo’natish                     | Faqat jo’natish ishlamaydi | —                                                          |
| unpkg.com (tashqi)        | pdf-lib 1.17.1, har chaqiruvda ~1.4 MB         | PDF ishlanmaydi            | Kutubxonani loyihaga alohida .gs fayl qilib qo’yish        |
| api.qrserver.com (tashqi) | QR-kod PNG rasmi, 600×600                      | Hujjat yaratilmaydi        | QR matritsasini kodda hisoblab, to’rtburchak qilib chizish |

Ikkala tashqi bog’liqlikni ham yo’q qilish mumkin. Shundan keyin UrlFetchApp umuman ishlatilmaydi va urlFetchWhitelist ham kerak bo’lmaydi — ya’ni manifest ham soddalashadi.

Uchinchi kichik bog’liqlik ham bor: add-on belgisi placehold.co manzilidan olinadi. Bu vaqtinchalik yechim, VivaMed logosining ochiq HTTPS manzili paydo bo’lgach almashtiriladi.

**10.1. Nima uchun pdf-lib versiyasi qattiq belgilangan**

Manzilda pdf-lib@1.17.1 deb aniq versiya ko’rsatilgan. Agar «latest» yozilsa, kutubxona muallifi biror narsani o’zgartirganda tizim kutilmaganda ishlamay qolishi mumkin. Aniq versiya bilan bunday xavf yo’q — va bu ayniqsa muhim, chunki kutubxona eval orqali bajariladi.

**11-bob. To’liq oqim**

*Rahbar «Tasdiqlash» tugmasini bosganda nima sodir bo’ladi. Diqqat qiling: hammasi bitta ishga tushirish ichida. Bo’lib bo’lmaydi.*

| **№** | **Nima bo’ladi**                    | **Qaysi qism**              | **Vaqt** |
|-------|-------------------------------------|-----------------------------|----------|
| 1     | Sozlamalar o’qiladi                 | Config.all() → Sheets       | ~0.5s    |
| 2     | Raqam va token band qilinadi — QULF | Registry.reserve() → Sheets | ~0.3s    |
| 3     | Tekshirish havolasi tuziladi        | code.gs                     | —        |
| 4     | Hujjat PDF baytlariga aylanadi      | getPdfBytes\_() → Drive     | 2–10s    |
| 5     | QR-kod rasmi olinadi — TASHQI       | UrlFetchApp → qrserver.com  | ~1s      |
| 6     | pdf-lib yuklanadi — TASHQI          | UrlFetchApp → unpkg.com     | 1–2s     |
| 7     | QR va imzo chiziladi                | PdfStamp.stamp()            | 2–15s    |
| 8     | Yangi PDF papkaga saqlanadi         | DriveApp → Shared Drive     | ~1s      |
| 9     | Fayl havola bilan ulashiladi        | setSharing                  | ~0.5s    |
| 10    | Reyestr qatori to’ldiriladi         | Registry.fill() → Sheets    | ~0.5s    |
| 11    | Asl fayl arxivga ko’chadi           | moveFile\_ → Drive          | ~1s      |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>VAQT LIMITI — TEKSHIRILMAGAN TAXMIN</strong></p>
<p>Texnik hujjatda «6 daqiqa» deb yozilgan, lekin bu oddiy Apps Script uchun. Workspace add-on chaqiruvlariga ancha qisqaroq limit qo’yiladi.</p>
<p>Yuqoridagi zanjir yomon holatda 30 soniyaga yaqinlashadi. Katta Word fayl va ko’p sahifali PDF bilan alohida sinash kerak — hujjatdagi raqamga ishonmang.</p></td>
</tr>
</tbody>
</table>

**11.2. Mijoz tomoni — yetti qadam**

| **№** | **Nima bo’ladi**                                         |
|-------|----------------------------------------------------------|
| 1     | Mijoz QR-kodni telefon kamerasi bilan skanerlaydi        |
| 2     | Brauzer tekshirish sahifasini ochadi — login so’ralmaydi |
| 3     | doGet manzildan hujjat raqami va tokenni oladi           |
| 4     | Registry.find reyestrdan qidiradi va tokenni tekshiradi  |
| 5     | Topilsa — yashil «Hujjat haqiqiy» va ma’lumotlar         |
| 6     | Mijoz «Yuklab olish» tugmasi bilan PDF nusxasini oladi   |
| 7     | Topilmasa — qizil «Hujjat topilmadi» ogohlantirishi      |

**12-bob. Zaif nuqtalar**

*Kod o’qish natijasida topilgan, tuzatilishi kerak bo’lgan joylar — jiddiylik tartibida.*

| **№** | **Muammo**                                       | **Fayl**    | **Tafsilot**                                                                                                                                                                                    |
|-------|--------------------------------------------------|-------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1     | Bitta hujjat ikki marta tasdiqlanishi mumkin     | code.gs     | Arxivga ko’chirish xatosi jimgina yutiladi. Bitta hujjatga ikkita raqam va ikkita QR beriladi, ikkalasi ham reyestrda «haqiqiy». Yechim: Manba File ID (D ustuni) bo’yicha oldindan tekshirish. |
| 2     | Token bo’sh bo’lsa tekshiruv o’tkazib yuboriladi | Registry.gs | if (stored && ...) o’rniga if (!stored \|\| ...) bo’lishi kerak. Bir qatorlik tuzatish.                                                                                                         |
| 3     | Imzo egasining ismi kodda qattiq yozilgan        | PdfStamp.gs | SIGNER_NAME jadvalda yo’q, zaxira qiymat «<SIGNER_NAME>» ishlaydi. Rahbar almashsa hech kim sezmasdan noto’g’ri ism bilan hujjat chiqaveradi.                                                 |
| 4     | moveFile\_ Shared Drive uchun eskirgan usul      | code.gs     | DriveApp.addFile() o’rniga Drive.Files.update bilan supportsAllDrives. Bu 1-bandning ehtimoliy sababi.                                                                                          |
| 5     | «Yaratdi» ustuni jimgina bo’shab qolmoqda        | code.gs     | src.getOwner() Shared Drive fayllarida null qaytaradi. Reyestrning 22-qatoriga qarang: K to’lgan, E bo’sh.                                                                                      |
| 6     | Tekshirish sahifasi fayl nomini ochiq ko’rsatadi | Verify.html | Nomlarga bemor yoki palata ma’lumoti tushsa, u QR skanerlagan har kimga ko’rinadi.                                                                                                              |
| 7     | listPending\_ 20 tadan keyin saralaydi           | code.gs     | Drive bergan birinchi 20 ta olinib, keyin saralanadi. Bu «eng yangi 20 ta» emas.                                                                                                                |
| 8     | Hujjatni bekor qilish mexanizmi yo’q             | —           | Noto’g’ri chiqqan hujjat reyestrda abadiy «haqiqiy» bo’lib qoladi. Holat ustuni va find() da uni tekshirish — bir soatlik ish.                                                                  |
| 9     | Reyestr va Sozlamalar himoyalanmagan             | —           | Jadvalga kirish huquqi bo’lgan har kim qatorni o’chirib hujjatni bilmasdan «o’ldirishi» mumkin. Himoyalangan diapazon sozlash — besh daqiqalik ish.                                             |

**12.1. Tavsiya etilgan tartib**

Birdan hammasini qilishga urinmaslik kerak. Tavsiya etiladigan ketma-ketlik:

| **Bosqich** | **Ish**                                                    | **Vaqt**  |
|-------------|------------------------------------------------------------|-----------|
| Bugun       | Sozlamalar varag’iga 10 ta yetishmayotgan kalitni qo’shish | 5 daqiqa  |
| Bugun       | Reyestr va Sozlamalar varaqlarini himoyalash               | 5 daqiqa  |
| Shu hafta   | 1, 2 va 4-bandlarni tuzatish (kod)                         | 1–2 soat  |
| Shu hafta   | Katta Word va ko’p sahifali PDF bilan sinash               | 30 daqiqa |
| Keyingi     | 6 va 8-bandlar — maxfiylik va bekor qilish                 | 2–3 soat  |
| Keyin       | Tashqi bog’liqliklarni yo’q qilish                         | 1 kun     |

**Ilova. Integratsiya matritsasi**

*Qaysi fayl qaysi resursga tegadi. ● — to’g’ridan-to’g’ri, ○ — boshqa modul orqali.*

| **Fayl**        | **Config** | **Sheets** | **Drive** | **Gmail** | **Tashqi** |
|-----------------|------------|------------|-----------|-----------|------------|
| appsscript.json | —          | —          | —         | —         | e’lon      |
| Config.gs       | —          | ●          | ●         | —         | —          |
| Registry.gs     | ●          | ●          | —         | —         | —          |
| PdfStamp.gs     | ●          | ○          | —         | —         | ● unpkg    |
| code.gs         | ●          | ○          | ●         | ●         | ● qrserver |
| WebApp.gs       | ●          | ○          | —         | —         | —          |
| Verify.html     | —          | —          | —         | —         | —          |

Config.gs Drive’ga faqat diagnose() ichida tegadi — papkalar mavjudligini tekshirish uchun. Boshqa hech qanday fayl amali yo’q.

**Fayllar hajmi va vazifasi**

| **Fayl**        | **Turi** | **Vazifasi**                                |
|-----------------|----------|---------------------------------------------|
| appsscript.json | Manifest | Ruxsatlar, add-on ta’rifi, tashqi manzillar |
| Config.gs       | Skript   | Sozlamalarni o’qish, keshlash, diagnostika  |
| Registry.gs     | Skript   | Raqam berish, qidirish, token tekshiruvi    |
| PdfStamp.gs     | Skript   | pdf-lib, SyncPromise, PDF ustiga chizish    |
| code.gs         | Skript   | Kartalar, asosiy oqim, fayl o’girish, Gmail |
| WebApp.gs       | Skript   | Ochiq tekshirish sahifasini uzatish         |
| Verify.html     | HTML     | Tekshirish sahifasining ko’rinishi          |

**Xulosa**

Kodning butun shakli bitta cheklovdan o’sadi: add-on’da har bir bosish — alohida, xotirasiz ishga tushirish. Holat saqlanmaydi, shuning uchun u tashqarida yashaydi: papka holatni bildiradi, Sheets qatori yozuvni saqlaydi.

Ikkinchi tamoyil — bitta tanada ikkita yuz. Add-on xodim nomidan ishlaydi va yozadi. Web App egasi nomidan ishlaydi, lekin faqat bitta funksiya ochiq va u faqat o’qiydi. Himoya parolga emas, yuzaning kichikligiga qurilgan.

Uchinchisi — qat’iy piramida. Config.gs poydevor, uning ustida Registry va PdfStamp, eng tepada code.gs va WebApp.gs. Aylanma bog’lanish yo’q, shuning uchun istalgan modulni alohida tushunish va o’zgartirish mumkin.

Eng katta muhandislik to’sig’i Apps Script va pdf-lib o’rtasidagi Promise nomuvofiqligi bo’ldi — u sinxron Promise implementatsiyasi orqali yengib o’tildi. Bu yechim universal emas: u aynan pdf-lib ichida haqiqiy kutish yo’qligi sababli ishlaydi.

Hozirgi holatda kod asosiy vazifasini bajaradi. Oldinda turgan eng muhim ish — takroriy tasdiqlash imkoniyatini yopish va sozlamalarni jadvalga to’liq chiqarish. Ikkalasi ham murakkab emas, lekin ikkalasi ham kechiktirilsa qimmatga tushadi.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>BU HUJJAT HAQIDA</strong></p>
<p>Ushbu kitob kod bilan birga rivojlanishi kerak. Har bir jiddiy o’zgarish tegishli bobga qo’shilsa, kelajakdagi dasturchi qarorlarning sababini tushunadi va bir xil xatoni takrorlamaydi.</p></td>
</tr>
</tbody>
</table>
