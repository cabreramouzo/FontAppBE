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
iOS (02/10/2026): the chips are in the detail sheet's short card, so the offer appears
there, merged with the thanks into one row so the buttons stay inside the short card —
camera first, library second — also after a review queued offline; the photo is queued
too. Without the drops for now: the author does not want the game to eclipse the UI.
After the photo, still one at a time in that same slot: kind of water, drinkability,
name — each with "not now / I don't know" beside it. Never add the questions as rows
below the chips: in a sheet of fixed height they end up out of sight.

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
Once the form is sent, queued or discarded it must **never write the draft again**: late
changes while the form closes (a location fix moving the pin, the map reporting its
centre) re-saved the whole sent fountain, and the next "new fountain" opened with the
previous one's name and position (iOS field test, 02/10/2026).

### R2.5 Open editing, guarded location — Server
Anyone can edit information (name, description, type, drinkability). Location: only the
creator or an admin (or the `relocateAnyFont` capability). Edits are snapshotted and
revertible. Names: `fonts.name` may be **null** — show "unnamed fountain" in the
reader's language; never invent a name.

### R2.6 Photos — see section 11
Everything about photos (cover, review photos, other photos, EXIF, removal) is in §11.

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

### R4.5 Passing-by notices are for people who can check — iOS client
The local notice at a fountain's geofence is sent only with a fresh location fix and
positive Motion & Fitness evidence of walking, running or cycling. Suppress it for an
automotive activity, travel speed, or uncertain movement (including missing motion
permission or a failed background query). A stopped car is still a car. Suppressed
events do not consume the fountain's notice cooldown. This prevents prompts to people
driving past and avoids asking them to report what they did not inspect.

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

The rules below were read from the web's offline code (`lib/outbox.ts`,
`components/PendingUploads.tsx`, `PendingDetails.tsx`, `lib/offlineSession.ts`,
`lib/zonaOffline.ts`, `lib/zonaAlmacen.ts`, `lib/mapFallback.ts`, `lib/drafts.ts`,
`public/sw.js`) so a native client keeps them without re-reading it.

### R5.5 What is sent, in what order, and what is retried — Client
Items go out **in the order they were saved**, oldest first, and a flush **stops at the
first transient failure** (no network, 429, 5xx): a contribution is never dropped for
something that does not depend on it. A **401** marks the item "needs sign-in" and stops;
a new session clears that mark. Any other **4xx** (validation, fountain deleted, someone
put a photo meanwhile → 403) will never go in: **three attempts and it is dropped**, so it
does not block the queue for ever. A queued new fountain carries its first status with it
(a review of a fountain that does not exist yet cannot be sent); if that status fails
after the fountain was created, it is not queued again.
When it is flushed: when the network comes back, when the app returns to the front, after
signing in, and on the person's tap ("send now"). Native adds the background refresh; the
PWA cannot on iOS (no Background Sync).

### R5.6 The connectivity notice — Client
One notice on the map says the state of the queue, and **never says more than is true**:

| State | Title | Detail |
|---|---|---|
| offline, something pending | `offline.offlinePending` | `offline.savedSafe` |
| offline or server unreachable, nothing pending | `offline.banner` | `offline.connectionHint` |
| sending | `offline.syncing` | — |
| just sent everything (4 s) | `offline.synced` | `offline.syncedHint` |
| online, pending, some of another account | `offline.pending` | `offline.otherAccount` |
| online, pending, needs sign-in | `offline.pending` | `offline.needsLogin` |
| online, pending, a flush already failed | `offline.pending` | `offline.retryHint` |
| online, pending, not tried yet | `offline.pending` | `offline.pendingHint` |

It is **not shown** when online with nothing pending and nothing just sent.
- **Colour.** Pending work or a missing connection is **orange** — the app's colour
  for "this is not resolved" (MUI `warning`: `#ed6c02` on light, `#ffa726` on dark).
  "All synced" is green.
