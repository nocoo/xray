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
  Key,
  Cookie,
  Trash2,
  Eye,
  EyeOff,
  Shield,
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
            Manage your API credentials and credit balance.
          </p>
        </div>

        <CreditsSection />
        <Separator />
        <CredentialsSection />
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
