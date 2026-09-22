# Tripo pipeline report — 3 rigged, animated card-table characters

Date: 2026-09-22 · Profile `default` · region `ov` · CLI: `tripo-cli` (npm -g)
Deliverable: rigged + animated GLBs for **yolanda**, **ramon**, **manuel** (three.js browser game, no Godot/Blender steps).
Style brief (all three): stylized 3D game character, clean topology, slightly caricatured adult proportions, matte stylized textures, full body, neutral standing pose, no background.

## Credits

| step | per character | ×3 |
|---|---|---|
| `text_to_model` (v3.1) | 20 | 60 |
| `anim check` (rig-check) | 0 (free) | 0 |
| `anim rig` (`model=rig-v1.0`) | 25 | 75 |
| `anim retarget` (3 presets × 10) | 30 | 90 |
| **total** | **75** | **225** |

Opening balance **1690** → closing balance **1465** (`tripo balance --json` → `{"balance":1465,"frozen":0}`).
Budget was 600 credits; spent 225. **No failures, no retries, no refunds** — every task returned `status: success` on the first attempt.

## Exact commands (staged, gated on the previous result)

```bash
# 0. gate
tripo doctor                       # ok, balance 1690
tripo make "<prompt>" --dry-run --json --yes --name <name>   # offline validation, 0 credits

# 1. generate (text-to-3D, v3.1-20260211 — CLI default, 20 credits each)
tripo make "<prompt>" --json --yes --name <name> -o <scratch>/<name>/gen --timeout 1200

# 2. rig-check — FREE, gates the rig spend
tripo anim check <gen_task_id> --json --yes --name <name>-rigcheck -o <scratch>/<name>/check
tripo task get <check_task_id> --json     # -> {"riggable":true,"rig_type":"biped"}

# 3. rig — standalone (global -p params only land on the FIRST command of a chain,
#    so model=rig-v1.0 must be its own command against the generation task id), 25 credits
tripo anim rig <gen_task_id> --rig-type biped -p model=rig-v1.0 --out-format glb \
      --json --yes --name <name>-rig -o <scratch>/<name>/rig --timeout 1200

# 4. animate — ONE retarget call per rig (3 clips, in-place), 30 credits
tripo anim retarget <rig_task_id> --animation preset:biped:idle preset:biped:sit preset:biped:look_around \
      --animate-in-place --out-format glb --json --yes --name <name>-anims \
      -o <scratch>/<name>/retarget --timeout 1800

# 5. ship
cp <scratch>/<name>/retarget/tripo-out/*/model.glb  assets/characters3d/<name>/<name>.glb
```

Generation prompt template (all < 300 chars):
`<brief>, stylized 3D game character, clean topology, slightly caricatured adult proportions, full body, neutral standing pose, no background`

- yolanda: `a proud warm Dominican woman in her late 50s, short curly dark hair with grey streaks, small gold earrings, a floral house dress, confident knowing smile, …`
- ramon: `a big friendly Dominican man around 40, dark skin, short black hair, light beard, a clean white guayabera shirt, open relaxed smile, …`
- manuel: `a wiry cheeky Dominican man in his 60s, grey moustache, a worn flat cap, an undershirt with an open short-sleeved shirt over it, mischievous grin, …`

## Task ids

| character | generate | rig-check (free) | rig (rig-v1.0) | retarget |
|---|---|---|---|---|
| yolanda | `b1ce7fab-c335-4dd1-b7ea-55ee561bc4c6` | `30de94c4-9027-44b1-933e-532c8693dfb3` | `3f237170-3b57-45d1-ac61-7c6c4adbdd4f` | `ad84e59c-5708-4caf-a83f-838e5d28c370` |
| ramon | `ba0c138c-49e3-4ef7-88d1-73de91f9cb2d` | `cbb06f38-74db-4ae5-a739-b6c4f273c45f` | `13bd3c4a-e530-486f-824d-00abc958c189` | `acda6880-1ee1-4efc-aaee-9c08681f0a63` |
| manuel | `b3444b98-0cac-4178-859b-67b746801b15` | `7136be61-8ef6-4337-86df-0084a401f931` | `12503b63-6152-4553-8952-c26832bffc9e` | `66d75e5a-a393-4d9b-aa8a-89d1ad85cd36` |

## Rig-check verdicts

All three: `{"riggable": true, "rig_type": "biped"}` — first try, no prompt tweak needed.

## Rig verdict (leg-bone check, from the shipped GLB's `skins`)

`model=rig-v1.0` was used deliberately: the CLI default rig model is v2.x, which has produced a **legless** biped (all lower-body verts weighted to `Root`) in past runs. Verified in the shipped files:

