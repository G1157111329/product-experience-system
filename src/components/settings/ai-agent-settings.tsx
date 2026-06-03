'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sparkles, Save, Power, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth-context';
import { getDefaultSkillDefinitions, getDefaultUserPromptTemplate } from '@/lib/agent-skills';

interface ModelConfig {
  id?: string;
  name: string;
  provider: string;
  model: string;
  temperature: number;
  max_tokens: number;
  supports_vision: boolean;
  custom_api_url: string;
  custom_api_key?: string;
  has_custom_api_key?: boolean;
  is_active?: boolean;
}

interface SkillTemplate {
  id: string;
  skill_key: string;
  name: string;
  description?: string;
  is_enabled: boolean;
  active_version_id: string | null;
  active_version?: {
    id: string;
    version: number;
    system_prompt: string;
    user_prompt_template: string;
    output_schema: Record<string, unknown>;
  } | null;
  is_builtin_draft?: boolean;
}

const emptyModel: ModelConfig = {
  name: 'Bear',
  provider: 'custom',
  model: 'Bear-Model-VL',
  temperature: 0.5,
  max_tokens: 2400,
  supports_vision: true,
  custom_api_url: 'http://ds.bears.com.cn:8000/v1',
  custom_api_key: 'Bear2025IT!',
};

const skillModuleLabels: Record<string, string> = {
  senses_standard_preset: 'AI体验方案 · 五感体验',
  recipe_scene_preset: 'AI体验方案 · 功能效果',
  effect_evaluation: '功能效果 · 效果评价',
  report_summary: '总结/报告',
  report_product_compare: '报告中心 · 产品体验对比',
};

const builtinSkillTemplates: SkillTemplate[] = getDefaultSkillDefinitions().map((skill) => ({
  id: `builtin:${skill.skillKey}`,
  skill_key: skill.skillKey,
  name: skill.name,
  description: skill.description,
  is_enabled: true,
  active_version_id: null,
  is_builtin_draft: true,
  active_version: {
    id: '',
    version: 1,
    system_prompt: skill.systemPrompt,
    user_prompt_template: skill.userPromptTemplate,
    output_schema: skill.outputSchema,
  },
}));

