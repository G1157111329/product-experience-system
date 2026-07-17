export function withActiveTabSearch(search: string, tab: string): string {
  const params = new URLSearchParams(search);
  params.set('tab', tab);
  return params.toString();
}
