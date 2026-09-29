# FontApp client rules

The product rules every FontApp client must keep: web, iOS, Android. They are decisions,
not accidents; each one records a reason, usually a real report or a measurement.

**How to use it.** Before building a screen in a new client, read the sections it touches.
Each rule says **who enforces it**:

- **Server**: the API decides. A client cannot break it, only show it well.
- **Client**: every client must do it by itself. This is where new clients go wrong.
- **Both**: the client mirrors a server rule to avoid showing an action that would fail.

The reference implementation is the web (`web/src/lib/*.ts`, pure and tested). When this
document and the code disagree, the code wins — then fix this document. Longer reasoning
lives in `CLAUDE.md` (search the section named in brackets).

Numbers that come from the server (drops, levels, the scoring curve) are **never written
in a client**: read them from `/gamification/scale` and the API. They have changed before.

**Rule of thumb for new rules:** if a rule can live in the server, put it there. The
server decides with fresh data, the offline outbox gets it for free, and a new client
cannot forget it. `confirmIfUnchanged` is the model to follow.

---

## 1. Water status and reviews

### R1.1 The three chips — Client
One-tap review offers exactly three statuses: **flowing, trickle, dry**. Never `unknown`
(says nothing from someone standing in front of it) nor `gone` (two `gone` reports from
different people retire a fountain; too costly for one tap). Applies to every shortcut:
map popup, detail page, "how does it flow?" after a photo, route list, "passing by".
The full review form offers every status. [«Reseñar desde el globo del mapa»]

### R1.2 One tap is one review — Client
After a chip is sent, the chips give way to the thanks message (and undo). A second tap
must not be able to publish a twin. Undo brings the chips back.

### R1.3 A repeated chip is a confirmation, decided by the server — Server
Chips send `confirmIfUnchanged: true`. The server turns the review into a "still the
same" when **all four** hold: status only (no text, rating or photo), **same** status as
the latest report, the latest report is **someone else's**, and it is **recent**
(`ContributionScore.quickConfirmDays`, 7 days). Response is 200 with
`confirmedInstead: true` and the backed report (its `id` is what undo uses). Say it with
different words (`popup.confirmedThanks`) and **don't** recolour the pin: the status did
not change, only the confidence. The outbox queues the same intent, not a decision.
[«Tocar el chip que ya consta es CONFIRMAR»]

### R1.4 Your own recent report: same status is noise, a change is news — Both
Two different things, and mixing them was a bug (iOS, 09/2026):
- **A new report** is always allowed, by anyone, at any time — a change of status is
  exactly what the app wants to hear, and the full review form never blocks it.
- **Repeating your own status** adds nothing: no corroboration, and within a day not
  even freshness. Confirming your own report ("still the same") is refused for **24 h**
  since the report and since your last self-confirmation (server:
  `FontCommentController.selfConfirmCooldown`, 403 `confirm.tooSoon`; web:
  `lib/selfConfirm.ts`).
So while the latest status report is yours and inside that window, the chip of **that
same status** is disabled (with "you said so {when}; if it changed, tap the new one"),
the **other chips stay available**, and "still the same" is hidden. This includes the
status given when **creating** the fountain, stored as its first review.
Self-confirmations refresh the date but never add corroboration and never score.
**The server enforces it** (09/2026): a status-only review (no text, rating nor photo)
that repeats the status of your own latest report, less than 24 h old, is not saved and
gets **409 `comment.alreadyReported`** (`err.comment.alreadyReported`). An error and not
a 200 on purpose: nothing was created, and an old client given a 200 would offer "undo"
on the returned id and delete the original. The outbox treats it as final and drops it.
Clients still disable the chip so the error is rarely seen.

### R1.5 Undo for 10 seconds — Client
A review changes the pin for everyone, pays drops and, if `flowing`, auto-resolves open
incidents. Every quick review can be undone for **10 s**: delete the review, or withdraw
the confirmation if it became one. After that it is a normal review, deleted from the
detail page. Queued (offline) items are undone by removing them from the outbox.

### R1.6 Recolour the pin at once — Client
After a review (not a confirmation), the fountain's pin takes the new status colour
immediately; undo restores the previous one.

