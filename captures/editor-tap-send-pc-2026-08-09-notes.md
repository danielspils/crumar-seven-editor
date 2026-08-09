# USB-editor outbound tap, round 2 — Send PC toggle session (derived record)

Source: `window.__sevenTap` pasted verbatim into the working session (full paste
in the session transcript). Same tap as `editor-tap-2026-08-09-notes.md` — the
log is cumulative, so it repeats the seven `0x22` sweeps recorded there, plus
three later sweep pairs (16:53:14/15, 16:56:32/37/40 — patch changes while the
editor was open), and then the five frames that matter, verbatim:

```json
{"t":"2026-08-09T16:57:51.396Z","port":"Crumar Seven","hex":"f0 73 26 14 70 04 00 f7"}
{"t":"2026-08-09T16:57:51.396Z","port":"Crumar Seven","hex":"f0 73 26 14 32 00 00 f7"}
{"t":"2026-08-09T16:57:51.396Z","port":"Crumar Seven","hex":"f0 73 26 14 44 00 00 f7"}
{"t":"2026-08-09T16:57:51.396Z","port":"Crumar Seven","hex":"f0 73 26 14 72 0a 03 f7"}
{"t":"2026-08-09T16:57:58.513Z","port":"Crumar Seven","hex":"f0 73 26 14 30 03 01 f7"}
```

Context: at 16:57:51 the user clicked the editor's home (house) icon — the four
queries are the home page loading (string 4 = firmware string, globals, current
sound, ACTION 0x0A = storage). At 16:57:58 the user flipped **Send PC → YES**,
producing the `0x30` set-global that pins **glb index 3 = Send PC**.

Device-side replies and the subsequent slot-identified panel recalls
(`0x45` + 22 CCs + `Cn <slot>`) are in `send-pc-2-2026-08-09*.jsonl`.
Decoded findings live in docs/protocol.md ("Send PC" and "String/Action"
sections).
