# Red Harvest cutscenes (Remotion)

Two pre-rendered clips:

- **IntroCrash** (7 s, `src/Composition.tsx`): plays after **Start survival** or **Land**. A burning rocket descends, crashes, then fades to black into gameplay.
- **OutroRescue** (8 s, `src/Outro.tsx`): plays after a successful rescue. Top-down: the rescue ship lifts off the pad, the base (hab, greenhouse plots, comms dish, solar panels, old crash site) shrinks until Mars is a small globe, and the ship leaves. The game overlays the "Rescued · <colony> · Sol N" card so it can show the player's colony name.

Shared palette and pixel helpers live in `src/pixel.ts`.

## Setup

```sh
cd cutscene
npm install
npm run dev            # Remotion Studio preview at the printed URL
```

The clip is `src/Composition.tsx`: a 320×180 canvas drawn frame by frame (pixel art in the game's palette) and scaled 4× with hard edges. Beats: 0–4.5 s burning descent, 4.5 s impact flash and shake, 4.5–7 s burning wreck, 6–7 s stepped fade to black.

```sh
npm run sfx          # regenerate public/sfx/fire.wav and liftoff.wav (procedural, no samples)
npm run render:game  # render intro.* and outro.* (WebM + MP4) into ../public/assets/cutscene/
npm run stills       # a few PNG frames in out/ for review (stills:outro for the ending)
```

The game plays the WebM (MP4 fallback) in `src/scenes/CutsceneScene.js`; `src/ui/startMission.js` decides when each clip plays and re-renders are picked up on the next game build.

If Remotion can't download its own browser (sandboxed machines), point it at an installed Chrome:

```sh
REMOTION_BROWSER_EXECUTABLE=/usr/bin/google-chrome npm run render:intro
```

## Assets

The current clip uses no image files. To swap in generated art (ChatGPT Pro, PixelLab), put it in `public/art/`, draw it with `staticFile('art/<name>.png')` in place of the code-drawn layer, re-render, and turn on the `aiLabel` prop. See `ASSET_PROMPTS.md` for prompts that match the current shots. AI-generated imagery must show the "Contains AI-generated imagery" label (the `aiLabel` prop) per the Space Apps rules.

## Agent skills

Install Remotion's agent skills with `npx remotion skills add` (versions are pinned in `skills-lock.json`; the skill folders are git-ignored). Claude Code picks them up from `.claude/skills/` when working in this folder. Start from `remotion-best-practices`.

## Licence

Remotion is free for individuals and teams of up to three, which covers this hackathon project. See https://www.remotion.dev/docs/license.
