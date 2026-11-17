import type { Status } from "@/lib/gudang/tipe";

// Tampilan angka, tanggal, dan status. Dipakai di peramban, jadi tidak boleh mengimpor apa pun
// yang butuh Node.

export function uang(nilai: number | null, mataUang = "IDR"): string {
  if (nilai === null) return "-";
  const angka = nilai.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  return mataUang === "IDR" ? `Rp${angka}` : `${mataUang} ${angka}`;
}

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// "2026-11-03" menjadi "3 Nov 2026". Dirakit sendiri supaya tidak bergeser karena zona waktu.
export function tanggal(iso: string | null): string {
  if (!iso) return "-";
  const [tahun, bulan, hari] = iso.slice(0, 10).split("-").map(Number);
  return `${hari} ${BULAN[bulan - 1] ?? "?"} ${tahun}`;
}

export const LABEL_STATUS: Record<Status, string> = {
  antre: "Antre",
  diproses: "Dibaca AI",
  perlu_diperiksa: "Perlu diperiksa",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
  gagal: "Gagal dibaca",
};

export const LABEL_KOLOM: Record<string, string> = {
  penjual: "Penjual",
  nomor_faktur: "Nomor faktur",
  tanggal: "Tanggal",
  mata_uang: "Mata uang",
  subtotal: "Subtotal",
  pajak: "Pajak",
  total: "Total",
  baris: "Baris barang",
};
