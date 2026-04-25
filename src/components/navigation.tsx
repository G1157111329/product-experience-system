'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, BookOpen, ClipboardList, AlertTriangle, FileText,
  BarChart3, Menu, ChevronRight, User, LogOut, Key, Pencil,
  Settings, Plus, Minus, Trash2, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';

interface CategoryWithProducts {
  id: string; name: string; sort_order: number;
  products: Array<{ id: string; name: string; category_id: string; sort_order: number }>;
}

const navItems = [
  { href: '/dashboard', label: '工作台', icon: LayoutDashboard },
  { href: '/standards', label: '标准管理', icon: BookOpen },
  { href: '/tasks', label: '体验计划', icon: ClipboardList },
  { href: '/issues', label: '问题管理', icon: AlertTriangle },
  { href: '/reports', label: '报告中心', icon: FileText },
  { href: '/analysis', label: '数据分析', icon: BarChart3 },
];

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onNavigate}>
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">EX</span>
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm leading-tight">产品体验</span>
            <span className="text-xs text-muted-foreground leading-tight">管理平台</span>
          </div>
        </Link>
      </div>
      <ScrollArea className="flex-1 py-3">
        <nav className="px-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link key={item.href} href={item.href} onClick={onNavigate}
                className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                  isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
                {isActive && <ChevronRight className="h-3 w-3 ml-auto opacity-50" />}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
      <div className="px-4 py-3 border-t border-border">
        <UserSection />
      </div>
    </div>
  );
}

