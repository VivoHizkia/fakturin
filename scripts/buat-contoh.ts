// Membuat 20 gambar faktur contoh di contoh/ beserta jawaban benarnya di contoh/jawaban.json.
// Semua penjual, alamat, dan nomor di sini karangan: tidak ada data orang atau usaha sungguhan.
//
// Jawaban berisi apa yang TERTULIS di gambar, termasuk kesalahan yang sengaja dibuat (total
// salah jumlah, tanggal hilang...). Dari situlah eval tahu dokumen mana yang seharusnya masuk
// antrean periksa.
//
// Jalankan: npm run contoh

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Faktur } from "../src/lib/ekstrak/skema";
import type { KodeAlasan } from "../src/lib/periksa/aturan";

type Gaya = "faktur" | "struk" | "nota";
type Efek = "miring" | "buram" | "pudar" | "kecil" | "jpeg";
type Cacat = "total_salah" | "baris_salah" | "tanpa_tanggal" | "tanggal_lama";
type FormatTanggal = "garis-miring" | "panjang" | "strip";

type Barang = [nama: string, jumlah: number, hargaSatuan: number];

type Definisi = {
  gaya: Gaya;
  penjual: string;
  alamat: string;
  nomor: string | null;
  tanggal: string;
  formatTanggal: FormatTanggal;
  barang: Barang[];
  efek?: Efek[];
  cacat?: Cacat;
};

export type Jawaban = {
  berkas: string;
  catatan: string;
  faktur: Faktur;
  // Aturan yang seharusnya terpicu. Kosong berarti dokumen seharusnya lolos otomatis.
  alasan: KodeAlasan[];
};

const PPN = 0.11;