- **41 joints**, identical set on all three: `Root, Hip, Pelvis, L_Thigh, L_Calf, L_Foot, L_ToeBase, L/R_*Twist01-02, R_Thigh, R_Calf, R_Foot, R_ToeBase, Waist, Spine01-02, NeckTwist01-02, Head, L/R_Clavicle, L/R_Upperarm(+Twist), L/R_Forearm(+Twist), L/R_Hand`.
- Leg bones present on both sides → the legged rig, not the legless one.
- Bone names + rest pose are identical across the three characters, so a single retargeted clip library is portable between them (they were each retargeted anyway, so each GLB carries its own clips).

## Shipped clips

Each GLB contains **one retarget call** with the 3 requested presets, `--animate-in-place` (root motion stripped — game code drives position):

`preset:biped:idle` · `preset:biped:sit` · `preset:biped:look_around`

All three presets exist in the rig-v1.0 catalogue and were **accepted first try** — no fallback to `talk`/`wave` was needed. Each clip = 126 animation channels (42 nodes × TRS), i.e. full-body skeletal animation, baked.

## Verification (GLB JSON chunk parsed with Node)

| character | file | size | verts | triangles | meshes | images | bones | clips |
|---|---|---|---|---|---|---|---|---|
| yolanda | `assets/characters3d/yolanda/yolanda.glb` | 58,450,760 B (55.7 MB) | 745,307 | 1,452,458 | 1 | 3 (PBR) | 41 | 3 |
| ramon | `assets/characters3d/ramon/ramon.glb` | 58,277,432 B (55.6 MB) | 745,944 | 1,452,464 | 1 | 3 | 41 | 3 |
| manuel | `assets/characters3d/manuel/manuel.glb` | 60,065,328 B (57.3 MB) | 769,004 | 1,492,372 | 1 | 3 | 41 | 3 |

All: `generator: Khronos glTF Blender I/O v4.5.51`, single mesh, single material, skinned.

**Orientation / facing (measured, not guessed).** Rest-pose bone world positions (composed from the node hierarchy) give the ankle→toe vector: yolanda `[+0.0312, -0.0032, -0.0032]`, ramon `[+0.0418, -0.0068, -0.0008]`, manuel `[+0.0408, -0.0067, +0.0002]` → **forward = +X** on all three. Corroborating: the mesh bbox is `~0.39 (X) × 1.0 (Y) × ~0.53-0.62 (Z)` — arm/shoulder span lies on **Z**, which only fits a character facing ±X — and Tripo's documented default `export_orientation` is `+x`. Up = +Y, origin at the feet (`posBounds.min.y = -0.0`, `max.y = 1.0`), height exactly **1.0 unit** → scale ~1.8× in game.

Derived (verify visually in-engine, cheap to check): a **+90° rotation about Y** maps the model's +X forward onto three.js's conventional **−Z** forward (`(1,0,0)` → `(0,0,−1)`).

## Failures / retries

None. Every generation was riggable as `biped`; every rig used `model=rig-v1.0`; every retarget accepted all 3 presets. No fallback prompt, no fallback preset, no refunded task. Nothing was run twice (the API rejects a second retarget per rig, so each rig got exactly one).

## Notes & caveats for the game

- **Poly count is high**: ~1.45-1.49 M triangles and 3 embedded PBR textures per character (~56 MB per GLB, ~175 MB for the three). Fine for a desktop browser game; if load time matters, run `tripo mesh decimate` (or glTF-Transform/`gltfpack`) on a copy — but do it **after** rigging (decimating the base mesh invalidates the skin weights) and re-verify the clips, or expect a re-rig spend.
- **Clips are in-place** (root motion stripped), so the game must move the character node; do not add the clip's own translation.
- **Imported clips do not loop by default** in three.js either: set `THREE.LoopRepeat` on `idle`/`look_around`; `sit` reads as a one-shot/pose (use `LoopOnce`, `clampWhenFinished`).
- The three share an identical 41-bone skeleton and rest pose, so one clip set can be retargeted once and shared across all three in code (see the `tripo-to-godot-character` skill for the track-path caveat) — they were each retargeted here so each GLB is self-contained.
- Previews (API render of the rigged model) shipped alongside: `assets/characters3d/<name>/<name>-preview.png`. Visually confirmed: full body, neutral standing pose, plain background, briefs matched (floral dress + gold earrings; white guayabera + light beard; flat cap + grey moustache + open shirt over undershirt).
- Only `assets/characters3d/**` and this report were written inside the project; all intermediates (`tripo-out/<task>/model.glb`, previews, NDJSON logs) live in the scratch dir `%LOCALAPPDATA%\hermes\cache\scratch\tripo\`.

---

# manuel regeneration (2026-09-22)

The first `manuel` came out **stocky, pale-skinned and gently smiling** — off brief. Regenerated with a prompt that front-loads the three missed traits; no retry needed (first attempt passed all four checks).

## Prompt (318 chars)

`Full body stylized 3D game character: wiry lean slender build, deep warm brown skin, cheeky mischievous grin. Older Dominican man, 60s, grey moustache, worn flat cap, white undershirt under open short-sleeved shirt, clean topology, slightly caricatured adult proportions, matte textures, neutral A-pose, no background.`

## Commands run

```bash
tripo make "<prompt>" --json --yes --name manuel2 -o <scratch>/manuel2-gen     # 20 cr
tripo anim check bb1c669e-fed2-4d5a-829d-9411928728f6 --json --yes             #  0 cr -> {riggable:true, rig_type:biped}
tripo anim rig   bb1c669e-fed2-4d5a-829d-9411928728f6 -p model=rig-v1.0 --rig-type biped --out-format glb \
                 --json --yes --name manuel2-rig -o <scratch>/manuel2/rig      # 25 cr
