import { asalSama, galat } from "@/lib/api";
import { gudang } from "@/lib/gudang";
import { KeputusanError, putuskan, type Tindakan } from "@/lib/periksa/keputusan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Konteks = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Konteks) {
  const { id } = await params;
  const penyimpanan = gudang();

  const dokumen = await penyimpanan.ambilDokumen(id);
  if (!dokumen) return galat("Dokumen tidak ditemukan.", 404);

  const [hasil, koreksi, semua] = await Promise.all([
    penyimpanan.ambilHasil(id),
    penyimpanan.daftarKoreksi(id),
    penyimpanan.daftarDokumen(),
  ]);

  // Antrean periksa dari yang paling lama menunggu, untuk tombol sebelumnya dan berikutnya.
  const antrean = semua
    .filter((satu) => satu.status === "perlu_diperiksa")
    .map((satu) => satu.id)
    .reverse();

  return Response.json({ dokumen, hasil, koreksi, antrean });
}

const TINDAKAN: Tindakan[] = ["simpan", "setujui", "tolak"];

export async function POST(req: Request, { params }: Konteks) {
  if (!asalSama(req)) return galat("Asal permintaan tidak dikenal.", 403);
  const { id } = await params;

  let badan: { tindakan?: string; faktur?: unknown };
  try {
    badan = await req.json();
  } catch {
    return galat("Badan permintaan harus JSON.", 400);
  }

  const penyimpanan = gudang();

  // Dokumen yang gagal dibaca (jaringan, kuota) dikembalikan ke antrean.
  if (badan.tindakan === "ulang") {
    const dokumen = await penyimpanan.ambilDokumen(id);
    if (!dokumen) return galat("Dokumen tidak ditemukan.", 404);
    if (dokumen.status !== "gagal") return galat("Hanya dokumen gagal yang bisa diulang.", 409);
    return Response.json({
      dokumen: await penyimpanan.ubahDokumen(id, { status: "antre", galat: null }),
    });
  }

  if (!TINDAKAN.includes(badan.tindakan as Tindakan)) return galat("Tindakan tidak dikenal.", 400);

  try {
    return Response.json(await putuskan(penyimpanan, id, badan.tindakan as Tindakan, badan.faktur));
  } catch (err) {
    if (err instanceof KeputusanError) return galat(err.message, err.status);
    throw err;
  }
}
