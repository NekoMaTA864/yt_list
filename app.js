const API_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MODEL_CANDIDATES = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"];
const PRIMARY_MODEL = MODEL_CANDIDATES[0];

const apiKeyInput = document.querySelector("#api-key");
const videoUrlInput = document.querySelector("#video-url");
const analysisModeInput = document.querySelector("#analysis-mode");
const modeDescription = document.querySelector("#mode-description");
const toggleKeyButton = document.querySelector("#toggle-key");
const testKeyButton = document.querySelector("#test-key");
const clearKeyButton = document.querySelector("#clear-key");
const analyzeVideoButton = document.querySelector("#analyze-video");
const copyHandoffButton = document.querySelector("#copy-handoff");
const keyStatus = document.querySelector("#key-status");
const videoStatus = document.querySelector("#video-status");
const result = document.querySelector("#result");
const musicResult = document.querySelector("#music-result");
const contentResult = document.querySelector("#content-result");

const genreSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    artist: { type: "string" },
    primary_genre: { type: "string", enum: ["J-pop", "R&B", "Artcore", "Pop", "Rock", "EDM", "Lo-fi", "Jazz", "Classical", "Game OST", "Anime song", "Other", "Uncertain"] },
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

const evidenceSchema = { type: "string", enum: ["SPEECH", "SCREEN", "INFERENCE", "SPEECH+SCREEN", "UNCERTAIN"] };
const contentAnalysisSchema = {
  type: "object",
  properties: {
    video: {
      type: "object",
      properties: { title: { type: "string" }, language: { type: "string" }, duration: { type: "string" } },
      required: ["title", "language", "duration"],
      additionalProperties: false
    },
    summary: {
      type: "object",
      properties: { overall_summary: { type: "string" }, author_conclusion: { type: "string" } },
      required: ["overall_summary", "author_conclusion"],
      additionalProperties: false
    },
    target_term_checks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          term: { type: "string" },
          status: { type: "string", enum: ["mentioned", "not_found", "uncertain"] },
          timestamp: { type: "string" },
          details: { type: "string" },
          evidence_type: evidenceSchema
        },
        required: ["term", "status", "timestamp", "details", "evidence_type"],
        additionalProperties: false
      }
    },
    timeline: {
      type: "array",
      items: {
        type: "object",
        properties: {
          start_time: { type: "string" }, end_time: { type: "string" }, topic: { type: "string" },
          original_terms: { type: "array", items: { type: "string" } },
          zh_tw_summary: { type: "string" }, evidence_type: evidenceSchema, confidence: { type: "number" }
        },
        required: ["start_time", "end_time", "topic", "original_terms", "zh_tw_summary", "evidence_type", "confidence"],
        additionalProperties: false
      }
    },
    numbers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          timestamp: { type: "string" }, subject: { type: "string" }, value: { type: "string" },
          context: { type: "string" }, evidence_type: evidenceSchema
        },
        required: ["timestamp", "subject", "value", "context", "evidence_type"],
        additionalProperties: false
      }
    },
    comparisons: {
      type: "array",
      items: {
        type: "object",
        properties: {
          timestamp: { type: "string" }, target_a: { type: "string" }, target_b: { type: "string" },
          result: { type: "string" }, explanation: { type: "string" }, evidence_type: evidenceSchema
        },
        required: ["timestamp", "target_a", "target_b", "result", "explanation", "evidence_type"],
        additionalProperties: false
      }
    },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          timestamp: { type: "string" }, subject: { type: "string" }, description: { type: "string" },
          type: { type: "string", enum: ["bug", "concern", "limitation", "uncertain"] }
        },
        required: ["timestamp", "subject", "description", "type"],
        additionalProperties: false
      }
    },
    uncertain_items: {
      type: "array",
      items: {
        type: "object",
        properties: { timestamp: { type: "string" }, content: { type: "string" }, reason: { type: "string" } },
        required: ["timestamp", "content", "reason"],
        additionalProperties: false
      }
    }
  },
  required: ["video", "summary", "target_term_checks", "timeline", "numbers", "comparisons", "issues", "uncertain_items"],
  additionalProperties: false
};

