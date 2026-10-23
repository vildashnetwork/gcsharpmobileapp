# GC Sharp offline access

## Account access fields

| MongoDB field | Type | Purpose |
| --- | --- | --- |
| `offline_trial_started_at` | ISO-8601 UTC string | Start of the account's free trial. |
| `offline_trial_expires_at` | ISO-8601 UTC string | End of the seven-day free trial. |
| `offline_access_until` | ISO-8601 UTC string | Paid-through date written by `gcsharp.com/pay`. |

Existing users receive one seven-day trial when this feature is first deployed.
The startup migration only fills in a missing `offline_trial_expires_at`, so a
restart never resets an existing account's trial. New accounts receive the
same seven-day trial at registration, including password, PIN, phone, and
OAuth registration paths.

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
