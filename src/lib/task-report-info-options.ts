export const TASK_PROJECT_TYPES = [
  'ODM/OEM',
  '竞品研究',
  '自研',
  '前期研究',
  '改型/降本/优化',
  '海外产品',
] as const;

/** 项目阶段是自研项目的阶段性字段，不是所有项目类型的通用标签。 */
export function shouldSelectProjectPhase(projectType: string | null | undefined): boolean {
  return projectType === '自研';
}

export function getProjectTypeSelectionPatch(
  projectType: string,
  currentProjectPhase: string | null | undefined,
): { project_type: string; project_phase: string | null } {
  return {
    project_type: projectType,
    project_phase: shouldSelectProjectPhase(projectType) ? currentProjectPhase ?? null : null,
  };
}
