import { galat } from "@/lib/api";
import { JENIS_DITERIMA } from "@/lib/batas";
import { gudang } from "@/lib/gudang";

export const runtime = "nodejs";

// Gambar asli dokumen, untuk ditampilkan di sebelah formulir periksa.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const penyimpanan = gudang();

  const dokumen = await penyimpanan.ambilDokumen(id);
  if (!dokumen || !JENIS_DITERIMA.includes(dokumen.jenis)) {
    return galat("Berkas tidak ditemukan.", 404);
  }

  const isi = await penyimpanan.bacaBerkas(id);
  return new Response(new Uint8Array(isi), {
    headers: {
      "Content-Type": dokumen.jenis,
      // Berkas unggahan tidak boleh ditafsirkan peramban sebagai jenis lain.
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
