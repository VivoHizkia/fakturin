import { z } from "zod";

// Bentuk data yang harus dihasilkan AI untuk satu faktur. Semua nominal dalam satuan mata
// uang penuh (rupiah, bukan ribuan). Kolom yang tidak tertulis di faktur diisi null, tidak
// boleh ditebak.

const teksAtauNull = z
  .string()
  .trim()
  .transform((nilai) => (nilai === "" ? null : nilai))
  .nullable();

const angkaAtauNull = z.number().finite().nonnegative().nullable();

export const SkemaBaris = z.object({
  nama: z.string().trim().min(1),
  jumlah: z.number().finite().positive(),
  harga_satuan: z.number().finite().nonnegative(),
  total_baris: z.number().finite().nonnegative(),
});

export const SkemaFaktur = z.object({
  penjual: teksAtauNull,
  nomor_faktur: teksAtauNull,
  // Selalu YYYY-MM-DD, apa pun format yang tertulis di faktur.
  tanggal: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  mata_uang: z.string().trim().toUpperCase().length(3).default("IDR"),
  subtotal: angkaAtauNull,
  pajak: angkaAtauNull,
  total: angkaAtauNull,
  baris: z.array(SkemaBaris).default([]),
});

export type BarisBarang = z.infer<typeof SkemaBaris>;
export type Faktur = z.infer<typeof SkemaFaktur>;

export const FAKTUR_KOSONG: Faktur = {
  penjual: null,
  nomor_faktur: null,
  tanggal: null,
  mata_uang: "IDR",
  subtotal: null,
  pajak: null,
  total: null,
  baris: [],
};