const DEFINISI: Definisi[] = [
  {
    gaya: "faktur",
    penjual: "PT Sinar Baja Nusantara",
    alamat: "Jl. Industri Raya No. 14, Bekasi",
    nomor: "INV/2026/10/0182",
    tanggal: "2026-10-06",
    formatTanggal: "panjang",
    barang: [
      ["Besi beton 10 mm", 40, 78_500],
      ["Kawat bendrat 1 kg", 12, 24_000],
      ["Wiremesh M8", 6, 695_000],
    ],
  },
  {
    gaya: "faktur",
    penjual: "CV Maju Bersama Teknik",
    alamat: "Jl. Gatot Subroto 88, Medan",
    nomor: "MBT-00417",
    tanggal: "2026-10-19",
    formatTanggal: "garis-miring",
    barang: [
      ["Jasa servis genset 20 kVA", 1, 2_750_000],
      ["Oli mesin 5 liter", 2, 415_000],
      ["Filter solar", 2, 135_000],
    ],
    efek: ["miring"],
  },
  {
    gaya: "faktur",
    penjual: "PT Arunika Data Solusi",
    alamat: "Gedung Wira Lt. 7, Jakarta Selatan",
    nomor: "ADS-2026-1109",
    tanggal: "2026-11-03",
    formatTanggal: "strip",
    barang: [
      ["Langganan server awan (November)", 1, 4_200_000],
      ["Dukungan teknis 5 jam", 5, 350_000],
    ],
  },
  {
    gaya: "struk",
    penjual: "Toko Bangunan Sumber Rejeki",
    alamat: "Jl. Pasar Lama 3, Binjai",
    nomor: "TRX-558120",
    tanggal: "2026-11-08",
    formatTanggal: "garis-miring",
    barang: [
      ["Semen 50 kg", 5, 68_000],
      ["Pasir 1 karung", 10, 17_500],
      ["Kuas 3 inci", 2, 22_000],
      ["Cat tembok 5 kg", 1, 147_000],
    ],
  },
  {
    gaya: "struk",
    penjual: "Minimarket Segar Jaya",
    alamat: "Jl. Kenanga 21, Deli Serdang",
    nomor: "0091-2211-447",
    tanggal: "2026-11-11",
    formatTanggal: "strip",
    barang: [
      ["Air mineral 600 ml", 12, 3_500],
      ["Kopi sachet isi 10", 3, 14_900],
      ["Gula pasir 1 kg", 2, 18_200],
      ["Tisu 250 lembar", 4, 11_750],
      ["Sabun cuci piring", 1, 16_400],
    ],
    efek: ["kecil"],
  },
  {
    gaya: "nota",
    penjual: "Bengkel Las Pak Darto",
    alamat: "Jl. Veteran Gg. Mawar, Tebing Tinggi",
    nomor: "0342",
    tanggal: "2026-10-27",
    formatTanggal: "garis-miring",
    barang: [
      ["Las pagar besi", 1, 850_000],
      ["Cat anti karat", 2, 65_000],
    ],
  },
  {
    gaya: "nota",
    penjual: "Warung Makan Bu Lastri",
    alamat: "Jl. Cempaka 5, Pematangsiantar",
    nomor: null,
    tanggal: "2026-11-12",
    formatTanggal: "strip",
    barang: [
      ["Nasi kotak ayam", 25, 28_000],
      ["Es teh manis", 25, 5_000],
      ["Kerupuk", 5, 8_000],
    ],
  },
  {
    gaya: "faktur",
    penjual: "UD Tani Makmur Sejahtera",
    alamat: "Jl. Lintas Sumatera Km 12, Kisaran",
    nomor: "TMS/XI/2026/031",
    tanggal: "2026-11-02",
    formatTanggal: "panjang",
    barang: [
      ["Pupuk NPK 50 kg", 20, 412_000],
      ["Benih jagung 5 kg", 8, 385_000],
      ["Herbisida 1 liter", 15, 96_500],
      ["Sprayer manual 16 liter", 3, 325_000],
    ],
    efek: ["buram"],
  },
  {
    gaya: "struk",
    penjual: "Apotek Sehat Sentosa",
    alamat: "Jl. Diponegoro 47, Medan",
    nomor: "AP-7731906",
    tanggal: "2026-10-30",
    formatTanggal: "garis-miring",
    barang: [
      ["Vitamin C 500 mg", 2, 38_500],
      ["Masker medis isi 50", 1, 45_000],
      ["Plester luka", 3, 9_800],
    ],
    efek: ["pudar"],
  },
  {
    gaya: "faktur",
    penjual: "PT Cahaya Grafika Mandiri",
    alamat: "Jl. Percetakan 9, Bandung",
    nomor: "CGM-INV-2204",
    tanggal: "2026-09-22",
    formatTanggal: "strip",
    barang: [
      ["Cetak brosur A4 2 sisi", 2000, 1_150],
      ["Spanduk 3 x 1 m", 4, 185_000],
      ["Kartu nama 1 kotak", 6, 55_000],
    ],
    efek: ["jpeg"],
  },
  {
    gaya: "struk",
    penjual: "Kedai Kopi Tepi Sawah",
    alamat: "Jl. Bunga Raya 2, Stabat",
    nomor: null,
    tanggal: "2026-11-14",
    formatTanggal: "garis-miring",
    barang: [
      ["Kopi susu gula aren", 3, 22_000],
      ["Roti bakar cokelat", 2, 18_000],
    ],
    efek: ["miring", "jpeg"],
  },
  {
    gaya: "nota",
    penjual: "Toko Listrik Terang Abadi",
    alamat: "Jl. Sutomo 112, Medan",
    nomor: "1187",
    tanggal: "2026-10-15",
    formatTanggal: "garis-miring",
    barang: [
      ["Kabel NYM 2x1,5 (50 m)", 2, 465_000],
      ["Saklar tunggal", 10, 14_500],
      ["Lampu LED 12 watt", 8, 27_000],
      ["MCB 10 A", 3, 52_000],
    ],
    efek: ["miring"],
  },
  {
    gaya: "faktur",
    penjual: "CV Karya Mebel Jepara Indah",
    alamat: "Jl. Raya Tahunan 60, Jepara",
    nomor: "KMJ/26/0915",
    tanggal: "2026-09-30",
    formatTanggal: "garis-miring",
    barang: [
      ["Meja kerja jati 140 cm", 4, 2_350_000],
      ["Kursi kantor", 8, 875_000],
    ],
    efek: ["pudar", "kecil"],
  },
  {
    gaya: "struk",
    penjual: "SPBU Mitra Perjalanan",
    alamat: "Jl. Lintas Timur Km 4, Lubuk Pakam",
    nomor: "SP-20261105-0093",
    tanggal: "2026-11-05",
    formatTanggal: "strip",
    barang: [["Solar industri (liter)", 120, 13_900]],
  },
  {
    gaya: "faktur",
    penjual: "PT Lintas Kargo Persada",
    alamat: "Jl. Pelabuhan Baru 7, Belawan",
    nomor: "LKP-88412",
    tanggal: "2026-10-09",
    formatTanggal: "panjang",
    barang: [
      ["Pengiriman Medan - Jakarta 320 kg", 320, 6_500],
      ["Asuransi barang", 1, 185_000],
      ["Biaya bongkar muat", 1, 250_000],
    ],
    efek: ["buram", "miring"],
  },

  // Lima dokumen berikut sengaja dibuat bermasalah.
  {
    gaya: "faktur",
    penjual: "PT Tirta Pipa Persada",
    alamat: "Jl. Gajah Mada 30, Semarang",
    nomor: "TPP-2026-0778",
    tanggal: "2026-10-21",
    formatTanggal: "strip",
    barang: [
      ["Pipa PVC 4 inci", 30, 142_000],
      ["Sambungan L 4 inci", 24, 31_500],
      ["Lem pipa 400 g", 6, 48_000],
    ],
    cacat: "total_salah",
  },
  {
    gaya: "struk",
    penjual: "Toko Alat Tulis Pelangi",
    alamat: "Jl. Pendidikan 18, Tanjung Morawa",
    nomor: "ATK-339201",
    tanggal: "2026-11-07",
    formatTanggal: "garis-miring",
    barang: [
      ["Kertas HVS A4 1 rim", 10, 52_000],
      ["Pulpen hitam 1 lusin", 4, 28_500],
      ["Map plastik", 20, 3_750],
    ],
    cacat: "baris_salah",
  },
  {
    gaya: "nota",
    penjual: "Jasa Angkut Mandala",
    alamat: "Jl. Mandala By Pass 41, Medan",
    nomor: "0876",
    tanggal: "2026-11-01",
    formatTanggal: "garis-miring",
    barang: [
      ["Sewa truk engkel 1 hari", 1, 950_000],
      ["Upah kenek", 2, 150_000],
    ],
    cacat: "tanpa_tanggal",
  },
  {
    gaya: "faktur",
    penjual: "CV Bina Karya Elektrindo",
    alamat: "Jl. Asia 205, Medan",
    nomor: "BKE/V/2023/114",
    tanggal: "2023-05-12",
    formatTanggal: "panjang",
    barang: [
      ["Panel listrik 3 fasa", 1, 8_400_000],
      ["Jasa pemasangan", 1, 1_500_000],
    ],
    cacat: "tanggal_lama",
  },
  // Faktur yang sama dengan nomor 3, difoto ulang dalam keadaan miring dan buram.
  {
    gaya: "faktur",
    penjual: "PT Arunika Data Solusi",
    alamat: "Gedung Wira Lt. 7, Jakarta Selatan",
    nomor: "ADS-2026-1109",
    tanggal: "2026-11-03",
    formatTanggal: "strip",
    barang: [
      ["Langganan server awan (November)", 1, 4_200_000],
      ["Dukungan teknis 5 jam", 5, 350_000],
    ],
    efek: ["miring", "buram"],
  },
];

