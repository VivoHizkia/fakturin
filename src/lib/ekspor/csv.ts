import type { Dokumen, Hasil } from "@/lib/gudang/tipe";

// Ekspor dokumen yang disetujui. Satu baris CSV per baris barang, dengan data faktur diulang
// di setiap baris, supaya langsung bisa dijumlahkan di Excel tanpa menggabung tabel.

const KEPALA = [
  "id_dokumen",
  "nama_berkas",
  "penjual",
  "nomor_faktur",
  "tanggal",
  "mata_uang",
  "subtotal",
  "pajak",
  "total",
  "nama_barang",
  "jumlah",
  "harga_satuan",
  "total_baris",
  "lolos_otomatis",
];

// Isi faktur berasal dari gambar yang diunggah orang, jadi tidak bisa dipercaya. Sel yang
// diawali = + - @ dijalankan Excel sebagai rumus; tanda kutip tunggal di depan mematikannya.
export function sel(nilai: string | number | boolean | null): string {
  if (nilai === null) return "";
  if (typeof nilai === "number") return String(nilai);
  if (typeof nilai === "boolean") return nilai ? "ya" : "tidak";

  const aman = /^[=+\-@\t\r]/.test(nilai) ? `'${nilai}` : nilai;
  return /[",\r\n]/.test(aman) ? `"${aman.replace(/"/g, '""')}"` : aman;
}

export type SaringTanggal = { dari?: string; sampai?: string };

export function buatCsv(dokumen: Dokumen[], hasil: Hasil[], saring: SaringTanggal = {}): string {
  const hasilPerId = new Map(hasil.map((satu) => [satu.dokumen_id, satu]));
  const baris: string[] = [KEPALA.join(",")];

  for (const satu of dokumen) {
    if (satu.status !== "disetujui") continue;
    const faktur = hasilPerId.get(satu.id)?.faktur;
    if (!faktur) continue;

    // Tanggal YYYY-MM-DD bisa dibandingkan sebagai teks.
    if (saring.dari && (faktur.tanggal ?? "") < saring.dari) continue;
    if (saring.sampai && (faktur.tanggal ?? "9999") > saring.sampai) continue;

    const kepala = [
      satu.id,
      satu.nama_berkas,
      faktur.penjual,
      faktur.nomor_faktur,
      faktur.tanggal,
      faktur.mata_uang,
      faktur.subtotal,
      faktur.pajak,
      faktur.total,
    ];
    // Faktur tanpa rincian barang tetap muncul, dengan kolom barang kosong.
    const barang = faktur.baris.length > 0 ? faktur.baris : [null];
    for (const b of barang) {
      baris.push(
        [
          ...kepala,
          b?.nama ?? null,
          b?.jumlah ?? null,
          b?.harga_satuan ?? null,
          b?.total_baris ?? null,
          satu.lolos_otomatis,
        ]
          .map(sel)
          .join(","),
      );
    }
  }

  // BOM supaya Excel membaca berkasnya sebagai UTF-8.
  return `﻿${baris.join("\r\n")}\r\n`;
}
