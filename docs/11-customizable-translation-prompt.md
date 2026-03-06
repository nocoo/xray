# Customizable Translation Prompt

> Status: **Planned** | Created: 2026-03-07

## 1. Background

The translation feature currently uses two hardcoded prompts in `src/services/translation.ts`:

- `TRANSLATION_PROMPT` (line 56–79) — single tweet translation + editorial comment
- `TRANSLATION_WITH_QUOTE_PROMPT` (line 81–110) — quote-tweet variant with quoted text translation

These two prompts share ~80% identical content. The only difference is the quote-tweet variant adds a "translate quoted text" task and an extra `[引用翻译]` output section. Users cannot customize the prompt tone, instructions, or output format.

## 2. Goal

Merge the two prompts into **one user-editable template** with Mustache-style variables and conditional blocks. Store it per-user in the existing `settings` KV table. Expose a prompt editor in the AI Settings page.

## 3. Template Design

### 3.1 Variables

| Variable | Description | Type |
|----------|-------------|------|
| `{{推文内容}}` | Main tweet text | Required — always present |
| `{{引用原文}}` | Quoted tweet text | Optional — used inside conditional block |
| `{{#引用原文}}...{{/引用原文}}` | Conditional block — rendered when quoted text exists, removed entirely when absent | Block |

### 3.2 Default Template

```
你是一位兼具"信达雅"功力的翻译家，同时也是一位对世界充满好奇心的顶级报刊编辑。

请对以下推文完成翻译和锐评任务，并严格按照指定格式输出：

## 任务一：翻译推文
以"信达雅"标准将推文翻译为简体中文。
- 保留技术术语、专有名词和 @提及原文不译。
- 保留 #话题标签 原文不译。
- 若推文本身已是中文，原样返回。
- 保持原文的语气和风格。

{{#引用原文}}
## 任务二：翻译引用原文
以同样标准翻译被引用的推文。
{{/引用原文}}

## 锐评
用1-2句中文写一段编辑锐评——以顶级报刊编辑的视角，点评这条推文为什么值得关注、背后有什么有趣的信号或洞察。要求犀利、有信息增量、不浮夸。

## 输出格式（严格遵守，不要添加任何额外文字）

[翻译]
{翻译内容}

{{#引用原文}}
[引用翻译]
{被引用推文的翻译}
{{/引用原文}}

[锐评]
{锐评内容}

推文内容：
{{推文内容}}

{{#引用原文}}
引用原文：
{{引用原文}}
{{/引用原文}}
```

### 3.3 Template Rendering Rules

1. **Value substitution**: `{{推文内容}}` → actual tweet text
2. **Conditional block**: `{{#引用原文}}...{{/引用原文}}`
   - If `quotedText` is provided and non-empty → keep the block content, replace `{{引用原文}}` inside with actual quoted text
   - If `quotedText` is absent or empty → remove the entire block (including delimiters and all content between them)
3. **Unknown variables**: left as-is (no error, no removal)
4. **Empty template / missing `{{推文内容}}`**: fall back to `DEFAULT_TRANSLATION_TEMPLATE`

## 4. Storage

Reuse the existing `settings` KV table (`user_id` + `key` composite PK):

| Key | Value | Default |
|-----|-------|---------|
| `ai.translationPrompt` | User's custom template string | `""` (empty = use default template) |

No schema migration needed.

## 5. Implementation Plan

### 5.1 Backend: Template Engine (`src/services/translation.ts`)

| Step | Change |
|------|--------|
| 1 | Delete `TRANSLATION_PROMPT` and `TRANSLATION_WITH_QUOTE_PROMPT` constants |
| 2 | Add `DEFAULT_TRANSLATION_TEMPLATE` constant (Section 3.2 above) |
| 3 | Add `renderPrompt(template, vars)` function — processes conditional blocks then substitutes variables |
| 4 | Update `loadAiSettingsForUser()` to also read `ai.translationPrompt` |
| 5 | Update `translateText()` to use `renderPrompt()` with user template (or default) |

`renderPrompt` implementation:
```typescript
interface PromptVars {
  推文内容: string;
  引用原文?: string;
}

function renderPrompt(template: string, vars: PromptVars): string {
  let result = template;

  // 1. Process conditional blocks: {{#引用原文}}...{{/引用原文}}
  result = result.replace(
    /\{\{#引用原文\}\}([\s\S]*?)\{\{\/引用原文\}\}/g,
    (_, content) => vars.引用原文 ? content : "",
  );

  // 2. Substitute variables
  result = result.replace(/\{\{推文内容\}\}/g, vars.推文内容);
  result = result.replace(/\{\{引用原文\}\}/g, vars.引用原文 ?? "");

  return result.trim();
}
```

### 5.2 API: Settings Route (`src/app/api/settings/ai/route.ts`)

| Method | Change |
|--------|--------|
| `GET` | Read `ai.translationPrompt` from DB, include in response |
| `PUT` | Accept optional `translationPrompt` field, upsert to `ai.translationPrompt` |

### 5.3 Frontend: AI Settings Page (`src/app/(dashboard)/ai-settings/page.tsx`)

Add a new `TranslationPromptSection` component below `AiConfigSection`:

- **Textarea**: displays current template (user-saved or default), freely editable
- **Variable buttons** ("Insert variable"):
  - `{{推文内容}}` — inserts the variable tag at cursor position
  - `{{引用原文}}` — inserts the full conditional block `{{#引用原文}}\n\n{{引用原文}}\n{{/引用原文}}`
- **Reset to Default** button — restores `DEFAULT_TRANSLATION_TEMPLATE`
- **Save** button — PUTs to `/api/settings/ai`
- Loads on mount from `GET /api/settings/ai`; empty value shows default template as placeholder/initial value

### 5.4 Tests

| Test | File | Cases |
|------|------|-------|
| `renderPrompt` unit tests | `src/__tests__/services/translation-prompt.test.ts` | 1. No quote → conditional block removed, `{{推文内容}}` substituted |
|  |  | 2. With quote → conditional block rendered, both vars substituted |
|  |  | 3. Custom template → user-provided template works correctly |
|  |  | 4. Empty template → falls back to default |

## 6. Files Changed

| File | Type | Description |
|------|------|-------------|
| `src/services/translation.ts` | Modify | Merge prompts, add template engine |
| `src/app/api/settings/ai/route.ts` | Modify | Add `translationPrompt` to GET/PUT |
| `src/app/(dashboard)/ai-settings/page.tsx` | Modify | Add prompt editor section |
| `src/__tests__/services/translation-prompt.test.ts` | New | Unit tests for `renderPrompt` |

## 7. Non-Goals

- No syntax highlighting in the editor (plain textarea is sufficient)
- No prompt versioning or history
- No validation that the template produces good LLM output
- `parseTranslationResponse()` is NOT changed — it already handles presence/absence of `[引用翻译]` marker gracefully
