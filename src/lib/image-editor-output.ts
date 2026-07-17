const DEFAULT_MAX_LONG_EDGE = 1920;

export function capImageOutputDimensions(input: {
  width: number;
  height: number;
  maxLongEdge?: number;
}) {
  const width = Math.max(1, Math.round(input.width));
  const height = Math.max(1, Math.round(input.height));
  const maxLongEdge = input.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE;
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) return { width, height, constrained: false };

  const scale = maxLongEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    constrained: true,
  };
}
