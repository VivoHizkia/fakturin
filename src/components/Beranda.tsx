"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { LABEL_KOLOM, LABEL_STATUS, tanggal, uang } from "@/lib/format";
import type { Dokumen, Status } from "@/lib/gudang/tipe";
import type { Ringkasan } from "@/lib/ringkasan";

type DokumenRingkas = Dokumen & {
  penjual: string | null;
  tanggal: string | null;
  total: number | null;
  mata_uang: string;
  jumlah_alasan: number;
};

type Data = { dokumen: DokumenRingkas[]; ringkasan: Ringkasan; sisa_unggah: number };

type Saring = "semua" | Status;

const SARINGAN: Saring[] = ["semua", "perlu_diperiksa", "disetujui", "ditolak", "gagal"];

export function Beranda() {
  const [data, setData] = useState<Data | null>(null);
  const [saring, setSaring] = useState<Saring>("semua");
  const [pesan, setPesan] = useState<string[]>([]);
  const [mengunggah, setMengunggah] = useState(false);
  const [diSeret, setDiSeret] = useState(false);
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const sedangMemproses = useRef(false);
  const pilihBerkas = useRef<HTMLInputElement>(null);

  const muat = useCallback(async () => {
    const res = await fetch("/api/dokumen", { cache: "no-store" });
    if (!res.ok) throw new Error("Gagal memuat daftar dokumen.");
    const baru = (await res.json()) as Data;
    setData(baru);
    return baru;
  }, []);

  // Memanggil /api/proses berulang sampai antrean kosong. Satu putaran saja yang boleh jalan.
  const prosesAntrean = useCallback(async () => {
    if (sedangMemproses.current) return;
    sedangMemproses.current = true;
    try {
      for (;;) {
        const res = await fetch("/api/proses", { method: "POST" });
        if (!res.ok) {
          const badan = (await res.json().catch(() => null)) as { galat?: string } | null;
          setPesan([badan?.galat ?? "Pemrosesan terhenti. Muat ulang halaman untuk melanjutkan."]);
          break;
        }
        const { dokumen, sisa } = (await res.json()) as { dokumen: Dokumen | null; sisa: number };
        await muat();
        if (!dokumen || sisa === 0) break;
      }
    } finally {
      sedangMemproses.current = false;
    }
  }, [muat]);

  useEffect(() => {
    muat()
      .then((awal) => {
        // Antrean yang tertinggal dari kunjungan sebelumnya dilanjutkan.
        if (awal.dokumen.some((satu) => satu.status === "antre")) void prosesAntrean();
      })
      .catch((err: Error) => setPesan([err.message]));
  }, [muat, prosesAntrean]);

  const unggah = useCallback(
    async (berkas: File[]) => {
      if (berkas.length === 0) return;
      setMengunggah(true);
      setPesan([]);
      try {
        const formulir = new FormData();
        for (const satu of berkas) formulir.append("berkas", satu);

        const res = await fetch("/api/unggah", { method: "POST", body: formulir });
        const badan = (await res.json()) as {
          galat?: string;
          ditolak?: { nama: string; pesan: string }[];
        };
        setPesan([
          ...(badan.galat ? [badan.galat] : []),
          ...(badan.ditolak ?? []).map((satu) => `${satu.nama}: ${satu.pesan}`),
        ]);
        await muat();
        void prosesAntrean();
      } catch {
        setPesan(["Unggahan gagal. Periksa koneksi lalu coba lagi."]);
      } finally {
        setMengunggah(false);
      }
    },
    [muat, prosesAntrean],
  );

  const jatuh = (peristiwa: DragEvent) => {
    peristiwa.preventDefault();
    setDiSeret(false);
    void unggah([...peristiwa.dataTransfer.files]);
  };

  const ulang = async (id: string) => {
    await fetch(`/api/dokumen/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tindakan: "ulang" }),
    });
    await muat();
    void prosesAntrean();
  };

  if (!data) {
    return <p className="redup">{pesan[0] ?? "Memuat dokumen..."}</p>;
  }

  const { ringkasan } = data;
  const menunggu = ringkasan.perStatus.antre + ringkasan.perStatus.diproses;
  const tampil = data.dokumen.filter((satu) => saring === "semua" || satu.status === saring);
  const pertamaDiperiksa = [...data.dokumen]
    .reverse()
    .find((satu) => satu.status === "perlu_diperiksa");

  const paramEkspor = new URLSearchParams();
  if (dari) paramEkspor.set("dari", dari);
  if (sampai) paramEkspor.set("sampai", sampai);

  return (
    <>
      <section className="angka" aria-label="Ringkasan">
        <div className="angka-kotak">
          <span className="angka-nilai">{ringkasan.total}</span>
          <span className="angka-label">Dokumen masuk</span>
        </div>
        <div className="angka-kotak">
          <span className="angka-nilai">
            {ringkasan.persenLolosOtomatis === null ? "-" : `${ringkasan.persenLolosOtomatis}%`}
          </span>
          <span className="angka-label">Selesai tanpa disentuh manusia</span>
        </div>
        <div className="angka-kotak">
          <span className="angka-nilai">{ringkasan.perStatus.perlu_diperiksa}</span>
          <span className="angka-label">Menunggu diperiksa</span>
          {pertamaDiperiksa && (
            <Link
              className="tombol tombol-utama tombol-kecil"
              href={`/dokumen/${pertamaDiperiksa.id}`}
            >
              Mulai periksa
            </Link>
          )}
        </div>
        <div className="angka-kotak">
          <span className="angka-label">Paling sering dibetulkan</span>
          {ringkasan.kolomSeringDikoreksi.length === 0 ? (
            <span className="redup">Belum ada koreksi.</span>
          ) : (
            <ol className="angka-daftar">
              {ringkasan.kolomSeringDikoreksi.slice(0, 3).map((satu) => (
                <li key={satu.kolom}>
                  {LABEL_KOLOM[satu.kolom] ?? satu.kolom}{" "}
                  <span className="redup">{satu.jumlah}x</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section
        className={`jatuhkan${diSeret ? " jatuhkan-aktif" : ""}`}
        onDragOver={(peristiwa) => {
          peristiwa.preventDefault();
          setDiSeret(true);
        }}
        onDragLeave={() => setDiSeret(false)}
        onDrop={jatuh}
      >
        <input
          ref={pilihBerkas}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(peristiwa) => {
            void unggah([...(peristiwa.target.files ?? [])]);
            peristiwa.target.value = "";
          }}
        />
        <p className="jatuhkan-judul">Seret foto faktur ke sini</p>
        <p className="redup">
          JPG, PNG, atau WebP, paling besar 5 MB. Sisa unggahan hari ini: {data.sisa_unggah}.
        </p>
        <button
          className="tombol tombol-utama"
          disabled={mengunggah || data.sisa_unggah === 0}
          onClick={() => pilihBerkas.current?.click()}
        >
          {mengunggah ? "Mengunggah..." : "Pilih berkas"}
        </button>
        <p className="jatuhkan-ingat">
          Jangan unggah faktur berisi data pribadi orang lain. Gambar dikirim ke layanan AI untuk
          dibaca.
        </p>
      </section>

      {pesan.length > 0 && (
        <ul className="peringatan" role="alert">
          {pesan.map((satu) => (
            <li key={satu}>{satu}</li>
          ))}
        </ul>
      )}

      {menunggu > 0 && (
        <p className="berjalan" role="status">
          <span className="putar" aria-hidden="true" /> AI sedang membaca {menunggu} dokumen...
        </p>
      )}

      <section className="daftar">
        <div className="daftar-alat">
          <div className="saring" role="tablist" aria-label="Saring menurut status">
            {SARINGAN.map((satu) => (
              <button
                key={satu}
                role="tab"
                aria-selected={saring === satu}
                className={`saring-tombol${saring === satu ? " saring-aktif" : ""}`}
                onClick={() => setSaring(satu)}
              >
                {satu === "semua" ? "Semua" : LABEL_STATUS[satu]}
                <span className="saring-jumlah">
                  {satu === "semua" ? ringkasan.total : ringkasan.perStatus[satu]}
                </span>
              </button>
            ))}
          </div>

          <div className="ekspor">
            <label>
              Dari
              <input
                type="date"
                name="dari"
                value={dari}
                onChange={(e) => setDari(e.target.value)}
              />
            </label>
            <label>
              Sampai
              <input
                type="date"
                name="sampai"
                value={sampai}
                onChange={(e) => setSampai(e.target.value)}
              />
            </label>
            <a className="tombol" href={`/api/ekspor?${paramEkspor}`} download>
              Unduh CSV
            </a>
          </div>
        </div>

        {tampil.length === 0 ? (
          <p className="kosong">
            {data.dokumen.length === 0
              ? "Belum ada dokumen. Unggah faktur pertama Anda di atas."
              : "Tidak ada dokumen dengan status ini."}
          </p>
        ) : (
          <div className="tabel-bungkus">
            <table className="tabel">
              <thead>
                <tr>
                  <th>Berkas</th>
                  <th>Penjual</th>
                  <th>Tanggal</th>
                  <th className="kanan">Total</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tampil.map((satu) => (
                  <tr key={satu.id}>
                    <td className="potong" title={satu.nama_berkas}>
                      {satu.nama_berkas}
                    </td>
                    <td className="potong">{satu.penjual ?? <span className="redup">-</span>}</td>
                    <td>{tanggal(satu.tanggal)}</td>
                    <td className="kanan angka-rata">{uang(satu.total, satu.mata_uang)}</td>
                    <td>
                      <span className={`lencana lencana-${satu.status}`}>
                        {LABEL_STATUS[satu.status]}
                      </span>
                      {satu.status === "disetujui" && satu.lolos_otomatis && (
                        <span className="redup kecil"> otomatis</span>
                      )}
                      {satu.status === "perlu_diperiksa" && satu.jumlah_alasan > 0 && (
                        <span className="redup kecil"> {satu.jumlah_alasan} masalah</span>
                      )}
                      {satu.status === "gagal" && satu.galat && (
                        <span className="redup kecil potong galat-teks" title={satu.galat}>
                          {satu.galat}
                        </span>
                      )}
                    </td>
                    <td className="kanan">
                      {satu.status === "gagal" ? (
                        <button className="tombol tombol-kecil" onClick={() => void ulang(satu.id)}>
                          Coba lagi
                        </button>
                      ) : satu.status === "antre" || satu.status === "diproses" ? null : (
                        <Link className="tombol tombol-kecil" href={`/dokumen/${satu.id}`}>
                          {satu.status === "perlu_diperiksa" ? "Periksa" : "Lihat"}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
