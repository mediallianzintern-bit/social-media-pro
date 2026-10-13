// Run with: node --experimental-strip-types --test tests/tool-workflow.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { isAiToolWorkflowLane, workflowLaneForSource, toolWorkflowPrompt } from '../src/server/ai/tool-workflow.ts';
import { ideasSchemaFor } from '../src/server/ai/schemas.ts';
import { shapeFor } from '../src/lib/script-families.ts';

test('workflow aliases match without changing other AI or marketing lanes', () => {
  for (const lane of ['AI tool workflows', ' AI Tool Workflow ', 'AI-tool-workflows', 'AI tools workflows']) assert.equal(isAiToolWorkflowLane(lane), true);
  for (const lane of [null, '', 'Frontier AI developments', 'Brand strategy lessons', 'Marketing stunts', 'AI marketing workflows']) assert.equal(isAiToolWorkflowLane(lane), false);
});

test('a clicked workflow topic keeps the account taxonomy name', () => {
  assert.equal(workflowLaneForSource('instagram', 'AI tool workflow', ['AI Tool Workflows', 'Frontier AI developments']), 'AI Tool Workflows');
  assert.equal(workflowLaneForSource('instagram', 'AI tool workflows', []), 'AI tool workflows');
  assert.equal(workflowLaneForSource('instagram', 'Frontier AI developments', ['AI tool workflows']), undefined);
  assert.equal(workflowLaneForSource('linkedin', 'AI tool workflows', ['AI tool workflows']), undefined);
});

test('demo instructions are scoped and preserve other script families', () => {
  assert.equal(toolWorkflowPrompt('instagram', ['Frontier AI developments', 'Marketing stunts']), '');
  assert.equal(toolWorkflowPrompt('linkedin', ['AI tool workflows']), '');
  const prompt = toolWorkflowPrompt('instagram', ['AI tool workflows', 'Frontier AI developments']);
  assert.match(prompt, /applies ONLY when contentLane is one of: \["AI tool workflows"\]/);
  assert.match(prompt, /4–6 short actions/);
  assert.match(prompt, /Comment \[one relevant keyword\]/);
  assert.match(prompt, /\[VERIFY:/);
  assert.equal(shapeFor({name:'Frontier AI developments'}).family, 'ai');
  assert.equal(shapeFor({name:'Marketing stunts'}).family, 'marketing');
});

test('dedicated workflow calls require a reel; other calls keep their formats', () => {
  const schema = (platform, reelOnly = false) => ideasSchemaFor({platform, reelOnly, sourceIds: ['source-1'], lanes:['AI tool workflows']});
  const formats = schema => schema.properties.ideas.items.properties.format.enum;
  assert.deepEqual(formats(schema('instagram', true)), ['reel']);
  assert.deepEqual(formats(schema('instagram')), ['reel', 'carousel']);
  assert.deepEqual(formats(schema('linkedin', true)), ['text_post', 'article', 'document']);
});
