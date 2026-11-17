import type { Faktur } from "@/lib/ekstrak/skema";
import type { Alasan } from "@/lib/periksa/aturan";

// Lapisan penyimpanan. Sisa aplikasi hanya mengenal antarmuka Gudang, jadi mengganti berkas
// lokal dengan Postgres (lihat supabase/migrations) tidak menyentuh kode lain.

export type Status = "antre" | "diproses" | "perlu_diperiksa" | "disetujui" | "ditolak" | "gagal";

export const SEMUA_STATUS: Status[] = [
  "antre",
  "diproses",
  "perlu_diperiksa",
  "disetujui",
  "ditolak",
  "gagal",
];

export type Dokumen = {
  id: string;
  nama_berkas: string;
  jenis: string;
  ukuran: number;
  status: Status;
  dibuat_pada: string;
  diproses_pada: string | null;
  diputuskan_pada: string | null;
  // Disetujui tanpa disentuh manusia.
  lolos_otomatis: boolean;
  // Terisi kalau status "gagal".
  galat: string | null;
};

export type Hasil = {
  dokumen_id: string;
  faktur: Faktur;
  alasan: Alasan[];
  // Jawaban AI apa adanya, untuk menelusuri kesalahan.
  json_mentah: string;
};

export type Koreksi = {
  id: string;
  dokumen_id: string;
  kolom: string;
  nilai_lama: string;
  nilai_baru: string;
  pada: string;
};

export type DokumenBaru = { nama_berkas: string; jenis: string; isi: Buffer };

export interface Gudang {
  buatDokumen(data: DokumenBaru, sekarang?: Date): Promise<Dokumen>;
  // Terbaru di atas.
  daftarDokumen(): Promise<Dokumen[]>;
  ambilDokumen(id: string): Promise<Dokumen | null>;
  ubahDokumen(id: string, perubahan: Partial<Omit<Dokumen, "id">>): Promise<Dokumen>;
  // Mengambil dokumen "antre" tertua dan langsung menandainya "diproses", dalam satu langkah,
  // supaya dua pemanggil tidak memproses dokumen yang sama.
  ambilAntreBerikutnya(sekarang?: Date): Promise<Dokumen | null>;
  bacaBerkas(id: string): Promise<Buffer>;

  simpanHasil(hasil: Hasil): Promise<void>;
  ambilHasil(dokumenId: string): Promise<Hasil | null>;
  daftarHasil(): Promise<Hasil[]>;

  catatKoreksi(koreksi: Omit<Koreksi, "id">[]): Promise<void>;
  daftarKoreksi(dokumenId?: string): Promise<Koreksi[]>;
}
