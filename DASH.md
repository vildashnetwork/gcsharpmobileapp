# GCSHARP Dashboard and App Update Guide

This guide explains where the dashboard and install/update flows live, what the
app currently does, and how to add a clear amount users can pay for access.
It describes the current implementation separately from proposed payment work;
the prices and payment provider must be confirmed before implementing checkout.

## 1. Main files

| Area | File | Purpose |
| --- | --- | --- |
| Dashboard screen | `frontend/app/(tabs)/index.tsx` | Home dashboard: greeting, learning stats, quick actions, study chart, AI recommendations, lesson videos, and leaderboard. |
| Visible tab bar and routes | `frontend/app/(tabs)/_layout.tsx` | Custom five-item tab bar and route visibility. |
| Main app shell and required update gate | `frontend/app/_layout.tsx` | Checks the installed Android version against the backend and shows the required Google Play update modal. |
| Over-the-air updates | `frontend/src/hooks/useAppUpdates.ts` | Checks and downloads EAS updates in supported standalone builds. |
| Profile access and token display | `frontend/app/(tabs)/profile.tsx` | Loads AI token balance and offline access; links to the existing payment page. |
| Offline access types/cache | `frontend/src/lib/offlineAccess.ts` | Offline access response shape and secure expiry cache. |
| Android version setup | `frontend/app.json` | App version, Android `versionCode`, package ID, EAS project, and update configuration. |
| Backend version notes | `backend/APP_VERSION_CHECK.md` | Release record, version API, and Play Store update procedure. |

## 2. Important routing detail before changing the dashboard

The dashboard component is `Home` in `frontend/app/(tabs)/index.tsx`, but the
current tab layout hides the `index` route with `href: null`. The visible custom
tab bar currently contains `feed`, `papers`, `ai`, `lessons`, and `profile`.
The visible `feed` tab is not the same screen as the `index` dashboard.

If the intended landing screen is the dashboard:

1. Decide whether the dashboard should replace `feed` or become an additional
   visible tab. The current design has five visible tab slots.
2. Update the `Tabs.Screen` declarations and route metadata in
   `frontend/app/(tabs)/_layout.tsx` consistently. A route must not remain
   hidden with `href: null` if it is meant to be a visible destination.
3. Keep the route name in the custom tab-bar metadata (`useTabItems`) in sync
   with the screen declarations.
4. Confirm the startup route and navigation links open the intended screen.
   The first declared tab is the default in the current layout.

Do not redesign only the dashboard component and expect it to appear as the
landing page while its route remains hidden.

## 3. What the dashboard currently shows

`frontend/app/(tabs)/index.tsx` loads:

- `/dashboard/stats` for study streak, XP, level progress, study consistency,
  and topic recommendations.
- `/leaderboard` for the top students and the current user's rank.
- `/library/courses` for lesson cards.
- `/notifications` for the unread notification count, with live updates over a
  WebSocket connection.

The screen also has quick actions for past questions, the AI tutor, statistics,
and the library. It uses the shared theme, language dictionary, authenticated
user profile, pull-to-refresh, and loading/error states. Keep these conventions
when adding a payment/access card so it looks like part of GCSHARP rather than
a separate checkout advertisement.

## 4. Add a payable amount to the dashboard

### Current payment-related behavior

- The app currently opens `https://gcsharp.com/pay` from the expired offline
  access screen in `frontend/app/_layout.tsx`.
- The profile screen also links to that URL for AI token purchases and shows
  the user's current AI token balance and offline access status.
- The backend exposes authenticated `GET /api/offline/access` and
  `GET /api/ai/tokens` endpoints. These return access/balance information; they
  are not payment initiation or payment verification endpoints.
- The Android app update modal is a separate feature. It opens Google Play; it
  does not charge for an app update.

### Recommended dashboard card

Add a themed **Access and plans** card on the dashboard, near the greeting and
learning summary so the price and the action are easy to find. It can show:

- The name of the paid product (for example, monthly offline access or an AI
  token bundle).
