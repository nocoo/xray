"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusMessage, SectionSkeleton } from "@/components/ui/feedback";
import {
  Webhook,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  Plus,
  Bot,
} from "lucide-react";

// =============================================================================
// Types
// =============================================================================

type WebhookData = {
  id: number;
  keyPrefix: string;
  createdAt: string;
  rotatedAt: string;
};

// =============================================================================
// Webhooks Page
// =============================================================================

export default function WebhooksPage() {
  return (
    <AppShell breadcrumbs={[{ label: "Webhooks" }]}>
      <div className="space-y-8">
        <div>
          <h1 className="font-display text-2xl font-semibold">Webhooks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage webhook keys and configure AI agent access.
          </p>
        </div>

        <WebhooksSection />
        <Separator />
        <AiPromptSection />
      </div>
    </AppShell>
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
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

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
        setMessage({
          type: "success",
          text: "Webhook key created. Copy it now — it won't be shown again.",
        });
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
        setMessage({
          type: "success",
          text: "Key rotated. Copy the new key now.",
        });
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
        Webhook keys authenticate external requests to your X-Ray API. Send the
        key in the{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          X-Webhook-Key
        </code>{" "}
        header.
      </p>

      {message && <StatusMessage type={message.type} text={message.text} />}

      {newKey && (
        <div className="rounded-card border border-primary/30 bg-primary/5 p-4">
          <p className="mb-2 text-sm font-medium text-primary">
            New Webhook Key (shown once)
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-muted px-2 py-1 font-mono text-xs">
              {newKey}
            </code>
            <Button size="icon-sm" variant="outline" onClick={copyKey}>
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
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
                  <code className="font-mono text-sm">
                    {hook.keyPrefix}****
                  </code>
                  <Badge variant="secondary" className="text-[10px]">
                    ID: {hook.id}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Created {formatDate(hook.createdAt)} · Rotated{" "}
                  {formatDate(hook.rotatedAt)}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => handleRotate(hook.id)}
                  title="Rotate key"
                >
                  <RefreshCw className="size-3.5" />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => handleDelete(hook.id)}
                  title="Delete"
                >
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
// AI Agent Prompt Section
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
      <div className="flex items-center gap-2">
        <Bot className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">AI Agent Prompt</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Paste this prompt into your AI agent (Claude, GPT, Cursor, etc.) to let
        it call the X-Ray API on your behalf. Optionally fill in your webhook
        key below to embed it directly.
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
