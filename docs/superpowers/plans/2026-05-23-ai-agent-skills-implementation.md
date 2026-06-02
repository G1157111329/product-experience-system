# AI Agent Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PRD-approved AI Agent assistance layer with independent model configs, versioned skill templates, enable/disable controls, audit logs, and the first task-creation preset workflow.

**Architecture:** Add Drizzle schema definitions for Agent tables, centralize AI model resolution in `src/lib/server/ai.ts`, add server-side skill template helpers and API routes, then expose an admin settings UI and a task-detail Agent preset entry. First implementation keeps Agent suggestions as reviewable drafts; only user-confirmed selections write to check records or recipes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Supabase PostgreSQL, Drizzle schema, shadcn/ui, Tailwind CSS 4, S3-compatible storage, and OpenAI-compatible custom API.

---

## Scope

This plan implements the foundation and first usable vertical slice:

- Independent data model for model configs, skill templates, skill versions, and audit logs.
- Backward-compatible migration path from existing `platform_settings.ai_config`.
- Admin CRUD UI/API for model config and skill template/version management.
- Unified server helper for invoking active model config.
- Agent run endpoint for five-sense standard preset and recipe/scene preset suggestions.
- Task detail UI for reviewing, accepting, and rejecting suggestions.

Out of scope for this first pass:

- Real external internet search. Use admin-maintained hotspot summary and internal library/history data.
- Rich prompt diff viewer.
- Per-token usage billing.
- Automated DB migration runner, because the repo currently only has `schema.ts` and no migrations folder.

---

## File Map

- Modify: `src/storage/database/shared/schema.ts`
  - Add `ai_model_configs`, `agent_skill_templates`, `agent_skill_versions`, `agent_skill_audit_logs`.

- Create: `src/lib/agent-skills.ts`
  - Shared types, default skill keys, output schemas, default prompt templates, suggestion normalization helpers.

- Create: `src/lib/agent-skills.test.ts`
  - TDD tests for default skill definitions, suggestion normalization, and immutable version selection helpers.

- Modify: `src/lib/server/ai.ts`
  - Resolve active model config from `ai_model_configs`, fallback to `platform_settings.ai_config`, then fallback to built-in defaults.
  - Keep OpenAI-compatible custom API support.

- Create: `src/lib/server/agent-skills.ts`
  - Server helpers for admin checks, active skill/version lookup, audit logging, prompt rendering, and suggestion parsing.

- Create: `src/app/api/ai/model-configs/route.ts`
  - GET list model configs.
  - POST create/update model config.
  - PUT activate a model config.

- Create: `src/app/api/ai/skill-templates/route.ts`
  - GET list skill templates with active version.
  - POST create new skill version.
  - PUT enable/disable template or activate version.

- Create: `src/app/api/ai/skill-templates/[id]/versions/route.ts`
  - GET version history for one template.

- Create: `src/app/api/tasks/[id]/agent-presets/route.ts`
  - POST run Agent preset suggestions.
  - PUT accept or reject suggestions and write accepted drafts.

- Create: `src/components/settings/ai-agent-settings.tsx`
  - Admin UI for model config and four skill template entries.

- Modify: `src/components/navigation.tsx`
  - Replace/extend existing AI model dialog entry to open `AiAgentSettings`.

- Create: `src/app/(main)/tasks/[id]/components/agent-preset-panel.tsx`
  - Task detail panel/dialog to run suggestions and accept selected items.

- Modify: `src/app/(main)/tasks/[id]/page.tsx`
  - Add Agent preset entry near task header and refresh task data after acceptance.

---

## Task 1: Agent Skill Pure Helpers

**Files:**
- Create: `src/lib/agent-skills.test.ts`
- Create: `src/lib/agent-skills.ts`

- [ ] **Step 1: Write failing tests for skill keys and default templates**

