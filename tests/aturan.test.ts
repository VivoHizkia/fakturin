import { describe, expect, it } from "vitest";
import {
  duplikat,
  jumlahBaris,
  kolomWajib,
  periksaFaktur,
  tanggalWajar,
  totalCocok,
} from "@/lib/periksa/aturan";
import { HARI_INI, fakturBaik } from "./bantu";

describe("kolomWajib", () => {
  it("lolos kalau penjual, tanggal, dan total terisi", () => {
    expect(kolomWajib(fakturBaik())).toBeNull();
  });

  it("menyebut semua kolom wajib yang kosong", () => {
    const alasan = kolomWajib(fakturBaik({ penjual: null, total: null }));
    expect(alasan?.kolom).toEqual(["penjual", "total"]);
  });

  it("tidak mewajibkan nomor faktur, karena struk warung sering tidak punya", () => {
    expect(kolomWajib(fakturBaik({ nomor_faktur: null }))).toBeNull();
  });
});

describe("jumlahBaris", () => {
  it("lolos kalau jumlah baris sama dengan subtotal", () => {
    expect(jumlahBaris(fakturBaik())).toBeNull();
  });

  it("menandai selisih di atas Rp1", () => {
    const alasan = jumlahBaris(fakturBaik({ subtotal: 95_000 }));
    expect(alasan?.kode).toBe("jumlah_baris_tidak_cocok");
    expect(alasan?.kolom).toContain("subtotal");
  });

  it("menerima selisih pembulatan Rp1", () => {
    expect(jumlahBaris(fakturBaik({ subtotal: 100_001 }))).toBeNull();
  });

  it("memakai total dikurangi pajak kalau subtotal tidak tertulis", () => {
    expect(jumlahBaris(fakturBaik({ subtotal: null }))).toBeNull();
    expect(jumlahBaris(fakturBaik({ subtotal: null, pajak: null, total: 100_000 }))).toBeNull();
    expect(jumlahBaris(fakturBaik({ subtotal: null, total: 150_000 }))?.kolom).toContain("total");
  });

  it("tidak memeriksa faktur tanpa rincian barang", () => {
    expect(jumlahBaris(fakturBaik({ baris: [], subtotal: 5 }))).toBeNull();
  });
});

describe("totalCocok", () => {
  it("lolos kalau subtotal ditambah pajak sama dengan total", () => {
    expect(totalCocok(fakturBaik())).toBeNull();
  });

  it("menandai total yang tidak cocok", () => {
    expect(totalCocok(fakturBaik({ total: 120_000 }))?.kode).toBe("total_tidak_cocok");
  });

  it("menganggap pajak kosong sebagai nol", () => {
    expect(totalCocok(fakturBaik({ pajak: null, total: 100_000 }))).toBeNull();
  });

  it("tidak memeriksa kalau subtotal atau total kosong", () => {
    expect(totalCocok(fakturBaik({ subtotal: null }))).toBeNull();
    expect(totalCocok(fakturBaik({ total: null }))).toBeNull();
  });
});

describe("tanggalWajar", () => {
  it("lolos untuk tanggal hari ini dan kemarin", () => {
    expect(tanggalWajar(fakturBaik({ tanggal: "2026-11-16" }), HARI_INI)).toBeNull();
    expect(tanggalWajar(fakturBaik({ tanggal: "2026-11-15" }), HARI_INI)).toBeNull();
  });

  it("menandai tanggal di masa depan", () => {
    expect(tanggalWajar(fakturBaik({ tanggal: "2026-12-01" }), HARI_INI)?.pesan).toContain(
      "masa depan",
    );
  });

  it("menandai tanggal lebih dari 2 tahun lalu", () => {
    expect(tanggalWajar(fakturBaik({ tanggal: "2024-11-01" }), HARI_INI)?.pesan).toContain(
      "2 tahun",
    );
    expect(tanggalWajar(fakturBaik({ tanggal: "2024-11-17" }), HARI_INI)).toBeNull();
  });

  it("menandai tanggal yang tidak ada di kalender", () => {
    expect(tanggalWajar(fakturBaik({ tanggal: "2026-02-31" }), HARI_INI)?.pesan).toContain(
      "kalender",
    );
  });

  it("melewati tanggal kosong, yang sudah ditangani kolomWajib", () => {
    expect(tanggalWajar(fakturBaik({ tanggal: null }), HARI_INI)).toBeNull();
  });
});

describe("duplikat", () => {
  const lama = [{ penjual: "PT. Maju Jaya", nomor_faktur: "INV/2026/001" }];

  it("menandai penjual dan nomor yang sama walau beda penulisan", () => {
    const faktur = fakturBaik({ penjual: "pt maju  jaya", nomor_faktur: "inv-2026-001" });
    expect(duplikat(faktur, lama)?.kode).toBe("duplikat");
  });

  it("tidak menandai nomor yang sama dari penjual lain", () => {
    const faktur = fakturBaik({ penjual: "CV Lain", nomor_faktur: "INV/2026/001" });
    expect(duplikat(faktur, lama)).toBeNull();
  });

  it("tidak menandai faktur tanpa nomor", () => {
    const faktur = fakturBaik({ penjual: "PT. Maju Jaya", nomor_faktur: null });
    expect(duplikat(faktur, [{ penjual: "PT. Maju Jaya", nomor_faktur: null }])).toBeNull();
  });
});

describe("periksaFaktur", () => {
  const konteks = { hariIni: HARI_INI, fakturLain: [] };

  it("tidak punya alasan untuk faktur yang baik", () => {
    expect(periksaFaktur(fakturBaik(), konteks)).toEqual([]);
  });

  it("mengumpulkan semua aturan yang dilanggar", () => {
    const alasan = periksaFaktur(fakturBaik({ penjual: null, total: 999 }), konteks);
    expect(alasan.map((satu) => satu.kode)).toEqual(["kolom_wajib_kosong", "total_tidak_cocok"]);
  });
});
