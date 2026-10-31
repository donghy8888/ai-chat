/**
 * AI Chat — browser SPA for OpenAI-compatible Chat Completions APIs.
 * Settings and history persist in localStorage. No hardcoded API keys.
 */

(function () {
  "use strict";

  const STORAGE_KEY = "ai-chat-settings-v1";
  const HISTORY_KEY = "ai-chat-history-v1";

  const DEFAULTS = {
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
    systemPrompt: "",
    stream: true,
  };

  /** @type {{ role: string, content: string }[]} */
  let messages = [];
  let settings = loadSettings();
  let abortController = null;
  let isSending = false;

  const $messages = document.getElementById("messages");
  const $composer = document.getElementById("composer");
  const $input = document.getElementById("input");
  const $btnSend = document.getElementById("btnSend");
  const $errorBanner = document.getElementById("errorBanner");
  const $modelBadge = document.getElementById("modelBadge");
  const $settingsModal = document.getElementById("settingsModal");
  const $sidebar = document.getElementById("sidebar");
  const $sidebarBackdrop = document.getElementById("sidebarBackdrop");

  const $settingBaseUrl = document.getElementById("settingBaseUrl");
  const $settingApiKey = document.getElementById("settingApiKey");
  const $settingModel = document.getElementById("settingModel");
  const $settingSystemPrompt = document.getElementById("settingSystemPrompt");
  const $settingStream = document.getElementById("settingStream");

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveHistory() {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages));
  }

  function showError(text) {
    if (!text) {
      $errorBanner.hidden = true;
      $errorBanner.textContent = "";
      return;
    }
    $errorBanner.hidden = false;
    $errorBanner.textContent = text;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Lightweight markdown: fenced code, inline code, bold, italic. */
  function formatContent(text) {
    let s = escapeHtml(text);
    s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code class="lang-${escapeHtml(lang)}">${code.replace(/\n$/, "")}</code></pre>`;
    });
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return s;
  }

  function autoResizeInput() {
    $input.style.height = "auto";
    $input.style.height = Math.min($input.scrollHeight, 160) + "px";
  }

  function scrollToBottom(force) {
    const el = $messages;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (force || nearBottom) el.scrollTop = el.scrollHeight;
  }

  function updateModelBadge() {
    $modelBadge.textContent = settings.model || "未设置模型";
  }

  function setSending(on) {
    isSending = on;
    $btnSend.disabled = on || !$input.value.trim();
    $input.disabled = on;
  }

  function renderMessages() {
    const wrap = document.createElement("div");
    wrap.className = "messages-inner";

    if (messages.length === 0) {
      wrap.innerHTML = `
        <div class="welcome">
          <div class="welcome-icon">💬</div>
          <h2>开始对话</h2>
          <p>在设置中填入 API Base URL、API Key 与模型名称后即可聊天。密钥只保存在本浏览器。</p>
          <div class="welcome-actions">
            <button type="button" class="chip" data-prompt="用一句话介绍你自己">介绍一下你自己</button>
            <button type="button" class="chip" data-prompt="帮我写一段简洁的会议纪要模板">写会议纪要模板</button>
            <button type="button" class="chip" data-prompt="解释什么是大语言模型，用通俗中文">解释大语言模型</button>
          </div>
        </div>`;
      $messages.innerHTML = "";
      $messages.appendChild(wrap);
      wrap.querySelectorAll("[data-prompt]").forEach((btn) => {
        btn.addEventListener("click", () => {
          $input.value = btn.getAttribute("data-prompt");
          autoResizeInput();
          $btnSend.disabled = false;
          $input.focus();
        });
      });
      return;
    }

    messages.forEach((m) => {
      const row = document.createElement("div");
      row.className = `msg ${m.role}`;
      const avatar = m.role === "user" ? "你" : "AI";
      const roleLabel = m.role === "user" ? "你" : "助手";
      const body =
        m.role === "assistant" ? formatContent(m.content) : escapeHtml(m.content);
      row.innerHTML = `
        <div class="msg-avatar">${avatar}</div>
        <div class="msg-body">
          <div class="msg-role">${roleLabel}</div>
          <div class="msg-bubble">${body}</div>
        </div>`;
      wrap.appendChild(row);
    });

    $messages.innerHTML = "";
    $messages.appendChild(wrap);
    scrollToBottom(true);
  }

  function ensureMessagesInner() {
    let wrap = $messages.querySelector(".messages-inner");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "messages-inner";
      $messages.innerHTML = "";
      $messages.appendChild(wrap);
    }
    const welcome = wrap.querySelector(".welcome");
    if (welcome) welcome.remove();
    return wrap;
  }

  function appendStreamingBubble() {
    const wrap = ensureMessagesInner();
    const row = document.createElement("div");
    row.className = "msg assistant streaming";
    row.id = "streamingMsg";
    row.innerHTML = `
      <div class="msg-avatar">AI</div>
      <div class="msg-body">
        <div class="msg-role">助手</div>
        <div class="msg-bubble" id="streamingBubble"></div>
      </div>`;
    wrap.appendChild(row);
    scrollToBottom(true);
    return document.getElementById("streamingBubble");
  }

  function showTypingIndicator() {
    const wrap = ensureMessagesInner();
    if (document.getElementById("typingIndicator")) return;
    const el = document.createElement("div");
    el.className = "typing-row";
    el.id = "typingIndicator";
    el.innerHTML = `
      <div class="msg-avatar" style="background:var(--accent-soft);color:var(--accent)">AI</div>
      <div class="typing-dots"><span></span><span></span><span></span></div>
      <span>正在思考…</span>`;
    wrap.appendChild(el);
    scrollToBottom(true);
  }

  function removeTypingIndicator() {
    const el = document.getElementById("typingIndicator");
    if (el) el.remove();
  }

  function removeStreamingBubble() {
    const el = document.getElementById("streamingMsg");
    if (el) el.remove();
  }

  function openSettings() {
    $settingBaseUrl.value = settings.baseUrl || DEFAULTS.baseUrl;
    $settingApiKey.value = settings.apiKey || "";
    $settingModel.value = settings.model || DEFAULTS.model;
    $settingSystemPrompt.value = settings.systemPrompt || "";
    $settingStream.checked = settings.stream !== false;
    $settingApiKey.type = "password";
    document.getElementById("btnToggleKey").textContent = "显示";
    $settingsModal.hidden = false;
    $settingBaseUrl.focus();
  }

  function closeSettings() {
    $settingsModal.hidden = true;
  }

  function applySettingsFromForm() {
    const baseUrl = ($settingBaseUrl.value || DEFAULTS.baseUrl)
      .trim()
      .replace(/\/+$/, "");
    settings = {
      baseUrl: baseUrl || DEFAULTS.baseUrl,
      apiKey: ($settingApiKey.value || "").trim(),
      model: ($settingModel.value || DEFAULTS.model).trim() || DEFAULTS.model,
      systemPrompt: ($settingSystemPrompt.value || "").trim(),
      stream: $settingStream.checked,
    };
    saveSettings();
    updateModelBadge();
    closeSettings();
    showError("");
  }

  function normalizeBaseUrl(url) {
    return (url || DEFAULTS.baseUrl).replace(/\/+$/, "");
  }

  function buildPayload(useStream) {
    const apiMessages = [];
    if (settings.systemPrompt) {
      apiMessages.push({ role: "system", content: settings.systemPrompt });
    }
    for (const m of messages) {
      apiMessages.push({ role: m.role, content: m.content });
    }
    return {
      model: settings.model,
      messages: apiMessages,
      stream: !!useStream,
    };
  }

  async function safeReadText(res) {
    try {
      return await res.text();
    } catch {
      return "";
    }
  }

  function makeHttpError(status, body) {
    let detail = "";
    try {
      const j = JSON.parse(body);
      detail = j?.error?.message || j?.message || body;
    } catch {
      detail = body;
    }
    detail = (detail || "").slice(0, 400);

    if (status === 401 || status === 403) {
      return new Error(
        `认证失败（${status}）：请检查 API Key 是否正确、是否有权限。\n${detail}`
      );
    }
    if (status === 404) {
      return new Error(
        `接口不存在（404）：请检查 Base URL 是否正确（应指向 …/v1）。\n${detail}`
      );
    }
    if (status === 429) {
      return new Error(`请求过于频繁（429）：请稍后再试。\n${detail}`);
    }
    return new Error(`请求失败（HTTP ${status}）\n${detail}`);
  }

  function extractContent(data) {
    return (
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.delta?.content ??
      data?.choices?.[0]?.text ??
      ""
    );
  }

  async function callNonStreaming() {
    const url = `${normalizeBaseUrl(settings.baseUrl)}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(buildPayload(false)),
      signal: abortController.signal,
    });

    if (!res.ok) {
      throw makeHttpError(res.status, await safeReadText(res));
    }

    const data = await res.json();
    return String(extractContent(data) ?? "");
  }

  /**
   * Stream SSE deltas. Calls onDelta(chunk) for each text piece.
   * Returns the full assistant text. Throws STREAM_UNSUPPORTED or HTTP errors.
   */
  async function callStreaming(onDelta) {
    const url = `${normalizeBaseUrl(settings.baseUrl)}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify(buildPayload(true)),
      signal: abortController.signal,
    });

    if (!res.ok) {
      throw makeHttpError(res.status, await safeReadText(res));
    }

    const ctype = (res.headers.get("content-type") || "").toLowerCase();
    if (ctype.includes("application/json") && !ctype.includes("event-stream")) {
      const data = await res.json();
      const content = String(extractContent(data) ?? "");
      if (content) onDelta(content);
      return content;
    }

    if (!res.body || !res.body.getReader) {
      throw new Error("STREAM_UNSUPPORTED");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let full = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop() || "";

      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const delta =
            json?.choices?.[0]?.delta?.content ??
            json?.choices?.[0]?.text ??
            "";
          if (delta) {
            full += delta;
            onDelta(delta);
          }
        } catch {
          /* ignore malformed SSE chunk */
        }
      }
    }

    return full;
  }

  function isHardHttpError(err) {
    const msg = String(err && err.message ? err.message : err);
    return (
      msg.includes("认证失败") ||
      msg.includes("接口不存在") ||
      msg.includes("请求过于频繁") ||
      /HTTP [45]\d\d/.test(msg)
    );
  }

  async function sendMessage(text) {
    const content = (text || "").trim();
    if (!content || isSending) return;

    showError("");

    if (!settings.apiKey) {
      showError("尚未设置 API Key。请点击右上角「设置」，填入你的密钥后再发送。");
      openSettings();
      return;
    }
    if (!settings.model) {
      showError("尚未设置模型名称。请在设置中填写，例如 gpt-4o-mini。");
      openSettings();
      return;
    }

    messages.push({ role: "user", content });
    saveHistory();
    $input.value = "";
    autoResizeInput();
    renderMessages();
    setSending(true);
    abortController = new AbortController();
    showTypingIndicator();

    let assistantText = "";

    try {
      const preferStream = settings.stream !== false;

      if (preferStream) {
        try {
          removeTypingIndicator();
          const bubble = appendStreamingBubble();
          let displayed = "";
          assistantText = await callStreaming((delta) => {
            displayed += delta;
            bubble.textContent = displayed;
            scrollToBottom(false);
          });
          if (!assistantText && displayed) assistantText = displayed;
        } catch (streamErr) {
          if (streamErr.name === "AbortError") throw streamErr;
          removeStreamingBubble();
          if (isHardHttpError(streamErr)) throw streamErr;
          // Soft failure (no SSE / CORS oddities): fall back to non-stream
          showTypingIndicator();
          assistantText = await callNonStreaming();
        }
      } else {
        assistantText = await callNonStreaming();
      }

      removeTypingIndicator();
      removeStreamingBubble();

      if (!assistantText) {
        throw new Error("模型返回了空回复。");
      }

      messages.push({ role: "assistant", content: assistantText });
      saveHistory();
      renderMessages();
    } catch (err) {
      removeTypingIndicator();
      removeStreamingBubble();
      saveHistory();
      renderMessages();

      if (err.name === "AbortError") {
        showError("已取消请求。");
      } else if (
        err instanceof TypeError &&
        /fetch|network|Failed|Load/i.test(err.message)
      ) {
        showError(
          "网络错误：无法连接到 API。请检查 Base URL、网络，或确认服务端是否允许浏览器跨域（CORS）。\n" +
            err.message
        );
      } else {
        showError(err.message || String(err));
      }
    } finally {
      abortController = null;
      setSending(false);
      $input.focus();
    }
  }

  $composer.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage($input.value);
  });

  $input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage($input.value);
    }
  });

  $input.addEventListener("input", () => {
    autoResizeInput();
    $btnSend.disabled = isSending || !$input.value.trim();
  });

  document.getElementById("btnNewChat").addEventListener("click", () => {
    if (isSending && abortController) abortController.abort();
    messages = [];
    saveHistory();
    showError("");
    renderMessages();
    closeSidebar();
    $input.focus();
  });

  document.getElementById("btnClearHistory").addEventListener("click", () => {
    if (isSending && abortController) abortController.abort();
    if (messages.length && !confirm("确定清空当前对话吗？")) return;
    messages = [];
    saveHistory();
    showError("");
    renderMessages();
    closeSidebar();
  });

  document.getElementById("btnOpenSettings").addEventListener("click", () => {
    closeSidebar();
    openSettings();
  });
  document.getElementById("btnOpenSettingsTop").addEventListener("click", openSettings);
  document.getElementById("btnCloseSettings").addEventListener("click", closeSettings);
  document.getElementById("btnCancelSettings").addEventListener("click", closeSettings);
  document.getElementById("btnSaveSettings").addEventListener("click", applySettingsFromForm);

  document.getElementById("btnToggleKey").addEventListener("click", () => {
    const btn = document.getElementById("btnToggleKey");
    if ($settingApiKey.type === "password") {
      $settingApiKey.type = "text";
      btn.textContent = "隐藏";
    } else {
      $settingApiKey.type = "password";
      btn.textContent = "显示";
    }
  });

  $settingsModal.addEventListener("click", (e) => {
    if (e.target === $settingsModal) closeSettings();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$settingsModal.hidden) closeSettings();
  });

  function openSidebar() {
    $sidebar.classList.add("open");
    $sidebarBackdrop.hidden = false;
  }

  function closeSidebar() {
    $sidebar.classList.remove("open");
    $sidebarBackdrop.hidden = true;
  }

  document.getElementById("btnToggleSidebar").addEventListener("click", () => {
    if ($sidebar.classList.contains("open")) closeSidebar();
    else openSidebar();
  });
  $sidebarBackdrop.addEventListener("click", closeSidebar);

  /* iPad/iOS Safari: keep layout usable when the on-screen keyboard opens */
  function syncViewportHeight() {
    try {
      const vv = window.visualViewport;
      if (!vv) return;
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--keyboard-inset", offset + "px");
      const app = document.querySelector(".app");
      if (app) {
        // Prefer visualViewport height so the composer stays above the keyboard
        app.style.height = vv.height + "px";
      }
      scrollToBottom(false);
    } catch {
      /* ignore */
    }
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncViewportHeight);
    window.visualViewport.addEventListener("scroll", syncViewportHeight);
    syncViewportHeight();
  }

  // Soft keyboard: scroll focused input into view inside composer
  $input.addEventListener("focus", () => {
    setTimeout(() => {
      syncViewportHeight();
      try {
        $input.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } catch {
        /* ignore */
      }
    }, 80);
  });

  messages = loadHistory();
  updateModelBadge();
  renderMessages();
  $btnSend.disabled = true;
  // Avoid auto-focus on touch tablets (opens keyboard immediately)
  const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  if (!coarse) $input.focus();
})();
