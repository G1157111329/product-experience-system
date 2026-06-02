import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getDb } from '@/storage/database/pg-db';
import { standardItems, standards } from '@/storage/database/shared/schema';
import { normalizeChatCompletionsUrl, resolveAIConfig } from '@/lib/server/ai';
import * as xlsx from 'xlsx';

// Unified extracted item that covers all standard categories
interface ExtractedItem {
  sensory_dimension: string | null;
  test_phase: string | null;
  experience_flow: string | null;
  touch_point: string | null;
  check_dimension: string | null;
  sub_check_dimension: string | null;
  check_item: string;
  check_requirement: string | null;
  experience_standard: string | null;
  check_standard: string | null;
  measurement_position: string | null;
  check_tool: string | null;
  problem_level: string | null;
  evaluation_prep: string | null;
  subjective_score: number | null;
  subjective_rating: string | null;
}

async function parsePdfWithLLM(pdfBuffer: Buffer, category: string): Promise<ExtractedItem[]> {
  // Extract text from PDF using pdf-parse
  const pdfParse = (await import('pdf-parse')).default;
  const pdfData = await pdfParse(pdfBuffer);
  const textContent = pdfData.text;

  if (!textContent || textContent.length < 50) {
    throw new Error('PDF内容为空或过短，无法提取标准项');
  }

  // Build category-specific system prompt
  let systemPrompt = `你是中国产品体验标准解析专家。你从标准文档文本中提取检查项，所有输出必须使用中文。
规则：
1. 只输出一个JSON数组，不要输出任何其他文字、解释或markdown标记
2. 所有字段值必须用中文填写，禁止使用英文
3. 无法确定的字段设为null，但check_item不能为空\n`;

  if (category === '通用标准') {
    systemPrompt += `4. sensory_dimension只允许：视觉/听觉/触觉/嗅觉/味觉
5. test_phase只允许：开箱/首次安装/产品使用/清洁收纳/其他
6. experience_flow必须严格遵循以下级联映射（experience_flow必须属于对应的test_phase）：
   - 开箱 → 拿取外包装/拆开内包装
   - 首次安装 → 配件梳理/外观美观/外观缺陷/标识文字/首次安装
   - 产品使用 → 放置及组装/操作交互/产品运行
   - 清洁收纳 → 冲水/擦拭/晾干/收纳
   - 其他 → 其他
   注意：外观缺陷属于首次安装，不属于产品使用；放置及组装属于产品使用，不属于首次安装
7. touch_point：触点描述，如"外箱手提把手"
8. check_requirement：检验范围及具体要求
9. experience_standard：体验标准，如"间隙≤2mm"
10. check_tool：测量工具，如"目视/卡尺/塞尺"
11. problem_level只允许：一类/二类/三类

示例输出：
[{"sensory_dimension":"视觉","test_phase":"开箱","experience_flow":"拿取外包装","touch_point":"外箱手提把手","check_item":"外箱手提把手","check_requirement":"手提把手牢固，无脱胶","experience_standard":"手提把手承重≥5kg","check_tool":"目视","problem_level":"二类","measurement_position":null,"check_dimension":null,"sub_check_dimension":null,"check_standard":null,"evaluation_prep":null,"subjective_score":null,"subjective_rating":null}]`;
  } else if (category === '品类标准') {
    systemPrompt += `4. sensory_dimension只允许：视觉/听觉/触觉/嗅觉/味觉
5. check_dimension：检查维度，如"间隙段差"
6. sub_check_dimension：细分检查维度，如"间隙"
7. check_item：具体检查条目，如"控制面板与外壳间隙段差"
8. check_requirement：检查要求及区域
9. check_standard：检查标准，如"间隙≤0.3mm"

示例输出：
[{"sensory_dimension":"视觉","check_dimension":"间隙段差","sub_check_dimension":"间隙","check_item":"控制面板与外壳间隙","check_requirement":"控制面板四周","check_standard":"间隙≤0.3mm","test_phase":null,"experience_flow":null,"touch_point":null,"experience_standard":null,"measurement_position":null,"check_tool":null,"problem_level":null,"evaluation_prep":null,"subjective_score":null,"subjective_rating":null}]`;
  } else if (category === '感官评价标准') {
    systemPrompt += `4. sensory_dimension只允许：视觉/听觉/触觉/嗅觉/味觉
5. evaluation_prep：感官评价准备，如"常温、无异味环境"
6. subjective_score：主观满意度分值(1-5整数)
7. subjective_rating：主观满意度描述，格式如"1分-十分不满意-描述"

示例输出：
[{"sensory_dimension":"味觉","evaluation_prep":"常温25°C，无异味环境，评价前清水漱口","subjective_score":1,"subjective_rating":"1分-十分不满意-豆浆口感差，存在较多细小颗粒，入口明显粗糙，顺滑度严重不足，吞咽时伴有明显粘喉感，饮用体验不佳","test_phase":null,"experience_flow":null,"touch_point":null,"check_dimension":null,"sub_check_dimension":null,"check_item":"味觉评价","check_requirement":null,"experience_standard":null,"check_standard":null,"measurement_position":null,"check_tool":null,"problem_level":null}]`;
  }

  const maxLen = 8000;
  const textChunk = textContent.substring(0, maxLen);

  const userPrompt = `请从以下中文标准文档文本中提取所有检查项。这是一份${category}文档，可能包含表格。每行/每条对应一个检查项。请仔细识别每个检查项的各个字段，确保所有内容都用中文填写。check_item字段不能为空。

文本内容：
${textChunk}`;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];

  const client = getSupabaseClient();
  const aiConfig = await resolveAIConfig(client, { defaultModel: 'Bear-Model-VL', defaultTemperature: 0.05 });

  const apiUrl = normalizeChatCompletionsUrl(aiConfig.customApiUrl);
  const apiKey = aiConfig.customApiKey;

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(60000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages,
        temperature: aiConfig.temperature,
        max_tokens: aiConfig.maxTokens,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'network error';
    throw new Error(`AI服务连接失败，请检查模型服务地址 ${apiUrl}: ${message}`);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI服务调用失败(${response.status}): ${errText.substring(0, 200)}`);
  }

  const result = await response.json();
  const content = (result.choices?.[0]?.message?.content || '').trim();

  let jsonStr: string | null = null;
  const cleanedContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  if (cleanedContent.startsWith('[')) {
    jsonStr = cleanedContent;
  } else {
    const match = cleanedContent.match(/\[[\s\S]*\]/);
    if (match) {
      jsonStr = match[0];
    }
  }

  if (!jsonStr) {
    throw new Error('LLM返回格式异常，无法解析标准项');
  }

  try {
    const items = JSON.parse(jsonStr) as ExtractedItem[];
    return items.filter(item => item.check_item && typeof item.check_item === 'string' && item.check_item.trim().length > 0);
  } catch {
    // JSON may be truncated. Try to repair by finding last complete object
    try {
      const lastBrace = jsonStr.lastIndexOf('}');
      if (lastBrace > 0) {
        const repaired = jsonStr.substring(0, lastBrace + 1) + ']';
        const items = JSON.parse(repaired) as ExtractedItem[];
        return items.filter(item => item.check_item && typeof item.check_item === 'string' && item.check_item.trim().length > 0);
      }
    } catch {
      // fallback
    }
    console.error('JSON parse error, content:', jsonStr.substring(0, 300));
    throw new Error('LLM返回的JSON解析失败，请重试');
  }
}

function parseExcel(buffer: Buffer): ExtractedItem[] {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });

  const columnMap: Record<string, string[]> = {
    sensory_dimension: ['感官维度', '感官', 'sensory_dimension'],
    test_phase: ['产品使用阶段', '体验阶段', '使用阶段', '阶段', 'test_phase'],
    experience_flow: ['体验流程', '流程', 'experience_flow'],
    touch_point: ['触点', 'touch_point'],
    check_dimension: ['检查维度', '维度', 'check_dimension'],
    sub_check_dimension: ['细分检查维度', '细分维度', 'sub_check_dimension'],
    check_item: ['检查条目', '具体检查条目', '检查项', '检查内容', 'check_item'],
    check_requirement: ['检验范围及具体要求', '检查要求', '检查要求及区域', '合格标准', 'check_requirement'],
    experience_standard: ['体验标准', 'experience_standard'],
    check_standard: ['检查标准', 'check_standard'],
    measurement_position: ['测量位置', '检查范围', 'measurement_position'],
    check_tool: ['测量工具', '检查工具', '工具', 'check_tool'],
    problem_level: ['问题等级', '等级', 'problem_level'],
    evaluation_prep: ['感官评价准备', '评价准备', 'evaluation_prep'],
    subjective_rating: ['主观满意度', '主观感受', 'subjective_rating'],
  };

  const fieldMapping: Record<string, string> = {};
  if (rows.length > 0) {
    const headers = Object.keys(rows[0]);
    for (const [field, aliases] of Object.entries(columnMap)) {
      for (const alias of aliases) {
        const matchedHeader = headers.find(h =>
          h.includes(alias) || alias.includes(h)
        );
        if (matchedHeader) {
          fieldMapping[field] = matchedHeader;
          break;
        }
      }
    }
  }

  return rows
    .map(row => {
      const getItem = (field: string): string | null => {
        const col = fieldMapping[field];
        const val = col ? row[col] : '';
        return val && val.toString().trim() ? val.toString().trim() : null;
      };
      const getNum = (field: string): number | null => {
        const v = getItem(field);
        if (!v) return null;
        const n = parseInt(v);
        return isNaN(n) ? null : n;
      };
      return {
        sensory_dimension: getItem('sensory_dimension'),
        test_phase: getItem('test_phase'),
        experience_flow: getItem('experience_flow'),
        touch_point: getItem('touch_point'),
        check_dimension: getItem('check_dimension'),
        sub_check_dimension: getItem('sub_check_dimension'),
        check_item: getItem('check_item') || '',
        check_requirement: getItem('check_requirement'),
        experience_standard: getItem('experience_standard'),
        check_standard: getItem('check_standard'),
        measurement_position: getItem('measurement_position'),
        check_tool: getItem('check_tool'),
        problem_level: getItem('problem_level'),
        evaluation_prep: getItem('evaluation_prep'),
        subjective_score: getNum('subjective_score'),
        subjective_rating: getItem('subjective_rating'),
      };
    })
    .filter(item => item.check_item.length > 0);
}

async function createImportedStandard(input: {
  standardName: string;
  category: string;
  productCategory: string | null;
  product: string | null;
  description: string | null;
  items: ExtractedItem[];
}) {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [standard] = await tx.insert(standards).values({
      standardName: input.standardName,
      category: input.category,
      productCategory: input.productCategory,
      product: input.product,
      description: input.description,
      version: 'V1.0',
    }).returning({ id: standards.id });

    if (!standard) {
      throw new Error('Failed to create standard');
    }

    await tx.insert(standardItems).values(input.items.map((item, index) => ({
      standardId: standard.id,
      sortOrder: index + 1,
      sensoryDimension: item.sensory_dimension,
      testPhase: item.test_phase,
      experienceFlow: item.experience_flow,
      touchPoint: item.touch_point,
      checkDimension: item.check_dimension,
      subCheckDimension: item.sub_check_dimension,
      checkItem: item.check_item,
      checkRequirement: item.check_requirement,
      experienceStandard: item.experience_standard,
      checkStandard: item.check_standard,
      measurementPosition: item.measurement_position,
      checkTool: item.check_tool,
      problemLevel: item.problem_level,
      evaluationPrep: item.evaluation_prep,
      subjectiveScore: item.subjective_score,
      subjectiveRating: item.subjective_rating,
    })));

    return standard.id;
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const standard_name = formData.get('standard_name') as string;
    const category = formData.get('category') as string;
    const product_category = formData.get('product_category') as string | null;
    const product = formData.get('product') as string | null;
    const description = formData.get('description') as string | null;

    if (!file || !standard_name || !category) {
      return NextResponse.json({ code: 1, message: '缺少必要参数' }, { status: 400 });
    }

    let items: ExtractedItem[] = [];

    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.pdf')) {
      const buffer = Buffer.from(await file.arrayBuffer());
      items = await parsePdfWithLLM(buffer, category);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
      const buffer = Buffer.from(await file.arrayBuffer());
      items = parseExcel(buffer);
    } else {
      return NextResponse.json({ code: 1, message: '不支持的文件格式，请上传PDF或Excel文件' }, { status: 400 });
    }

    if (items.length === 0) {
      return NextResponse.json({ code: 1, message: '未能从文件中提取到标准检查项，请检查文件内容或尝试Excel格式' }, { status: 400 });
    }

    const standardId = await createImportedStandard({
      standardName: standard_name,
      category,
      productCategory: product_category || null,
      product: product || null,
      description: description || null,
      items,
    });

    return NextResponse.json({
      code: 0,
      message: `导入成功，共导入 ${items.length} 项检查项`,
      data: { standard_id: standardId, item_count: items.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '导入失败';
    console.error('Import error:', message);
    return NextResponse.json({ code: 1, message }, { status: 500 });
  }
}
