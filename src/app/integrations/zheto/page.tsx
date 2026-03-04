"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SectionSkeleton,
  StatusMessage,
} from "@/components/ui/feedback";
import { Save, Loader2, ExternalLink } from "lucide-react";

// =============================================================================
// Types
// =============================================================================

interface ZhetoSettings {
  webhookUrl: string;
  folder: string;
}

// =============================================================================
// Page
// =============================================================================

export default function ZhetoIntegrationPage() {
  return (
    <AppShell
      breadcrumbs={[
        { label: "Integrations" },
        { label: "zhe.to" },
      ]}
    >
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">zhe.to</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Save tweets as bookmarks to your{" "}
            <a
              href="https://zhe.to"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              zhe.to
            </a>{" "}
            account via webhook. Once configured, a "Save to zhe.to" button will
            appear on each post card in your watchlists.
          </p>
        </div>

        <ZhetoConfigSection />
      </div>
    </AppShell>
  );
}

// =============================================================================
// Config section
// =============================================================================

function ZhetoConfigSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [webhookUrl, setWebhookUrl] = useState("");
  const [folder, setFolder] = useState("");

  // Fetch current settings
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/integrations/zheto");
        const json = await res.json();
        if (json.success) {
          setWebhookUrl(json.data.webhookUrl ?? "");
          setFolder(json.data.folder ?? "");
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/zheto", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl, folder }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setMessage({ type: "success", text: "Settings saved." });
      } else {
        setMessage({
          type: "error",
          text: json?.error ?? "Failed to save settings.",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setSaving(false);
    }
  }, [webhookUrl, folder]);

  if (loading) {
    return <SectionSkeleton title="Webhook Configuration" />;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Webhook Configuration</h2>
      <div className="space-y-4 rounded-card bg-secondary p-4">
        <div className="space-y-2">
          <Label htmlFor="zheto-webhook-url">Webhook URL</Label>
          <Input
            id="zheto-webhook-url"
            type="url"
            placeholder="https://zhe.to/api/webhook/your-token-here"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Your zhe.to webhook endpoint. The token in the URL path acts as
            authentication — no extra headers needed.{" "}
            <a
              href="https://zhe.to"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 underline hover:text-foreground transition-colors"
            >
              Get your webhook URL
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="zheto-folder">Default Folder (optional)</Label>
          <Input
            id="zheto-folder"
            type="text"
            placeholder="e.g. Twitter"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            maxLength={50}
          />
          <p className="text-xs text-muted-foreground">
            Bookmarks will be saved to this folder by default. Leave empty for
            no folder.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            {saving ? "Saving..." : "Save"}
          </Button>
          {message && <StatusMessage type={message.type} text={message.text} />}
        </div>
      </div>
    </section>
  );
}
