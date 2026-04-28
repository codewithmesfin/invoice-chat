import { PlanSchema, type Plan } from "@/lib/agent/types";
import { plannerSystemPrompt, plannerUserPayload } from "@/lib/agent/prompts";
import { chatComplete } from "@/lib/openrouter/chat";

function extractJsonObject(text: string): string {
  const t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  if (fence?.[1]) return fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) return t.slice(start, end + 1);
  return t;
}

export async function runPlanner(input: {
  userMessage: string;
  ragContext: string;
  shortTermSummary: string;
}): Promise<Plan> {
  const messages = [
    { role: "system" as const, content: plannerSystemPrompt() },
    {
      role: "user" as const,
      content: plannerUserPayload(input),
    },
  ];

  let raw: string;
  try {
    raw = await chatComplete(messages, {
      jsonMode: true,
      temperature: 0.1,
      maxTokens: 1200,
    });
  } catch {
    raw = await chatComplete(messages, {
      jsonMode: false,
      temperature: 0.1,
      maxTokens: 1200,
    });
  }

  try {
    const json = extractJsonObject(raw);
    const parsed = PlanSchema.safeParse(JSON.parse(json));
    if (parsed.success) return parsed.data;
  } catch {
    /* fall through */
  }

  return {
    goal: input.userMessage,
    steps: [
      {
        id: "step_1",
        action: "reasoning",
        input: {
          note: "Planner JSON invalid; falling back to direct answer path.",
        },
      },
    ],
  };
}
