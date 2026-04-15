import { NextRequest, NextResponse } from 'next/server';
import { S3Storage, FetchClient, LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import * as xlsx from 'xlsx';

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: '',
  secretKey: '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: 'cn-beijing',
});

interface ExtractedItem {
  sensory_dimension: string | null;
  test_phase: string | null;
  check_dimension: string | null;
  check_item: string;
  check_requirement: string | null;
  measurement_position: string | null;
  check_tool: string | null;
  standard_a: string | null;
  standard_b: string | null;
  standard_c: string | null;
  problem_level: string | null;
}

async function parsePdfWithLLM(pdfUrl: string, headers: Record<string, string>): Promise<ExtractedItem[]> {
  const fetchConfig = new Config();
  const fetchClient = new FetchClient(fetchConfig, headers);
  const fetchResponse = await fetchClient.fetch(pdfUrl);

  if (fetchResponse.status_code !== 0) {
    throw new Error(`PDF解析失败: ${fetchResponse.status_message}`);
  }

  const textContent = fetchResponse.content
    .filter(item => item.type === 'text')
    .map(item => item.text)
    .join('\n');

  if (!textContent || textContent.length < 50) {
    throw new Error('PDF内容为空或过短，无法提取标准项');
  }

  // Use LLM to extract structured standard items from text
  const llmConfig = new Config();
  const llmClient = new LLMClient(llmConfig, headers);

  const systemPrompt = `你是一个产品体验标准解析专家。你的任务是从标准文档文本中提取检查项。
你必须只输出一个JSON数组，不要输出任何其他文字、解释或markdown代码块标记。
每个元素是一个对象，包含以下字段：
- sensory_dimension: 感官维度，值为"视觉"/"听觉"/"触觉"/"嗅觉"/"味觉"之一，无法确定则设为null
- test_phase: 体验阶段，如"开箱"/"使用"/"清洁"/"收纳"等，无法确定则设为null
- check_dimension: 检查维度，如"间隙"/"段差"/"表面质量"/"色差"/"结构强度"等，无法确定则设为null
- check_item: 检查条目内容（必填，字符串）
- check_requirement: 检查要求或合格判定标准，无法确定则设为null
- measurement_position: 测量位置/检查范围，无法确定则设为null
- check_tool: 检查工具，如"目视"/"卡尺"/"测力计"等，无法确定则设为null
- standard_a: A面标准，无法确定则设为null
- standard_b: B面标准，无法确定则设为null
- standard_c: C面标准，无法确定则设为null
- problem_level: 问题等级，值为"致命"/"严重"/"一般"/"轻微"之一，无法确定则设为"一般"

输出示例：
[{"sensory_dimension":"视觉","test_phase":"开箱","check_dimension":"间隙","check_item":"上盖与机身间隙","check_requirement":"间隙≤2mm，间隙差≤0.3mm","measurement_position":"上盖与机身连接处","check_tool":"目视","standard_a":null,"standard_b":null,"standard_c":null,"problem_level":"一般"}]`;

  const userPrompt = `请从以下文本中提取所有标准检查项。文本可能包含表格数据，请仔细识别每行对应一个检查项。如果某些字段信息不明确，设为null。请确保check_item字段不为空。

文本内容：
${textContent.substring(0, 6000)}`;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];

  const response = await llmClient.invoke(messages, {
    model: 'doubao-seed-2-0-lite-260215',
    temperature: 0.1,
  });

  // Extract JSON from response - try multiple patterns
  const content = response.content.trim();

  // Try to find JSON array in the response
  let jsonStr: string | null = null;

  // Remove markdown code blocks if present
  const cleanedContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  // Try direct parse first
  if (cleanedContent.startsWith('[')) {
    jsonStr = cleanedContent;
  } else {
    // Try to find array pattern
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
    // Validate items have check_item
    return items.filter(item => item.check_item && typeof item.check_item === 'string' && item.check_item.trim().length > 0);
  } catch (parseErr) {
    console.error('JSON parse error:', parseErr, 'Content:', jsonStr.substring(0, 200));
    throw new Error('LLM返回的JSON解析失败，请重试');
  }
}