let lastContentAnalysis = null;

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
  let response;
  const requestModel = payload.model || PRIMARY_MODEL;
  try {
    response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    throw new Error("無法連線 Gemini API，請檢查網路或瀏覽器限制。");
  }

  const bodyText = await response.text();
  let body;
  try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = { raw: bodyText }; }

  if (!response.ok) {
    const apiMessage = body?.error?.message || body?.raw || `HTTP ${response.status}`;
    let prefix = "Gemini API 錯誤";
    if (response.status === 400) prefix = "請求格式或影片不受支援";
    if (response.status === 401 || response.status === 403) prefix = "API Key 無效或沒有權限";
    if (response.status === 429) prefix = "API quota 或速率限制已到達";
    if (response.status === 413 || response.status === 504) prefix = "影片內容過長或分析逾時";
    const safeMessage = redact(apiMessage, apiKey);
    const apiError = new Error(prefix + "：" + safeMessage);
    apiError.status = response.status;
    apiError.model = requestModel;
    apiError.transient = [429, 500, 502, 503, 504].includes(response.status) || /high demand|temporar|overload/i.test(safeMessage);
    apiError.modelUnavailable = response.status === 404 || /model.*(not found|unsupported)|not found|does not exist/i.test(safeMessage);
    throw apiError;
  }
  return body;
}


const FALLBACK_DELAY_MS = 700;

function canTryNextModel(error) {
  return Boolean(error?.transient || error?.modelUnavailable);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function callWithModelFallback(apiKey, buildPayload, onAttempt) {
  let lastError;
  for (let index = 0; index < MODEL_CANDIDATES.length; index += 1) {
    const model = MODEL_CANDIDATES[index];
    onAttempt?.(model, index, MODEL_CANDIDATES.length);
    try {
      const data = await callGemini(apiKey, buildPayload(model));
      return { data, model };
    } catch (error) {
      lastError = error;
      if (!canTryNextModel(error) || index === MODEL_CANDIDATES.length - 1) throw error;
      await wait(FALLBACK_DELAY_MS * (index + 1));
    }
  }
  throw lastError;
}

function outputTextFromResponse(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const outputStep = [...(data?.steps || [])].reverse().find((step) => step.type === "model_output");
  return (outputStep?.content || []).map((item) => item.text || "").join("\n").trim();
}

function parseJson(text) {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned); } catch (error) { throw new Error("JSON 解析失敗：Gemini 回傳可能不完整或不是 JSON。"); }
}

function isYoutubeUrl(value) {
  try {
    const url = new URL(value);
    return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname);
  } catch { return false; }
}

function displayValue(value) {
  if (Array.isArray(value)) return value.length ? value.join("、") : "—";
  return value || "—";
}

