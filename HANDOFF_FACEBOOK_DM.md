# Handoff: Facebook Private Reply / DM Feature

## Context

Tipote is a SaaS app that automates responses to Facebook Page comments. When a user comments a keyword (e.g., "PDF") on a specific post, Tipote:
1. Replies to the comment publicly (WORKING)
2. Sends a private DM to the commenter via Messenger (NOT WORKING - pending Meta approval)

## Architecture: Two Meta Apps

| App | Role | Key Env Vars | Key Permissions |
|---|---|---|---|
| **Tipote** (main) | OAuth login, Facebook Page connection, feed webhooks | `META_APP_ID`, `META_APP_SECRET` | `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_metadata`, `pages_manage_engagement` |
| **Tipote ter** (Messenger) | Sending DMs via Messenger Send API | `MESSENGER_PAGE_ACCESS_TOKEN` | `pages_messaging` (currently **Standard Access** - Advanced Access requested) |

Both apps are **Live**. The Page "Tipote" (ID: `1027534517104852`) is connected to both apps.

## The Blocker: `pages_messaging` Standard vs Advanced Access

**`pages_messaging` is at Standard Access on Tipote ter.** In Standard Access, the Send API can ONLY message users who are admins/developers/testers of the app. For any other user, it fails with:
- `(#100) Parametre comment_id non valide` (code 100, subcode 2018292) on Private Reply
- `(#551) Cette personne n'est pas disponible` (code 551, subcode 1545041) on direct DM fallback

**Advanced Access has been requested** and is pending Meta App Review approval.

## What's Already Done (DO NOT redo)

### Code (file: `app/api/automations/webhook/route.ts`)
- Private Reply cascade tries 2 formats x 2 endpoints:
  - Format: full compound `postId_commentId` AND stripped `commentId` alone
  - Endpoints: `POST /{comment_id}/private_replies` AND `POST /me/messages` with `recipient.comment_id`
- Tries with MESSENGER token first (has pages_messaging), then OAuth token
- Falls back to `sendMetaDM` with `recipient.id` (direct Messenger, requires prior interaction)
- `messaging_type: "RESPONSE"` is included in Send API calls
- Extensive logging to `webhook_debug_logs` table in Supabase

### Meta Configuration
- Tipote ter: Page Subscriptions include `messages` and `feed`
- Marketing Messages TOS accepted
- EU privacy page IDs configured
- App is in Live mode

## What to Do When Advanced Access is Approved

### Step 1: Regenerate the MESSENGER_PAGE_ACCESS_TOKEN
After approval, regenerate the Page Access Token in Tipote ter > Messenger > Settings > "Generer" button. Update the `MESSENGER_PAGE_ACCESS_TOKEN` environment variable on the server (Vercel or equivalent).

### Step 2: Test
1. Go to the target Facebook post
2. Comment the keyword (e.g., "PDF") from a personal account that is NOT a tester of the app
3. Check webhook logs at `https://app.tipote.com/api/automations/webhook-diagnostic`
4. Verify `dm_private_reply_fail_messenger` is no longer logged
5. Verify `processed` event shows `dmSent: true`

### Step 3: If Private Reply Still Fails After Approval
Check the specific error in the logs:

| Error | Cause | Fix |
|---|---|---|
| `comment_id non valide` (100/2018292) | Token may need regeneration, or `feed` not subscribed on Tipote ter | Regenerate token, verify `feed` is checked in Page Subscriptions |
| `Requires pages_messaging` (230) | Wrong token being used (OAuth instead of MESSENGER) | Check code uses `MESSENGER_PAGE_ACCESS_TOKEN` |
| `Object does not exist` | Old `/{comment_id}/private_replies` endpoint deprecated | Expected, code already falls through to Send API method |
| `Already replied` (10900) | Comment already received a private reply | Normal behavior - one reply per comment |
| 551/1545041 | Only on fallback `recipient.id` - expected if no prior interaction | Private Reply (method B) should work; this fallback is for edge cases |

## Key Technical Details

### Webhook Flow (simplified)
1. User comments on post -> Meta sends webhook to `/api/automations/webhook`
2. Signature validated with `META_APP_SECRET` (main Tipote app)
3. Comment text matched against automation keywords
4. If match: reply to comment + send DM
5. DM: try Private Reply with MESSENGER token -> try with OAuth token -> fallback sendMetaDM

### Comment ID Format
Facebook webhook delivers `comment_id` as `{postId}_{commentId}` (e.g., `122103762561267846_1085560400414960`). The code tries both:
- Full format as-is
- Stripped: just the part after the last underscore

### Sender IDs
The `senderId` in webhook payloads (e.g., `26569999649251143`) is an **app-scoped user ID**. It's scoped to the app that receives the webhook (main Tipote app), NOT to Tipote ter. This is why `sendMetaDM` with `recipient.id` may fail even with correct permissions (different PSID scope between apps).

### The Ideal Long-term Solution
Get `pages_messaging` on the MAIN Tipote app through App Review. This eliminates:
- The two-app complexity
- App-scoped PSID mismatch issues
- The need for a separate MESSENGER_PAGE_ACCESS_TOKEN

## Mistakes to Avoid

1. **DO NOT keep changing the Private Reply code** - the cascade logic is correct and covers all known API variants
2. **DO NOT assume comment_id format is the issue** - both formats have been tested, both fail equally (the error is permission-based, not format-based)
3. **DO NOT add more endpoints/methods** - the two that exist (old private_replies + Send API) are the only documented ones
4. **DO NOT confuse webhook subscriptions with Send API permissions** - webhook subs are for RECEIVING events, Send API permissions (pages_messaging) are for SENDING messages
5. **DO NOT try to use OAuth token for DMs** - it doesn't have pages_messaging and that's by design (main Tipote app doesn't request it)
6. **The 551 error on the fallback (sendMetaDM with recipient.id) is EXPECTED** for users who haven't previously messaged the page - Private Reply is the correct approach, not direct DM

## Diagnostic Endpoint
`https://app.tipote.com/api/automations/webhook-diagnostic` - shows env vars, token status, recent webhook logs, automation config, and detected issues.

## Files
- Main webhook handler: `app/api/automations/webhook/route.ts`
- `sendFacebookPrivateReply()`: lines ~778-868 (Private Reply cascade)
- `sendMetaDM()`: lines ~870-902 (direct DM fallback)
- `sendInstagramDM()`: lines ~735-768 (Instagram DM, separate flow)
