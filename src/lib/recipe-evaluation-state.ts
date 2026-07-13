export function materialSignature(materials: Array<{ id: string }> | undefined) {
  return [...new Set((materials || []).map((item) => item.id).filter(Boolean))].sort().join('|');
}

export function shouldSyncExternalMaterials(input: {
  externalSignature: string;
  localSignature: string;
  dirty: boolean;
  inFlight: number;
}) {
  return !input.dirty && input.inFlight === 0 && input.externalSignature !== input.localSignature;
}

export function shouldReportSaveError(silent: boolean) {
  return !silent;
}
