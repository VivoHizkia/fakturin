import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callLlm, parseJsonObject } from "@/lib/llm";

describe("parseJsonObject", () => {
  it("membaca JSON yang dibungkus pagar kode atau kalimat", () => {
    const reply = 'Sure!\n```json\n{"a": 1}\n```';
    expect(parseJsonObject<{ a: number }>(reply)).toEqual({ a: 1 });
  });

  it("melempar galat kalau jawaban tidak berisi objek JSON", () => {
    expect(() => parseJsonObject("I cannot help with that.")).toThrow();
  });
});

describe("callLlm", () => {
  const ok = (content: string) =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  const busy = () => new Response("high demand", { status: 503 });

  // Model tujuan tiap permintaan.
  const modelsCalled = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string).model);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubEnv("LLM_MODEL", "main-model");
    vi.stubEnv("LLM_FALLBACK_MODEL", "backup-model");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const run = async () => {
    const pending = callLlm([{ role: "user", content: "hi" }]);
    // Penolakan ditelan di sini supaya hanya dilaporkan lewat promise yang ditunggu di bawah.
    pending.catch(() => {});
    await vi.runAllTimersAsync();
    return pending;
  };

  it("mencoba model utama sekali lagi saat sibuk", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(ok("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(run()).resolves.toBe("{}");
    expect(modelsCalled(fetchMock)).toEqual(["main-model", "main-model"]);
  });

  it("pindah ke model cadangan kalau model utama tetap sibuk", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(busy())
      .mockResolvedValueOnce(busy())
      .mockResolvedValueOnce(ok("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(run()).resolves.toBe("{}");
    expect(modelsCalled(fetchMock)).toEqual(["main-model", "main-model", "backup-model"]);
  });

  it("tidak mengulang galat yang tidak akan hilang, misalnya kunci salah", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("invalid key", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(run()).rejects.toThrow("401");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
