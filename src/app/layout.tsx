import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Faktur Otomatis",
  description:
    "Mengubah foto faktur menjadi data terstruktur, dan hanya meminta manusia memeriksa yang meragukan.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>
        <header className="kepala">
          <Link href="/" className="merek">
            <span className="merek-tanda" aria-hidden="true">
              F
            </span>
            Faktur Otomatis
          </Link>
          <p className="kepala-ket">Foto faktur masuk, data siap pakai keluar.</p>
        </header>
        <main className="isi">{children}</main>
      </body>
    </html>
  );
}
