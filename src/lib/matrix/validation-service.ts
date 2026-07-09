/**
 * Submit validation service — enforces PRD §10 blocking and warning rules.
 * MX-V-001 through MX-V-010 blocking items and MX-W-001 through MX-W-006 warnings.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import {
  taskMatrices,
  matrixFieldDefinitions,
  matrixGroups,
  matrixRows,
  matrixFieldValues,
  matrixFormulaDefinitions,
  matrixCalculationRuns,
  issueOccurrences,
  rectificationActions,
  verifications,
} from '@/storage/database/shared/schema';
import { compileFormula } from './formula-engine';
import type {
  ValidationResult,
  ValidationItem,
  MatrixFieldDefinition,
  MatrixFieldValue,
} from './task-matrix-types';

export async function validateMatrix(matrixId: string, userId: string): Promise<ValidationResult> {
  const db = await getDb();
  const blocking: ValidationItem[] = [];
  const warnings: ValidationItem[] = [];

  // MX-V-010: caller identity must be present (route层还会做资源权限控制)
  if (!userId) {
    return {
      passed: false,
      blockingItems: [{ code: 'MX-V-010', message: '当前用户无权提交包含该矩阵的任务' }],
      warningItems: [],
    };
  }

  // Get matrix
  const matrixRows_data = await db
    .select()
    .from(taskMatrices)
    .where(eq(taskMatrices.id, matrixId))
    .limit(1);

  if (matrixRows_data.length === 0) {
    return { passed: false, blockingItems: [{ code: 'MX-V-001', message: '矩阵不存在' }], warningItems: [] };
  }

  const matrix = matrixRows_data[0] as unknown as {
    id: string; taskId: string; status: string; currentDesignVersionId: string | null;
    comparabilityStatus: string; comparabilityStatement: string | null;
    updatedAt: string | null;
  };

  // MX-V-001: unconfirmed design
  if (!matrix.currentDesignVersionId || matrix.status !== 'active') {
    blocking.push({
      code: 'MX-V-001',
      message: '存在未确认设计的矩阵',
      targetUrl: `/tasks/${matrix.id}?tab=matrix&matrixId=${matrixId}`,
    });
    return { passed: false, blockingItems: blocking, warningItems: warnings };
  }

  const designVersionId = matrix.currentDesignVersionId;

  // Get all field definitions for this design version
  const fieldRows = await db
    .select()
    .from(matrixFieldDefinitions)
    .where(and(
      eq(matrixFieldDefinitions.designVersionId, designVersionId),
      eq(matrixFieldDefinitions.isArchived, false),
    ));

  const fields = fieldRows as unknown as MatrixFieldDefinition[];
  const fieldIdSet = new Set(fields.map((field) => field.id));
  const fieldLabelSet = new Set(fields.map((field) => field.label.trim().toLowerCase()));

  const requiredFields = fields.filter((f) => f.requiredMode === 'required');
  const resultStatusField = fields.find((f) => f.isResultStatusField);
  const issueSlotFields = fields.filter((f) => f.fieldKind === 'issue_slot');
  const requiredEvidenceFields = fields.filter(
    (f) => f.fieldKind === 'evidence_slot' && f.requiredMode === 'required',
  );
  const criticalEvidenceFields = fields.filter(
    (f) => f.fieldKind === 'evidence_slot' && Boolean(f.isCriticalEvidence),
  );
  const processNoteFields = fields.filter(
    (f) => f.fieldKind === 'manual_value' && /(过程|说明|备注|记录)/.test(f.label),
  );

  // MX-V-009: formula definition/dependency validation
  const formulaFields = fields.filter((f) => f.fieldKind === 'formula');
  if (formulaFields.length > 0) {
    const formulaRows = await db
      .select({
        fieldDefinitionId: matrixFormulaDefinitions.fieldDefinitionId,
        formulaDsl: matrixFormulaDefinitions.formulaDsl,
      })
      .from(matrixFormulaDefinitions)
      .where(inArray(matrixFormulaDefinitions.fieldDefinitionId, formulaFields.map((field) => field.id)));

    const formulaMap = new Map<string, string>();
    for (const formula of formulaRows) {
      if (formula.fieldDefinitionId) {
        formulaMap.set(formula.fieldDefinitionId, formula.formulaDsl);
      }
    }

    for (const field of formulaFields) {
      const dsl = formulaMap.get(field.id);
      if (!dsl) {
        blocking.push({
          code: 'MX-V-009',
          message: `计算字段“${field.label}”缺少公式定义`,
          fieldId: field.id,
          fieldLabel: field.label,
          targetUrl: `/tasks/${matrix.id}?tab=matrix&matrixId=${matrixId}&fieldId=${field.id}`,
        });
        continue;
      }

      try {
        const compiled = compileFormula(dsl);
        const deps = compiled.dependencies ?? [];
        const selfLabel = field.label.trim().toLowerCase();

        for (const dep of deps) {
          const normalizedDep = dep.trim().toLowerCase();
          const exists = fieldIdSet.has(dep) || fieldLabelSet.has(normalizedDep);
          if (!exists) {
            blocking.push({
              code: 'MX-V-009',
              message: `计算字段“${field.label}”引用了未知依赖“${dep}”`,
              fieldId: field.id,
              fieldLabel: field.label,
              targetUrl: `/tasks/${matrix.id}?tab=matrix&matrixId=${matrixId}&fieldId=${field.id}`,
            });
            continue;
          }

          if (dep === field.id || normalizedDep === selfLabel) {
            blocking.push({
              code: 'MX-V-009',
              message: `计算字段“${field.label}”存在自依赖`,
              fieldId: field.id,
              fieldLabel: field.label,
              targetUrl: `/tasks/${matrix.id}?tab=matrix&matrixId=${matrixId}&fieldId=${field.id}`,
            });
          }
        }
      } catch (err) {
        blocking.push({
          code: 'MX-V-009',
          message: `计算字段“${field.label}”公式非法: ${(err as Error).message}`,
          fieldId: field.id,
          fieldLabel: field.label,
          targetUrl: `/tasks/${matrix.id}?tab=matrix&matrixId=${matrixId}&fieldId=${field.id}`,
        });
      }
    }
  }

  // Get all groups and rows
  const groupRows = await db
    .select()
    .from(matrixGroups)
    .where(and(
      eq(matrixGroups.matrixId, matrixId),
      eq(matrixGroups.isArchived, false),
    ));

  let totalRows = 0;
  let notTestedCount = 0;
  let calcProblemCount = 0;
  let anomalousRows = 0;
  let rowsWithoutProcessNote = 0;
  let rowsFailWithoutIssue = 0;
  let rowsInProgress = 0;

  for (const group of groupRows) {
    const g = group as unknown as { id: string; groupLabel: string };

    const rowData = await db
      .select()
      .from(matrixRows)
      .where(and(
        eq(matrixRows.groupId, g.id),
        eq(matrixRows.isArchived, false),
      ));

    for (const r of rowData) {
      const row = r as unknown as { id: string; rowLabel: string; completionStatus: string; testInvalidReason: string | null };
      totalRows++;
      if (row.completionStatus === 'in_progress') {
        rowsInProgress += 1;
      }

      // Get all values for this row
      const valueRows = await db
        .select()
        .from(matrixFieldValues)
        .where(eq(matrixFieldValues.rowId, row.id));

      const values = valueRows as unknown as MatrixFieldValue[];
      const valueMap = new Map<string, MatrixFieldValue>();
      for (const v of values) {
        valueMap.set(v.fieldDefinitionId, v);
      }

      // Track not_tested count
      const notTested = values.filter((v) => v.valueState === 'not_tested');
      notTestedCount += notTested.length;

      const calcProblems = values.filter(
        (v) => v.valueState === 'calculation_failed' || v.valueState === 'pending_input',
      );
      calcProblemCount += calcProblems.length;

      let missingRequiredInRow = 0;
      let calcFailedRequiredInRow = 0;

      // MX-V-002: missing required fields
      for (const rf of requiredFields) {
        const val = valueMap.get(rf.id);
        const isRequiredNow = rf.requiredMode === 'required';
        if (isRequiredNow && (!val || val.valueState === 'missing' || val.valueState === 'pending_input')) {
          missingRequiredInRow += 1;
          blocking.push({
            code: 'MX-V-002',
            message: `"${g.groupLabel} / ${row.rowLabel}"：缺少必填字段"${rf.label}"`,
            groupId: g.id,
            groupLabel: g.groupLabel,
            rowId: row.id,
            rowLabel: row.rowLabel,
            fieldId: rf.id,
            fieldLabel: rf.label,
            targetUrl: `/tasks/${matrix.id}?tab=matrix&matrixId=${matrixId}&groupId=${g.id}&rowId=${row.id}&fieldId=${rf.id}`,
          });
        }
      }

      // MX-V-003: required formula fields with calculation failures
      for (const rf of requiredFields) {
        if (rf.fieldKind !== 'formula') continue;
        const val = valueMap.get(rf.id);
        if (val?.valueState === 'calculation_failed') {
          calcFailedRequiredInRow += 1;
          blocking.push({
            code: 'MX-V-003',
            message: `"${g.groupLabel} / ${row.rowLabel}"：必填计算字段"${rf.label}"计算失败`,
            groupId: g.id,
            groupLabel: g.groupLabel,
            rowId: row.id,
            rowLabel: row.rowLabel,
            fieldId: rf.id,
            fieldLabel: rf.label,
            targetUrl: `/tasks/${matrix.id}?tab=matrix&matrixId=${matrixId}&groupId=${g.id}&rowId=${row.id}&fieldId=${rf.id}`,
          });
        }
      }

      // MX-V-004: result status mapped as fail without issue/exemption/invalid
      let rowResultIsFail = false;
      if (resultStatusField && row.completionStatus !== 'test_invalid' && row.completionStatus !== 'not_applicable') {
        const statusVal = valueMap.get(resultStatusField.id);
        if (statusVal?.enumValue) {
          const mapping = typeof resultStatusField.resultStatusMapping === 'string'
            ? JSON.parse(resultStatusField.resultStatusMapping)
            : resultStatusField.resultStatusMapping;
          if (mapping?.[statusVal.enumValue] === 'fail') {
            rowResultIsFail = true;
            const hasIssueBinding = issueSlotFields.some((field) => isFieldValueFilled(valueMap.get(field.id)));
            if (!hasIssueBinding && !row.testInvalidReason) {
              rowsFailWithoutIssue += 1;
              blocking.push({
                code: 'MX-V-004',
                message: `"${g.groupLabel} / ${row.rowLabel}"：体验结果为"${statusVal.enumValue}"，请创建或关联问题`,
                groupId: g.id,
                groupLabel: g.groupLabel,
                rowId: row.id,
                rowLabel: row.rowLabel,
                fieldId: resultStatusField.id,
                fieldLabel: resultStatusField.label,
                targetUrl: `/tasks/${matrix.id}?tab=matrix&matrixId=${matrixId}&groupId=${g.id}&rowId=${row.id}`,
              });
            }
          }
        }
      }

      // MX-V-005: required evidence slot missing
      for (const field of requiredEvidenceFields) {
        const value = valueMap.get(field.id);
        if (!isFieldValueFilled(value)) {
          blocking.push({
            code: 'MX-V-005',
            message: `"${g.groupLabel} / ${row.rowLabel}"：缺少必填证据“${field.label}”`,
            groupId: g.id,
            groupLabel: g.groupLabel,
            rowId: row.id,
            rowLabel: row.rowLabel,
            fieldId: field.id,
            fieldLabel: field.label,
            targetUrl: `/tasks/${matrix.id}?tab=matrix&matrixId=${matrixId}&groupId=${g.id}&rowId=${row.id}&fieldId=${field.id}`,
          });
        }
      }

      // MX-V-006: critical evidence in invalid/processing state
      for (const field of criticalEvidenceFields) {
        const value = valueMap.get(field.id);
        const state = value?.valueState;
        if (state === 'pending_input' || state === 'calculation_failed') {
          blocking.push({
            code: 'MX-V-006',
            message: `"${g.groupLabel} / ${row.rowLabel}"：关键证据“${field.label}”仍在处理中或处理失败`,
            groupId: g.id,
            groupLabel: g.groupLabel,
            rowId: row.id,
            rowLabel: row.rowLabel,
            fieldId: field.id,
            fieldLabel: field.label,
            targetUrl: `/tasks/${matrix.id}?tab=matrix&matrixId=${matrixId}&groupId=${g.id}&rowId=${row.id}&fieldId=${field.id}`,
          });
        }
      }

      const hasCalcFailure = calcFailedRequiredInRow > 0 || calcProblems.length > 0;
      const rowAnomalous = rowResultIsFail || missingRequiredInRow > 0 || hasCalcFailure;
      if (rowAnomalous) {
        anomalousRows += 1;
      }

      if (rowAnomalous && processNoteFields.length > 0) {
        const hasProcessNote = processNoteFields.some((field) => isFieldValueFilled(valueMap.get(field.id)));
        if (!hasProcessNote) {
          rowsWithoutProcessNote += 1;
        }
      }
    }
  }

  // MX-V-007: comparability pending
  if (matrix.comparabilityStatus === 'pending') {
    blocking.push({
      code: 'MX-V-007',
      message: '多对象比较矩阵的可比性状态仍为待评估，请确认或说明限制',
      targetUrl: `/tasks/${matrix.id}?tab=matrix&matrixId=${matrixId}`,
    });
  }

  // MX-V-008: comparability lacks statement when partially/not comparable
  if (
    (matrix.comparabilityStatus === 'partially_comparable' || matrix.comparabilityStatus === 'not_comparable')
    && !textHasValue(matrix.comparabilityStatement)
  ) {
    blocking.push({
      code: 'MX-V-008',
      message: '可比性不足时必须填写限制说明',
      targetUrl: `/tasks/${matrix.id}?tab=matrix&matrixId=${matrixId}`,
    });
  }

  // Warnings
  if (totalRows > 0 && notTestedCount / (totalRows * Math.max(1, fields.length)) > 0.3) {
    warnings.push({ code: 'MX-W-001', message: '30% 以上行选择"未测试"' });
  }

  if (calcProblemCount > 0) {
    warnings.push({ code: 'MX-W-002', message: `${calcProblemCount} 个计算字段为待补充或计算失败` });
  }

  // Enrich MX-W-002 with matrix-level calculation run backlog
  const recentCalcRuns = await db
    .select({ status: matrixCalculationRuns.status })
    .from(matrixCalculationRuns)
    .where(eq(matrixCalculationRuns.taskMatrixId, matrixId));
  const calcRunFailures = recentCalcRuns.filter((run) => run.status !== 'success').length;
  if (calcRunFailures >= 3) {
    warnings.push({ code: 'MX-W-002', message: `近期存在 ${calcRunFailures} 次计算运行异常，建议执行重算并复核` });
  }

  if (anomalousRows > 0 && rowsWithoutProcessNote / anomalousRows > 0.5) {
    warnings.push({ code: 'MX-W-003', message: '大量异常记录缺少过程说明，建议补充过程记录字段' });
  }

  if (rowsFailWithoutIssue >= 2) {
    warnings.push({ code: 'MX-W-004', message: '存在多个失败记录未关联问题，建议尽快分诊' });
  }

  // Matrix-level issue triage warning from process tables
  const occurrences = await db
    .select({ issueId: issueOccurrences.issueId })
    .from(issueOccurrences)
    .where(eq(issueOccurrences.taskId, matrix.taskId));
  const occurredIssueIds = Array.from(new Set(occurrences.map((item) => item.issueId).filter(Boolean)));
  if (occurredIssueIds.length > 0) {
    const actions = await db
      .select({ issueId: rectificationActions.issueId })
      .from(rectificationActions)
      .where(inArray(rectificationActions.issueId, occurredIssueIds));
    const actionIssueIdSet = new Set(actions.map((item) => item.issueId));

    const verificationRows = await db
      .select({ issueId: verifications.issueId, result: verifications.result })
      .from(verifications)
      .where(inArray(verifications.issueId, occurredIssueIds));
    const verifiedIssueIdSet = new Set(
      verificationRows
        .filter((item) => item.result === 'passed')
        .map((item) => item.issueId),
    );

    const untriagedCount = occurredIssueIds.filter((issueId) => !actionIssueIdSet.has(issueId)).length;
    const unresolvedCount = occurredIssueIds.filter((issueId) => !verifiedIssueIdSet.has(issueId)).length;

    if (untriagedCount >= 2 || unresolvedCount >= 3) {
      warnings.push({
        code: 'MX-W-004',
        message: `问题闭环中存在待分诊 ${untriagedCount} 条、待验证 ${unresolvedCount} 条，建议优先处理`,
      });
    }
  }

  if (totalRows >= 400 || fields.length >= 32) {
    warnings.push({ code: 'MX-W-005', message: '矩阵规模接近系统上限，建议拆分矩阵或按分组录入' });
  }

  const updatedAtMs = matrix.updatedAt ? Date.parse(matrix.updatedAt) : NaN;
  const updatedRecently = Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs <= 5 * 60 * 1000;
  if (updatedRecently && rowsInProgress > 0) {
    warnings.push({ code: 'MX-W-006', message: '检测到近期有进行中记录，请确认客户端草稿已同步' });
  }

  return {
    passed: blocking.length === 0,
    blockingItems: blocking,
    warningItems: warnings,
  };
}

function isFieldValueFilled(value: MatrixFieldValue | undefined): boolean {
  if (!value) return false;
  if (value.valueState === 'missing' || value.valueState === 'pending_input') return false;
  if (value.valueState === 'not_tested' || value.valueState === 'not_applicable') return false;
  return value.numericValue != null
    || value.durationMs != null
    || value.booleanValue != null
    || textHasValue(value.textValue)
    || textHasValue(value.enumValue)
    || value.valueState === 'filled';
}

function textHasValue(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}