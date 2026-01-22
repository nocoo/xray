---
name: x-ray-classify
description: 从原始推文中挑选 20 条最有价值的信息，按价值排序输出
---

# X-Ray 信息筛选

## 任务

从 `data/raw_tweets.json` 中挑选出 **20 条最值得关注的推文/Thread**，按价值从高到低排序。

## Thread 处理

同一作者对自己推文的连续回复应视为一个整体（Thread）：

```
主推文 "搞了一个牛皮 Skills！..."
  └── 回复 "安装及项目地址：github.com/..."
        └── 回复 "之前推荐用 Claude Code+yt-dlp..."
              └── 回复 "成本很低"
```

**识别方法**：
- 检查 `reply_to_id` 字段，找到父推文
- 如果父推文和当前推文是同一作者，则属于同一 Thread
- 递归向上找到 root（没有 reply_to_id 或 reply_to_id 不在本批数据中）

**Thread 权重加成**：
- 多条回复的 Thread 说明作者对这个话题有更多要说的，信息量更大
- Thread 应该**优先排在前面**
- 选择时只需要输出 Thread 的 root tweet_id

## 选择标准

用你的判断力挑选，考虑：

1. **信息价值** — 有实质内容，不是水贴
2. **独特性** — 有新观点、新信息、新资源
3. **时效性** — 正在发生的事、新发布的东西
4. **Thread 加成** — 连续回复说明话题更深入

值得选的类型：
- 热点事件（产品发布、重大新闻、行业动态）
- 有深度的洞察或观点
- 实用资源（工具、教程、开源项目）
- 有趣的讨论或争议

不限于技术内容，只要有价值就行。

## 排除

- 纯转发无评论
- 广告/推销
- 无信息量的日常闲聊
- 重复内容（选最有代表性的一条）
- 已经被合并到 Thread 中的子回复（只选 root）

## 执行步骤

1. 读取 `data/raw_tweets.json`
2. **识别 Thread**：找出同一作者对自己的连续回复，合并为 Thread
3. 理解所有推文/Thread 内容
4. 挑选 20 条最有价值的（Thread 优先，如果不足 20 条只选有价值的）
5. 按价值从高到低排序
6. 为每条写一句中文理由（说明为什么值得看）
7. 写入 `data/classified.json`

## 输出格式

```json
{
  "classified_at": "2026-01-22T12:00:00.000Z",
  "source_file": "data/raw_tweets.json",
  "total_count": 45,
  "thread_count": 32,
  "results": [
    {
      "tweet_id": "2014197979239031224",
      "reason": "歸藏分享 Claude Code Skills 自动剪辑 YouTube 视频（4 条连续回复，完整介绍项目）"
    },
    {
      "tweet_id": "2014187259252388256",
      "reason": "yetone 分享 Vibe Coding 对程序员群体的影响洞察"
    }
  ]
}
```

## 注意

- 理由必须用**中文**，即使原推文是英文
- 理由要简洁有力，一句话点明价值所在
- 如果是 Thread，可以在理由中注明"（N 条连续回复）"
- 不需要输出任何分类标签或评分
- 只输出 tweet_id（Thread 的 root ID）和 reason，不要添加其他字段

## 完成通知

分类完成后，**必须**调用 `task-notifier` skill 通知用户：

```bash
# 成功时
python3 /Users/nocoo/workspace/personal/skill-task-notifier/scripts/notify.py "X-Ray 分类完成：从 {total_count} 条推文中筛选了 {selected_count} 条" success

# 失败时
python3 /Users/nocoo/workspace/personal/skill-task-notifier/scripts/notify.py "X-Ray 分类失败：{error_message}" error
```
