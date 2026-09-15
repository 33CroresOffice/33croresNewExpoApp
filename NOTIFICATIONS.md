# Push Notification Code Map

Purpose: when pasting freshly exported Bolt code over this project, **do not overwrite** the
files/sections listed below — they implement push notifications (Expo push tokens + FCM) and any
Bolt export will not have this logic. Diff before replacing; merge Bolt's changes around these
spots instead of pasting over them.

## Core files (100% notification-related — keep as-is)

- [utils/pushToken.ts](utils/pushToken.ts)
  Registers/unregisters the device for push notifications: sets the Android notification
  channel, requests permission, gets the Expo push token, and upserts/deletes it in the
  `expo_push_tokens` Supabase table.

- [hooks/usePushNotifications.ts](hooks/usePushNotifications.ts)
  React hook wrapping `pushToken.ts` — call `usePushNotifications(userId, enabled)` to
  register/unregister a token when a user logs in/out or toggles notifications.

- [supabase/functions/send-notification/index.ts](supabase/functions/send-notification/index.ts)
  Edge function that sends a single notification. Handles SMS/WhatsApp (MSG91) **and** push —
  only the push-sending portion (around line 161-176, `sendPushNotification`-style payload to
  Expo's push API) is notification-delivery code; the MSG91 parts are unrelated messaging, not
  push.

- [supabase/functions/send-bulk-notification/index.ts](supabase/functions/send-bulk-notification/index.ts)
  Edge function that sends push notifications to many users at once (batches Expo push tokens).

- [supabase/functions/send-automated-notifications/index.ts](supabase/functions/send-automated-notifications/index.ts)
  Scheduled/automated push notifications (e.g. reminders) triggered server-side.

## Files with a notification section mixed into other logic (edit carefully)

- [app/_layout.tsx](app/_layout.tsx)
  - Line 32: `import * as Notifications from 'expo-notifications';`
  - Lines 120-136: `useEffect` that listens for a tapped notification
    (`Notifications.getLastNotificationResponseAsync`,
    `Notifications.addNotificationResponseReceivedListener`) and routes to
    `/(customer)/notifications`.
  - Everything else in this file (app update check, fonts, splash) is unrelated — safe to
    replace from Bolt.

- [app/(rider)/_layout.tsx](app/(rider)/_layout.tsx)
  - Line 6: `import { usePushNotifications } from '@/hooks/usePushNotifications';`
  - Line 15: `usePushNotifications(userId, true);` — registers the rider's push token.

- [app/(customer)/_layout.tsx](app/(customer)/_layout.tsx)
  - Line 11: `import { usePushNotifications } from '@/hooks/usePushNotifications';`
  - Line 250: `usePushNotifications(userId, pushEnabled);` — registers the customer's push
    token, gated by the user's notification preference.

- [app/(customer)/notifications.tsx](app/(customer)/notifications.tsx)
  - Line 9: `import { registerForPushNotificationsAsync, unregisterPushTokenAsync } from '@/utils/pushToken';`
  - Line 46: `registerForPushNotificationsAsync(...)` call when the user re-enables notifications
    from the in-app notifications screen.

- [supabase/functions/verify-provider-booking-payment/index.ts](supabase/functions/verify-provider-booking-payment/index.ts)
  - Lines 23-30ish: `sendPushNotification(...)` helper.
  - Every `await sendPushNotification(...)` call after a booking/payment event (lines ~111,
    119, 128, 135) — these fire push notifications on booking confirmation/payment. The
    surrounding payment-verification logic is unrelated business logic, safe to replace.

## Config / native project files (do not lose these edits)

- [app.json](app.json)
  - `expo.android.permissions`: must include `"POST_NOTIFICATIONS"`.
  - `expo.android.googleServicesFile`: `"./android/app/google-services.json"`.
  - `expo.plugins`: must include the `expo-notifications` plugin entry with `icon`/`color`.

- [android/app/build.gradle](android/app/build.gradle)
  - Lines 5-10: conditional `apply plugin: "com.google.gms.google-services"` block (only
    applies if `google-services.json` is present). Required for FCM.

- [package.json](package.json)
  - Dependencies: `expo-notifications`, `expo-device`, `expo-constants` (used by
    `utils/pushToken.ts` to build the push token).

- `android/app/google-services.json` (gitignored — see commit "Add eas.json and gitignore
  Firebase admin SDK keys") — Firebase config file needed for FCM. Not in version control;
  don't expect Bolt exports to include it, and don't delete your local copy.

## How to use this when pasting Bolt code

1. Never blanket-overwrite the "Core files" list above — copy Bolt's other changes in, but keep
   these files as they are (or manually merge).
2. For the "mixed" files, diff against Bolt's version and re-apply only the notification lines
   noted above after pasting.
3. For `app.json` / `build.gradle` / `package.json`, after pasting Bolt's version, re-check the
   specific keys/lines listed above are still present.
