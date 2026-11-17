// Mengukur seberapa tepat AI membaca 20 faktur contoh, dan seberapa tepat aturan memilah mana
// yang perlu diperiksa manusia. Hasilnya ditulis ke hasil-eval/hasil.md.
//
// Jalankan: npm run eval            (butuh LLM_API_KEY di .env.local)
//           npm run eval -- 5       (hanya 5 dokumen pertama)

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ekstrakFaktur } from "../src/lib/ekstrak/ekstrak";
import type { Faktur } from "../src/lib/ekstrak/skema";
import { DEFAULT_MODEL } from "../src/lib/llm";
import {
  gagalSkema,
  periksaFaktur,
  type FakturLain,
  type KodeAlasan,
} from "../src/lib/periksa/aturan";
import type { Jawaban } from "./buat-contoh";

const AKAR = path.resolve(import.meta.dirname, "..");
// Tanggal tetap supaya aturan tanggal memberi hasil yang sama kapan pun eval dijalankan.
const HARI_INI = new Date("2026-11-16T00:00:00Z");
// Paket gratis membatasi jumlah permintaan per menit.
const JEDA_MS = 4_500;

const KOLOM = ["penjual", "nomor_faktur", "tanggal", "subtotal", "pajak", "total"] as const;
type Kolom = (typeof KOLOM)[number];

const ratakan = (nilai: unknown) =>
  nilai === null || nilai === undefined
    ? ""
    : String(nilai)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

const sama = (a: unknown, b: unknown) =>
  typeof a === "number" && typeof b === "number"
    ? Math.abs(a - b) < 0.5
    : ratakan(a) === ratakan(b);

// Baris dianggap benar hanya kalau semuanya cocok: jumlah baris, urutan, nama, dan ketiga angka.
function barisSama(hasil: Faktur, benar: Faktur): boolean {
  return (
    hasil.baris.length === benar.baris.length &&
    benar.baris.every((b, i) => {
      const h = hasil.baris[i];
      return (
        sama(h.nama, b.nama) &&
        sama(h.jumlah, b.jumlah) &&
        sama(h.harga_satuan, b.harga_satuan) &&
        sama(h.total_baris, b.total_baris)
      );
    })
  );
}

type Baris = {
  berkas: string;
  catatan: string;
  salah: string[];
  alasanDiharapkan: KodeAlasan[];
  alasanDidapat: KodeAlasan[];
  galat?: string;
};

const persen = (benar: number, dari: number) =>
  dari === 0 ? "-" : `${Math.round((benar / dari) * 100)}% (${benar}/${dari})`;

const daftar = (kode: KodeAlasan[]) => (kode.length === 0 ? "lolos" : kode.join(", "));

