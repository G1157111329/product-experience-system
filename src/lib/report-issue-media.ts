type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? '').trim();
}

function materialKey(material: Row) {
  return text(material.id)
    || text(material.file_path)
    || text(material.file_url)
    || JSON.stringify(material);
}

export function issueMaterialRows(issue: Row, allMaterials: Row[]) {
  const issueId = text(issue.id);
  const recordId = text(issue.record_id);
  const sourceCellId = text(issue.source_cell_id);
  const seen = new Set<string>();

  return allMaterials.filter((material) => {
    const matches = (
      (issueId !== '' && text(material.issue_id) === issueId)
      || (recordId !== '' && text(material.record_id) === recordId)
      || (sourceCellId !== '' && text(material.comparison_cell_id) === sourceCellId)
    );
    if (!matches) return false;
    const key = materialKey(material);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
