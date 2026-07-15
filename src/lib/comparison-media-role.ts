export const COMPARISON_INLINE_MEDIA_LIMIT = 5;

export function roleForIndex(index: number): 'cell_primary' | 'cell_secondary' | 'appendix' {
  if (index === 0) return 'cell_primary';
  if (index < COMPARISON_INLINE_MEDIA_LIMIT) return 'cell_secondary';
  return 'appendix';
}
