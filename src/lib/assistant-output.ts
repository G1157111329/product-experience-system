/** Remove provider reasoning blocks before an assistant response is stored or shown. */
export function stripAssistantReasoning(value: string | null | undefined): string {
  if (!value) return '';

  return value
    .replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, '')
    .replace(/<think\b[^>]*>[\s\S]*$/gi, '')
    .trim();
}
