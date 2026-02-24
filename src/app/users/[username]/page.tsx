"use client";

import { use } from "react";
import { AppShell } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { User, Clock, MessageCircle, Star, Search } from "lucide-react";

export default function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);

  return (
    <AppShell
      breadcrumbs={[
        { label: "Users", href: "/users" },
        { label: `@${username}` },
      ]}
    >
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              @{username}
            </h1>
            <Badge variant="secondary">Coming Soon</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            User profile with multi-tab content views.
          </p>
        </div>

        <div className="rounded-card bg-secondary p-8">
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Tab Views
            </h3>
            <div className="space-y-3">
              <FeatureItem
                icon={<User className="h-4 w-4" />}
                title="Recent Tweets"
                api="POST /v1/twitter/user/userRecentTweetsByFilter"
                description="Latest tweets with filtering options"
              />
              <FeatureItem
                icon={<Clock className="h-4 w-4" />}
                title="Timeline"
                api="POST /v1/twitter/user/timeline"
                description="Complete activity feed"
              />
              <FeatureItem
                icon={<MessageCircle className="h-4 w-4" />}
                title="Replies"
                api="POST /v1/twitter/user/replies"
                description="All replies posted by this user"
              />
              <FeatureItem
                icon={<Star className="h-4 w-4" />}
                title="Highlights"
                api="POST /v1/twitter/user/highLights"
                description="Pinned and featured content"
              />
              <FeatureItem
                icon={<Search className="h-4 w-4" />}
                title="Search"
                api="POST /v1/twitter/user/getUserTweetsBySearch"
                description="Search within this user's tweets"
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
