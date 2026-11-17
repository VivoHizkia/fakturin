import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GudangLokal } from "@/lib/gudang/lokal";
import { PNG_KECIL, fakturBaik } from "./bantu";
import { gudangSementara } from "./bantu-gudang";

describe("GudangLokal", () => {
  let gudang: GudangLokal;
  let hapus: () => Promise<void>;

  beforeEach(async () => ({ gudang, hapus } = await gudangSementara()));
  afterEach(() => hapus());

  const unggah = (nama: string, waktu: string) =>
    gudang.buatDokumen({ nama_berkas: nama, jenis: "image/png", isi: PNG_KECIL }, new Date(waktu));

  it("menyimpan dokumen berstatus antre beserta berkasnya", async () => {
    const dokumen = await unggah("a.png", "2026-11-16T01:00:00Z");

    expect(dokumen).toMatchObject({ status: "antre", ukuran: PNG_KECIL.byteLength });
    expect(await gudang.bacaBerkas(dokumen.id)).toEqual(PNG_KECIL);
  });

  it("mengurutkan daftar dari yang terbaru", async () => {
    await unggah("lama.png", "2026-11-16T01:00:00Z");
    await unggah("baru.png", "2026-11-16T02:00:00Z");

    expect((await gudang.daftarDokumen()).map((satu) => satu.nama_berkas)).toEqual([
      "baru.png",
      "lama.png",
    ]);
  });

  it("mengambil dokumen antre tertua dan menandainya diproses", async () => {
    const lama = await unggah("lama.png", "2026-11-16T01:00:00Z");
    await unggah("baru.png", "2026-11-16T02:00:00Z");

    const diambil = await gudang.ambilAntreBerikutnya(new Date("2026-11-16T03:00:00Z"));

    expect(diambil).toMatchObject({ id: lama.id, status: "diproses" });
  });

  it("tidak memberikan dokumen yang sama kepada dua pemanggil bersamaan", async () => {
    await unggah("a.png", "2026-11-16T01:00:00Z");
    await unggah("b.png", "2026-11-16T02:00:00Z");

    const sekarang = new Date("2026-11-16T03:00:00Z");
    const diambil = await Promise.all([
      gudang.ambilAntreBerikutnya(sekarang),
      gudang.ambilAntreBerikutnya(sekarang),
      gudang.ambilAntreBerikutnya(sekarang),
    ]);

    const id = diambil.filter((satu) => satu !== null).map((satu) => satu.id);
    expect(id).toHaveLength(2);
    expect(new Set(id).size).toBe(2);
  });

  it("mengambil lagi dokumen yang macet di status diproses lebih dari 2 menit", async () => {
    const dokumen = await unggah("a.png", "2026-11-16T01:00:00Z");
    await gudang.ambilAntreBerikutnya(new Date("2026-11-16T03:00:00Z"));

    expect(await gudang.ambilAntreBerikutnya(new Date("2026-11-16T03:01:00Z"))).toBeNull();
    expect(await gudang.ambilAntreBerikutnya(new Date("2026-11-16T03:03:00Z"))).toMatchObject({
      id: dokumen.id,
    });
  });

  it("mengganti hasil lama saat hasil baru disimpan untuk dokumen yang sama", async () => {
    const dokumen = await unggah("a.png", "2026-11-16T01:00:00Z");
    const hasil = { dokumen_id: dokumen.id, faktur: fakturBaik(), alasan: [], json_mentah: "{}" };

    await gudang.simpanHasil(hasil);
    await gudang.simpanHasil({ ...hasil, faktur: fakturBaik({ total: 5 }) });

    expect(await gudang.daftarHasil()).toHaveLength(1);
    expect((await gudang.ambilHasil(dokumen.id))?.faktur.total).toBe(5);
  });

  it("tidak kehilangan tulisan saat banyak perubahan datang bersamaan", async () => {
    await Promise.all(
      Array.from({ length: 15 }, (_, i) => unggah(`${i}.png`, "2026-11-16T01:00:00Z")),
    );
    expect(await gudang.daftarDokumen()).toHaveLength(15);
  });

  it("menyaring koreksi per dokumen", async () => {
    const koreksi = { kolom: "total", nilai_lama: "1", nilai_baru: "2", pada: "2026-11-16" };
    await gudang.catatKoreksi([
      { ...koreksi, dokumen_id: "a" },
      { ...koreksi, dokumen_id: "b" },
    ]);

    expect(await gudang.daftarKoreksi()).toHaveLength(2);
    expect(await gudang.daftarKoreksi("a")).toHaveLength(1);
  });
});
