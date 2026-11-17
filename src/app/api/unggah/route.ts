import { asalSama, bolehLewat, galat, kunciPengunjung } from "@/lib/api";
import { cekBerkas, rapikanNama, sisaHariIni } from "@/lib/batas";
import { gudang, type Dokumen } from "@/lib/gudang";

export const runtime = "nodejs";

// Menerima satu atau beberapa gambar di kolom "berkas". Berkas hanya disimpan dan diantrekan
// di sini; pembacaan oleh AI terjadi di /api/proses supaya unggahan cepat selesai.
export async function POST(req: Request) {
  if (!asalSama(req)) return galat("Asal permintaan tidak dikenal.", 403);
  if (!bolehLewat(`unggah:${kunciPengunjung(req)}`, 10)) {
    return galat("Terlalu banyak unggahan. Coba lagi sebentar.", 429);
  }

  let formulir: FormData;
  try {
    formulir = await req.formData();
  } catch {
    return galat("Kirim berkas sebagai formulir multipart.", 400);
  }

  const berkas = formulir.getAll("berkas").filter((satu): satu is File => satu instanceof File);
  if (berkas.length === 0) return galat("Tidak ada berkas yang dikirim.", 400);

  const penyimpanan = gudang();
  let sisa = sisaHariIni(await penyimpanan.daftarDokumen());

  const diterima: Dokumen[] = [];
  const ditolak: { nama: string; pesan: string }[] = [];

  for (const satu of berkas) {
    const nama = rapikanNama(satu.name);
    if (sisa <= 0) {
      ditolak.push({ nama, pesan: "Batas unggahan hari ini sudah habis." });
      continue;
    }

    const isi = Buffer.from(await satu.arrayBuffer());
    const cek = cekBerkas(isi);
    if (!cek.ok) {
      ditolak.push({ nama, pesan: cek.pesan });
      continue;
    }

    diterima.push(await penyimpanan.buatDokumen({ nama_berkas: nama, jenis: cek.jenis, isi }));
    sisa--;
  }

  return Response.json({ diterima, ditolak }, { status: diterima.length > 0 ? 201 : 400 });
}
