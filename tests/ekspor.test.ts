import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buatCsv, sel } from "@/lib/ekspor/csv";
import { HEADER_TANDA_TANGAN, kirimWebhook, tandaTangan } from "@/lib/ekspor/webhook";
import type { Dokumen, Hasil, Status } from "@/lib/gudang/tipe";
import { fakturBaik } from "./bantu";

const dokumen = (id: string, status: Status, lolos = false): Dokumen => ({
  id,
  nama_berkas: `${id}.png`,
  jenis: "image/png",
  ukuran: 1,
  status,
  dibuat_pada: "2026-11-16T00:00:00Z",
  diproses_pada: null,
  diputuskan_pada: null,
  lolos_otomatis: lolos,
  galat: null,
});

const hasil = (id: string, ubah = {}): Hasil => ({
  dokumen_id: id,
  faktur: fakturBaik(ubah),
  alasan: [],
  json_mentah: "",
});

const barisCsv = (csv: string) => csv.replace("﻿", "").trim().split("\r\n");

describe("sel", () => {
  it("mengutip sel yang berisi koma, kutip, atau baris baru", () => {
    expect(sel("Toko A, B")).toBe('"Toko A, B"');
    expect(sel('Besi 10"')).toBe('"Besi 10"""');
  });

  it("mematikan rumus Excel di teks dari faktur", () => {
    expect(sel('=HYPERLINK("http://jahat")')).toBe('"\'=HYPERLINK(""http://jahat"")"');
    expect(sel("+62812")).toBe("'+62812");
    expect(sel("@nama")).toBe("'@nama");
  });

  it("menulis angka apa adanya dan null sebagai sel kosong", () => {
    expect(sel(111000)).toBe("111000");
    expect(sel(null)).toBe("");
    expect(sel(true)).toBe("ya");
  });
});

describe("buatCsv", () => {
  it("menulis satu baris per barang, hanya untuk dokumen yang disetujui", () => {
    const csv = buatCsv(
      [dokumen("a", "disetujui", true), dokumen("b", "perlu_diperiksa"), dokumen("c", "ditolak")],
      [hasil("a"), hasil("b"), hasil("c")],
    );

    const baris = barisCsv(csv);
    expect(baris).toHaveLength(3);
    expect(baris[0].startsWith("id_dokumen,nama_berkas,penjual")).toBe(true);
    expect(baris[1]).toBe(
      "a,a.png,Toko Sumber Rejeki,INV-001,2026-11-10,IDR,100000,11000,111000,Semen 50 kg,1,60000,60000,ya",
    );
  });

  it("tetap menulis faktur yang tidak punya rincian barang", () => {
    const baris = barisCsv(buatCsv([dokumen("a", "disetujui")], [hasil("a", { baris: [] })]));
    expect(baris).toHaveLength(2);
    expect(baris[1].endsWith("111000,,,,,tidak")).toBe(true);
  });

  it("menyaring menurut tanggal faktur", () => {
    const semua = [dokumen("a", "disetujui"), dokumen("b", "disetujui")];
    const isi = [
      hasil("a", { tanggal: "2026-10-05", baris: [] }),
      hasil("b", { tanggal: "2026-11-05", baris: [] }),
    ];

    expect(barisCsv(buatCsv(semua, isi, { dari: "2026-11-01" }))).toHaveLength(2);
    expect(barisCsv(buatCsv(semua, isi, { sampai: "2026-10-31" }))[1]).toContain("2026-10-05");
    expect(
      barisCsv(buatCsv(semua, isi, { dari: "2026-10-01", sampai: "2026-11-30" })),
    ).toHaveLength(3);
  });

  it("diawali BOM supaya Excel membacanya sebagai UTF-8", () => {
    expect(buatCsv([], []).charCodeAt(0)).toBe(0xfeff);
  });
});

describe("kirimWebhook", () => {
  const opsi = { url: "https://contoh.test/terima", jedaMs: 0 };

  it("menandatangani badan permintaan dengan HMAC SHA-256", async () => {
    const kirim = vi.fn().mockResolvedValue(new Response("ok"));

    await kirimWebhook({ a: 1 }, { ...opsi, kunci: "rahasia", kirim });

    const [, init] = kirim.mock.calls[0];
    const harapan = `sha256=${createHmac("sha256", "rahasia").update('{"a":1}').digest("hex")}`;
    expect(init.headers[HEADER_TANDA_TANGAN]).toBe(harapan);
    expect(tandaTangan('{"a":1}', "rahasia")).toBe(harapan);
  });

  it("tidak mengirim header tanda tangan kalau kunci tidak diisi", async () => {
    const kirim = vi.fn().mockResolvedValue(new Response("ok"));
    await kirimWebhook({}, { ...opsi, kirim });
    expect(kirim.mock.calls[0][1].headers[HEADER_TANDA_TANGAN]).toBeUndefined();
  });

  it("mencoba sampai tiga kali saat penerima bermasalah", async () => {
    const kirim = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockRejectedValueOnce(new Error("koneksi putus"))
      .mockResolvedValueOnce(new Response("ok"));

    expect(await kirimWebhook({}, { ...opsi, kirim })).toEqual({ ok: true, percobaan: 3 });
  });

  it("berhenti setelah tiga kegagalan", async () => {
    const kirim = vi.fn().mockResolvedValue(new Response("", { status: 500 }));

    const hasilKirim = await kirimWebhook({}, { ...opsi, kirim });

    expect(hasilKirim).toMatchObject({ ok: false, percobaan: 3 });
    expect(kirim).toHaveBeenCalledTimes(3);
  });

  it("tidak mengulang permintaan yang ditolak penerima (4xx)", async () => {
    const kirim = vi.fn().mockResolvedValue(new Response("", { status: 401 }));

    expect(await kirimWebhook({}, { ...opsi, kirim })).toMatchObject({ ok: false, percobaan: 1 });
    expect(kirim).toHaveBeenCalledTimes(1);
  });
});