### R1.7 Then the photo, never before — Client
After a quick review, offer a photo **only if the fountain has none**, with the drops it
pays read from `/gamification/scale` (no number if unknown). Order of usefulness:
status → photo → rating → text. After adding a photo, ask the status ("how does it
flow?") with the three chips. [«Y después del toque, la foto»]

### R1.8 Water confidence is a category — Both
`web/src/lib/confidence.ts`. Levels: **confirmed** (`verified`) · **recent** ·
**conflicting** (`disputed`) · **old** (`stale`) · **never checked** (`unverified`).
- Freshness window **30 days**; a confirmation refreshes the latest report's date.
- Confirmed: the latest report has ≥ 1 independent confirmation, or ≥ 2 distinct
  identified authors reported status in the window.
- Families: `flowing`/`trickle` = water; `dry`/`broken`/`gone` = unavailable. Both
  families in the window → **conflicting**, and conflicting beats the last status
  everywhere (lists, route rows, cards). `unknown` is ignored.
- Freshness is shown as a neutral timestamp ("Last report: …"); green means water, not
  recency. The map filter "only confirmed" excludes everything but `verified`.

### R1.9 Remote reviews: ask, note, never block — Both
`lib/remoteReview.ts`. Clearly far = **> 1 km after subtracting the fix accuracy**;
ignore fixes with accuracy ≥ 1 km or older than **3 min**. Then ask "have you seen it
recently?" **once per fountain per session**, and send `remoteDistanceM`. Only with
location permission **already granted** — never request it here. Never wait more than
~1.2 s for a fix; no fix, no question. Also asked before "still the same" (not stored
there). Not asked in "Water on my route" (reviewing from home is its purpose). The
server stores a rounded distance only, never coordinates, and never exposes it publicly.
[«Reseñar lejos de la fuente»]

### R1.10 Water recovery — Server
Only `dry`/`broken`/`gone` → `flowing`/`trickle` counts as "recovered" and notifies
followers as such. Repeated water reports do not. Wording: it is a report, not a
guarantee.

## 2. Adding and editing fountains

### R2.1 Where the pin starts — Client
`lib/newFontPlacement.ts`. If the map centre is within **250 m** of the user, the pin
starts **at the user**; otherwise at the map centre, and it never silently jumps back to
the user. Without location permission, the map centre. A long press on the map places it
exactly there (strongest intent). Beyond 250 m the form says the distance in km, asks to
check the point and encourages a photo.
**Use a precise fix.** A coarse, power-saving location (e.g. 100 m accuracy) puts the
pin visibly off the person. While placing, ask for best accuracy and keep moving the pin
to better fixes until the user moves it by hand (iOS learnt this in the field, 09/2026).

### R2.2 Duplicate warning names the neighbour — Both
Server answers 409 if another fountain is within **25 m**; the client asks first, naming
**the nearest** one and the metres ("3 m away there is «Font de la Vall». It may be the
same fountain under another name"). The user can confirm it is different.

### R2.3 Daily limit for new accounts — Server
New accounts may add **5 fountains/day**. Past it, offer to request an exemption.

### R2.4 Drafts survive — Client
`lib/drafts.ts`. New fountain, review, comment/incident and fountain edit save what is
typed **while typing**, per account, for **7 days**. Closing the form keeps the draft
(sheets close by swiping); sending — also to the outbox — or an explicit discard removes
it. Nothing is written until the form has had content (an empty form must not overwrite
the previous draft). The photo is not kept: the form says to choose it again. A
half-filled new fountain comes back with a notice (continue / discard), not by itself.

### R2.5 Open editing, guarded location — Server
Anyone can edit information (name, description, type, drinkability). Location: only the
creator or an admin (or the `relocateAnyFont` capability). Edits are snapshotted and
revertible. Names: `fonts.name` may be **null** — show "unnamed fountain" in the
reader's language; never invent a name.

### R2.6 Photos: add yes, replace no — Server
The **first** cover photo can be set by anyone (`PUT /fonts/:id/photo`, a single
action, not a review). Replacing is creator/admin. A review photo on a fountain without
cover becomes its cover automatically (`coverAdopted` in the response — say it). Tell the
user **before** choosing the photo that it will become the fountain's. Secondary photos:
`document` anyone signed in; `fountain`/`context` need level 3 and max 3 per person and
fountain. Documents never compete for the cover and carry a "not certified" note.
Delete: uploader or moderator, not the fountain's creator.

### R2.7 Drinkability — Client (ordering), Server (values)
Values: `yes` · `untreated` · `conditional` · `no`, plus unknown (`null`). Order is
**most guarantee first**: yes, untreated, conditional, no. `untreated` is not "not
potable" and must not hide fountains. The map **does not** hide non-potable fountains
by default. The (?) help explains every type and drinkability, includes "unknown" (the
one confused with "untreated") and closes with "no natural fountain has sanitary
guarantee". Where there is a choice to make, tapping a row in the help selects it.

### R2.8 A new fountain is on the map at once, and visible — Client
After "created", the author must **see** the fountain there, or they add it again and a
duplicate is born (it happened on the web and on iOS, 09/2026). Three causes, three
musts:
- **Don't wait for a reload.** Insert the created fountain into the map's data right
  away, and keep it for a while even if an answer for the area does not bring it yet
  (caches, in-flight requests). The server's copy wins when it arrives.
- **Filters never hide it.** A new fountain is always "never checked", so "only
  confirmed" or "only with water" would hide it in front of its author. Exempt it from
  the filters for a while (iOS: 30 min).
- **The location dot covers it.** It was created exactly where the person stands, so the
  blue dot is drawn on top of the pin. Select it after creating (raised pin, its card
  open), which also invites the next step (photo, status).
Queued (offline) fountains have no id yet; say they are saved on the phone.

### R2.9 Duplicates: anyone suggests, a moderator decides — Server
`POST /fonts/:id/report` with `duplicateOf` is a suggestion; it hides nothing and is
never an incident. Marking as duplicate is level 5 / staff. Whoever can mark does not see
"suggest".

## 3. Incidents, comments and replies

- **R3.1** The comment box is for comments; an **incident** is an explicit mark
  (`isIncident`, with `IncidentKind`: broken · dry · dirty · access · other, asked only
  after marking). Only incidents count as open failures, appear in news, pay drops, push
  and can be resolved. A comment cannot be resolved (don't show the button). — Server
- **R3.2** Reporting an incident makes the fountain a favourite (so the reporter hears
  back). — Server
- **R3.3** A comment can be edited by its author for **1 hour** (`lib/reportEdit.ts`;
  403 `report.editWindowOver`); show "edited". Editing does not re-notify mentions. — Both
- **R3.4** Replies: one level only; a reply is never an incident; deleting the parent
  keeps the replies. Replies push (someone is talking to you); likes don't. — Server
- **R3.5** Likes on comments are social: bell only, never push, never score; no "0". — Both

## 4. Notifications

### R4.1 Push vs bell — Server (content), Client (respect it)
A system notification only for what **changes what you are about to do**: a followed
fountain went dry/broken/gone, was hidden, has a new incident; someone talks to you
(mention, reply); your incident was resolved. Everything else — `flowing` reviews,
likes, "still the same" on your review, levels, badges — goes to the in-app **bell**
only. An app gets muted once and never unmuted. Never notify the actor. Muting a push
group never mutes the bell.

### R4.2 Push texts come from the server — Server
`PushCopy`, in `users.lang`. Bell items carry a **code** that the client translates;
unknown codes fall back to a generic text, never a raw key. All pushes about the same
fountain share a tag/thread so the newest replaces the previous one.

### R4.3 Ask for permission well — Client
Ask inside a user gesture, with nothing slow in front of it. Never ask if the server has
no keys. Explain denied / unavailable states. Push preference groups
(`push_font_updates`, `push_mentions`, `push_admin`) appear only once push is on.
The bell is fetched on load and on returning to foreground, never polled; `GET` does not
mark as read — opening the panel does.

### R4.4 Following = favourite — Server
There is no separate subscription: a favourite is followed.

## 5. Offline

### R5.1 The outbox has an owner — Client
`lib/outbox.ts`. Every queued contribution stores the **account that made it** and is
only sent under that account; items of another account wait, they are not discarded.
Items without owner (legacy) are sent. Offer a confirmed way to discard pending items.
Don't offer "send now" when every pending item belongs to another account, and say
which of the problems it is (no signal / other account / rejected).

### R5.2 Same intent offline — Client
Queue the same payload the online path sends (e.g. with `confirmIfUnchanged`,
`remoteDistanceM`) and send `X-FontApp-Queued-Offline: 1`. Never queue a decision made
on stale data.

### R5.3 Photos keep their facts — Client
Compress (web: longest side 1280 px, JPEG 0.72) and send the EXIF date/GPS as separate
fields (`POST /images` meta), because re-encoding strips EXIF. Prepare once; a second
preparation in the offline branch would lose the EXIF. Camera shots without EXIF get the
current date and a good fix.

### R5.4 Say what happened — Client
Never claim upload success for a queued item ("saved, will be sent"), and never invent
community impact figures.

## 6. Map, location and navigation

- **R6.1 Map loading.** `GET /fonts/map` with bbox and viewport size; clamp lat to ±90
  and long to ±180 (else 400). Individual summaries up to 3,000, server clusters above.
  Discard stale responses (sequence number / cancellation). — Both
- **R6.2 Throttle while following.** When the map moves by itself (following the user,
  navigation arrow), load at most once every **~6 s**; exploring by hand loads at once.
  Any listener on map-move must be cheap: it may fire at 60 Hz. The web once burned the
  600/h limit in 3 s. — Client
- **R6.3 429 is visible.** Show a notice with the wait (`Retry-After`), let it clear and
  reload by itself; never retry in a loop. Translate by HTTP status. — Client
- **R6.4 Location permission** is never asked on launch out of the blue; locate
  automatically only if already granted and the user did not arrive at a saved view or a
  fountain link. The map follows the user until they pan/zoom. Filter GPS jitter (web:
  15 m) and reload "near me" only when the position changes cell (~100 m). — Client
- **R6.5 Default view** without saved view nor permission: the user's country, guessed
  from the device time zone; unknown zones fall back to Madrid. — Client
- **R6.6 Last metres** (`lib/approach.ts`): arrow only under **150 m**; stop pointing
  when the accuracy makes the arrow a lie; "you are there" only within **5 m real
  distance** (independent of accuracy). In between, "near", no arrow, point to the photo.
  No reliable compass → no arrow. Uses precise location only on this screen. — Client
- **R6.7 Staff colour.** Moderator and above see contribution buttons in staff purple
  `#7c3aed`, so they never contribute as staff by mistake. — Client
- **R6.8 Attribution.** OpenStreetMap (ODbL) and ICGC/ACA (CC BY 4.0) on the map, plus
  any base layer's own. Community data is ODbL, photos CC BY-SA 4.0. — Client
- **R6.9 Hidden fountains.** Moderation state is `visible`/`pending`/`hidden`; a link to
  a hidden fountain still opens and explains why it is not on the map. — Both

## 7. Accounts, errors and language

- **R7.1 Auth.** `POST /auth/login` (Basic) → `{ token, expiresAt, user }`, then Bearer.
  Store the token in the platform's secure store. Sessions expire after six months
  without use. Google, Apple (iOS) and passkeys (RP ID `fontapp.net`). — Server
- **R7.2 Errors by code.** Errors carry `reason` (Spanish, for logs) and often `code`
  (e.g. `user.emailTaken`). Translate `err.<code>`; fall back to `reason` only for
  unknown codes; never show a raw key. — Client
- **R7.3 Languages.** ca (default), es, gl, eu, en, fr, pt (European), it. Reuse the
  wording in `web/src/i18n/dictionaries.ts`; it has been refined. — Client
- **R7.4 Signed out still sees the actions.** The add button, the chips and the photo
  slot are shown without a session and lead to sign-in (or explain), instead of
  disappearing: 9 of 10 visits are anonymous. A long press without session drops the pin
  and offers to register without leaving the map. — Client
- **R7.5 Usernames** follow `Mentions.isMentionable` (`[a-zA-Z0-9_.-]{3,30}`), the same
  rule mentions use. — Server
- **R7.6 Capability notices** say what is really missing (`lib/capabilityNotice.ts`,
  `grant.blockedBy`, active days vs required) and say nothing to who already can; while
  unknown, say nothing. — Client

## 8. Rate limits — Server

Map reads 600/h per IP; `/activity` and zones 120/h; photo uploads 30/h per user; new
accounts 5 fountains/day; `GET /fonts` requires a search term and page ≤ 5. A 429
carries `Retry-After` (R6.3).

## 9. Interface

- **R9.1 Touch targets** ≥ 44 pt; thumb controls (chips, sheet buttons, save bar) 48.
  Pins keep their drawing and grow a transparent target, extended upwards. — Client
- **R9.2 One interruption at a time**, by priority: intro/welcome → badge → what's new →
  install → survey. Install from the 2nd session, survey from the 3rd. — Client
- **R9.3 Save and discard** are anchored at the bottom on phones; hierarchy by weight,
  not red/green. Discard asks only if something was touched. — Client
- **R9.4 Long text** (description, reviews) folds at 300 characters on a space with "see
  more" (only if > 60 characters are hidden) and never folds back. — Client
- **R9.5 Don't offer an action that can only fail** (resolve a comment, "send now" on
  other-account items, confirm your own report too soon). — Client
- **R9.6 Confirmations come from what asked, on the screen you are on.** A "delete?" or
  "discard?" is attached to the control or row that triggered it, never to the page:
  on iOS 26 a confirmation dialog springs from the view it hangs on (Apple's current
  action-sheet guidance), so hung on a page it floats at the top, and hung on a page
  underneath a pushed screen it opens on the wrong screen (09/2026). From a menu, hang
  it on the menu's button. Android: a bottom sheet or dialog from the current screen. — Client
- **R9.7 Hidden easter eggs** never grant drops, permissions, badges nor analytics, and
  respect reduced motion. — Client
- **R9.8 Every badge or level drawn is tappable** and opens it large, with its name, what
  it is for and a subtitle (who earned it, or what is missing if it is still free) —
  profile, showcase, guide and the fountain detail alike (web `Abrible`, iOS
  `BadgeShowcaseView`). Only the drawing is the button, so a name beside it keeps its
  own link to the profile; round badges grow a 44 pt target around the art. A badge that
  cannot be opened reads as decoration, and "still free" only works as an invitation if
  you can find out what it is (09/2026). — Client

## 10. What not to port to native clients

Web/PWA workarounds that native does not need: service-worker caching and shell
versioning, `lib/iosRelayout.ts`, `lib/staleChunk.ts`, the safe-area probe, install
page and prompts, `localStorage` quirks, the crawler gate and Pages Functions.
