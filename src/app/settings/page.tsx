"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Key,
  Cookie,
  Webhook,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  Plus,
  Shield,
  Bot,
  ChevronDown,
  ChevronRight,
  Coins,
} from "lucide-react";

// =============================================================================
// Types
// =============================================================================

type CredentialsData = {
  configured: boolean;
  tweapiKey: string | null;
  twitterCookie: string | null;
  updatedAt?: string;
};

type WebhookData = {
  id: number;
  keyPrefix: string;
  createdAt: string;
  rotatedAt: string;
};

type CreditsData = {
  remaining: number;
  total: number;
  expires_at?: string;
};

// =============================================================================
// Settings Page
// =============================================================================

export default function SettingsPage() {
  return (
    <AppShell breadcrumbs={[{ label: "Settings" }]}>
      <div className="space-y-8">
        <div>
          <h1 className="font-display text-2xl font-semibold">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your API credentials and webhook keys.
          </p>
        </div>

        <CreditsSection />
        <Separator />
        <CredentialsSection />
        <Separator />
        <WebhooksSection />
        <Separator />
        <AiPromptSection />
      </div>
    </AppShell>
  );
}

// =============================================================================
// Credits Balance Section
// =============================================================================

function CreditsSection() {
  const [credits, setCredits] = useState<CreditsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/credits");
        if (res.ok) {
          const json = await res.json();
          const d = json.data;
          if (d && typeof d.remaining === "number" && typeof d.total === "number") {
            setCredits(d);
          } else {
            // API returned unexpected shape — treat as unconfigured
            setCredits(null);
          }
        } else if (res.status === 503) {
          // API key not configured — not an error, just show empty state
          setCredits(null);
        } else {
          setError("Could not load credits balance.");
        }
      } catch {
        setError("Could not load credits balance.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <SectionSkeleton title="TweAPI Credits" />;
  }

  const usedPercent =
    credits && credits.total > 0
      ? Math.round(((credits.total - credits.remaining) / credits.total) * 100)
      : 0;

  const barColor =
    usedPercent > 90
      ? "bg-red-500"
      : usedPercent > 70
        ? "bg-yellow-500"
        : "bg-primary";

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Coins className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">TweAPI Credits</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Your API credit balance for TweAPI requests.
      </p>

      {error ? (
        <StatusMessage type="error" text={error} />
      ) : credits ? (
        <div className="space-y-4 rounded-card bg-secondary p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-2xl font-bold font-display">
                {(credits.remaining ?? 0).toLocaleString()}
              </span>
              <span className="ml-1 text-sm text-muted-foreground">
                / {(credits.total ?? 0).toLocaleString()} credits
              </span>
            </div>
            <Badge
              variant={usedPercent > 90 ? "destructive" : usedPercent > 70 ? "secondary" : "default"}
            >
              {usedPercent}% used
            </Badge>
          </div>

          {/* Progress bar */}
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className={`h-2 rounded-full transition-all ${barColor}`}
              style={{ width: `${usedPercent}%` }}
            />
          </div>

          {credits.expires_at && (
            <p className="text-xs text-muted-foreground">
              Expires {formatDate(credits.expires_at)}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-card border border-dashed py-6 text-center text-sm text-muted-foreground">
          Configure your TweAPI Key below to view credit balance.
        </div>
      )}
    </section>
  );
}

// =============================================================================
// API Credentials Section
// =============================================================================

function CredentialsSection() {
  const [creds, setCreds] = useState<CredentialsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tweapiKey, setTweapiKey] = useState("");
  const [twitterCookie, setTwitterCookie] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [showCookie, setShowCookie] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchCreds = useCallback(async () => {
    try {
      const res = await fetch("/api/credentials");
      if (res.ok) {
        setCreds(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCreds();
  }, [fetchCreds]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const body: Record<string, string> = {};
      if (tweapiKey) body.tweapiKey = tweapiKey;
      if (twitterCookie) body.twitterCookie = twitterCookie;

      const res = await fetch("/api/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setCreds(data);
        setEditing(false);
        setTweapiKey("");
        setTwitterCookie("");
        setMessage({ type: "success", text: "Credentials saved successfully." });
      } else {
        try {
          const err = await res.json();
          setMessage({ type: "error", text: err.error || "Failed to save." });
        } catch {
          setMessage({ type: "error", text: `Failed to save (HTTP ${res.status}).` });
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/credentials", { method: "DELETE" });
      if (res.ok) {
        setCreds({ configured: false, tweapiKey: null, twitterCookie: null });
        setMessage({ type: "success", text: "Credentials deleted." });
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <SectionSkeleton title="API Credentials" />;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">API Credentials</h2>
        </div>
        <Badge variant={creds?.configured ? "default" : "secondary"}>
          {creds?.configured ? "Configured" : "Not configured"}
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        Your TweAPI key and Twitter cookie are used to access the Twitter API.
        These values are stored securely and never exposed in full.
      </p>

      {message && (
        <StatusMessage type={message.type} text={message.text} />
      )}

      {!editing ? (
        <div className="space-y-3 rounded-card bg-secondary p-4">
          <CredentialRow
            icon={<Key className="size-4" />}
            label="TweAPI Key"
            value={creds?.tweapiKey}
          />
          <CredentialRow
            icon={<Cookie className="size-4" />}
            label="Twitter Cookie"
            value={creds?.twitterCookie}
          />
          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={() => setEditing(true)}>
              {creds?.configured ? "Update" : "Configure"}
            </Button>
            {creds?.configured && (
              <Button size="sm" variant="destructive" onClick={handleDelete} disabled={saving}>
                <Trash2 className="mr-1 size-3.5" />
                Delete
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-card bg-secondary p-4">
          <div className="space-y-2">
            <Label htmlFor="tweapi-key">TweAPI Key</Label>
            <div className="relative">
              <Input
                id="tweapi-key"
                type={showKey ? "text" : "password"}
                placeholder="Enter your TweAPI key"
                value={tweapiKey}
                onChange={(e) => setTweapiKey(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="twitter-cookie">Twitter Cookie</Label>
            <div className="relative">
              <Input
                id="twitter-cookie"
                type={showCookie ? "text" : "password"}
                placeholder="Enter your Twitter cookie"
                value={twitterCookie}
                onChange={(e) => setTwitterCookie(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowCookie(!showCookie)}
              >
                {showCookie ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving || (!tweapiKey && !twitterCookie)}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setEditing(false); setTweapiKey(""); setTwitterCookie(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

// =============================================================================
// Webhooks Section
// =============================================================================

function WebhooksSection() {
  const [hooks, setHooks] = useState<WebhookData[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchHooks = useCallback(async () => {
    try {
      const res = await fetch("/api/webhooks");
      if (res.ok) {
        setHooks(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHooks();
  }, [fetchHooks]);

  const handleCreate = async () => {
    setCreating(true);
    setMessage(null);
    setNewKey(null);
    try {
      const res = await fetch("/api/webhooks", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data.key);
        fetchHooks();
        setMessage({ type: "success", text: "Webhook key created. Copy it now — it won't be shown again." });
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRotate = async (id: number) => {
    setMessage(null);
    setNewKey(null);
    try {
      const res = await fetch("/api/webhooks/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data.key);
        fetchHooks();
        setMessage({ type: "success", text: "Key rotated. Copy the new key now." });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to rotate key." });
    }
  };

  const handleDelete = async (id: number) => {
    setMessage(null);
    try {
      const res = await fetch(`/api/webhooks?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setHooks((prev) => prev.filter((h) => h.id !== id));
        setMessage({ type: "success", text: "Webhook deleted." });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to delete webhook." });
    }
  };

  const copyKey = async () => {
    if (newKey) {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return <SectionSkeleton title="Webhook Keys" />;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Webhook className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Webhook Keys</h2>
        </div>
        <Button size="sm" onClick={handleCreate} disabled={creating}>
          <Plus className="mr-1 size-3.5" />
          {creating ? "Creating..." : "New Key"}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Webhook keys authenticate external requests to your X-Ray API.
        Send the key in the <code className="rounded bg-muted px-1 py-0.5 text-xs">X-Webhook-Key</code> header.
      </p>

      {message && (
        <StatusMessage type={message.type} text={message.text} />
      )}

      {newKey && (
        <div className="rounded-card border border-primary/30 bg-primary/5 p-4">
          <p className="mb-2 text-sm font-medium text-primary">New Webhook Key (shown once)</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-muted px-2 py-1 font-mono text-xs">
              {newKey}
            </code>
            <Button size="icon-sm" variant="outline" onClick={copyKey}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </Button>
          </div>
        </div>
      )}

      {hooks.length === 0 ? (
        <div className="rounded-card border border-dashed py-8 text-center text-sm text-muted-foreground">
          No webhook keys yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {hooks.map((hook) => (
            <div
              key={hook.id}
              className="flex items-center justify-between rounded-card bg-secondary p-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <code className="font-mono text-sm">{hook.keyPrefix}****</code>
                  <Badge variant="secondary" className="text-[10px]">
                    ID: {hook.id}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Created {formatDate(hook.createdAt)} · Rotated {formatDate(hook.rotatedAt)}
                </p>
              </div>
              <div className="flex gap-1">
                <Button size="icon-xs" variant="ghost" onClick={() => handleRotate(hook.id)} title="Rotate key">
                  <RefreshCw className="size-3.5" />
                </Button>
                <Button size="icon-xs" variant="ghost" onClick={() => handleDelete(hook.id)} title="Delete">
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// =============================================================================
// AI Prompt Section
// =============================================================================

const AI_PROMPT_TEMPLATE = `You have access to the X-Ray Twitter API for fetching Twitter/X data.

## Authentication
Include the header \`X-Webhook-Key: {{KEY}}\` in every request.

## Base URL
\`https://xray.hexly.ai\`

## Available Endpoints (all GET)

| Endpoint | Description | Parameters |
|----------|-------------|------------|
| /api/twitter/users/{username}/info | User profile | — |
| /api/twitter/users/{username}/tweets | User's tweets | ?count=20 (1-100) |
| /api/twitter/users/{username}/search | Search user's tweets | ?q=keyword (required) |
| /api/twitter/tweets/search | Global tweet search | ?q=keyword (required), ?count=20, ?sort_by_top=true |
| /api/twitter/tweets/{id} | Tweet details by ID | — |
| /api/twitter/me/analytics | My account analytics | — |
| /api/twitter/me/bookmarks | My bookmarks | — |
| /api/twitter/me/likes | My liked tweets | — |
| /api/twitter/me/lists | My lists | — |

## Response Format
Success: \`{ "success": true, "data": { ... } }\`
Error: \`{ "success": false, "error": "message" }\`

## Example
\`\`\`bash
curl -H "X-Webhook-Key: {{KEY}}" "https://xray.hexly.ai/api/twitter/users/karpathy/tweets?count=10"
\`\`\``;

function AiPromptSection() {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [keyInput, setKeyInput] = useState("");

  const prompt = keyInput
    ? AI_PROMPT_TEMPLATE.replaceAll("{{KEY}}", keyInput)
    : AI_PROMPT_TEMPLATE.replaceAll("{{KEY}}", "<YOUR_WEBHOOK_KEY>");

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="space-y-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Bot className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">AI Agent Prompt</h2>
        {expanded ? (
          <ChevronDown className="ml-auto size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="ml-auto size-4 text-muted-foreground" />
        )}
      </button>

      {!expanded && (
        <p className="text-sm text-muted-foreground">
          Copy a ready-made prompt to give your AI agent access to the X-Ray API.
        </p>
      )}

      {expanded && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Paste this prompt into your AI agent (Claude, GPT, Cursor, etc.) to
            let it call the X-Ray API on your behalf. Optionally fill in your
            webhook key below to embed it directly.
          </p>

          <div className="space-y-2">
            <Label htmlFor="ai-key-input">Webhook Key (optional)</Label>
            <Input
              id="ai-key-input"
              type="password"
              placeholder="xrk_... (paste your key to embed it in the prompt)"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
          </div>

          <div className="relative">
            <pre className="max-h-80 overflow-auto rounded-card bg-secondary p-4 font-mono text-xs leading-relaxed text-foreground">
              {prompt}
            </pre>
            <Button
              size="sm"
              variant="outline"
              className="absolute right-3 top-3"
              onClick={copyPrompt}
            >
              {copied ? (
                <>
                  <Check className="mr-1 size-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1 size-3.5" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

// =============================================================================
// Shared Components
// =============================================================================

function CredentialRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm">
        {icon}
        <span className="text-muted-foreground">{label}</span>
      </div>
      <code className="font-mono text-xs text-muted-foreground">
        {value || "Not set"}
      </code>
    </div>
  );
}

function StatusMessage({ type, text }: { type: "success" | "error"; text: string }) {
  return (
    <div
      className={`rounded-card px-3 py-2 text-sm ${
        type === "success"
          ? "border border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
          : "border border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
      }`}
    >
      {text}
    </div>
  );
}

function SectionSkeleton({ title }: { title: string }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="h-24 rounded-card bg-muted" />
      </div>
    </section>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}
