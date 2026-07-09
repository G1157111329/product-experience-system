type ComparisonCellLike = Record<string, unknown>;

function firstText(...values: unknown[]) {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function processNotes(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  }
  const single = String(value ?? '').trim();
  return single ? [single] : [];
}

export function comparisonCellFields(cell: ComparisonCellLike) {
  return {
    processNotes: processNotes(cell.process_notes),
    conclusion: firstText(cell.effect_summary, cell.conclusion, cell.conclusion_tag) || '-',
  };
}
