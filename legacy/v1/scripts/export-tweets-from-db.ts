import { Database } from "bun:sqlite";
import { writeFileSync } from "fs";

const db = new Database("data/x-ray.db", { readonly: true });

const query = db.query(`
  SELECT 
    id,
    text,
    author_id,
    author_username,
    author_name,
    author_profile_image,
    created_at,
    url,
    like_count,
    retweet_count,
    reply_count,
    quote_count,
    view_count,
    lang,
    is_retweet,
    is_quote,
    is_reply
  FROM tweets
  WHERE created_at > datetime('now', '-7 days')
    AND is_retweet = 0
  ORDER BY created_at DESC
  LIMIT 50
`);

const rows = query.all();
const tweets = rows.map(row => ({
  id: row.id as string,
  text: row.text as string,
  author: {
    id: row.author_id as string,
    username: (row.author_username as string).replace(/^@/, ""),
    name: row.author_name as string,
    profile_image_url: row.author_profile_image as string
  },
  created_at: row.created_at as string,
  url: row.url as string,
  metrics: {
    like_count: (row.like_count as number) || 0,
    retweet_count: (row.retweet_count as number) || 0,
    reply_count: (row.reply_count as number) || 0,
    quote_count: (row.quote_count as number) || 0,
    view_count: (row.view_count as number) || 0,
    bookmark_count: 0
  },
  lang: row.lang as string,
  is_retweet: (row.is_retweet as number) === 1,
  is_quote: (row.is_quote as number) === 1,
  is_reply: (row.is_reply as number) === 1
}));

const output = {
  fetched_at: new Date().toISOString(),
  tweets
};

writeFileSync("data/raw_tweets.json", JSON.stringify(output, null, 2));
console.log(`已生成 raw_tweets.json，包含 ${tweets.length} 条推文`);

db.close();
