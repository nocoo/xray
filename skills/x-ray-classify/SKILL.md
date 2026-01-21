---
name: x-ray-classify
description: Classifies tweets from raw_tweets.json by analyzing content for tech relevance and hot topics (AI/LLM/Agent focus). Uses AI understanding to categorize each tweet and outputs to classified.json.
---

# X-Ray Classification Skill

This skill reads raw tweets and classifies each one based on content analysis. This is an AI-powered task that requires understanding the semantic meaning of each tweet.

## Workflow

1. **Read raw tweets**: Load `data/raw_tweets.json`
2. **Classify each tweet**: Analyze content for tech relevance
3. **Write results**: Save to `data/classified.json`

## Classification Criteria

For each tweet, determine:

### 1. Is Tech Related? (`is_tech_related: boolean`)

The tweet discusses or mentions:
- Programming languages (Python, Rust, TypeScript, Go, etc.)
- Frameworks and libraries (React, PyTorch, LangChain, etc.)
- Developer tools (Git, Docker, Kubernetes, VSCode, etc.)
- Software engineering concepts (architecture, testing, deployment)
- Tech companies and products (in technical context)
- Open source projects
- Technical research or papers

### 2. Is Hot Topic? (`is_hot_topic: boolean`)

Focus areas (as configured in `config/config.json`):
- **AI/LLM**: Large Language Models, GPT, Claude, Gemini, transformers
- **Agent**: AI Agents, autonomous systems, tool use, function calling, MCP
- **Related**: RAG, fine-tuning, prompt engineering, embeddings, inference

### 3. Category (`category: string[]`)

Assign relevant tags from:
- `AI/LLM` - Language models, neural networks
- `Agent` - AI agents, autonomous systems
- `Open Source` - OSS projects, releases
- `DevTools` - Developer tools, IDEs
- `Infrastructure` - Cloud, containers, deployment
- `Security` - Vulnerabilities, security tools
- `Research` - Academic papers, new techniques

### 4. Relevance Score (`relevance_score: number`)

0-100 scale:
- **90-100**: Core AI/LLM/Agent content, major announcements
- **70-89**: Related tech content, useful for practitioners
- **50-69**: General tech, tangentially related
- **30-49**: Weak tech connection
- **0-29**: Not tech related

### 5. Reason (`reason: string`)

Brief explanation (1-2 sentences) of why this classification was given.

## Filter Out

Automatically give low scores to:
- Pure retweets without commentary
- Promotional/advertisement content
- Personal life updates (unless tech-related)
- Political discussions (unless tech policy)
- Memes without technical substance

## Output Format

Write to `data/classified.json`:

```json
{
  "classified_at": "2026-01-21T15:35:00.000Z",
  "source_file": "data/raw_tweets.json",
  "results": [
    {
      "tweet_id": "1881234567890",
      "classification": {
        "is_tech_related": true,
        "is_hot_topic": true,
        "category": ["AI/LLM", "Research"],
        "relevance_score": 95,
        "reason": "Announces new LLM training technique with significant performance improvements"
      }
    }
  ]
}
```

## Execution Steps

1. Read `data/raw_tweets.json` using the Read tool
2. For each tweet in the `tweets` array:
   - Read the `text` field
   - Consider the `author` context
   - Apply classification criteria
3. Build the results array
4. Write the complete JSON to `data/classified.json` using the Write tool

## Example Classifications

**High relevance (90+):**
> "Just released GPT-5 with 10x inference speed improvements and native tool use"
- is_tech_related: true
- is_hot_topic: true
- category: ["AI/LLM", "Agent"]
- relevance_score: 98
- reason: "Major LLM release with agent capabilities"

**Medium relevance (50-70):**
> "Spent the weekend refactoring our codebase to use the new React 19 features"
- is_tech_related: true
- is_hot_topic: false
- category: ["DevTools"]
- relevance_score: 55
- reason: "General frontend development, not AI-focused"

**Low relevance (<30):**
> "Great dinner with friends last night!"
- is_tech_related: false
- is_hot_topic: false
- category: []
- relevance_score: 0
- reason: "Personal update, not tech related"
