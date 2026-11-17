import type { Faktur } from "@/lib/ekstrak/skema";

// Pemeriksaan yang dijalankan di kode setelah AI selesai. Prompt saja bukan jaminan, jadi
// hitungan dan kelengkapan dicek di sini. Dokumen yang melanggar salah satu aturan masuk
// antrean periksa; sisanya langsung disetujui.

export type KodeAlasan =
  | "kolom_wajib_kosong"
  | "jumlah_baris_tidak_cocok"
  | "total_tidak_cocok"
  | "tanggal_tidak_wajar"
  | "duplikat"
  | "gagal_skema";

export type Alasan = {
  kode: KodeAlasan;
  // Kolom formulir yang perlu disorot.
  kolom: string[];
  pesan: string;
};

// Faktur lain yang sudah tersimpan, untuk pemeriksaan duplikat.
export type FakturLain = { penjual: string | null; nomor_faktur: string | null };

export type Konteks = { hariIni: Date; fakturLain: FakturLain[] };

// Selisih pembulatan yang masih diterima, dalam satuan mata uang.
const TOLERANSI = 1;
const MAKS_UMUR_TAHUN = 2;

const rupiah = (nilai: number) => `Rp${Math.round(nilai).toLocaleString("id-ID")}`;

const WAJIB = ["penjual", "tanggal", "total"] as const;

export function kolomWajib(faktur: Faktur): Alasan | null {
  const kosong = WAJIB.filter((kolom) => faktur[kolom] === null);
  if (kosong.length === 0) return null;
  return {
    kode: "kolom_wajib_kosong",
    kolom: [...kosong],
    pesan: `Kolom wajib belum terisi: ${kosong.join(", ")}.`,
  };
}

// Dibandingkan dengan subtotal kalau ada. Struk kecil sering hanya menulis total, jadi kalau
// subtotal kosong pembandingnya total dikurangi pajak.
export function jumlahBaris(faktur: Faktur): Alasan | null {
  if (faktur.baris.length === 0) return null;

  const pembanding =
    faktur.subtotal ?? (faktur.total === null ? null : faktur.total - (faktur.pajak ?? 0));
  if (pembanding === null) return null;

  const jumlah = faktur.baris.reduce((total, baris) => total + baris.total_baris, 0);
  if (Math.abs(jumlah - pembanding) <= TOLERANSI) return null;

  const namaPembanding = faktur.subtotal === null ? "total dikurangi pajak" : "subtotal";
  return {
    kode: "jumlah_baris_tidak_cocok",
    kolom: ["baris", faktur.subtotal === null ? "total" : "subtotal"],
    pesan: `Jumlah semua baris ${rupiah(jumlah)}, tetapi ${namaPembanding} ${rupiah(pembanding)}.`,
  };
}

export function totalCocok(faktur: Faktur): Alasan | null {
  if (faktur.subtotal === null || faktur.total === null) return null;

  const seharusnya = faktur.subtotal + (faktur.pajak ?? 0);
  if (Math.abs(seharusnya - faktur.total) <= TOLERANSI) return null;

  return {
    kode: "total_tidak_cocok",
    kolom: ["subtotal", "pajak", "total"],
    pesan: `Subtotal ditambah pajak ${rupiah(seharusnya)}, tetapi total tertulis ${rupiah(faktur.total)}.`,
  };
}

export function tanggalWajar(faktur: Faktur, hariIni: Date): Alasan | null {
  if (faktur.tanggal === null) return null;

  const tanggal = new Date(`${faktur.tanggal}T00:00:00Z`);
  // "2026-02-31" lolos pola tetapi bukan tanggal: Date menolaknya atau menggesernya.
  const nyata =
    !Number.isNaN(tanggal.getTime()) && tanggal.toISOString().slice(0, 10) === faktur.tanggal;
  if (!nyata) {
    return {
      kode: "tanggal_tidak_wajar",
      kolom: ["tanggal"],
      pesan: "Tanggal tidak ada di kalender.",
    };
  }

  // Faktur hari ini di zona waktu mana pun tidak boleh dianggap masa depan.
  const batasAtas = new Date(hariIni.getTime() + 24 * 60 * 60 * 1000);
  if (tanggal > batasAtas) {
    return {
      kode: "tanggal_tidak_wajar",
      kolom: ["tanggal"],
      pesan: "Tanggal faktur di masa depan.",
    };
  }

  const batasBawah = new Date(hariIni);
  batasBawah.setUTCFullYear(batasBawah.getUTCFullYear() - MAKS_UMUR_TAHUN);
  if (tanggal < batasBawah) {
    return {
      kode: "tanggal_tidak_wajar",
      kolom: ["tanggal"],
      pesan: `Tanggal faktur lebih dari ${MAKS_UMUR_TAHUN} tahun lalu.`,
    };
  }
  return null;
}

// "PT. Maju  Jaya" dan "pt maju jaya" dianggap penjual yang sama.
const ratakan = (teks: string) => teks.toLowerCase().replace(/[^a-z0-9]/g, "");

export function duplikat(faktur: Faktur, fakturLain: FakturLain[]): Alasan | null {
  if (faktur.penjual === null || faktur.nomor_faktur === null) return null;

  const penjual = ratakan(faktur.penjual);
  const nomor = ratakan(faktur.nomor_faktur);
  const ada = fakturLain.some(
    (lain) =>
      lain.penjual !== null &&
      lain.nomor_faktur !== null &&
      ratakan(lain.penjual) === penjual &&
      ratakan(lain.nomor_faktur) === nomor,
  );
  if (!ada) return null;

  return {
    kode: "duplikat",
    kolom: ["nomor_faktur"],
    pesan: `Faktur ${faktur.nomor_faktur} dari ${faktur.penjual} sudah pernah masuk.`,
  };
}

export function gagalSkema(galat: string): Alasan {
  return {
    kode: "gagal_skema",
    kolom: [],
    pesan: `AI tidak menghasilkan data yang bisa dipakai (${galat}). Isi kolomnya secara manual.`,
  };
}

export function periksaFaktur(faktur: Faktur, konteks: Konteks): Alasan[] {
  return [
    kolomWajib(faktur),
    jumlahBaris(faktur),
    totalCocok(faktur),
    tanggalWajar(faktur, konteks.hariIni),
    duplikat(faktur, konteks.fakturLain),
  ].filter((alasan): alasan is Alasan => alasan !== null);
}
