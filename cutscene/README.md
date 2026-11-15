# Red Harvest intro cutscene (Remotion)

Pre-rendered clip that plays after **Start survival**: a burning rocket descends toward Mars, crashes, then fades to black into gameplay.

## Setup

```sh
cd cutscene
npm install
npm run dev            # Remotion Studio preview at the printed URL
```

The clip is `src/Composition.tsx`: a 320×180 canvas drawn frame by frame (pixel art in the game's palette) and scaled 4× with hard edges. Beats: 0–4.5 s burning descent, 4.5 s impact flash and shake, 4.5–7 s burning wreck, 6–7 s stepped fade to black.

```sh
npm run sfx          # regenerate public/sfx/fire.wav (procedural fire, impact and crackle)
npm run render:game  # render ../public/assets/cutscene/intro.webm and intro.mp4 for the game
npm run stills       # a few PNG frames in out/ for review
```

The game plays the WebM (MP4 fallback) in `src/scenes/CutsceneScene.js` and re-renders are picked up on the next game build.

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
