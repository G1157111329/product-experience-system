import type { Material as MaterialType } from '@/components/material-picker';
export type Material = MaterialType;

export interface CategoryWithProducts {
  id: string;
  name: string;
  sort_order: number;
  products: Array<{ id: string; name: string; category_id: string; sort_order: number }>;
}

export interface RecipeLibRef {
  id: string;
  name: string;
  product_category: string | null;
  product: string | null;
  ingredients: string | null;
  recipe_type: string;
  recipe_library_steps: Array<{ id: string; step_number: number; operation: string; problem_point: string | null; problem_points: unknown }>;
}

export interface TaskDetail {
  id: string;
  task_name: string;
  product_category: string;
  product: string | null;
  product_model: string;
  project_number: string | null;
  project_type: string | null;
  project_phase: string | null;
  test_date: string | null;
  organizer: string | null;
  target_user: string | null;
  test_purpose: string | null;
  test_method: string | null;
  status: string;
  assigned_to: string | null;
  created_at: string;
  records: CheckRecord[];
  issues: Issue[];
}

export interface AiTaskSummary {
  tag: string;
  satisfaction_score: number;
  summary: string;
  strengths: string[];
  risks: string[];
  historical_position: string;
  suggestions: string[];
  updated_at?: string;
}

export interface CheckRecord {
  id: string;
  sensory_dimension: string | null;
  check_dimension: string | null;
  sub_check_dimension: string | null;
  check_standard: string | null;
  check_item: string;
  check_requirement: string | null;
  evaluation_result: string;
  problem_description: string | null;
  measurement_value: string | null;
  standard_category: string | null;
  test_phase: string | null;
  experience_flow: string | null;
  touch_point: string | null;
  experience_standard: string | null;
  check_tool: string | null;
  problem_level: string | null;
  task_id: string;
  materials?: Material[];
}

export interface Issue {
  id: string;
  title: string;
  severity: string;
  status: string;
}

export type MaterialEvidenceFilter = 'all' | 'unlinked' | 'linked' | 'image' | 'video' | 'senses' | 'functions' | 'effect';

export type EvidenceBindingTarget =
  | { type: 'record'; id: string; label: string }
  | { type: 'recipe_step'; id: string; label: string }
  | { type: 'recipe_effect'; id: string; label: string };

export type AuthoringSection = 'materials' | 'senses' | 'functions' | 'summary';

export interface Recipe {
  id: string;
  name: string;
  ingredients: string | null;
  recipe_type: string;
  problem_count: number;
  recipe_steps: RecipeStep[];
  effect_description?: string | null;
  effect_score?: string | null;
  effect_problem_point?: string | null;
  effect_problem_points?: ProblemPoint[];
  sort_order?: number;  effect_ai_result?: { score: number; summary: string } | null;
  effect_materials?: Material[];
}

export interface ProblemPoint {
  text: string;
  material_ids?: string[];
}

export interface RecipeStep {
  id: string;
  step_number: number;
  operation: string;
  problem_point: string | null;
  problem_points?: ProblemPoint[];
  materials?: Material[];
}

export interface StandardItem {
  id: string;
  standard_id: string;
  sensory_dimension: string | null;
  test_phase: string | null;
  experience_flow: string | null;
  touch_point: string | null;
  check_dimension: string | null;
  sub_check_dimension: string | null;
  check_item: string;
  check_requirement: string | null;
  check_standard: string | null;
  experience_standard: string | null;
  check_tool: string | null;
  problem_level: string | null;
  evaluation_prep: string | null;
  subjective_score: number | null;
  subjective_rating: string | null;
  standard: { id: string; standard_name: string; category: string; product_category: string | null } | null;
}

export const sensoryColors: Record<string, string> = {
  '视觉': 'bg-primary/10 text-primary',
  '听觉': 'bg-yellow-100 text-yellow-800',
  '触觉': 'bg-orange-100 text-orange-800',
  '嗅觉': 'bg-lime-100 text-lime-800',
  '味觉': 'bg-rose-100 text-rose-800',
};

export const statusConfig: Record<string, { label: string; color: string }> = {
  '待执行': { label: '待执行', color: 'bg-muted text-muted-foreground' },
  '进行中': { label: '进行中', color: 'bg-primary/10 text-primary' },
  '已完成': { label: '已完成', color: 'bg-lime-100 text-lime-800' },
};
