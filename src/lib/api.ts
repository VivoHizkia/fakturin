// Bantuan kecil untuk rute API.

export function galat(pesan: string, status: number): Response {
  return Response.json({ galat: pesan }, { status });
}

// Aplikasi ini belum punya login, jadi satu-satunya penjaga permintaan yang mengubah data
// adalah asal permintaannya: formulir di situs lain tidak boleh mengunggah atau menyetujui
// dokumen lewat peramban pengunjung.
export function asalSama(req: Request): boolean {
  const asal = req.headers.get("origin");
  // Tanpa header Origin berarti bukan peramban (curl, skrip, tes).
  if (!asal) return true;
  try {
    return new URL(asal).host === (req.headers.get("host") ?? new URL(req.url).host);
  } catch {
    return false;
  }
}

// Pembatas sederhana di memori supaya satu pengunjung tidak menghabiskan kuota AI. Tiap
// instans serverless punya salinannya sendiri, jadi ini polisi tidur, bukan batas mutlak.
const JENDELA_MS = 60_000;
const waktuPermintaan = new Map<string, number[]>();

export function bolehLewat(kunci: string, batas: number): boolean {
  const sekarang = Date.now();
  const baru = (waktuPermintaan.get(kunci) ?? []).filter((waktu) => sekarang - waktu < JENDELA_MS);

  const boleh = baru.length < batas;
  if (boleh) baru.push(sekarang);
  waktuPermintaan.set(kunci, baru);

  if (waktuPermintaan.size > 5_000) waktuPermintaan.clear();
  return boleh;
}

export function kunciPengunjung(req: Request): string {
  const diteruskan = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return diteruskan || req.headers.get("x-real-ip") || "lokal";
}
