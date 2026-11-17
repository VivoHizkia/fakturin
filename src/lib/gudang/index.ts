import path from "node:path";
import { GudangLokal } from "./lokal";
import type { Gudang } from "./tipe";

export * from "./tipe";

// Satu instans untuk seluruh proses. Disimpan di globalThis karena Next memuat ulang modul
// saat pengembangan, dan dua instans berarti dua antrean tulis ke berkas yang sama.
const global = globalThis as { __gudangFaktur?: Gudang };

export function gudang(): Gudang {
  global.__gudangFaktur ??= new GudangLokal(
    // Folder data ditentukan saat jalan, jadi tidak perlu ikut ditelusuri saat build.
    path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DATA_DIR || ".data"),
  );
  return global.__gudangFaktur;
}
