// Run with: node --experimental-strip-types --test tests/tool-workflow.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  isAiToolWorkflowLane,
  workflowLaneForSource,
  toolWorkflowPrompt,
  toolWorkflowIssues,
  workflowRegenerationPrompt,
} from "../src/server/ai/tool-workflow.ts";
import { ideasSchemaFor } from "../src/server/ai/schemas.ts";
import { shapeFor } from "../src/lib/script-families.ts";

test("explicit workflow regeneration permits only the selected topic to repeat", () => {
  const prompt = workflowRegenerationPrompt("instagram", "AI tool workflows", "source-1");
  assert.match(prompt, /sourceId="source-1"/);
  assert.match(prompt, /Write exactly one/);
  assert.match(prompt, /Do not switch to another story/);
  assert.match(prompt, /measured feedback blocks still/);
  assert.equal(workflowRegenerationPrompt("instagram", "Frontier AI developments", "source-1"), "");
  assert.equal(workflowRegenerationPrompt("linkedin", "AI tool workflows", "source-1"), "");
  assert.equal(workflowRegenerationPrompt("instagram", "AI tool workflows", undefined), "");
});

test("workflow aliases match without changing other AI or marketing lanes", () => {
  for (const lane of [
    "AI tool workflows",
    " AI Tool Workflow ",
    "AI-tool-workflows",
    "AI tools workflows",
  ])
    assert.equal(isAiToolWorkflowLane(lane), true);
  for (const lane of [
    null,
    "",
    "Frontier AI developments",
    "Brand strategy lessons",
    "Marketing stunts",
    "AI marketing workflows",
  ])
    assert.equal(isAiToolWorkflowLane(lane), false);
});

test("a clicked workflow topic keeps the account taxonomy name", () => {
  assert.equal(
    workflowLaneForSource("instagram", "AI tool workflow", [
      "AI Tool Workflows",
      "Frontier AI developments",
    ]),
    "AI Tool Workflows",
  );
  assert.equal(workflowLaneForSource("instagram", "AI tool workflows", []), "AI tool workflows");
  assert.equal(
    workflowLaneForSource("instagram", "Frontier AI developments", ["AI tool workflows"]),
    undefined,
  );
  assert.equal(
    workflowLaneForSource("linkedin", "AI tool workflows", ["AI tool workflows"]),
    undefined,
  );
});

