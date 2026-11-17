"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Faktur } from "@/lib/ekstrak/skema";
import { LABEL_KOLOM, LABEL_STATUS, uang } from "@/lib/format";
import type { Dokumen, Hasil, Koreksi } from "@/lib/gudang/tipe";

type Data = { dokumen: Dokumen; hasil: Hasil | null; koreksi: Koreksi[]; antrean: string[] };
type Tindakan = "simpan" | "setujui" | "tolak";

// Isian formulir disimpan sebagai teks supaya kolom angka boleh kosong selagi diketik.
type BarisIsian = { nama: string; jumlah: string; harga_satuan: string; total_baris: string };
type Isian = {
  penjual: string;
  nomor_faktur: string;
  tanggal: string;
  mata_uang: string;
  subtotal: string;
  pajak: string;
  total: string;
  baris: BarisIsian[];
};

const teks = (nilai: string | number | null) => (nilai === null ? "" : String(nilai));
const angkaAtauNull = (nilai: string) => (nilai.trim() === "" ? null : Number(nilai));

function keIsian(faktur: Faktur): Isian {
  return {
    penjual: teks(faktur.penjual),
    nomor_faktur: teks(faktur.nomor_faktur),
    tanggal: teks(faktur.tanggal),
    mata_uang: faktur.mata_uang,
    subtotal: teks(faktur.subtotal),
    pajak: teks(faktur.pajak),
    total: teks(faktur.total),
    baris: faktur.baris.map((baris) => ({
      nama: baris.nama,
      jumlah: String(baris.jumlah),
      harga_satuan: String(baris.harga_satuan),
      total_baris: String(baris.total_baris),
    })),
  };
}

// Bentuk yang dikirim ke server. Server memvalidasinya lagi dengan skema yang sama dengan AI.
function keFaktur(isian: Isian) {
  return {
    penjual: isian.penjual || null,
    nomor_faktur: isian.nomor_faktur || null,
    tanggal: isian.tanggal || null,
    mata_uang: isian.mata_uang || "IDR",
    subtotal: angkaAtauNull(isian.subtotal),
    pajak: angkaAtauNull(isian.pajak),
    total: angkaAtauNull(isian.total),
    baris: isian.baris.map((baris) => ({
      nama: baris.nama,
      jumlah: Number(baris.jumlah),
      harga_satuan: Number(baris.harga_satuan),
      total_baris: Number(baris.total_baris),
    })),
  };
}

const sedangMengetik = (target: EventTarget | null) =>
  target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);

