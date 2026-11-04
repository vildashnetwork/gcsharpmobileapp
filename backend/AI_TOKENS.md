# GC AI token balance

GC AI tokens are per-account usage credits, not model-generated token counts.
Each billable AI request costs one credit regardless of response length or
which configured model/provider handles it.

## MongoDB fields

| Field | Type | Meaning |
| --- | --- | --- |
| `ai_tokens_remaining` | integer | Credits available for AI requests. |
| `ai_tokens_used` | integer | Credits consumed by the account. |

Accounts without these fields receive a one-time initial grant of 100 credits.
The backend initializes legacy accounts on first balance lookup or AI use.
Initialization is conditional on `ai_tokens_remaining` being absent, so later
requests do not restore already-spent credits.

## Charging and enforcement

The authenticated `GET /api/ai/tokens` endpoint returns `remaining` and `used`.
The backend atomically decrements `ai_tokens_remaining` and increments
`ai_tokens_used` before starting a billable operation. If the balance is zero,
the request is rejected with HTTP 402 and the message:

> AI tokens exhausted. Visit gcsharp.com/pay to add tokens and continue using GC AI.

One credit is charged per request for:

- AI chat, explanations, solutions, speech generation, transcription, and
  knowledge-base search.
- AI question generation and the math-solver endpoint.
- On-demand paper question answers (`/papers/ask`), generated paper Q&A,
  highlight, text-to-video, and PDF-to-video lessons.
- Learning-feed post creation, question edits that regenerate the answer, and
  answer retries.
- Study-group `@ai` answers, including HTTP and WebSocket triggers.

Cached AI results and requests that later fail at a model/provider still cost
one credit. Invalid requests rejected before AI work begins do not. Static
past-question answer checks, profile/balance reads, and operational background
knowledge-base/training jobs do not charge a student's balance.

All enforcement is server-side; hiding or disabling a frontend control is not
an authorization boundary. The Profile screen displays the balance and links
to `https://gcsharp.com/pay`. Visiting that page does not itself add credits:
any future top-up must be confirmed by a trusted server-side payment flow
before MongoDB balances are increased.
