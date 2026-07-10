export function reportFilenameBase(value: unknown): string {
  const normalized = String(value || '')
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 120);
  return normalized || '报告';
}

export function buildReportFilename(value: unknown): string {
  return `${reportFilenameBase(value)}.pdf`;
}