```ts
import assert from 'node:assert/strict';
import {
  AGENT_SKILL_KEYS,
  getDefaultSkillDefinitions,
  normalizePresetSuggestions,
  renderPromptTemplate,
} from './agent-skills';

const defaults = getDefaultSkillDefinitions();

assert.deepEqual(AGENT_SKILL_KEYS, [
  'senses_standard_preset',
  'recipe_scene_preset',
  'effect_evaluation',
  'report_summary',
]);

assert.equal(defaults.length, 4);
assert.equal(defaults.every((item) => item.systemPrompt.includes('JSON')), true);
assert.equal(defaults.every((item) => item.outputSchema && typeof item.outputSchema === 'object'), true);

assert.equal(
  renderPromptTemplate('品类：{{product_category}}，目的：{{test_purpose}}', {
    product_category: '破壁机',
    test_purpose: '验证早餐豆浆体验',
  }),
  '品类：破壁机，目的：验证早餐豆浆体验',
);

const normalized = normalizePresetSuggestions({
  standards: [{ standard_item_id: 's1', reason: '重点风险', focus: '噪音' }],
  recipes: [{ name: '快速豆浆', ingredients: '黄豆 50g，水 600ml', steps: [{ operation: '加入食材' }] }],
});

assert.equal(normalized.standards[0].standardItemId, 's1');
assert.equal(normalized.recipes[0].steps[0].operation, '加入食材');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm exec tsx src/lib/agent-skills.test.ts`

Expected: FAIL because `src/lib/agent-skills.ts` does not exist.

- [ ] **Step 3: Implement helper module**

Create `src/lib/agent-skills.ts` with:

```ts
export const AGENT_SKILL_KEYS = [
  'senses_standard_preset',
  'recipe_scene_preset',
  'effect_evaluation',
  'report_summary',
] as const;

export type AgentSkillKey = typeof AGENT_SKILL_KEYS[number];

export interface DefaultSkillDefinition {
  skillKey: AgentSkillKey;
  name: string;
  description: string;
  systemPrompt: string;
  userPromptTemplate: string;
  outputSchema: Record<string, unknown>;
}

export interface NormalizedStandardSuggestion {
  standardItemId: string;
  standardCategory?: string;
  reason: string;
  focus: string;
}

export interface NormalizedRecipeSuggestion {
  name: string;
  recipeType: string;
  ingredients: string;
  reason: string;
  steps: Array<{ operation: string }>;
}

export interface NormalizedPresetSuggestions {
  standards: NormalizedStandardSuggestion[];
  recipes: NormalizedRecipeSuggestion[];
}

export function getDefaultSkillDefinitions(): DefaultSkillDefinition[] {
  return [
    {
      skillKey: 'senses_standard_preset',
      name: '五感体验标准预设',
      description: '根据体验目的推荐重点检查标准。',
      systemPrompt: '你是产品体验标准专家。必须输出 JSON。',
      userPromptTemplate: '请根据任务信息推荐重点五感检查项：{{task_snapshot}}',
      outputSchema: { standards: [{ standard_item_id: 'string', reason: 'string', focus: 'string' }] },
    },
    {
      skillKey: 'recipe_scene_preset',
      name: '食谱/功能/场景筛选',
      description: '根据体验目的推荐食谱、功能或使用场景。',
      systemPrompt: '你是产品体验场景规划专家。必须输出 JSON。',
      userPromptTemplate: '请根据任务信息、食谱库和热点摘要推荐功能场景：{{task_snapshot}}',
      outputSchema: { recipes: [{ name: 'string', ingredients: 'string', steps: [{ operation: 'string' }] }] },
    },
    {
      skillKey: 'effect_evaluation',
      name: '效果评价',
      description: '根据效果描述和素材生成综合评分与总结。',
      systemPrompt: '你是资深美食评委和小家电产品体验专家。必须输出 JSON。',
      userPromptTemplate: '请评价该食谱/功能效果：{{recipe_snapshot}}',
      outputSchema: { score: 8.5, summary: 'string' },
    },
    {
      skillKey: 'report_summary',
      name: '报告总体总结',
      description: '根据任务事实和历史报告生成报告总评。',
      systemPrompt: '你是资深产品体验负责人。必须输出 JSON。',
      userPromptTemplate: '请总结该体验任务：{{report_snapshot}}',
      outputSchema: { tag: 'string', satisfaction_score: 8, summary: 'string', strengths: [], risks: [], suggestions: [] },
    },
  ];
}

export function renderPromptTemplate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(values[key] ?? ''));
}

export function normalizePresetSuggestions(input: unknown): NormalizedPresetSuggestions {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const standardsRaw = Array.isArray(value.standards) ? value.standards : [];
  const recipesRaw = Array.isArray(value.recipes) ? value.recipes : [];

  return {
    standards: standardsRaw.map((item) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return {
        standardItemId: String(row.standard_item_id || row.standardItemId || ''),
        standardCategory: row.standard_category ? String(row.standard_category) : undefined,
        reason: String(row.reason || ''),
        focus: String(row.focus || ''),
      };
    }).filter((item) => item.standardItemId),
    recipes: recipesRaw.map((item) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const stepsRaw = Array.isArray(row.steps) ? row.steps : [];
      return {
        name: String(row.name || ''),
        recipeType: String(row.recipe_type || row.recipeType || '食谱'),
        ingredients: String(row.ingredients || ''),
        reason: String(row.reason || ''),
        steps: stepsRaw.map((step) => {
          const stepRow = step && typeof step === 'object' ? step as Record<string, unknown> : {};
          return { operation: String(stepRow.operation || '') };
        }).filter((step) => step.operation),
      };
    }).filter((item) => item.name),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm exec tsx src/lib/agent-skills.test.ts`