function renderMusicResult(data, rawText) {
  document.querySelector("#result-heading").textContent = "音樂分類結果";
  document.querySelector("#result-title").textContent = displayValue(data.title);
  document.querySelector("#result-artist").textContent = displayValue(data.artist);
  document.querySelector("#result-primary").textContent = displayValue(data.primary_genre);
  document.querySelector("#result-secondary").textContent = displayValue(data.secondary_genres);
  document.querySelector("#result-format").textContent = displayValue(data.format);
  document.querySelector("#result-language").textContent = displayValue(data.language);
  document.querySelector("#result-mood").textContent = displayValue(data.mood);
  document.querySelector("#result-reasoning").textContent = displayValue(data.reasoning);
  const confidence = Number(data.confidence);
  document.querySelector("#confidence").textContent = Number.isFinite(confidence) ? `信心度 ${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%` : "信心度未提供";
  document.querySelector("#raw-output").textContent = rawText;
  musicResult.classList.remove("hidden");
  contentResult.classList.add("hidden");
  result.classList.remove("hidden");
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function textLine(label, value) {
  const p = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = label + "：";
  p.append(strong, document.createTextNode(displayValue(value)));
  return p;
}

function renderStack(id, items, renderItem) {
  const node = document.querySelector(id);
  clearNode(node);
  if (!Array.isArray(items) || !items.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "未發現或未提供。";
    node.append(empty);
    return;
  }
  items.forEach((item) => node.append(renderItem(item)));
}

function makeCard(lines, className = "result-item") {
  const article = document.createElement("article");
  article.className = className;
  lines.filter(Boolean).forEach((line) => article.append(line));
  return article;
}

function evidenceBadge(value) {
  const badge = document.createElement("span");
  badge.className = "evidence";
  badge.textContent = displayValue(value);
  return badge;
}

function renderContentResult(data, rawText) {
  const video = data.video || {};
  const summary = data.summary || {};
  document.querySelector("#result-heading").textContent = displayValue(video.title) || "影片內容解析";
  document.querySelector("#confidence").textContent = `${displayValue(video.language)}｜${displayValue(video.duration)}`;
  document.querySelector("#content-overall-summary").textContent = displayValue(summary.overall_summary);
  document.querySelector("#content-author-conclusion").textContent = displayValue(summary.author_conclusion);

  renderStack("#content-term-checks", data.target_term_checks, (item) => makeCard([
    textLine(item.term, `${displayValue(item.status)}｜${displayValue(item.timestamp)}`),
    textLine("說明", item.details),
    evidenceBadge(item.evidence_type)
  ]));

  renderStack("#content-timeline", data.timeline, (item) => makeCard([
    textLine(`${displayValue(item.start_time)}–${displayValue(item.end_time)}`, item.topic),
    textLine("中文摘要", item.zh_tw_summary),
    textLine("原文術語", item.original_terms),
    evidenceBadge(`${displayValue(item.evidence_type)}｜信心度 ${displayValue(item.confidence)}`)
  ]));

  renderStack("#content-numbers", data.numbers, (item) => makeCard([
    textLine(`${displayValue(item.timestamp)}｜${displayValue(item.subject)}`, item.value),
    textLine("脈絡", item.context),
    evidenceBadge(item.evidence_type)
  ]));

  renderStack("#content-comparisons", data.comparisons, (item) => makeCard([
    textLine(`${displayValue(item.timestamp)}｜${displayValue(item.target_a)} vs ${displayValue(item.target_b)}`, item.result),
    textLine("說明", item.explanation),
    evidenceBadge(item.evidence_type)
  ]));

  renderStack("#content-issues", data.issues, (item) => makeCard([
    textLine(`${displayValue(item.timestamp)}｜${displayValue(item.subject)}`, `[${displayValue(item.type)}] ${displayValue(item.description)}`)
  ]));

  const uncertain = [...(data.uncertain_items || [])];
  (data.timeline || []).filter((item) => Number(item.confidence) < 0.6).forEach((item) => uncertain.push({
    timestamp: `${item.start_time}–${item.end_time}`,
    content: item.topic + "：" + item.zh_tw_summary,
    reason: "時間軸項目的信心度低於 0.6"
  }));
  renderStack("#content-uncertain", uncertain, (item) => makeCard([
    textLine(item.timestamp, item.content),
    textLine("原因", item.reason)
  ]));

  document.querySelector("#raw-output").textContent = rawText;
  musicResult.classList.add("hidden");
  contentResult.classList.remove("hidden");
  result.classList.remove("hidden");
  lastContentAnalysis = { data, url: videoUrlInput.value.trim(), model };
}

function buildHandoff({ data, url }) {
  const video = data.video || {};
  const summary = data.summary || {};
  const line = (label, value) => `- ${label}: ${displayValue(value)}`;
  const sections = [
    "# YouTube Video Analysis",
    "",
    "## Source",
    line("Title", video.title),
    line("URL", url),
    line("Language", video.language),
    line("Duration", video.duration),
    "",
    "## Overall Summary",
    displayValue(summary.overall_summary),
    "",
    "## Author's Conclusions",
    displayValue(summary.author_conclusion),
    "",
    "## Term Checks",
    ...(data.target_term_checks || []).map((item) => line(item.term, `${item.status}; ${item.timestamp}; ${item.details}; ${item.evidence_type}`)),
    "",
    "## Timeline",
    ...(data.timeline || []).map((item) => [
      `### ${item.start_time}–${item.end_time} — ${item.topic}`,
      line("Original terms", item.original_terms),
      line("Summary", item.zh_tw_summary),
      line("Evidence", `${item.evidence_type}; confidence ${item.confidence}`),
      ""
    ].join("\n")),
    "## Numerical Data",
    ...(data.numbers || []).map((item) => line(`${item.timestamp} / ${item.subject}`, `${item.value}; ${item.context}; ${item.evidence_type}`)),
    "",
    "## Comparisons",
    ...(data.comparisons || []).map((item) => line(`${item.timestamp}: ${item.target_a} vs ${item.target_b}`, `${item.result}; ${item.explanation}; ${item.evidence_type}`)),
    "",
    "## Bugs / Concerns",
    ...(data.issues || []).map((item) => line(`${item.timestamp} / ${item.subject}`, `[${item.type}] ${item.description}`)),
    "",
    "## Uncertain Items",
    ...(data.uncertain_items || []).map((item) => line(item.timestamp, `${item.content}; ${item.reason}`)),
    "",
    "## Analysis Request",
    "請根據以上影片解析資料：",
    "1. 使用繁體中文整理。",
    "2. 專有名詞優先轉換為台灣版本正式名稱；無法確認時保留原文。",
    "3. 驗算影片中的技能倍率、百分比與數值比較。",
    "4. 將作者實測、作者意見、模型推測分開。",
    "5. 如有必要，搜尋官方 Patch Note 與社群資料交叉驗證。",
    "6. 特別指出影片內容與已知資料存在矛盾之處。"
  ];
  return sections.join("\n");
}

async function copyHandoff() {
  if (!lastContentAnalysis) return;
  const markdown = buildHandoff(lastContentAnalysis);
  try {
    await navigator.clipboard.writeText(markdown);
    setStatus(videoStatus, "已複製 Markdown 交接稿，可直接貼到 ChatGPT。", "success");
  } catch {
    setStatus(videoStatus, "瀏覽器阻擋剪貼簿，請展開原始 JSON 後手動複製。", "error");
  }
}

function updateModeUI() {
  const contentMode = analysisModeInput.value === "content";
  analyzeVideoButton.textContent = contentMode ? "解析影片內容" : "分析曲風";
  modeDescription.textContent = contentMode
    ? "按時間順序分析語音、畫面、畫面文字、表格與數值，並標示 SPEECH／SCREEN／INFERENCE。"
    : "分析影片中的實際音訊與曲風，不只看標題或上傳者資訊。";
  result.classList.add("hidden");
  lastContentAnalysis = null;
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
  if (!apiKey) { setStatus(keyStatus, "請先輸入 API Key", "error"); return; }
  setBusy(testKeyButton, true, "測試中…", "測試 API Key");
  setStatus(keyStatus, "正在連線 Gemini API…", "loading");
  try {
    const { data, model } = await callWithModelFallback(
      apiKey,
      (candidateModel) => ({ model: candidateModel, input: "Reply with exactly: GEMINI_API_OK" }),
      (candidateModel, index, total) => setStatus(keyStatus, "正在連線 Gemini API（" + candidateModel + "，第 " + (index + 1) + "/" + total + " 次）…", "loading")
    );
    const text = outputTextFromResponse(data);
    if (!text.includes("GEMINI_API_OK")) throw new Error("API 有回應，但內容不符合預期：" + text);
    setStatus(keyStatus, "API Key 有效（模型：" + model + "），模型回應：" + text.trim(), "success");
    setStatus(videoStatus, "可以開始分析公開 YouTube 影片", "success");
  } catch (error) {
    setStatus(keyStatus, `測試失敗：${error.message}`, "error");
    setStatus(videoStatus, "請先修正 API Key、權限、模型或 quota 問題", "neutral");
  } finally {
    setBusy(testKeyButton, false, "測試中…", "測試 API Key");
  }
});