- The exact price and currency, retrieved from a trusted backend configuration.
- What the user receives, the duration, and any relevant usage limits.
- The user's current access state, such as trial, active subscription, or
  expired, and the expiry date when available.
- A clear action such as **View plans**, **Subscribe**, or **Buy tokens**.
- A secondary **I've paid — refresh access** action only if the existing
  payment process can reliably update the user's entitlement.

Reuse the app's existing card spacing, theme colors, buttons, loading/error
states, localization, and accessibility labels. Avoid a hard-coded price in
the React Native screen: a price change should not require an app release, and
the displayed amount must match the checkout amount.

### Information to decide before implementation

Confirm these product/business choices before setting a price or promising an
entitlement:

1. Which product is being sold: monthly offline access, AI tokens, a course, or
   another plan?
2. The amount, currency, billing period, renewal/cancellation terms, and any
   taxes or fees that must be disclosed.
3. Whether users pay in the app or are sent to the existing GC Sharp payment
   website. Check the current Google Play billing rules for the product and
   distribution regions before selecting an Android checkout flow.
4. How a successful payment is verified and when the backend grants access.
5. What the app should show for pending, failed, cancelled, refunded, and
   already-active payments.

Do not choose or invent the amount in code or documentation. The owner should
set the actual price and terms.

### Payment implementation sequence

1. Define the plan and price in a backend-controlled source of truth.
2. Add an authenticated endpoint that returns available plans and display
   prices. Return a stable plan ID, amount in minor currency units, currency,
   billing interval, and user-facing description.
3. Add a server-side checkout/session creation endpoint. The app should send a
   plan ID, not an amount that it can alter locally.
4. Verify payment with the payment provider on the backend (including provider
   callbacks/webhooks where supported). Never grant access based only on a
   client success screen or a user-submitted transaction reference.
5. Grant or renew the entitlement only after server-side verification. Keep
   an auditable transaction/entitlement record and make duplicate callbacks
   safe to process.
6. Add the dashboard card and loading, error, pending, and success states.
   Refresh `/offline/access` or `/ai/tokens` after the backend confirms the
   purchase.
7. Keep the profile screen and expired-access gate consistent with the same
   plan names, prices, and purchase flow. Do not have separate hard-coded
   prices on the dashboard, profile, and web checkout.
8. Test rejected/cancelled payments and verify they do not activate access.

Until this flow exists, the dashboard may display a backend-provided plan and
price and link to the current payment page, but the card alone does not process
or verify a payment.

## 5. Install and update behavior

The app's online Google Play version checker and mandatory download prompt have
been removed. Native version metadata in `frontend/app.json` is still required
when building and publishing Android/iOS apps; it no longer triggers an
in-app version gate.

The separate EAS over-the-air update mechanism remains enabled for compatible
standalone builds:

`frontend/src/hooks/useAppUpdates.ts` checks for an EAS Update on launch and
when a supported standalone app returns to the foreground. If one is available,
the app downloads it and offers to restart to apply it. The hook intentionally
does nothing in development and Expo Go. OTA updates do not replace native
changes that require a new store build.

For local development, start from `frontend` with:

```powershell
npx expo start -c
```

The `-c` option clears Metro's cache. An Expo Go JavaScript session is not the
same as installing a new Google Play/native build.

## 6. Suggested dashboard change checklist

- [ ] Decide whether `index` replaces the current `feed` tab or gets another
      visible tab slot.
- [ ] Implement the visual change in `frontend/app/(tabs)/index.tsx`.
- [ ] Keep route visibility, tab labels, and tab presses synchronized in
      `frontend/app/(tabs)/_layout.tsx`.
- [ ] Confirm plan, price, currency, duration, and payment provider before
      implementing checkout.
- [ ] Read the payable price and entitlement status from the backend.
- [ ] Verify payment on the backend before granting paid access.
- [ ] Keep the profile and expired-access purchase paths consistent.
- [ ] Test light/dark theme, supported languages, small screens, offline/error
      states, and refreshed entitlement after payment.
- [ ] Run `npx expo install --check`, `npx expo-doctor`, and an Android export
      from `frontend` after code changes.
