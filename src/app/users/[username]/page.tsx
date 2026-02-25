"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout";
import { UserCard } from "@/components/twitter/user-card";
import { TweetCard } from "@/components/twitter/tweet-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search } from "lucide-react";

import type { UserInfo, Tweet } from "../../../../shared/types";

// =============================================================================
// Tab definitions
// =============================================================================

type TabKey = "recent" | "timeline" | "replies" | "highlights" | "search";

const TABS: { key: TabKey; label: string }[] = [
  { key: "recent", label: "Recent" },
  { key: "timeline", label: "Timeline" },
  { key: "replies", label: "Replies" },
  { key: "highlights", label: "Highlights" },
  { key: "search", label: "Search" },
];

// =============================================================================
// User Profile Page
// =============================================================================

export default function UserProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [userError, setUserError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("recent");
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loadingTweets, setLoadingTweets] = useState(false);
  const [tweetsError, setTweetsError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");

  // Fetch user info on mount
  useEffect(() => {
    async function loadUser() {
      setLoadingUser(true);
      setUserError(null);
      try {
        const res = await fetch(
          `/api/explore/users?username=${encodeURIComponent(username)}`,
        );
        const data = await res.json();
        if (!res.ok || !data.success) {
          setUserError(data.error ?? "Failed to load user");
        } else {
          setUserInfo(data.data);
        }
      } catch {
        setUserError("Network error — could not reach API");
      } finally {
        setLoadingUser(false);
      }
    }
    loadUser();
  }, [username]);

  // Fetch tab content
  const fetchTabContent = useCallback(
    async (tab: TabKey, query?: string) => {
      setLoadingTweets(true);
      setTweetsError(null);
      setTweets([]);

      try {
        let url: string;
        const u = encodeURIComponent(username);

        switch (tab) {
          case "recent":
            url = `/api/explore/users/tweets?username=${u}&count=20`;
            break;
          case "timeline":
            url = `/api/explore/users/timeline?username=${u}`;
            break;
          case "replies":
            url = `/api/explore/users/replies?username=${u}`;
            break;
          case "highlights":
            url = `/api/explore/users/highlights?username=${u}`;
            break;
          case "search":
            if (!query?.trim()) {
              setLoadingTweets(false);
              return;
            }
            url = `/api/explore/users/tweets?username=${u}&q=${encodeURIComponent(query)}`;
            break;
          default:
            setLoadingTweets(false);
            return;
        }

        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok || !data.success) {
          setTweetsError(data.error ?? "Failed to load content");
        } else {
          setTweets(data.data ?? []);
        }
      } catch {
        setTweetsError("Network error — could not reach API");
      } finally {
        setLoadingTweets(false);
      }
    },
    [username],
  );

  // Load content when tab changes (except search)
  useEffect(() => {
    if (activeTab !== "search") {
      fetchTabContent(activeTab);
    } else {
      setTweets([]);
    }
  }, [activeTab, fetchTabContent]);

  const handleSearch = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (searchQuery.trim()) {
        fetchTabContent("search", searchQuery);
      }
    },
    [searchQuery, fetchTabContent],
  );

  return (
    <AppShell
      breadcrumbs={[
        { label: "Users", href: "/users" },
        { label: `@${username}` },
      ]}
    >
      <div className="space-y-6">
        {/* User profile card */}
        {loadingUser && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {userError && (
          <div className="rounded-card bg-destructive/10 p-4 text-sm text-destructive">
            {userError}
          </div>
        )}

        {userInfo && <UserCard user={userInfo} />}

        {/* Tabs */}
        <div className="border-b border-border">
          <nav className="flex gap-1 -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Search input for search tab */}
        {activeTab === "search" && (
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search @${username}'s tweets...`}
                className="pl-9"
              />
            </div>
            <Button
              type="submit"
              disabled={loadingTweets || !searchQuery.trim()}
            >
              {loadingTweets ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Search"
              )}
            </Button>
          </form>
        )}

        {/* Tab content */}
        {loadingTweets && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {tweetsError && (
          <div className="rounded-card bg-destructive/10 p-4 text-sm text-destructive">
            {tweetsError}
          </div>
        )}

        {!loadingTweets && !tweetsError && tweets.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {tweets.length} tweet{tweets.length !== 1 ? "s" : ""}
            </div>
            {tweets.map((tweet) => (
              <TweetCard key={tweet.id} tweet={tweet} />
            ))}
          </div>
        )}

        {!loadingTweets &&
          !tweetsError &&
          tweets.length === 0 &&
          activeTab !== "search" && (
            <div className="rounded-card bg-secondary p-8 text-center text-muted-foreground">
              No tweets found.
            </div>
          )}

        {!loadingTweets &&
          !tweetsError &&
          tweets.length === 0 &&
          activeTab === "search" &&
          !searchQuery.trim() && (
            <div className="rounded-card bg-secondary p-8 text-center text-muted-foreground">
              Enter a query to search @{username}&apos;s tweets.
            </div>
          )}
      </div>
    </AppShell>
  );
}
