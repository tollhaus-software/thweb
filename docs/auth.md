# Authentication 

## 1. Overview & Architecture

```
[Browser Client]
       │
       ▼
┌─────────────────────────┐
│      oauth2-proxy       │ ── Layer 1
└──────────┬──────────────┘    • Handles Google OAuth 2.0 / OIDC redirects
           │                   • Manages session cookies (_oauth2_proxy)
           │                   • Attaches raw Google ID Token in `X-Forwarded-ID-Token`
           ▼
┌─────────────────────────┐
│          Nginx          │
└──────────┬──────────────┘    • Serves static React SPA files
           │                   • Proxies `/api/` and `/ws` forwarding headers
           ▼
┌─────────────────────────┐
│       Go Backend        │ ── Layer 2
└─────────────────────────┘    • Cryptographically verifies Google RSA signature
                               • Verifies expiration (`exp`) and audience (`aud`)
                               • Resolves fine-grained user permissions & roles in postgres db
```

---

## 2. Role of `oauth2-proxy`

`oauth2-proxy` acts as the **outer perimeter gatekeeper**:

* **Perimeter Gatekeeping**: Intercepts incoming web requests before they reach Nginx or the Go backend.
* **Google OAuth Management**: Handles browser redirects to `accounts.google.com`, code exchange, and session cookie issuance (`_oauth2_proxy`).
* **Identity Header Injection**: Passes Google's raw, signed OIDC ID Token to upstream services via the `X-Forwarded-ID-Token` HTTP header (along with `X-Forwarded-Email`).

In production, `oauth2-proxy` terminates TLS on port 443 using certificates provisioned by Certbot.

---

## 3. Role of the Go Backend

The Go backend functions as a **Zero-Trust Token Validation and Permission Engine**:

* **No Blind Trust**: The backend does *not* trust unverified incoming HTTP headers (`X-Forwarded-Email`).
* **Cryptographic Token Verification**: In production, the backend extracts the Google OIDC ID Token from `X-Forwarded-ID-Token` (filled by oauth2-proxy) and verifies it using Google's official Go SDK (`google.golang.org/api/idtoken`):
  1. Downloads and checks Google's public RSA signing keys.
  2. Verifies the cryptographic RSA signature of the token.
  3. Validates expiration (`exp`) and audience (`aud` matching `GOOGLE_CLIENT_ID`).
  4. Extracts the cryptographically verified `email` claim.
* **Database Authorization**: Matches the verified email against the Postgres `users`, `roles`, and `user_roles` tables to attach effective permissions to the request context.

---

## 4. Defense-in-Depth Approach

`thweb` enforces three distinct security boundaries:

1. **Layer 1 (Edge Protection - `oauth2-proxy`)**: Blocks unauthenticated web traffic, bots, and unauthorized requests at the boundary.
2. **Layer 2 (Cryptographic Verification - Go Backend)**: Even if an attacker bypasses `oauth2-proxy` or injects custom headers, they cannot forge a valid Google RSA signature for a target email address.
3. **Layer 3 (Database Allow-List & RBAC - Postgres)**: Authenticated Google accounts are restricted to an explicit database allow-list. Unrecognized Google accounts receive HTTP `403 Forbidden`.

---

## 5. Local Testing

For local development, the system is designed to run offline without needing Google Cloud OAuth credentials:

* **Compose Configuration**: Running `docker compose --env-file .env.mock up --build` starts `oauth2-proxy` in local skip-auth mode (`OAUTH2_PROXY_SKIP_AUTH_REGEX=".*"`).
* **Mock Authentication**: The backend receives `ALLOW_MOCK_AUTH=true` and `GOOGLE_CLIENT_ID=mock`.
* **Developer User**: When `ALLOW_MOCK_AUTH=true` is enabled, the backend bypasses Google RSA verification and logs in as `developer@example.com` (which `schema.sql` seeds with full Administrator permissions).
* **UI Role Switching**: The React frontend provides a developer login selector in mock mode to switch between test roles (`developer@example.com`, `viewer@example.com`, etc.).
