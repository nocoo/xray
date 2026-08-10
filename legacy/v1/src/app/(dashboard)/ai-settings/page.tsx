"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useBreadcrumbs } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SectionSkeleton } from "@/components/ui/feedback";
import {
  Bot,
  Save,
  Plug,
  Loader2,
  Check,
  X,
  FileText,
  RotateCcw,
  Plus,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import {
  AI_PROVIDERS,
  ALL_PROVIDER_IDS,
  CUSTOM_PROVIDER_INFO,
  type AiProvider,
  type SdkType,
} from "@/services/ai";
import {
  DEFAULT_TRANSLATION_TEMPLATE,
  PROMPT_TEMPLATE_VARIABLES,
} from "@/services/prompt-defaults";

// =============================================================================
// Types
// =============================================================================

interface AiSettings {
  provider: AiProvider | "";
  apiKey: string;
  hasApiKey: boolean;
  model: string;
  baseURL: string;
  sdkType: SdkType | "";
  translationPrompt: string;
}

type TestStatus = "idle" | "testing" | "success" | "error";

/** Special value used in the model dropdown to indicate custom input. */
const CUSTOM_MODEL_VALUE = "__custom__";

// =============================================================================
// Page
// =============================================================================

export default function AiSettingsPage() {
  useBreadcrumbs([{ label: "AI Settings" }]);
  return (
    <>
      <div className="space-y-8">
        <div>
          <h1 className="font-display text-2xl font-semibold">AI Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure your AI provider, model, and API credentials.
          </p>
        </div>

        <AiConfigSection />

        <Separator />

        <TranslationPromptSection />
      </div>
    </>
  );
}

// =============================================================================
// AI Configuration Section
// =============================================================================

function AiConfigSection() {
  const [settings, setSettings] = useState<AiSettings>({
    provider: "",
    apiKey: "",
    hasApiKey: false,
    model: "",
    baseURL: "",
    sdkType: "",
    translationPrompt: "",
  });
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyChanged, setApiKeyChanged] = useState(false);
  const [customModelInput, setCustomModelInput] = useState("");
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testError, setTestError] = useState("");
  const [loaded, setLoaded] = useState(false);

  // Load settings on mount
  useEffect(() => {
    fetch("/api/settings/ai")
      .then((r) => r.json())
      .then((data: AiSettings) => {
        setSettings(data);
        setApiKeyInput(data.apiKey); // masked key

        // Determine if the saved model is a custom one (not in presets)
        if (data.provider && data.provider !== "custom" && data.model) {
          const info =
            AI_PROVIDERS[data.provider as Exclude<AiProvider, "custom">];
          if (info && !info.models.includes(data.model)) {
            setIsCustomModel(true);
            setCustomModelInput(data.model);
          }
        } else if (data.provider === "custom" && data.model) {
          setCustomModelInput(data.model);
        }

        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  // Get provider info for current selection
  const isCustomProvider = settings.provider === "custom";
  const providerInfo =
    settings.provider && !isCustomProvider
      ? AI_PROVIDERS[settings.provider as Exclude<AiProvider, "custom">]
      : null;
  const presetModels = providerInfo?.models ?? [];

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      const body: Record<string, unknown> = {
        provider: settings.provider,
        model: settings.model,
      };
      // Only send apiKey if user actually changed it
      if (apiKeyChanged) {
        body.apiKey = apiKeyInput;
      }
      // Include custom provider fields
      if (isCustomProvider) {
        body.baseURL = settings.baseURL;
        body.sdkType = settings.sdkType;
      }
      const res = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setApiKeyInput(data.apiKey);
        setApiKeyChanged(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }, [settings, apiKeyInput, apiKeyChanged, isCustomProvider]);

  const handleTest = useCallback(async () => {
    // Save first if there are pending changes
    if (apiKeyChanged || !settings.hasApiKey) {
      await handleSave();
    }
    setTestStatus("testing");
    setTestError("");
    try {
      const res = await fetch("/api/settings/ai/test", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setTestStatus("success");
      } else {
        setTestStatus("error");
        setTestError(data.error || "Connection failed");
      }
    } catch {
      setTestStatus("error");
      setTestError("Network error");
    }
    setTimeout(() => setTestStatus("idle"), 4000);
  }, [apiKeyChanged, settings.hasApiKey, handleSave]);

  /** Handle provider change — reset model to first preset or empty. */
  const handleProviderChange = useCallback((value: string) => {
    const provider = value as AiProvider | "";
    setTestStatus("idle");
    setIsCustomModel(false);
    setCustomModelInput("");

    if (!provider) {
      setSettings((s) => ({
        ...s,
        provider: "",
        model: "",
        baseURL: "",
        sdkType: "",
      }));
      return;
    }

    if (provider === "custom") {
      setSettings((s) => ({
        ...s,
        provider: "custom",
        model: "",
        sdkType: s.sdkType || "openai",
      }));
      return;
    }

    const info = AI_PROVIDERS[provider as Exclude<AiProvider, "custom">];
    setSettings((s) => ({
      ...s,
      provider,
      model: info?.defaultModel ?? "",
    }));
  }, []);

  /** Handle model dropdown change. */
  const handleModelSelect = useCallback(
    (value: string) => {
      if (value === CUSTOM_MODEL_VALUE) {
        setIsCustomModel(true);
        setSettings((s) => ({ ...s, model: customModelInput }));
      } else {
        setIsCustomModel(false);
        setCustomModelInput("");
        setSettings((s) => ({ ...s, model: value }));
      }
    },
    [customModelInput],
  );

  if (!loaded) {
    return <SectionSkeleton title="AI Configuration" />;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Bot className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">AI Configuration</h2>
        {settings.hasApiKey && (
          <Badge variant="default" className="bg-green-600 text-white text-xs">
            Configured
          </Badge>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Configure your LLM provider, model, and API key for AI-powered features.
      </p>

      <div className="space-y-4 rounded-card bg-secondary p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Provider */}
          <div>
            <Label className="text-sm">Provider</Label>
            <select
              value={settings.provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-border bg-secondary px-3 pr-8 text-sm hover:border-foreground/20"
            >
              <option value="">Select a provider...</option>
              {ALL_PROVIDER_IDS.map((id) => {
                const label =
                  id === "custom"
                    ? CUSTOM_PROVIDER_INFO.label
                    : AI_PROVIDERS[id].label;
                return (
                  <option key={id} value={id}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Model — dropdown with presets + custom option (built-in providers) */}
          {!isCustomProvider && (
            <div>
              <Label className="text-sm">Model</Label>
              {presetModels.length > 0 && !isCustomModel ? (
                <select
                  value={
                    presetModels.includes(settings.model)
                      ? settings.model
                      : CUSTOM_MODEL_VALUE
                  }
                  onChange={(e) => handleModelSelect(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-secondary px-3 pr-8 text-sm hover:border-foreground/20"
                >
                  {presetModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  <option value={CUSTOM_MODEL_VALUE}>Custom model...</option>
                </select>
              ) : presetModels.length > 0 && isCustomModel ? (
                <div className="mt-1 flex gap-1">
                  <Input
                    value={customModelInput}
                    onChange={(e) => {
                      setCustomModelInput(e.target.value);
                      setSettings((s) => ({ ...s, model: e.target.value }));
                    }}
                    placeholder="Enter model name"
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 px-2"
                    onClick={() => {
                      setIsCustomModel(false);
                      setCustomModelInput("");
                      setSettings((s) => ({
                        ...s,
                        model: presetModels[0] ?? "",
                      }));
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Input
                  value={settings.model}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, model: e.target.value }))
                  }
                  placeholder={
                    providerInfo?.defaultModel ?? "Select provider first"
                  }
                  className="mt-1"
                />
              )}
            </div>
          )}

          {/* Model — free text for custom provider */}
          {isCustomProvider && (
            <div>
              <Label className="text-sm">Model</Label>
              <Input
                value={settings.model}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, model: e.target.value }))
                }
                placeholder="Enter model name"
                className="mt-1"
              />
            </div>
          )}

          {/* Custom provider: Base URL */}
          {isCustomProvider && (
            <div>
              <Label className="text-sm">Base URL</Label>
              <Input
                value={settings.baseURL}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, baseURL: e.target.value }))
                }
                placeholder="https://api.example.com/v1"
                className="mt-1"
              />
            </div>
          )}

          {/* Custom provider: SDK Type */}
          {isCustomProvider && (
            <div>
              <Label className="text-sm">SDK Protocol</Label>
              <select
                value={settings.sdkType}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    sdkType: e.target.value as SdkType | "",
                  }))
                }
                className="mt-1 h-9 w-full rounded-md border border-border bg-secondary px-3 pr-8 text-sm hover:border-foreground/20"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>
          )}

          {/* API Key — full width */}
          <div className="sm:col-span-2">
            <Label className="text-sm">API Key</Label>
            <Input
              type="password"
              value={apiKeyInput}
              onChange={(e) => {
                setApiKeyInput(e.target.value);
                setApiKeyChanged(true);
              }}
              placeholder="Enter your API key"
              className="mt-1"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button
            onClick={handleSave}
            disabled={saving || !settings.provider}
            className="gap-2"
            size="sm"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : saved ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Save className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
            {saved ? "Saved" : "Save"}
          </Button>

          <Button
            variant="outline"
            onClick={handleTest}
            disabled={
              testStatus === "testing" ||
              !settings.provider ||
              (!settings.hasApiKey && !apiKeyChanged)
            }
            className="gap-2"
            size="sm"
          >
            {testStatus === "testing" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plug className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
            Test Connection
          </Button>

          {testStatus === "success" && (
            <Badge
              variant="default"
              className="bg-green-600 text-white text-xs"
            >
              <Check className="mr-1 h-3 w-3" />
              Connected
            </Badge>
          )}
          {testStatus === "error" && (
            <Badge variant="destructive" className="text-xs">
              <X className="mr-1 h-3 w-3" />
              {testError}
            </Badge>
          )}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Translation Prompt Section
// =============================================================================

/** Insert text at the cursor position of a textarea. */
function insertAtCursor(textarea: HTMLTextAreaElement, text: string) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const newValue = before + text + after;
  // Use native setter to trigger React's onChange
  const nativeSet = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  nativeSet?.call(textarea, newValue);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  // Restore cursor position after the inserted text
  requestAnimationFrame(() => {
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
  });
}

