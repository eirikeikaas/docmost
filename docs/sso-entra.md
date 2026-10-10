# Single sign-on with Microsoft Entra ID

Docmost signs users in through its generic OpenID Connect layer
(`Settings > Single Sign-On (OIDC)`). This page covers what is specific to
Microsoft Entra ID (formerly Azure AD) and how to configure it from the
environment, so a deployment does not need any clicking in the admin UI.

It is written for an installation that shares one Entra app registration with
TRYlle (the bridge app that signs in with Entra and talks to Docmost as a
service account), but nothing here depends on TRYlle.

## 1. Entra app registration

Use the **same app registration as TRYlle**. Entra puts an app's roles in the
`roles` claim of the ID token it issues for that app, so the app roles
`agents_admin`, `agents_manage` and `agents_member` arrive in Docmost without
any extra configuration, and one assignment in Entra controls access to both
applications. (A user's `sub` is unique per app registration, so Docmost links
accounts per registration; keep using one.)

1. **Supported account types**: _Accounts in this organizational directory
   only_ (single tenant). Docmost refuses the multi-tenant authorities
   (`common`, `organizations`, `consumers`): their discovery document advertises
   a templated issuer that never matches a real token.
2. **Authentication > Web redirect URI**:

   ```
   <APP_URL>/api/sso/oidc/callback
   ```

   `APP_URL` is Docmost's own `APP_URL` setting, e.g.
   `https://docs.example.com/api/sso/oidc/callback`. The callback is one global
   path, not per provider.

3. **Certificates & secrets**: create a client secret and copy its _value_.
4. **App roles**: `agents_admin`, `agents_manage`, `agents_member` (allowed
   member types: users/groups), as already defined for TRYlle.
5. **Enterprise applications > _your app_ > Properties > Assignment required?**
   set to **Yes** ("User assignment required"). Then only users and groups you
   assign to the app can sign in at all, and the roles they are assigned are the
   ones sent to Docmost.
6. Optional: under **Token configuration** add the `email` optional claim to the
   ID token. Not required: Docmost falls back to `preferred_username` and `upn`.

## 2. Environment variables

Set all three of the first block to have Docmost create the provider on start.
Self-hosted only; ignored on cloud.

| Variable                        | Required | Default              | Meaning                                                                                                                                                                  |
| ------------------------------- | -------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SSO_OIDC_ENTRA_TENANT_ID`      | yes      | -                    | Directory (tenant) GUID, or a verified domain such as `contoso.onmicrosoft.com`. `common`, `organizations` and `consumers` are rejected at startup.                      |
| `SSO_OIDC_ENTRA_CLIENT_ID`      | yes      | -                    | Application (client) ID of the app registration.                                                                                                                         |
| `SSO_OIDC_ENTRA_CLIENT_SECRET`  | yes      | -                    | Client secret value. Stored encrypted (AES-256-GCM, key derived from `APP_SECRET`), never returned by the API and never logged.                                         |
| `SSO_OIDC_ENTRA_DISPLAY_NAME`   | no       | `Microsoft Entra ID` | Provider name, shown on the login button. Also how an existing provider is found on the next start.                                                                      |
| `SSO_OIDC_ENTRA_ALLOW_SIGNUP`   | no       | `true`               | `true`/`false`: may a first-time user be provisioned. When `false` only people who already have a Docmost account can sign in with Entra.                                |
| `SSO_OIDC_ENTRA_ROLE_MAP`       | no       | empty                | `claimValue=role` pairs, comma separated, e.g. `agents_admin=admin,agents_manage=member`. Roles can only be `admin` or `member`; `owner` is rejected at startup.         |
| `SSO_OIDC_ENTRA_REQUIRED_ROLES` | no       | empty                | Comma separated claim values; when set, a login whose `roles` claim holds none of them is refused with `403`. E.g. `agents_admin,agents_manage,agents_member`.            |

A blank value counts as unset. `.env` example:

```
APP_URL=https://docs.example.com
SSO_OIDC_ENTRA_TENANT_ID=0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b
SSO_OIDC_ENTRA_CLIENT_ID=11111111-2222-3333-4444-555555555555
SSO_OIDC_ENTRA_CLIENT_SECRET=...
SSO_OIDC_ENTRA_ROLE_MAP=agents_admin=admin,agents_manage=member
SSO_OIDC_ENTRA_REQUIRED_ROLES=agents_admin,agents_manage,agents_member
```

### What the bootstrap does

On every application start (once, for the workspace) it creates, or updates in
place, one provider named `SSO_OIDC_ENTRA_DISPLAY_NAME` with issuer
`https://login.microsoftonline.com/<tenant-guid>/v2.0`, `isEnabled = true` and
`trustUnverifiedEmail = true`. It is idempotent: a start with nothing changed
writes nothing, and a rotated secret is picked up on the next start.

- While the variables are set, they are the source of truth for the provider's
  issuer, client id and secret, display name, `allowSignup`, enabled flag,
  `trustUnverifiedEmail`, role map and required roles. Edits to those in the
  admin UI are reverted on the next start. Unset the variables to manage the
  provider by hand again. `roleClaim` and `defaultRole` are not managed by the
  environment.
- A provider is matched by name, then by issuer plus client id, so renaming it
  in the UI does not create a duplicate.
