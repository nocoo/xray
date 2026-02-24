"use client";

import { AppShell } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { User, Clock, MessageCircle, Star } from "lucide-react";

export default function UsersPage() {
  return (
    <AppShell breadcrumbs={[{ label: "Users" }]}>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
            <Badge variant="secondary">Coming Soon</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Look up any Twitter/X user to view their profile, timeline, and social connections.
          </p>
        </div>

        <div className="rounded-card bg-secondary p-8">
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Planned Features
            </h3>
            <div className="space-y-3">
              <FeatureItem
                icon={<User className="h-4 w-4" />}
                title="User Profile"
                api="POST /v1/twitter/user/info"
                description="View user bio, stats, and profile details"
              />
              <FeatureItem
                icon={<Clock className="h-4 w-4" />}
                title="Timeline"
                api="POST /v1/twitter/user/timeline"
                description="Full user activity feed including retweets and replies"
              />
              <FeatureItem
                icon={<MessageCircle className="h-4 w-4" />}
                title="Replies"
                api="POST /v1/twitter/user/replies"
                description="View all replies posted by a user"
              />
              <FeatureItem
                icon={<Star className="h-4 w-4" />}
                title="Highlights"
                api="POST /v1/twitter/user/highLights"
                description="Pinned and featured tweets"
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