function TranslationPromptSection() {
  const [prompt, setPrompt] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Load prompt on mount — empty from API means "use default"
  useEffect(() => {
    fetch("/api/settings/ai")
      .then((r) => r.json())
      .then((data: { translationPrompt?: string }) => {
        setPrompt(data.translationPrompt || DEFAULT_TRANSLATION_TEMPLATE);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const handleChange = useCallback((value: string) => {
    setPrompt(value);
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      // Send empty string when content matches default → API deletes the override
      const payload = prompt === DEFAULT_TRANSLATION_TEMPLATE ? "" : prompt;
      const res = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translationPrompt: payload }),
      });
      if (res.ok) {
        const data = await res.json();
        setPrompt(data.translationPrompt || DEFAULT_TRANSLATION_TEMPLATE);
        setSaved(true);
        setDirty(false);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }, [prompt]);

  const handleReset = useCallback(() => {
    setPrompt(DEFAULT_TRANSLATION_TEMPLATE);
    setDirty(true);
  }, []);

  const handleInsertVariable = useCallback((variableKey: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // For 引用原文, insert the full conditional block
    if (variableKey === "引用原文") {
      insertAtCursor(
        textarea,
        `{{#引用原文}}\n\n{{引用原文}}\n{{/引用原文}}`,
      );
    } else {
      insertAtCursor(textarea, `{{${variableKey}}}`);
    }
    setOpenDropdown(false);
  }, []);

  if (!loaded) {
    return <SectionSkeleton title="Translation Prompt" />;
  }

  const isDefault = prompt === DEFAULT_TRANSLATION_TEMPLATE;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">Translation Prompt</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Customize the prompt template used for translating tweets. Use{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">{"{{变量}}"}</code>{" "}
        syntax to insert dynamic content.
      </p>

      <div className="space-y-3 rounded-card bg-secondary p-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {/* Insert variable dropdown */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpenDropdown(!openDropdown)}
                className="gap-1"
              >
                <Plus className="h-3 w-3" />
                Insert Variable
                <ChevronDown className="h-3 w-3" />
              </Button>
              {openDropdown && (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setOpenDropdown(false)}
                  />
                  {/* Dropdown menu */}
                  <div className="absolute left-0 top-full z-50 mt-1 w-80 overflow-auto rounded-lg border bg-background p-1 shadow-lg">
                    {PROMPT_TEMPLATE_VARIABLES.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => handleInsertVariable(v.key)}
                        className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
                      >
                        <div className="flex items-center gap-2">
                          <code className="shrink-0 rounded bg-secondary px-1 py-0.5 font-mono text-[10px]">
                            {`{{${v.key}}}`}
                          </code>
                          <span className="text-foreground">{v.description}</span>
                        </div>
                        <span className="pl-1 text-[10px] text-muted-foreground">
                          e.g. {v.example}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Reset button — only show when content differs from default */}
          {!isDefault && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="gap-1 text-xs text-muted-foreground"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to Default
            </Button>
          )}
        </div>

        {/* Warning */}
        <div className="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Modifying the output format section may cause translation results to display incorrectly.
            The parser expects [翻译], [引用翻译], and [锐评] markers.
          </span>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => handleChange(e.target.value)}
          rows={20}
          className="w-full resize-y rounded-lg border border-border bg-secondary px-3 py-2 font-mono text-xs leading-relaxed text-foreground hover:border-foreground/20 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />

        {/* Save button */}
        <div className="flex items-center gap-2">
          <Button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="gap-2"
            size="sm"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : saved ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Save className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
            {saved ? "Saved" : "Save Prompt"}
          </Button>
        </div>
      </div>
    </section>
  );
}
