import { galat } from "@/lib/api";
import { buatCsv } from "@/lib/ekspor/csv";
import { gudang } from "@/lib/gudang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

// CSV dokumen yang disetujui. ?dari=YYYY-MM-DD&sampai=YYYY-MM-DD menyaring tanggal faktur.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dari = searchParams.get("dari") || undefined;
  const sampai = searchParams.get("sampai") || undefined;
  if ([dari, sampai].some((nilai) => nilai && !POLA_TANGGAL.test(nilai))) {
    return galat("Tanggal harus berformat YYYY-MM-DD.", 400);
  }

  const penyimpanan = gudang();
  const [dokumen, hasil] = await Promise.all([
    penyimpanan.daftarDokumen(),
    penyimpanan.daftarHasil(),
  ]);

  return new Response(buatCsv(dokumen, hasil, { dari, sampai }), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="faktur-disetujui.csv"`,
    },
  });
}
