import { callLlm, parseJsonObject, type LlmCall } from "@/lib/llm";
import { pesanPerbaikan, susunPesan } from "./prompt";
import { SkemaFaktur, type Faktur } from "./skema";

export type HasilEkstrak =
  | { ok: true; faktur: Faktur; mentah: string; percobaan: number }
  // AI menjawab, tetapi dua kali tidak sesuai skema. Dokumen tetap bisa diisi manusia.
  | { ok: false; galat: string; mentah: string; percobaan: number };

const MAKS_PERCOBAAN = 2;

function validasi(mentah: string): { ok: true; faktur: Faktur } | { ok: false; galat: string } {
  let objek: unknown;
  try {
    objek = parseJsonObject<unknown>(mentah);
  } catch (err) {
    return { ok: false, galat: err instanceof Error ? err.message : String(err) };
  }

  const hasil = SkemaFaktur.safeParse(objek);
  if (hasil.success) return { ok: true, faktur: hasil.data };

  const galat = hasil.error.issues
    .slice(0, 5)
    .map((isu) => `${isu.path.join(".") || "(akar)"}: ${isu.message}`)
    .join("; ");
  return { ok: false, galat };
}

// Kegagalan jaringan atau kunci (LlmError) sengaja dibiarkan terlempar: itu bukan salah
// dokumennya, jadi pemanggil menandai dokumen "gagal" dan bisa mencobanya lagi nanti.
export async function ekstrakFaktur(
  gambarDataUrl: string,
  llm: LlmCall = callLlm,
): Promise<HasilEkstrak> {
  const pesan = susunPesan(gambarDataUrl);
  let mentah = "";
  let galat = "";

  for (let percobaan = 1; percobaan <= MAKS_PERCOBAAN; percobaan++) {
    mentah = await llm(pesan);
    const hasil = validasi(mentah);
    if (hasil.ok) return { ok: true, faktur: hasil.faktur, mentah, percobaan };

    galat = hasil.galat;
    // Tunjukkan jawaban yang salah dan galatnya supaya percobaan kedua tidak mengulanginya.
    pesan.push(
      { role: "assistant", content: mentah },
      { role: "user", content: pesanPerbaikan(galat) },
    );
  }

  return { ok: false, galat, mentah, percobaan: MAKS_PERCOBAAN };
}
