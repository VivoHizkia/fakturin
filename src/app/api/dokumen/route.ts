import { sisaHariIni } from "@/lib/batas";
import { gudang } from "@/lib/gudang";
import { buatRingkasan } from "@/lib/ringkasan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Semua yang dibutuhkan halaman depan dalam satu permintaan.
export async function GET() {
  const penyimpanan = gudang();
  const [dokumen, hasil, koreksi] = await Promise.all([
    penyimpanan.daftarDokumen(),
    penyimpanan.daftarHasil(),
    penyimpanan.daftarKoreksi(),
  ]);
  const hasilPerId = new Map(hasil.map((satu) => [satu.dokumen_id, satu]));

  return Response.json({
    dokumen: dokumen.map((satu) => {
      const milik = hasilPerId.get(satu.id);
      return {
        ...satu,
        penjual: milik?.faktur.penjual ?? null,
        tanggal: milik?.faktur.tanggal ?? null,
        total: milik?.faktur.total ?? null,
        mata_uang: milik?.faktur.mata_uang ?? "IDR",
        jumlah_alasan: milik?.alasan.length ?? 0,
      };
    }),
    ringkasan: buatRingkasan(dokumen, koreksi),
    sisa_unggah: sisaHariIni(dokumen),
  });
}
