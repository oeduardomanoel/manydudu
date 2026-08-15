import test from "node:test";
import assert from "node:assert/strict";
import { PIPELINE_STAGES } from "../src/domain/pipeline.js";

test("pipeline stages are the expected fixed set, in order", () => {
  assert.deepEqual(PIPELINE_STAGES, ["novo", "contatado", "qualificado", "cliente", "perdido"]);
});
