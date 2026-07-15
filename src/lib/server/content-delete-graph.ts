export type ContentDeleteKind = 'record' | 'recipe_step' | 'recipe' | 'issue';
export type DeleteTarget = { type: ContentDeleteKind | 're_evaluation'; id: string };

export type DeleteGraph = {
  kind: ContentDeleteKind;
  id: string;
  actorId: string;
  stepIds: string[];
  affectedRecordIds: string[];
  issueIds: string[];
  reEvaluationIds: string[];
  targets: DeleteTarget[];
  materialIds: string[];
};

export type DeleteGraphImpact = {
  records: number;
  childNodes: number;
  cells: number;
  materialLinks: number;
  issues: number;
};

export function projectDeleteGraphImpact(graph: DeleteGraph): DeleteGraphImpact {
  return {
    records: graph.kind === 'record' ? 1 : new Set(graph.affectedRecordIds).size,
    childNodes: graph.kind === 'recipe' ? new Set(graph.stepIds).size : 0,
    cells: 0,
    materialLinks: new Set(graph.materialIds).size,
    issues: new Set(graph.issueIds).size,
  };
}
