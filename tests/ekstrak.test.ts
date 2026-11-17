import { describe, expect, it, vi } from "vitest";
import { ekstrakFaktur } from "@/lib/ekstrak/ekstrak";
import { LlmError, type LlmMessage } from "@/lib/llm";
import { fakturBaik } from "./bantu";

const GAMBAR = "data:image/png;base64,AAAA";

describe("ekstrakFaktur", () => {
  it("mengirim gambar ke AI dan mengembalikan faktur yang lolos skema", async () => {
    const llm = vi.fn().mockResolvedValue(JSON.stringify(fakturBaik()));

    const hasil = await ekstrakFaktur(GAMBAR, llm);

    expect(hasil).toMatchObject({ ok: true, faktur: fakturBaik(), percobaan: 1 });
    const pesan = llm.mock.calls[0][0] as LlmMessage[];
    expect(JSON.stringify(pesan[1].content)).toContain(GAMBAR);
  });

  it("menerima JSON yang dibungkus pagar kode", async () => {
    const llm = vi.fn().mockResolvedValue("```json\n" + JSON.stringify(fakturBaik()) + "\n```");
    expect((await ekstrakFaktur(GAMBAR, llm)).ok).toBe(true);
  });

  it("mencoba sekali lagi dengan galatnya kalau jawaban pertama tidak lolos skema", async () => {
    const salah = JSON.stringify({ ...fakturBaik(), total: "seratus ribu" });
    const llm = vi
      .fn()
      .mockResolvedValueOnce(salah)
      .mockResolvedValueOnce(JSON.stringify(fakturBaik()));

    const hasil = await ekstrakFaktur(GAMBAR, llm);

    expect(hasil).toMatchObject({ ok: true, percobaan: 2 });
    const pesanKedua = llm.mock.calls[1][0] as LlmMessage[];
    expect(pesanKedua.at(-2)).toEqual({ role: "assistant", content: salah });
    expect(pesanKedua.at(-1)?.content).toContain("total");
  });

  it("menyerah setelah dua jawaban yang salah, tanpa melempar galat", async () => {
    const llm = vi.fn().mockResolvedValue("Maaf, gambarnya tidak terbaca.");

    const hasil = await ekstrakFaktur(GAMBAR, llm);

    expect(hasil.ok).toBe(false);
    expect(llm).toHaveBeenCalledTimes(2);
  });

  it("meneruskan galat jaringan supaya dokumen bisa dicoba lagi", async () => {
    const llm = vi.fn().mockRejectedValue(new LlmError("503"));
    await expect(ekstrakFaktur(GAMBAR, llm)).rejects.toThrow("503");
  });
});
