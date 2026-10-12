# NeonNexus API v1

Base: `/neonnexus/api/v1`. JSON responses are UTF-8, private responses use `Cache-Control: no-store`; errors are `{ok:false,code,message}`. Requests with bodies use `application/json` except image uploads. Public API exposes public articles only. Times are ISO-8601; article dates use `YYYY-MM-DD` in Beijing.

## Articles

Post: `{id,slug,title,description,pubDate,updatedDate?,tags:string[],body,heroImage?,visibility:'draft'|'public',createdAt,updatedAt,pendingChanges?}`. Owner reads return the working copy; `pendingChanges` indicates edits/uploads since the last publication. Public lists/details always read the last published snapshot (including slug, dates and images), never unsent edits. Public lists omit `body`; detail includes it. Slugs use lowercase ASCII letters, numbers and hyphens (1–100 characters). No article source is written to Git by publishing.

- `GET /posts` → `{posts:[Post]}` (public only, descending pubDate).
- `GET /posts/{slug}` → `{post:Post}`, otherwise 404, including draft/deleted slugs.
- `GET /owner/posts` → `{posts:[Post]}` including private drafts.
- `POST /owner/posts` JSON `{slug,title,description,pubDate,tags?,body?,heroImage?}` → 201 `{post:Post}`; always initially draft.
- `GET /owner/posts/{id}` → `{post:Post}`.
- `PUT /owner/posts/{id}` JSON editable fields above plus optional `updatedDate` → `{post:Post}`. Saves a private working copy; even for an already public article it does not change the published snapshot. Visibility cannot be changed by this endpoint.
- `POST /owner/posts/{id}/publish` / `/unpublish` → `{post:Post}`.
- `DELETE /owner/posts/{id}` → `{ok:true}`; hides article immediately, retains recovery data privately.
- `POST /owner/media`, raw image bytes, `Content-Type: image/png|image/jpeg|image/gif|image/webp`, `X-Post-Id: article UUID` → 201 `{url}`. Maximum 4 MiB; no SVG, HTML, filenames or paths. URL is `/neonnexus/media/{random-id}.{extension}`. Newly uploaded media is accessible only to the owner until a publication snapshot actually references it in its body or heroImage. Unused uploads stay private. Media on a withdrawn/deleted post is private. Upload to an article after creating its draft.

Preview rendering is the frontend's owner-only server route; it sanitizes Markdown and does not save or publish.

## Owner login

- `POST /owner/login` JSON `{password}` → `{ok:true,csrfToken}` and cookie `neonnexus_owner` (`HttpOnly; Secure; SameSite=Strict; Path=/neonnexus/`). No default password; server-side scrypt hash, rate-limited login, random 256-bit session token stored as a hash. Session lasts 12 hours.
- `GET /owner/session` → `{ok:true,csrfToken}` or 401. Frontend retrieves CSRF here after reload.
- Every owner mutation after login needs `X-CSRF-Token` and a permitted `Origin`, including raw uploads.
- `POST /owner/logout` → `{ok:true}` and expired cookie.
- `POST /owner/password` JSON `{currentPassword,password}` → `{ok:true}`, invalidates all sessions and expires the current cookie. New password requires 12–256 characters; log in again afterward.

Owner routes require HTTPS. Production HTTP cannot login or use an owner session. Local tests explicitly disable this requirement; production never does. Credentials remain in private server storage and a restricted local handoff file, never public source, URLs or chat.

## Private anonymous conversations

Initial submission keeps existing route `POST /neonnexus/api/messages` with `Idempotency-Key` and JSON `{message,website:'',threadSecret}`. `threadSecret` is 64 lowercase hex characters generated from 32 cryptographically random bytes **by the browser before submitting**. Store it locally before sending; retry identical content with the same key and secret. Reply → `{ok:true,receipt,threadId}`. Receipt identifies the first message; threadId identifies the conversation. Neither grants reading access. Server stores only the secret hash and never emails the visitor secret. Old clients without a secret may still send a private one-way message, which cannot be read by knowing its UUID.

Visitor URLs keep `{threadId,threadSecret}` in `#fragment`, never in path/query. API requests use `Authorization: Bearer {threadSecret}`; no names, emails or accounts. Secret-bearing routes require HTTPS.

- `GET /threads/{threadId}` → `{thread:{id,createdAt,messages:[{id,author:'visitor'|'owner',body,createdAt}]}}`; wrong ID/secret gives identical 404.
- `POST /threads/{threadId}` JSON `{message}` plus `Idempotency-Key` → `{ok:true,receipt,threadId}`. Same key/content/secret retry returns the same receipt. New visitor messages produce a durable owner email notification.
- `GET /owner/threads` → `{threads:[{id,createdAt,updatedAt,messageCount,preview,canReply}]}`. Old one-way messages have `canReply:false`; private owner list only.
- `GET /owner/threads/{threadId}` → the same complete thread shape with owner access.
- `POST /owner/threads/{threadId}` JSON `{message}` plus `Idempotency-Key` → `{ok:true,receipt,threadId}`. Reply stays private for that visitor; no new email to the owner.

Message limit remains 1–2000 characters. Unknown read paths stay 404. SMTP failures retain saved messages and retry notifications. Notifications include visitor text, Beijing timestamp and owner inbox path, without the retrieval secret. Public thread APIs never list conversations or search by UUID alone.
