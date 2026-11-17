import { describe, expect, it } from "vitest";
import { SkemaFaktur } from "@/lib/ekstrak/skema";
import { fakturBaik } from "./bantu";

describe("SkemaFaktur", () => {
  it("menerima faktur lengkap", () => {
    expect(SkemaFaktur.parse(fakturBaik())).toEqual(fakturBaik());
  });

  it("mengisi mata uang IDR dan baris kosong kalau tidak ditulis", () => {
    const hasil = SkemaFaktur.parse({
      penjual: "Warung Bu Sri",
      nomor_faktur: null,
      tanggal: null,
      subtotal: null,
      pajak: null,
      total: 25_000,
    });
    expect(hasil.mata_uang).toBe("IDR");
    expect(hasil.baris).toEqual([]);
  });

  it("menganggap teks kosong sebagai null", () => {
    const hasil = SkemaFaktur.parse(fakturBaik({ penjual: "   ", nomor_faktur: "" }));
    expect(hasil.penjual).toBeNull();
    expect(hasil.nomor_faktur).toBeNull();
  });

  it("menolak tanggal yang bukan YYYY-MM-DD", () => {
    expect(SkemaFaktur.safeParse(fakturBaik({ tanggal: "10/11/2026" })).success).toBe(false);
  });

  it("menolak nominal berupa teks atau negatif", () => {
    expect(SkemaFaktur.safeParse({ ...fakturBaik(), total: "111.000" }).success).toBe(false);
    expect(SkemaFaktur.safeParse(fakturBaik({ total: -1 })).success).toBe(false);
  });

  it("menolak baris tanpa nama atau dengan jumlah nol", () => {
    const baris = { nama: "", jumlah: 1, harga_satuan: 1, total_baris: 1 };
    expect(SkemaFaktur.safeParse(fakturBaik({ baris: [baris] })).success).toBe(false);
    expect(
      SkemaFaktur.safeParse(fakturBaik({ baris: [{ ...baris, nama: "Paku", jumlah: 0 }] })).success,
    ).toBe(false);
  });
});
