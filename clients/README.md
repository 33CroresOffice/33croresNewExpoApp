# Client configs

Each subfolder here is one white-label client. To add a new client:

1. Copy `_template/` to `<clientId>/` (the folder name becomes the client id).
2. Edit `<clientId>/client.json`:
   - `name` — app display name
   - `slug` — expo slug (unique per client)
   - `scheme` — deep-link URL scheme (unique per client)
   - `android.package` / `ios.bundleIdentifier` — unique app id for this client
   - `initialRoute` — the route the app redirects to on launch (see `app/index.tsx`)
   - `primaryColor` / `splashBackgroundColor` — branding colors
   - `easProjectId` — the client's EAS project id (create one with `eas init` if needed)
3. Drop the client's branding assets into `<clientId>/assets/`:
   - `icon.png`, `favicon.png`, and optionally a distinct `splash.png` / adaptive icon
   - `google-services.json` for push notifications (get this from the client's Firebase project; it is gitignored, never commit it)
4. Run `npm run apply-client -- <clientId>` to switch the active build to this client, then `npm run android` / `npm run ios`.
