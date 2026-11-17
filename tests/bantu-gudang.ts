import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GudangLokal } from "@/lib/gudang/lokal";

// Gudang di folder sementara, supaya tiap tes mulai dari keadaan kosong.
export async function gudangSementara() {
  const folder = await mkdtemp(path.join(os.tmpdir(), "faktur-tes-"));
  return {
    gudang: new GudangLokal(folder),
    hapus: () => rm(folder, { recursive: true, force: true }),
  };
}
