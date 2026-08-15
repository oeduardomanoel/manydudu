import test from "node:test";
import assert from "node:assert/strict";
import { isFatigued } from "../src/domain/fatigue.js";

test("not fatigued with no history", () => {
  assert.equal(isFatigued([], "Olá"), false);
});

test("fatigued when the same outgoing_rule text was sent recently", () => {
  const history = [{ type: "outgoing_rule", text: "Olá", at: new Date().toISOString() }];
  assert.equal(isFatigued(history, "Olá"), true);
});

test("not fatigued when the text differs", () => {
  const history = [{ type: "outgoing_rule", text: "Outra mensagem", at: new Date().toISOString() }];
  assert.equal(isFatigued(history, "Olá"), false);
});

test("not fatigued once the window has passed", () => {
  const now = Date.now();
  const history = [{ type: "outgoing_rule", text: "Olá", at: new Date(now - 25 * 60 * 60 * 1000).toISOString() }];
  assert.equal(isFatigued(history, "Olá", { now: () => now }), false);
});

test("ignores comment/message/outgoing events, only counts outgoing_rule", () => {
  const history = [{ type: "comment", text: "Olá", at: new Date().toISOString() }, { type: "outgoing", text: "Olá", at: new Date().toISOString() }];
  assert.equal(isFatigued(history, "Olá"), false);
});
