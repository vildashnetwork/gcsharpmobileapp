# GC Sharp Cameroon Mobile Money Payments

This document is the implementation specification for selling offline access
and AI token bundles to GC Sharp users through Cameroon MTN Mobile Money and
Orange Money.

> **Status:** Payment checkout is not implemented in this repository. The
> current app links to `https://gcsharp.com/pay`; the backend only reads
> offline-access and AI-token balances. This repository has no web-dashboard
> source code. Do not tell users that a payment has been accepted until a
> payment provider has confirmed it and the backend has granted the product.

## 1. Recommended payment experience

Use a payment gateway/aggregator that has an active merchant agreement for
**both MTN Mobile Money Cameroon and Orange Money Cameroon**, accepts **XAF**,
and supports server-to-server payment verification and signed webhooks.
Configure its hosted checkout so the user chooses the operator and authorizes
the payment on their phone. If the selected gateway uses a push payment rather
than a hosted checkout page, show the gateway's pending instructions and wait
for server confirmation.

The payment gateway is not selected by this repository. Before implementation,
the business owner must choose and open a production merchant account with a
gateway that supports the two requested operators. Confirm its Cameroon/XAF
availability, settlement account, fees, refunds, webhook signature scheme,
and production onboarding requirements directly with that gateway. Keep the
gateway behind a backend adapter so it can be changed without changing the
web checkout or entitlement logic.

### User flow

1. The user signs in to the GC Sharp website and opens **Offline access** or
   **Buy AI tokens**.
2. The website loads enabled products and prices from the backend. It shows
   the price in XAF, the product, duration or token quantity, and any fees
   before the user commits.
3. The user selects a product, chooses **MTN Mobile Money** or **Orange
   Money**, and enters a Cameroon phone number (`+237...`) if the gateway
   requires it.
4. The website asks the backend to create a checkout for the selected product.
   The website sends a product ID, not an amount. The backend loads the
   authoritative amount and currency from its plan catalogue and creates a
   pending order.
5. The backend creates a hosted checkout/payment request with the gateway and
   returns the hosted checkout URL (or a provider-specific pending response).
   The website redirects the user to the gateway and displays a waiting state.
6. The user approves the payment through the chosen operator's normal process.
   A browser redirect back to the website is only a user-experience signal; it
   is **not proof of payment**.
7. The gateway calls the backend webhook. The backend verifies the webhook
   signature and, where supported, fetches the transaction from the gateway's
   server API. It verifies the provider reference, order reference, amount,
   currency, and successful final status.
8. The backend atomically marks the order paid and grants its product exactly
   once. The website polls the authenticated order-status endpoint until it
   receives `paid`, then refreshes the user's access/token balance.
9. If the user closes the browser before the callback arrives, the order
   remains pending until a verified webhook or server-side reconciliation
   changes its status. Never grant a product because the browser reached a
   "success" URL.

### Product rules proposed for launch

- **Offline access:** sell a prepaid 30-day extension, not automatic recurring
  billing. Start the new period at the later of the current paid-through date
  and the successful payment time. This avoids silently initiating recurring
  charges. A payment must extend
  `users.offline_access_until`, which the existing app already reads.
- **AI tokens:** sell fixed token bundles. On verified payment, add the
  purchased quantity to `users.ai_tokens_remaining`; do not reset
  `ai_tokens_used`.
- **Currency:** XAF, stored as an integer amount in the currency's smallest
  applicable unit (for XAF, use whole francs; do not use floating point).
- **Prices:** not supplied yet. Keep them in the backend plan catalogue and do
  not enable a product until its real XAF price and terms have been configured.
- **Refunds/chargebacks:** process via the gateway and support workflow.
  Record a refund and revoke unused entitlement/tokens only under an explicit
  policy; do not delete the original transaction or ledger entry.

If the business requires auto-renewing subscriptions instead, decide that
separately and implement explicit consent, renewal notices, cancellation, and
provider recurring-payment support before enabling it.

## 2. Current repository behavior

- Authenticated `GET /api/offline/access` reports the existing offline
  entitlement. The paid-through field is `users.offline_access_until`.
- `POST /api/offline/papers/{paper_id}/download` enforces offline entitlement
  and the daily paper-download limit.
- Authenticated `GET /api/ai/tokens` reports `remaining` and `used`.
- AI requests atomically decrement `users.ai_tokens_remaining`.
- New accounts currently receive 100 initial AI credits.
- The mobile client currently links to `https://gcsharp.com/pay`; it does not
  verify payment or grant either product.

