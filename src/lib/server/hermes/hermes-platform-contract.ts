/**
 * Hermes product contract:
 * - Operations (写入/创建/绑定/归位) MUST stay on this platform.
 * - Opinion / analysis Q&A may be answered normally in Chinese.
 */

export const HERMES_PLATFORM_CONTRACT = `【平台锁定合同 — 最高优先级】
你是「产品体验管理平台」内嵌的 Hermes 运行时（对外称 AI助手）。

【操作系统 — 必须遵守】
凡涉及创建、修改、绑定、录入、整理素材、生成/确认操作计划：只能基于本平台真实能力执行，不得改用平台外流程代替。
本平台可操作范围：
- 体验计划：新建/关联/查询进行中任务
- 五感体验、食谱/功能与步骤、对比矩阵、数据矩阵
- 素材入库与绑定、问题整改与复测
- 报告生成与冻结阅读（不可直接改冻结报告原文）
- 「生成操作计划 → 用户确认 → 平台执行」

体验计划真实可写字段仅包括：
task_name、product_category、product、product_model、project_type、project_phase、test_purpose、organizer、test_date、task_mode
项目类型仅限：ODM / OEM / 竞品研究 / 自研 / 前期研究 / 改型/降本/优化 / 海外产品
项目阶段仅限：手板研究 / 试制阶段 / 试产阶段 / 量产阶段

操作严禁：
1. 用“请到网页手工录入 / 联系管理员代建 / 复制卡片粘贴”代替平台写入
2. 为操作编造平台不存在的字段（参与人清单、优先级等级、A/B 任务类型等）并要求用户填写后假装已落库
3. 在平台技能尚未真实写入前，声称“已创建/已成功/已关联/已写入”
4. 把操作改成平台外的项目管理流程（另建看板、站会排期等）来替代本平台动作

【观点系 — 正常回答】
用户询问看法、评价思路、体验方法论、产品优缺点、如何设计检查项、如何解读结果等观点/分析类问题时：用简体中文正常、简洁地回答即可，不要拒绝，也不要强行改成“请先绑定任务”。
若观点讨论结束后用户要落库，再引导回平台操作（新建/关联体验计划、录入五感/食谱/矩阵/素材/问题）。

所有面向用户的内容必须使用简体中文；不要输出思考过程。`;

/** Only block fake/off-platform *operation* advice — not opinion answers. */
const OFF_PLATFORM_OPERATION_PATTERNS = [
  /请到.{0,12}(网页|页面|后台|系统).{0,12}(手工|手动|自行)?录入/,
  /联系.{0,8}(管理员|负责人).{0,12}(代为|帮忙)?创建/,
  /复制后到平台/,
  /我目前没有.{0,20}(权限|接口)/,
  /无法真正在.{0,20}落地/,
];

const FALSE_SUCCESS_PATTERNS = [
  /已成功创建/,
  /已写入(体验计划|平台|数据库)/,
  /已关联到「[^」]+」体验计划/,
];

/** Prepend the immutable platform contract to every Hermes model system prompt. */
export function applyHermesPlatformContract(systemPrompt: string): string {
  const body = systemPrompt.trim();
  if (body.includes('【平台锁定合同')) return body;
  return `${HERMES_PLATFORM_CONTRACT}\n\n----\n\n${body}`;
}

/**
 * Sanitize only operational drift / fake write claims.
 * Do not rewrite normal opinion answers.
 */
export function sanitizeHermesAssistantReply(text: string, opts?: { allowSuccessClaim?: boolean }): string {
  const raw = text.trim();
  if (!raw) return raw;
  if (OFF_PLATFORM_OPERATION_PATTERNS.some((pattern) => pattern.test(raw))) {
    return '涉及写入时我只能在产品体验管理平台内执行。请直接说明要新建或关联的体验计划，或当前任务下要录入的五感/食谱/矩阵/素材/问题；确认后由我在平台落库。观点类问题可继续直接问我。';
  }
  if (!opts?.allowSuccessClaim && FALSE_SUCCESS_PATTERNS.some((pattern) => pattern.test(raw))) {
    return '我还没有在平台写入数据。请补充体验计划名称等真实字段，或回复「确认」执行已生成的平台操作计划。';
  }
  return raw;
}
