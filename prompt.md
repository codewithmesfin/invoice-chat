You are a senior AI engineer specializing in production-grade agent systems.

Upgrade the existing MVP into an ADVANCED AI AGENT with:
- Multi-step reasoning (planner + executor)
- Persistent memory (short-term + long-term)
- Embeddings + retrieval (RAG)
- Tool-augmented decision making

Keep everything FULLY FUNCTIONAL and runnable.

---

## TECH STACK (STRICT)

- Next.js (App Router)
- TypeScript
- Tailwind + shadcn/ui
- Supabase (Postgres, Auth, Storage)
- OpenRouter (FREE models only)
- Use Supabase pgvector for embeddings

---

## HIGH-LEVEL ARCHITECTURE

Split the agent into 4 layers:

1. Planner (LLM)
2. Tool Executor (functions)
3. Memory System
4. Response Generator

---

## AGENT FLOW (MANDATORY)

1. User sends message
2. Retrieve relevant memory (RAG)
3. Planner LLM creates a multi-step plan
4. Execute steps one by one:
   - Tool calls
   - DB queries
5. Store results in short-term memory
6. Generate final answer using:
   - user input
   - tool outputs
   - retrieved memory

---

## MULTI-STEP REASONING

Implement a "plan + act" loop.

### Planner Output Format (STRICT JSON)

{
  "goal": "...",
  "steps": [
    {
      "id": "step_1",
      "action": "tool_name | reasoning | query",
      "input": {}
    }
  ]
}

---

## MEMORY SYSTEM

### 1. Short-Term Memory
- Stored per chat session
- Last N messages + tool results
- Stored in DB (chat_messages)

---

### 2. Long-Term Memory (IMPORTANT)

Store:
- Important user facts
- Financial patterns
- Frequent customers

Create table:
- memories
  - id
  - user_id
  - content
  - embedding (vector)
  - type (fact, preference, financial, etc.)
  - created_at

---

## EMBEDDINGS + RAG

Use:
- OpenRouter embedding model (free)

### Pipeline:
1. Embed:
   - messages
   - invoices
   - customers
   - memories

2. Store in Supabase pgvector

3. On each query:
   - embed user query
   - similarity search:
     - memories
     - invoices
     - customers

4. Inject top results into planner context

---

## TOOL SYSTEM (EXTEND EXISTING)

Each tool must:
- Return structured JSON
- Be usable in multi-step plans

Add:

### Intelligent Tools
- find_customer_by_name
- find_invoice_by_status
- summarize_finances
- detect_overdue_invoices

---

## MEMORY WRITING LOGIC

After each conversation:

Run a "Memory Extractor LLM":

Extract:
- preferences ("user prefers weekly reports")
- recurring entities ("John is frequent client")
- insights

Store them with embeddings.

---

## CHAT EXPERIENCE (AGENTIC UI)

Enhance UI:

1. Show plan steps:
   - "Step 1: Find customer"
   - "Step 2: Create invoice"

2. Show execution progress:
   - loading states per step

3. Expandable reasoning panel (optional)

---

## API DESIGN

### /api/chat

Flow:

- Retrieve memory (vector search)
- Call planner
- Execute steps loop
- Call final response LLM
- Store messages
- Store memory

---

## DATABASE (EXTEND)

Add:

- memories (vector)
- embeddings for:
  - invoices
  - customers

---

## EMBEDDING FUNCTIONS

Create utilities:

- embedText(text)
- similaritySearch(table, vector)

---

## PROMPT ENGINEERING

### Planner Prompt

Must:
- think step-by-step
- choose tools when needed
- avoid hallucination

---

### Final Response Prompt

Must:
- be natural
- reference tool results
- show structured UI when needed

---

## PERFORMANCE RULES

- Limit steps to max 5
- Cache embeddings when possible
- Avoid unnecessary tool calls

---

## MVP EXAMPLES

User:
"Which clients owe me money?"

Agent:
1. Plan:
   - find unpaid invoices
   - map to customers

2. Execute
3. Respond with list

---

User:
"Create invoice for John like last time"

Agent:
1. Retrieve past invoice (RAG)
2. Reuse pattern
3. Create new invoice

---

## DELIVERABLES

1. Updated Next.js codebase
2. Agent engine (planner + executor)
3. Memory system (short + long)
4. Embedding + vector search
5. Updated UI with agent steps

---

## IMPORTANT

- Must be runnable
- No pseudo code
- No skipped logic
- Everything minimally implemented but real

This should feel like a real AI agent product (not demo code).