analysisModeInput.addEventListener("change", updateModeUI);
copyHandoffButton.addEventListener("click", copyHandoff);

analyzeVideoButton.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  const videoUrl = videoUrlInput.value.trim();
  const contentMode = analysisModeInput.value === "content";

  if (!apiKey) { setStatus(videoStatus, "請先輸入並測試 API Key", "error"); return; }
  if (!isYoutubeUrl(videoUrl)) { setStatus(videoStatus, "請輸入有效的 YouTube 影片網址", "error"); return; }

  setBusy(analyzeVideoButton, true, "分析中…", contentMode ? "解析影片內容" : "分析曲風");
  setStatus(videoStatus, contentMode ? "Gemini 正在依時間順序讀取影片語音、畫面與文字，可能需要一些時間…" : "Gemini 正在讀取公開影片的音訊內容…", "loading");
  result.classList.add("hidden");

  try {
    const musicPrompt = [
      "Analyze the music in this public YouTube video.",
      "Classify the actual audio and musical style, not only the title or uploader metadata.",
      "Use J-pop, R&B, Artcore, Pop, Rock, EDM, Lo-fi, Jazz, Classical, Game OST, Anime song, Other, or Uncertain for primary_genre.",
      "If the audio is unavailable or the evidence is weak, use Uncertain and lower confidence.",
      "Return only the requested JSON object."
    ].join("\n");
    const contentPrompt = [
      "Analyze the complete public YouTube video in chronological order, using speech, visuals, on-screen text, tables, numbers, skill names, and battle-analysis screens. Do not rely on transcript alone.",
      "Return only the requested JSON object. Preserve important original Korean terms and add Traditional Chinese summaries.",
      "For every important claim, provide a timestamp. Preserve numbers exactly when possible: damage %, hit count, cooldown, DPM, 전분, equipment values, buffs, and boss clear time.",
      "Label evidence as SPEECH when the author clearly says it, SCREEN when directly visible, INFERENCE only when inferred. Never present INFERENCE as an author statement. Use UNCERTAIN when audio or visuals are unclear.",
      "Detect skill buffs/nerfs, bugs, damage comparisons, DPM/전분, before/after patch differences, boss results, equipment configuration, cooldown reduction, and explicit author opinions.",
      "For target_term_checks, check each of: 피니쉬 블로우 (Finish Blow), 사신의 낫, 유니온 오라, 다크 제네시스, 쿨뚝, cooldown reduction, and post-patch boss output method. Use not_found when the video does not mention it; do not guess.",
      "If the video is Korean, retain Korean sentences or terms in original_terms where important. Use a complete timeline rather than a short transcript excerpt."
    ].join("\n");

    const { data, model } = await callWithModelFallback(
      apiKey,
      (candidateModel) => ({
        model: candidateModel,
        input: [{ type: "video", uri: videoUrl }, { type: "text", text: contentMode ? contentPrompt : musicPrompt }],
        response_format: { type: "text", mime_type: "application/json", schema: contentMode ? contentAnalysisSchema : genreSchema }
      }),
      (candidateModel, index, total) => setStatus(videoStatus, "正在使用 " + candidateModel + "（第 " + (index + 1) + "/" + total + " 次）…", "loading")
    );

    const rawText = outputTextFromResponse(data);
    const parsed = parseJson(rawText);
    if (contentMode) {
      renderContentResult(parsed, rawText);
      setStatus(videoStatus, "影片內容解析完成（模型：" + model + "）；尚未修改任何播放清單。", "success");
    } else {
      renderMusicResult(parsed, rawText);
      setStatus(videoStatus, "音樂分類完成（模型：" + model + "）；尚未修改任何播放清單。", "success");
    }
  } catch (error) {
    setStatus(videoStatus, `分析失敗：${error.message}`, "error");
  } finally {
    setBusy(analyzeVideoButton, false, "分析中…", contentMode ? "解析影片內容" : "分析曲風");
  }
});

updateModeUI();
window.addEventListener("pagehide", () => { apiKeyInput.value = ""; });
