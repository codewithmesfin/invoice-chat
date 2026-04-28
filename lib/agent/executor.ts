import { isToolName, type Plan, type StepExecution } from "@/lib/agent/types";
import { runTool, type ToolContext } from "@/lib/agent/tools";

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
        exec.output = await runTool(step.action, step.input ?? {}, ctx);
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
