-- Skema Postgres untuk menggantikan penyimpanan berkas lokal (src/lib/gudang/lokal.ts).
--
-- BELUM PERNAH DIJALANKAN. Ini rancangan untuk tahap berikutnya: jalankan di proyek Supabase
-- kosong, lalu tulis implementasi Gudang yang memakainya. Lihat WRITEUP.md.

create type status_dokumen as enum (
  'antre',
  'diproses',
  'perlu_diperiksa',
  'disetujui',
  'ditolak',
  'gagal'
);

create table dokumen (
  id uuid primary key default gen_random_uuid(),
  pemilik_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nama_berkas text not null,
  -- Path di Supabase Storage: <pemilik_id>/<id>.<ekstensi>
  path_berkas text not null,
  jenis text not null check (jenis in ('image/jpeg', 'image/png', 'image/webp')),
  ukuran integer not null check (ukuran > 0 and ukuran <= 5242880),
  status status_dokumen not null default 'antre',
  lolos_otomatis boolean not null default false,
  galat text,
  dibuat_pada timestamptz not null default now(),
  diproses_pada timestamptz,
  diputuskan_pada timestamptz
);

-- Mengambil dokumen antre tertua, dan menghitung unggahan hari ini per pemilik.
create index dokumen_antrean on dokumen (status, dibuat_pada);
create index dokumen_pemilik on dokumen (pemilik_id, dibuat_pada desc);

create table hasil_ekstraksi (
  dokumen_id uuid primary key references dokumen (id) on delete cascade,
  penjual text,
  nomor_faktur text,
  tanggal date,
  mata_uang char(3) not null default 'IDR',
  subtotal numeric(18, 2) check (subtotal >= 0),
  pajak numeric(18, 2) check (pajak >= 0),
  total numeric(18, 2) check (total >= 0),
  -- Daftar { kode, kolom, pesan } dari src/lib/periksa/aturan.ts
  alasan_periksa jsonb not null default '[]',
  json_mentah text not null default ''
);

-- Pemeriksaan duplikat: penjual dan nomor faktur yang sama.
create index hasil_penjual_nomor on hasil_ekstraksi (lower(penjual), lower(nomor_faktur));

create table baris_barang (
  id uuid primary key default gen_random_uuid(),
  dokumen_id uuid not null references hasil_ekstraksi (dokumen_id) on delete cascade,
  urutan integer not null,
  nama text not null,
  jumlah numeric(18, 4) not null check (jumlah > 0),
  harga_satuan numeric(18, 2) not null check (harga_satuan >= 0),
  total_baris numeric(18, 2) not null check (total_baris >= 0),
  unique (dokumen_id, urutan)
);

create table koreksi (
  id uuid primary key default gen_random_uuid(),
  dokumen_id uuid not null references dokumen (id) on delete cascade,
  kolom text not null,
  nilai_lama text not null,
  nilai_baru text not null,
  oleh uuid not null default auth.uid() references auth.users (id),
  pada timestamptz not null default now()
);

create index koreksi_dokumen on koreksi (dokumen_id, pada);

-- Setiap pengguna hanya melihat dan mengubah dokumennya sendiri. Tabel turunan mengikuti
-- pemilik dokumen induknya.

alter table dokumen enable row level security;
alter table hasil_ekstraksi enable row level security;
alter table baris_barang enable row level security;
alter table koreksi enable row level security;

create policy dokumen_milik_sendiri on dokumen
  for all
  using (pemilik_id = auth.uid())
  with check (pemilik_id = auth.uid());

create policy hasil_milik_sendiri on hasil_ekstraksi
  for all
  using (exists (select 1 from dokumen d where d.id = dokumen_id and d.pemilik_id = auth.uid()))
  with check (exists (select 1 from dokumen d where d.id = dokumen_id and d.pemilik_id = auth.uid()));

create policy baris_milik_sendiri on baris_barang
  for all
  using (exists (select 1 from dokumen d where d.id = dokumen_id and d.pemilik_id = auth.uid()))
  with check (exists (select 1 from dokumen d where d.id = dokumen_id and d.pemilik_id = auth.uid()));

-- Koreksi adalah catatan: boleh dibaca dan ditambah, tidak boleh diubah atau dihapus.
create policy koreksi_baca on koreksi
  for select
  using (exists (select 1 from dokumen d where d.id = dokumen_id and d.pemilik_id = auth.uid()));

create policy koreksi_tambah on koreksi
  for insert
  with check (
    oleh = auth.uid()
    and exists (select 1 from dokumen d where d.id = dokumen_id and d.pemilik_id = auth.uid())
  );

-- Mengambil satu dokumen antre dan menandainya diproses dalam satu langkah. "skip locked"
-- membuat dua pekerja yang jalan bersamaan tidak pernah mendapat dokumen yang sama.
-- Dipanggil oleh server dengan kunci layanan, jadi melewati Row Level Security.
create function ambil_antre_berikutnya() returns dokumen
language sql
security definer
set search_path = public
as $$
  update dokumen
  set status = 'diproses', diproses_pada = now(), galat = null
  where id = (
    select id
    from dokumen
    where status = 'antre'
      or (status = 'diproses' and diproses_pada < now() - interval '2 minutes')
    order by dibuat_pada
    limit 1
    for update skip locked
  )
  returning *;
$$;

revoke execute on function ambil_antre_berikutnya() from public, anon, authenticated;