export function AiAgentSettings({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const { user } = useAuth();
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [modelForm, setModelForm] = useState<ModelConfig>(emptyModel);
  const [skills, setSkills] = useState<SkillTemplate[]>([]);
  const [editingSkill, setEditingSkill] = useState<SkillTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [initializingSkills, setInitializingSkills] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const displaySkills = skills.length > 0 ? skills : builtinSkillTemplates;

  const fetchData = useCallback(async () => {
    setSkillsError(null);
    try {
      const modelsRes = await fetch('/api/ai/model-configs');
      const modelsData = await modelsRes.json();
      if (modelsData.code === 0) {
        setModels(modelsData.data || []);
        const active = (modelsData.data || []).find((item: ModelConfig) => item.is_active);
        if (active) setModelForm({ ...emptyModel, ...active, custom_api_key: '' });
      }
    } catch {
      setModels([]);
    }

    try {
      const skillsRes = await fetch(`/api/ai/skill-templates?admin_user_id=${user?.id || ''}`);
      const skillsData = await skillsRes.json();
      if (skillsData.code === 0) {
        setSkills(skillsData.data || []);
        if ((skillsData.data || []).length === 0 && skillsData.meta?.errors?.length) {
          setSkillsError(skillsData.meta.errors.join('；'));
        }
      } else {
        setSkillsError(skillsData.message || 'Prompt 模板读取失败');
      }
    } catch (err) {
      setSkillsError(err instanceof Error ? err.message : 'Prompt 模板读取失败');
    }
  }, [user]);

  useEffect(() => {
    if (open) fetchData();
  }, [fetchData, open]);

  const saveModel = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const res = await fetch('/api/ai/model-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...modelForm, admin_user_id: user.id }),
      });
      const data = await res.json();
      if (data.code !== 0) {
        toast.error(data.message || '模型配置保存失败');
        return;
      }
      toast.success('模型配置已保存');
      await fetchData();
    } finally {
      setSaving(false);
    }
  };

  const activateModel = async (id: string) => {
    if (!user?.id) return;
    const res = await fetch('/api/ai/model-configs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, admin_user_id: user.id }),
    });
    const data = await res.json();
    if (data.code === 0) {
      toast.success('模型配置已启用');
      fetchData();
    } else {
      toast.error(data.message || '启用失败');
    }
  };

  const deleteModel = async (id: string) => {
    if (!user?.id || !confirm('确定删除此模型配置？')) return;
    const res = await fetch(`/api/ai/model-configs?id=${id}&admin_user_id=${user.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.code === 0) {
      toast.success('已删除');
      fetchData();
    } else {
      toast.error(data.message || '删除失败');
    }
  };

  const toggleSkill = async (template: SkillTemplate, enabled: boolean) => {
    if (!user?.id) return;
    const res = await fetch('/api/ai/skill-templates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: template.id, is_enabled: enabled, admin_user_id: user.id }),
    });
    const data = await res.json();
    if (data.code === 0) {
      toast.success(enabled ? 'Skill已启用' : 'Skill已停用');
      fetchData();
    } else {
      toast.error(data.message || '保存失败');
    }
  };

  const openPromptEditor = (template: SkillTemplate) => {
    setEditingSkill({
      ...template,
      active_version: template.active_version || {
        id: '',
        version: 0,
        system_prompt: '',
        user_prompt_template: '',
        output_schema: {},
      },
    });
  };

  const initializeSkillTemplates = async () => {
    if (!user?.id) return;
    setInitializingSkills(true);
    setSkillsError(null);
    try {
      const res = await fetch('/api/ai/skill-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ensure_defaults', admin_user_id: user.id }),
      });
      const data = await res.json();
      if (data.code !== 0) {
        setSkillsError(data.message || 'Prompt 模板初始化失败');
        toast.error(data.message || 'Prompt 模板初始化失败');
        return;
      }
      setSkills(data.data || []);
      toast.success('Prompt 模板已初始化');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Prompt 模板初始化失败';
      setSkillsError(message);
      toast.error(message);
    } finally {
      setInitializingSkills(false);
    }
  };

  const createSkillVersion = async () => {
    if (!user?.id || !editingSkill?.active_version) return;
    const version = editingSkill.active_version;
    // 自动生成 user_prompt_template：优先使用用户自定义，否则从默认模板获取
    const userPromptTemplate = version.user_prompt_template || getDefaultUserPromptTemplate(editingSkill.skill_key);
    const res = await fetch('/api/ai/skill-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(editingSkill.is_builtin_draft ? { skill_key: editingSkill.skill_key } : { template_id: editingSkill.id }),
        system_prompt: version.system_prompt,
        user_prompt_template: userPromptTemplate,
        output_schema: version.output_schema || {},
        notes: '管理员调整模板',
        admin_user_id: user.id,
      }),
    });
    const data = await res.json();
    if (data.code === 0) {
      toast.success('Skill新版本已启用');
      setEditingSkill(null);
      fetchData();
    } else {
      toast.error(data.message || '版本创建失败');
    }
  };

  const promptEditor = editingSkill?.active_version ? (
    <div className="space-y-3 rounded-lg border bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-medium">System Prompt</div>
          <div className="truncate text-xs text-muted-foreground">{editingSkill.name} · 编辑后保存即生效</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditingSkill(null)}>取消</Button>
          <Button size="sm" onClick={createSkillVersion}>保存并启用</Button>
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-xs">System Prompt <span className="text-muted-foreground">（编辑后系统自动适配 User Prompt）</span></Label>
        <Textarea className="min-h-60 resize-y" value={editingSkill.active_version.system_prompt}
          onChange={(event) => setEditingSkill({ ...editingSkill, active_version: { ...editingSkill.active_version!, system_prompt: event.target.value } })} />
      </div>
    </div>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-none sm:!w-[min(1180px,calc(100vw-3rem))] sm:!max-w-[1180px] xl:!w-[1180px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> AI Agent 设置
          </DialogTitle>
          <DialogDescription>管理模型接入、Prompt 模板版本、启停与审计能力</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[72vh] pr-3">
          <div className="flex min-w-0 flex-col gap-5 xl:flex-row">
            <section className="min-w-0 space-y-3 xl:w-[360px] xl:shrink-0">
              <div>
                <h3 className="text-sm font-semibold">模型接入</h3>
                <p className="text-xs text-muted-foreground">当前启用模型将作为 Agent 默认模型</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">配置名称</Label>
                <Input value={modelForm.name} onChange={(event) => setModelForm({ ...modelForm, name: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">模型名</Label>
                <Input value={modelForm.model} onChange={(event) => setModelForm({ ...modelForm, model: event.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label className="text-xs">温度</Label>
                  <Input type="number" min={0} max={1} step={0.1} value={modelForm.temperature}
                    onChange={(event) => setModelForm({ ...modelForm, temperature: Number(event.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">最大 token</Label>
                  <Input type="number" value={modelForm.max_tokens}
                    onChange={(event) => setModelForm({ ...modelForm, max_tokens: Number(event.target.value) })} />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label className="text-xs">支持视觉输入</Label>
                <Switch checked={modelForm.supports_vision} onCheckedChange={(checked) => setModelForm({ ...modelForm, supports_vision: checked })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">调用地址</Label>
                <Input value={modelForm.custom_api_url} onChange={(event) => setModelForm({ ...modelForm, custom_api_url: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">API Key</Label>
                <Input
                  type="password"
                  value={modelForm.custom_api_key || ''}
                  placeholder={modelForm.has_custom_api_key ? '已保存，留空则沿用原 API Key' : ''}
                  onChange={(event) => setModelForm({ ...modelForm, custom_api_key: event.target.value })}
                />
              </div>
              <Button className="w-full gap-2" onClick={saveModel} disabled={saving}>
                <Save className="h-4 w-4" /> 保存模型配置
              </Button>

              {models.length > 0 && (
                <div className="space-y-2">
                  <Separator />
                  {models.map((model) => (
                    <div key={model.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{model.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{model.model}</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {model.is_active ? (
                          <Badge>启用中</Badge>
                        ) : (
                          <Button variant="outline" size="sm" className="gap-1" onClick={() => model.id && activateModel(model.id)}>
                            <Power className="h-3.5 w-3.5" /> 启用
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => model.id && deleteModel(model.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="min-w-0 flex-1 space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Prompt 模板</h3>
                <p className="text-xs text-muted-foreground">Skills 以 Prompt 形式存在，编辑会创建新版本，历史版本不会被覆盖。</p>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                选择模板即可编辑 System Prompt 和 User Prompt Template。若数据库里还没有模板，会先显示内置草稿，保存后自动创建正式版本。
              </div>
              <div className="space-y-2">
                {displaySkills.map((skill) => (
                  <div key={skill.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-sm">{skill.name}</span>
                          <Badge variant="outline" className="text-[10px]">v{skill.active_version?.version || '-'}</Badge>
                          {skill.is_builtin_draft && <Badge variant="secondary" className="text-[10px]">内置草稿</Badge>}
                          <Badge variant={skill.is_enabled ? 'default' : 'secondary'} className="text-[10px]">{skill.is_enabled ? '启用' : '停用'}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{skill.description}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          作用模块：{skillModuleLabels[skill.skill_key] || skill.skill_key}
                        </p>
                      </div>
                      <Switch checked={skill.is_enabled} disabled={skill.is_builtin_draft} onCheckedChange={(checked) => toggleSkill(skill, checked)} />
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button variant={editingSkill?.id === skill.id ? 'default' : 'outline'} size="sm" className="gap-1" onClick={() => openPromptEditor(skill)}>
                        <Pencil className="h-3.5 w-3.5" /> 打开录入框
                      </Button>
                    </div>
                  </div>
                ))}
                {skills.length === 0 && (
                  <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span>当前显示的是内置默认模板，可直接打开录入框编辑；保存时会创建正式 Prompt 版本。</span>
                      <Button variant="outline" size="sm" className="gap-2" onClick={initializeSkillTemplates} disabled={initializingSkills || !user?.id}>
                        <RefreshCw className={initializingSkills ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
                        同步模板
                      </Button>
                    </div>
                    {skillsError && <p className="mt-2 text-xs text-destructive">{skillsError}</p>}
                  </div>
                )}
              </div>
              {promptEditor}
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}