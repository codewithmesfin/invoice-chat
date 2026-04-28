import { isToolName, type Plan, type StepExecution } from "@/lib/agent/types";
import { runTool, type ToolContext } from "@/lib/agent/tools";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Most recent find_customer_by_name in this plan with exactly one match (for create_invoice repair). */
function lastSingletonFindCustomerId(prior: StepExecution[]): string | null {
  for (let i = prior.length - 1; i >= 0; i--) {
    const s = prior[i];
    if (s.action !== "find_customer_by_name" || s.status !== "done" || s.output == null) continue;
    const out = s.output as { customers?: unknown };
    const arr = out.customers;
    if (!Array.isArray(arr) || arr.length !== 1) continue;
    const row = arr[0];
    if (!row || typeof row !== "object") continue;
    const id = (row as { id?: unknown }).id;
    if (typeof id === "string" && UUID_RE.test(id.trim())) return id.trim();
  }
  return null;
}

async function customerIdExistsForUser(ctx: ToolContext, id: string): Promise<boolean> {
  const { data, error } = await ctx.supabase
    .from("customers")
    .select("id")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

/** When the model invents a UUID, reuse the single client from an earlier find in the same plan. */
async function mergeCreateInvoiceCustomerFromFind(
  ctx: ToolContext,
  input: Record<string, unknown>,
  prior: StepExecution[]
): Promise<Record<string, unknown>> {
  const fallbackId = lastSingletonFindCustomerId(prior);
  if (!fallbackId) return input;

  const raw = input.customer_id;
  const cid = typeof raw === "string" ? raw.trim() : "";
  if (cid && UUID_RE.test(cid) && (await customerIdExistsForUser(ctx, cid))) {
    return input;
  }
  return { ...input, customer_id: fallbackId };
}

export async function executePlan(
  plan: Plan,
  ctx: ToolContext
): Promise<StepExecution[]> {
  const results: StepExecution[] = [];

  for (const step of plan.steps) {
    const exec: StepExecution = {
      stepId: step.id,
      action: step.action,
      status: "running",
    };
    results.push(exec);

    try {
      if (step.action === "reasoning" || step.action === "query") {
        exec.status = "done";
        exec.output = { note: (step.input as { note?: string }).note ?? "" };
        continue;
      }

      if (isToolName(step.action)) {
        let toolInput: Record<string, unknown> = (step.input ?? {}) as Record<string, unknown>;
        if (step.action === "create_invoice") {
          toolInput = await mergeCreateInvoiceCustomerFromFind(ctx, toolInput, results);
        }
        exec.output = await runTool(step.action, toolInput, ctx);
        exec.status = "done";
        continue;
      }

      exec.status = "error";
      exec.error = `Unknown action: ${step.action}`;
    } catch (e) {
      exec.status = "error";
      exec.error = e instanceof Error ? e.message : String(e);
    }
  }

  return results;
}

export function formatToolTrace(
  plan: Plan,
  steps: StepExecution[]
): string {
  const lines: string[] = [];
  lines.push(`Goal: ${plan.goal}`);
  for (const s of steps) {
    lines.push(
      `- ${s.stepId} [${s.action}] ${s.status}` +
        (s.error ? ` error=${s.error}` : "") +
        (s.output !== undefined ? `\n  ${JSON.stringify(s.output).slice(0, 8000)}` : "")
    );
  }
  return lines.join("\n");
}
