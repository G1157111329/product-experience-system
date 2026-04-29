import { relations } from "drizzle-orm/relations";
import { experienceTasks, reports, reportTemplates, recipes, recipeSteps, standards, standardItems, checkRecords, issues, reportShares, platformUsers, recipeLibrary, recipeLibrarySteps, materials } from "./schema";

export const reportsRelations = relations(reports, ({one, many}) => ({
	experienceTask: one(experienceTasks, {
		fields: [reports.taskId],
		references: [experienceTasks.id]
	}),
	reportTemplate: one(reportTemplates, {
		fields: [reports.templateId],
		references: [reportTemplates.id]
	}),
	reportShares: many(reportShares),
}));

export const experienceTasksRelations = relations(experienceTasks, ({many}) => ({
	reports: many(reports),
	recipes: many(recipes),
	checkRecords: many(checkRecords),
	issues: many(issues),
	materials: many(materials),
}));

export const reportTemplatesRelations = relations(reportTemplates, ({many}) => ({
	reports: many(reports),
}));

export const recipesRelations = relations(recipes, ({one, many}) => ({
	experienceTask: one(experienceTasks, {
		fields: [recipes.taskId],
		references: [experienceTasks.id]
	}),
	recipeSteps: many(recipeSteps),
}));

export const recipeStepsRelations = relations(recipeSteps, ({one}) => ({
	recipe: one(recipes, {
		fields: [recipeSteps.recipeId],
		references: [recipes.id]
	}),
}));

export const standardItemsRelations = relations(standardItems, ({one}) => ({
	standard: one(standards, {
		fields: [standardItems.standardId],
		references: [standards.id]
	}),
}));

export const standardsRelations = relations(standards, ({many}) => ({
	standardItems: many(standardItems),
}));

export const checkRecordsRelations = relations(checkRecords, ({one, many}) => ({
	experienceTask: one(experienceTasks, {
		fields: [checkRecords.taskId],
		references: [experienceTasks.id]
	}),
	issues: many(issues),
	materials: many(materials),
}));

export const issuesRelations = relations(issues, ({one}) => ({
	experienceTask: one(experienceTasks, {
		fields: [issues.taskId],
		references: [experienceTasks.id]
	}),
	checkRecord: one(checkRecords, {
		fields: [issues.recordId],
		references: [checkRecords.id]
	}),
}));

export const reportSharesRelations = relations(reportShares, ({one}) => ({
	report: one(reports, {
		fields: [reportShares.reportId],
		references: [reports.id]
	}),
	platformUser: one(platformUsers, {
		fields: [reportShares.createdBy],
		references: [platformUsers.id]
	}),
}));

export const platformUsersRelations = relations(platformUsers, ({many}) => ({
	reportShares: many(reportShares),
}));

export const recipeLibraryStepsRelations = relations(recipeLibrarySteps, ({one}) => ({
	recipeLibrary: one(recipeLibrary, {
		fields: [recipeLibrarySteps.recipeLibraryId],
		references: [recipeLibrary.id]
	}),
}));

export const recipeLibraryRelations = relations(recipeLibrary, ({many}) => ({
	recipeLibrarySteps: many(recipeLibrarySteps),
}));

export const materialsRelations = relations(materials, ({one}) => ({
	checkRecord: one(checkRecords, {
		fields: [materials.recordId],
		references: [checkRecords.id]
	}),
	experienceTask: one(experienceTasks, {
		fields: [materials.taskId],
		references: [experienceTasks.id]
	}),
}));