// ---------------------------------------------------------------------------------------------
// Dari definisi ke isi faktur

const BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function tulisTanggal(iso: string, format: FormatTanggal): string {
  const [tahun, bulan, hari] = iso.split("-");
  if (format === "garis-miring") return `${hari}/${bulan}/${tahun}`;
  if (format === "strip") return `${hari}-${bulan}-${tahun}`;
  return `${Number(hari)} ${BULAN[Number(bulan) - 1]} ${tahun}`;
}

const angka = (nilai: number) => Math.round(nilai).toLocaleString("id-ID");
const rp = (nilai: number) => `Rp ${angka(nilai)}`;

function susunFaktur(def: Definisi): { faktur: Faktur; alasan: KodeAlasan[] } {
  const baris = def.barang.map(([nama, jumlah, harga_satuan]) => ({
    nama,
    jumlah,
    harga_satuan,
    total_baris: jumlah * harga_satuan,
  }));
  const jumlah = baris.reduce((total, satu) => total + satu.total_baris, 0);

  // Hanya gaya "faktur" yang menulis subtotal dan PPN. Struk dan nota cuma menulis total.
  const pakaiPajak = def.gaya === "faktur";
  const pajak = pakaiPajak ? Math.round(jumlah * PPN) : null;
  const faktur: Faktur = {
    penjual: def.penjual,
    nomor_faktur: def.nomor,
    tanggal: def.tanggal,
    mata_uang: "IDR",
    subtotal: pakaiPajak ? jumlah : null,
    pajak,
    total: jumlah + (pajak ?? 0),
    baris,
  };

  const alasan: KodeAlasan[] = [];
  if (def.cacat === "total_salah") {
    faktur.total = faktur.total! + 150_000;
    alasan.push("total_tidak_cocok");
  }
  if (def.cacat === "baris_salah") {
    baris[0].total_baris += 40_000;
    alasan.push("jumlah_baris_tidak_cocok");
  }
  if (def.cacat === "tanpa_tanggal") {
    faktur.tanggal = null;
    alasan.push("kolom_wajib_kosong");
  }
  if (def.cacat === "tanggal_lama") alasan.push("tanggal_tidak_wajar");

  return { faktur, alasan };
}

