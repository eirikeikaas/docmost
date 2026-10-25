---
name: docmost-add-artifact
description: Add a published Claude artifact to Docmost as an artifact page. Use when the user asks to put, add, push or publish a Claude artifact into Docmost (or a Docmost space).
---

# Add a Claude artifact to Docmost

Creates a Docmost page of the "artifact" type that embeds a published Claude artifact.

## Prerequisites

- `DOCMOST_URL` — base URL of the Docmost instance, no trailing slash (e.g. `http://localhost:3000`).
- `DOCMOST_TOKEN` — a Docmost service token (Settings → Service tokens). Never print it or write it to a file.
- The artifact must be **published** in Claude with the Docmost origin listed under "Allowed domains" in its embed settings. Claude's embed code is only available from the artifact's publish dialog, so ask the user for the embed code or embed URL; do not guess it from the artifact's private URL.

If either variable is unset, say which one is missing and stop.

## Steps

1. Ask which space (and optionally which parent page) the artifact belongs in, unless the user already said.
2. Resolve the space id:

   ```bash
   curl -s -X POST "$DOCMOST_URL/api/spaces" \
     -H "Authorization: Bearer $DOCMOST_TOKEN" -H "Content-Type: application/json" \
     -d '{"limit":100}'
   ```

   Match the user's space by `name` or `slug` and take its `id`. If several match, ask.
3. Extract the https URL from the embed code (`<iframe src="…">`), or use the URL as given. Reject anything that is not `https://`.
4. Create the page:

   ```bash
   curl -s -X POST "$DOCMOST_URL/api/pages/create" \
     -H "Authorization: Bearer $DOCMOST_TOKEN" -H "Content-Type: application/json" \
     -d '{"spaceId":"<space id>","title":"<title>","artifactUrl":"<https url>","parentPageId":"<optional parent id>"}'
   ```

   Omit `parentPageId` for a top-level page. Default the title to the artifact's title.
5. Report the page link: `$DOCMOST_URL/s/<space slug>/p/<slugId from the response>`.

## Notes

- A 400 on `artifactUrl` means it was not a valid https URL (max 2048 characters).
- A 403/404 on the parent or space means the token's user cannot edit there.
- To change the artifact later, call `POST /api/pages/update` with `pageId` and a new `artifactUrl`.
