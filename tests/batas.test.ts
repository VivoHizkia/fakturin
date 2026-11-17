import { afterEach, describe, expect, it, vi } from "vitest";
import { MAKS_UKURAN, cekBerkas, kenaliJenis, rapikanNama, sisaHariIni } from "@/lib/batas";
import type { Dokumen } from "@/lib/gudang/tipe";
import { buatRingkasan } from "@/lib/ringkasan";
import { PNG_KECIL } from "./bantu";

const dok = (ubah: Partial<Dokumen>): Dokumen => ({
  id: "x",
  nama_berkas: "x.png",
  jenis: "image/png",
  ukuran: 1,
  status: "antre",
  dibuat_pada: "2026-11-16T05:00:00Z",
  diproses_pada: null,
  diputuskan_pada: null,
  lolos_otomatis: false,
  galat: null,
  ...ubah,
});

describe("cekBerkas", () => {
  it("mengenali JPG, PNG, dan WebP dari byte pertamanya", () => {
    expect(kenaliJenis(PNG_KECIL)).toBe("image/png");
    expect(kenaliJenis(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(kenaliJenis(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });

  it("menolak berkas yang bukan gambar walau namanya .png", () => {
    expect(cekBerkas(Buffer.from("<script>alert(1)</script>"))).toMatchObject({ ok: false });
    expect(cekBerkas(Buffer.from("%PDF-1.7"))).toMatchObject({ ok: false });
  });

  it("menolak berkas kosong dan berkas di atas 5 MB", () => {
    expect(cekBerkas(new Uint8Array(0))).toMatchObject({ ok: false });

    const besar = new Uint8Array(MAKS_UKURAN + 1);
    besar.set(PNG_KECIL.subarray(0, 8));
    expect(cekBerkas(besar)).toEqual({ ok: false, pesan: "Berkas lebih dari 5 MB." });
  });
});

describe("sisaHariIni", () => {
  afterEach(() => vi.unstubAllEnvs());
  const sekarang = new Date("2026-11-16T10:00:00Z");

  it("hanya menghitung unggahan hari ini", () => {
    vi.stubEnv("BATAS_UNGGAH_HARIAN", "3");
    const dokumen = [dok({}), dok({}), dok({ dibuat_pada: "2026-11-15T23:00:00Z" })];
    expect(sisaHariIni(dokumen, sekarang)).toBe(1);
  });

  it("tidak pernah negatif dan memakai 30 kalau batas tidak diatur", () => {
    vi.stubEnv("BATAS_UNGGAH_HARIAN", "1");
    expect(sisaHariIni([dok({}), dok({})], sekarang)).toBe(0);

    vi.stubEnv("BATAS_UNGGAH_HARIAN", "bukan angka");
    expect(sisaHariIni([], sekarang)).toBe(30);
  });
});

describe("rapikanNama", () => {
  it("membuang pemisah folder dan karakter kendali", () => {
    expect(rapikanNama("..\\..\\rahasia/faktur\u0000.png")).toBe(".._.._rahasia_faktur.png");
  });

  it("memberi nama pengganti dan memotong nama yang terlalu panjang", () => {
    expect(rapikanNama("  ")).toBe("tanpa-nama");
    expect(rapikanNama("a".repeat(500))).toHaveLength(120);
  });
});

describe("buatRingkasan", () => {
  it("menghitung per status dan persen lolos otomatis", () => {
    const ringkasan = buatRingkasan(
      [
        dok({ status: "disetujui", lolos_otomatis: true }),
        dok({ status: "disetujui", lolos_otomatis: true }),
        dok({ status: "disetujui" }),
        dok({ status: "perlu_diperiksa" }),
        dok({ status: "antre" }),
        dok({ status: "gagal" }),
      ],
      [],
    );

    expect(ringkasan.total).toBe(6);
    expect(ringkasan.perStatus).toMatchObject({ disetujui: 3, perlu_diperiksa: 1, antre: 1 });
    // 2 lolos dari 4 yang sudah dibaca AI; antre dan gagal tidak dihitung.
    expect(ringkasan.persenLolosOtomatis).toBe(50);
  });

  it("mengembalikan null kalau belum ada dokumen yang selesai dibaca", () => {
    expect(buatRingkasan([dok({})], []).persenLolosOtomatis).toBeNull();
  });

  it("mengurutkan kolom dari yang paling sering dikoreksi", () => {
    const koreksi = (kolom: string) => ({
      id: kolom,
      dokumen_id: "x",
      kolom,
      nilai_lama: "",
      nilai_baru: "",
      pada: "",
    });
    const ringkasan = buatRingkasan([], [koreksi("total"), koreksi("tanggal"), koreksi("total")]);
    expect(ringkasan.kolomSeringDikoreksi).toEqual([
      { kolom: "total", jumlah: 2 },
      { kolom: "tanggal", jumlah: 1 },
    ]);
  });
});
