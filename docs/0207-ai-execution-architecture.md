---
brief: Direct server-side OpenAI streaming and plans for CPU models in Python and durable background jobs.
tags: [architecture, ai, openai, python, queue, privacy]
---

# Hybrid AI execution: Web, CPU models and OpenAI

## Status and decision

The localized `/chat` workspace saves conversations, messages, response modes
and attachments. Signed-in owners can reopen and rename their conversations.
`POST /api/v1/chat` streams OpenAI Responses API output through the Web backend
and saves completed assistant replies. Instant requests no reasoning effort.
Thinking uses medium effort and displays the provider's optional reasoning
summary while generating the reply. Local model execution remains planned.

Conversation history opens in a right-hand side panel. Administrators manage
the shared system prompt in the **System prompt** tab under `/chat/settings`.
Use Preview to read any saved version in a side panel. Saving creates a
numbered version. Activation switches
the single active version, including when returning to an earlier one. The
chat status dot tracks the availability of conversation storage. Generation
requires an active system prompt and the server-side `OPENAI_API_KEY` and model
IDs `OPENAI_MODEL_INSTANT` and `OPENAI_MODEL_THINKING`. Set them in
`apps/web/.env` for DEV or `infra/local/.env.qa` for QA.

The first chat implementation stores attachment bytes in PostgreSQL with the
message, with a limit of three attachments per message, 2 MiB per attachment,
32 MiB per conversation and 100 messages per conversation. Owner-scoped downloads
keep these attachments separate from the administrator file catalog. The
existing Next.js backend, PostgreSQL queue and Python executor provide the
service boundaries for future AI work.

The selected starting point is CPU-first local execution plus an external LLM
through OpenAI API. Interactive LLM requests originate in the **Next.js backend**.
Small local models run inside the existing Python worker. Long-running and bulk
work uses the existing queue. No vLLM service, GPU requirement, model gateway or
additional inference container is required for this initial scope.

Web means the server-side application boundary here. A browser calls our backend;
the standard provider API key remains server-side. The browser never receives
that key or chooses an unrestricted provider URL/model.

## Execution paths

| Use case | Path | Reason |
| --- | --- | --- |
| Interactive chat or short LLM analysis | Browser → Web backend → OpenAI | Keep request authorization and response streaming in Web |
| Local PII detection or small CPU classification | Web backend → Python worker → Web backend | Local model execution without a cloud dependency |
| Interactive LLM request requiring masking | Web backend → Python PII task → Web policy check → OpenAI | Verify preprocessing before sending approved content externally |
| Large document, scheduled task or many files | Web → queue → Node consumer → required Python/OpenAI steps → persisted result | Durable progress, retries and recovery independent of the browser request |

Sending every OpenAI call through Python is not the selected design. The Python
worker provides local computation; it is not the mandatory LLM proxy. For a
background job, the Node consumer can call the same server-side provider module
used by Web after obtaining any required local preprocessing result.

## Chat stream and response details

`POST /api/v1/chat` accepts a same-origin multipart request from a signed-in
user. Fields are `requestUuid` (UUID v4), `mode` (`instant` or `thinking`),
`content`, optional conversation `uuid` and optional repeated `attachments`.
Web derives the owner from the session and checks ownership for existing
conversations. It sends the active system prompt, conversation context and
supported attachments to OpenAI with `store: false`.

The NDJSON stream sends `saved` for the stored user message, `text` for answer
fragments and optional `summary` fragments for the provider's reasoning summary.
It sends `ping` while waiting and ends with `done` carrying the stored assistant
message or `error` carrying a status code. Completed replies are stored with their
Markdown source. The chat renders GitHub Flavored Markdown during streaming and
when reopening history. It renders the reasoning summary during the current
view and blocks raw HTML and embedded images.

Each saved message shows its timestamp. A live timer shows the user's wait
while the reply is generated. Open **Response details** under a completed reply
to see the requested and returned model, prompt version, reasoning effort,
summary setting, output token limit, provider service tier, response ID and
reported token counts. The latter include input, output, total, cached input,
cache writes and reasoning where supplied. OpenAI includes reasoning tokens
in its reported output count.

