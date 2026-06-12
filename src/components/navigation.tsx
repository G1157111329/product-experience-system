'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { BrandLogo } from '@/components/brand-logo';
import { AiAgentSettings } from '@/components/settings/ai-agent-settings';
import { toast } from 'sonner';

interface CategoryWithProducts {
  id: string; name: string; sort_order: number;
  products: Array<{ id: string; name: string; category_id: string; sort_order: number }>;
}

async function readApiJson<T = { code: number; message?: string }>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(response.ok ? '接口未返回数据' : `接口请求失败(${response.status})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(response.ok ? '接口返回格式异常' : `接口请求失败(${response.status})`);
  }
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
          <BrandLogo className="h-9 w-9 shrink-0" />
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
    const data = await readApiJson<{ code: number; data?: CategoryWithProducts[]; message?: string }>(res);
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
      const data = await readApiJson(res);
      if (data.code === 0) { setNewCatName(''); fetchCategories(); toast.success('品类已添加'); }
      else toast.error(data.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '品类添加失败');
    } finally { setAddingCat(false); }
  };

  const handleDeleteCategory = async (catId: string) => {
    setDeletingCatId(null);
    const res = await fetch(`/api/categories?type=category&id=${catId}`, { method: 'DELETE' });
    const data = await readApiJson(res);
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
      const data = await readApiJson(res);
      if (data.code === 0) { setNewProdName(''); fetchCategories(); toast.success('产品已添加'); }
      else toast.error(data.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '产品添加失败');
    } finally { setAddingProd(false); }
  };

  const handleDeleteProduct = async (prodId: string) => {
    setDeletingProdId(null);
    const res = await fetch(`/api/categories?type=product&id=${prodId}`, { method: 'DELETE' });
    const data = await readApiJson(res);
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

  const defaultOptions = useMemo(() => ({
    test_phases: ['开箱', '首次安装', '产品使用', '清洁收纳', '其他'],
    experience_flows: {
      '开箱': ['拿取外包装', '拆开内包装'],
      '首次安装': ['配件梳理', '外观美观', '外观缺陷', '标识文字', '首次安装'],
      '产品使用': ['放置及组装', '操作交互', '产品运行'],
      '清洁收纳': ['冲水', '擦拭', '晾干', '收纳'],
      '其他': ['其他'],
    } as Record<string, string[]>,
    sensory_dimensions: ['视觉', '听觉', '触觉', '嗅觉', '味觉'],
  }), []);

  const normalizeOptions = useCallback((value: unknown): typeof options => {
    const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const testPhases = Array.isArray(row.test_phases)
      ? row.test_phases
      : Array.isArray(row.usage_phases)
        ? row.usage_phases
        : defaultOptions.test_phases;
    const experienceFlows = row.experience_flows && typeof row.experience_flows === 'object' && !Array.isArray(row.experience_flows)
      ? row.experience_flows as Record<string, unknown>
      : defaultOptions.experience_flows;
    const sensoryDimensions = Array.isArray(row.sensory_dimensions)
      ? row.sensory_dimensions
      : defaultOptions.sensory_dimensions;

    return {
      test_phases: testPhases.map(String).filter(Boolean),
      experience_flows: Object.fromEntries(
        Object.entries(experienceFlows).map(([phase, flows]) => [
          phase,
          Array.isArray(flows) ? flows.map(String).filter(Boolean) : [],
        ])
      ),
      sensory_dimensions: sensoryDimensions.map(String).filter(Boolean),
    };
  }, [defaultOptions]);

  const fetchOptions = useCallback(async () => {
    const res = await fetch('/api/settings?key=standard_options');
    const data = await res.json();
    if (data.code === 0 && data.data && Object.keys(data.data).length > 0) {
      setOptions(normalizeOptions(data.data));
    } else {
      // Initialize with defaults
      setOptions(defaultOptions);
    }
  }, [defaultOptions, normalizeOptions]);

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
        body: JSON.stringify({ key: 'standard_options', value: newOptions }),
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

function PlatformSettingsDialog({
  open,
  onOpenChange,
  onOpenCategory,
  onOpenStandardOptions,
  onOpenAiAgent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenCategory: () => void;
  onOpenStandardOptions: () => void;
  onOpenAiAgent: () => void;
}) {
  const openSetting = (handler: () => void) => {
    onOpenChange(false);
    setTimeout(handler, 120);
  };

  const settingItems = [
    {
      title: '品类与产品',
      description: '维护体验计划和标准引用使用的品类、产品型号基础数据。',
      icon: Settings,
      action: onOpenCategory,
    },
    {
      title: '通用标准选项',
      description: '管理产品使用阶段、体验流程、感官维度等通用标准字段。',
      icon: BookOpen,
      action: onOpenStandardOptions,
    },
    {
      title: 'AI Agent / Prompt 模板',
      description: '配置 AI 模型、API 信息，以及各模块使用的 Prompt 模板。',
      icon: Sparkles,
      action: onOpenAiAgent,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" /> 平台设置
          </DialogTitle>
          <DialogDescription>
            统一管理基础资料、标准字段和 AI Prompt 配置。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2 sm:grid-cols-3">
          {settingItems.map((item) => (
            <button
              key={item.title}
              type="button"
              onClick={() => openSetting(item.action)}
              className="group flex min-h-36 flex-col rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <item.icon className="h-4 w-4" />
              </span>
              <span className="text-sm font-medium text-foreground">{item.title}</span>
              <span className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.description}</span>
              <span className="mt-auto pt-4 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                打开设置
              </span>
            </button>
          ))}
        </div>
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
  const [platformSettingsOpen, setPlatformSettingsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // ── Standard options settings (admin-only global, stored in DB) ──
  const [standardOptionsOpen, setStandardOptionsOpen] = useState(false);
  // ── AI Agent settings (admin-only global, stored in DB) ──
  const [aiConfigOpen, setAiConfigOpen] = useState(false);

  useEffect(() => {
    if (profileOpen && isAdmin && user?.id) {
      fetch('/api/auth/users')
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
        body: JSON.stringify({ field: editField, value: editValue }),
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
        body: JSON.stringify({ target_user_id: targetUserId, action }),
      });
      const data = await res.json();
      if (data.code === 0) {
        toast.success(data.message);
        const usersRes = await fetch('/api/auth/users');
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
        body: JSON.stringify({ target_user_id: targetUserId, action: 'delete' }),
      });
      const data = await res.json();
      if (data.code === 0) {
        toast.success('账号已删除');
        const usersRes = await fetch('/api/auth/users');
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
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setPlatformSettingsOpen(true)} title="平台设置" aria-label="平台设置">
            <Settings className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={logout} aria-label="退出登录">
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
                <Label className="text-xs text-muted-foreground">平台设置</Label>
                {isAdmin && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => { setProfileOpen(false); setTimeout(() => setPlatformSettingsOpen(true), 100); }}>
                    <Settings className="h-3 w-3" /> 打开
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">集中管理品类产品、通用标准选项、AI Agent 与 Prompt 模板</p>
            </div>

            {/* Admin: Settings button in profile dialog */}
            {isAdmin && (
              <Button variant="outline" className="w-full gap-2" onClick={() => { setProfileOpen(false); setTimeout(() => setPlatformSettingsOpen(true), 100); }}>
                <Settings className="h-4 w-4" /> 平台设置
              </Button>
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
      <PlatformSettingsDialog
        open={platformSettingsOpen}
        onOpenChange={setPlatformSettingsOpen}
        onOpenCategory={() => setSettingsOpen(true)}
        onOpenStandardOptions={() => setStandardOptionsOpen(true)}
        onOpenAiAgent={() => setAiConfigOpen(true)}
      />
      <CategoryProductSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
      <StandardOptionsSettings open={standardOptionsOpen} onOpenChange={setStandardOptionsOpen} />
      <AiAgentSettings open={aiConfigOpen} onOpenChange={setAiConfigOpen} />
    </>
  );
}

export function AppSidebar() {
  return (
    <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:border-r border-border bg-card/95 backdrop-blur h-full shrink-0">
      <NavContent />
    </aside>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-b border-border/80 h-14 flex items-center px-3 shadow-sm">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label="打开导航菜单"><Menu className="h-5 w-5" /></Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[82vw] max-w-72 p-0">
          <SheetTitle className="sr-only">导航菜单</SheetTitle>
          <NavContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <Link href="/dashboard" className="flex items-center gap-2 ml-1 min-w-0">
        <BrandLogo className="h-8 w-8 shrink-0" />
        <span className="font-semibold text-sm truncate">产品体验</span>
      </Link>
      <div className="ml-auto"><MobileUserIcon /></div>
    </div>
  );
}

function MobileUserIcon() {
  const { user, isAdmin, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [platformSettingsOpen, setPlatformSettingsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [standardOptionsOpen, setStandardOptionsOpen] = useState(false);
  const [aiConfigOpen, setAiConfigOpen] = useState(false);

  if (!user) return null;
  return (
    <>
      <button onClick={() => setProfileOpen(true)} className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center ring-1 ring-primary/10" aria-label="打开个人信息">
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
              <span className="text-xs text-muted-foreground">平台设置</span>
              {isAdmin && (
                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => { setProfileOpen(false); setTimeout(() => setPlatformSettingsOpen(true), 100); }}>
                  <Settings className="h-3 w-3" /> 打开
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">集中管理品类产品、通用标准选项、AI Agent 与 Prompt 模板</p>
            {isAdmin && (
              <Button variant="outline" className="w-full gap-2" onClick={() => { setProfileOpen(false); setTimeout(() => setPlatformSettingsOpen(true), 100); }}>
                <Settings className="h-4 w-4" /> 平台设置
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setProfileOpen(false)}>关闭</Button>
              <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={logout}><LogOut className="h-3 w-3" /> 退出</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <PlatformSettingsDialog
        open={platformSettingsOpen}
        onOpenChange={setPlatformSettingsOpen}
        onOpenCategory={() => setSettingsOpen(true)}
        onOpenStandardOptions={() => setStandardOptionsOpen(true)}
        onOpenAiAgent={() => setAiConfigOpen(true)}
      />
      <CategoryProductSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
      <StandardOptionsSettings open={standardOptionsOpen} onOpenChange={setStandardOptionsOpen} />
      <AiAgentSettings open={aiConfigOpen} onOpenChange={setAiConfigOpen} />
    </>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md border-t border-border/80 safe-bottom shadow-[0_-8px_24px_hsl(0_0%_0%/0.06)]">
      <nav className="grid grid-cols-5 h-16 px-1.5">
        {navItems.slice(0, 5).map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link key={item.href} href={item.href}
              className={cn('flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 transition-colors', isActive ? 'text-primary' : 'text-muted-foreground')}>
              <span className={cn('flex h-7 w-10 items-center justify-center rounded-full transition-colors', isActive && 'bg-primary/10')}>
                <item.icon className="h-[18px] w-[18px]" />
              </span>
              <span className="max-w-full truncate text-[10px] leading-tight">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
