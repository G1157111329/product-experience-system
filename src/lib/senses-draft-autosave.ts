export function hasMaterialSelectionChanged(currentIds: readonly string[], nextIds: readonly string[]) {
  return currentIds.length !== nextIds.length
    || currentIds.some((id, index) => id !== nextIds[index]);
}

export function shouldCloseSensesDraftWithoutSaving(input: { draftDirty: boolean; formValid: boolean }) {
  return !input.draftDirty;
}
