import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Dokumen, DokumenBaru, Gudang, Hasil, Koreksi } from "./tipe";

// Gudang berbasis berkas: satu db.json dan satu folder berkas. Cukup untuk pengembangan dan
// demo satu pengguna, tanpa akun atau layanan apa pun. Tidak cocok untuk hosting tanpa disk
// tetap (misalnya Vercel); untuk itu pakai skema di supabase/migrations.

type Isi = { dokumen: Dokumen[]; hasil: Hasil[]; koreksi: Koreksi[] };

const ISI_KOSONG: Isi = { dokumen: [], hasil: [], koreksi: [] };

// Dokumen yang "diproses" lebih lama dari ini dianggap tertinggal (proses mati di tengah
// jalan) dan boleh diambil lagi.
const BATAS_MACET_MS = 2 * 60 * 1000;

const EKSTENSI: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class GudangLokal implements Gudang {
  // Semua baca-ubah-tulis lewat antrean ini, satu per satu, supaya dua permintaan yang datang
  // bersamaan tidak saling menimpa db.json.
  private antrean: Promise<unknown> = Promise.resolve();

  constructor(private readonly folder: string) {}

  private get berkasDb() {
    return path.join(this.folder, "db.json");
  }

  private pathBerkas(dokumen: Pick<Dokumen, "id" | "jenis">) {
    return path.join(this.folder, "berkas", `${dokumen.id}.${EKSTENSI[dokumen.jenis] ?? "bin"}`);
  }

  private async baca(): Promise<Isi> {
    try {
      return { ...ISI_KOSONG, ...(JSON.parse(await readFile(this.berkasDb, "utf8")) as Isi) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(ISI_KOSONG);
      throw err;
    }
  }

  // Tulis ke berkas sementara lalu ganti nama: db.json tidak pernah setengah tertulis.
  private async tulis(isi: Isi): Promise<void> {
    await mkdir(this.folder, { recursive: true });
    const sementara = `${this.berkasDb}.${randomUUID()}.tmp`;
    await writeFile(sementara, JSON.stringify(isi, null, 2));
    await rename(sementara, this.berkasDb);
  }

  private bergiliran<T>(kerja: () => Promise<T>): Promise<T> {
    const hasil = this.antrean.then(kerja, kerja);
    this.antrean = hasil.catch(() => {});
    return hasil;
  }

  private ubah<T>(kerja: (isi: Isi) => T): Promise<T> {
    return this.bergiliran(async () => {
      const isi = await this.baca();
      const hasil = kerja(isi);
      await this.tulis(isi);
      return hasil;
    });
  }

  private lihat<T>(kerja: (isi: Isi) => T): Promise<T> {
    return this.bergiliran(async () => kerja(await this.baca()));
  }

  async buatDokumen(data: DokumenBaru, sekarang = new Date()): Promise<Dokumen> {
    const dokumen: Dokumen = {
      id: randomUUID(),
      nama_berkas: data.nama_berkas,
      jenis: data.jenis,
      ukuran: data.isi.byteLength,
      status: "antre",
      dibuat_pada: sekarang.toISOString(),
      diproses_pada: null,
      diputuskan_pada: null,
      lolos_otomatis: false,
      galat: null,
    };

    const tujuan = this.pathBerkas(dokumen);
    await mkdir(path.dirname(tujuan), { recursive: true });
    await writeFile(tujuan, data.isi);

    await this.ubah((isi) => void isi.dokumen.push(dokumen));
    return dokumen;
  }

  daftarDokumen(): Promise<Dokumen[]> {
    return this.lihat((isi) =>
      [...isi.dokumen].sort((a, b) => b.dibuat_pada.localeCompare(a.dibuat_pada)),
    );
  }

  ambilDokumen(id: string): Promise<Dokumen | null> {
    return this.lihat((isi) => isi.dokumen.find((dokumen) => dokumen.id === id) ?? null);
  }

  ubahDokumen(id: string, perubahan: Partial<Omit<Dokumen, "id">>): Promise<Dokumen> {
    return this.ubah((isi) => {
      const dokumen = isi.dokumen.find((calon) => calon.id === id);
      if (!dokumen) throw new Error(`Dokumen ${id} tidak ditemukan`);
      Object.assign(dokumen, perubahan);
      return { ...dokumen };
    });
  }

  ambilAntreBerikutnya(sekarang = new Date()): Promise<Dokumen | null> {
    return this.ubah((isi) => {
      const macetSebelum = new Date(sekarang.getTime() - BATAS_MACET_MS).toISOString();
      const calon = isi.dokumen
        .filter(
          (dokumen) =>
            dokumen.status === "antre" ||
            (dokumen.status === "diproses" && (dokumen.diproses_pada ?? "") < macetSebelum),
        )
        .sort((a, b) => a.dibuat_pada.localeCompare(b.dibuat_pada))[0];
      if (!calon) return null;

      calon.status = "diproses";
      calon.diproses_pada = sekarang.toISOString();
      calon.galat = null;
      return { ...calon };
    });
  }

  async bacaBerkas(id: string): Promise<Buffer> {
    const dokumen = await this.ambilDokumen(id);
    if (!dokumen) throw new Error(`Dokumen ${id} tidak ditemukan`);
    return readFile(this.pathBerkas(dokumen));
  }

  simpanHasil(hasil: Hasil): Promise<void> {
    return this.ubah((isi) => {
      isi.hasil = isi.hasil.filter((lama) => lama.dokumen_id !== hasil.dokumen_id);
      isi.hasil.push(hasil);
    });
  }

  ambilHasil(dokumenId: string): Promise<Hasil | null> {
    return this.lihat((isi) => isi.hasil.find((hasil) => hasil.dokumen_id === dokumenId) ?? null);
  }

  daftarHasil(): Promise<Hasil[]> {
    return this.lihat((isi) => isi.hasil);
  }

  catatKoreksi(koreksi: Omit<Koreksi, "id">[]): Promise<void> {
    if (koreksi.length === 0) return Promise.resolve();
    return this.ubah((isi) => {
      isi.koreksi.push(...koreksi.map((satu) => ({ ...satu, id: randomUUID() })));
    });
  }

  daftarKoreksi(dokumenId?: string): Promise<Koreksi[]> {
    return this.lihat((isi) =>
      dokumenId ? isi.koreksi.filter((satu) => satu.dokumen_id === dokumenId) : isi.koreksi,
    );
  }
}
