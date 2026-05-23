'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, ChevronRight, ClipboardList, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  EmptyState,
  EntityListItem,
  FilterBar,
  PageHeader,
  PageShell,
  SearchField,
  SkeletonList,
  StatusBadge,
} from '@/components/app';

interface CategoryWithProducts {
  id: string;
  name: string;
  sort_order: number;
  products: Array<{ id: string; name: string; category_id: string; sort_order: number }>;
}

interface Task {
  id: string;
  task_name: string;
  product_category: string;
  product: string | null;
  product_model: string;
  project_type: string | null;
  project_phase: string | null;
  test_date: string | null;
  organizer: string | null;
  status: string;
  created_at: string;
}

const PROJECT_TYPES = ['ODM/OEM', '竞品研究', '自研', '前期研究', '改型/降本/优化', '海外产品'];
const SELF_DEVELOPMENT_TYPES = ['自研', '改型/降本/优化'];
const STATUS_TABS = ['all', '待执行', '进行中', '已完成'];

const emptyForm = {
  task_name: '',
  product_category: '',
  product: '',
  product_model: '',
  project_type: '',
  project_phase: '',
  test_date: '',
  organizer: '',
  target_user: '',
  test_purpose: '',
  test_method: '',
};

export default function TasksPage() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [transferTask, setTransferTask] = useState<Task | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferUsers, setTransferUsers] = useState<Array<{ id: string; name: string; account: string }>>([]);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [categories, setCategories] = useState<CategoryWithProducts[]>([]);
  const [form, setForm] = useState(emptyForm);

  const fetchCategories = useCallback(async () => {
    const res = await fetch('/api/categories');
    const data = await res.json();
    if (data.code === 0) setCategories(data.data || []);
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (keyword) params.set('keyword', keyword);
    if (filterStatus && filterStatus !== 'all') params.set('status', filterStatus);
    if (user?.id && !isAdmin) params.set('created_by', user.id);
    const res = await fetch(`/api/tasks?${params}`);
    const data = await res.json();
    if (data.code === 0) {
      setTasks(data.data?.list || []);
      setTotal(data.data?.total || 0);
    }
    setLoading(false);
  }, [filterStatus, isAdmin, keyword, user?.id]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (dialogOpen && !form.organizer && user?.name) {
      setForm((current) => ({ ...current, organizer: user.name || '' }));
    }
  }, [dialogOpen, form.organizer, user?.name]);

  useEffect(() => {
    if (user?.id) fetchTasks();
  }, [fetchTasks, user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('create') === '1') {
      setDialogOpen(true);
      window.history.replaceState(null, '', '/tasks');
    }
  }, []);

  const selectedCategoryData = categories.find((category) => category.name === form.product_category);
  const availableProducts = selectedCategoryData?.products || [];
  const productModelRequired = SELF_DEVELOPMENT_TYPES.includes(form.project_type);

  const handleCategoryChange = (catName: string) => {
    setForm((current) => ({ ...current, product_category: catName, product: '' }));
  };

  const handleCreate = async () => {
    let taskName = form.task_name.trim();
    if (!taskName) {
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      taskName = `${form.product_category || ''}${form.product || ''}${form.product_model || ''}${form.project_type || ''}${dateStr}${form.organizer ? '-' + form.organizer : ''}` || '未命名任务';
    }
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, task_name: taskName, created_by: user?.id }),
    });
    const data = await res.json();
    if (data.code === 0) {
      setDialogOpen(false);
      setForm(emptyForm);
      fetchTasks();
      toast.success('体验计划已创建');
    } else {
      toast.error(data.message || '创建失败');
    }
  };

  const handleDeleteTask = async () => {
    if (!deletingTask || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${deletingTask.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.code === 0) {
        setDeleteDialogOpen(false);
        setDeletingTask(null);
        fetchTasks();
        toast.success('任务已删除');
      } else {
        toast.error(data.message || '删除失败');
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenTransfer = async (task: Task) => {
    setTransferTask(task);
    const res = await fetch(`/api/auth/users?admin_user_id=${user?.id}`);
    const data = await res.json();
    if (data.code === 0) {
      setTransferUsers((data.data || []).filter((u: Record<string, unknown>) => u.id !== user?.id));
      setTransferTargetId('');
      setTransferOpen(true);
    } else {
      toast.error(data.message || '获取用户列表失败');
    }
  };

  const handleTransfer = async () => {
    if (!transferTask || !transferTargetId || transferring) return;
    setTransferring(true);
    try {
      const res = await fetch(`/api/tasks/${transferTask.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: transferTargetId, admin_user_id: user?.id }),
      });
      const data = await res.json();
      if (data.code === 0) {
        toast.success(data.message);
        setTransferOpen(false);
        setTransferTask(null);
        fetchTasks();
      } else {
        toast.error(data.message);
      }
    } finally {
      setTransferring(false);
    }
  };

  return (
    <PageShell className="space-y-4">
      <PageHeader
        title="体验计划"
        description={`创建和管理体验任务${total ? `，共 ${total} 个` : ''}`}
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> 新建任务
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
              <DialogHeader>
                <DialogTitle>创建体验任务</DialogTitle>
                <DialogDescription>填写任务基本信息后进入任务详情继续添加素材、问题点和功能效果。</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>任务名称 *</Label>
                  <Input
                    placeholder="如：PBJ-F10U1新品体验"
                    value={form.task_name}
                    onChange={(event) => setForm({ ...form, task_name: event.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>产品品类 *</Label>
                    <Select value={form.product_category} onValueChange={handleCategoryChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择品类" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.name}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>产品 *</Label>
                    <Select
                      value={form.product}
                      onValueChange={(value) => setForm({ ...form, product: value })}
                      disabled={!form.product_category}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={form.product_category ? '选择产品' : '请先选择品类'} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableProducts.map((prod) => (
                          <SelectItem key={prod.id} value={prod.name}>
                            {prod.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>产品型号 {productModelRequired ? '*' : ''}</Label>
                  <Input
                    placeholder="如：PBJ-F10U1"
                    value={form.product_model}
                    onChange={(event) => setForm({ ...form, product_model: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>项目类型 *</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {PROJECT_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            project_type: type,
                            project_phase: type === '自研' ? form.project_phase : '',
                          })
                        }
                        className={cn(
                          'min-h-10 rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                          form.project_type === type
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background hover:bg-muted/50'
                        )}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
                {form.project_type === '自研' && (
                  <div className="space-y-1.5">
                    <Label>项目阶段 *</Label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {['手板研究', '试制阶段', '试产阶段', '量产阶段'].map((phase) => (
                        <button
                          key={phase}
                          type="button"
                          onClick={() => setForm({ ...form, project_phase: phase })}
                          className={cn(
                            'min-h-10 rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                            form.project_phase === phase
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-background hover:bg-muted/50'
                          )}
                        >
                          {phase}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>体验时间</Label>
                    <Input
                      type="date"
                      value={form.test_date}
                      onChange={(event) => setForm({ ...form, test_date: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>组织者</Label>
                    <Input
                      placeholder="体验负责人"
                      value={form.organizer}
                      onChange={(event) => setForm({ ...form, organizer: event.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>体验目的</Label>
                  <Textarea
                    placeholder="本次体验的目标"
                    value={form.test_purpose}
                    onChange={(event) => setForm({ ...form, test_purpose: event.target.value })}
                    rows={2}
                  />
                </div>
                <Button
                  onClick={handleCreate}
                  className="w-full"
                  disabled={
                    !form.task_name ||
                    !form.product_category ||
                    !form.product ||
                    !form.project_type ||
                    (productModelRequired && !form.product_model)
                  }
                >
                  创建任务
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <FilterBar>
        <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterStatus(tab)}
              className={cn(
                'min-h-10 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors',
                filterStatus === tab
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {tab === 'all' ? '全部' : tab}
            </button>
          ))}
        </div>
        <SearchField
          placeholder="搜索型号、任务名称..."
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
      </FilterBar>

      {loading ? (
        <SkeletonList rows={3} />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="暂无任务"
          description={keyword || filterStatus !== 'all' ? '调整搜索或筛选条件后再试。' : '创建第一个体验任务开始使用。'}
        />
      ) : (
        <div className="grid gap-3">
          {tasks.map((task) => (
            <EntityListItem
              key={task.id}
              onClick={() => router.push(`/tasks/${task.id}`)}
              title={task.task_name}
              description={
                <span>
                  {task.product_category}
                  {task.product ? ` - ${task.product}` : ''}
                  {task.product_model ? ` | ${task.product_model}` : ''}
                </span>
              }
              leading={
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <ClipboardList className="h-4 w-4 text-primary" />
                </div>
              }
              meta={
                <>
                  <StatusBadge kind="task" value={task.status} />
                  {task.project_type && <Badge variant="outline" className="text-[10px]">{task.project_type}</Badge>}
                  {task.project_phase && <Badge variant="outline" className="text-[10px]">{task.project_phase}</Badge>}
                  {task.test_date && <Badge variant="outline" className="text-[10px]">{task.test_date}</Badge>}
                </>
              }
              actions={
                <>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      aria-label={`转移体验计划 ${task.task_name}`}
                      onClick={() => handleOpenTransfer(task)}
                    >
                      <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    aria-label={`删除体验计划 ${task.task_name}`}
                    onClick={() => {
                      setDeletingTask(task);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </>
              }
              showChevron={false}
            />
          ))}
        </div>
      )}

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setDeletingTask(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除任务</DialogTitle>
            <DialogDescription>
              删除后该任务及其所有关联数据将无法恢复，确认删除「{deletingTask?.task_name}」？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeletingTask(null);
              }}
            >
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteTask} disabled={deleting}>
              {deleting ? '删除中...' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>转移体验计划</DialogTitle>
            <DialogDescription>
              将「{transferTask?.task_name}」及其所有资料转移到其他用户
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                转移后，该体验计划将从原用户列表中移除，目标用户将获得所有资料的所有权。
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>选择目标用户</Label>
              <Select value={transferTargetId} onValueChange={setTransferTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择用户" />
                </SelectTrigger>
                <SelectContent>
                  {transferUsers.map((transferUser) => (
                    <SelectItem key={transferUser.id} value={transferUser.id}>
                      {transferUser.name || transferUser.account}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleTransfer} className="w-full" disabled={!transferTargetId || transferring}>
              {transferring ? '转移中...' : '确认转移'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

