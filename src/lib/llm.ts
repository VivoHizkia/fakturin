// Klien untuk endpoint Chat Completions yang kompatibel dengan OpenAI (Gemini, Groq, OpenAI,
// OpenRouter, Ollama lokal...). Memakai fetch biasa tanpa SDK, jadi ganti penyedia cukup dengan
// mengubah variabel lingkungan.

export type LlmBagian =
  { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string | LlmBagian[];
};
export type LlmCall = (messages: LlmMessage[]) => Promise<string>;

export class LlmError extends Error {}

export const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";

// Membaca gambar lebih lama daripada menjawab teks.
const TIMEOUT_MS = 40_000;
const RETRY_DELAY_MS = 1_500;

// Jawaban "sedang sibuk, coba lagi". Paket gratis cukup sering mengembalikannya.
const BUSY_STATUSES = new Set([429, 500, 503]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Dibaca setiap pemanggilan (bukan saat impor) supaya kunci yang kosong menggagalkan
// permintaan, bukan proses build.
function readConfig() {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new LlmError("LLM_API_KEY belum diisi");

  return {
    apiKey,
    baseUrl: (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
    model: process.env.LLM_MODEL || DEFAULT_MODEL,
    // Model kedua di endpoint yang sama, dipakai hanya kalau model utama tetap sibuk.
    fallbackModel: process.env.LLM_FALLBACK_MODEL || null,
  };
}

type CompletionResponse = { choices?: { message?: { content?: string } }[] };

type Attempt = { ok: true; content: string } | { ok: false; busy: boolean; error: string };

// Satu permintaan ke satu model. Tidak pernah melempar galat: pemanggil yang memutuskan
// perlu mencoba lagi atau tidak.
async function attempt(
  config: { apiKey: string; baseUrl: string },
  model: string,
  messages: LlmMessage[],
): Promise<Attempt> {
  const send = (body: Record<string, unknown>) =>
    fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  // temperature 0: faktur yang sama harus menghasilkan data yang sama.
  const request = { model, messages, temperature: 0 };

  try {
    let res = await send({ ...request, response_format: { type: "json_object" } });
    // Tidak semua penyedia mendukung response_format. Prompt tetap meminta JSON.
    if (res.status === 400) res = await send(request);

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return {
        ok: false,
        busy: BUSY_STATUSES.has(res.status),
        error: `Permintaan LLM gagal (${res.status}, ${model}): ${detail}`,
      };
    }

    const data = (await res.json()) as CompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return { ok: false, busy: false, error: `LLM menjawab kosong (${model})` };
    return { ok: true, content };
  } catch (err) {
    // Waktu habis dan koneksi putus juga layak dicoba lagi.
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, busy: true, error: `Permintaan LLM gagal (${model}): ${reason}` };
  }
}

// Urutan percobaan: model utama, model utama lagi setelah jeda singkat, lalu model cadangan
// kalau ada. Hanya kegagalan "sibuk" yang lanjut ke percobaan berikutnya; kunci yang salah
// atau permintaan yang keliru langsung gagal.
export const callLlm: LlmCall = async (messages) => {
  const config = readConfig();
  const models = [config.model, config.model];
  if (config.fallbackModel) models.push(config.fallbackModel);

  let lastError = "";
  for (const [i, model] of models.entries()) {
    if (i > 0) await sleep(RETRY_DELAY_MS);

    const result = await attempt(config, model, messages);
    if (result.ok) return result.content;

    lastError = result.error;
    if (!result.busy) break;
  }
  throw new LlmError(lastError);
};

// Model kadang membungkus JSON dengan pagar ```json atau menambah kalimat di sekitarnya,
// jadi ambil apa pun di antara "{" pertama dan "}" terakhir.
export function parseJsonObject<T>(text: string): T {
  const body = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new LlmError("Tidak ada objek JSON di jawaban LLM");
  return JSON.parse(body.slice(start, end + 1)) as T;
}