Web measures time from the outbound provider request to the first text fragment
and to completion. The first measurement includes provider latency and any
reasoning before the answer. The browser's live timer also includes time spent
sending and preparing the request. [OpenAI latency guide](https://developers.openai.com/api/docs/guides/latency-optimization)

PostgreSQL stores the optional metrics in `chat_message.generation`. Apply
Prisma migration `20261119010000_chat_generation_metrics` with `pnpm db:deploy`
for DEV. Older replies retain their timestamps. The response details fill in
for newly completed replies, and fields omitted by OpenAI show as unavailable.

## Responsibilities

| Owner | Planned responsibility |
| --- | --- |
| Web backend | Session/role/resource authorization, input limits, user quotas, conversation access, permitted model/task selection, streaming and cancellation |
| Shared server-side AI module | Provider client, model aliases/configuration, request timeout, bounded retries, usage/cost metadata, sanitized errors and output validation |
| Python worker | Load approved CPU models, enforce local concurrency/memory limits, run PII/classification/embedding tasks and return bounded structured results |
| Node queue consumer | Claim and settle jobs, orchestrate background steps, own retry policy and persist result/progress through existing storage boundaries |
| PostgreSQL/S3 | Authorized job/result metadata and private input/output artifacts according to the owning application's retention policy |

The shared AI module is a planned code boundary, not an additional service.
Web and the Node consumer receive only the provider credentials required for
their configured tasks. Python does not require an OpenAI key for local CPU
execution. Provider credentials must follow the existing per-process allowlists
and remain outside browser bundles, public env variables, job payloads and logs.

## Local CPU model lifecycle

Load models once at process startup or lazily on first use, then reuse the loaded
instance. Do not download or reload weights for every request. Start with a
bounded registry of approved model aliases, pinned revisions, tokenizer/config
artifacts and compatible locked dependencies. Pre-stage artifacts for offline
local execution and review any custom model-loading code before packaging it.

Bound the number of loaded models, simultaneous requests, input size, CPU threads
and memory use. Multiple Python processes may each hold their own copy of the
weights; increasing process count is not automatically a throughput improvement.
Readiness for a model-backed task must reflect model availability. The existing
worker startup health check alone does not establish that a model is ready.

The example candidate is [PII-Tracer](https://huggingface.co/perplexity-ai/PII-Tracer),
a roughly 600M-parameter token-classification/sensitivity model for PII masking.
Its documented input limit is 4096 tokens. Longer inputs need controlled chunks
and reconstruction of offsets/context; they must not be silently truncated.
CPU suitability, batching and model choice remain subject to measurements on
the deployment hardware and representative Polish/domain data.

Its repository uses [MIT](https://huggingface.co/perplexity-ai/PII-Tracer/blob/main/LICENSE).
Preserve required notices when distributing it and review the licenses of the
runtime, dependencies and any other selected model separately. Model and CPU
runtime versions have not been selected or benchmarked in this repository.

## Cloud and PII boundary

Choose the execution path by task capability and explicit data policy, rather
than by an automatic fallback from local failure to cloud processing.
For a masking-required task, Web or the background orchestrator must verify that
local processing completed for the entire relevant input and that its result
passes the policy before calling OpenAI. A timeout, unavailable model, partial
result or rejected policy must block that external call.

PII detection can miss sensitive content. Masking is a mitigation, not proof of
complete anonymization. Define which document classes, tenants and fields may
leave the deployment, and evaluate detection/false positives on target data.
Keep raw text, prompts, detected secrets and reversible masking maps out of
ordinary telemetry. Stored conversations and attachments use owner-scoped
access. Conversation retention policy remains a separate delivery decision.

Provider data processing and retention must be checked for the selected endpoint
and organization configuration. Do not assume that disabling training means
zero retention. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).

## Reliability and limits

For interactive requests, use a bounded server route with cancellation and an
appropriate streaming response. Check application/proxy timeouts and deployment
request-duration limits. Route work exceeding those limits through the queue
and expose an authorized job status/result instead.

Set explicit provider timeouts, token/output limits, quotas and concurrency.
Coordinate SDK retries with queue retries so their multiplication is bounded.
A retried API call may be billed again; storing a provider request ID is useful
for diagnosis but is not a guarantee of exactly-once execution or charging.
Persist attempt/result metadata and reuse completed application results when
valid for the task's authorization and idempotency rules.

The current Python adapter is diagnostic-only: it posts a job ID/attempt to
`/v1/tasks/check` and validates its checksum response. It is not a general model
API or a text/document transport. Add explicit versioned task contracts, input
and output limits, time budgets and error semantics before integrating a model.
Keep one owner for durable retries: the Node queue consumer.

## Implementation slices and acceptance

1. Interactive Web chat now uses an authorized route with streaming, cancellation,
   bounded requests and safe errors. Deployment-wide quotas remain to be defined.
2. Add an explicit Python task for one approved CPU model, with pinned artifacts,
   bounded resources and model-aware readiness; measure latency, memory and quality.
3. Connect the required PII preprocessing/policy gate and verify that failures
   cannot send unapproved raw input to OpenAI.
4. Add the required durable job types and orchestration for bulk/long work,
   reusing the provider module and preserving Node ownership of queue retries.
5. Measure operating limits before adding more loaded models or replicas.

Acceptance must include access/tenant isolation, provider-key exclusion from
browser and Python env, streaming/cancellation, PII boundary cases, long-input
coverage, local model failure, rate limits/timeouts, retry-cost bounds and result
authorization. CPU performance and model quality require real measurements;
passing mocked provider tests alone does not establish them.

Split a model into a separate inference service later if dependency conflicts,
GPU adoption, independent scaling, resource contention or release isolation
justify it. That future option does not change Web's direct server-side cloud
path or the existing durable queue ownership.

## References

- [OpenAI authentication](https://developers.openai.com/api/reference/overview#authentication)
- [OpenAI response streaming](https://developers.openai.com/api/docs/guides/streaming-responses)
- [Python worker and current contracts](0314-python-worker.md)
- [PostgreSQL queue and retry ownership](0311-postgresql-queue.md)

[Back to architecture](0200-architecture.md)