// ---------------------------------------------------------------------------------------------
// Dari isi faktur ke SVG

const xml = (teks: string) =>
  teks.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Teks = {
  x: number;
  y: number;
  isi: string;
  ukuran?: number;
  tebal?: boolean;
  rata?: "end" | "middle";
};

function svg(lebar: number, tinggi: number, huruf: string, latar: string, isi: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lebar}" height="${tinggi}" viewBox="0 0 ${lebar} ${tinggi}">
<rect width="100%" height="100%" fill="${latar}"/>
<g font-family="${huruf}" fill="#1b1b1f">${isi.join("\n")}</g>
</svg>`;
}

const t = ({ x, y, isi, ukuran = 18, tebal, rata }: Teks) =>
  `<text x="${x}" y="${y}" font-size="${ukuran}"${tebal ? ' font-weight="700"' : ""}${
    rata ? ` text-anchor="${rata}"` : ""
  }>${xml(isi)}</text>`;

const garis = (x1: number, y: number, x2: number, warna = "#1b1b1f", putus = false) =>
  `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${warna}" stroke-width="1.5"${
    putus ? ' stroke-dasharray="6 5"' : ""
  }/>`;

function gambarFaktur(def: Definisi, faktur: Faktur): string {
  const L = 1000;
  const isi: string[] = [];
  isi.push(t({ x: 60, y: 90, isi: def.penjual, ukuran: 30, tebal: true }));
  isi.push(t({ x: 60, y: 122, isi: def.alamat, ukuran: 17 }));
  isi.push(t({ x: L - 60, y: 90, isi: "FAKTUR", ukuran: 34, tebal: true, rata: "end" }));
  isi.push(garis(60, 150, L - 60));

  isi.push(t({ x: 60, y: 192, isi: `No. Faktur : ${faktur.nomor_faktur}` }));
  if (faktur.tanggal) {
    isi.push(
      t({ x: 60, y: 222, isi: `Tanggal    : ${tulisTanggal(def.tanggal, def.formatTanggal)}` }),
    );
  }
  isi.push(t({ x: L - 60, y: 192, isi: "Kepada: Bagian Pembelian", rata: "end" }));

  let y = 290;
  isi.push(`<rect x="60" y="${y - 28}" width="${L - 120}" height="40" fill="#e9e6df"/>`);
  isi.push(t({ x: 72, y, isi: "Uraian", tebal: true }));
  isi.push(t({ x: 590, y, isi: "Jml", tebal: true, rata: "end" }));
  isi.push(t({ x: 760, y, isi: "Harga satuan", tebal: true, rata: "end" }));
  isi.push(t({ x: L - 72, y, isi: "Jumlah", tebal: true, rata: "end" }));

  for (const baris of faktur.baris) {
    y += 44;
    isi.push(t({ x: 72, y, isi: baris.nama }));
    isi.push(t({ x: 590, y, isi: angka(baris.jumlah), rata: "end" }));
    isi.push(t({ x: 760, y, isi: angka(baris.harga_satuan), rata: "end" }));
    isi.push(t({ x: L - 72, y, isi: angka(baris.total_baris), rata: "end" }));
    isi.push(garis(60, y + 14, L - 60, "#cfcbc2"));
  }

  y += 70;
  isi.push(t({ x: 760, y, isi: "Subtotal", rata: "end" }));
  isi.push(t({ x: L - 72, y, isi: rp(faktur.subtotal!), rata: "end" }));
  y += 36;
  isi.push(t({ x: 760, y, isi: "PPN 11%", rata: "end" }));
  isi.push(t({ x: L - 72, y, isi: rp(faktur.pajak!), rata: "end" }));
  y += 20;
  isi.push(garis(560, y, L - 60));
  y += 36;
  isi.push(t({ x: 760, y, isi: "TOTAL", ukuran: 22, tebal: true, rata: "end" }));
  isi.push(t({ x: L - 72, y, isi: rp(faktur.total!), ukuran: 22, tebal: true, rata: "end" }));

  y += 90;
  isi.push(
    t({ x: 60, y, isi: "Pembayaran paling lambat 14 hari setelah tanggal faktur.", ukuran: 15 }),
  );
  return svg(L, y + 60, "Arial, Helvetica, sans-serif", "#fdfcf9", isi);
}

function gambarStruk(def: Definisi, faktur: Faktur): string {
  const L = 520;
  const isi: string[] = [];
  let y = 60;
  isi.push(
    t({ x: L / 2, y, isi: def.penjual.toUpperCase(), ukuran: 21, tebal: true, rata: "middle" }),
  );
  y += 28;
  isi.push(t({ x: L / 2, y, isi: def.alamat, ukuran: 15, rata: "middle" }));
  y += 24;
  isi.push(garis(30, y, L - 30, "#1b1b1f", true));
  y += 32;
  if (faktur.nomor_faktur) {
    isi.push(t({ x: 30, y, isi: `No: ${faktur.nomor_faktur}`, ukuran: 16 }));
    y += 26;
  }
  isi.push(
    t({ x: 30, y, isi: `Tgl: ${tulisTanggal(def.tanggal, def.formatTanggal)}`, ukuran: 16 }),
  );
  y += 22;
  isi.push(garis(30, y, L - 30, "#1b1b1f", true));

  for (const baris of faktur.baris) {
    y += 34;
    isi.push(t({ x: 30, y, isi: baris.nama, ukuran: 17 }));
    y += 24;
    isi.push(
      t({ x: 50, y, isi: `${angka(baris.jumlah)} x ${angka(baris.harga_satuan)}`, ukuran: 16 }),
    );
    isi.push(t({ x: L - 30, y, isi: angka(baris.total_baris), ukuran: 17, rata: "end" }));
  }

  y += 26;
  isi.push(garis(30, y, L - 30, "#1b1b1f", true));
  y += 38;
  isi.push(t({ x: 30, y, isi: "TOTAL", ukuran: 22, tebal: true }));
  isi.push(t({ x: L - 30, y, isi: rp(faktur.total!), ukuran: 22, tebal: true, rata: "end" }));
  y += 30;
  isi.push(t({ x: 30, y, isi: "Tunai", ukuran: 16 }));
  isi.push(t({ x: L - 30, y, isi: rp(faktur.total!), ukuran: 16, rata: "end" }));
  y += 50;
  isi.push(t({ x: L / 2, y, isi: "Terima kasih atas kunjungan Anda", ukuran: 15, rata: "middle" }));
  return svg(L, y + 50, "'Courier New', Courier, monospace", "#f7f6f2", isi);
}

// Nota tulis tangan: kop tercetak, isinya huruf tangan di atas kertas bergaris.
function gambarNota(def: Definisi, faktur: Faktur): string {
  const L = 760;
  const tangan = "'Segoe Print', 'Ink Free', 'Comic Sans MS', cursive";
  const tulis = (teks: Teks) =>
    t(teks).replace("<text ", `<text font-family="${tangan}" fill="#1f3a8a" `);
  const isi: string[] = [];

  isi.push(t({ x: 40, y: 62, isi: def.penjual, ukuran: 27, tebal: true }));
  isi.push(t({ x: 40, y: 90, isi: def.alamat, ukuran: 15 }));
  isi.push(t({ x: L - 40, y: 62, isi: "NOTA", ukuran: 27, tebal: true, rata: "end" }));
  if (faktur.nomor_faktur) {
    isi.push(t({ x: L - 150, y: 92, isi: "No.", ukuran: 16 }));
    isi.push(tulis({ x: L - 40, y: 94, isi: faktur.nomor_faktur, ukuran: 21, rata: "end" }));
  }
  isi.push(t({ x: 40, y: 136, isi: "Tanggal:", ukuran: 16 }));
  if (faktur.tanggal) {
    isi.push(
      tulis({ x: 120, y: 138, isi: tulisTanggal(def.tanggal, def.formatTanggal), ukuran: 21 }),
    );
  }
  isi.push(garis(40, 156, L - 40));

  let y = 190;
  isi.push(t({ x: 40, y, isi: "Banyak", ukuran: 15, tebal: true }));
  isi.push(t({ x: 130, y, isi: "Nama barang", ukuran: 15, tebal: true }));
  isi.push(t({ x: 560, y, isi: "Harga", ukuran: 15, tebal: true, rata: "end" }));
  isi.push(t({ x: L - 40, y, isi: "Jumlah", ukuran: 15, tebal: true, rata: "end" }));
  isi.push(garis(40, y + 12, L - 40));

  // Selalu ada beberapa garis kosong di bawah, seperti buku nota sungguhan.
  const jumlahGaris = Math.max(faktur.baris.length + 2, 6);
  for (let i = 0; i < jumlahGaris; i++) {
    y += 46;
    const baris = faktur.baris[i];
    if (baris) {
      isi.push(tulis({ x: 52, y, isi: angka(baris.jumlah), ukuran: 21 }));
      isi.push(tulis({ x: 130, y, isi: baris.nama, ukuran: 21 }));
      isi.push(tulis({ x: 560, y, isi: angka(baris.harga_satuan), ukuran: 21, rata: "end" }));
      isi.push(tulis({ x: L - 40, y, isi: angka(baris.total_baris), ukuran: 21, rata: "end" }));
    }
    isi.push(garis(40, y + 12, L - 40, "#9db0d6"));
  }

  y += 60;
  isi.push(t({ x: 560, y, isi: "Jumlah Rp", ukuran: 18, tebal: true, rata: "end" }));
  isi.push(
    tulis({ x: L - 40, y, isi: angka(faktur.total!), ukuran: 25, tebal: true, rata: "end" }),
  );
  y += 60;
  isi.push(t({ x: 40, y, isi: "Barang yang sudah dibeli tidak dapat dikembalikan.", ukuran: 14 }));
  return svg(L, y + 40, "Arial, Helvetica, sans-serif", "#fbf8ee", isi);
}

// ---------------------------------------------------------------------------------------------
// Dari SVG ke berkas gambar, dengan gangguan seperti foto ponsel

const MEJA = "#b9b3a6";

async function jadikanGambar(
  svgTeks: string,
  efek: Efek[],
): Promise<{ isi: Buffer; ekstensi: string }> {
  let gambar = sharp(Buffer.from(svgTeks), { density: 110 }).extend({
    top: 40,
    bottom: 40,
    left: 40,
    right: 40,
    background: MEJA,
  });
  // Setiap efek dipanggang dulu menjadi PNG supaya urutannya pasti.
  const panggang = async () => sharp(await gambar.png().toBuffer());

  if (efek.includes("miring")) {
    gambar = (await panggang()).rotate(3.5, { background: MEJA });
  }
  if (efek.includes("kecil")) {
    const { width } = await (await panggang()).metadata();
    gambar = (await panggang()).resize({ width: Math.round((width ?? 800) * 0.6) });
  }
  if (efek.includes("buram")) gambar = (await panggang()).blur(1.3);
  if (efek.includes("pudar")) gambar = (await panggang()).linear(0.55, 95);

  if (efek.includes("jpeg"))
    return { isi: await gambar.jpeg({ quality: 38 }).toBuffer(), ekstensi: "jpg" };
  return { isi: await gambar.png({ compressionLevel: 9 }).toBuffer(), ekstensi: "png" };
}

const GAMBAR: Record<Gaya, (def: Definisi, faktur: Faktur) => string> = {
  faktur: gambarFaktur,
  struk: gambarStruk,
  nota: gambarNota,
};

async function utama() {
  const folder = path.resolve(import.meta.dirname, "..", "contoh");
  await mkdir(folder, { recursive: true });

  const sudahAda = new Set<string>();
  const jawaban: Jawaban[] = [];

  for (const [i, def] of DEFINISI.entries()) {
    const { faktur, alasan } = susunFaktur(def);

    // Faktur dengan penjual dan nomor yang sudah muncul sebelumnya adalah duplikat.
    const kunci = `${def.penjual}|${def.nomor}`;
    if (def.nomor && sudahAda.has(kunci)) alasan.push("duplikat");
    sudahAda.add(kunci);

    const efek = def.efek ?? [];
    const { isi, ekstensi } = await jadikanGambar(GAMBAR[def.gaya](def, faktur), efek);
    const berkas = `faktur-${String(i + 1).padStart(2, "0")}.${ekstensi}`;
    await writeFile(path.join(folder, berkas), isi);

    const catatan = [def.gaya, ...efek, ...(def.cacat ? [`cacat: ${def.cacat}`] : [])].join(", ");
    jawaban.push({ berkas, catatan, faktur, alasan });
    console.log(`${berkas}  ${catatan}`);
  }

  await writeFile(path.join(folder, "jawaban.json"), `${JSON.stringify(jawaban, null, 2)}\n`);
  console.log(`\n${jawaban.length} gambar dan jawaban.json ditulis ke ${folder}`);
}

utama().catch((err) => {
  console.error(err);
  process.exit(1);
});
