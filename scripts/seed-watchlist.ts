/**
 * Seed the watchlist with initial users.
 * Usage: bun scripts/seed-watchlist.ts
 */
import { Database } from "bun:sqlite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, "../database/xray.db");

// ---------------------------------------------------------------------------
// Tag color generator (mirror of src/lib/tag-color.ts)
// ---------------------------------------------------------------------------

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

function generateTagColor(name: string): string {
  const hash = djb2(name.toLowerCase().trim());
  const bucket = Math.abs(hash) % 12;
  const hue = bucket * 30;
  return `hsl(${hue}, 70%, 45%)`;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const USER_ID = "1610a911-12db-4750-b7a8-567d3d1ec42a";

const TAGS = [
  "研究员",
  "创业者",
  "公司",
  "教育",
  "评论",
  "工程师",
  "内容创作者",
] as const;

type TagName = (typeof TAGS)[number];

interface SeedUser {
  username: string;
  note: string;
  tags: TagName[];
}

const SEED_USERS: SeedUser[] = [
  {
    username: "rasbt",
    note: "ML/AI 研究工程师，统计学前教授，《从零构建大语言模型》作者",
    tags: ["研究员", "教育"],
  },
  {
    username: "demi_guo_",
    note: "Pika Labs 联合创始人兼CEO，AI视频生成",
    tags: ["创业者"],
  },
  {
    username: "KirkDBorne",
    note: "数据科学/AI 顶级意见领袖，天体物理学博士（加州理工），全球演讲者",
    tags: ["评论", "内容创作者"],
  },
  {
    username: "tunguz",
    note: "前 Nvidia ML 工程师，Kaggle 大师，XGBoost 创作者，斯坦福校友",
    tags: ["研究员", "工程师"],
  },
  {
    username: "EMostaque",
    note: "Stability AI 创始人，开源主权AI倡导者",
    tags: ["创业者"],
  },
  {
    username: "bcherny",
    note: "Anthropic Claude Code 工程师",
    tags: ["工程师"],
  },
  {
    username: "GaryMarcus",
    note: "AI 知名批评家与评论者，被《纽约客》引述为AI温和批评代表",
    tags: ["评论", "研究员"],
  },
  {
    username: "jeremyphoward",
    note: "Answer.AI / fast.ai 联合创始人，Kaggle 创始主席，斯坦福研究员",
    tags: ["创业者", "教育", "研究员"],
  },
  {
    username: "NVIDIAAI",
    note: "NVIDIA AI 官方账号，前沿AI突破与商业应用动态",
    tags: ["公司"],
  },
  {
    username: "JeffDean",
    note: "Google DeepMind 首席科学家，Gemini 负责人，TensorFlow/MapReduce/Bigtable 作者",
    tags: ["研究员", "公司"],
  },
  {
    username: "DeepLearningAI",
    note: "吴恩达创办的AI教育平台，致力于全球AI社区建设",
    tags: ["教育", "公司"],
  },
  {
    username: "DotCSV",
    note: "西班牙语AI科普创作者 Carlos Santana，YouTube/TikTok/Instagram 多平台",
    tags: ["内容创作者", "教育"],
  },
  {
    username: "AIatMeta",
    note: "Meta AI 官方账号，推动开源AI科学研究",
    tags: ["公司"],
  },
  {
    username: "AndrewYNg",
    note: "吴恩达，Coursera 联合创始人，斯坦福教授，前百度AI/Google Brain负责人",
    tags: ["研究员", "教育", "创业者"],
  },
  {
    username: "chelseabfinn",
    note: "斯坦福CS/EE助理教授，Physical Intelligence联合创始人，MIT/Berkeley背景",
    tags: ["研究员", "创业者"],
  },
];

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

const db = new Database(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");

// 1) Create tags
const insertTag = db.prepare(
  "INSERT OR IGNORE INTO tags (user_id, name, color) VALUES (?, ?, ?)"
);
const findTag = db.prepare(
  "SELECT id FROM tags WHERE user_id = ? AND name = ?"
);

const tagIdMap = new Map<string, number>();

for (const tagName of TAGS) {
  insertTag.run(USER_ID, tagName, generateTagColor(tagName));
  const row = findTag.get(USER_ID, tagName) as { id: number } | null;
  if (row) tagIdMap.set(tagName, row.id);
}

console.log(`Created ${tagIdMap.size} tags:`, Object.fromEntries(tagIdMap));

// 2) Create watchlist members + assign tags
const insertMember = db.prepare(
  "INSERT OR IGNORE INTO watchlist_members (user_id, twitter_username, note, added_at) VALUES (?, ?, ?, ?)"
);
const findMember = db.prepare(
  "SELECT id FROM watchlist_members WHERE user_id = ? AND twitter_username = ?"
);
const insertMemberTag = db.prepare(
  "INSERT OR IGNORE INTO watchlist_member_tags (member_id, tag_id) VALUES (?, ?)"
);

let added = 0;

for (const user of SEED_USERS) {
  const now = Math.floor(Date.now() / 1000);
  insertMember.run(USER_ID, user.username.toLowerCase(), user.note, now);

  const row = findMember.get(USER_ID, user.username.toLowerCase()) as {
    id: number;
  } | null;
  if (!row) {
    console.error(`  SKIP: ${user.username} — failed to insert`);
    continue;
  }

  for (const tagName of user.tags) {
    const tagId = tagIdMap.get(tagName);
    if (tagId) {
      insertMemberTag.run(row.id, tagId);
    }
  }

  added++;
  console.log(
    `  + @${user.username} [${user.tags.join(", ")}]`
  );
}

console.log(`\nDone: ${added} users added, ${tagIdMap.size} tags.`);

db.close();
