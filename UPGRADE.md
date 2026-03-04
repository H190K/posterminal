# Upgrade Guide

> **Important**: This guide tracks the immediate upgrade path only.

---

## Upgrading from v1.1.7 to v1.1.7-1

### Overview

v1.1.7-1 focuses on **zero-trust session stability** for terminal auth:

1. Strict 2-minute session TTL is centralized and consistently enforced
2. Protected terminal pages are cache-guarded to reduce stale auth artifacts
3. Browser refresh on protected terminal pages forces re-authentication
4. `/check` and `/check-status` are now authenticated terminal routes

### Breaking Changes

These are intentional auth behavior changes:

1. `GET /check` now requires a valid terminal session
2. `POST /check-status` now requires a valid terminal session
3. Refreshing protected terminal pages logs out via `/logout` and requires login again

### Migration Steps

#### Step 1: Update Code

Use the v1.1.7-1 `index.js`, or port these changes:

1. Add session constants:
```javascript
const SESSION_MAX_AGE_SECONDS = 120;
const SESSION_FUTURE_SKEW_MS = 60 * 1000;
```

2. Add auth header helpers:
```javascript
const authNoStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
  "Vary": "Cookie"
};
const authHtmlHeaders = {
  "Content-Type": "text/html; charset=UTF-8",
  ...authNoStoreHeaders
};
```

3. Add cookie helpers and use them for login/logout/invalid-session cleanup:
```javascript
const buildSessionCookie = (token, maxAgeSeconds = SESSION_MAX_AGE_SECONDS) => { /* ... */ };
const clearSessionCookie = () => "session=; ...; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
```

4. Harden `parseCookie()` and `verifySessionToken()`:
   - Support quoted + URL-decoded cookie values
   - Reject invalid/far-future timestamps
   - Use `SESSION_MAX_AGE_SECONDS` in TTL check

5. Add a public logout route:
```javascript
if (request.method === "GET" && url.pathname === "/logout") {
  return new Response(null, {
    status: 302,
    headers: {
      "Location": "/",
      "Set-Cookie": clearSessionCookie(),
      ...authNoStoreHeaders
    }
  });
}
```

6. Update route access rules:
```javascript
const publicPaths = ["/pay", "/success", "/webhook", "/login", "/logout"];
```

7. Apply `authHtmlHeaders` to protected terminal HTML responses:
   - `/`
   - `/create`
   - `/check`
   - `/check-status` HTML responses
   - `/generate` HTML response (share page)

8. Add refresh-triggered re-auth script on protected terminal pages:
```javascript
const REFRESH_REAUTH_SCRIPT = `<script>(function(){/* redirect reload to /logout */})();</script>`;
```

#### Step 2: Deploy

```bash
npx wrangler deploy
```

### Verification Checklist

1. Login works and sets a 2-minute session cookie
2. Invalid/expired session cookie is cleared and login page is shown
3. Refreshing `/`, `/create`, `/check`, or share/check terminal pages redirects to `/logout`
4. `/check` and `/check-status` cannot be used without login
5. Protected HTML responses include:
   - `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`
   - `Pragma: no-cache`
   - `Expires: 0`
   - `Vary: Cookie`

### Rollback

If you need v1.1.7 behavior:

1. Restore the previous `index.js`
2. Redeploy with `npx wrangler deploy`