tripo anim retarget 9b148ec9-2cae-42bf-8b15-1b9f1f8e931c \
                 --animation preset:biped:idle --animation preset:biped:sit \
                 --animation preset:biped:look_around --animate-in-place                  --out-format glb --json --yes --name manuel2-anims            # 30 cr
npx -y @gltf-transform/cli optimize assets/characters3d/manuel/manuel.glb \
     assets/characters3d/manuel/manuel-web.glb --texture-size 1024 --texture-compress webp \
     --simplify true --simplify-ratio 0.35 --compress meshopt                   # free
```

Note: `tripo anim rig` / `anim retarget` have **no `--dry-run`** (only `tripo make` does); the `make` dry-run was validated offline first (`valid: true`, 0 credits).

## Task ids

| step | task id | credits |
|---|---|---|
| generate (`text_to_model`, v3.1-20260211) | `bb1c669e-fed2-4d5a-829d-9411928728f6` | 20 |
| rig-check (`animate_prerigcheck`) | `b0ae7e1b-fdc5-4795-839c-8fe0e4ebae60` | 0 |
| rig (`animate_rig`, `model=rig-v1.0`) | `9b148ec9-2cae-42bf-8b15-1b9f1f8e931c` | 25 |
| retarget (`animate_retarget`, 3 presets) | `ba2e99b3-2ab0-42ac-a851-52cf5f468946` | 30 |
| **total** | | **75** |

Balance **1465 → 1390** (`tripo balance --json` → `{"balance":1390,"frozen":0}`). Budget 150; used 75. No failures, no retries, no refunds.

## Result

| file | size |
|---|---|
| `assets/characters3d/manuel/manuel.glb` (raw) | 59,758,560 B — 1,491,544 tris, 41 bones, 3 clips, sha256[0:16]=`4ddae46e4cd7b9ba` |
| `assets/characters3d/manuel/manuel-web.glb` (optimized) | 3,400,444 B — 522,038 tris, 41 bones, 3 clips preserved |
| `assets/characters3d/manuel/manuel-preview.png` | fresh Tripo render of the new **rigged** model |

Clips: `preset:biped:idle` · `preset:biped:sit` · `preset:biped:look_around` (all in-place). Rig verified legged: `L/R_Thigh, Calf, Foot, ToeBase` present, 41 joints.

## Visual verdict vs brief

Judged from the Tripo renders (generated preview, rigged-model preview, shipped `manuel-preview.png`) against the same rubric used on the old file:

| brief item | old manuel | new manuel |
|---|---|---|
| wiry / lean / slender | ✗ stocky, broad, thick torso | ✓ thin wire-like limbs, narrow torso |
| warm **deep brown** skin | ✗ pale/peachy | ✓ warm medium-deep brown, not pale |
| cheeky **mischievous grin** | ✗ gentle warm smile | ✓ wide toothy grin, playful/mischievous eyes |
| grey moustache | ✓ | ✓ thick bushy grey handlebar |
| worn flat cap | ✓ | ✓ light taupe newsboy flat cap |
| white undershirt + open short-sleeved shirt | ✓ | ✓ white crew vest under unbuttoned short-sleeve shirt |

**Verdict: pass on all six — shipped without a retry.** Only caveat: the shorts/shoes colour is light taupe+brown rather than specified (the brief didn't specify trousers), and the skin reads deep warm brown under studio lighting but is one shade shy of the very darkest brown — clearly in range for "warm deep brown", never pale.

`assets/characters3d/manifest.json` — **only the `manuel` entry** updated (sizeBytes, faces, notes/task ids/sha256); `yolanda` and `ramon` entries byte-identical. No game code touched. Previous `manuel.*` files backed up outside the project in `$TMPDIR/manuel_old_backup/`.
