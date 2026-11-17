import { SkemaFaktur, type Faktur } from "@/lib/ekstrak/skema";
import { kirimDisetujui } from "@/lib/ekspor/webhook";
import type { Dokumen, Gudang, Hasil, Koreksi } from "@/lib/gudang/tipe";
import { fakturLain } from "@/lib/proses";
import { periksaFaktur } from "./aturan";

// Yang terjadi saat manusia menyimpan, menyetujui, atau menolak satu dokumen di halaman periksa.

export type Tindakan = "simpan" | "setujui" | "tolak";

export class KeputusanError extends Error {
  constructor(
    pesan: string,
    readonly status: number,
  ) {
    super(pesan);
  }
}

const KOLOM_KEPALA = [
  "penjual",
  "nomor_faktur",
  "tanggal",
  "mata_uang",
  "subtotal",
  "pajak",
  "total",
] as const;

const teks = (nilai: unknown) => (nilai === null || nilai === undefined ? "" : String(nilai));

// Satu catatan per kolom yang berubah. Baris barang dicatat sebagai satu kolom "baris".
export function bedaFaktur(
  lama: Faktur,
  baru: Faktur,
): Pick<Koreksi, "kolom" | "nilai_lama" | "nilai_baru">[] {
  const beda = KOLOM_KEPALA.filter((kolom) => teks(lama[kolom]) !== teks(baru[kolom])).map(
    (kolom) => ({
      kolom: kolom as string,
      nilai_lama: teks(lama[kolom]),
      nilai_baru: teks(baru[kolom]),
    }),
  );

  const barisLama = JSON.stringify(lama.baris);
  const barisBaru = JSON.stringify(baru.baris);
  if (barisLama !== barisBaru)
    beda.push({ kolom: "baris", nilai_lama: barisLama, nilai_baru: barisBaru });

  return beda;
}

export async function putuskan(
  gudang: Gudang,
  dokumenId: string,
  tindakan: Tindakan,
  fakturMasuk: unknown,
  sekarang = new Date(),
): Promise<{ dokumen: Dokumen; hasil: Hasil }> {
  const dokumen = await gudang.ambilDokumen(dokumenId);
  const hasilLama = await gudang.ambilHasil(dokumenId);
  if (!dokumen || !hasilLama) throw new KeputusanError("Dokumen tidak ditemukan.", 404);
  if (dokumen.status === "antre" || dokumen.status === "diproses") {
    throw new KeputusanError("Dokumen masih diproses.", 409);
  }

  if (tindakan === "tolak") {
    const ditolak = await gudang.ubahDokumen(dokumenId, {
      status: "ditolak",
      lolos_otomatis: false,
      diputuskan_pada: sekarang.toISOString(),
    });
    return { dokumen: ditolak, hasil: hasilLama };
  }

  const diurai = SkemaFaktur.safeParse(fakturMasuk);
  if (!diurai.success) {
    const isu = diurai.error.issues[0];
    throw new KeputusanError(`Isian tidak valid di ${isu.path.join(".")}: ${isu.message}`, 400);
  }
  const faktur = diurai.data;

  const pada = sekarang.toISOString();
  await gudang.catatKoreksi(
    bedaFaktur(hasilLama.faktur, faktur).map((beda) => ({ ...beda, dokumen_id: dokumenId, pada })),
  );

  // Aturan dijalankan lagi supaya layar menampilkan masalah yang masih tersisa. Manusia tetap
  // boleh menyetujui dokumen yang masih bermasalah: dialah pemeriksa terakhir.
  const hasil: Hasil = {
    ...hasilLama,
    faktur,
    alasan: periksaFaktur(faktur, {
      hariIni: sekarang,
      fakturLain: await fakturLain(gudang, dokumenId),
    }),
  };
  await gudang.simpanHasil(hasil);

  if (tindakan === "simpan") {
    const disimpan = await gudang.ubahDokumen(dokumenId, {
      // Dokumen yang sudah diputuskan lalu disunting lagi kembali ke antrean periksa.
      status: "perlu_diperiksa",
      lolos_otomatis: false,
      diputuskan_pada: null,
    });
    return { dokumen: disimpan, hasil };
  }

  const disetujui = await gudang.ubahDokumen(dokumenId, {
    status: "disetujui",
    lolos_otomatis: false,
    diputuskan_pada: pada,
  });
  await kirimDisetujui(disetujui, faktur);
  return { dokumen: disetujui, hasil };
}
