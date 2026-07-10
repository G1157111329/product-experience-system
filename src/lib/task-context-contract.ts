export type IngredientItem = {
  name: string;
  quantity?: number;
  unit?: string;
  note?: string;
};

export type StepParameters = {
  duration_sec?: number;
  speed?: string;
  temperature_c?: number;
  mode?: string;
};

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalNonNegativeNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return undefined;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function normalizeIngredientItems(value: unknown): IngredientItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const name = optionalText(row.name);
    if (!name) return [];
    const quantity = optionalNonNegativeNumber(row.quantity);
    const unit = optionalText(row.unit);
    const note = optionalText(row.note);
    return [{
      name,
      ...(quantity === undefined ? {} : { quantity }),
      ...(unit ? { unit } : {}),
      ...(note ? { note } : {}),
    }];
  }).slice(0, 100);
}

export function normalizeStepParameters(value: unknown): StepParameters {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const row = value as Record<string, unknown>;
  const durationSec = optionalNonNegativeNumber(row.duration_sec);
  const temperatureC = optionalNonNegativeNumber(row.temperature_c);
  const speed = optionalText(row.speed);
  const mode = optionalText(row.mode);
  return {
    ...(durationSec === undefined ? {} : { duration_sec: durationSec }),
    ...(speed ? { speed } : {}),
    ...(temperatureC === undefined ? {} : { temperature_c: temperatureC }),
    ...(mode ? { mode } : {}),
  };
}
