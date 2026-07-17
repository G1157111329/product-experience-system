export type MaterialEditSaveMode = 'overwrite' | 'save_new';

export function resolveMaterialEditSaveMode(input: {
  requested: MaterialEditSaveMode;
  hasFrozenReference: boolean;
}): MaterialEditSaveMode {
  return input.hasFrozenReference ? 'save_new' : input.requested;
}
