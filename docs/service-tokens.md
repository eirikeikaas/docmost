# Service tokens

A service token is a bearer credential that lets a program (TRYlle, a script, a
CI job) call Docmost's REST API as one specific user, without a browser session
or a password. It is designed for this fork and replaces the enterprise
API-key module, which this checkout does not contain.

```
Authorization: Bearer <token>
```

## How it works

- The token is a JWT signed with `APP_SECRET`. Its payload is
  `{ sub: <user id>, workspaceId, serviceTokenId, type: "service", exp }`.
- Every request is checked against a `service_tokens` row, so a token is
  revocable immediately: the signature only proves Docmost issued it once.
  A request is refused (a bare `401`) when the row is missing, revoked or past
  `expires_at`, when the token's workspace or user does not match the row, when
  the bound user is deactivated or deleted, or when the bound user has become a
  workspace **owner**.
- Only a short fingerprint (`token_prefix`, the first 8 characters of the JWT's
  signature segment) is stored. The full token is shown **once**, in the
  response that creates it, and is never logged, listed or returned again.
- The token acts as the bound user and nothing more. Its reach is exactly that
  user's space memberships, page permissions and workspace role: there are no
  scopes and no bypass. Give the service account only the spaces it needs (and
  only the `reader` or `writer` role it needs there).

## Setting one up

1. Create a dedicated Docmost user for the integration (a normal member; invite
   it or let it sign in once through SSO) and add it to the spaces it should
   reach. A service token **cannot be bound to a workspace owner or to a
   deactivated user**. Prefer the `member` role over `admin`.
2. As an admin, open **Settings > Service tokens** and create a token: pick the
   user, name it, and choose an expiry (1-365 days, default 90). Copy the token
   straight away.
3. Give it to the integration as `Authorization: Bearer <token>`.
4. Rotate before it expires: create the new token, deploy it, then revoke the old
   one. A revoked or expired token stops working immediately.

`last_used_at` is shown in the list; it is a hint, written at most once a minute
per token, not an audit trail.

## Administration API

Session-only: these endpoints require an interactive, signed-in admin
(`Manage` on workspace settings). A service token, API key or OAuth token cannot
call them, so a leaked token can neither mint nor revoke tokens. All three are
`POST` with a JSON body, like the rest of the API; responses are wrapped as
`{ "data": ..., "success": true, "status": 200 }`.

| Endpoint                         | Body                                                    | Returns (`data`)                                  |
| -------------------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| `POST /api/service-tokens/list`   | none                                                    | array of token metadata                           |
| `POST /api/service-tokens/create` | `{ "name": string, "userId": uuid, "expiresInDays"?: 1-365 }` | token metadata plus `token` (shown once)    |
| `POST /api/service-tokens/revoke` | `{ "id": uuid }`                                        | token metadata (idempotent)                       |

Token metadata:

```json
{
  "id": "uuid",
  "name": "TRYlle",
  "tokenPrefix": "Zk3f9QaB",
  "userId": "uuid",
  "userName": "TRYlle",
  "userEmail": "trylle@example.com",
  "userDisabled": false,
  "creatorId": "uuid",
  "status": "active",
  "expiresAt": "2027-01-08T10:00:00.000Z",
  "lastUsedAt": null,
  "revokedAt": null,
  "createdAt": "2026-10-10T10:00:00.000Z"
}
```

`status` is `active`, `revoked` or `expired`. `create` additionally returns
`"token": "eyJ..."`. Errors: `400` for an owner or disabled target, an empty
name or an out-of-range expiry; `404` for an unknown user (in this workspace) or
token; `403` without the admin permission or with a non-session credential.

## What a service token cannot do

A service token is refused (`403`, "This action requires an interactive user
session") on every endpoint that creates or changes accounts, roles,
credentials or workspace configuration:

| Controller                      | Session-only endpoints                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `auth`                          | all (login, setup, password change/reset, logout, collab token)                                                      |
| `sessions`                      | all                                                                                                                  |
| `sso/oidc/providers`            | all (SSO provider administration)                                                                                    |
| `service-tokens`                | all                                                                                                                  |
| `users`                         | `update`                                                                                                             |
| `workspace`                     | `update`, `members/deactivate`, `members/activate`, `members/delete`, `members/change-role`, `invites`, `invites/create`, `invites/resend`, `invites/revoke`, `invites/link` |
| `groups`                        | `create`, `update`, `delete`, `members/add`, `members/remove`                                                         |
| `spaces`                        | `delete`, `members/add`, `members/remove`, `members/change-role`                                                      |
| attachments                     | `attachments/upload-image`, `attachments/remove-icon` (avatar, workspace and space icons)                             |
| `public-spaces`                 | `publish`                                                                                                            |

The enterprise MFA, API-key and OAuth-grant route families (`/api/mfa`,
`/api/api-keys`, `/api/oauth`) are refused for service tokens by the
authentication guard itself, because those modules are not part of this tree and
cannot be annotated from here. Collaboration (`/collab`) and websocket
connections accept only their own token types, so a service token does not open
them; use the REST page endpoints.

Everything else (pages, comments, search, labels, shares, attachments, export
and import, read-only lookups of spaces, groups and members) works within the
bound user's permissions. A new open-source controller must be classified in
`apps/server/src/common/guards/service-token-confinement.spec.ts`; the spec
fails until it is.

## Operational notes

- Rotating `APP_SECRET` invalidates every service token (and every session).
- Deleting the bound user deletes its tokens; deleting the user who created a
  token keeps the token (the creator is just cleared).
- Deactivating the bound user makes its tokens inert without touching them;
  reactivating the user revives them.
- Revoking, or an `expires_at` in the past, takes effect on the next request:
  nothing is cached.