These read/enforcement APIs can remain in place. Add payment endpoints without
letting a browser or mobile client write `offline_access_until` or
`ai_tokens_remaining` directly.

## 3. MongoDB collections and document schemas

Use the existing MongoDB database configured by the backend. The collection
names below are proposed. Create indexes during backend startup and make
payment application idempotent.

### `payment_plans`

One document per sellable product. Only admins/backend configuration can
change prices or enable products.

```json
{
  "_id": "offline_30d",
  "product_type": "offline_access",
  "name": "30-day offline access",
  "description": "Download and read supported papers offline for 30 days.",
  "amount": null,
  "currency": "XAF",
  "duration_days": 30,
  "token_quantity": null,
  "enabled": false,
  "created_at": "2026-11-04T00:00:00Z",
  "updated_at": "2026-11-04T00:00:00Z"
}
```

An AI bundle uses the same schema with `_id` such as `ai_tokens_100`,
`product_type: "ai_tokens"`, `token_quantity: 100`, and `duration_days: null`.
`amount` is intentionally `null` above because the owner has not supplied real
prices. Before exposing a plan for sale, set `amount` to its real whole-XAF
price and set `enabled` to `true`. Disabled or unpriced plans must never be
checkout candidates. The `5000` amounts in the order/API examples below are
illustrative schema examples only, not proposed GC Sharp prices.

Fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `_id` | string | Stable product ID sent by the web client. |
| `product_type` | enum | `offline_access` or `ai_tokens`. |
| `name`, `description` | string | User-facing product details. |
| `amount` | positive integer or null | Price in whole XAF francs; null means not configured. |
| `currency` | string | `XAF` for this launch. |
| `duration_days` | positive integer or null | Required for offline access. |
| `token_quantity` | positive integer or null | Required for AI-token plans. |
| `enabled` | boolean | Only enabled, priced products can be purchased. |
| `created_at`, `updated_at` | ISO-8601 UTC | Audit timestamps. |

### `payment_orders`

The backend creates one order per checkout attempt. The immutable product
snapshot means later price changes do not rewrite the terms of an existing
checkout.

```json
{
  "_id": "server-generated-uuid",
  "user_id": "gcsharp-user-id",
  "product_id": "offline_30d",
  "product_type": "offline_access",
  "product_snapshot": {
    "name": "30-day offline access",
    "amount": 5000,
    "currency": "XAF",
    "duration_days": 30,
    "token_quantity": null
  },
  "provider": "configured_gateway",
  "payment_method": "mtn_momo",
  "phone_e164": "+237600000000",
  "status": "pending",
  "provider_reference": "provider-reference",
  "checkout_url": "https://gateway.example/hosted-checkout",
  "idempotency_key": "client-generated-unique-key",
  "created_at": "2026-11-04T08:00:00Z",
  "updated_at": "2026-11-04T08:00:00Z",
  "paid_at": null,
  "applied_at": null,
  "failure_code": null,
  "failure_message": null
}
```

Allowed `payment_method` values: `mtn_momo`, `orange_money`. Only store the
phone number if the selected gateway requires it and the privacy policy permits
it. Never store Mobile Money PINs, OTPs, card numbers, or other payment
credentials.

Allowed order statuses:

- `pending`: created and awaiting operator/provider completion.
- `processing`: provider reports the payment is in progress.
- `paid`: payment independently verified and entitlement applied.
- `failed`: provider confirms final failure.
- `cancelled`: user/provider confirms cancellation.
- `expired`: checkout expired before payment.
- `refunded`: a verified refund was processed.

Indexes:

- Unique `{ idempotency_key: 1 }` per account (or unique compound
  `{ user_id: 1, idempotency_key: 1 }`).
- Unique sparse `{ provider_reference: 1 }`.
- `{ user_id: 1, created_at: -1 }` for purchase history.
- `{ status: 1, updated_at: 1 }` for pending-order reconciliation.

### `payment_webhook_events`

Persist callback processing to support retries and audit. Store only the
minimum provider payload needed; redact personal/payment credentials.

```json
{
  "_id": "provider-event-id",
  "provider": "configured_gateway",
  "provider_reference": "provider-reference",
  "order_id": "server-generated-uuid",
  "event_type": "payment.success",
  "signature_valid": true,
  "verification_status": "verified",
  "received_at": "2026-11-04T08:02:00Z",
  "processed_at": "2026-11-04T08:02:01Z",
  "processing_error": null
}
```

Create a unique index on `{ provider: 1, _id: 1 }`. Do not trust webhook fields
until the signature is verified. For payment providers without stable event
IDs, derive an idempotency key from the provider transaction reference and
event type.

