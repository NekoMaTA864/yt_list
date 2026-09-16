const API_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MODEL = "gemini-3.8-flash";

const apiKeyInput = document.querySelector("#api-key");
const videoUrlInput = document.querySelector("#video-url");
const toggleKeyButton = document.querySelector("#toggle-key");
const testKeyButton = document.querySelector("#test-key");
const clearKeyButton = document.querySelector("#clear-key");
const analyzeVideoButton = document.querySelector("#analyze-video");
const keyStatus = document.querySelector("#key-status");
const videoStatus = document.querySelector("#video-status");
const result = document.querySelector("#result");

const genreSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    artist: { type: "string" },
    primary_genre: {
      type: "string",
      enum: ["J-pop", "R&B", "Artcore", "Pop", "Rock", "EDM", "Lo-fi", "Jazz", "Classical", "Game OST", "Anime song", "Other", "Uncertain"]
    },
    secondary_genres: { type: "array", items: { type: "string" } },
    format: { type: "string", enum: ["Original", "Cover", "Live", "Remix", "Instrumental", "Unknown"] },
    language: { type: "array", items: { type: "string" } },
    mood: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
    reasoning: { type: "string" }
  },
  required: ["title", "artist", "primary_genre", "secondary_genres", "format", "language", "mood", "confidence", "reasoning"],
  additionalProperties: false
};

function setStatus(element, message, kind = "neutral") {
  element.textContent = message;
  element.className = `status ${kind}`;
}

function setBusy(button, busy, busyText, normalText) {
  button.disabled = busy;
  button.textContent = busy ? busyText : normalText;
}

function redact(value, secret) {
  if (!value) return "";
  return String(value).replaceAll(secret, "[REDACTED]");
}

async function callGemini(apiKey, payload) {
  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify(payload)
  });

  const bodyText = await response.text();
  let body;
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    body = { raw: bodyText };
  }

  if (!response.ok) {
    const apiMessage = body?.error?.message || body?.raw || `HTTP ${response.status}`;
    throw new Error(redact(apiMessage, apiKey));
  }

  return body;
}

function outputTextFromResponse(data) {
  if (typeof data?.output_text === "string") return data.output_text;

  const outputStep = [...(data?.steps || [])].reverse().find((step) => step.type === "model_output");
  const content = outputStep?.content || [];
  return content.map((item) => item.text || "").join("\n").trim();
}

function parseJson(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

function isYoutubeUrl(value) {
  try {
    const url = new URL(value);
    return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname);
  } catch {
    return false;
  }
}

function displayValue(value) {
  if (Array.isArray(value)) return value.length ? value.join("、") : "—";
  return value || "—";
}

function renderResult(data, rawText) {
  document.querySelector("#result-title").textContent = displayValue(data.title);
  document.querySelector("#result-artist").textContent = displayValue(data.artist);
  document.querySelector("#result-primary").textContent = displayValue(data.primary_genre);
  document.querySelector("#result-secondary").textContent = displayValue(data.secondary_genres);
  document.querySelector("#result-format").textContent = displayValue(data.format);
  document.querySelector("#result-language").textContent = displayValue(data.language);
  document.querySelector("#result-mood").textContent = displayValue(data.mood);
  document.querySelector("#result-reasoning").textContent = displayValue(data.reasoning);

  const confidence = Number(data.confidence);
  document.querySelector("#confidence").textContent = Number.isFinite(confidence)
    ? `信心度 ${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`
    : "信心度未提供";
  document.querySelector("#raw-output").textContent = rawText;
  result.classList.remove("hidden");
}

toggleKeyButton.addEventListener("click", () => {
  const showing = apiKeyInput.type === "text";
  apiKeyInput.type = showing ? "password" : "text";
  toggleKeyButton.textContent = showing ? "顯示" : "隱藏";
});

clearKeyButton.addEventListener("click", () => {
  apiKeyInput.value = "";
  result.classList.add("hidden");
  setStatus(keyStatus, "已清除，目前沒有保存 API Key", "neutral");
  setStatus(videoStatus, "請先通過 API Key 測試", "neutral");
});

testKeyButton.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    setStatus(keyStatus, "請先輸入 API Key", "error");
    return;
  }

  setBusy(testKeyButton, true, "測試中…", "測試 API Key");
  setStatus(keyStatus, "正在連線 Gemini API…", "loading");

  try {
    const data = await callGemini(apiKey, {
      model: MODEL,
      input: "Reply with exactly: GEMINI_API_OK"
    });
    const text = outputTextFromResponse(data);
    if (!text.includes("GEMINI_API_OK")) throw new Error("API 有回應，但內容不符合預期：" + text);
    setStatus(keyStatus, `API Key 有效，模型回應：${text.trim()}`, "success");
    setStatus(videoStatus, "可以開始分析公開 YouTube 影片", "success");
  } catch (error) {
    setStatus(keyStatus, `測試失敗：${error.message}`, "error");
    setStatus(videoStatus, "請先修正 API Key 或模型／額度問題", "neutral");
  } finally {
    setBusy(testKeyButton, false, "測試中…", "測試 API Key");
  }
});

analyzeVideoButton.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  const videoUrl = videoUrlInput.value.trim();

  if (!apiKey) {
    setStatus(videoStatus, "請先輸入並測試 API Key", "error");
    return;
  }
  if (!isYoutubeUrl(videoUrl)) {
    setStatus(videoStatus, "請輸入有效的 YouTube 網址", "error");
    return;
  }

  setBusy(analyzeVideoButton, true, "分析中…", "分析曲風");
  setStatus(videoStatus, "Gemini 正在讀取公開影片的影音內容，可能需要一些時間…", "loading");
  result.classList.add("hidden");

  try {
    const data = await callGemini(apiKey, {
      model: MODEL,
      input: [
        {
          type: "video",
          uri: videoUrl
        },
        {
          type: "text",
          text: [
            "Analyze the music in this public YouTube video.",
            "Classify the actual audio and musical style, not only the title or uploader metadata.",
            "Use J-pop, R&B, Artcore, Pop, Rock, EDM, Lo-fi, Jazz, Classical, Game OST, Anime song, Other, or Uncertain for primary_genre.",
            "J-pop may coexist with R&B or other secondary styles.",
            "If the audio is unavailable or the evidence is weak, use Uncertain and lower confidence.",
            "Return only the requested JSON object."
          ].join("\n")
        }
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: genreSchema
      }
    });

    const rawText = outputTextFromResponse(data);
    const parsed = parseJson(rawText);
    renderResult(parsed, rawText);
    setStatus(videoStatus, "分析完成；結果僅供分類參考，尚未修改播放清單。", "success");
  } catch (error) {
    setStatus(videoStatus, `分析失敗：${error.message}`, "error");
  } finally {
    setBusy(analyzeVideoButton, false, "分析中…", "分析曲風");
  }
});

window.addEventListener("pagehide", () => {
  apiKeyInput.value = "";
});
