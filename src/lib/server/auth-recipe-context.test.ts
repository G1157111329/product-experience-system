import assert from 'node:assert/strict';
import { isRecipeContextInTask, type ClientLike } from './auth';

function mockClient(recipes: Record<string, { id: string; task_id: string }>, steps: Record<string, { id: string; recipe_id: string }>) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq(_field: string, id: unknown) {
              return {
                maybeSingle: async () => ({ data: table === 'recipes' ? recipes[String(id)] ?? null : steps[String(id)] ?? null }),
              };
            },
          };
        },
      };
    },
  } as unknown as ClientLike;
}

const client = mockClient(
  { recipeA: { id: 'recipeA', task_id: 'taskA' }, recipeB: { id: 'recipeB', task_id: 'taskB' } },
  { stepA: { id: 'stepA', recipe_id: 'recipeA' }, stepB: { id: 'stepB', recipe_id: 'recipeB' } },
);

async function run() {
  assert.equal(await isRecipeContextInTask(client, 'taskA', 'recipeA', 'stepA'), true);
  assert.equal(await isRecipeContextInTask(client, 'taskA', undefined, 'stepA'), true);
  assert.equal(await isRecipeContextInTask(client, 'taskA', 'recipeA', 'stepB'), false);
  assert.equal(await isRecipeContextInTask(client, 'taskA', 'recipeB'), false);
  assert.equal(await isRecipeContextInTask(client, 'taskA', undefined, 'missing'), false);
  console.log('recipe context access tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
