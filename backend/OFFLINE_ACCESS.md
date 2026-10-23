# GC Sharp offline access

## Account access fields

| MongoDB field | Type | Purpose |
| --- | --- | --- |
| `offline_trial_started_at` | ISO-8601 UTC string | Start of the account's free trial. |
| `offline_trial_expires_at` | ISO-8601 UTC string | End of the seven-day free trial. |
| `offline_access_until` | ISO-8601 UTC string | Paid-through date written by `gcsharp.com/pay`. |
| `offline_manual_grant_id` | string | Prevents a support grant from being applied more than once. |
| `offline_manual_grant_started_at` | ISO-8601 UTC string | Start of a one-time support grant. |
| `offline_manual_grant_expires_at` | ISO-8601 UTC string | End of a one-time support grant. |

Existing users receive one seven-day trial when this feature is first deployed.
The startup migration only fills in a missing `offline_trial_expires_at`, so a
restart never resets an existing account's trial. New accounts receive the
same seven-day trial at registration, including password, PIN, phone, and
OAuth registration paths.

The configured one-time support grant is applied to the existing account
matching `OFFLINE_MANUAL_GRANT_EMAIL` when the backend starts or that account
makes an authenticated request. Its fixed grant ID makes the grant
idempotent, and it does not overwrite a trial or paid entitlement. The grant
helper never creates an account when the email does not match an existing
user. Offline access uses the latest of the trial expiry, manual grant expiry,
and paid-through date.

The payment portal must update the matching MongoDB user document's
`offline_access_until` field to the subscription's UTC expiry, for example:

```json
{
  "offline_access_until": "2026-08-15T00:00:00+00:00"
}
```

The authenticated `GET /api/offline/access` endpoint reports the later of the
trial expiry and paid-through date. A paid date in the future grants monthly
offline access; no client request can change the paid-through date. Online app
use is not blocked when offline access expires.

## Paper download allowance

`POST /api/offline/papers/{paper_id}/download` authorizes a PDF save. The
endpoint requires active trial or paid access and a paper with a PDF URL. It
counts unique paper IDs per account and UTC calendar day, atomically limiting
users to ten distinct papers per day. Re-downloading the same paper that day
does not consume another slot. The frontend checks authorization before
transferring bytes; the server records the paper before the transfer, so a
failed transfer can be retried without consuming another slot.

Opening an online PDF no longer silently caches it. Users explicitly save
papers from the PDF screen or download manager. The app caches the verified
expiry per account on-device and blocks the app while offline (including when
the user has selected offline-only mode) after that expiry. Reconnecting lets
the app refresh the server entitlement and opens the monthly subscription page
at `https://gcsharp.com/pay`.

Every successful offline paper download is also saved into **My Drafts** on
that device under the signed-in account. The downloaded-paper draft metadata
is stored locally so My Drafts can list the item offline; the backend also
adds it idempotently to the user's synced drafts when reachable. Removing a
draft does not remove its cached PDF bytes.