- If a **domain** is given as tenant, Docmost asks Entra's public discovery
  endpoint once at startup which tenant GUID it resolves to (the OIDC client
  rejects any issuer other than the GUID one). Prefer the GUID: it needs no
  network call.
- If no workspace exists yet (a brand-new install), nothing happens; restart
  Docmost after completing the first-run setup.
- A misconfiguration (`common`, a role map that names `owner`, a partial
  configuration, an unreachable database) is logged and Docmost starts normally;
  password login is unaffected.

## 3. How a login is processed

1. **Email.** Entra v2 ID tokens usually carry no `email_verified` and often no
   `email`. Docmost takes the first of `email`, `preferred_username`, `upn` that
   looks like an address.
2. **Trust.** A first login normally requires `email_verified = true` from the
   identity provider and otherwise fails closed. With `trustUnverifiedEmail`
   (on for the Entra provider) the address is accepted as verified. It is a
   per-provider setting and off by default for any provider.
3. **Roles.** `roles` is read from the ID token (from userinfo only if the ID
   token has no such claim). `requiredRoles` is checked first, on every login.
   Then `roleMap` is applied, **highest privilege wins** (`admin` over
   `member`).
4. **Role sync** runs on every login for users that exist and is applied
   whenever a mapping matches, so removing someone's `agents_admin` role in
   Entra demotes them in Docmost on their next login:
   - `owner` is never assigned through SSO and an existing owner's role is never
     changed.
   - If no mapping matches, an existing user keeps their role. `defaultRole`
     (default `member`) is used only when a brand-new user is provisioned.
5. Existing links are by `sub`; the email is not consulted again once an account
   is linked. A first login with an email that matches a local account links to
   it; a new address provisions a user if `allowSignup` is on and the address is
   in the workspace's `emailDomains` allow-list (if one is configured).

`requiredRoles` applies to everyone, workspace owners included. An owner who has
none of the roles in Entra cannot sign in through Entra (their password still
works unless the workspace enforces SSO), so keep at least one break-glass owner
with a password, or assign owners an app role too.

`roleClaim` (default `roles`) may be a dotted path such as `realm_access.roles`
for other identity providers.

Changes take effect at the user's next sign-in; an already open Docmost session
keeps working until it expires or is revoked.

## 4. Without environment variables

Everything above can be set in `Settings > Single Sign-On (OIDC)`: issuer
`https://login.microsoftonline.com/<tenant-guid>/v2.0`, client id and secret, and
under _Advanced_: trust unverified email, role claim, role mapping
(JSON `{"agents_admin": "admin"}`), default role and required roles. The same
fields are accepted by `POST /api/sso/oidc/providers` and
`POST /api/sso/oidc/providers/update` as `trustUnverifiedEmail`, `roleClaim`,
`roleMap`, `defaultRole`, `requiredRoles`, and returned by
`POST /api/sso/oidc/providers/list`.

The options live in the provider's existing `auth_providers.settings` jsonb
column (no migration): `trustUnverifiedEmail`, `roleClaim`, `defaultRole`,
`requiredRoles` and `roleMappings`. The API's `roleMap` object is persisted as a
list of `{ "claimValue": "agents_admin", "role": "admin" }` pairs, because the
database layer re-cases the keys of every JSON object it reads (it would turn
the claim value `agents_admin` into `agentsAdmin`); values are never touched.

## 5. Security notes

**nOAuth.** Entra's `email` claim is not a verified identifier: in a multi-tenant
application an attacker can create a tenant, set an arbitrary address on a user
in it, and sign in as whoever owns that address elsewhere. Trusting the claim
(`trustUnverifiedEmail`) is therefore only safe when you control who can sign
in. The mitigations, all of which this setup uses:

- **Tenant-specific issuer.** Only users of _your_ tenant can obtain a token the
  provider accepts. Multi-tenant authorities are refused, in the UI/API and in
  the environment bootstrap.
- **`emailDomains` allow-list** (workspace setting): limits which addresses may
  be provisioned as new accounts.
- **User assignment required** plus **`requiredRoles`**: only people you assigned
  an app role to can sign in, and revoking the role revokes access at the next
  login.
- Linking an existing account by email trusts the address too. Guest (B2B)
  users keep their home address as `email`; do not assign the app to guests you
  do not trust.

Do not turn `trustUnverifiedEmail` on for a provider whose issuer you do not
control or that serves other organisations' users.

## 6. Troubleshooting

| Symptom                                                                                | Likely cause                                                                                                              |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `401 Your identity provider must assert a verified email address`                      | `trustUnverifiedEmail` is off for the provider.                                                                           |
| `403 Your account is not assigned a role that allows signing in`                       | The user has none of `requiredRoles` in the `roles` claim: assign an app role, or check `roleClaim`.                       |
| `400 Your identity provider did not share an email address`                            | None of `email`, `preferred_username`, `upn` holds an address. Add the `email` optional claim.                             |
| `400 SSO login failed`; log line `OIDC callback rejected ... issuer`                   | Multi-tenant authority or wrong tenant in the issuer. Use `https://login.microsoftonline.com/<tenant-guid>/v2.0`.         |
| `AADSTS50011` redirect URI mismatch                                                    | The URI in the app registration is not exactly `<APP_URL>/api/sso/oidc/callback`.                                         |
| The provider does not appear after setting the variables                               | No workspace existed at startup (restart after first-run setup), or the log shows `Entra SSO bootstrap` warnings/errors. |
