# Hasil eval

Model: `gemini-3.5-flash-lite`. Dokumen: 20. Dijalankan: 2026-11-16.

Dibuat oleh `npm run eval` terhadap gambar di `contoh/` dan jawaban di `contoh/jawaban.json`.

## Akurasi per kolom

Dihitung dari 20 dokumen yang jawabannya lolos skema.

| Kolom | Benar |
| --- | --- |
| penjual | 100% (20/20) |
| nomor_faktur | 100% (20/20) |
| tanggal | 100% (20/20) |
| subtotal | 95% (19/20) |
| pajak | 100% (20/20) |
| total | 100% (20/20) |
| baris barang (semua baris cocok) | 100% (20/20) |

## Pemilahan

| Ukuran | Hasil |
| --- | --- |
| Dokumen bersih yang lolos otomatis | 100% (15/15) |
| Dokumen bermasalah yang tertangkap aturan | 100% (5/5) |
| Dokumen bermasalah yang lolos tanpa diperiksa | 0 |
| Dokumen lolos otomatis padahal ada kolom yang salah baca | 1 |
| Panggilan AI yang gagal (jaringan atau kuota) | 0 |

## Per dokumen

| Berkas | Jenis | Salah baca | Seharusnya | Didapat |
| --- | --- | --- | --- | --- |
| faktur-01.png | faktur | - | lolos | lolos |
| faktur-02.png | faktur, miring | - | lolos | lolos |
| faktur-03.png | faktur | - | lolos | lolos |
| faktur-04.png | struk | - | lolos | lolos |
| faktur-05.png | struk, kecil | - | lolos | lolos |
| faktur-06.png | nota | - | lolos | lolos |
| faktur-07.png | nota | subtotal: 865000 (seharusnya null) | lolos | lolos |
| faktur-08.png | faktur, buram | - | lolos | lolos |
| faktur-09.png | struk, pudar | - | lolos | lolos |
| faktur-10.jpg | faktur, jpeg | - | lolos | lolos |
| faktur-11.jpg | struk, miring, jpeg | - | lolos | lolos |
| faktur-12.png | nota, miring | - | lolos | lolos |
| faktur-13.png | faktur, pudar, kecil | - | lolos | lolos |
| faktur-14.png | struk | - | lolos | lolos |
| faktur-15.png | faktur, buram, miring | - | lolos | lolos |
| faktur-16.png | faktur, cacat: total_salah | - | total_tidak_cocok | total_tidak_cocok |
| faktur-17.png | struk, cacat: baris_salah | - | jumlah_baris_tidak_cocok | jumlah_baris_tidak_cocok |
| faktur-18.png | nota, cacat: tanpa_tanggal | - | kolom_wajib_kosong | kolom_wajib_kosong |
| faktur-19.png | faktur, cacat: tanggal_lama | - | tanggal_tidak_wajar | tanggal_tidak_wajar |
| faktur-20.png | faktur, miring, buram | - | duplikat | duplikat |
