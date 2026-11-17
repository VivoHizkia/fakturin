# Keterbatasan dan langkah berikutnya

## Yang sudah jalan

- Unggah gambar, antrean, ekstraksi oleh AI dengan validasi skema dan satu kali coba ulang.
- Enam aturan pemeriksaan di kode, dengan alasan yang ditampilkan ke pemeriksa.
- Halaman periksa dengan pintasan papan ketik dan pencatatan setiap koreksi.
- Ekspor CSV, webhook bertanda tangan, dan ringkasan (persentase lolos otomatis, kolom yang paling sering dibetulkan).
- Eval terhadap 20 contoh, dan 81 tes yang berjalan tanpa jaringan.

## Keterbatasan

**Eval memakai gambar buatan.** Kedua puluh faktur contoh digambar oleh skrip. Hurufnya rapi dan gangguannya ringan, jadi akurasi 95 sampai 100 persen itu batas atas, bukan perkiraan untuk foto ponsel sungguhan. Tulisan tangan di contoh adalah huruf komputer bergaya tulisan tangan, bukan tulisan orang.

**Aturan hanya menangkap kesalahan yang merusak hitungan.** Kalau model salah membaca nama penjual, nomor faktur, atau tanggal menjadi nilai lain yang masih wajar, tidak ada aturan yang tahu. Begitu juga kalau model salah membaca satu angka lalu "membetulkan" angka lain supaya jumlahnya cocok. Eval mencatat satu kasus seperti ini: subtotal diisi padahal tidak tertulis.

**Belum ada login.** Semua dokumen terlihat oleh siapa pun yang bisa membuka aplikasi.

**Penyimpanan lokal tidak cocok untuk hosting serverless.** `.data/` butuh disk yang tetap. Di Vercel berkasnya hilang setiap kali fungsi dimulai ulang. Antrean tulisnya juga hanya aman dalam satu proses.

**Hanya gambar.** PDF belum diterima. Faktur lebih dari satu halaman harus diunggah per halaman dan tidak digabung.

**Model faktur sederhana.** Tidak ada kolom diskon, ongkos kirim, uang muka, atau lebih dari satu jenis pajak. Faktur seperti itu akan gagal aturan "total tidak cocok" dan masuk antrean periksa, yang aman tetapi menambah kerja pemeriksa.

**Duplikat hanya dicek untuk faktur bernomor.** Struk tanpa nomor yang diunggah dua kali tidak tertangkap.

**Kuota harian dihitung untuk semua pengunjung bersama**, karena belum ada pengguna.

## Langkah berikutnya

1. **Postgres dan login.** Skemanya sudah ada di `supabase/migrations/0001_awal.sql`, lengkap dengan Row Level Security, tetapi belum pernah dijalankan. Yang perlu ditulis: implementasi `Gudang` kedua yang memakai Supabase, dan login email. Setelah itu aplikasi bisa dipasang di Vercel.
2. **Eval dengan foto sungguhan.** Kumpulkan 30 sampai 50 foto faktur milik sendiri, tulis jawabannya, dan jalankan eval yang sama. Angka dari situ yang layak dipercaya.
3. **Skor keyakinan per kolom.** Minta model menandai kolom yang ia ragu, lalu masukkan dokumen itu ke antrean periksa walau hitungannya cocok. Ini menutup celah "salah baca yang masih wajar".
4. **PDF**, dengan mengubah tiap halaman menjadi gambar sebelum dikirim ke model.
5. **Diskon dan ongkos kirim** di skema dan di aturan total.
6. **Memakai data koreksi.** Kolom yang paling sering dibetulkan manusia menunjukkan bagian prompt yang perlu diperbaiki. Koreksi juga bisa menjadi contoh tambahan untuk eval.
7. **Penjadwal.** Panggil `/api/proses` lewat cron supaya dokumen yang tertinggal tetap diproses walau halaman depan tidak dibuka.

## Keputusan yang diambil dan alasannya

**Manusia boleh menyetujui dokumen yang masih melanggar aturan.** Aturan bisa salah, misalnya untuk faktur berdiskon. Pemeriksa adalah penentu terakhir; aplikasinya hanya memastikan ia melihat masalahnya dulu.

**Model dilarang menghitung ulang.** Prompt meminta model menyalin apa yang tertulis, termasuk angka yang tampak salah. Kalau model membetulkan total yang salah jumlah, aturan tidak akan pernah melihat kesalahannya.

**Gagal jaringan berbeda dari gagal baca.** Kuota habis atau koneksi putus menandai dokumen `gagal` dan bisa dicoba lagi. Jawaban AI yang dua kali di luar skema menandai dokumen `perlu_diperiksa` dengan formulir kosong, karena mencoba lagi kemungkinan besar tidak mengubah apa pun.

**Persentase lolos otomatis menghitung antrean periksa sebagai "tidak lolos".** Kalau hanya dokumen yang sudah diputuskan yang dihitung, angkanya justru tampak paling bagus saat antrean menumpuk.

**Satu dokumen per pemanggilan `/api/proses`.** Supaya muat dalam batas waktu fungsi serverless, dan supaya satu dokumen yang lambat tidak menahan yang lain.
