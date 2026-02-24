"use client";

import { use } from "react";
import { AppShell } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Users, UserPlus, Link2 } from "lucide-react";

export default function ConnectionsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);

  return (
    <AppShell
      breadcrumbs={[
        { label: "Users", href: "/users" },
        { label: `@${username}`, href: `/users/${username}` },
        { label: "Connections" },
      ]}
    >
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              Connections
            </h1>
            <Badge variant="secondary">Coming Soon</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Social connections for @{username} — followers, following, and affiliated accounts.
          </p>
        </div>

        <div className="rounded-card bg-secondary p-8">
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Tab Views
            </h3>
            <div className="space-y-3">
              <FeatureItem
                icon={<Users className="h-4 w-4" />}
                title="Followers"
                api="POST /v1/twitter/user/follower"
                description="People who follow this user"
              />
              <FeatureItem
                icon={<UserPlus className="h-4 w-4" />}
                title="Following"
                api="POST /v1/twitter/user/following"
                description="People this user follows"
              />
              <FeatureItem
                icon={<Link2 className="h-4 w-4" />}
                title="Affiliates"
                api="POST /v1/twitter/user/affiliates"
                description="Affiliated and linked accounts"
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
