// =============================================================================
// Normalizer - Pure functions converting TweAPI responses to shared types
// =============================================================================

import type {
  Tweet,
  TweetAuthor,
  TweetMetrics,
  TweetMedia,
  TweetEntities,
  UserInfo,
  TwitterList,
  Analytics,
  DailyMetrics,
  AnalyticsWithTimeSeries,
} from "../../../shared/types";

import type {
  TweAPITweet,
  TweAPIAuthor,
  TweAPIList,
  TweAPIAnalytics,
} from "./api-types";

// =============================================================================
// Tweet normalization
// =============================================================================

export function normalizeTweet(apiTweet: TweAPITweet): Tweet {
  if (apiTweet.retweetedTweet) {
    const originalTweet = normalizeTweet(apiTweet.retweetedTweet);
    return {
      ...originalTweet,
      text: apiTweet.fullText,
      is_retweet: true,
    };
  }

  const author: TweetAuthor = {
    id: apiTweet.tweetBy.id,
    username: apiTweet.tweetBy.userName,
    name: apiTweet.tweetBy.fullName,
    profile_image_url: apiTweet.tweetBy.profileImage,
    followers_count: apiTweet.tweetBy.followersCount,
    is_verified: apiTweet.tweetBy.isVerified,
  };

  const metrics: TweetMetrics = {
    retweet_count: apiTweet.retweetCount || 0,
    like_count: apiTweet.likeCount || 0,
    reply_count: apiTweet.replyCount || 0,
    quote_count: apiTweet.quoteCount || 0,
    view_count: apiTweet.viewCount ?? 0,
    bookmark_count: apiTweet.bookmarkCount || 0,
  };

  const entities: TweetEntities = {
    hashtags: apiTweet.entities?.hashtags || [],
    mentioned_users: apiTweet.entities?.mentionedUsers || [],
    urls: apiTweet.entities?.urls || [],
  };

  let media: TweetMedia[] | undefined;
  if (apiTweet.media && apiTweet.media.length > 0) {
    media = apiTweet.media.map((m) => ({
      id: m.id,
      type: m.type,
      url: m.url,
      thumbnail_url: m.thumbnailUrl,
    }));
  }

  let quotedTweet: Tweet | undefined;
  if (apiTweet.quoted) {
    quotedTweet = normalizeTweet(apiTweet.quoted);
  }

  return {
    id: apiTweet.id,
    text: apiTweet.fullText,
    author,
    created_at: apiTweet.createdAt,
    url: apiTweet.url,
    metrics,
    is_retweet: false,
    is_quote: !!apiTweet.quoted,
    is_reply: !!apiTweet.replyTo,
    lang: apiTweet.lang,
    media,
    entities,
    quoted_tweet: quotedTweet,
    reply_to_id: apiTweet.replyTo,
  };
}

// =============================================================================
// User normalization
// =============================================================================

export function normalizeUserInfo(apiUser: TweAPIAuthor): UserInfo {
  return {
    id: apiUser.id,
    username: apiUser.userName,
    name: apiUser.fullName,
    description: apiUser.description,
    location: apiUser.location,
    profile_image_url: apiUser.profileImage,
    profile_banner_url: apiUser.profileBanner,
    followers_count: apiUser.followersCount,
    following_count: apiUser.followingsCount,
    tweet_count: apiUser.statusesCount,
    like_count: apiUser.likeCount,
    is_verified: apiUser.isVerified,
    created_at: apiUser.createdAt,
    pinned_tweet_id: apiUser.pinnedTweet,
  };
}

// =============================================================================
// List normalization
// =============================================================================

export function normalizeList(apiList: TweAPIList): TwitterList {
  return {
    id: apiList.id,
    name: apiList.name,
    description: apiList.description,
    member_count: apiList.memberCount,
    subscriber_count: apiList.subscriberCount,
    created_at: apiList.createdAt,
    created_by: apiList.createdBy,
    is_following: apiList.isFollowing,
    is_member: apiList.isMember,
  };
}

// =============================================================================
// Analytics normalization
// =============================================================================

export function normalizeAnalytics(apiAnalytics: TweAPIAnalytics): Analytics {
  const impressions = apiAnalytics.impressions ?? 0;
  const engagements = apiAnalytics.engagements ?? 0;
  const engagementRate =
    impressions > 0 ? (engagements / impressions) * 100 : 0;

  return {
    impressions,
    engagements,
    engagement_rate: engagementRate,
    likes: apiAnalytics.likes ?? 0,
    retweets: apiAnalytics.retweets ?? 0,
    replies: apiAnalytics.replies ?? 0,
    profile_visits: apiAnalytics.profileVisits ?? 0,
    followers: apiAnalytics.followers ?? 0,
    following: apiAnalytics.follows ?? 0,
    verified_followers: apiAnalytics.verifiedFollowers,
    bookmarks: apiAnalytics.bookmarks ?? undefined,
    shares: apiAnalytics.shares ?? undefined,
    unfollows: apiAnalytics.unfollows ?? undefined,
  };
}

export function parseTimeSeries(
  apiAnalytics: TweAPIAnalytics,
): DailyMetrics[] {
  const rawTimeSeries = apiAnalytics.organicMetricsTimeSeries;
  if (!rawTimeSeries || !Array.isArray(rawTimeSeries)) {
    return [];
  }

  return rawTimeSeries.map((day) => {
    const metrics: DailyMetrics = {
      date: day.timestamp.iso8601_time.split("T")[0] ?? day.timestamp.iso8601_time,
      impressions: 0,
      engagements: 0,
      profile_visits: 0,
      follows: 0,
      likes: 0,
      replies: 0,
      retweets: 0,
      bookmarks: 0,
    };

    for (const m of day.metric_values) {
      const value = m.metric_value ?? 0;
      switch (m.metric_type) {
        case "Impressions":
          metrics.impressions = value;
          break;
        case "Engagements":
          metrics.engagements = value;
          break;
        case "ProfileVisits":
          metrics.profile_visits = value;
          break;
        case "Follows":
          metrics.follows = value;
          break;
        case "Likes":
          metrics.likes = value;
          break;
        case "Replies":
          metrics.replies = value;
          break;
        case "Retweets":
          metrics.retweets = value;
          break;
        case "Bookmark":
          metrics.bookmarks = value;
          break;
      }
    }

    return metrics;
  });
}

export function normalizeAnalyticsWithTimeSeries(
  apiAnalytics: TweAPIAnalytics,
): AnalyticsWithTimeSeries {
  const analytics = normalizeAnalytics(apiAnalytics);
  const timeSeries = parseTimeSeries(apiAnalytics);
  return { ...analytics, time_series: timeSeries };
}
