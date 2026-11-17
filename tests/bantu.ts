import type { Faktur } from "@/lib/ekstrak/skema";

// Faktur yang lolos semua aturan pada HARI_INI. Tes mengubah satu kolom untuk memicu satu aturan.
export const HARI_INI = new Date("2026-11-16T03:00:00Z");

export function fakturBaik(ubah: Partial<Faktur> = {}): Faktur {
  return {
    penjual: "Toko Sumber Rejeki",
    nomor_faktur: "INV-001",
    tanggal: "2026-11-10",
    mata_uang: "IDR",
    subtotal: 100_000,
    pajak: 11_000,
    total: 111_000,
    baris: [
      { nama: "Semen 50 kg", jumlah: 1, harga_satuan: 60_000, total_baris: 60_000 },
      { nama: "Paku 1 kg", jumlah: 2, harga_satuan: 20_000, total_baris: 40_000 },
    ],
    ...ubah,
  };
}

// PNG 1x1 yang sah, cukup untuk lolos pemeriksaan jenis berkas.
export const PNG_KECIL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