async function utama() {
  const batas = Number(process.argv[2]) || Infinity;
  const jawaban = (
    JSON.parse(await readFile(path.join(AKAR, "contoh", "jawaban.json"), "utf8")) as Jawaban[]
  ).slice(0, batas);

  const benarPerKolom = Object.fromEntries(KOLOM.map((kolom) => [kolom, 0])) as Record<
    Kolom,
    number
  >;
  let barisBenar = 0;
  let terbaca = 0;
  const hasil: Baris[] = [];
  const fakturLain: FakturLain[] = [];

  for (const [i, satu] of jawaban.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, JEDA_MS));
    process.stdout.write(`${satu.berkas} ... `);

    const baris: Baris = {
      berkas: satu.berkas,
      catatan: satu.catatan,
      salah: [],
      alasanDiharapkan: satu.alasan,
      alasanDidapat: [],
    };
    hasil.push(baris);

    try {
      const isi = await readFile(path.join(AKAR, "contoh", satu.berkas));
      const jenis = satu.berkas.endsWith(".jpg") ? "image/jpeg" : "image/png";
      const ekstrak = await ekstrakFaktur(`data:${jenis};base64,${isi.toString("base64")}`);

      if (!ekstrak.ok) {
        baris.alasanDidapat = [gagalSkema(ekstrak.galat).kode];
        baris.galat = ekstrak.galat;
        console.log("gagal skema");
        continue;
      }

      terbaca++;
      for (const kolom of KOLOM) {
        if (sama(ekstrak.faktur[kolom], satu.faktur[kolom])) benarPerKolom[kolom]++;
        else
          baris.salah.push(`${kolom}: ${ekstrak.faktur[kolom]} (seharusnya ${satu.faktur[kolom]})`);
      }
      if (barisSama(ekstrak.faktur, satu.faktur)) barisBenar++;
      else baris.salah.push("baris barang");

      baris.alasanDidapat = periksaFaktur(ekstrak.faktur, { hariIni: HARI_INI, fakturLain }).map(
        (alasan) => alasan.kode,
      );
      fakturLain.push({
        penjual: ekstrak.faktur.penjual,
        nomor_faktur: ekstrak.faktur.nomor_faktur,
      });
      console.log(baris.salah.length === 0 ? "benar" : `salah: ${baris.salah.join("; ")}`);
    } catch (err) {
      baris.galat = err instanceof Error ? err.message : String(err);
      console.log(`galat: ${baris.galat}`);
    }
  }

  const n = hasil.length;
  const gagalPanggil = hasil.filter((satu) => satu.galat && satu.alasanDidapat.length === 0).length;
  const seharusnyaLolos = hasil.filter((satu) => satu.alasanDiharapkan.length === 0);
  const seharusnyaDiperiksa = hasil.filter((satu) => satu.alasanDiharapkan.length > 0);
  const lolos = (satu: Baris) => satu.alasanDidapat.length === 0 && !satu.galat;

  // Yang paling berbahaya: dokumen bermasalah yang lolos tanpa dilihat manusia.
  const lolosPadahalSalah = seharusnyaDiperiksa.filter(lolos);
  const tertangkap = seharusnyaDiperiksa.length - lolosPadahalSalah.length;
  const lolosBenar = seharusnyaLolos.filter(lolos).length;
  const isiSalahTapiLolos = hasil.filter((satu) => lolos(satu) && satu.salah.length > 0);

  const model = process.env.LLM_MODEL || DEFAULT_MODEL;
  const teks = `# Hasil eval

Model: \`${model}\`. Dokumen: ${n}. Dijalankan: ${new Date().toISOString().slice(0, 10)}.

Dibuat oleh \`npm run eval\` terhadap gambar di \`contoh/\` dan jawaban di \`contoh/jawaban.json\`.

## Akurasi per kolom

Dihitung dari ${terbaca} dokumen yang jawabannya lolos skema.

| Kolom | Benar |
| --- | --- |
${KOLOM.map((kolom) => `| ${kolom} | ${persen(benarPerKolom[kolom], terbaca)} |`).join("\n")}
| baris barang (semua baris cocok) | ${persen(barisBenar, terbaca)} |

## Pemilahan

| Ukuran | Hasil |
| --- | --- |
| Dokumen bersih yang lolos otomatis | ${persen(lolosBenar, seharusnyaLolos.length)} |
| Dokumen bermasalah yang tertangkap aturan | ${persen(tertangkap, seharusnyaDiperiksa.length)} |
| Dokumen bermasalah yang lolos tanpa diperiksa | ${lolosPadahalSalah.length} |
| Dokumen lolos otomatis padahal ada kolom yang salah baca | ${isiSalahTapiLolos.length} |
| Panggilan AI yang gagal (jaringan atau kuota) | ${gagalPanggil} |

## Per dokumen

| Berkas | Jenis | Salah baca | Seharusnya | Didapat |
| --- | --- | --- | --- | --- |
${hasil
  .map(
    (satu) =>
      `| ${satu.berkas} | ${satu.catatan} | ${
        satu.galat && satu.alasanDidapat.length === 0
          ? `galat: ${satu.galat.slice(0, 80)}`
          : satu.salah.join("; ") || "-"
      } | ${daftar(satu.alasanDiharapkan)} | ${daftar(satu.alasanDidapat)} |`,
  )
  .join("\n")}
`;

  await mkdir(path.join(AKAR, "hasil-eval"), { recursive: true });
  await writeFile(path.join(AKAR, "hasil-eval", "hasil.md"), teks);
  await writeFile(
    path.join(AKAR, "hasil-eval", "hasil.json"),
    `${JSON.stringify({ model, benarPerKolom, barisBenar, terbaca, hasil }, null, 2)}\n`,
  );
  console.log(`\nDitulis ke hasil-eval/hasil.md`);
}

utama().catch((err) => {
  console.error(err);
  process.exit(1);
});
