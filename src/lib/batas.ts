import type { Dokumen } from "@/lib/gudang/tipe";

// Batas unggahan: ukuran, jenis berkas, dan jumlah per hari. Setiap unggahan memakai satu
// panggilan AI, jadi tanpa batas ini satu pengunjung bisa menghabiskan kuota gratisnya.

export const MAKS_UKURAN = 5 * 1024 * 1024;
export const JENIS_DITERIMA = ["image/jpeg", "image/png", "image/webp"];
const BATAS_HARIAN_BAWAAN = 30;

// Jenis berkas dibaca dari byte pertamanya, bukan dari nama atau header yang dikirim peramban,
// karena keduanya bisa diisi sesuka pengirim.
export function kenaliJenis(isi: Uint8Array): string | null {
  const awal = (...byte: number[]) => byte.every((nilai, i) => isi[i] === nilai);

  if (awal(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (awal(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  // "RIFF" .... "WEBP"
  if (awal(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...isi.slice(8, 12)) === "WEBP") {
    return "image/webp";
  }
  return null;
}

export type CekBerkas = { ok: true; jenis: string } | { ok: false; pesan: string };

export function cekBerkas(isi: Uint8Array): CekBerkas {
  if (isi.byteLength === 0) return { ok: false, pesan: "Berkas kosong." };
  if (isi.byteLength > MAKS_UKURAN) {
    return { ok: false, pesan: "Berkas lebih dari 5 MB." };
  }

  const jenis = kenaliJenis(isi);
  if (!jenis) return { ok: false, pesan: "Hanya gambar JPG, PNG, atau WebP yang diterima." };
  return { ok: true, jenis };
}

export function batasHarian(): number {
  const dariEnv = Number(process.env.BATAS_UNGGAH_HARIAN);
  return Number.isInteger(dariEnv) && dariEnv > 0 ? dariEnv : BATAS_HARIAN_BAWAAN;
}

// Sisa unggahan hari ini (tanggal UTC).
export function sisaHariIni(dokumen: Dokumen[], sekarang = new Date()): number {
  const hariIni = sekarang.toISOString().slice(0, 10);
  const terpakai = dokumen.filter((satu) => satu.dibuat_pada.slice(0, 10) === hariIni).length;
  return Math.max(0, batasHarian() - terpakai);
}

// Nama berkas hanya ditampilkan, tidak pernah dipakai sebagai path. Tetap dirapikan supaya
// tidak ada karakter kendali atau nama sepanjang layar.
export function rapikanNama(nama: string): string {
  const bersih = nama
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "_")
    .trim();
  return (bersih || "tanpa-nama").slice(0, 120);
}
