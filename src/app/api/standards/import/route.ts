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

  const llmConfig = new Config();
  const llmClient = new LLMClient(llmConfig, headers);

  const systemPrompt = `你是中国产品体验标准解析专家。你从标准文档文本中提取检查项，所有输出必须使用中文。
规则：
1. 只输出一个JSON数组，不要输出任何其他文字、解释或markdown标记
2. 所有字段值必须用中文填写，禁止使用英文
3. sensory_dimension只允许：视觉/听觉/触觉/嗅觉/味觉，无法确定设为null
4. test_phase只允许中文：开箱/安装/使用/清洁/收纳/维护等，无法确定设为null
5. check_dimension用中文：间隙/段差/表面质量/色差/结构强度/装配精度/间隙段差/异味/噪音/安全性能/口感/移位等，无法确定设为null
6. check_item用中文描述具体检查内容（必填）
7. check_requirement用中文描述合格判定标准，无法确定设为null
8. measurement_position用中文描述测量位置/检查范围，无法确定设为null
9. check_tool用中文：目视/卡尺/塞尺/测力计/噪音仪/手感等，无法确定设为null
10. problem_level只允许：致命/严重/一般/轻微，无法确定设为"一般"
11. standard_a/standard_b/standard_c为A/B/C面标准值，无法确定设为null

示例输出：
[{"sensory_dimension":"视觉","test_phase":"开箱","check_dimension":"间隙","check_item":"上盖与机身间隙","check_requirement":"间隙≤2mm，间隙差≤0.3mm","measurement_position":"上盖与机身连接处","check_tool":"目视","standard_a":null,"standard_b":null,"standard_c":null,"problem_level":"一般"}]`;

  // Split long text into chunks if needed, process first chunk
  const maxLen = 6000;
  const textChunk = textContent.substring(0, maxLen);

  const userPrompt = `请从以下中文标准文档文本中提取所有检查项。这是一份产品体验标准文档，可能包含表格。每行/每条对应一个检查项。请仔细识别每个检查项的各个字段，确保所有内容都用中文填写。check_item字段不能为空。

文本内容：
${textChunk}`;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];

  // Use pro model for better accuracy
  const response = await llmClient.invoke(messages, {
    model: 'doubao-seed-2-0-pro-260215',
    temperature: 0.05,
  });

  const content = response.content.trim();

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
    // JSON may be truncated (LLM output limit). Try to repair by finding last complete object
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
    test_phase: ['体验阶段', '产品使用阶段', '使用阶段', '阶段', 'test_phase'],
    check_dimension: ['检查维度', '检查维度/检查项', '维度', 'check_dimension'],
    check_item: ['检查条目', '检查项', '检查内容', 'check_item'],
    check_requirement: ['检查要求', '合格标准', 'b.检查要求', 'check_requirement'],
    measurement_position: ['测量位置', 'a.检查范围', '检查范围', 'measurement_position'],
    check_tool: ['检查工具', '测量工具', '工具', 'check_tool'],
    standard_a: ['A面标准', 'A面', 'standard_a'],
    standard_b: ['B面标准', 'B面', 'standard_b'],
    standard_c: ['C面标准', 'C面', 'standard_c'],
    problem_level: ['问题等级', '等级', 'problem_level'],
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
      const buffer = Buffer.from(await file.arrayBuffer());
      items = parseExcel(buffer);
    } else {
      return NextResponse.json({ code: 1, message: '不支持的文件格式，请上传PDF或Excel文件' }, { status: 400 });
    }

    if (items.length === 0) {
      return NextResponse.json({ code: 1, message: '未能从文件中提取到标准检查项，请检查文件内容或尝试Excel格式' }, { status: 400 });
    }

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