### `entitlement_ledger`

Append-only record of each verified product grant and later adjustment.

```json
{
  "_id": "server-generated-uuid",
  "user_id": "gcsharp-user-id",
  "order_id": "server-generated-uuid",
  "product_type": "offline_access",
  "action": "grant",
  "amount": 5000,
  "currency": "XAF",
  "duration_days": 30,
  "token_quantity": null,
  "starts_at": "2026-11-04T08:02:01Z",
  "expires_at": "2026-12-04T08:02:01Z",
  "created_at": "2026-11-04T08:02:01Z"
}
```

For tokens, store `product_type: "ai_tokens"`, `token_quantity`, and null
duration/expiry as appropriate. Create a unique index on `{ order_id: 1,
action: 1 }` so a retried webhook cannot grant twice.

### Existing `users` fields to update

Offline entitlement is stored on the matching account:

```json
{
  "offline_access_until": "2026-12-04T08:02:01+00:00"
}
```

AI credits use the existing fields:

```json
{
  "ai_tokens_remaining": 200,
  "ai_tokens_used": 0
}
```

For a token order, increment `ai_tokens_remaining` atomically by the plan's
`token_quantity`; do not set it to the purchased amount. The current initial
100-credit grant is independent of purchases.

## 4. Backend API contract

All paths below are under `/api`. The repository does not implement these
payment endpoints yet.

### List sellable plans

```http
GET /api/payments/plans
Authorization: Bearer <user-token>
```

Example:

```json
{
  "plans": [
    {
      "id": "offline_30d",
      "product_type": "offline_access",
      "name": "30-day offline access",
      "description": "Download and read supported papers offline for 30 days.",
      "amount": 5000,
      "currency": "XAF",
      "duration_days": 30,
      "token_quantity": null,
      "enabled": true
    }
  ]
}
```

Never return disabled or unpriced plans as purchasable.

### Create checkout order

```http
POST /api/payments/checkout
Authorization: Bearer <user-token>
Idempotency-Key: <unique-request-id>
Content-Type: application/json
```

Request:

```json
{
  "product_id": "offline_30d",
  "payment_method": "mtn_momo",
  "phone_number": "+237600000000",
  "return_url": "https://gcsharp.com/payments/return"
}
```

The amount and currency are deliberately absent. The backend must read them
from `payment_plans`, validate the product and operator, normalize the phone
number, create the pending order, then initialize the gateway checkout using
server credentials.

Response:

```json
{
  "order_id": "server-generated-uuid",
  "status": "pending",
  "checkout_url": "https://gateway.example/hosted-checkout",
  "amount": 5000,
  "currency": "XAF"
}
```

### Get order status

```http
GET /api/payments/orders/{order_id}
Authorization: Bearer <user-token>
```

Only the owning user or an authorized admin may read the order. The response
contains `order_id`, `status`, product summary, amount/currency, timestamps, and
a safe user-facing failure reason. Never return gateway secrets or raw
unredacted provider payloads.

### Provider webhook

```http
POST /api/payments/webhooks/{provider}
```

The webhook is not authenticated with the user's bearer token. Authenticate
the gateway using its documented signature/secret scheme, verify the signature
against the exact raw request body, then verify the transaction with the
gateway's server API if available. Return a successful acknowledgement only
after safely recording the event. Make duplicate deliveries harmless.

### Admin plan management

Provide a protected admin-only interface or deployment configuration for
creating/editing plans. Do not let an ordinary website user edit price,
currency, token quantity, or duration. Record who changed a plan and when.

## 5. Payment verification and entitlement algorithm

For every success callback or status reconciliation:

1. Find the order by its server-created ID/provider reference; do not look up
   an order using an amount supplied by the browser.
2. Validate the callback signature and query the provider server-to-server when
   supported.
3. Require provider status to be a final successful state and compare the
   transaction's provider reference, merchant/account, amount, and currency
   exactly with the stored order snapshot.
4. Reject or flag mismatches for manual review. Do not grant the product.
5. In a MongoDB transaction when deployed on a transaction-capable replica
   set, atomically claim the order as paid, insert the unique entitlement
   ledger entry, and apply the user balance/expiry update. If transactions are
   unavailable, implement an explicit idempotent state machine with a unique
   ledger/order constraint and recovery for partial failures.
6. For offline access, set the new expiry to
   `max(existing offline_access_until, verified payment time) + duration_days`.
7. For AI tokens, atomically increment `ai_tokens_remaining` by the snapshot's
   `token_quantity`.
8. A repeated webhook, status poll, or provider retry must return the already
   applied order and must not extend access or add tokens a second time.
