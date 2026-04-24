# AI Spec-Driven Development Pipeline (Copilot-Style Agents)

## 🧠 Overview

This project implements a **spec-driven AI development workflow** using:

* GitHub PRs as the control plane
* Comment-based commands (`/research`, `/spec`, etc.)
* Role-based prompts (Copilot-style agents)

The system is:

* Human-in-the-loop
* Artifact-driven (`research.md`, `spec.md`, etc.)
* Modular and extensible

---

## 🏗️ Architecture (MVP)

```
ClickUp → Webhook → Node Server → GitHub PR
                                      ↓
                                PR Comments
                                      ↓
                             Command Router
                                      ↓
                              Role Prompts (LLM)
                                      ↓
                              PR Files + Comments
```

---

## 🔁 Workflow

```
/research → /spec → /plan → /code → /validate
```

Each step:

* Reads previous artifacts
* Produces new artifact
* Awaits human approval or next command

---

## 📂 Project Structure

```
src/
├── server.ts
├── commands/
│   └── router.ts
├── roles/
│   ├── research.ts
│   ├── spec.ts
│   ├── plan.ts
│   ├── code.ts
│   └── validate.ts
├── github/
│   └── pr.ts
├── llm/
│   └── github-models.ts
```

---

## ⚙️ Commands (Copilot-style)

| Command   | Role           | Output         |
| --------- | -------------- | -------------- |
| /research | Research Agent | research.md    |
| /spec     | Spec Agent     | spec.md        |
| /plan     | Planning Agent | plan.md        |
| /code     | Coding Agent   | code changes   |
| /validate | QA Agent       | report comment |

---

## 🧩 Roles (Agents)

### 🔍 Research Agent

**Goal:** Understand task and context

**Output:**

* Context
* Relevant files
* Unknowns
* Assumptions

---

### 🧾 Spec Agent (Core of Spec-Driven)

**Input:** research.md

**Output (spec.md):**

* Feature
* Requirements
* API Contract
* Acceptance Criteria (checkbox list)
* Edge Cases

👉 This is the **single source of truth**

---

### 🧠 Plan Agent

**Input:** spec.md

**Output (plan.md):**

* Goal
* Files to modify
* Steps
* Risks

---

### 💻 Code Agent

**Input:** spec.md + plan.md

**Rules:**

* Follow spec strictly
* Modify only listed files
* No extra features

**Output:**

* Code changes (PR updates)

---

### 🧪 Validate Agent

**Input:** spec.md + code

**Tasks:**

* Generate test cases
* Validate acceptance criteria
* Report gaps

---

## 🔌 Server Behavior

### ClickUp Webhook

Triggers initial research

### GitHub Webhook

Handles PR comments:

* Detect `/command`
* Route to corresponding role

---

## 🧠 Command Router Logic

```ts
if (comment.includes("/research")) → runResearch()
if (comment.includes("/spec")) → runSpec()
if (comment.includes("/plan")) → runPlan()
if (comment.includes("/code")) → runCode()
if (comment.includes("/validate")) → runValidate()
```

---

## 🧪 Example Usage

Inside a PR:

```
/research
```

⬇️ generates research.md

```
/spec
```

⬇️ generates spec.md

```
/plan
```

⬇️ generates plan.md

```
/code
```

⬇️ applies code

```
/validate
```

⬇️ generates QA report

---

## 🔐 Guardrails (MVP)

* Limit file changes to plan scope
* Require human approval between steps
* Keep outputs structured
* Avoid autonomous execution

---

## ⚠️ Known Limitations

* No real diff application (placeholder)
* No repo-wide context (no RAG)
* Stateless beyond PR artifacts
* No test execution yet

---

## 🚀 Next Steps (High Impact)

1. Add repo-aware context (RAG)
2. Implement real file editing (AST or patching)
3. Auto-generate tests from spec
4. Add review agent before human approval
5. Integrate CI validation

---

## 🧠 Key Principles

* Spec is the contract
* Plan is the strategy
* Code is execution
* Validation enforces correctness

---

## 🎯 Final Insight

This system combines:

* Structured pipelines (reliability)
* Copilot-style agents (flexibility)

Result:

👉 A **spec-driven, human-guided AI development lifecycle**

---

## ✅ Status

* MVP-ready
* Minimal infra
* Fully extensible

---

## 💡 Philosophy

> Don’t build autonomous AI developers
> Build systems that make developers dramatically more effective