- **It shrinks.** After **3 s** the card becomes a small chip **with the same label**
  (so nothing is hidden), **even with things pending**: the queue can take hours, or never
  empty if what is pending is another account's, and a three-line card pinned over the
  map covers a third of it. The timer **re-arms on every real change** (network lost or
  back, number pending, session expired, another account's items) so news is seen whole;
  tapping the chip expands it and it shrinks again by itself. It does **not** shrink
  while sending or during the 4 s "synced" confirmation: both go away on their own.
- The chip must be tappable (web bug: it was drawn but inert inside a strip that ignores
  touches). Movement respects "reduce motion": the change is instant.
- Never claim success for what is only queued (R5.4).

### R5.7 See, copy and save what is waiting — Client
The person can always see what is on the phone and unsent (`offline.seeDetails`, from the
notice, whether it is a card or a chip). It exists because a stuck contribution left the
person blind: trust it is saved, or discard it and lose it. The list is **oldest first**;
each item shows its kind (new fountain / review / photo), the fields that carry something
(name, coordinates, water status, rating, text, fountain id), its **photo**, when it was
queued and how many attempts it has had, and is marked "another account" / "needs sign-in".
- **Copy all** puts **text a person can read** on the clipboard, in their language: per
  contribution its kind, the labelled fields (name, coordinates with a map link, water
  status, type, drinkability, rating, text), "photo attached", when it was queued and the
  attempts, separated by a blank line. **Never** JSON, internal keys, ids or file names, and
  never the photo bytes (the web copies JSON; a native client should not: nobody reads it).
  Say it was copied, or that it could not be.
- **Save the photo** must end **in the phone's photo library**, not in a share menu that may
  not offer "Save" (web: share sheet, the only route from a PWA; native has a real one).
  Ask only for add-only access, say the result (saved / no access, and where to allow it /
  failed), and put back the date and position read before compressing, since the queued
  JPEG carries no EXIF (R5.3).
- Empty list says there is nothing pending.

### R5.8 A way out: discard — Client
A contribution that can never go out (another account's, already published by hand,
rejected in a way the queue takes for transient) must not retry for ever behind a
permanent notice. Discarding exists, is **destructive** (the data exist only on this
phone) and therefore **asks first, saying how many**. It is small text, not a prominent
button: the exit must exist, not invite.
- If some items are another account's and some are the current one's, the discard offered
  is **only the other account's**; if all are of one kind, all of them.
- Shown when there is something pending and (something is another account's, or nothing is
  being sent right now).
- "Send now" is **forced**: it ignores any "in flight" mark. It is hidden when every
  pending item is another account's (nothing it could do), and replaced by "sign in" when
  the session expired.
- After deleting an account, what it queued can never be sent and is discarded with it.

### R5.9 The session survives no signal — Client
**Only a 401 signs out.** A network failure while restoring the account says nothing about
the token: keep the session and use the last known user (cached). Web bug: launching
without signal showed the app signed out ("My profile" led to sign-in, the add button said
"no session") and the queue had no owner. On a mountain, the worst moment for it.

### R5.10 A failed refresh never empties the map — Client
When `GET /fonts/map` fails (no signal, 429, 5xx) the pins already on screen stay: an empty
map reads as "no fountains here". A fallback replaces them **only if it has fountains**.
The fallback is the saved zone and what was seen before, and a saved zone stands in **only
if it covers at least half of the view**: zoomed out over a continent, a timeout must not
swap the map for the dozen fountains of one saved valley drawn as a single cluster. Outside
every saved zone say nothing false: no "nearby" list ordered by distance to fountains 900 km
away.

### R5.11 Saved zones (data first, map second) — Client
A saved zone is the **data** of a box, saved once: its fountains, from which "near me" is
computed on the phone (sort by distance, what the server does). Photos and map are a
**second step, offered with their size**, because they are two orders of magnitude bigger
(web estimate: 489 KB per photo, measured in production). A zone with no fountains is not
saved ("0 saved" in green would send someone to the mountain believing they carry it).
Sizes are shown as estimates and the real size after downloading. The zone says when it was
saved (data ages). Reviews and incidents are **not** saved: say so when showing from a zone
(`offline.fromZone`). The web saves one zone and no tiles (it pins the shell, fountains and
photos, and lets the browser keep the tiles seen); native can keep several zones and saves
the map with them (vector tiles are light: see `docs/vector-tiles.md`).

### R5.12 Map tiles are kept, and not asked for twice — Client
What the map has drawn stays on the phone, so a part already seen is never downloaded
again and is still there without signal. Web (`sw.js`): tiles of every base layer's host,
cache-first, up to **3,000** tiles (~18 MB), the **whole tile cache expires after 30
days** by one stamp (cross-origin tiles are opaque: no per-tile date), trimmed only when
the count is exceeded and **below** the limit (hysteresis), and **no timeout on tiles**
(aborting a tile is final: nobody asks for it again, and it queues nothing behind it,
since the tile hosts are not the API's). A tile from a **saved zone is never evicted** to
make room ("pinned"): what was prepared on Friday must still be there on Saturday after
browsing another valley. Native: MapLibre's ambient cache keeps every tile seen, evicting
the least recently used past its size; the zones' offline packs are separate and never
evicted; a saved zone's tiles are the ones kept for sure.

### R5.13 Reads and drafts survive no signal — Client
A read that fails for lack of network answers with what the same read returned last time
(fountain page, profile, news, favourites), stored **under the account** so another account
never sees it; never for something whose freshness matters and can be fetched (with signal
the app always asks). A fountain seen on the map opens its page without a saved zone: the
map's summary is kept and used when the page's read fails. Drafts (half-filled forms)
follow the drafts rule of the forms section: per account, text and choices only (never the photo), seven
days, cleared on send or explicit discard, never on close.

### R5.14 One notice, not two — Client
Offline or a failed server connection is said **once**. The map must not show the old
"no connection to the server" banner; its transport failure drives the orange connectivity
notice even if iOS still sees an available network path. Other errors (a 5xx, a rate
limit) keep their own banner.
The web's notice and the old error text are never stacked for the same fact.

### R5.15 A photo the person picked is always seen — Client
The photo of a form (new fountain, review, gallery) is a **placeholder, not two bare
buttons** (web `ImagePicker` with `placeholder`): a large dashed zone (≥ 96 px high) with a
camera and "Add photo"; tapping it offers *take* / *choose from library* (only *choose* if
there is no camera). Once there is a photo, its **thumbnail** (~140 px) stays visible with a
✕ to remove it. Between choosing and having the thumbnail there is a visible "working" state,
and if the file **cannot be read** the form says so. What must never happen: choosing from
the library and seeing the form unchanged — the person cannot tell "not chosen" from "chosen
and lost", and a fountain queued or sent **without its photo** looks like the app dropped it.
The photo is prepared once (R5.3) and the same bytes are what the queue keeps.
*iOS, 30/09/2026:* without signal the library option is hidden and the placeholder opens the
camera directly — a library photo kept in iCloud cannot be read offline on a phone. With signal
both are offered. The code has a TODO (`PhotoSlot.offersLibrary`). The web keeps both always.
A queued item that has a photo shows it in every place that lists the queue (R5.7 and the
profile's pending list), so it can be checked that it was attached.

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
- **R6.10 Imported routes (GPX).** The file is read on the device and never sent to the
  server: only the route's bounding box, widened by the largest corridor, is asked for.
  The fountains are ordered by route kilometre, the driest stretch counts both ends, and
  the GPX export keeps the EXCLUDED fountains (so a wider corridor brings new ones in).
  Where routes are remembered they stay private to the person (web: `localStorage` per
  account; iOS: the device and their own iCloud, never FontApp's server). When a client keeps **several** routes (iOS today,
  the web keeps the last one): every route not hidden is drawn on the map; one at a time
  is *open* (its fountains loaded, a chip naming it on the map); hiding is per device and
  closes it; name and colour belong to the route. Colours come from a **closed palette**
  that avoids the water-status green/amber/red and the staff purple (R6.7) — a free
  picker would draw lines that read as water states. New routes take the next colour.
  Deleting asks first; renaming to blank is ignored. **Only the route's fountains**
  (iOS, 03/10/2026): a switch, per device and only while a route is open, that leaves on
  the map just the fountains inside the open route's corridor and no clusters, so the
  line can be read. It never shrinks the pins (touch targets, R-touch) and never hides
  every fountain (the water is what the route is for); filters still apply on top. — Client

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

## 11. Photos

The rule behind all of them is one **asymmetry**: adding where there was nothing can
only improve a fountain; replacing or removing someone's photo is a decision about
their work. [«La foto de la reseña es la foto de la fuente», «Fotos de una fuente»]

### R11.1 Three places a photo lives — Server
- **Cover** (`fonts.image`): the fountain's photo, one per fountain.
- **Review photo** (`font_comments.image`): part of what someone reported that day.
- **Other photos** (`font_photos`, `GET /fonts/:id/photos`): extra photos with a kind.
  Loaded **only when opened** — no count on the detail page (it would cost a count per
  fountain on the map).

### R11.2 The first cover anyone, replacing only creator or admin — Server
`PUT /fonts/:id/photo` sets the cover; anyone signed in may set the **first** one (most
imported fountains have no creator to ask). Replacing an existing cover is the creator's
or an admin's (403 `font.photoExists`). Every cover change leaves an edit in the history,
so it is revertible from the panel. It is **its own action, not a review**: never make
someone fill a status or rating to add a photo.

### R11.3 A review photo becomes the cover when there is none — Server
Publishing a review with a photo on a fountain without cover **adopts it as cover**
(copied, so deleting the review keeps the cover). It **never replaces**. The response
says it (`coverAdopted`); **say it out loud** ("your photo is now the fountain's"), and
tell the user **before** choosing the photo that it will be. "Use as main photo" on a
review follows R11.2's permissions. A failed adoption never costs the review.

### R11.4 Undo your cover for 5 minutes, then ask — Both
Whoever set the current cover can **undo it for 5 min** (`GET
/fonts/:id/photo-removal-request` → `canUndo`; server checks the time too, 403
`font.photoUndoExpired`). After that, they can only **request its removal**
(`POST`/`DELETE …/photo-removal-request`, `canRequest`/`pending`), which a moderator
approves. The request is tied to **the exact edit** that installed the photo: an old
request can never remove a cover someone replaced later. Creator/admin just remove it,
confirmed first. Removal controls only on the cover slide.

### R11.5 Other photos: kinds and who — Server
Kinds (`PhotoKind`): `fountain` · `context` · `document`. A **document** (e.g. a water
quality report) is shown apart, with a "provided by whoever had it, not certified by the
app" note, and **never competes for the cover**. Who may upload: `document` anyone
signed in (the person who has it may have registered this morning); `fountain` and
`context` need **level 3** (`addSecondaryPhoto`) and at most **3 per person and
fountain**. Only say what is really missing when blocked (R7.6). Captions optional.
Delete: the uploader or a **moderator** — not the fountain's creator (it is not theirs,
and it may be someone's analysis). Photos can be flagged (`content_flags` type `photo`).

### R11.6 Offer the camera and the library — Client
Wherever a photo is added (new fountain, review, cover slot, other photos, after a quick
review), offer **take a photo** and **choose one**. Standing in front of the fountain is
when there is something to photograph. Hide "take" on devices without a camera.

### R11.7 Prepare once: EXIF first, then compress — Client
`POST /images` (jpg/png/webp, max 8 MB, **30 uploads/h per user**, 429
`image.rateLimit`). Read the original's date (`DateTimeOriginal`) and GPS **before**
compressing, and send them as separate meta fields: re-encoding strips EXIF, and reading
it afterwards returns nothing without any error. Compress to the web's size (longest side
1280 px, JPEG 0.72). A **camera shot** has no EXIF: send the current date and the fix if
permission is granted and its accuracy is usable. Prepare **once** — preparing again in
the offline branch would queue it without EXIF.

### R11.8 EXIF is for moderation only — Server
Stored per image (`photo_exif`), shown **only to admins** (`GET /images/meta`, 403 to
everyone else, the uploader included), and shown as **the distance to the fountain**,
never coordinates. It is claimed by the client and cannot be verified: it guides a
person and **never voids points or hides anything by itself**.

### R11.9 Offline photos — Client
A photo taken without signal goes to the outbox (the cover as `kind: photo`, a review's
with its review, a new fountain's with the fountain), with its meta, under the account
that took it. Drafts do **not** keep the photo: the form says to choose it again.

### R11.10 Where to ask for a photo — Client
- The empty cover slot is **discreet** (one thin row): almost every fountain lacks a
  photo, and a loud slot would push photos over "how is the water", which is what the
  app is for.
- After a quick review, offer a photo **only if the fountain has none** (R1.7), with the
  drops it pays from `/gamification/scale`; then after the photo, ask the status.
- Nobody signed out gets a tappable slot; it says what to do instead.

### R11.11 Showing photos — Client
Carousel: cover first, then review photos by review date, each labelled (cover vs review,
date, author, reported status). Only the active slide is loaded, the next prefetched, no
autoplay. The shortcut to the latest review's photo only if that review is the latest and
under 30 days old (confirmations never refresh a photo's age). Fullscreen viewer with
pinch and double-tap zoom. Photos are **CC BY-SA 4.0**, credited to FontApp and its
contributors.

## 10. What not to port to native clients

Web/PWA workarounds that native does not need: service-worker caching and shell
versioning, `lib/iosRelayout.ts`, `lib/staleChunk.ts`, the safe-area probe, install
page and prompts, `localStorage` quirks, the crawler gate and Pages Functions.
