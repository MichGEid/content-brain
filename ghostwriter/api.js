/* =====================================================================
   Ghostwriter — api.js
   Provider-abstraksjon. Default = Ollama lokalt. Pluggbar for Claude/Gemini.

   Bruk:
     const text = await Ghostwriter.api.generate({
       provider: "ollama",
       model: "llama3.1:8b",
       system: "...",
       prompt: "...",
       options: { temperature: 0.5 },
       signal: abortController.signal,
     });
   ===================================================================== */

(() => {
  "use strict";

  // ----------------------------- API key storage -----------------------------

  const API_KEYS_STORAGE = "ghostwriter.apiKeys";

  function getApiKey(provider) {
    try {
      const keys = JSON.parse(localStorage.getItem(API_KEYS_STORAGE) || "{}");
      return keys[provider] || null;
    } catch (e) {
      return null;
    }
  }

  function setApiKey(provider, key) {
    try {
      const keys = JSON.parse(localStorage.getItem(API_KEYS_STORAGE) || "{}");
      if (key) {
        keys[provider] = key;
      } else {
        delete keys[provider];
      }
      localStorage.setItem(API_KEYS_STORAGE, JSON.stringify(keys));
      return true;
    } catch (e) {
      return false;
    }
  }

  function hasApiKey(provider) {
    return !!getApiKey(provider);
  }

  // ----------------------------- providers -----------------------------

  const OLLAMA_BASE = "http://localhost:11434";
  const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
  const CLAUDE_BASE = "https://api.anthropic.com/v1";

  /**
   * Ollama: kjører lokalt på din maskin. Ingen API-nøkkel.
   * https://github.com/ollama/ollama/blob/main/docs/api.md
   *
   * Aksepterer enten:
   *   - { system, prompt }: enkelt-turn (legacy)
   *   - { system, messages: [{role, content}] }: multi-turn (chat)
   *
   * Bruker /api/chat for multi-turn (alltid — system + user kan
   * mappes til chat-meldinger uten ekstra logikk).
   */
  async function generateOllama({ model, system, prompt, messages, options, signal }) {
    // Bygg messages-array for /api/chat
    const chatMessages = [];
    if (system) chatMessages.push({ role: "system", content: system });

    if (messages && messages.length > 0) {
      // Multi-turn: bruk gitt messages
      for (const m of messages) {
        chatMessages.push({ role: m.role, content: m.content });
      }
    } else if (prompt) {
      // Single-turn fallback
      chatMessages.push({ role: "user", content: prompt });
    }

    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: chatMessages,
        stream: false,
        options: options || {},
      }),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Ollama feilet (${res.status}): ${errText || res.statusText}`);
    }

    const data = await res.json();
    const text = data?.message?.content;
    if (!text) {
      throw new Error("Ollama returnerte tomt svar.");
    }

    return {
      text,
      meta: {
        model,
        tokens: data.eval_count || null,
        durationMs: data.total_duration ? Math.round(data.total_duration / 1e6) : null,
        tokensPerSec: data.eval_count && data.eval_duration
          ? +(data.eval_count / (data.eval_duration / 1e9)).toFixed(1)
          : null,
      },
    };
  }

  /**
   * Liste tilgjengelige Ollama-modeller. Brukes til model-velger i UI.
   */
  async function listOllamaModels() {
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models || []).map(m => m.name);
    } catch (e) {
      return [];
    }
  }

  /**
   * Sjekk om Ollama-serveren svarer. Brukes til preflight i UI.
   */
  async function pingOllama(signal) {
    try {
      const res = await fetch(`${OLLAMA_BASE}/`, { signal });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  // ----------------------------- Gemini provider -----------------------------

  /**
   * Google Gemini API. Gratis tier: 15 req/min for flash-modeller, 2 req/min for pro.
   * https://ai.google.dev/gemini-api/docs
   *
   * API-nøkkel hentes fra https://aistudio.google.com/app/apikey
   * Lagres i localStorage under "ghostwriter.apiKeys" — aldri sendt videre.
   */
  /**
   * Wait for `ms` milliseconds, but abort if signal triggers.
   * Brukes for auto-retry på rate limits.
   */
  function waitWithAbort(ms, signal, onTick) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const interval = setInterval(() => {
        if (signal?.aborted) {
          clearInterval(interval);
          clearTimeout(timer);
          const e = new Error("Aborted during wait");
          e.name = "AbortError";
          reject(e);
          return;
        }
        if (onTick) onTick(Math.max(0, ms - (Date.now() - start)));
      }, 250);
      const timer = setTimeout(() => {
        clearInterval(interval);
        resolve();
      }, ms);
    });
  }

  async function generateGemini({ model, system, prompt, messages, options, signal, useUrlContext, _retryAttempt = 0 }) {
    const apiKey = getApiKey("gemini");
    if (!apiKey) {
      throw new Error("Mangler Gemini API-nøkkel. Klikk 🔑-knappen i Provider-velgeren for å sette den.");
    }

    // Bygg contents-array for Gemini sitt multi-turn format.
    // Gemini bruker role: "user" og "model" (ikke "assistant").
    const contents = [];
    if (messages && messages.length > 0) {
      for (const m of messages) {
        const role = m.role === "assistant" ? "model" : m.role;  // normaliser
        contents.push({ role, parts: [{ text: m.content }] });
      }
    } else if (prompt) {
      contents.push({ role: "user", parts: [{ text: prompt }] });
    }

    // KRITISK: Gemini 2.5+ har "thinking mode" som bruker tokens internt
    // før synlig output. Disse teller mot maxOutputTokens. Hvis vi setter
    // maxOutputTokens for lavt, kan modellen brenne hele budsjettet på
    // thinking og produsere trunkert/tomt visible output.
    //
    // Fix: gi rikelig med maxOutputTokens og disable thinking helt for
    // våre use cases. Vi trenger ikke chain-of-thought for LinkedIn-utkast
    // — Voice Profile + system prompt gir all instruksjon modellen trenger.
    const isThinkingModel = /^gemini-(2\.5|3|4)/i.test(model);
    const requestedMax = options?.num_predict || 1500;
    // Gi 2x headroom + minimum 4000 for å garantere at korte utkast
    // ikke trunkkeres på grunn av token-grenser
    const safeMaxTokens = Math.max(requestedMax * 2, 4000);

    const generationConfig = {
      maxOutputTokens: safeMaxTokens,
      temperature: options?.temperature ?? 0.5,
    };

    if (isThinkingModel) {
      // Disable thinking helt — alle tokens går til synlig output
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig,
    };

    // url_context: lar modellen hente URL-er den ser i prompten.
    // Brukes i article-reaction-modus når Michel kun limer inn URL,
    // ikke artikkel-tekst. https://ai.google.dev/gemini-api/docs/url-context
    if (useUrlContext) {
      body.tools = [{ url_context: {} }];
    }

    const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const t0 = Date.now();

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      const errMsg = errBody?.error?.message || res.statusText;
      // Vanlige feilkoder: 400 = ugyldig request, 401/403 = nøkkel-problem, 429 = rate limit
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Gemini API-nøkkel avvist (${res.status}). Sjekk at nøkkelen er gyldig.`);
      }
      if (res.status === 429) {
        // Forsøk å hente retryDelay fra Google sin error-detail
        const retry = (errBody?.error?.details || [])
          .find(d => d?.["@type"]?.includes("RetryInfo"))?.retryDelay;
        const retryMatch = retry?.match(/(\d+(?:\.\d+)?)\s*s/);
        const retrySeconds = retryMatch ? parseFloat(retryMatch[1]) : null;

        // Auto-retry én gang hvis ventetid er rimelig (≤ 90s) og vi ikke
        // allerede har retried. Honorer abort-signal.
        const MAX_RETRY_SECONDS = 90;
        if (retrySeconds && retrySeconds <= MAX_RETRY_SECONDS && _retryAttempt === 0) {
          const ms = Math.ceil(retrySeconds * 1000) + 500;   // litt slack
          // Notify UI via custom event så app-en kan vise nedteller
          window.dispatchEvent(new CustomEvent("ghostwriter:rate-limited", {
            detail: { model, waitMs: ms, retrySeconds },
          }));
          try {
            await waitWithAbort(ms, signal, (remaining) => {
              window.dispatchEvent(new CustomEvent("ghostwriter:rate-limit-tick", {
                detail: { remainingMs: remaining },
              }));
            });
          } catch (e) {
            if (e.name === "AbortError") throw e;
          }
          window.dispatchEvent(new CustomEvent("ghostwriter:rate-limit-resolved"));
          // Rekursivt kall med _retryAttempt = 1 for å forhindre infinite loop
          return generateGemini({ model, system, prompt, messages, options, signal, useUrlContext, _retryAttempt: 1 });
        }

        const retryHint = retry ? ` Foreslått ventetid: ${retry}.` : "";
        const isPro = /pro/i.test(model);
        const limitHint = isPro
          ? " Gemini 2.5 Pro gratis tier er ~5 req/min og ~25 req/dag. Vurder å bytte til gemini-2.5-flash (10 req/min, 250/dag) for testing."
          : " Gratis tier varierer per modell — sjekk Google AI Studio.";
        throw new Error(`Gemini rate limit (429) på ${model}.${limitHint}${retryHint}`);
      }
      if (res.status === 400) {
        // 400-feil inkluderer ofte detaljer om hva som er galt (f.eks. url_context ikke tilgjengelig)
        throw new Error(`Gemini avviste forespørselen (400): ${errMsg}`);
      }
      throw new Error(`Gemini feilet (${res.status}): ${errMsg}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const finishReason = data?.candidates?.[0]?.finishReason;

    if (!text) {
      const blockReason = data?.promptFeedback?.blockReason || finishReason;
      throw new Error(`Gemini returnerte tomt svar${blockReason ? ` (${blockReason})` : ""}.`);
    }

    const durationMs = Date.now() - t0;
    const promptTokens = data?.usageMetadata?.promptTokenCount || null;
    const outputTokens = data?.usageMetadata?.candidatesTokenCount || null;
    const thoughtsTokens = data?.usageMetadata?.thoughtsTokenCount || 0;

    // Hvis output ble trunkert, gi tydelig advarsel via meta-data
    let warning = null;
    if (finishReason === "MAX_TOKENS") {
      warning = `Output trunkert (MAX_TOKENS truffet). Output: ${outputTokens || "?"}, thinking: ${thoughtsTokens}.`;
      console.warn("[Gemini]", warning);
    } else if (finishReason === "RECITATION") {
      warning = `Gemini blokkerte output (RECITATION — antakelig fordi den nesten siterte kjent kilde-tekst).`;
      console.warn("[Gemini]", warning);
    } else if (finishReason && finishReason !== "STOP") {
      warning = `Uventet finishReason: ${finishReason}`;
      console.warn("[Gemini]", warning);
    }

    return {
      text,
      meta: {
        model,
        tokens: outputTokens,
        promptTokens,
        thoughtsTokens: thoughtsTokens || null,
        durationMs,
        tokensPerSec: outputTokens && durationMs
          ? +(outputTokens / (durationMs / 1000)).toFixed(1)
          : null,
        finishReason: finishReason || null,
        warning,
      },
    };
  }

  /**
   * Liste tilgjengelige Gemini-modeller fra API.
   * Returnerer [{name, displayName, description}, ...] eller fallback-liste.
   */
  async function listGeminiModels() {
    const apiKey = getApiKey("gemini");
    if (!apiKey) {
      // Uten nøkkel — returner statisk fallback så UI har noe å vise
      return ["gemini-2.0-flash", "gemini-2.0-pro", "gemini-1.5-pro", "gemini-1.5-flash"];
    }
    try {
      const res = await fetch(`${GEMINI_BASE}/models?key=${encodeURIComponent(apiKey)}`);
      if (!res.ok) {
        return ["gemini-2.0-flash", "gemini-2.0-pro"];
      }
      const data = await res.json();
      // Filtrer modeller som faktisk støtter generateContent og strip "models/"-prefix
      return (data.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map(m => m.name.replace(/^models\//, ""))
        .filter(n => /^gemini-/.test(n))
        .sort();
    } catch (e) {
      return ["gemini-2.0-flash", "gemini-2.0-pro"];
    }
  }

  /**
   * Verifiser at nøkkelen er gyldig ved å treffe models-endpointet.
   * Brukes til provider-status i UI.
   */
  async function pingGemini(signal) {
    const apiKey = getApiKey("gemini");
    if (!apiKey) return false;
    try {
      const res = await fetch(`${GEMINI_BASE}/models?key=${encodeURIComponent(apiKey)}`, { signal });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  // ----------------------------- Claude (Anthropic) provider -----------------------------

  /**
   * Anthropic Claude API. Krever API-nøkkel fra console.anthropic.com.
   * Ikke gratis-tier, men kostnadene er lave for personlig bruk:
   * - Sonnet 4.6: ~$3/M input, $15/M output ≈ $0.012/utkast
   * - Opus 4.6:   ~$15/M input, $75/M output ≈ $0.06/utkast
   * - Haiku 4.5:  ~$0.80/M input, $4/M output ≈ $0.003/utkast
   *
   * Bruker `anthropic-dangerous-direct-browser-access: true` for å tillate
   * direkte browser-kall. API-nøkkelen lagres lokalt i localStorage.
   * https://docs.anthropic.com/en/api/messages
   */
  async function generateClaude({ model, system, prompt, messages, options, signal, _retryAttempt = 0 }) {
    const apiKey = getApiKey("claude");
    if (!apiKey) {
      throw new Error("Mangler Claude API-nøkkel. Klikk 🔑-knappen i Provider-velgeren for å sette den.");
    }

    // Bygg messages-array for Anthropic
    const apiMessages = [];
    if (messages && messages.length > 0) {
      for (const m of messages) {
        // Anthropic bruker user/assistant — normaliser
        const role = m.role === "model" ? "assistant" : m.role;
        if (role === "system") continue;   // system går i top-level system-felt
        apiMessages.push({ role, content: m.content });
      }
    } else if (prompt) {
      apiMessages.push({ role: "user", content: prompt });
    }

    const body = {
      model,
      max_tokens: options?.num_predict || 1500,
      system: system || undefined,
      messages: apiMessages,
      temperature: options?.temperature ?? 0.5,
    };

    const t0 = Date.now();
    const res = await fetch(`${CLAUDE_BASE}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      const errMsg = errBody?.error?.message || res.statusText;

      if (res.status === 401 || res.status === 403) {
        throw new Error(`Claude API-nøkkel avvist (${res.status}). Sjekk at nøkkelen er gyldig.`);
      }
      if (res.status === 429) {
        // Auto-retry hvis Retry-After header finnes og rimelig
        const retryAfter = parseInt(res.headers.get("retry-after") || "0", 10);
        const MAX_RETRY_SECONDS = 90;
        if (retryAfter > 0 && retryAfter <= MAX_RETRY_SECONDS && _retryAttempt === 0) {
          const ms = retryAfter * 1000 + 500;
          window.dispatchEvent(new CustomEvent("ghostwriter:rate-limited", {
            detail: { model, waitMs: ms, retrySeconds: retryAfter },
          }));
          try {
            await waitWithAbort(ms, signal, (remaining) => {
              window.dispatchEvent(new CustomEvent("ghostwriter:rate-limit-tick", {
                detail: { remainingMs: remaining },
              }));
            });
          } catch (e) {
            if (e.name === "AbortError") throw e;
          }
          window.dispatchEvent(new CustomEvent("ghostwriter:rate-limit-resolved"));
          return generateClaude({ model, system, prompt, messages, options, signal, _retryAttempt: 1 });
        }
        throw new Error(`Claude rate limit (429). Vent og prøv igjen.${retryAfter ? ` Foreslått ventetid: ${retryAfter}s.` : ""}`);
      }
      if (res.status === 400) {
        throw new Error(`Claude avviste forespørselen (400): ${errMsg}`);
      }
      throw new Error(`Claude feilet (${res.status}): ${errMsg}`);
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text;
    const stopReason = data?.stop_reason;
    if (!text) {
      throw new Error(`Claude returnerte tomt svar${stopReason ? ` (${stopReason})` : ""}.`);
    }

    const durationMs = Date.now() - t0;
    const inputTokens = data?.usage?.input_tokens || null;
    const outputTokens = data?.usage?.output_tokens || null;

    let warning = null;
    if (stopReason === "max_tokens") {
      warning = `Output trunkert (max_tokens truffet). Output: ${outputTokens || "?"} tokens.`;
      console.warn("[Claude]", warning);
    }

    return {
      text,
      meta: {
        model,
        tokens: outputTokens,
        promptTokens: inputTokens,
        durationMs,
        tokensPerSec: outputTokens && durationMs
          ? +(outputTokens / (durationMs / 1000)).toFixed(1)
          : null,
        finishReason: stopReason || null,
        warning,
      },
    };
  }

  /**
   * Liste tilgjengelige Claude-modeller. Anthropic har en /v1/models-endpoint
   * men vi serverer en kuratert liste av modeller egnet for skriving for
   * å unngå overflod av varianter.
   */
  async function listClaudeModels() {
    return [
      "claude-sonnet-4-6",   // best balance, anbefalt
      "claude-opus-4-6",     // høyest kvalitet, dyrere
      "claude-haiku-4-5",    // raskest, billigst
    ];
  }

  /**
   * Verifiser at Claude-nøkkelen er gyldig via et minimal-kall.
   */
  async function pingClaude(signal) {
    const apiKey = getApiKey("claude");
    if (!apiKey) return false;
    try {
      const res = await fetch(`${CLAUDE_BASE}/models`, {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        signal,
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  // ----------------------------- dispatch -----------------------------

  const PROVIDERS = {
    ollama: {
      label: "Ollama (lokalt)",
      defaultModel: "llama3.1:8b",
      generate: generateOllama,
      listModels: listOllamaModels,
      ping: pingOllama,
      requiresApiKey: false,
    },
    gemini: {
      label: "Gemini API",
      defaultModel: "gemini-2.0-flash",
      generate: generateGemini,
      listModels: listGeminiModels,
      ping: pingGemini,
      requiresApiKey: true,
      apiKeyHelp: "Hent gratis nøkkel fra https://aistudio.google.com/app/apikey — ingen kredittkort nødvendig.",
    },
    claude: {
      label: "Claude API",
      defaultModel: "claude-sonnet-4-6",
      generate: generateClaude,
      listModels: listClaudeModels,
      ping: pingClaude,
      requiresApiKey: true,
      apiKeyHelp: "Hent nøkkel fra https://console.anthropic.com/settings/keys (krever konto med kreditt). ~$0.01-0.05 per utkast — i praksis gratis for personlig bruk.",
    },
  };

  async function generate({ provider, model, system, prompt, messages, options, signal, useUrlContext }) {
    const p = PROVIDERS[provider];
    if (!p) throw new Error(`Ukjent provider: ${provider}`);
    if (!model) model = p.defaultModel;
    return p.generate({ model, system, prompt, messages, options, signal, useUrlContext });
  }

  function listProviders() {
    return Object.keys(PROVIDERS).map(key => ({
      key,
      ...PROVIDERS[key],
    }));
  }

  function getProvider(key) {
    return PROVIDERS[key] || null;
  }

  // ----------------------------- export -----------------------------

  window.Ghostwriter = window.Ghostwriter || {};
  window.Ghostwriter.api = {
    generate,
    listProviders,
    getProvider,
    getApiKey,
    setApiKey,
    hasApiKey,
  };
})();
