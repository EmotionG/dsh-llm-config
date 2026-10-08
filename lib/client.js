window.__ModuleLoader__.load({ id: "dsh-llm-config", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/ModelProvidersSection.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var NS = "llm-config";
var PROTOCOLS = [
  ["openai-chat", "OpenAI Chat"],
  ["openai-responses", "OpenAI Responses"],
  ["anthropic-messages", "Anthropic"],
  ["google-gemini", "Gemini"]
];
var AUTH_SCHEMES = [
  ["", "protocolDefault"],
  ["bearer", "bearer"],
  ["x-api-key", "xApiKey"],
  ["query", "queryParam"],
  ["none", "noAuth"]
];
function credentialRefFor(providerId) {
  const cleaned = providerId.replace(/[^A-Za-z0-9_]/g, "_");
  if (cleaned.length === 0) return "";
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`;
}
var text = (v) => v === null || v === void 0 ? "" : String(v);
function emptyModel() {
  return {
    id: "",
    name: "",
    protocol: "",
    contextWindow: "",
    maxTokens: "",
    temperature: "",
    topP: "",
    streamIdleTimeoutMs: "",
    reasoningEfforts: "",
    defaultReasoningEffort: "",
    stop: "",
    inputModalities: ["text"],
    effortMode: "none",
    effortField: "",
    effortValues: "",
    effortDefault: "",
    extraBody: "",
    extraHeaders: ""
  };
}
function emptyProvider() {
  return {
    id: "",
    displayName: "",
    enabled: true,
    protocol: "openai-chat",
    baseURL: "",
    authScheme: "",
    apiKeyEnv: "",
    apiKeyHeader: "",
    apiKeyPrefix: "",
    maxTokens: "",
    defaultContextWindow: "",
    streamIdleTimeoutMs: "",
    modelExcludePatterns: "",
    retryMode: "normal",
    retryMax: "",
    models: []
  };
}
function toModelRow(raw) {
  const effort = typeof raw.effort === "object" && raw.effort !== null ? raw.effort : {};
  const values = Array.isArray(effort.values) ? effort.values : [];
  return {
    id: text(raw.id),
    name: text(raw.name),
    protocol: text(raw.protocol),
    contextWindow: text(raw.contextWindow),
    maxTokens: text(raw.maxTokens),
    temperature: text(raw.temperature),
    topP: text(raw.topP),
    streamIdleTimeoutMs: text(raw.streamIdleTimeoutMs),
    reasoningEfforts: (Array.isArray(raw.reasoningEfforts) ? raw.reasoningEfforts : []).join(", "),
    defaultReasoningEffort: text(raw.defaultReasoningEffort),
    stop: (Array.isArray(raw.stop) ? raw.stop : []).join(", "),
    inputModalities: Array.isArray(raw.inputModalities) && raw.inputModalities.length > 0 ? raw.inputModalities : ["text"],
    effortMode: text(effort.mode) || "none",
    effortField: text(effort.field),
    effortValues: values.join(", "),
    effortDefault: text(effort.default),
    extraBody: raw.extraBody === void 0 || raw.extraBody === null ? "" : JSON.stringify(raw.extraBody, null, 2),
    extraHeaders: raw.extraHeaders === void 0 || raw.extraHeaders === null ? "" : JSON.stringify(raw.extraHeaders, null, 2)
  };
}
function toProviderRow(raw) {
  const retryRaw = raw.retry;
  let retryMode = "normal";
  let retryMax = "";
  if (typeof retryRaw === "number") {
    retryMax = String(retryRaw);
  } else if (typeof retryRaw === "object" && retryRaw !== null) {
    const record = retryRaw;
    if (record.mode === "always") retryMode = "always";
    if (typeof record.maxRetries === "number") retryMax = String(record.maxRetries);
  }
  return {
    id: text(raw.id),
    displayName: text(raw.displayName),
    enabled: raw.enabled !== false,
    protocol: text(raw.protocol) || "openai-chat",
    baseURL: text(raw.baseURL),
    authScheme: text(raw.authScheme),
    apiKeyEnv: text(raw.apiKeyEnv),
    apiKeyHeader: text(raw.apiKeyHeader),
    apiKeyPrefix: text(raw.apiKeyPrefix),
    maxTokens: text(raw.maxTokens),
    defaultContextWindow: text(raw.defaultContextWindow),
    streamIdleTimeoutMs: text(raw.streamIdleTimeoutMs),
    modelExcludePatterns: (Array.isArray(raw.modelExcludePatterns) ? raw.modelExcludePatterns : []).join(", "),
    retryMode,
    retryMax,
    models: (Array.isArray(raw.models) ? raw.models : []).map((m) => toModelRow(m))
  };
}
var numOrUndef = (v) => {
  const s = v.trim();
  if (s.length === 0) return void 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : void 0;
};
var listOrUndef = (v) => {
  const parts = v.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  return parts.length > 0 ? parts : void 0;
};
var jsonOrUndef = (v) => {
  const s = v.trim();
  if (s.length === 0) return void 0;
  const parsed = JSON.parse(s);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("must be a JSON object");
  }
  return parsed;
};
function modelToJson(m) {
  const out = { id: m.id.trim() };
  if (m.name.trim().length > 0) out.name = m.name.trim();
  if (m.protocol.length > 0) out.protocol = m.protocol;
  const cw = numOrUndef(m.contextWindow);
  if (cw !== void 0) out.contextWindow = cw;
  const mt = numOrUndef(m.maxTokens);
  if (mt !== void 0) out.maxTokens = mt;
  const temp = numOrUndef(m.temperature);
  if (temp !== void 0) out.temperature = temp;
  const topP = numOrUndef(m.topP);
  if (topP !== void 0) out.topP = topP;
  const sit = numOrUndef(m.streamIdleTimeoutMs);
  if (sit !== void 0) out.streamIdleTimeoutMs = sit;
  const efforts = listOrUndef(m.reasoningEfforts);
  if (efforts !== void 0) out.reasoningEfforts = efforts;
  if (m.defaultReasoningEffort.trim().length > 0) out.defaultReasoningEffort = m.defaultReasoningEffort.trim();
  const stop = listOrUndef(m.stop);
  if (stop !== void 0) out.stop = stop;
  out.inputModalities = m.inputModalities;
  if (m.effortMode !== "none") {
    const values = listOrUndef(m.effortValues) ?? [];
    out.effort = {
      mode: m.effortMode,
      ...m.effortField.trim().length > 0 ? { field: m.effortField.trim() } : {},
      values,
      ...m.effortDefault.trim().length > 0 ? { default: m.effortDefault.trim() } : {}
    };
  }
  const eb = jsonOrUndef(m.extraBody);
  if (eb !== void 0) out.extraBody = eb;
  const eh = jsonOrUndef(m.extraHeaders);
  if (eh !== void 0) out.extraHeaders = eh;
  return out;
}
function providerToJson(p) {
  const out = {
    id: p.id.trim(),
    enabled: p.enabled,
    protocol: p.protocol,
    baseURL: p.baseURL.trim(),
    models: p.models.map(modelToJson).filter((m) => String(m.id).length > 0)
  };
  if (p.displayName.trim().length > 0) out.displayName = p.displayName.trim();
  if (p.authScheme.length > 0) out.authScheme = p.authScheme;
  if (p.apiKeyEnv.trim().length > 0) out.apiKeyEnv = p.apiKeyEnv.trim();
  if (p.apiKeyHeader.trim().length > 0) out.apiKeyHeader = p.apiKeyHeader.trim();
  if (p.apiKeyPrefix.length > 0) out.apiKeyPrefix = p.apiKeyPrefix;
  const mt = numOrUndef(p.maxTokens);
  if (mt !== void 0) out.maxTokens = mt;
  const cw = numOrUndef(p.defaultContextWindow);
  if (cw !== void 0) out.defaultContextWindow = cw;
  const sit = numOrUndef(p.streamIdleTimeoutMs);
  if (sit !== void 0) out.streamIdleTimeoutMs = sit;
  const ex = listOrUndef(p.modelExcludePatterns);
  if (ex !== void 0) out.modelExcludePatterns = ex;
  const retryMax = numOrUndef(p.retryMax);
  if (p.retryMode === "always") {
    out.retry = { mode: "always" };
  } else if (retryMax !== void 0) {
    out.retry = retryMax;
  }
  return out;
}
function Field(props) {
  const classes = ["llmcfg-field"];
  if (props.grow === true) classes.push("llmcfg-field--grow");
  if (props.className !== void 0) classes.push(props.className);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: classes.join(" "), title: props.hint, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "llmcfg-label", children: props.label }),
    props.children
  ] });
}
function modelSummary(m) {
  const bits = [];
  if (m.name.trim().length > 0 && m.name.trim() !== m.id.trim()) bits.push(m.name.trim());
  if (m.contextWindow.trim().length > 0) bits.push(fmtCompact(m.contextWindow.trim()));
  if (m.maxTokens.trim().length > 0) bits.push(`out ${fmtCompact(m.maxTokens.trim())}`);
  if (m.inputModalities.includes("image")) bits.push("image");
  return bits.join(" \xB7 ");
}
function fmtCompact(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || raw.trim().length === 0) return raw;
  if (n >= 1e6) {
    const m = n / 1e6;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (n >= 1e3 && Number.isInteger(n / 1e3)) return `${n / 1e3}k`;
  return raw;
}
function catalogOptionLabel(c) {
  const bits = [c.providerName ?? c.provider];
  const cw = c.facts.contextWindow;
  const mt = c.facts.maxTokens;
  if (cw !== void 0 || mt !== void 0) {
    bits.push([
      cw === void 0 ? "\u2014" : fmtCompact(String(cw)),
      mt === void 0 ? "\u2014" : fmtCompact(String(mt))
    ].join(" / "));
  }
  if (c.facts.inputModalities !== void 0) bits.push(c.facts.inputModalities.join("+"));
  if (c.facts.reasoningEfforts !== void 0) bits.push(c.facts.reasoningEfforts.join("/"));
  return bits.join(" \xB7 ");
}
function Section(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-sec", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "llmcfg-sectitle", children: props.title }),
    props.children
  ] });
}
function ModelProvidersSection(props) {
  const { t, api } = props;
  const [loading, setLoading] = (0, import_react.useState)(true);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const [notice, setNotice] = (0, import_react.useState)(null);
  const [rows, setRows] = (0, import_react.useState)([]);
  const [keyStatus, setKeyStatus] = (0, import_react.useState)({});
  const [open, setOpen] = (0, import_react.useState)({});
  const [dirty, setDirty] = (0, import_react.useState)(false);
  const [discovery, setDiscovery] = (0, import_react.useState)(null);
  const [catalog, setCatalog] = (0, import_react.useState)(null);
  const [revision, setRevision] = (0, import_react.useState)(void 0);
  const [draftKeys, setDraftKeys] = (0, import_react.useState)({});
  const load = (0, import_react.useCallback)(async () => {
    setLoading(true);
    try {
      const described = await api.describeSettings();
      if (described.ok !== true || described.value === void 0) {
        setError(described.error?.message ?? t("hostUnavailable"));
        return;
      }
      const section = described.value.namespaces.find((n) => n.ns === NS);
      if (section === void 0) {
        setError(t("nsNotRegistered"));
        return;
      }
      const userLayer = section.user;
      const value = userLayer !== void 0 && userLayer.providers !== void 0 ? userLayer : section.value ?? {};
      setRevision(typeof section.revision === "number" ? section.revision : void 0);
      const raw = value.providers;
      const list = Array.isArray(raw) ? raw : typeof raw === "object" && raw !== null ? Object.values(raw) : [];
      const next = list.map((p) => toProviderRow(p));
      setRows(next);
      setDirty(false);
      const status = {};
      const refs = next.map((p) => credentialRefFor(p.id.trim())).filter((r) => r.length > 0);
      if (refs.length > 0) {
        const described2 = await api.describeCredentials(refs);
        for (const p of next) {
          const ref = credentialRefFor(p.id.trim());
          status[p.id] = described2.value?.[ref]?.configured === true;
        }
      }
      setKeyStatus(status);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [api, t]);
  (0, import_react.useEffect)(() => {
    void load();
  }, [load]);
  const saveKey = (0, import_react.useCallback)(async (providerId, value) => {
    const ref = credentialRefFor(providerId.trim());
    if (ref.length === 0) {
      setError(t("keyNeedId"));
      return;
    }
    try {
      const stored = await api.setCredential(ref, value);
      if (stored.ok !== true) {
        setError(stored.error?.message ?? t("couldNotSave"));
        return;
      }
      setKeyStatus((s) => ({ ...s, [providerId]: value.length > 0 }));
      setNotice(t("keySavedNotice"));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [api, t]);
  const save = (0, import_react.useCallback)(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const providers = {};
      for (const row of rows) {
        const json = providerToJson(row);
        providers[String(json.id)] = json;
      }
      const mutated = await api.mutateSettings(NS, [{ op: "set", path: ["providers"], value: providers }], revision);
      if (mutated.ok !== true) {
        setError(mutated.error?.message ?? t("couldNotSave"));
        return;
      }
      await load();
      setNotice(t("savedNotice"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [api, load, rows, revision, t]);
  const runDiscover = (0, import_react.useCallback)(async (row) => {
    if (row.id.trim().length === 0 || row.baseURL.trim().length === 0) {
      setError(t("needIdAndUrl"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const request = {
        provider: row.id.trim(),
        baseURL: row.baseURL.trim(),
        api: row.protocol
      };
      const draftKey = draftKeys[row.id.trim()];
      if (draftKey !== void 0 && draftKey.length > 0) request.apiKey = draftKey;
      const result = await api.discoverModels(NS, request);
      if (result.ok !== true) {
        setError(result.error?.message ?? t("discoveryFailed"));
        return;
      }
      const models = result.value ?? [];
      setDiscovery({ provider: row.id.trim(), models, picked: {} });
      setNotice(t("discoveredPending", { n: models.length }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [api, draftKeys, t]);
  const fetchCatalog = (0, import_react.useCallback)(async (pi) => {
    const row = rows[pi];
    const ids = row.models.map((m) => m.id.trim()).filter((id) => id.length > 0);
    if (ids.length === 0) {
      setError(t("needModelsFirst"));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.catalogFacts(ids);
      if (result.ok !== true) {
        setError(result.error?.message ?? t("catalogFailed"));
        return;
      }
      const candidates = result.value ?? {};
      const chosen = {};
      for (const [id, list] of Object.entries(candidates)) {
        if (list.length > 0) chosen[id] = 0;
      }
      const matched = Object.keys(candidates).length;
      if (matched === 0) {
        setCatalog(null);
        setNotice(t("catalogFilled", { n: 0, matched: 0, total: ids.length }));
        return;
      }
      setCatalog({ rowIndex: pi, ids, candidates, chosen });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [api, rows, t]);
  const applyCatalog = (0, import_react.useCallback)(() => {
    const selection = catalog;
    if (selection === null) return;
    const row = rows[selection.rowIndex];
    if (row === void 0) return;
    let filled = 0;
    const nextModels = row.models.map((m) => {
      const id = m.id.trim();
      const list = selection.candidates[id];
      if (list === void 0 || list.length === 0) return m;
      const at = selection.chosen[id] ?? 0;
      const fact = (list[at] ?? list[0]).facts;
      const next = { ...m };
      if (fact.name !== void 0 && fact.name.length > 0) {
        next.name = fact.name;
        filled += 1;
      }
      if (fact.contextWindow !== void 0) {
        next.contextWindow = String(fact.contextWindow);
        filled += 1;
      }
      if (fact.maxTokens !== void 0) {
        next.maxTokens = String(fact.maxTokens);
        filled += 1;
      }
      if (fact.inputModalities !== void 0 && fact.inputModalities.length > 0) {
        next.inputModalities = [...fact.inputModalities];
        filled += 1;
      }
      if (fact.reasoningEfforts !== void 0 && fact.reasoningEfforts.length > 0) {
        next.reasoningEfforts = fact.reasoningEfforts.join(", ");
        filled += 1;
        next.defaultReasoningEffort = fact.defaultReasoningEffort ?? fact.reasoningEfforts[fact.reasoningEfforts.length - 1];
        if (next.effortMode === "none") {
          next.effortMode = "field";
          next.effortField = "reasoning_effort";
        }
        next.effortValues = fact.reasoningEfforts.join(", ");
        next.effortDefault = next.defaultReasoningEffort;
      }
      return next;
    });
    const matched = selection.ids.filter((id) => selection.candidates[id] !== void 0).length;
    if (filled > 0) {
      setRows((rs) => rs.map((r, i) => i === selection.rowIndex ? { ...r, models: nextModels } : r));
      setDirty(true);
    }
    setCatalog(null);
    setNotice(t("catalogFilled", { n: filled, matched, total: selection.ids.length }));
  }, [catalog, rows, t]);
  const chooseCandidate = (0, import_react.useCallback)((id, index) => {
    setCatalog((current) => current === null ? null : {
      ...current,
      chosen: { ...current.chosen, [id]: index }
    });
  }, []);
  const patchRow = (index, patch) => {
    setRows((rs) => rs.map((r, i) => i === index ? { ...r, ...patch } : r));
    setDirty(true);
  };
  const patchModel = (pi, mi, patch) => {
    setRows((rs) => rs.map((r, i) => i === pi ? { ...r, models: r.models.map((m, j) => j === mi ? { ...m, ...patch } : m) } : r));
    setDirty(true);
  };
  const children = [];
  children.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "llmcfg-intro", children: t("intro") }, "intro"));
  if (error !== null) children.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "llmcfg-banner llmcfg-error", children: error }, "err"));
  if (notice !== null) children.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "llmcfg-banner llmcfg-ok", children: notice }, "ok"));
  if (dirty) children.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "llmcfg-banner llmcfg-warn", children: t("unsavedChanges") }, "dirty"));
  children.push(
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-bar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "llmcfg-button",
          disabled: busy,
          onClick: () => {
            setRows((rs) => [...rs, emptyProvider()]);
            setOpen((o) => ({ ...o, [rows.length]: true }));
            setDirty(true);
          },
          children: t("addProvider")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "llmcfg-spacer" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "llmcfg-button llmcfg-button--ghost", disabled: busy, onClick: () => void load(), children: t("reload") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "llmcfg-button llmcfg-button--primary", disabled: busy, onClick: () => void save(), children: busy ? t("saving") : t("save") })
    ] }, "bar")
  );
  if (loading) {
    children.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "llmcfg-hint", children: "\u2026" }, "loading"));
  } else if (rows.length === 0) {
    children.push(
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-empty", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "llmcfg-empty-title", children: t("emptyTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "llmcfg-hint", children: t("emptyHint") })
      ] }, "empty")
    );
  }
  rows.forEach((row, pi) => {
    const isOpen = open[pi] === true;
    const ref = credentialRefFor(row.id.trim());
    const hasKey = keyStatus[row.id] === true;
    const protocolLabel = PROTOCOLS.find(([id]) => id === row.protocol)?.[1] ?? row.protocol;
    const title = row.displayName.length > 0 ? row.displayName : row.id.length > 0 ? row.id : t("newProvider");
    const head = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-cardhead", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "llmcfg-name", children: title }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "llmcfg-meta", children: [
        protocolLabel,
        " \xB7 ",
        t("modelCount", { n: row.models.length })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "llmcfg-tag", "data-state": hasKey ? "ok" : "warn", children: hasKey ? t("keySaved") : t("noKey") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "llmcfg-spacer" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "llmcfg-check", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "checkbox",
            checked: row.enabled,
            onChange: (e) => patchRow(pi, { enabled: e.target.checked })
          }
        ),
        t("enabled")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "llmcfg-button", onClick: () => setOpen((o) => ({ ...o, [pi]: !isOpen })), children: isOpen ? t("done") : t("edit") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "llmcfg-button llmcfg-button--danger",
          onClick: () => {
            const label = title.length > 0 ? title : t("newProvider");
            if (!window.confirm(t("confirmRemoveProvider", { id: label }))) return;
            setRows((rs) => rs.filter((_r, i) => i !== pi));
            setOpen({});
            setDirty(true);
          },
          children: t("remove")
        }
      )
    ] });
    const body = isOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-cardbody", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, { title: t("secBasics"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("providerId"), hint: t("providerIdHint"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              className: "llmcfg-input",
              value: row.id,
              placeholder: "my-gateway",
              onChange: (e) => patchRow(pi, { id: e.target.value })
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("displayName"), hint: t("optional"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              className: "llmcfg-input",
              value: row.displayName,
              onChange: (e) => patchRow(pi, { displayName: e.target.value })
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("protocol"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "select",
            {
              className: "llmcfg-select",
              value: row.protocol,
              onChange: (e) => patchRow(pi, { protocol: e.target.value }),
              children: PROTOCOLS.map(([id, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: id, children: label }, id))
            }
          ) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("baseUrl"), hint: t("baseUrlHint"), grow: true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: "llmcfg-input",
            value: row.baseURL,
            placeholder: "https://gateway.example/v1",
            onChange: (e) => patchRow(pi, { baseURL: e.target.value })
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("apiKey"), grow: true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            KeyField,
            {
              t,
              providerId: row.id.trim(),
              refName: ref,
              hasKey,
              onSave: (v) => void saveKey(row.id, v),
              onDraft: (v) => setDraftKeys((d) => ({ ...d, [row.id.trim()]: v }))
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("authScheme"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "select",
            {
              className: "llmcfg-select",
              value: row.authScheme,
              onChange: (e) => patchRow(pi, { authScheme: e.target.value }),
              children: AUTH_SCHEMES.map(([id, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: id, children: t(label) }, id))
            }
          ) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: "llmcfg-details", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: t("moreOptions") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("globalMaxTokens"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: "llmcfg-input",
                value: row.maxTokens,
                onChange: (e) => patchRow(pi, { maxTokens: e.target.value })
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("defaultContextWindow"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: "llmcfg-input",
                value: row.defaultContextWindow,
                placeholder: "128000",
                onChange: (e) => patchRow(pi, { defaultContextWindow: e.target.value })
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("streamIdleTimeout"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: "llmcfg-input",
                value: row.streamIdleTimeoutMs,
                placeholder: "300000",
                onChange: (e) => patchRow(pi, { streamIdleTimeoutMs: e.target.value })
              }
            ) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("authHeaderName"), hint: t("optional"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: "llmcfg-input",
                value: row.apiKeyHeader,
                placeholder: "authorization",
                onChange: (e) => patchRow(pi, { apiKeyHeader: e.target.value })
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("keyPrefix"), hint: t("optional"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: "llmcfg-input",
                value: row.apiKeyPrefix,
                placeholder: "Bearer ",
                onChange: (e) => patchRow(pi, { apiKeyPrefix: e.target.value })
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("keyEnvVar"), hint: t("optional"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: "llmcfg-input",
                value: row.apiKeyEnv,
                placeholder: "MY_GATEWAY_API_KEY",
                onChange: (e) => patchRow(pi, { apiKeyEnv: e.target.value })
              }
            ) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("excludePatterns"), hint: t("commaSeparated"), grow: true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              className: "llmcfg-input",
              value: row.modelExcludePatterns,
              placeholder: "embed, rerank",
              onChange: (e) => patchRow(pi, { modelExcludePatterns: e.target.value })
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("retryMode"), className: "llmcfg-field--fixed", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "select",
              {
                className: "llmcfg-select",
                value: row.retryMode,
                onChange: (e) => patchRow(pi, { retryMode: e.target.value }),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "normal", children: t("retryModeNormal") }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "always", children: t("retryModeAlways") })
                ]
              }
            ) }),
            row.retryMode === "normal" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("retryMax"), hint: t("retryMaxHint"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: "llmcfg-input",
                value: row.retryMax,
                placeholder: "5",
                onChange: (e) => patchRow(pi, { retryMax: e.target.value })
              }
            ) }) : null
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "llmcfg-hint", children: t("retryHint") })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, { title: t("secModels"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-toolbar", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "llmcfg-button llmcfg-button--primary",
              disabled: busy,
              onClick: () => void runDiscover(row),
              children: busy ? t("fetching") : t("fetchModels")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "llmcfg-button",
              disabled: busy || row.models.length === 0,
              onClick: () => void fetchCatalog(pi),
              children: t("enrichModels")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "llmcfg-spacer" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "llmcfg-button llmcfg-button--ghost",
              onClick: () => {
                patchRow(pi, { models: [...row.models, emptyModel()] });
              },
              children: t("addModel")
            }
          )
        ] }),
        catalog !== null && catalog.rowIndex === pi ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-sub", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-toolbar", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "llmcfg-name", children: t("catalogTitle") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "llmcfg-spacer" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: "llmcfg-button llmcfg-button--primary",
                onClick: applyCatalog,
                children: t("catalogApply")
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: "llmcfg-button",
                onClick: () => setCatalog(null),
                children: t("dismiss")
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "llmcfg-hint", children: t("catalogHint") }),
          catalog.ids.map((id) => {
            const list = catalog.candidates[id];
            if (list === void 0 || list.length === 0) {
              return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "llmcfg-hint", children: t("catalogNoMatch", { id }) }, id);
            }
            const at = catalog.chosen[id] ?? 0;
            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-catalogrow", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { className: "llmcfg-catalogid", children: id }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "select",
                {
                  className: "llmcfg-select",
                  "aria-label": id,
                  value: String(at),
                  onChange: (e) => chooseCandidate(id, Number(e.target.value)),
                  children: list.map((c, ci) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: String(ci), children: catalogOptionLabel(c) }, `${c.provider}-${ci}`))
                }
              )
            ] }, id);
          })
        ] }) : null,
        row.models.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "llmcfg-hint", children: t("noModels") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "llmcfg-modelist", children: row.models.map((m, mi) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          ModelEditor,
          {
            t,
            model: m,
            onChange: (patch) => patchModel(pi, mi, patch),
            onRemove: () => patchRow(pi, { models: row.models.filter((_x, j) => j !== mi) })
          },
          mi
        )) }),
        discovery !== null && discovery.provider === row.id.trim() ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-sub", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-toolbar", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "llmcfg-name", children: t("advertises", { n: discovery.models.length }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "llmcfg-spacer" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: "llmcfg-button",
                onClick: () => setDiscovery((d) => d === null ? null : { ...d, picked: Object.fromEntries(d.models.map((m) => [m.id, true])) }),
                children: t("selectAll")
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: "llmcfg-button",
                onClick: () => setDiscovery((d) => d === null ? null : { ...d, picked: {} }),
                children: t("clearAll")
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: "llmcfg-button llmcfg-button--primary",
                onClick: () => {
                  const d = discovery;
                  const existing = new Set(row.models.map((m) => m.id));
                  const added = d.models.filter((m) => d.picked[m.id] === true && !existing.has(m.id)).map((m) => ({ ...emptyModel(), id: m.id, name: m.name ?? "" }));
                  patchRow(pi, { models: [...row.models, ...added] });
                  setNotice(t("addedNotice", { n: added.length }));
                  setDiscovery(null);
                },
                children: t("addSelected")
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "llmcfg-button", onClick: () => setDiscovery(null), children: t("dismiss") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "llmcfg-scroll", children: discovery.models.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "llmcfg-pick", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "checkbox",
                checked: discovery.picked[m.id] === true,
                onChange: (e) => setDiscovery((d) => d === null ? null : {
                  ...d,
                  picked: { ...d.picked, [m.id]: e.target.checked }
                })
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: m.name ?? m.id }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: m.id })
          ] }, m.id)) })
        ] }) : null
      ] })
    ] }) : null;
    children.push(
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-card", "data-off": String(row.enabled === false), children: [
        head,
        body
      ] }, pi)
    );
  });
  children.push(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "llmcfg-note", children: t("note") }, "note"));
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", { className: "llmcfg-root", "aria-label": t("nav"), children });
}
function KeyField(props) {
  const [editing, setEditing] = (0, import_react.useState)(false);
  const [value, setValue] = (0, import_react.useState)("");
  const { t } = props;
  if (props.providerId.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "llmcfg-hint", children: t("keyNeedId") });
  }
  if (!editing) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-keybar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "llmcfg-tag", "data-state": props.hasKey ? "ok" : "warn", children: props.hasKey ? t("keyStored") : t("keyNotStored") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "llmcfg-button", onClick: () => setEditing(true), children: props.hasKey ? t("replaceKey") : t("setKey") }),
      props.hasKey ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "llmcfg-button llmcfg-button--danger",
          onClick: () => {
            props.onSave("");
            props.onDraft("");
          },
          children: t("clearKey")
        }
      ) : null,
      props.refName.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "llmcfg-meta", title: t("keyRefNote", { ref: props.refName }), children: props.refName }) : null
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-keybar", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "input",
      {
        className: "llmcfg-input llmcfg-keyinput",
        type: "password",
        value,
        placeholder: t("pasteKey"),
        autoFocus: true,
        onChange: (e) => {
          setValue(e.target.value);
          props.onDraft(e.target.value);
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        className: "llmcfg-button llmcfg-button--primary",
        disabled: value.length === 0,
        onClick: () => {
          props.onSave(value);
          props.onDraft(value);
          setValue("");
          setEditing(false);
        },
        children: t("saveKey")
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        className: "llmcfg-button",
        onClick: () => {
          setValue("");
          props.onDraft("");
          setEditing(false);
        },
        children: t("cancel")
      }
    )
  ] });
}
function ModelEditor(props) {
  const [open, setOpen] = (0, import_react.useState)(false);
  const { t, model } = props;
  const set = props.onChange;
  const toggleModality = (modality) => {
    const list = model.inputModalities;
    const next = list.includes(modality) ? list.filter((m) => m !== modality) : [...list, modality];
    set({ inputModalities: next.length > 0 ? next : ["text"] });
  };
  const summary = modelSummary(model);
  const head = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-toolbar llmcfg-modelbar", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "input",
      {
        className: "llmcfg-input llmcfg-modelid",
        value: model.id,
        placeholder: t("wireModelId"),
        onChange: (e) => set({ id: e.target.value })
      }
    ),
    open ? null : summary.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "llmcfg-meta llmcfg-modelsum", children: summary }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "llmcfg-spacer" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "llmcfg-button llmcfg-button--ghost", onClick: () => setOpen(!open), children: open ? t("hideAdvanced") : t("advanced") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        className: "llmcfg-button llmcfg-button--danger",
        onClick: () => {
          const id = model.id.trim().length > 0 ? model.id.trim() : model.name.trim() || "?";
          if (!window.confirm(t("confirmRemoveModel", { id }))) return;
          props.onRemove();
        },
        children: t("remove")
      }
    )
  ] });
  if (!open) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "llmcfg-modelrow", children: head });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-modelrow", "data-open": "true", children: [
    head,
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-modelbody", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("modelName"), hint: t("optional"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { className: "llmcfg-input", value: model.name, onChange: (e) => set({ name: e.target.value }) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("contextWindow"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: "llmcfg-input",
            value: model.contextWindow,
            placeholder: "128000",
            onChange: (e) => set({ contextWindow: e.target.value })
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("maxOutputTokens"), hint: t("optional"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: "llmcfg-input",
            value: model.maxTokens,
            onChange: (e) => set({ maxTokens: e.target.value })
          }
        ) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("protocol"), hint: t("protocolDefault"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "select",
          {
            className: "llmcfg-select",
            value: model.protocol,
            onChange: (e) => set({ protocol: e.target.value }),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: t("protocolDefault") }),
              PROTOCOLS.map(([id, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: id, children: label }, id))
            ]
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("inputModalities"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "llmcfg-chips", children: ["text", "image"].map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "llmcfg-chip",
            "data-on": String(model.inputModalities.includes(m)),
            onClick: () => toggleModality(m),
            children: m
          },
          m
        )) }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("reasoningEfforts"), hint: t("reasoningEffortsHint"), grow: true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: "llmcfg-input",
            value: model.reasoningEfforts,
            placeholder: "low, high, max",
            onChange: (e) => set({ reasoningEfforts: e.target.value })
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("defaultEffort"), hint: t("optional"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: "llmcfg-input",
            value: model.defaultReasoningEffort,
            placeholder: "high",
            onChange: (e) => set({ defaultReasoningEffort: e.target.value })
          }
        ) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: "llmcfg-details", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: t("moreOptions") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "llmcfg-hint", children: t("effortHint") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("temperature"), hint: t("optional"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              className: "llmcfg-input",
              value: model.temperature,
              onChange: (e) => set({ temperature: e.target.value })
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("topP"), hint: t("optional"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              className: "llmcfg-input",
              value: model.topP,
              onChange: (e) => set({ topP: e.target.value })
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("stopSequences"), hint: t("commaSeparated"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              className: "llmcfg-input",
              value: model.stop,
              onChange: (e) => set({ stop: e.target.value })
            }
          ) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("effortMode"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "select",
            {
              className: "llmcfg-select",
              value: model.effortMode,
              onChange: (e) => set({ effortMode: e.target.value }),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "none", children: t("effortModeNone") }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "field", children: t("effortModeField") }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "thinking", children: t("effortModeThinking") })
              ]
            }
          ) }),
          model.effortMode === "none" ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("effortFieldName"), hint: "reasoning_effort / thinking.type", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              className: "llmcfg-input",
              value: model.effortField,
              placeholder: model.effortMode === "thinking" ? "thinking" : "reasoning_effort",
              onChange: (e) => set({ effortField: e.target.value })
            }
          ) }),
          model.effortMode === "none" ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("effortValues"), hint: t("commaSeparated"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              className: "llmcfg-input",
              value: model.effortValues,
              placeholder: "low, high, max",
              onChange: (e) => set({ effortValues: e.target.value })
            }
          ) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "llmcfg-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("extraBody"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "textarea",
            {
              className: "llmcfg-area",
              value: model.extraBody,
              placeholder: '{"top_k": 40}',
              onChange: (e) => set({ extraBody: e.target.value })
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: t("extraHeaders"), children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "textarea",
            {
              className: "llmcfg-area",
              value: model.extraHeaders,
              placeholder: '{"x-tenant": "team-a"}',
              onChange: (e) => set({ extraHeaders: e.target.value })
            }
          ) })
        ] })
      ] })
    ] })
  ] });
}

// src/client/locale.ts
var zh = {
  nav: "\u6A21\u578B\u4F9B\u5E94\u5546",
  title: "\u6A21\u578B\u4F9B\u5E94\u5546",
  intro: "\u6BCF\u4E2A\u4F9B\u5E94\u5546\u72EC\u7ACB\u914D\u7F6E\u63A5\u53E3\u3001\u5BC6\u94A5\u4E0E\u6A21\u578B\u3002\u534F\u8BAE\u652F\u6301 OpenAI Chat / Responses\u3001Anthropic\u3001Gemini\u3002",
  addProvider: "\u6DFB\u52A0\u4F9B\u5E94\u5546",
  save: "\u4FDD\u5B58",
  saving: "\u4FDD\u5B58\u4E2D\u2026",
  reload: "\u91CD\u65B0\u52A0\u8F7D",
  emptyTitle: "\u8FD8\u6CA1\u6709\u914D\u7F6E\u4EFB\u4F55\u4F9B\u5E94\u5546",
  emptyHint: "\u6DFB\u52A0\u4F9B\u5E94\u5546 \u2192 \u586B\u5730\u5740\u5E76\u4FDD\u5B58 \u2192 \u8BBE\u7F6E\u5BC6\u94A5 \u2192 \u62C9\u53D6\u6A21\u578B\u3002",
  newProvider: "\u65B0\u4F9B\u5E94\u5546",
  active: "\u5DF2\u751F\u6548",
  inactive: "\u672A\u4FDD\u5B58",
  keySaved: "\u5DF2\u5B58\u5BC6\u94A5",
  noKey: "\u672A\u5B58\u5BC6\u94A5",
  modelCount: "{n} \u4E2A\u6A21\u578B",
  edit: "\u7F16\u8F91",
  done: "\u5B8C\u6210",
  remove: "\u5220\u9664",
  confirmRemoveModel: "\u786E\u5B9A\u5220\u9664\u6A21\u578B {id}\uFF1F",
  confirmRemoveProvider: "\u786E\u5B9A\u5220\u9664\u4F9B\u5E94\u5546 {id}\uFF1F",
  secBasics: "\u57FA\u672C\u4FE1\u606F",
  secAuth: "\u8BA4\u8BC1",
  secAdvanced: "\u9AD8\u7EA7\u9009\u9879",
  secModels: "\u6A21\u578B",
  providerId: "\u6807\u8BC6",
  providerIdHint: "\u5B57\u6BCD\u6570\u5B57\u3001\u70B9\u3001\u4E0B\u5212\u7EBF\u3001\u8FDE\u5B57\u7B26",
  displayName: "\u663E\u793A\u540D\u79F0",
  protocol: "\u63A5\u53E3\u534F\u8BAE",
  baseUrl: "\u63A5\u53E3\u5730\u5740",
  baseUrlHint: "\u542B /v1\uFF0C\u4E0D\u8981\u5199\u5230 /chat/completions",
  authScheme: "\u8BA4\u8BC1\u65B9\u5F0F",
  protocolDefault: "\u8DDF\u968F\u534F\u8BAE",
  bearer: "Bearer \u8BF7\u6C42\u5934",
  xApiKey: "x-api-key \u8BF7\u6C42\u5934",
  queryParam: "URL \u67E5\u8BE2\u53C2\u6570",
  noAuth: "\u4E0D\u9700\u8981\u8BA4\u8BC1",
  authHeaderName: "\u81EA\u5B9A\u4E49\u8BF7\u6C42\u5934\u540D",
  keyPrefix: "\u5BC6\u94A5\u524D\u7F00",
  keyEnvVar: "\u73AF\u5883\u53D8\u91CF\u540D\uFF08\u5907\u7528\uFF09",
  optional: "\u53EF\u9009",
  globalMaxTokens: "\u5168\u5C40\u6700\u5927\u8F93\u51FA",
  defaultContextWindow: "\u9ED8\u8BA4\u4E0A\u4E0B\u6587\u7A97\u53E3",
  streamIdleTimeout: "\u6D41\u7A7A\u95F2\u8D85\u65F6\uFF08ms\uFF09",
  excludePatterns: "\u62C9\u53D6\u65F6\u6392\u9664\u7684\u5173\u952E\u8BCD",
  retryMode: "\u5931\u8D25\u91CD\u8BD5",
  retryModeNormal: "\u6709\u9650\u6B21\u6570\uFF08\u9ED8\u8BA4 5\uFF09",
  retryModeAlways: "\u4E00\u76F4\u91CD\u8BD5",
  retryMax: "\u91CD\u8BD5\u6B21\u6570",
  retryMaxHint: "\u7559\u7A7A\u4F7F\u7528\u9ED8\u8BA4 5 \u6B21",
  retryHint: "\u4EC5\u5BF9\u77AC\u65F6\u9519\u8BEF\uFF08\u9650\u6D41\u3001\u670D\u52A1\u7AEF\u9519\u8BEF\u3001\u8D85\u65F6\u3001\u4F20\u8F93\u5931\u8D25\u3001\u7A7A\u54CD\u5E94\uFF09\u91CD\u8BD5\uFF1B\u6307\u6570\u9000\u907F\u7531\u6846\u67B6\u6267\u884C\u3002",
  addModel: "\u624B\u52A8\u6DFB\u52A0",
  fetchModels: "\u62C9\u53D6\u6A21\u578B\u5217\u8868",
  fetching: "\u62C9\u53D6\u4E2D\u2026",
  noModels: "\u8FD8\u6CA1\u6709\u6A21\u578B\u3002\u62C9\u53D6\u5217\u8868\uFF0C\u6216\u624B\u52A8\u6DFB\u52A0\u3002",
  advertises: "\u63A5\u53E3\u8FD4\u56DE {n} \u4E2A\u6A21\u578B",
  selectAll: "\u5168\u9009",
  clearAll: "\u6E05\u7A7A",
  addSelected: "\u5BFC\u5165\u6240\u9009",
  dismiss: "\u5173\u95ED",
  addedNotice: "\u5DF2\u5BFC\u5165 {n} \u4E2A\u6A21\u578B\uFF0C\u8BB0\u5F97\u70B9\u300C\u4FDD\u5B58\u300D\u3002",
  savedNotice: "\u5DF2\u4FDD\u5B58\uFF0C\u4E0B\u6B21\u8BF7\u6C42\u5373\u751F\u6548\u3002",
  keySavedNotice: "\u5BC6\u94A5\u5DF2\u4FDD\u5B58\u3002",
  needIdAndUrl: "\u8BF7\u5148\u586B\u5199\u300C\u6807\u8BC6\u300D\u548C\u300C\u63A5\u53E3\u5730\u5740\u300D\u3002",
  unsavedChanges: "\u672A\u4FDD\u5B58\uFF0C\u70B9\u300C\u4FDD\u5B58\u300D\u540E\u751F\u6548\u3002",
  discoveredPending: "\u63A5\u53E3\u8FD4\u56DE {n} \u4E2A\u6A21\u578B\uFF0C\u52FE\u9009\u540E\u5BFC\u5165\u3002",
  apiKey: "API \u5BC6\u94A5",
  keyStored: "\u5DF2\u4FDD\u5B58\uFF08\u4E0D\u56DE\u663E\uFF09",
  keyNotStored: "\u672A\u4FDD\u5B58",
  keyNeedId: "\u5148\u586B\u300C\u6807\u8BC6\u300D\u518D\u4FDD\u5B58\u5BC6\u94A5\u3002",
  keyRefNote: "{ref}",
  replaceKey: "\u66F4\u6362",
  setKey: "\u8BBE\u7F6E\u5BC6\u94A5",
  clearKey: "\u6E05\u9664",
  pasteKey: "\u7C98\u8D34\u5BC6\u94A5",
  saveKey: "\u4FDD\u5B58\u5BC6\u94A5",
  cancel: "\u53D6\u6D88",
  wireModelId: "\u6A21\u578B ID",
  wireModelIdHint: "\u5982 deepseek-v4-flash\uFF0C\u5FC5\u987B\u4E0E\u63A5\u53E3\u4E00\u81F4",
  advanced: "\u53C2\u6570",
  hideAdvanced: "\u6536\u8D77",
  moreOptions: "\u66F4\u591A\u9009\u9879",
  enabled: "\u542F\u7528",
  inputModalities: "\u8F93\u5165",
  modelName: "\u663E\u793A\u540D",
  contextWindow: "\u4E0A\u4E0B\u6587\u7A97\u53E3",
  maxOutputTokens: "\u6700\u5927\u8F93\u51FA",
  temperature: "\u6E29\u5EA6 (0-2)",
  topP: "Top P (0-1)",
  stopSequences: "\u505C\u6B62\u5E8F\u5217",
  commaSeparated: "\u9017\u53F7\u5206\u9694",
  effortTitle: "\u601D\u8003\u5F3A\u5EA6",
  effortHint: "\u6309\u6A21\u578B\u6587\u6863\u586B\u5199\u3002Kimi K3 \u7528 reasoning_effort\uFF0CK2.x \u7528 thinking.type\u3002",
  reasoningEfforts: "\u53EF\u9009\u5F3A\u5EA6\uFF08\u9017\u53F7\u5206\u9694\uFF09",
  reasoningEffortsHint: "\u7559\u7A7A\u8868\u793A\u4E0D\u63D0\u4F9B\u5F3A\u5EA6\u9009\u62E9\uFF0C\u8C03\u7528\u65B9\u4E5F\u5C31\u4E0D\u53D1\u9001\u8BE5\u5B57\u6BB5",
  defaultEffort: "\u9ED8\u8BA4\u5F3A\u5EA6",
  effortMode: "\u53D1\u9001\u65B9\u5F0F",
  effortModeNone: "\u4E0D\u53D1\u9001\uFF08\u6A21\u578B\u9ED8\u8BA4\uFF09",
  effortModeField: "\u53D1\u9001\u6807\u91CF\u5B57\u6BB5",
  effortModeThinking: "\u53D1\u9001 thinking \u5F00\u5173",
  effortFieldName: "\u5B57\u6BB5\u540D",
  effortValues: "\u53EF\u9009\u503C\uFF08\u9017\u53F7\u5206\u9694\uFF09",
  effortDefault: "\u8BF7\u6C42\u9ED8\u8BA4\u503C",
  extraBody: "extraBody",
  extraHeaders: "extraHeaders",
  note: "\u5BC6\u94A5\u5B58\u5728\u51ED\u636E\u5E93\uFF0C\u4E0D\u5199\u5165\u8BBE\u7F6E\u6587\u4EF6\u3002\u6539\u5B57\u6BB5\u70B9\u300C\u4FDD\u5B58\u300D\uFF0C\u6362\u5BC6\u94A5\u70B9\u300C\u4FDD\u5B58\u5BC6\u94A5\u300D\u3002",
  hostUnavailable: "\u5BBF\u4E3B\u7AEF\u4E0D\u53EF\u7528",
  nsNotRegistered: "\u8BBE\u7F6E\u547D\u540D\u7A7A\u95F4 llm-config \u5C1A\u672A\u6CE8\u518C\uFF1B\u8BF7\u91CD\u542F dsh web\u3002",
  invalidJson: "JSON \u683C\u5F0F\u9519\u8BEF\uFF1A",
  validationFailed: "\u6821\u9A8C\u672A\u901A\u8FC7",
  couldNotSave: "\u4FDD\u5B58\u5931\u8D25",
  discoveryFailed: "\u62C9\u53D6\u5931\u8D25",
  enrichModels: "\u4ECE models.dev \u8865\u5168\u5C5E\u6027",
  needModelsFirst: "\u8BF7\u5148\u6DFB\u52A0\u6216\u62C9\u53D6\u6A21\u578B\u3002",
  catalogFailed: "\u62C9\u53D6 models.dev \u76EE\u5F55\u5931\u8D25",
  catalogFilled: "\u5DF2\u8865\u5168 {n} \u4E2A\u5B57\u6BB5\uFF08\u5339\u914D {matched}/{total} \u4E2A\u6A21\u578B\uFF09\uFF0C\u70B9\u300C\u4FDD\u5B58\u300D\u5199\u5165\u3002",
  catalogTitle: "\u9009\u62E9\u6570\u636E\u6765\u6E90",
  catalogHint: "\u540C\u4E00\u6A21\u578B\u53EF\u80FD\u6709\u591A\u4E2A\u5E73\u53F0\u6570\u636E\u3002\u9ED8\u8BA4\u9009\u7B2C\u4E00\u9879\uFF0C\u5E94\u7528\u540E\u5199\u5165\u4E0A\u4E0B\u6587\u3001\u8F93\u51FA\u4E0A\u9650\u3001\u8F93\u5165\u6A21\u6001\u548C\u601D\u8003\u5F3A\u5EA6\u3002",
  catalogSources: "{n} \u4E2A\u6765\u6E90",
  catalogNoMatch: "{id}\uFF1A\u76EE\u5F55\u4E2D\u6CA1\u6709\u6536\u5F55\uFF0C\u5C06\u4FDD\u6301\u539F\u6837\u3002",
  catalogApply: "\u5E94\u7528\u6240\u9009"
};
var en = {
  nav: "Model Providers",
  title: "Model Providers",
  intro: "Each provider has its own endpoint, credential and models. Protocols: OpenAI Chat / Responses, Anthropic, Gemini.",
  addProvider: "Add provider",
  save: "Save",
  saving: "Saving\u2026",
  reload: "Reload",
  emptyTitle: "No providers configured",
  emptyHint: "Add a provider \u2192 fill the URL and Save \u2192 set the key \u2192 fetch models.",
  newProvider: "New provider",
  active: "active",
  inactive: "unsaved",
  keySaved: "key saved",
  noKey: "no key",
  modelCount: "{n} models",
  edit: "Edit",
  done: "Done",
  remove: "Remove",
  confirmRemoveModel: "Remove model {id}?",
  confirmRemoveProvider: "Remove provider {id}?",
  secBasics: "Basics",
  secAuth: "Authentication",
  secAdvanced: "Advanced",
  secModels: "Models",
  providerId: "ID",
  providerIdHint: "letters, digits, dot, underscore, hyphen",
  displayName: "Display name",
  protocol: "Protocol",
  baseUrl: "Base URL",
  baseUrlHint: "include /v1, not /chat/completions",
  authScheme: "Auth scheme",
  protocolDefault: "protocol default",
  bearer: "Bearer header",
  xApiKey: "x-api-key header",
  queryParam: "URL query param",
  noAuth: "no auth",
  authHeaderName: "Custom header name",
  keyPrefix: "Key prefix",
  keyEnvVar: "Env var (fallback)",
  optional: "optional",
  globalMaxTokens: "Global max output",
  defaultContextWindow: "Default context window",
  streamIdleTimeout: "Stream idle timeout (ms)",
  excludePatterns: "Exclude keywords when fetching",
  retryMode: "Retry on failure",
  retryModeNormal: "Bounded (default 5)",
  retryModeAlways: "Always retry",
  retryMax: "Max retries",
  retryMaxHint: "empty uses the default 5",
  retryHint: "Retries transient failures only (rate limit, server error, timeout, transport, empty response); the framework runs the exponential backoff.",
  addModel: "Add manually",
  fetchModels: "Fetch models",
  fetching: "Fetching\u2026",
  noModels: "No models yet. Fetch the list, or add one.",
  advertises: "Endpoint returned {n} models",
  selectAll: "Select all",
  clearAll: "Clear",
  addSelected: "Import selected",
  dismiss: "Dismiss",
  addedNotice: "Imported {n} model(s). Remember to Save.",
  savedNotice: "Saved. Applies to the next request.",
  keySavedNotice: "API key saved.",
  needIdAndUrl: "Fill in the ID and base URL first.",
  unsavedChanges: "Unsaved \u2014 click Save to apply.",
  discoveredPending: "Endpoint returned {n} models. Pick some to import.",
  apiKey: "API key",
  keyStored: "stored (never shown)",
  keyNotStored: "not stored",
  keyNeedId: "Fill in the ID first.",
  keyRefNote: "{ref}",
  replaceKey: "Replace",
  setKey: "Set key",
  clearKey: "Clear",
  pasteKey: "paste the key",
  saveKey: "Save key",
  cancel: "Cancel",
  wireModelId: "Model ID",
  wireModelIdHint: "e.g. deepseek-v4-flash; must match the endpoint",
  advanced: "Params",
  hideAdvanced: "Collapse",
  moreOptions: "More options",
  enabled: "Enabled",
  inputModalities: "Input",
  modelName: "Display name",
  contextWindow: "Context window",
  maxOutputTokens: "Max output",
  temperature: "Temperature (0-2)",
  topP: "Top P (0-1)",
  stopSequences: "Stop sequences",
  commaSeparated: "comma separated",
  effortTitle: "Reasoning effort",
  effortHint: "Follow the model docs. Kimi K3 uses reasoning_effort; K2.x uses thinking.type.",
  reasoningEfforts: "Selectable efforts (comma separated)",
  reasoningEffortsHint: "leave empty to offer no effort selector, so callers send no such field",
  defaultEffort: "Default effort",
  effortMode: "How to send it",
  effortModeNone: "do not send (model default)",
  effortModeField: "send a scalar field",
  effortModeThinking: "send a thinking toggle",
  effortFieldName: "Field name",
  effortValues: "Allowed values (comma separated)",
  effortDefault: "Request default",
  extraBody: "extraBody",
  extraHeaders: "extraHeaders",
  note: "Keys live in the credentials store, not the settings file. Save for fields; Save key for the key.",
  hostUnavailable: "the host half is not available",
  nsNotRegistered: "settings namespace llm-config is not registered; restart dsh web.",
  invalidJson: "Invalid JSON: ",
  validationFailed: "validation failed",
  couldNotSave: "could not save",
  discoveryFailed: "fetch failed",
  enrichModels: "Fill from models.dev",
  needModelsFirst: "Add or fetch models first.",
  catalogFailed: "models.dev catalog fetch failed",
  catalogFilled: "Filled {n} field(s) ({matched}/{total} models matched). Click Save to write them.",
  catalogTitle: "Choose a source",
  catalogHint: "The same model may have several catalog listings. The first is preselected; applying writes context, output cap, modalities and reasoning.",
  catalogSources: "{n} sources",
  catalogNoMatch: "{id}: not listed in the catalog, left unchanged.",
  catalogApply: "Apply selection"
};

// src/client/apply.ts
var COPY_NS = "settings.llm-config";
var RPC_CHANNEL = "/llm-config";
var SECTION_CSS = `
.llmcfg-root { display: flex; flex-direction: column; gap: 10px; margin: 0; min-width: 0; }
.llmcfg-root p { margin: 0; }
.llmcfg-root h1, .llmcfg-root h2, .llmcfg-root h3, .llmcfg-root h4 { margin: 0; }
.llmcfg-intro { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 17px; max-width: 52em; }
.llmcfg-bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.llmcfg-spacer { flex: 1 1 auto; min-width: 8px; }
.llmcfg-button {
  box-sizing: border-box;
  padding: 5px 10px; border-radius: 6px; font: inherit; font-size: 12px; line-height: 16px;
  min-height: 30px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent; color: var(--dsw-alias-label-primary); cursor: pointer;
}
.llmcfg-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.llmcfg-button:disabled { opacity: 0.4; cursor: default; }
.llmcfg-button--primary {
  border-color: transparent;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.llmcfg-button--primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.llmcfg-button--ghost { border-color: transparent; color: var(--dsw-alias-label-secondary); }
.llmcfg-button--danger { color: var(--dsw-alias-state-error-primary); border-color: transparent; }
.llmcfg-card {
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; overflow: hidden;
  background: var(--dsw-alias-bg-layer-0, var(--dsw-alias-bg-layer-1));
}
.llmcfg-card[data-off="true"] { opacity: 0.55; }
.llmcfg-cardhead {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 8px 12px;
  background: var(--dsw-alias-bg-layer-1);
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.llmcfg-card:not(:has(.llmcfg-cardbody)) .llmcfg-cardhead { border-bottom: 0; }
.llmcfg-cardbody {
  padding: 8px; display: flex; flex-direction: column; gap: 8px;
  /* Nested rows (sections, model list) may contain wrapping bars and long
     unbreakable ids; clamp them so nothing widens the card from inside. */
  min-width: 0; max-width: 100%;
}
.llmcfg-sec {
  display: flex; flex-direction: column; gap: 8px;
  padding: 10px 12px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 7px;
  background: var(--dsw-alias-bg-layer-1);
  min-width: 0; max-width: 100%;
}
.llmcfg-sectitle {
  font-weight: 600; font-size: 11px; line-height: 14px;
  color: var(--dsw-alias-label-secondary); letter-spacing: 0.04em;
  text-transform: uppercase;
}
/* Fields align at the TOP, not the bottom: a flex-end row makes labels sit at
   different heights whenever one field wraps or carries a hint, which is the
   jagged label row in the retry/auth rows. */
.llmcfg-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-start; min-width: 0; }
.llmcfg-field { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
/* Grow only inside a horizontal row. A Field as a column child of the card
   body would otherwise eat leftover HEIGHT (flex-basis 160/280px + grow),
   which is the empty band under the base-URL input. */
.llmcfg-row > .llmcfg-field { flex: 1 1 160px; min-width: 110px; max-width: 100%; }
.llmcfg-row > .llmcfg-field--grow { flex: 2 1 280px; }
/* A field that must NOT stretch: the retry-mode select was a full-width bar,
   twice the height of its neighbours and spanning the card. */
.llmcfg-row > .llmcfg-field--fixed { flex: 0 0 200px; min-width: 0; }
.llmcfg-field--fixed .llmcfg-select { width: 200px; max-width: 100%; }
.llmcfg-label { font-size: 11px; line-height: 14px; color: var(--dsw-alias-label-tertiary); }
.llmcfg-hint { font-size: 11px; line-height: 15px; color: var(--dsw-alias-label-dimmed); }
.llmcfg-input, .llmcfg-select, .llmcfg-area {
  box-sizing: border-box; padding: 5px 10px; border-radius: 6px; width: 100%;
  min-height: 30px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-0, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px;
}
.llmcfg-input:focus, .llmcfg-select:focus, .llmcfg-area:focus {
  outline: none; border-color: var(--dsw-alias-brand-primary);
}
.llmcfg-area { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; min-height: 52px; resize: vertical; }
.llmcfg-name { font-weight: 600; font-size: 13px; }
.llmcfg-meta { font-size: 11px; line-height: 15px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.llmcfg-tag {
  display: inline-flex; align-items: center;
  box-sizing: border-box; min-height: 26px;
  font-size: 11px; line-height: 16px; padding: 0 8px; border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-0, transparent);
  color: var(--dsw-alias-label-secondary); white-space: nowrap;
}
.llmcfg-tag[data-state="ok"] { color: var(--dsw-alias-state-success-primary); background: transparent; }
.llmcfg-tag[data-state="warn"] { color: var(--dsw-alias-state-warning-primary); background: transparent; }
.llmcfg-note { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }
.llmcfg-banner {
  font-size: 12px; line-height: 16px; padding: 6px 9px; border-radius: 6px;
  min-width: 0; max-width: 100%; overflow-wrap: anywhere;
}
.llmcfg-warn { color: var(--dsw-alias-state-warning-primary); }
.llmcfg-error { color: var(--dsw-alias-state-error-primary); white-space: pre-wrap; }
.llmcfg-ok { color: var(--dsw-alias-state-success-primary); }
.llmcfg-empty {
  text-align: center; padding: 28px 12px; display: flex; flex-direction: column;
  gap: 4px; align-items: center; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 8px;
}
.llmcfg-empty-title { font-weight: 600; color: var(--dsw-alias-label-secondary); }
.llmcfg-check { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary); cursor: pointer; user-select: none; }
.llmcfg-modelist { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.llmcfg-modelrow {
  display: flex; flex-direction: column; gap: 0;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; padding: 0;
  background: var(--dsw-alias-bg-layer-0, transparent);
  /* A model row must never push content past its card: the inner bar wraps
     instead of stretching the row wider than the section it lives in. */
  min-width: 0; max-width: 100%; overflow: hidden;
}
.llmcfg-modelrow[data-open="true"] { background: var(--dsw-alias-bg-layer-1); }
.llmcfg-modelbar {
  width: 100%; padding: 4px 6px; gap: 6px;
  align-items: center;
  /* Never wrap: the remove/params buttons must stay on the same line. A long
     summary shrinks (and ellipsizes) to make room instead of pushing the
     buttons onto a second row, which is what made rows look broken. */
  flex-wrap: nowrap;
}
.llmcfg-modelid { flex: 0 1 240px; min-width: 96px; width: 240px; height: 30px; }
/* The summary is flex-basis 0: it only takes leftover space and ALWAYS yields
   to the id input and the buttons, ellipsizing instead of overflowing. */
.llmcfg-modelsum { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.llmcfg-modelbody {
  display: flex; flex-direction: column; gap: 8px; padding: 8px 8px 10px;
  border-top: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  min-width: 0; max-width: 100%;
}
/* Chips align with the other inputs in the row: the 28px minimum is 2px
   shorter than the controls around it, which tilted the modality label. */
.llmcfg-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-height: 30px; }
.llmcfg-chip {
  box-sizing: border-box; min-height: 30px;
  font-size: 11px; line-height: 16px; padding: 0 10px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent; color: var(--dsw-alias-label-primary);
}
.llmcfg-chip[data-on="true"] {
  background: var(--dsw-alias-button-primary-fill);
  border-color: transparent; color: var(--dsw-alias-label-primary-foreground);
}
.llmcfg-scroll {
  max-height: 220px; overflow: auto; display: flex; flex-direction: column; gap: 1px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; padding: 3px;
}
.llmcfg-pick { display: flex; align-items: center; gap: 8px; padding: 3px 6px; border-radius: 4px; font-size: 12px; }
.llmcfg-pick:hover { background: var(--dsw-alias-interactive-bg-hover); }
.llmcfg-pick code { font-size: 11px; color: var(--dsw-alias-label-tertiary); margin-left: auto; }
.llmcfg-sub {
  border: 1px dashed var(--dsw-alias-border-l2); border-radius: 6px; padding: 8px 9px;
  display: flex; flex-direction: column; gap: 6px;
  background: var(--dsw-alias-bg-layer-0, transparent);
  min-width: 0; max-width: 100%;
}
.llmcfg-keybar {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  min-height: 28px;
}
.llmcfg-keyinput { flex: 1 1 180px; min-width: 140px; max-width: 100%; }
.llmcfg-toolbar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
.llmcfg-toolbar .llmcfg-button { padding: 5px 8px; min-height: 30px; }
/* Buttons in a model bar keep their label on one line and never shrink away. */
.llmcfg-modelbar .llmcfg-button { flex: 0 0 auto; white-space: nowrap; }
/* The spacer yields before the summary does, so the summary keeps room. */
.llmcfg-modelbar .llmcfg-spacer { flex: 0 1 8px; }
.llmcfg-catalogrow {
  display: grid; grid-template-columns: minmax(100px, 180px) minmax(0, 1fr);
  align-items: center; gap: 8px;
}
.llmcfg-catalogid {
  font-size: 11px; color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.llmcfg-details {
  border-top: 1px dashed var(--dsw-alias-border-l2);
  padding-top: 6px;
  min-width: 0;
}
.llmcfg-details > summary {
  cursor: pointer; list-style: none; font-size: 12px; color: var(--dsw-alias-label-secondary);
  padding: 4px 0; user-select: none;
}
.llmcfg-details { margin-top: 2px; }
.llmcfg-details > summary::-webkit-details-marker { display: none; }
.llmcfg-details[open] > summary { margin-bottom: 6px; }
.llmcfg-details[open] { display: flex; flex-direction: column; gap: 8px; }
/* The catalog chooser's select rides a grid track of 0..1fr, so it never
   widens its column; the details block and its rows stay clamped too. */
.llmcfg-details .llmcfg-select { max-width: 100%; }
`;
var inject = [
  "slots",
  "locale",
  "connection",
  "remote",
  "remote.settings",
  "remote.credentials",
  "remote.llm"
];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(COPY_NS, { zh, en }), "llm-config: copy dictionaries");
  if (typeof document !== "undefined") {
    ctx.effect(() => {
      const element = document.createElement("style");
      element.textContent = SECTION_CSS;
      document.head.append(element);
      return () => {
        element.remove();
      };
    }, "llm-config: section styles");
  }
  const t = ctx.locale.bind(COPY_NS);
  const connection = ctx.get("connection");
  const injected = () => ({
    t: (key, params) => t(key, params),
    api: {
      describeSettings: () => ctx.remote.settings.describe(),
      mutateSettings: (ns, ops, expectedRevision) => ctx.remote.settings.mutate(ns, ops, expectedRevision),
      describeCredentials: (refs) => ctx.remote.credentials.describe(refs),
      setCredential: (ref, value) => ctx.remote.credentials.set(ref, value),
      discoverModels: (settingsNs, request) => ctx.remote.llm.discoverModels(settingsNs, request),
      catalogFacts: (modelIds) => connection.rpc.call(RPC_CHANNEL, "catalog-facts", { modelIds })
    }
  });
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "llm-config",
    order: 60,
    label: () => t("nav"),
    locale: COPY_NS,
    inject: injected
  }, ModelProvidersSection));
}
return module.exports; } });
//# sourceMappingURL=client.js.map
