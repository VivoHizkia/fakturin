import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GudangLokal } from "@/lib/gudang/lokal";
import { LlmError } from "@/lib/llm";
import { putuskan } from "@/lib/periksa/keputusan";
import { prosesBerikutnya } from "@/lib/proses";
import { HARI_INI, PNG_KECIL, fakturBaik } from "./bantu";
import { gudangSementara } from "./bantu-gudang";

describe("alur dokumen", () => {
  let gudang: GudangLokal;
  let hapus: () => Promise<void>;

  beforeEach(async () => ({ gudang, hapus } = await gudangSementara()));
  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await hapus();
  });

  const unggah = (nama = "a.png") =>
    gudang.buatDokumen({ nama_berkas: nama, jenis: "image/png", isi: PNG_KECIL }, HARI_INI);
  const aiMenjawab = (faktur: unknown) => vi.fn().mockResolvedValue(JSON.stringify(faktur));

  describe("prosesBerikutnya", () => {
    it("mengembalikan null kalau antrean kosong", async () => {
      expect(await prosesBerikutnya(gudang, aiMenjawab(fakturBaik()), HARI_INI)).toBeNull();
    });

    it("menyetujui otomatis faktur yang lolos semua aturan", async () => {
      await unggah();

      const dokumen = await prosesBerikutnya(gudang, aiMenjawab(fakturBaik()), HARI_INI);

      expect(dokumen).toMatchObject({ status: "disetujui", lolos_otomatis: true });
      expect((await gudang.ambilHasil(dokumen!.id))?.alasan).toEqual([]);
    });

    it("memasukkan faktur bermasalah ke antrean periksa beserta alasannya", async () => {
      await unggah();

      const dokumen = await prosesBerikutnya(
        gudang,
        aiMenjawab(fakturBaik({ total: 500_000 })),
        HARI_INI,
      );

      expect(dokumen).toMatchObject({ status: "perlu_diperiksa", lolos_otomatis: false });
      expect((await gudang.ambilHasil(dokumen!.id))?.alasan[0].kode).toBe("total_tidak_cocok");
    });

    it("menandai faktur kedua dengan penjual dan nomor yang sama sebagai duplikat", async () => {
      await unggah("pertama.png");
      await unggah("kedua.png");
      const llm = aiMenjawab(fakturBaik());

      await prosesBerikutnya(gudang, llm, HARI_INI);
      const kedua = await prosesBerikutnya(gudang, llm, HARI_INI);

      expect(kedua?.status).toBe("perlu_diperiksa");
      expect((await gudang.ambilHasil(kedua!.id))?.alasan[0].kode).toBe("duplikat");
    });

    it("menyerahkan dokumen ke manusia kalau AI dua kali menjawab di luar skema", async () => {
      await unggah();

      const dokumen = await prosesBerikutnya(
        gudang,
        vi.fn().mockResolvedValue("tidak terbaca"),
        HARI_INI,
      );

      expect(dokumen?.status).toBe("perlu_diperiksa");
      const hasil = await gudang.ambilHasil(dokumen!.id);
      expect(hasil?.alasan[0].kode).toBe("gagal_skema");
      expect(hasil?.json_mentah).toBe("tidak terbaca");
    });

    it("menandai gagal saat AI tidak bisa dihubungi, dan bisa dicoba lagi", async () => {
      const awal = await unggah();

      const gagal = await prosesBerikutnya(
        gudang,
        vi.fn().mockRejectedValue(new LlmError("kuota habis")),
        HARI_INI,
      );
      expect(gagal).toMatchObject({ status: "gagal", galat: "kuota habis" });

      await gudang.ubahDokumen(awal.id, { status: "antre" });
      const ulang = await prosesBerikutnya(gudang, aiMenjawab(fakturBaik()), HARI_INI);
      expect(ulang).toMatchObject({ status: "disetujui", galat: null });
    });

    it("mengirim webhook untuk dokumen yang disetujui otomatis", async () => {
      vi.stubEnv("WEBHOOK_URL", "https://contoh.test/terima");
      const kirim = vi.fn().mockResolvedValue(new Response("ok"));
      vi.stubGlobal("fetch", kirim);
      await unggah();

      await prosesBerikutnya(gudang, aiMenjawab(fakturBaik()), HARI_INI);

      expect(kirim).toHaveBeenCalledTimes(1);
      expect(JSON.parse(kirim.mock.calls[0][1].body)).toMatchObject({
        peristiwa: "dokumen.disetujui",
        faktur: { nomor_faktur: "INV-001" },
      });
    });
  });

  describe("putuskan", () => {
    const perluDiperiksa = async () => {
      await unggah();
      const dokumen = await prosesBerikutnya(
        gudang,
        aiMenjawab(fakturBaik({ total: 500_000 })),
        HARI_INI,
      );
      return dokumen!.id;
    };

    it("mencatat kolom yang dibetulkan lalu menyetujui", async () => {
      const id = await perluDiperiksa();

      const { dokumen, hasil } = await putuskan(gudang, id, "setujui", fakturBaik(), HARI_INI);

      expect(dokumen).toMatchObject({ status: "disetujui", lolos_otomatis: false });
      expect(hasil.alasan).toEqual([]);
      expect(await gudang.daftarKoreksi(id)).toMatchObject([
        { kolom: "total", nilai_lama: "500000", nilai_baru: "111000" },
      ]);
    });

    it("menyimpan tanpa menyetujui dan menampilkan masalah yang tersisa", async () => {
      const id = await perluDiperiksa();

      const { dokumen, hasil } = await putuskan(
        gudang,
        id,
        "simpan",
        fakturBaik({ total: 500_000, penjual: "Toko Lain" }),
        HARI_INI,
      );

      expect(dokumen.status).toBe("perlu_diperiksa");
      expect(hasil.alasan.map((satu) => satu.kode)).toEqual(["total_tidak_cocok"]);
      expect((await gudang.daftarKoreksi(id)).map((satu) => satu.kolom)).toEqual(["penjual"]);
    });

    it("mengizinkan manusia menyetujui dokumen yang masih melanggar aturan", async () => {
      const id = await perluDiperiksa();

      const { dokumen } = await putuskan(
        gudang,
        id,
        "setujui",
        fakturBaik({ total: 500_000 }),
        HARI_INI,
      );

      expect(dokumen.status).toBe("disetujui");
      expect(await gudang.daftarKoreksi(id)).toEqual([]);
    });

    it("menolak dokumen tanpa memeriksa isiannya", async () => {
      const id = await perluDiperiksa();
      const { dokumen } = await putuskan(gudang, id, "tolak", null, HARI_INI);
      expect(dokumen.status).toBe("ditolak");
    });

    it("menolak isian yang tidak sesuai skema", async () => {
      const id = await perluDiperiksa();
      await expect(
        putuskan(gudang, id, "setujui", { ...fakturBaik(), total: "banyak" }, HARI_INI),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("menjawab 404 untuk dokumen yang tidak ada dan 409 untuk yang masih antre", async () => {
      await expect(putuskan(gudang, "tidak-ada", "tolak", null)).rejects.toMatchObject({
        status: 404,
      });

      const antre = await unggah();
      await gudang.simpanHasil({
        dokumen_id: antre.id,
        faktur: fakturBaik(),
        alasan: [],
        json_mentah: "",
      });
      await expect(putuskan(gudang, antre.id, "tolak", null)).rejects.toMatchObject({
        status: 409,
      });
    });
  });
});