9. Record failure/refund/chargeback states without deleting the original
   order or ledger record.

Never store or log secret keys, Mobile Money PINs, OTPs, or full payment
credentials. Redact phone numbers from routine logs.

## 6. Web checkout integration steps

The web dashboard/payment site is not included in this repository. Integrate
these steps in the website that serves `https://gcsharp.com/pay`:

1. **Authentication:** use the existing GC Sharp login and obtain the same
   bearer token used by the mobile app. The backend must determine the account
   from this token; never accept a browser-supplied `user_id`.
2. **Plan list:** call `GET /api/payments/plans` when opening the purchase
   page. Render the returned XAF price, product details, duration/token count,
   and operator options. Do not put secret gateway keys or authoritative
   prices in frontend environment variables or JavaScript bundles.
3. **Product selection:** let the user choose offline access or an AI token
   bundle, then select MTN or Orange. Explain that an operator confirmation
   may be required on the registered phone.
4. **Create order:** generate a fresh UUID idempotency key per intentional
   checkout attempt and call `POST /api/payments/checkout` with the product ID,
   selected operator, required phone number, and an allow-listed return URL.
   Disable duplicate submit while the request is in progress.
5. **Redirect:** navigate to the returned `checkout_url`. Do not construct
   payment URLs in the browser or send `amount`/`currency` as authoritative
   fields.
6. **Return page:** show "Verifying payment" and poll
   `GET /api/payments/orders/{order_id}` with backoff. Show success only when
   the backend says `paid`; show pending instructions while the provider has
   not confirmed; show retry/support guidance for final failures.
7. **Refresh product:** after verified `paid`, refresh `/api/offline/access`
   for offline access or `/api/ai/tokens` for token balance, then show the
   resulting expiry/balance.
8. **Purchase history:** show the user's own order status/history using an
   authenticated backend endpoint; do not expose another user's order IDs.
9. **Test:** test MTN and Orange in the gateway sandbox, success, decline,
   cancellation, delayed callback, duplicate webhook, invalid signature,
   amount/currency mismatch, browser close, network loss, and refunded payment.
10. **Go live:** set production secrets only in backend deployment settings,
    configure the production webhook URL, verify the gateway settlement
    account, configure real XAF plan prices, then enable the plans.

### Minimal web pseudocode

```js
const plansResponse = await api("/payments/plans");
// Display only backend-returned plans and prices.

const checkout = await api("/payments/checkout", {
  method: "POST",
  headers: {
    "Idempotency-Key": crypto.randomUUID(),
  },
  body: {
    product_id: selectedPlan.id,
    payment_method: selectedOperator, // "mtn_momo" or "orange_money"
    phone_number: phoneNumber,
    return_url: `${window.location.origin}/payments/return`,
  },
});

window.location.assign(checkout.checkout_url);
```

The website's `api` helper must add the user's bearer token and send JSON.
Follow the actual gateway's required hosted-checkout behavior once the merchant
account and provider are selected.

## 7. Backend deployment configuration

Use backend-only environment variables. Exact names depend on the selected
gateway adapter; use names like these and set them in the backend host's secret
manager:

```dotenv
PAYMENT_PROVIDER=<selected_gateway>
PAYMENT_SECRET_KEY=<production_secret>
PAYMENT_PUBLIC_KEY=<public_key_if_gateway_requires_it>
PAYMENT_WEBHOOK_SECRET=<webhook_signing_secret>
PAYMENT_CALLBACK_URL=https://mobile.gcsharp.com/api/payments/webhooks/<provider>
PAYMENT_RETURN_URL=https://gcsharp.com/payments/return
```

Do not commit real values, add secrets to `frontend/.env`, or expose secret
keys to the browser. Confirm gateway callback reachability and signatures in
production before enabling paid plans. Use separate sandbox credentials and
test products before live transactions.

## 8. Required decisions before coding/live launch

- Select the gateway/aggregator and confirm it supports both requested
  Cameroon operators and XAF for the GC Sharp merchant account.
- Supply actual XAF prices for each offline plan and AI-token bundle.
- Confirm offline access is a one-time 30-day extension (recommended here) or
  explicitly choose recurring billing.
- Choose refund, cancellation, dispute, receipt, and customer-support policies.
- Provide the web-dashboard/payment-site repository if you want its checkout
  pages implemented directly; it is not present in this workspace.

Until these are supplied and the gateway integration is built and deployed,
the existing `https://gcsharp.com/pay` page remains the payment destination and
the current account fields must only be changed by trusted existing server
logic/support—not from a browser success redirect.
