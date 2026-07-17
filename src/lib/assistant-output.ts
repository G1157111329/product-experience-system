/** Remove provider reasoning blocks before an assistant response is stored or shown. */
export function stripAssistantReasoning(value: string | null | undefined): string {
  if (!value) return '';

  return value
    .replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, '')
    .replace(/<think\b[^>]*>[\s\S]*$/gi, '')
    // Some upstream providers occasionally include replacement/control marks.
    // They do not carry user-visible meaning and can make Chinese chat copy look garbled.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFEFF\uFFFD]/g, '')
    .trim();
}