Expected: PASS with exit code 0.

---

## Task 2: Drizzle Schema For Independent Tables

**Files:**
- Modify: `src/storage/database/shared/schema.ts`

- [ ] **Step 1: Add table definitions**

Add four exported tables:

```ts
export const aiModelConfigs = pgTable("ai_model_configs", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  name: varchar({ length: 100 }).notNull(),
  provider: varchar({ length: 20 }).default('builtin').notNull(),
  model: varchar({ length: 100 }).notNull(),
  temperature: integer().default(5).notNull(),
  maxTokens: integer("max_tokens").default(2400).notNull(),
  supportsVision: boolean("supports_vision").default(false).notNull(),
  customApiUrl: text("custom_api_url"),
  customApiKeyEncrypted: text("custom_api_key_encrypted"),
  isActive: boolean("is_active").default(false).notNull(),
  createdBy: varchar("created_by", { length: 36 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});
```

Then add `agentSkillTemplates`, `agentSkillVersions`, and `agentSkillAuditLogs` matching the PRD table names and fields.

- [ ] **Step 2: Type-check schema**

Run: `corepack pnpm ts-check`

Expected: PASS or only unrelated pre-existing errors. If schema causes errors, fix before continuing.

---

## Task 3: Active Model Resolution

**Files:**
- Modify: `src/lib/server/ai.ts`
- Create: `src/lib/server/ai.test.ts`

- [ ] **Step 1: Write failing test for config resolution**

Test these cases:

```ts
import assert from 'node:assert/strict';
import { resolveAIConfig } from './ai';

assert.deepEqual(await resolveAIConfig(makeClient({ activeModel: { provider: 'custom', model: 'gpt-4o', temperature: 6, max_tokens: 3000 } })), {
  provider: 'custom',
  model: 'gpt-4o',
  temperature: 0.6,
  maxTokens: 3000,
  customApiUrl: '',
  customApiKey: '',
});

assert.equal((await resolveAIConfig(makeClient({ legacy: { model: 'kimi-k2-5-260127' } }))).model, 'kimi-k2-5-260127');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm exec tsx src/lib/server/ai.test.ts`

Expected: FAIL because `resolveAIConfig` is not exported.

- [ ] **Step 3: Implement resolution helper**

Add `resolveAIConfig(client, options?)` to:

1. Read active row from `ai_model_configs`.
2. If absent, read `platform_settings.ai_config`.
3. If absent, return built-in defaults.
4. Convert integer temperature scale `0-10` to model temperature `0-1` when needed.

- [ ] **Step 4: Wire `invokeConfiguredAI` to use `resolveAIConfig`**

Preserve existing function signature. Keep `forceBuiltInModel` behavior for routes that intentionally override the built-in model.

- [ ] **Step 5: Run tests**

Run:

```bash
corepack pnpm exec tsx src/lib/server/ai.test.ts
corepack pnpm exec tsx src/lib/agent-skills.test.ts
```

Expected: both PASS.

---

## Task 4: Admin API For Model Configs And Skills

**Files:**
- Create: `src/lib/server/agent-skills.ts`
- Create: `src/app/api/ai/model-configs/route.ts`
- Create: `src/app/api/ai/skill-templates/route.ts`
- Create: `src/app/api/ai/skill-templates/[id]/versions/route.ts`

- [ ] **Step 1: Add server helpers**

Implement:

```ts
export async function assertAdmin(client: SupabaseClientLike, adminUserId: string | null | undefined): Promise<void>
export async function logAgentAudit(client: SupabaseClientLike, input: AgentAuditInput): Promise<void>
export async function ensureDefaultSkillTemplates(client: SupabaseClientLike, adminUserId?: string): Promise<void>
```

- [ ] **Step 2: Add model config routes**

