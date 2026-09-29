# Project architecture

- SaveIQ stores goals in Supabase, keyed to each signed-in account and protected by row-level security; this keeps every user's data private.
- The home page shows the sign-in screen when signed out and the dashboard when signed in, and the dashboard is remounted for each account; this stops one account's state leaking into another's.
- Financial calculations live beside the dashboard state in the index route; this keeps every metric and coaching insight synchronized from one goal model.
- Goal balances change only through the credit_goal database function (requires a linked bank, logs a transaction); keeps funding verified and auditable.

- Every fresh app launch signs out the stored session (sessionStorage marker) so the sign-in screen always comes first; required by product spec.
- PWA uses vite-plugin-pwa (generateSW) registered only via src/lib/pwa.ts guards; never registers in dev/preview.
