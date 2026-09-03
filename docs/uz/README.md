# Texnik kitoblar (o'zbekcha)

Loyiha davomida yozilgan asl texnik kitoblar. Ular tizim qanday qurilganini emas, **nima uchun aynan shunday qurilganini** tushuntiradi — qaysi qaror qaysi muammoni yechgani, qaysi joyda muhandislik hiylasi ishlatilgani va nima ishlamay qolgani.

Ingliz tilidagi qisqartirilgan va tartiblangan hujjatlar: [`../en/`](../en/)

| # | Kitob | Nima haqida |
| --- | --- | --- |
| 01 | [Tizimni qayta qurish va Cloudflare arxitekturasi](01-tizim-qayta-qurish.md) | Muammo, `script.google.com` ishonch muammosi, yangi arxitektura qarori, Google muhitini noldan qurish, domen va DNS |
| 02 | [Production arxitekturasi (2-versiya)](02-production-arxitektura.md) | Eng to'liq kitob: hujjat lifecycle'i, Google qatlami, Cloudflare, Service Account, revoke, migratsiya, xavfsizlik testlari, ekspluatatsiya |
| 03 | [QR Verification tizimi — professional kitob](03-qr-verification-toliq.md) | Komponentlar, JWT/OAuth, custom domain, ikki bosqichli havola, HMAC, SHA-256, xavfsizlik qatlamlari |
| 04 | [Cloudflare Worker va private PDF gateway](04-cloudflare-private-pdf.md) | `drive.google.com` havolasi qanday yo'q qilindi, DNS delegatsiyasi, routing, private stream |
| 05 | [Google Cloud Console](05-google-cloud-console.md) | GCP loyihasi, Sheets/Drive API, Service Account, kalitlar, read-only ruxsatlar |
| 06 | [Kod arxitekturasi](06-kod-arxitekturasi.md) | Har bir fayl: vazifasi, bog'lanishi, g'oyasi, zaif joyi |

## Eslatma

Kitoblar Word'da yozilgan va bu yerga `pandoc` orqali o'girilgan, shuning uchun ba'zi jadvallar HTML ko'rinishida qolgan.

Ommaviy repo uchun barcha real identifikatorlar — domen, Drive va Sheets ID'lari, GCP loyiha nomi va raqami, Worker nomlari, elektron pochtalar va shaxs ismlari — placeholder bilan almashtirilgan. Google Cloud va Cloudflare konsolining skrinshotlari ham olib tashlangan: ular aynan shunday ma'lumotlarni oshkor qiladi.

Kitoblarda tasvirlangan ba'zi kamchiliklar keyinchalik tuzatilgan. Nimasi tuzatilgani va nimasi hali ochiqligi [`../en/07-known-issues.md`](../en/07-known-issues.md) da.
