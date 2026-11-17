import { createHmac } from "node:crypto";
import type { Faktur } from "@/lib/ekstrak/skema";
import type { Dokumen } from "@/lib/gudang/tipe";

// Setiap dokumen yang disetujui dikirim ke WEBHOOK_URL sebagai JSON, supaya bisa disambung ke
// Google Sheets, n8n, atau sistem akuntansi tanpa mengubah aplikasi ini.

const TIMEOUT_MS = 5_000;
const MAKS_PERCOBAAN = 3;
const JEDA_MS = 1_000;

export const HEADER_TANDA_TANGAN = "X-Faktur-Tanda-Tangan";

// Penerima menghitung HMAC yang sama atas badan permintaan untuk memastikan pengirimnya kita.
export function tandaTangan(badan: string, kunci: string): string {
  return `sha256=${createHmac("sha256", kunci).update(badan).digest("hex")}`;
}

export type OpsiWebhook = {
  url: string;
  kunci?: string;
  jedaMs?: number;
  kirim?: typeof fetch;
};

export type HasilWebhook = { ok: boolean; percobaan: number; galat?: string };

export async function kirimWebhook(muatan: unknown, opsi: OpsiWebhook): Promise<HasilWebhook> {
  const badan = JSON.stringify(muatan);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opsi.kunci) headers[HEADER_TANDA_TANGAN] = tandaTangan(badan, opsi.kunci);

  const kirim = opsi.kirim ?? fetch;
  const jeda = opsi.jedaMs ?? JEDA_MS;
  let galat = "";

  for (let percobaan = 1; percobaan <= MAKS_PERCOBAAN; percobaan++) {
    try {
      const res = await kirim(opsi.url, {
        method: "POST",
        headers,
        body: badan,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return { ok: true, percobaan };

      galat = `status ${res.status}`;
      // 4xx berarti permintaannya yang ditolak. Mengulang tidak akan mengubah apa pun.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return { ok: false, percobaan, galat };
      }
    } catch (err) {
      galat = err instanceof Error ? err.message : String(err);
    }
    // Jeda makin panjang: 1x, 2x.
    if (percobaan < MAKS_PERCOBAAN) await new Promise((r) => setTimeout(r, jeda * percobaan));
  }
  return { ok: false, percobaan: MAKS_PERCOBAAN, galat };
}

// Webhook yang rusak tidak boleh menggagalkan persetujuan dokumen, jadi galatnya hanya dicatat.
export async function kirimDisetujui(dokumen: Dokumen, faktur: Faktur): Promise<void> {
  const url = process.env.WEBHOOK_URL;
  if (!url) return;

  const hasil = await kirimWebhook(
    {
      peristiwa: "dokumen.disetujui",
      dokumen: {
        id: dokumen.id,
        nama_berkas: dokumen.nama_berkas,
        lolos_otomatis: dokumen.lolos_otomatis,
        diputuskan_pada: dokumen.diputuskan_pada,
      },
      faktur,
    },
    { url, kunci: process.env.WEBHOOK_SECRET || undefined },
  );
  if (!hasil.ok) console.warn(`Webhook gagal untuk dokumen ${dokumen.id}: ${hasil.galat}`);
}
