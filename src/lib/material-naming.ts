const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const MAX_SEQUENCE_PER_SECOND = 99;

type AllocateMaterialFileNameInput = {
  now?: Date;
  extension: string;
  existingFileNames: string[];
};

type AllocateEditedCopyFileNameInput = {
  originalFileName: string;
  existingFileNames: string[];
};

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function normalizeExtension(extension: string) {
  return extension.replace(/^\.+/, '').trim().toLowerCase() || 'jpg';
}

function splitFileName(fileName: string) {
  const lastSlash = Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\'));
  const leafName = lastSlash >= 0 ? fileName.slice(lastSlash + 1) : fileName;
  const dotIndex = leafName.lastIndexOf('.');
  if (dotIndex <= 0) return { base: leafName, extension: '' };
  return {
    base: leafName.slice(0, dotIndex),
    extension: leafName.slice(dotIndex + 1).toLowerCase(),
  };
}

export function toBeijingTimestampBase(date = new Date()) {
  const beijing = new Date(date.getTime() + BEIJING_OFFSET_MS);
  return [
    beijing.getUTCFullYear(),
    pad2(beijing.getUTCMonth() + 1),
    pad2(beijing.getUTCDate()),
    pad2(beijing.getUTCHours()),
    pad2(beijing.getUTCMinutes()),
    pad2(beijing.getUTCSeconds()),
  ].join('');
}

function usedSequencesForBase(existingFileNames: string[], timestampBase: string) {
  const sequencePattern = new RegExp(`^${timestampBase}(\\d{2})(?:\\.[^.]+)?$`);
  return new Set(
    existingFileNames
      .map((fileName) => splitFileName(fileName).base)
      .map((base) => base.match(sequencePattern)?.[1])
      .filter((value): value is string => Boolean(value))
      .map((value) => Number(value)),
  );
}

export function allocateMaterialFileName({
  now = new Date(),
  extension,
  existingFileNames,
}: AllocateMaterialFileNameInput) {
  const normalizedExtension = normalizeExtension(extension);
  let candidateTime = new Date(now);

  for (let secondOffset = 0; secondOffset < 24 * 60 * 60; secondOffset += 1) {
    const timestampBase = toBeijingTimestampBase(candidateTime);
    const usedSequences = usedSequencesForBase(existingFileNames, timestampBase);
    for (let sequence = 1; sequence <= MAX_SEQUENCE_PER_SECOND; sequence += 1) {
      if (!usedSequences.has(sequence)) {
        return `${timestampBase}${pad2(sequence)}.${normalizedExtension}`;
      }
    }
    candidateTime = new Date(candidateTime.getTime() + 1000);
  }

  throw new Error('Unable to allocate material filename within one day window');
}

export function allocateEditedCopyFileName({
  originalFileName,
  existingFileNames,
}: AllocateEditedCopyFileNameInput) {
  const { base, extension } = splitFileName(originalFileName);
  const suffix = extension ? `.${extension}` : '';
  const existing = new Set(existingFileNames);
  const firstCopy = `${base}（副）${suffix}`;
  if (!existing.has(firstCopy)) return firstCopy;

  for (let index = 2; index <= 99; index += 1) {
    const candidate = `${base}（副${index}）${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }

  throw new Error('Unable to allocate edited copy filename');
}
