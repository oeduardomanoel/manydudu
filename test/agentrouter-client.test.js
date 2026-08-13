import test from "node:test";
import assert from "node:assert/strict";
import { AgentRouterClient } from "../src/ai/agentrouter-client.js";

test("sends a bounded conversation and parses structured qualification", async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      messages: ["Entendi.", "Qual o volume semanal?"], qualification: { stage: "discovering", score: 20, summary: "Sem volume" }, handoff: false
    }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = new AgentRouterClient({ apiKey: "secret", baseUrl: "https://router.example/v1", model: "model-1", fetchImpl });

  const result = await client.respond({ session: { goal: "Qualificar", instructions: "Uma pergunta por vez" },
    message: { type: "text", text: "Faço manual" }, history: [{ role: "user", content: "Faço manual" }] });

  assert.equal(request.url, "https://router.example/v1/chat/completions");
  assert.equal(request.options.headers.Authorization, "Bearer secret");
  assert.equal(request.body.model, "model-1");
  assert.deepEqual(result.messages, ["Entendi.", "Qual o volume semanal?"]);
});

test("rejects insecure endpoints and malformed model output", async () => {
  assert.throws(() => new AgentRouterClient({ apiKey: "x", baseUrl: "http://router.example", model: "m" }), /HTTPS/);
  const client = new AgentRouterClient({ apiKey: "x", baseUrl: "https://router.example/v1", model: "m",
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: "texto livre" } }] }), { status: 200 }) });
  await assert.rejects(() => client.respond({ session: {}, message: {}, history: [] }), /formato inválido/i);
});