function parseExcel(buffer: Buffer): ExtractedItem[] {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });

  // Map common column names to fields
  const columnMap: Record<string, string[]> = {
    sensory_dimension: ['感官维度', '感官', 'sensory_dimension'],
    test_phase: ['体验阶段', '产品使用阶段', '使用阶段', '阶段', 'test_phase'],
    check_dimension: ['检查维度', '维度', 'check_dimension'],
    check_item: ['检查条目', '检查项', '检查内容', 'check_item'],
    check_requirement: ['检查要求', '合格标准', 'b.检查要求', 'check_requirement'],
    measurement_position: ['测量位置', 'a.检查范围', '检查范围', 'measurement_position'],
    check_tool: ['检查工具', '测量工具', '工具', 'check_tool'],
    standard_a: ['A面标准', 'A面', 'standard_a'],
    standard_b: ['B面标准', 'B面', 'standard_b'],
    standard_c: ['C面标准', 'C面', 'standard_c'],
    problem_level: ['问题等级', '等级', 'problem_level'],
  };

  // Build column mapping
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
      return {
        sensory_dimension: getItem('sensory_dimension'),
        test_phase: getItem('test_phase'),
        check_dimension: getItem('check_dimension'),
        check_item: getItem('check_item') || '',
        check_requirement: getItem('check_requirement'),
        measurement_position: getItem('measurement_position'),
        check_tool: getItem('check_tool'),
        standard_a: getItem('standard_a'),
        standard_b: getItem('standard_b'),
        standard_c: getItem('standard_c'),
        problem_level: getItem('problem_level') || '一般',
      };
    })
    .filter(item => item.check_item.length > 0);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const standard_name = formData.get('standard_name') as string;
    const category = formData.get('category') as string;
    const product_category = formData.get('product_category') as string | null;
    const description = formData.get('description') as string | null;

    if (!file || !standard_name || !category) {
      return NextResponse.json({ code: 1, message: '缺少必要参数' }, { status: 400 });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    let items: ExtractedItem[] = [];

    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.pdf')) {
      // Upload PDF to S3, then parse with fetch-url + LLM
      const buffer = Buffer.from(await file.arrayBuffer());
      const s3FileName = `standards-import/${Date.now()}_${file.name}`;
      const fileKey = await storage.uploadFile({
        fileContent: buffer,
        fileName: s3FileName,
        contentType: file.type || 'application/pdf',
      });
      const pdfUrl = await storage.generatePresignedUrl({ key: fileKey, expireTime: 600 });

      items = await parsePdfWithLLM(pdfUrl, customHeaders);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
      // Parse Excel/CSV directly
      const buffer = Buffer.from(await file.arrayBuffer());
      items = parseExcel(buffer);
    } else {
      return NextResponse.json({ code: 1, message: '不支持的文件格式，请上传PDF或Excel文件' }, { status: 400 });
    }

    if (items.length === 0) {
      return NextResponse.json({ code: 1, message: '未能从文件中提取到标准检查项，请检查文件内容或尝试Excel格式' }, { status: 400 });
    }

    // Create standard
    const client = getSupabaseClient();
    const { data: standard, error: stdError } = await client.from('standards').insert({
      standard_name,
      category,
      product_category: product_category || null,
      description: description || null,
      version: 'V1.0',
    }).select().single();

    if (stdError) {
      return NextResponse.json({ code: 1, message: stdError.message }, { status: 500 });
    }

    // Insert standard items
    const standardItems = items.map((item, index) => ({
      standard_id: standard.id,
      sort_order: index + 1,
      sensory_dimension: item.sensory_dimension,
      test_phase: item.test_phase,
      check_dimension: item.check_dimension,
      check_item: item.check_item,
      check_requirement: item.check_requirement,
      measurement_position: item.measurement_position,
      check_tool: item.check_tool,
      standard_a: item.standard_a,
      standard_b: item.standard_b,
      standard_c: item.standard_c,
      problem_level: item.problem_level,
    }));

    const { error: itemsError } = await client.from('standard_items').insert(standardItems);

    if (itemsError) {
      // Try to clean up the created standard
      await client.from('standards').delete().eq('id', standard.id);
      return NextResponse.json({ code: 1, message: itemsError.message }, { status: 500 });
    }

    return NextResponse.json({
      code: 0,
      message: `导入成功，共导入 ${items.length} 项检查项`,
      data: { standard_id: standard.id, item_count: items.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '导入失败';
    console.error('Import error:', message);
    return NextResponse.json({ code: 1, message }, { status: 500 });
  }
}