Required behavior:

- `GET /api/ai/model-configs` returns all configs.
- `POST /api/ai/model-configs` creates or updates config after admin check.
- `PUT /api/ai/model-configs` activates one config, deactivating all others.

- [ ] **Step 3: Add skill template routes**

Required behavior:

- `GET /api/ai/skill-templates` ensures default templates exist, then returns templates with active version.
- `POST /api/ai/skill-templates` creates a new immutable version.
- `PUT /api/ai/skill-templates` enables/disables or activates a version.

- [ ] **Step 4: Type-check routes**

Run: `corepack pnpm ts-check`

Expected: PASS or only unrelated pre-existing errors.

---

## Task 5: Agent Preset Run And Accept API

**Files:**
- Create: `src/app/api/tasks/[id]/agent-presets/route.ts`

- [ ] **Step 1: Implement POST run**

Input:

```json
{
  "skill_keys": ["senses_standard_preset", "recipe_scene_preset"],
  "user_id": "current-user-id"
}
```

Output:

```json
{
  "intent": {},
  "suggestions": {
    "standards": [],
    "recipes": []
  },
  "audit_ids": []
}
```

Server responsibilities:

- Load task.
- Load active skill versions.
- Load candidate `standard_items` and `recipe_library`.
- Render prompt.
- Invoke AI.
- Parse JSON with fallback to empty suggestions.
- Audit `run`.

- [ ] **Step 2: Implement PUT accept/reject**

Input:

```json
{
  "action": "accept_suggestion",
  "user_id": "current-user-id",
  "standards": [{ "standard_item_id": "..." }],
  "recipes": [{ "name": "...", "ingredients": "...", "steps": [{ "operation": "..." }] }]
}
```

Server responsibilities:

- For accepted standards, create `check_records` with `evaluation_result='待定'` and no materials.
- For accepted recipes, create `recipes` and `recipe_steps` with empty effect/problem/material fields.
- Audit `accept_suggestion` or `reject_suggestion`.

- [ ] **Step 3: Type-check**

Run: `corepack pnpm ts-check`

Expected: PASS or only unrelated pre-existing errors.

---

## Task 6: Admin AI Agent Settings UI

**Files:**
- Create: `src/components/settings/ai-agent-settings.tsx`
- Modify: `src/components/navigation.tsx`

- [ ] **Step 1: Add settings dialog**

UI sections:

- 模型接入: provider, model, temperature, max tokens, vision switch, custom API URL/key, active state.
- Skills 模板: four rows with enable switch, active version, edit prompt button, version history.
- Audit hint: explain changes and runs are recorded.

- [ ] **Step 2: Wire navigation**

Replace existing `AiConfigSettings` usage with `AiAgentSettings`, or wrap old model UI as the first tab in the new dialog.

- [ ] **Step 3: Type-check**

Run: `corepack pnpm ts-check`

Expected: PASS or only unrelated pre-existing errors.

---

## Task 7: Task Detail Agent Preset UI

**Files:**
- Create: `src/app/(main)/tasks/[id]/components/agent-preset-panel.tsx`
- Modify: `src/app/(main)/tasks/[id]/page.tsx`

- [ ] **Step 1: Add Agent preset panel**

UI behavior:

- Button label: `Agent预设建议`.
- Run options: 五感体验标准、食谱/功能场景、一键运行。
- Show suggestions as checkable lists.
- Accept selected suggestions.
- Reject all suggestions.

- [ ] **Step 2: Wire refresh**

After accepting suggestions:

- Refresh task detail.
- Refresh recipes.
- Keep created check records with empty result evidence fields.

- [ ] **Step 3: Type-check**

Run: `corepack pnpm ts-check`

Expected: PASS or only unrelated pre-existing errors.

---

## Task 8: Verification

**Commands:**

```bash
corepack pnpm exec tsx src/lib/agent-skills.test.ts
corepack pnpm exec tsx src/lib/server/ai.test.ts
corepack pnpm ts-check
corepack pnpm lint
```

Manual checks:

1. Admin opens AI Agent 设置.
2. Admin creates or activates model config.
3. Admin enables/disables each skill.
4. Admin creates a new skill version and activates it.
5. User opens task detail and runs Agent预设建议.
6. User accepts one standard suggestion and confirms a draft check record appears with empty result/material fields.
7. User accepts one recipe suggestion and confirms recipe/steps appear with empty effect/material/problem fields.
8. Audit logs receive run and accept/reject entries.

