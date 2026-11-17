import { asalSama, bolehLewat, galat, kunciPengunjung } from "@/lib/api";
import { gudang } from "@/lib/gudang";
import { prosesBerikutnya } from "@/lib/proses";

export const runtime = "nodejs";
// Satu dokumen per pemanggilan, dengan dua percobaan AI paling lama 40 detik masing-masing.
export const maxDuration = 60;

// Memproses satu dokumen dari antrean. Halaman depan memanggilnya berulang sampai "sisa" nol;
// penjadwal (cron) bisa memanggil rute yang sama sebagai jaring pengaman.
export async function POST(req: Request) {
  if (!asalSama(req)) return galat("Asal permintaan tidak dikenal.", 403);
  if (!bolehLewat(`proses:${kunciPengunjung(req)}`, 40)) {
    return galat("Terlalu banyak permintaan. Coba lagi sebentar.", 429);
  }

  const penyimpanan = gudang();
  const dokumen = await prosesBerikutnya(penyimpanan);
  const sisa = (await penyimpanan.daftarDokumen()).filter((satu) => satu.status === "antre").length;

  return Response.json({ dokumen, sisa });
}