export function Periksa({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [isian, setIsian] = useState<Isian | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [mengirim, setMengirim] = useState(false);
  const [tersimpan, setTersimpan] = useState(false);

  useEffect(() => {
    fetch(`/api/dokumen/${id}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok)
          throw new Error(res.status === 404 ? "Dokumen tidak ditemukan." : "Gagal memuat.");
        const baru = (await res.json()) as Data;
        setData(baru);
        if (baru.hasil) setIsian(keIsian(baru.hasil.faktur));
      })
      .catch((err: Error) => setGalat(err.message));
  }, [id]);

  const posisi = data ? data.antrean.indexOf(id) : -1;
  const sebelumnya = posisi > 0 ? data!.antrean[posisi - 1] : null;
  const berikutnya = data
    ? posisi === -1
      ? (data.antrean[0] ?? null)
      : (data.antrean[posisi + 1] ?? null)
    : null;

  const kirim = useCallback(
    async (tindakan: Tindakan) => {
      if (!isian || mengirim) return;
      setMengirim(true);
      setGalat(null);
      setTersimpan(false);
      try {
        const res = await fetch(`/api/dokumen/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tindakan, faktur: keFaktur(isian) }),
        });
        const badan = (await res.json()) as { galat?: string; dokumen?: Dokumen; hasil?: Hasil };
        if (!res.ok || !badan.dokumen || !badan.hasil) {
          setGalat(badan.galat ?? "Gagal menyimpan.");
          return;
        }

        if (tindakan === "simpan") {
          // Tetap di sini: tampilkan masalah yang masih tersisa setelah perbaikan.
          setData((lama) => lama && { ...lama, dokumen: badan.dokumen!, hasil: badan.hasil! });
          setTersimpan(true);
          return;
        }
        // Setelah diputuskan, langsung ke dokumen berikutnya di antrean periksa.
        router.push(berikutnya ? `/dokumen/${berikutnya}` : "/");
      } catch {
        setGalat("Gagal menyimpan. Periksa koneksi lalu coba lagi.");
      } finally {
        setMengirim(false);
      }
    },
    [berikutnya, id, isian, mengirim, router],
  );

  // Pintasan: Ctrl+Enter menyetujui dari mana saja, Enter menyetujui kalau tidak sedang
  // mengetik, panah kiri dan kanan berpindah dokumen kalau tidak sedang mengetik.
  useEffect(() => {
    const tekan = (peristiwa: KeyboardEvent) => {
      const mengetik = sedangMengetik(peristiwa.target);
      if (peristiwa.key === "Enter" && (peristiwa.ctrlKey || peristiwa.metaKey || !mengetik)) {
        // Enter di atas tombol atau tautan tetap menjalankan tombol itu.
        if (!peristiwa.ctrlKey && !peristiwa.metaKey && peristiwa.target instanceof HTMLElement) {
          if (["BUTTON", "A"].includes(peristiwa.target.tagName)) return;
        }
        peristiwa.preventDefault();
        void kirim("setujui");
      }
      if (mengetik) return;
      if (peristiwa.key === "ArrowLeft" && sebelumnya) router.push(`/dokumen/${sebelumnya}`);
      if (peristiwa.key === "ArrowRight" && berikutnya) router.push(`/dokumen/${berikutnya}`);
    };
    window.addEventListener("keydown", tekan);
    return () => window.removeEventListener("keydown", tekan);
  }, [berikutnya, kirim, router, sebelumnya]);

  if (!data || !isian) {
    return (
      <p className="redup">
        {galat ?? (data ? "Dokumen ini belum selesai dibaca." : "Memuat dokumen...")}{" "}
        <Link href="/">Kembali ke daftar</Link>
      </p>
    );
  }

  const { dokumen, hasil } = data;
  const alasan = hasil?.alasan ?? [];
  const bermasalah = new Set(alasan.flatMap((satu) => satu.kolom));
  const kelas = (kolom: string) => (bermasalah.has(kolom) ? "kolom kolom-masalah" : "kolom");

  const ubah = (kolom: keyof Omit<Isian, "baris">, nilai: string) =>
    setIsian((lama) => lama && { ...lama, [kolom]: nilai });
  const ubahBaris = (indeks: number, kolom: keyof BarisIsian, nilai: string) =>
    setIsian(
      (lama) =>
        lama && {
          ...lama,
          baris: lama.baris.map((baris, i) =>
            i === indeks ? { ...baris, [kolom]: nilai } : baris,
          ),
        },
    );

  const jumlahBaris = isian.baris.reduce(
    (total, baris) => total + (Number(baris.total_baris) || 0),
    0,
  );

  const isianAngka = (kolom: "subtotal" | "pajak" | "total") => (
    <label className={kelas(kolom)}>
      <span>{LABEL_KOLOM[kolom]}</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        value={isian[kolom]}
        onChange={(e) => ubah(kolom, e.target.value)}
      />
    </label>
  );

  return (
    <div className="periksa">
      <nav className="periksa-atas">
        <Link href="/">&larr; Daftar dokumen</Link>
        <span className="periksa-nav">
          {posisi >= 0 && (
            <span className="redup">
              {posisi + 1} dari {data.antrean.length} di antrean periksa
            </span>
          )}
          {sebelumnya ? (
            <Link className="tombol tombol-kecil" href={`/dokumen/${sebelumnya}`}>
              &larr; Sebelumnya
            </Link>
          ) : null}
          {berikutnya ? (
            <Link className="tombol tombol-kecil" href={`/dokumen/${berikutnya}`}>
              Berikutnya &rarr;
            </Link>
          ) : null}
        </span>
      </nav>

      <div className="periksa-dua">
        <figure className="periksa-gambar">
          {/* Gambar unggahan pengguna dengan ukuran tak tentu, jadi next/image tidak membantu. */}
          <img src={`/api/dokumen/${id}/berkas`} alt={`Gambar ${dokumen.nama_berkas}`} />
          <figcaption className="redup kecil">{dokumen.nama_berkas}</figcaption>
        </figure>

        <form
          className="periksa-formulir"
          // Enter di dalam kotak isian tidak boleh menyetujui dokumen tanpa sengaja.
          onSubmit={(peristiwa) => peristiwa.preventDefault()}
        >
          <p>
            <span className={`lencana lencana-${dokumen.status}`}>
              {LABEL_STATUS[dokumen.status]}
            </span>
            {dokumen.lolos_otomatis && (
              <span className="redup kecil"> otomatis, lolos semua aturan</span>
            )}
          </p>

          {alasan.length > 0 ? (
            <ul className="alasan">
              {alasan.map((satu) => (
                <li key={satu.kode}>{satu.pesan}</li>
              ))}
            </ul>
          ) : (
            <p className="lolos">Tidak ada aturan yang dilanggar.</p>
          )}

          <div className="kisi">
            <label className={`${kelas("penjual")} kisi-lebar`}>
              <span>Penjual</span>
              <input value={isian.penjual} onChange={(e) => ubah("penjual", e.target.value)} />
            </label>
            <label className={kelas("nomor_faktur")}>
              <span>Nomor faktur</span>
              <input
                value={isian.nomor_faktur}
                onChange={(e) => ubah("nomor_faktur", e.target.value)}
              />
            </label>
            <label className={kelas("tanggal")}>
              <span>Tanggal</span>
              <input
                type="date"
                value={isian.tanggal}
                onChange={(e) => ubah("tanggal", e.target.value)}
              />
            </label>
          </div>

          <div className={bermasalah.has("baris") ? "baris baris-masalah" : "baris"}>
            <table>
              <thead>
                <tr>
                  <th>Barang</th>
                  <th className="kanan">Jumlah</th>
                  <th className="kanan">Harga satuan</th>
                  <th className="kanan">Total baris</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {isian.baris.map((baris, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        aria-label={`Nama barang ${i + 1}`}
                        value={baris.nama}
                        onChange={(e) => ubahBaris(i, "nama", e.target.value)}
                      />
                    </td>
                    {(["jumlah", "harga_satuan", "total_baris"] as const).map((kolom) => (
                      <td key={kolom}>
                        <input
                          aria-label={`${kolom.replace("_", " ")} barang ${i + 1}`}
                          className="kanan"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="any"
                          value={baris[kolom]}
                          onChange={(e) => ubahBaris(i, kolom, e.target.value)}
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        className="hapus"
                        aria-label={`Hapus barang ${i + 1}`}
                        onClick={() =>
                          setIsian(
                            (lama) =>
                              lama && { ...lama, baris: lama.baris.filter((_, j) => j !== i) },
                          )
                        }
                      >
                        &times;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="baris-bawah">
              <button
                type="button"
                className="tombol tombol-kecil"
                onClick={() =>
                  setIsian(
                    (lama) =>
                      lama && {
                        ...lama,
                        baris: [
                          ...lama.baris,
                          { nama: "", jumlah: "1", harga_satuan: "", total_baris: "" },
                        ],
                      },
                  )
                }
              >
                + Tambah barang
              </button>
              <span className="redup">
                Jumlah semua baris:{" "}
                <strong className="angka-rata">{uang(jumlahBaris, isian.mata_uang)}</strong>
              </span>
            </div>
          </div>

          <div className="kisi kisi-tiga">
            {isianAngka("subtotal")}
            {isianAngka("pajak")}
            {isianAngka("total")}
          </div>

          {galat && (
            <p className="peringatan" role="alert">
              {galat}
            </p>
          )}
          {tersimpan && (
            <p className="lolos" role="status">
              Tersimpan. Masalah di atas sudah dihitung ulang.
            </p>
          )}

          <div className="periksa-tombol">
            <button
              type="button"
              className="tombol tombol-bahaya"
              disabled={mengirim}
              onClick={() => void kirim("tolak")}
            >
              Tolak
            </button>
            <span className="periksa-kanan">
              <button
                type="button"
                className="tombol"
                disabled={mengirim}
                onClick={() => void kirim("simpan")}
              >
                Simpan
              </button>
              <button
                type="button"
                className="tombol tombol-utama"
                disabled={mengirim}
                onClick={() => void kirim("setujui")}
              >
                Setujui <kbd>Ctrl</kbd>
                <kbd>Enter</kbd>
              </button>
            </span>
          </div>
          <p className="redup kecil">
            Di luar kotak isian: <kbd>Enter</kbd> menyetujui, <kbd>&larr;</kbd> <kbd>&rarr;</kbd>{" "}
            berpindah dokumen.
          </p>

          {data.koreksi.length > 0 && (
            <details className="lipat">
              <summary>Riwayat koreksi ({data.koreksi.length})</summary>
              <ul>
                {data.koreksi.map((satu) => (
                  <li key={satu.id}>
                    <strong>{LABEL_KOLOM[satu.kolom] ?? satu.kolom}</strong>:{" "}
                    {satu.kolom === "baris" ? (
                      "rincian barang diubah"
                    ) : (
                      <>
                        <s>{satu.nilai_lama || "kosong"}</s> &rarr; {satu.nilai_baru || "kosong"}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {hasil?.json_mentah && (
            <details className="lipat">
              <summary>Jawaban AI apa adanya</summary>
              <pre>{hasil.json_mentah}</pre>
            </details>
          )}
        </form>
      </div>
    </div>
  );
}
