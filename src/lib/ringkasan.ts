import type { Dokumen, Koreksi, Status } from "@/lib/gudang/tipe";
import { SEMUA_STATUS } from "@/lib/gudang/tipe";

// Angka di halaman depan. Dua yang paling penting: berapa persen dokumen selesai tanpa
// disentuh manusia, dan kolom mana yang paling sering harus dibetulkan.

export type Ringkasan = {
  total: number;
  perStatus: Record<Status, number>;
  // Dari dokumen yang sudah diputuskan. null kalau belum ada satu pun.
  persenLolosOtomatis: number | null;
  kolomSeringDikoreksi: { kolom: string; jumlah: number }[];
};

export function buatRingkasan(dokumen: Dokumen[], koreksi: Koreksi[]): Ringkasan {
  const perStatus = Object.fromEntries(SEMUA_STATUS.map((status) => [status, 0])) as Record<
    Status,
    number
  >;
  for (const satu of dokumen) perStatus[satu.status]++;

  // Dokumen yang masih menunggu diperiksa ikut dihitung sebagai "tidak lolos otomatis":
  // kalau tidak, angkanya tampak bagus justru saat antrean periksa menumpuk.
  const selesaiDibaca = dokumen.filter((satu) =>
    ["disetujui", "ditolak", "perlu_diperiksa"].includes(satu.status),
  );
  const lolos = selesaiDibaca.filter((satu) => satu.lolos_otomatis).length;

  const jumlahPerKolom = new Map<string, number>();
  for (const satu of koreksi) {
    jumlahPerKolom.set(satu.kolom, (jumlahPerKolom.get(satu.kolom) ?? 0) + 1);
  }

  return {
    total: dokumen.length,
    perStatus,
    persenLolosOtomatis:
      selesaiDibaca.length === 0 ? null : Math.round((lolos / selesaiDibaca.length) * 100),
    kolomSeringDikoreksi: [...jumlahPerKolom]
      .map(([kolom, jumlah]) => ({ kolom, jumlah }))
      .sort((a, b) => b.jumlah - a.jumlah || a.kolom.localeCompare(b.kolom))
      .slice(0, 5),
  };
}
