# Enum-label sweep, 2026-08-09 — the device labels its own values

Method: for every parameter with `max <= 9`, snapshot the current value
(`0x22`), write each value in range (`0x20`, edit buffer only — nothing
stored), read back the `0x23` reply, and record its 4th field — the device's
own display string. Original value restored and verified by read-back for all
20 parameters. FW 1.37.

This closes the enum-labels open item from the original interrogation
("cosmetic, needs a human reading labels off the editor") — no human needed;
the display strings come from the instrument.

## Harvested labels (value 0 → max, in order)

```
rho_tp   (id   0): Wurlish | Piano Bass | Sweet | Prepared | So dark | Wanna-be-Dyno | Hard tines | Mellow tone | Default e.piano
zd6_ab   (id  29): B | A
zd6_cd   (id  30): D | C
zd6_sf   (id  31): OFF | ON
zd6_md   (id  32): OFF | ON
zd6_tr   (id  33): OFF | ON
zd6_br   (id  34): OFF | ON
dx7_tp   (id  36): KP1 PM EPiano | Brass | Marimba | Organ | E.Bass | Wurlish | Crystal | Suitcase | Original EP
vib_type (id  38): Keyboard | Mallets
veq_byp  (id  73): Bypass OFF | Bypass ON
fx1_sw   (id  74): OFF | ON
fx1_md   (id  75): Mono Tremolo | Stereo Panner | LFO Wha-Wha | Pedal Wha-Wha
fx2_sw   (id  78): OFF | ON
fx2_md   (id  79): Chorus | Phaser | Flanger | Delay
pha_st   (id  82): 2 STAGES | 4 STAGES | 6 STAGES | 8 STAGES
amp_sw   (id  89): OFF | ON
amp_mo   (id  91): TWIN | AC | JCM | RJC | BASS
rev_sw   (id  95): OFF | ON
pad_sw   (id 104): OFF | ON
exp_fn   (id 107): Volume | FX 1 Depth | FX 2 Depth | FX 1 + 2 Depth | FX 1 Rate | FX 2 Rate | FX 1 + 2 Rate | Amp Drive | Pad Level | Pad Blend
```

## Corrections to the previous manual/editor-derived guesses

- **`zd6_ab` and `zd6_cd` were INVERTED**: value 0 displays "B" (resp. "D"),
  value 1 displays "A" (resp. "C"). The schema's old A/B, C/D order was wrong.
- `fx1_md` 1 is "Stereo Panner", not "Stereo Auto-Panner".
- `fx2_md` labels carry no "Stereo" prefix: Chorus / Phaser / Flanger / Delay.
- `amp_mo` 1 is "AC" (not "AC30") and 3 is "RJC" (not "Jazz Chorus").
- `pha_st` labels are "N STAGES", not bare numbers.
- `veq_byp` displays "Bypass OFF"/"Bypass ON" — value 1 = bypass engaged,
  confirming the inversion semantics used by the renderer.

All labels now live in `schema/seven-1.37.json` (`values` arrays,
`valuesSource: "device display sweep 2026-08-09 (0x23 field 4)"`); no
`valuesUnverified` flags remain.
