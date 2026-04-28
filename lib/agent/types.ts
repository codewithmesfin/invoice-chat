import { z } from "zod";

export const TOOL_NAMES = [
  "find_customer_by_name",
  "find_invoice_by_status",
  "summarize_finances",
  "detect_overdue_invoices",
  "create_invoice",
  "create_customer",
  "create_expense",
  "list_expenses",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const PlanStepSchema = z.object({
  id: z.string(),
  action: z.string(),
  input: z.record(z.string(), z.unknown()).default({}),
});

export const PlanSchema = z.object({
  goal: z.string(),
  steps: z.array(PlanStepSchema).transform((steps) => steps.slice(0, 5)),
});

export type Plan = z.infer<typeof PlanSchema>;
export type PlanStep = z.infer<typeof PlanStepSchema>;

export type StepExecution = {
  stepId: string;
  action: string;
  status: "pending" | "running" | "done" | "error";
  output?: unknown;
  error?: string;
};

export function isToolName(action: string): action is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(action);
}