/* ── Shared Settings Dialog (used by both desktop & mobile) ── */
function CategoryProductSettings({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [categories, setCategories] = useState<CategoryWithProducts[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string>('');
  const [newCatName, setNewCatName] = useState('');
  const [newProdName, setNewProdName] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [addingProd, setAddingProd] = useState(false);
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);
  const [deletingProdId, setDeletingProdId] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    const res = await fetch('/api/categories');
    const data = await res.json();
    if (data.code === 0) setCategories(data.data || []);
  }, []);

  useEffect(() => {
    if (open) fetchCategories();
  }, [open, fetchCategories]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setDeletingCatId(null);
      setDeletingProdId(null);
      setNewCatName('');
      setNewProdName('');
      setSelectedCatId('');
    }
  }, [open]);

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    setAddingCat(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'category', name: newCatName.trim() }),
      });
      const data = await res.json();
      if (data.code === 0) { setNewCatName(''); fetchCategories(); toast.success('品类已添加'); }
      else toast.error(data.message);
    } finally { setAddingCat(false); }
  };

  const handleDeleteCategory = async (catId: string) => {
    setDeletingCatId(null);
    const res = await fetch(`/api/categories?type=category&id=${catId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.code === 0) { fetchCategories(); toast.success('品类已删除'); }
    else toast.error(data.message);
  };

  const handleAddProduct = async () => {
    if (!newProdName.trim() || !selectedCatId) return;
    setAddingProd(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'product', name: newProdName.trim(), category_id: selectedCatId }),
      });
      const data = await res.json();
      if (data.code === 0) { setNewProdName(''); fetchCategories(); toast.success('产品已添加'); }
      else toast.error(data.message);
    } finally { setAddingProd(false); }
  };

  const handleDeleteProduct = async (prodId: string) => {
    setDeletingProdId(null);
    const res = await fetch(`/api/categories?type=product&id=${prodId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.code === 0) { fetchCategories(); toast.success('产品已删除'); }
    else toast.error(data.message);
  };

  const selectedCat = categories.find(c => c.id === selectedCatId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" /> 品类与产品设置
          </DialogTitle>
          <DialogDescription>管理品类和产品选项，修改后全局生效</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh]">
          <div className="space-y-6 pr-3">
            {/* Category Management */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">品类</Badge> 品类管理
              </h3>
              <div className="space-y-1.5">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center gap-2 p-2 rounded-lg border">
                    <span className="text-sm flex-1">{cat.name}</span>
                    <Badge variant="outline" className="text-[10px]">{cat.products.length}个产品</Badge>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeletingCatId(cat.id)}>
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {categories.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">暂无品类</p>}
              </div>
              <div className="flex gap-2">
                <Input placeholder="输入品类名称" value={newCatName} onChange={e => setNewCatName(e.target.value)}
                  className="h-8 text-sm" onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); }} />
                <Button size="sm" className="h-8 gap-1" onClick={handleAddCategory} disabled={addingCat || !newCatName.trim()}>
                  <Plus className="h-3.5 w-3.5" /> 新增
                </Button>
              </div>
              {deletingCatId && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/20">
                  <span className="text-xs text-destructive flex-1">确认删除「{categories.find(c => c.id === deletingCatId)?.name}」及其所有产品？</span>
                  <Button size="sm" variant="destructive" className="h-6 text-xs" onClick={() => handleDeleteCategory(deletingCatId)}>确认</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setDeletingCatId(null)}>取消</Button>
                </div>
              )}
            </div>

            <Separator />

            {/* Product Management */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">产品</Badge> 产品管理
              </h3>
              <div className="space-y-1.5">
                <Label className="text-xs">选择品类</Label>
                <Select value={selectedCatId} onValueChange={setSelectedCatId}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="选择品类查看产品" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {selectedCat && (
                <>
                  <div className="space-y-1.5">
                    {selectedCat.products.map(prod => (
                      <div key={prod.id} className="flex items-center gap-2 p-2 rounded-lg border">
                        <span className="text-sm flex-1">{prod.name}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDeletingProdId(prod.id)}>
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    {selectedCat.products.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">该品类暂无产品</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input placeholder="输入产品名称" value={newProdName} onChange={e => setNewProdName(e.target.value)}
                      className="h-8 text-sm" onKeyDown={e => { if (e.key === 'Enter') handleAddProduct(); }} />
                    <Button size="sm" className="h-8 gap-1" onClick={handleAddProduct} disabled={addingProd || !newProdName.trim()}>
                      <Plus className="h-3.5 w-3.5" /> 新增
                    </Button>
                  </div>
                  {deletingProdId && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/20">
                      <span className="text-xs text-destructive flex-1">确认删除产品「{selectedCat.products.find(p => p.id === deletingProdId)?.name}」？</span>
                      <Button size="sm" variant="destructive" className="h-6 text-xs" onClick={() => handleDeleteProduct(deletingProdId)}>确认</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setDeletingProdId(null)}>取消</Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function AiConfigSettings({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [config, setConfig] = useState<{
    provider: string; model: string; temperature: number;
    custom_api_url: string; custom_api_key: string;
  }>({
    provider: 'builtin', model: 'doubao-seed-1-6-vision-250815', temperature: 0.7,
    custom_api_url: '', custom_api_key: '',
  });
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  const builtinModels = [
    { id: 'doubao-seed-2-0-pro-260215', name: 'Doubao Seed 2.0 Pro（旗舰推理）' },
    { id: 'doubao-seed-2-0-lite-260215', name: 'Doubao Seed 2.0 Lite（均衡型）' },
    { id: 'doubao-seed-1-8-251228', name: 'Doubao Seed 1.8（Agent优化）' },
    { id: 'doubao-seed-1-6-vision-250815', name: 'Doubao Seed 1.6 Vision（视觉理解）' },
    { id: 'deepseek-v3-2-251201', name: 'DeepSeek V3.2' },
    { id: 'kimi-k2-5-260127', name: 'Kimi K2.5（多模态）' },
  ];

  const fetchConfig = useCallback(async () => {
    const res = await fetch('/api/settings?key=ai_config');
    const data = await res.json();
    if (data.code === 0 && data.data && Object.keys(data.data).length > 0) {
      setConfig(prev => ({ ...prev, ...data.data }));
    }
  }, []);

  useEffect(() => {
    if (open) fetchConfig();
  }, [open, fetchConfig]);

  useEffect(() => {
    if (!open) {
      // Reset on close
    }
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'ai_config', value: config, admin_user_id: user?.id }),
      });
      const data = await res.json();
      if (data.code === 0) toast.success('AI配置已保存');
      else toast.error(data.message);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" /> AI模型配置
          </DialogTitle>
          <DialogDescription>配置食谱/功能效果评价使用的AI模型和参数，仅管理员可设置</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh]">
          <div className="space-y-5 pr-3">
            {/* Provider Selection */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">接入</Badge> AI服务
              </h3>
              <Select value={config.provider} onValueChange={(v) => setConfig({ ...config, provider: v })}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="builtin">内置模型（推荐）</SelectItem>
                  <SelectItem value="custom">自定义API</SelectItem>
                </SelectContent>
              </Select>
              {config.provider === 'builtin' && (
                <p className="text-[11px] text-muted-foreground">使用平台内置AI模型，无需额外配置API密钥</p>
              )}
              {config.provider === 'custom' && (
                <p className="text-[11px] text-muted-foreground">接入自定义AI服务（需兼容OpenAI Chat Completions API格式）</p>
              )}
            </div>

            <Separator />

            {/* Model Selection (builtin) */}
            {config.provider === 'builtin' && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">模型</Badge> 选择模型
                </h3>
                <Select value={config.model} onValueChange={(v) => setConfig({ ...config, model: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {builtinModels.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">视觉理解模型（Vision）可分析图片，推荐用于效果评价</p>
              </div>
            )}

            {/* Custom API Configuration */}
            {config.provider === 'custom' && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">API</Badge> API配置
                </h3>
                <div className="space-y-1.5">
                  <Label className="text-xs">模型名称</Label>
                  <Input placeholder="如：gpt-4o, claude-3-5-sonnet" value={config.model}
                    onChange={(e) => setConfig({ ...config, model: e.target.value })} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">API地址</Label>
                  <Input placeholder="如：https://api.openai.com/v1/chat/completions"
                    value={config.custom_api_url}
                    onChange={(e) => setConfig({ ...config, custom_api_url: e.target.value })} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">API密钥</Label>
                  <Input type="password" placeholder="输入API Key"
                    value={config.custom_api_key}
                    onChange={(e) => setConfig({ ...config, custom_api_key: e.target.value })} className="h-8 text-sm" />
                  <p className="text-[10px] text-muted-foreground">密钥将加密存储于平台设置中</p>
                </div>
              </div>
            )}

            <Separator />

            {/* Temperature */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">参数</Badge> 温度参数
              </h3>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Temperature: {config.temperature.toFixed(1)}</Label>
                </div>
                <input type="range" min="0" max="2" step="0.1" value={config.temperature}
                  onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer" />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>精确(0)</span>
                  <span>平衡(1.0)</span>
                  <span>创意(2.0)</span>
                </div>
              </div>
            </div>

            <Button onClick={handleSave} className="w-full" disabled={saving}>
              {saving ? '保存中...' : '保存配置'}
            </Button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function StandardOptionsSettings({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [options, setOptions] = useState<{
    test_phases: string[];
    experience_flows: Record<string, string[]>;
    sensory_dimensions: string[];
  }>({ test_phases: [], experience_flows: {}, sensory_dimensions: [] });
  const [selectedPhase, setSelectedPhase] = useState<string>('');
  const [newPhaseName, setNewPhaseName] = useState('');
  const [newFlowName, setNewFlowName] = useState('');
  const [newDimName, setNewDimName] = useState('');
  const [addingPhase, setAddingPhase] = useState(false);
  const [addingFlow, setAddingFlow] = useState(false);
  const [addingDim, setAddingDim] = useState(false);
  const [deletingPhaseIdx, setDeletingPhaseIdx] = useState<number | null>(null);
  const [deletingFlowIdx, setDeletingFlowIdx] = useState<number | null>(null);
  const [deletingDimIdx, setDeletingDimIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  const defaultOptions = {
    test_phases: ['开箱', '首次安装', '产品使用', '清洁收纳', '其他'],
    experience_flows: {
      '开箱': ['拿取外包装', '拆开内包装'],
      '首次安装': ['配件梳理', '外观美观', '外观缺陷', '标识文字', '首次安装'],
      '产品使用': ['放置及组装', '操作交互', '产品运行'],
      '清洁收纳': ['冲水', '擦拭', '晾干', '收纳'],
      '其他': ['其他'],
    } as Record<string, string[]>,
    sensory_dimensions: ['视觉', '听觉', '触觉', '嗅觉', '味觉'],
  };

  const fetchOptions = useCallback(async () => {
    const res = await fetch('/api/settings?key=standard_options');
    const data = await res.json();
    if (data.code === 0 && data.data && Object.keys(data.data).length > 0) {
      setOptions(data.data);
    } else {
      // Initialize with defaults
      setOptions(defaultOptions);
    }
  }, []);

  useEffect(() => {
    if (open) fetchOptions();
  }, [open, fetchOptions]);

  useEffect(() => {
    if (!open) {
      setDeletingPhaseIdx(null);
      setDeletingFlowIdx(null);
      setDeletingDimIdx(null);
      setNewPhaseName('');
      setNewFlowName('');
      setNewDimName('');
      setSelectedPhase('');
    }
  }, [open]);

  const saveOptions = async (newOptions: typeof options) => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'standard_options', value: newOptions, admin_user_id: user?.id }),
      });
      const data = await res.json();
      if (data.code === 0) {
        setOptions(newOptions);
        toast.success('选项已保存');
      } else toast.error(data.message);
    } finally { setSaving(false); }
  };

  const handleAddPhase = async () => {
    if (!newPhaseName.trim()) return;
    setAddingPhase(true);
    try {
      const newPhases = [...options.test_phases, newPhaseName.trim()];
      const newFlows = { ...options.experience_flows, [newPhaseName.trim()]: [] };
      await saveOptions({ ...options, test_phases: newPhases, experience_flows: newFlows });
      setNewPhaseName('');
    } finally { setAddingPhase(false); }
  };

  const handleDeletePhase = async (idx: number) => {
    const phaseName = options.test_phases[idx];
    const newPhases = options.test_phases.filter((_, i) => i !== idx);
    const newFlows = { ...options.experience_flows };
    delete newFlows[phaseName];
    await saveOptions({ ...options, test_phases: newPhases, experience_flows: newFlows });
    setDeletingPhaseIdx(null);
    if (selectedPhase === phaseName) setSelectedPhase('');
  };

  const handleAddFlow = async () => {
    if (!newFlowName.trim() || !selectedPhase) return;
    setAddingFlow(true);
    try {
      const currentFlows = options.experience_flows[selectedPhase] || [];
      const newFlows = { ...options.experience_flows, [selectedPhase]: [...currentFlows, newFlowName.trim()] };
      await saveOptions({ ...options, experience_flows: newFlows });
      setNewFlowName('');
    } finally { setAddingFlow(false); }
  };

  const handleDeleteFlow = async (idx: number) => {
    const currentFlows = options.experience_flows[selectedPhase] || [];
    const newFlows = { ...options.experience_flows, [selectedPhase]: currentFlows.filter((_, i) => i !== idx) };
    await saveOptions({ ...options, experience_flows: newFlows });
    setDeletingFlowIdx(null);
  };

  const handleAddDim = async () => {
    if (!newDimName.trim()) return;
    setAddingDim(true);
    try {
      const newDims = [...options.sensory_dimensions, newDimName.trim()];
      await saveOptions({ ...options, sensory_dimensions: newDims });
      setNewDimName('');
    } finally { setAddingDim(false); }
  };

  const handleDeleteDim = async (idx: number) => {
    const newDims = options.sensory_dimensions.filter((_, i) => i !== idx);
    await saveOptions({ ...options, sensory_dimensions: newDims });
    setDeletingDimIdx(null);
  };

  const handleReset = async () => {
    await saveOptions(defaultOptions);
    toast.success('已恢复默认选项');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" /> 通用标准选项设置
          </DialogTitle>
          <DialogDescription>管理通用标准检查项的产品使用阶段、体验流程、感官维度选项，修改后全局生效</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh]">
          <div className="space-y-6 pr-3">
            {/* 产品使用阶段管理 */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">阶段</Badge> 产品使用阶段
              </h3>
              <div className="space-y-1.5">
                {options.test_phases.map((phase, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-lg border">
                    <span className="text-sm flex-1">{phase}</span>
                    <Badge variant="outline" className="text-[10px]">{(options.experience_flows[phase] || []).length}个流程</Badge>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeletingPhaseIdx(idx)}>
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {options.test_phases.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">暂无阶段</p>}
              </div>
              <div className="flex gap-2">
                <Input placeholder="输入阶段名称" value={newPhaseName} onChange={e => setNewPhaseName(e.target.value)}
                  className="h-8 text-sm" onKeyDown={e => { if (e.key === 'Enter') handleAddPhase(); }} />
                <Button size="sm" className="h-8 gap-1" onClick={handleAddPhase} disabled={addingPhase || !newPhaseName.trim()}>
                  <Plus className="h-3.5 w-3.5" /> 新增
                </Button>
              </div>
              {deletingPhaseIdx !== null && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/20">
                  <span className="text-xs text-destructive flex-1">确认删除「{options.test_phases[deletingPhaseIdx]}」及其所有体验流程？</span>
                  <Button size="sm" variant="destructive" className="h-6 text-xs" onClick={() => handleDeletePhase(deletingPhaseIdx)}>确认</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setDeletingPhaseIdx(null)}>取消</Button>
                </div>
              )}
            </div>

            <Separator />

            {/* 体验流程管理 */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">流程</Badge> 体验流程
              </h3>
              <div className="space-y-1.5">
                <Label className="text-xs">选择产品使用阶段</Label>
                <Select value={selectedPhase} onValueChange={setSelectedPhase}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="选择阶段查看流程" /></SelectTrigger>
                  <SelectContent>
                    {options.test_phases.map((phase, idx) => <SelectItem key={idx} value={phase}>{phase}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {selectedPhase && (
                <>
                  <div className="space-y-1.5">
                    {(options.experience_flows[selectedPhase] || []).map((flow, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 rounded-lg border">
                        <span className="text-sm flex-1">{flow}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDeletingFlowIdx(idx)}>
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    {(options.experience_flows[selectedPhase] || []).length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">该阶段暂无体验流程</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input placeholder="输入流程名称" value={newFlowName} onChange={e => setNewFlowName(e.target.value)}
                      className="h-8 text-sm" onKeyDown={e => { if (e.key === 'Enter') handleAddFlow(); }} />
                    <Button size="sm" className="h-8 gap-1" onClick={handleAddFlow} disabled={addingFlow || !newFlowName.trim()}>
                      <Plus className="h-3.5 w-3.5" /> 新增
                    </Button>
                  </div>
                  {deletingFlowIdx !== null && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/20">
                      <span className="text-xs text-destructive flex-1">确认删除流程「{(options.experience_flows[selectedPhase] || [])[deletingFlowIdx]}」？</span>
                      <Button size="sm" variant="destructive" className="h-6 text-xs" onClick={() => handleDeleteFlow(deletingFlowIdx)}>确认</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setDeletingFlowIdx(null)}>取消</Button>
                    </div>
                  )}
                </>
              )}
            </div>

            <Separator />

            {/* 感官维度管理 */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">维度</Badge> 感官维度
              </h3>
              <div className="space-y-1.5">
                {options.sensory_dimensions.map((dim, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-lg border">
                    <span className="text-sm flex-1">{dim}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeletingDimIdx(idx)}>
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {options.sensory_dimensions.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">暂无维度</p>}
              </div>
              <div className="flex gap-2">
                <Input placeholder="输入维度名称" value={newDimName} onChange={e => setNewDimName(e.target.value)}
                  className="h-8 text-sm" onKeyDown={e => { if (e.key === 'Enter') handleAddDim(); }} />
                <Button size="sm" className="h-8 gap-1" onClick={handleAddDim} disabled={addingDim || !newDimName.trim()}>
                  <Plus className="h-3.5 w-3.5" /> 新增
                </Button>
              </div>
              {deletingDimIdx !== null && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/20">
                  <span className="text-xs text-destructive flex-1">确认删除维度「{options.sensory_dimensions[deletingDimIdx]}」？</span>
                  <Button size="sm" variant="destructive" className="h-6 text-xs" onClick={() => handleDeleteDim(deletingDimIdx)}>确认</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setDeletingDimIdx(null)}>取消</Button>
                </div>
              )}
            </div>

            <Separator />

            <Button variant="outline" className="w-full" onClick={handleReset} disabled={saving}>
              恢复默认选项
            </Button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function UserSection() {
  const { user, isAdmin, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [editField, setEditField] = useState<'name' | 'password' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [allUsers, setAllUsers] = useState<Array<{ id: string; account: string; name: string; role: string }>>([]);
  const [roleLoading, setRoleLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // ── Standard options settings (admin-only global, stored in DB) ──
  const [standardOptionsOpen, setStandardOptionsOpen] = useState(false);
  // ── AI config settings (admin-only global, stored in DB) ──
  const [aiConfigOpen, setAiConfigOpen] = useState(false);

  useEffect(() => {
    if (profileOpen && isAdmin && user?.id) {
      fetch(`/api/auth/users?admin_user_id=${user.id}`)
        .then(res => res.json())
        .then(data => { if (data.code === 0) setAllUsers(data.data || []); })
        .catch(() => {});
    }
  }, [profileOpen, isAdmin, user?.id]);

  const handleProfileEdit = async () => {
    if (!user?.id || !editField || !editValue) return;
    setEditLoading(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, field: editField, value: editValue }),
      });
      const data = await res.json();
      if (data.code === 0) { toast.success(data.message); setEditField(null); setEditValue(''); }
      else toast.error(data.message);
    } finally { setEditLoading(false); }
  };

  const handleRoleChange = async (targetUserId: string, action: 'upgrade' | 'downgrade') => {
    if (!user?.id) return;
    setRoleLoading(true);
    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_user_id: user.id, target_user_id: targetUserId, action }),
      });
      const data = await res.json();
      if (data.code === 0) {
        toast.success(data.message);
        const usersRes = await fetch(`/api/auth/users?admin_user_id=${user.id}`);
        const usersData = await usersRes.json();
        if (usersData.code === 0) setAllUsers(usersData.data || []);
      } else toast.error(data.message);
    } finally { setRoleLoading(false); }
  };

  const handleDeleteUser = async (targetUserId: string, targetName: string) => {
    if (!confirm(`确定删除账号「${targetName}」吗？删除后该账号将无法登录，但其创建的报告和组织者信息会保留。`)) return;
    setRoleLoading(true);
    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_user_id: user?.id, target_user_id: targetUserId, action: 'delete' }),
      });
      const data = await res.json();
      if (data.code === 0) {
        toast.success('账号已删除');
        const usersRes = await fetch(`/api/auth/users?admin_user_id=${user?.id}`);
        const usersData = await usersRes.json();
        if (usersData.code === 0) setAllUsers(usersData.data || []);
      } else toast.error(data.message);
    } finally { setRoleLoading(false); }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button onClick={() => setProfileOpen(true)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-muted rounded-lg px-2 py-1.5 transition-colors">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium truncate">{user?.name || user?.account || '未登录'}</div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              <span className="truncate">{user?.account}</span>
              {isAdmin && <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5">管理</Badge>}
            </div>
          </div>
        </button>
        {/* Admin: Settings icon directly in sidebar footer */}
        {isAdmin && (
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setSettingsOpen(true)} title="品类与产品设置">
            <Settings className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={logout}>
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Profile Dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>个人信息</DialogTitle>
            <DialogDescription>查看和管理您的账号信息</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">账号</Label>
              <div className="text-sm font-medium">{user?.account}</div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">名称</Label>
                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => { setEditField('name'); setEditValue(user?.name || ''); }}>
                  <Pencil className="h-3 w-3" /> 修改
                </Button>
              </div>
              {editField === 'name' ? (
                <div className="flex gap-2">
                  <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder="输入新名称" className="h-8 text-sm" />
                  <Button size="sm" className="h-8" onClick={handleProfileEdit} disabled={editLoading}>{editLoading ? '...' : '提交'}</Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => { setEditField(null); setEditValue(''); }}>取消</Button>
                </div>
              ) : (<div className="text-sm font-medium">{user?.name || '-'}</div>)}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">密码</Label>
                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => { setEditField('password'); setEditValue(''); }}>
                  <Key className="h-3 w-3" /> 修改
                </Button>
              </div>
              {editField === 'password' ? (
                <div className="flex gap-2">
                  <Input type="password" value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder="输入新密码" className="h-8 text-sm" />
                  <Button size="sm" className="h-8" onClick={handleProfileEdit} disabled={editLoading}>{editLoading ? '...' : '提交'}</Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => { setEditField(null); setEditValue(''); }}>取消</Button>
                </div>
              ) : (<div className="text-sm font-medium">••••••••</div>)}
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">角色</Label>
              <Badge variant={isAdmin ? 'default' : 'secondary'} className="text-xs">{isAdmin ? '管理账号' : '使用账号'}</Badge>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">通用标准选项</Label>
                {isAdmin && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => setStandardOptionsOpen(true)}>
                    <Settings className="h-3 w-3" /> 设置
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">管理产品使用阶段、体验流程、感官维度选项</p>
            </div>

            {/* Admin: Settings button in profile dialog */}
            {isAdmin && (
              <>
                <Button variant="outline" className="w-full gap-2" onClick={() => { setProfileOpen(false); setTimeout(() => setSettingsOpen(true), 100); }}>
                  <Settings className="h-4 w-4" /> 品类与产品设置
                </Button>
                <Button variant="outline" className="w-full gap-2" onClick={() => { setProfileOpen(false); setTimeout(() => setStandardOptionsOpen(true), 100); }}>
                  <Settings className="h-4 w-4" /> 通用标准选项设置
                </Button>
                <Button variant="outline" className="w-full gap-2" onClick={() => { setProfileOpen(false); setTimeout(() => setAiConfigOpen(true), 100); }}>
                  <Sparkles className="h-4 w-4" /> AI模型配置
                </Button>
                <Button variant="outline" className="w-full gap-2" onClick={() => { setProfileOpen(false); setTimeout(() => setAiConfigOpen(true), 100); }}>
                  <Sparkles className="h-4 w-4" /> AI模型配置
                </Button>
              </>
            )}

            {isAdmin && allUsers.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">账号权限管理</Label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {allUsers.map((u) => (
                      <div key={u.id} className="flex items-center justify-between text-sm py-1">
                        <div className="min-w-0 flex-1">
                          <span className="font-medium">{u.name || u.account}</span>
                          <span className="text-xs text-muted-foreground ml-1">({u.account})</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="text-[10px] px-1.5">{u.role === 'admin' ? '管理' : '普通'}</Badge>
                          {u.id !== user?.id && (
                            <>
                              {u.role === 'user' ? (
                                <Button size="sm" variant="outline" className="h-5 text-[10px] px-1.5" onClick={() => handleRoleChange(u.id, 'upgrade')} disabled={roleLoading}>升级</Button>
                              ) : (
                                <Button size="sm" variant="outline" className="h-5 text-[10px] px-1.5" onClick={() => handleRoleChange(u.id, 'downgrade')} disabled={roleLoading}>降级</Button>
                              )}
                              <Button size="sm" variant="outline" className="h-5 text-[10px] px-1.5 text-destructive hover:text-destructive" onClick={() => handleDeleteUser(u.id, u.name || u.account)} disabled={roleLoading}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog (Admin only) */}
      <CategoryProductSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
      <StandardOptionsSettings open={standardOptionsOpen} onOpenChange={setStandardOptionsOpen} />
      <AiConfigSettings open={aiConfigOpen} onOpenChange={setAiConfigOpen} />
    </>
  );
}

export function AppSidebar() {
  return (
    <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:border-r border-border bg-card h-screen sticky top-0">
      <NavContent />
    </aside>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border h-14 flex items-center px-4">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9"><Menu className="h-5 w-5" /></Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-60 p-0">
          <SheetTitle className="sr-only">导航菜单</SheetTitle>
          <NavContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <Link href="/dashboard" className="flex items-center gap-2 ml-2">
        <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-[10px]">EX</span>
        </div>
        <span className="font-semibold text-sm">产品体验</span>
      </Link>
      <div className="ml-auto"><MobileUserIcon /></div>
    </div>
  );
}

function MobileUserIcon() {
  const { user, isAdmin, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [standardOptionsOpen, setStandardOptionsOpen] = useState(false);
  const [aiConfigOpen, setAiConfigOpen] = useState(false);

  if (!user) return null;
  return (
    <>
      <button onClick={() => setProfileOpen(true)} className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
        <User className="h-4 w-4 text-primary" />
      </button>
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>个人信息</DialogTitle>
            <DialogDescription>查看和管理您的账号信息</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div><span className="text-xs text-muted-foreground">账号：</span><span className="text-sm">{user.account}</span></div>
            <div><span className="text-xs text-muted-foreground">名称：</span><span className="text-sm">{user.name}</span></div>
            <div><span className="text-xs text-muted-foreground">角色：</span><Badge variant={isAdmin ? 'default' : 'secondary'} className="text-xs">{isAdmin ? '管理账号' : '使用账号'}</Badge></div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">通用标准选项</span>
              {isAdmin && (
                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => setStandardOptionsOpen(true)}>
                  <Settings className="h-3 w-3" /> 设置
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">管理产品使用阶段、体验流程、感官维度选项</p>
            {isAdmin && (
              <>
                <Button variant="outline" className="w-full gap-2" onClick={() => { setProfileOpen(false); setTimeout(() => setSettingsOpen(true), 100); }}>
                  <Settings className="h-4 w-4" /> 品类与产品设置
                </Button>
                <Button variant="outline" className="w-full gap-2" onClick={() => { setProfileOpen(false); setTimeout(() => setStandardOptionsOpen(true), 100); }}>
                  <Settings className="h-4 w-4" /> 通用标准选项设置
                </Button>
              </>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setProfileOpen(false)}>关闭</Button>
              <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={logout}><LogOut className="h-3 w-3" /> 退出</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <CategoryProductSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
      <StandardOptionsSettings open={standardOptionsOpen} onOpenChange={setStandardOptionsOpen} />
      <AiConfigSettings open={aiConfigOpen} onOpenChange={setAiConfigOpen} />
    </>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-t border-border safe-bottom">
      <nav className="flex items-center justify-around h-14">
        {navItems.slice(0, 5).map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link key={item.href} href={item.href}
              className={cn('flex flex-col items-center justify-center gap-0.5 px-2 py-1 min-w-0 flex-1', isActive ? 'text-primary' : 'text-muted-foreground')}>
              <item.icon className="h-4.5 w-4.5" />
              <span className="text-[10px] leading-tight truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
