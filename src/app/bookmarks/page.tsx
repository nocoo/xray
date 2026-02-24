"use client";

import { AppShell } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Bookmark } from "lucide-react";

export default function BookmarksPage() {
  return (
    <AppShell breadcrumbs={[{ label: "Bookmarks" }]}>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              Bookmarks
            </h1>
            <Badge variant="secondary">Coming Soon</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            View your saved tweets. Requires Twitter cookie authentication.
          </p>
        </div>

        <div className="rounded-card bg-secondary p-8">
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Planned Features
            </h3>
            <div className="space-y-3">
              <FeatureItem
                icon={<Bookmark className="h-4 w-4" />}
                title="Bookmarked Tweets"
                api="POST /v1/twitter/user/bookmarks"
                description="Browse all your bookmarked tweets with full content and metrics"
              />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function FeatureItem({
  icon,
  title,
  api,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  api: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-card/50 p-3">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          <code className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {api}
          </code>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}
