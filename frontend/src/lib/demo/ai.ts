// Demo "assistant": fixed rules, no model is called. Real answers come from POST /api/ai/.
import type { AiResult, Diagram, DiagramNode } from "../types";
import { validate } from "./engine";

const NOTE = "Demo assistant: canned analysis, no AI model is called yet.";
const labelOf = (n: DiagramNode) => n.label || n.type;

export function explain(d: Diagram, question: string): string {
  const tables = d.nodes.filter((n) => n.type === "entity");
  const events = d.nodes.filter((n) => n.type === "event");
  const actions = d.nodes.filter((n) => !["entity", "actor", "event", "condition", "provider"].includes(n.type));
  const issues = validate(d);
  const errors = issues.filter((i) => i.level === "error").length;

  const lines = [
    `“${d.name}” has ${tables.length} table(s) (${tables.map(labelOf).join(", ") || "none"}), ${events.length} event(s) and ${actions.length} action block(s).`,
    ...events.map((e) => {
      const next = d.edges.filter((x) => x.source === e.id).length;
      return `• When “${labelOf(e)}” happens, ${next ? `${next} path(s) start` : "nothing runs yet"}.`;
    }),
    errors
      ? `There ${errors === 1 ? "is 1 error" : `are ${errors} errors`} to fix before you can generate code. Open the Checks tab.`
      : "No errors, so it is ready to generate.",
  ];
  if (question.trim()) lines.push("", `You asked: “${question.trim()}”. ${NOTE}`);
  else lines.push("", NOTE);
  return lines.join("\n");
}

export function suggest(d: Diagram, question: string): AiResult {
  const next = structuredClone(d);
  const id = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;
  let summary = "";

  const charge = next.nodes.find((n) => n.type === "charge_payment");
  const lopsided = next.nodes.find((n) => {
    if (n.type !== "condition") return false;
    const handles = new Set(next.edges.filter((e) => e.source === n.id).map((e) => e.source_handle));
    return handles.has("true") !== handles.has("false");
  });
  const wantsPayment = /fail|payment|declin/i.test(question);

  if (charge && (wantsPayment || !lopsided) && !next.edges.some((e) => e.source === charge.id && next.nodes.find((n) => n.id === e.target)?.type === "condition")) {
    const check = id("condition");
    const failed = id("update_status");
    next.nodes.push(
      { id: check, type: "condition", label: "Payment went through?", position: { x: charge.position.x + 290, y: charge.position.y + 120 }, config: { field: "payment_status", operator: "eq", value: "paid" } },
      { id: failed, type: "update_status", label: "Payment failed", position: { x: charge.position.x + 580, y: charge.position.y + 200 }, config: { status: "payment_failed" } },
    );
    next.edges.push(
      { id: id("e"), source: charge.id, target: check, source_handle: null },
      { id: id("e"), source: check, target: failed, source_handle: "false" },
    );
    summary = "Added a check after the payment, with a “payment failed” status when it doesn’t go through.";
  } else if (lopsided) {
    const handles = new Set(next.edges.filter((e) => e.source === lopsided.id).map((e) => e.source_handle));
    const missing = handles.has("true") ? "false" : "true";
    const fallback = id("update_status");
    next.nodes.push({ id: fallback, type: "update_status", label: "Needs review", position: { x: lopsided.position.x + 290, y: lopsided.position.y + (missing === "false" ? 110 : -110) }, config: { status: "needs_review" } });
    next.edges.push({ id: id("e"), source: lopsided.id, target: fallback, source_handle: missing });
    summary = `“${labelOf(lopsided)}” had no ${missing === "true" ? "yes" : "no"} path. Added one that marks the record for review.`;
  } else {
    return { mode: "suggest", summary: `Nothing obvious to add. ${NOTE}`, issues_after: validate(d) };
  }

  const issues_after = validate(next);
  // Like the real backend: never propose something that adds errors.
  const before = validate(d).filter((i) => i.level === "error").length;
  if (issues_after.filter((i) => i.level === "error").length > before) {
    return { mode: "suggest", summary: `I couldn’t find a safe change to suggest. ${NOTE}`, issues_after: validate(d) };
  }
  return { mode: "suggest", summary: `${summary} ${NOTE}`, proposed_diagram: next, issues_after };
}

export const explainResult = (d: Diagram, question: string): AiResult => ({ mode: "explain", text: explain(d, question) });
