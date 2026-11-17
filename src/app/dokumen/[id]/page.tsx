import { Periksa } from "@/components/Periksa";

export default async function Halaman({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // key: pindah ke dokumen lain memulai formulir dari awal, bukan membawa isian dokumen tadi.
  return <Periksa key={id} id={id} />;
}
