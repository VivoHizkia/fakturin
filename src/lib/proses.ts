import { ekstrakFaktur } from "@/lib/ekstrak/ekstrak";
import { FAKTUR_KOSONG } from "@/lib/ekstrak/skema";
import { kirimDisetujui } from "@/lib/ekspor/webhook";
import type { Dokumen, Gudang } from "@/lib/gudang/tipe";
import type { LlmCall } from "@/lib/llm";
import { gagalSkema, periksaFaktur, type FakturLain } from "@/lib/periksa/aturan";

// Faktur dari dokumen lain yang masih berlaku, untuk pemeriksaan duplikat. Dokumen yang
// ditolak tidak dihitung: mengunggah ulang faktur yang tadi ditolak bukan duplikat.
export async function fakturLain(gudang: Gudang, kecualiId: string): Promise<FakturLain[]> {
  const [dokumen, hasil] = await Promise.all([gudang.daftarDokumen(), gudang.daftarHasil()]);
  const berlaku = new Set(
    dokumen
      .filter((satu) => satu.status === "disetujui" || satu.status === "perlu_diperiksa")
      .map((satu) => satu.id),
  );
  return hasil
    .filter((satu) => satu.dokumen_id !== kecualiId && berlaku.has(satu.dokumen_id))
    .map((satu) => ({ penjual: satu.faktur.penjual, nomor_faktur: satu.faktur.nomor_faktur }));
}

// Memproses satu dokumen dari antrean. Mengembalikan null kalau antrean kosong. Sengaja satu
// dokumen per pemanggilan supaya muat dalam batas waktu fungsi serverless.
export async function prosesBerikutnya(
  gudang: Gudang,
  llm?: LlmCall,
  sekarang = new Date(),
): Promise<Dokumen | null> {
  const dokumen = await gudang.ambilAntreBerikutnya(sekarang);
  if (!dokumen) return null;

  try {
    const isi = await gudang.bacaBerkas(dokumen.id);
    const dataUrl = `data:${dokumen.jenis};base64,${isi.toString("base64")}`;
    const ekstrak = await ekstrakFaktur(dataUrl, llm);

    if (!ekstrak.ok) {
      await gudang.simpanHasil({
        dokumen_id: dokumen.id,
        faktur: FAKTUR_KOSONG,
        alasan: [gagalSkema(ekstrak.galat)],
        json_mentah: ekstrak.mentah,
      });
      return gudang.ubahDokumen(dokumen.id, { status: "perlu_diperiksa" });
    }

    const alasan = periksaFaktur(ekstrak.faktur, {
      hariIni: sekarang,
      fakturLain: await fakturLain(gudang, dokumen.id),
    });
    await gudang.simpanHasil({
      dokumen_id: dokumen.id,
      faktur: ekstrak.faktur,
      alasan,
      json_mentah: ekstrak.mentah,
    });

    if (alasan.length > 0) return gudang.ubahDokumen(dokumen.id, { status: "perlu_diperiksa" });

    const disetujui = await gudang.ubahDokumen(dokumen.id, {
      status: "disetujui",
      lolos_otomatis: true,
      diputuskan_pada: sekarang.toISOString(),
    });
    await kirimDisetujui(disetujui, ekstrak.faktur);
    return disetujui;
  } catch (err) {
    // Jaringan putus, kunci salah, kuota habis: dokumennya tidak salah, jadi bisa dicoba lagi.
    const galat = err instanceof Error ? err.message : String(err);
    return gudang.ubahDokumen(dokumen.id, { status: "gagal", galat: galat.slice(0, 500) });
  }
}