test("demo instructions are scoped and preserve other script families", () => {
  assert.equal(
    toolWorkflowPrompt("instagram", ["Frontier AI developments", "Marketing stunts"]),
    "",
  );
  assert.equal(toolWorkflowPrompt("linkedin", ["AI tool workflows"]), "");
  const prompt = toolWorkflowPrompt("instagram", ["AI tool workflows", "Frontier AI developments"]);
  assert.match(prompt, /applies ONLY when contentLane is one of: \["AI tool workflows"\]/);
  assert.match(prompt, /4–6 short actions/);
  assert.match(prompt, /Comment \[one relevant keyword\]/);
  assert.match(prompt, /\[VERIFY:/);
  assert.equal(shapeFor({ name: "Frontier AI developments" }).family, "ai");
  assert.equal(shapeFor({ name: "Marketing stunts" }).family, "marketing");
});

test("dedicated workflow calls require a reel; other calls keep their formats", () => {
  const schema = (platform, reelOnly = false) =>
    ideasSchemaFor({ platform, reelOnly, sourceIds: ["source-1"], lanes: ["AI tool workflows"] });
  const formats = (schema) => schema.properties.ideas.items.properties.format.enum;
  assert.deepEqual(formats(schema("instagram", true)), ["reel"]);
  assert.deepEqual(formats(schema("instagram")), ["reel", "carousel"]);
  assert.deepEqual(formats(schema("linkedin", true)), ["text_post", "article", "document"]);
});

const shot = (voiceover, shotType = "Screen recording") => ({
  mark: "0:05–0:10",
  shotType,
  voiceover,
  visual: "Show the action described in the voiceover on the tool screen.",
  onScreenText: "Follow this step",
  transition: "Hard cut",
});

// Regression: the actual short, generic ad-tool script reported by the user.
const newsExplainer = {
  contentLane: "AI tool workflows",
  format: "reel",
  production: { durationSeconds: 30 },
  shots: [
    shot("What if your next ad campaign could run itself?", "Talking head"),
    shot("X just launched a tool that does just that."),
    shot("Imagine cutting down your ad creation time drastically.", "B-roll"),
    shot("This tool streamlines the process, enhances creativity, and saves costs.", "Text card"),
    shot("It’s about leveraging technology to enhance your marketing.", "Talking head"),
    shot("Comment AI Tool if you want to learn more!", "Call to action"),
  ],
};

// Synthetic editorial fixture, not a verified tutorial or product claim.
const demo = {
  contentLane: "AI tool workflows",
  format: "reel",
  production: { durationSeconds: 55 },
  shots: [
    shot(
      "Here is a finished carousel built from one simple content brief. Here’s exactly how you can make your own version.",
      "Talking head",
    ),
    shot(
      "First, open the design tool and choose a blank carousel template that matches the shape you need for your post.",
    ),
    shot(
      "Next, add your topic and audience to the writing prompt. Ask for one clear point on each slide, using short sentences.",
    ),
    shot(
      "Then, copy the draft into your template. Check each slide against your source and remove any claims you cannot support.",
    ),
    shot(
      "Now, edit the headings and images so they match your brand. Review the finished slides together before exporting the carousel.",
    ),
    shot("Comment Carousel and I’ll send you the full process guide.", "Talking head"),
  ],
};

test("rejects the reported news explainer before it becomes a saved workflow script", () => {
  const issues = toolWorkflowIssues("instagram", newsExplainer);
  assert.ok(issues.some((issue) => issue.includes("110–135")));
  assert.ok(issues.some((issue) => issue.includes("45–60")));
  assert.ok(issues.some((issue) => issue.includes("four ordered actions")));
  assert.ok(issues.some((issue) => issue.includes("comment keyword")));
});

test("accepts a complete demonstration structure", () => {
  assert.deepEqual(toolWorkflowIssues("instagram", demo), []);
});

test("generic screen recordings and missing labels cannot stand in for instructions", () => {
  const missingSteps = { ...demo, shots: demo.shots.map((s) => ({ ...s, shotType: "B-roll" })) };
  assert.ok(
    toolWorkflowIssues("instagram", missingSteps).some((issue) =>
      issue.includes("four ordered actions"),
    ),
  );
  const missingLabels = { ...demo, shots: demo.shots.map((s) => ({ ...s, onScreenText: "" })) };
  assert.ok(
    toolWorkflowIssues("instagram", missingLabels).some((issue) =>
      issue.includes("four ordered actions"),
    ),
  );
});

test("checks missing production, spoken text, format and closing CTA", () => {
  const issues = toolWorkflowIssues("instagram", {
    ...demo,
    format: "carousel",
    production: undefined,
    shots: [],
  });
  assert.equal(issues.length, 5);
});

test("workflow validation leaves other lanes and LinkedIn unchanged", () => {
  assert.deepEqual(
    toolWorkflowIssues("instagram", { ...newsExplainer, contentLane: "Frontier AI developments" }),
    [],
  );
  assert.deepEqual(toolWorkflowIssues("linkedin", newsExplainer), []);
});

test("dedicated workflow schema constrains production duration", () => {
  const duration = (reelOnly) =>
    ideasSchemaFor({ platform: "instagram", sourceIds: [], lanes: ["AI tool workflows"], reelOnly })
      .properties.ideas.items.properties.production.properties.durationSeconds;
  assert.deepEqual(duration(true), { type: "integer", minimum: 45, maximum: 60 });
  assert.deepEqual(duration(false), { type: "integer", minimum: 5, maximum: 180 });
});
