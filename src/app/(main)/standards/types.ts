export interface CategoryWithProducts {
  id: string;
  name: string;
  sort_order: number;
  products: Array<{ id: string; name: string; category_id: string; sort_order: number }>;
}

export interface Standard {
  id: string;
  standard_name: string;
  category: string;
  product_category: string | null;
  product: string | null;
  version: string;
  description: string | null;
  standard_items: Array<{ count: number }>;
}

export interface RecipeLibItem {
  id: string;
  name: string;
  product_category: string | null;
  product: string | null;
  ingredients: string | null;
  recipe_type: string;
  recipe_library_steps: Array<{ id: string; step_number: number; operation: string; problem_point: string | null }>;
}

export interface RecipeLibStep {
  id?: string;
  step_number: number;
  operation: string;
  problem_point: string | null;
  problem_points: Array<{ text: string }>;
  material_ids?: string[];
}

export const categoryConfig: Record<string, { label: string; color: string; desc: string }> = {
  '通用标准': { label: '通用标准', color: 'bg-primary/10 text-primary', desc: '产品全流程体验通用标准' },
  '品类标准': { label: '品类标准', color: 'bg-primary/10 text-primary', desc: '品类专用检查标准' },
  '感官评价标准': { label: '感官评价', color: 'bg-amber-100 text-amber-700', desc: '感官主观评价标准' },
  '食谱功能标准': { label: '食谱功能', color: 'bg-lime-100 text-lime-800', desc: '食谱功能体验标准' },
};
