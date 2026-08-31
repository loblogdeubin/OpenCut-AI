# Execution Status — OpenCut AI

**Updated:** 31 Agustus 2026
**Milestone:** 2D — Windows release published and ChatGPT Plus handoff guided
**Workspace:** `/Users/loblogdeubin/Documents/OpenCut-AI`  
**Branch:** `codex/ai-rough-cut-mvp`  
**Upstream baseline:** `OpenCut-app/opencut-classic@cf5e79e9`

## Completed

- Created a standalone workspace unrelated to RWI.
- Cloned the usable OpenCut Classic codebase.
- Moved the master PRD into `docs/product/MASTER_PRD.md`.
- Read and applied the repository architecture rule: shared business logic belongs in `rust/`; app folders remain UI shells.
- Installed dependencies with the repository-pinned Bun `1.2.18` without requiring `sudo`.
- Added a gitignored local development environment file.
- Fixed baseline compile blockers found in the upstream snapshot:
  - aligned root Next.js with the web app at `16.1.3`;
  - added the missing `isShortcutKey` runtime validator;
  - added the missing `isActionWithOptionalArgs` runtime validator;
  - migrated stale positional `IndexedDBAdapter` constructor calls;
  - migrated a stale sticker registry call to the object-argument API.
- Passed the focused keybinding persistence tests: 9 passed, 0 failed.
- Passed the full production web build.
- Ran the complete repository test suite: 191 passed, 8 failed, and 2 module-initialization errors.
- Started the local development server on port 3000.
- Verified HTTP 200 for `/`, `/projects`, `/api/health`, and a real editor route.
- Created and opened a real local project stored in browser IndexedDB.
- Verified rendered editor UI with Media, Import, Preview canvas, Timeline, Captions, Settings, and Export controls.
- Installed the Rust toolchain and the `wasm32-unknown-unknown` target.
- Added the authoritative `editor-contracts` Rust crate with strict V1 contracts for normalized project snapshots and edit plans.
- Added deterministic SHA-256 timeline hashing that excludes volatile project/UI data, normalizes negative zero, and rejects unsupported schemas.
- Added authoritative Rust validation for insert, split, trim, delete, move, and output-setting operations, including stale revision/hash rejection and deterministic split result IDs.
- Exposed `hashProjectContentV1` and `validateEditPlanV1` through `opencut-wasm` and built/linked the local WASM package.
- Added a reproducible `setup:ai` command that builds and links local WASM for both root tests and the web app.
- Added the OpenCut-specific Editor Adapter mapper and operation translator.
- Added persistent project revision with an additive v31-to-v32 storage migration.
- Added coherent full-project editable-state replacement and `AIProjectSnapshotCommand`, producing one history entry for an entire AI plan.
- Added idempotency protection, revision/hash stale guards, conflict-safe transaction undo, and project-boundary transaction/history clearing.
- Made `BatchCommand.execute()` roll back attempted subcommands on failure.
- Fixed the Bun WASM test preload and three independent mask-test issues found by the complete suite.
- Passed the complete web test suite: 233 passed, 0 failed, 499 assertions across 37 files.
- Passed the Rust contract suite: 8 passed, 0 failed; formatting and strict crate Clippy passed.
- Passed a fresh production Next.js build after linking the local WASM package.
- Re-verified HTTP 200 for `/`, `/projects`, `/api/health`, and the real editor route.
- Added an `AI Rough Cut` tab to the editor's left asset panel with a prompt editor, plan preview, explicit apply, revision-safe error handling, and one-click transaction undo.
- Added a local Indonesian/English rough-cut planner that sequences every imported video in import order, optionally limits output duration, and changes the output aspect ratio for 9:16, 1:1, or 16:9 prompts.
- Added authoritative Rust/WASM audible-range detection for removing silence gaps of at least two seconds, with padding and minimum-segment guards.
- Verified the rendered AI panel in the in-app editor, including its default prompt and no-footage validation state, with no browser console errors.
- Passed the complete web test suite after the panel work: 234 passed, 0 failed, 500 assertions across 37 files.
- Passed the Rust contract suite after silence detection: 11 passed, 0 failed; strict crate Clippy passed.
- Passed another clean production Next.js build and restarted the development server on port 3000.
- Added a persistent browser media manifest with SHA-256 checksum, dimensions, duration, FPS, audio presence, video/audio codecs, index status, pipeline version, and indexed timestamp.
- Added chunked 4 MB media hashing through the authoritative Rust/WASM boundary, avoiding a full-file in-memory copy during checksum generation.
- Fixed media reload persistence for FPS and audio-presence metadata, which were collected during import but previously omitted from storage serialization.
- Added indexed-media completeness to the AI Rough Cut panel.
- Passed the complete web test suite after media-manifest work: 235 passed, 0 failed, 502 assertions across 38 files.
- Passed the Rust contract suite after streaming checksums: 13 passed, 0 failed; strict crate Clippy passed.
- Passed a clean production build with the rebuilt local WASM package.
- Installed and preflighted FFmpeg/ffprobe 9.0.1 with H.264, H.265, VPx, AV1, AAC, MP3, and Opus support.
- Installed whisper.cpp 1.9.2 and a verified multilingual `ggml-base` model in the gitignored local AI directory.
- Verified a real local Indonesian transcription and a 1280×720 to 640×360 proxy conversion using synthetic fixtures.
- Added `/api/local-ai/preflight` and live FFmpeg/transcription readiness badges to the AI Rough Cut panel.
- Added a same-origin, localhost-only streaming transcription endpoint with a 1 GB safety limit, isolated temporary jobs, guaranteed cleanup, FFmpeg audio normalization, and Whisper timestamp parsing.
- Added `Transkripsi semua footage` to the AI panel with sequential per-file progress and transcript previews.
- Verified the API end to end with Indonesian speech, returning the expected text and a 0.0–4.2 second segment; the production build includes both local-AI endpoints.
- Added a privacy-explicit ChatGPT Plus bridge that packages the user prompt, media IDs, durations, checksums, project revision/hash, and timestamped transcripts without copying the raw footage.
- Added a copy/paste workflow in the AI panel: copy the context package to ChatGPT Plus, paste its JSON EditPlanV1 response back into OpenCut, validate it through Rust/WASM, then explicitly apply or undo it as one transaction.
- Cached timestamped transcripts in browser session storage per project so ordinary editor reloads do not require re-transcribing the same footage.
- Added fenced/raw JSON parsing tests for ChatGPT responses and passed the complete web suite: 238 passed, 0 failed, 505 assertions across 39 files.
- Passed a clean production Next.js build after adding the ChatGPT Plus bridge.
- Added a same-origin local keyframe endpoint that streams each footage into an isolated temporary job and extracts normalized frames at 10%, 50%, and 90% without retaining the source file.
- Added a visual-keyframe workflow to the AI panel that produces one labeled JPEG contact sheet and maps every row back to the exact media ID in the ChatGPT bridge context.
- Verified keyframe selection end to end with a synthetic red/green/blue video, producing the expected 960×180 three-frame strip.
- Added a hardened Electron desktop shell that starts the production Next standalone server on a dynamically reserved localhost port, opens the projects UI in a sandboxed window, prevents duplicate app instances, and shuts the server down with the app.
- Stabilized the Next standalone output layout at `apps/web/server.js` for reproducible desktop packaging.
- Added desktop-aware local-AI path resolution so bundled Windows FFmpeg, ffprobe, whisper.cpp, and the multilingual base model are detected without system installation.
- Added the `Windows Desktop Release` workflow, producing assisted NSIS and portable Windows x64 executables and optionally publishing tagged GitHub Releases.
- Verified the staged desktop package locally: Electron launched the bundled server, `/projects` returned 200, health returned OK, AI preflight returned ready, and the child server stopped with the app.
- Reduced desktop staging size from an accidental 10 GB dependency capture to 594 MB uncompressed by excluding workspace `node_modules`.
- Built both Windows x64 targets on a real GitHub-hosted Windows runner and published the permanent `windows-v0.1.0` release with SHA-256 checksums.
- Added a guided, no-API ChatGPT Plus handoff: readiness checks, one-click contact-sheet download plus context copy plus ChatGPT launch, and clipboard paste plus authoritative validation before Apply.

## Current local URLs

- Landing page: `http://127.0.0.1:3000/`
- Projects: `http://127.0.0.1:3000/projects`
- Verified editor project: `http://127.0.0.1:3000/editor/4c96377e-2e8f-4f59-ab60-4f776286b6ab`
- Health: `http://127.0.0.1:3000/api/health`

The editor project ID belongs to the local browser storage used during smoke testing. It is not a portable server-side project.

## Verified commands

```sh
cd /Users/loblogdeubin/Documents/OpenCut-AI
npx --yes bun@1.2.18 install --frozen-lockfile
npx --yes bun@1.2.18 run setup:ai
npx --yes bun@1.2.18 test apps/web/src/actions/keybindings/__tests__/persistence.test.ts
npx --yes bun@1.2.18 test
npx --yes bun@1.2.18 run build:web
npx --yes bun@1.2.18 run dev:web
```

## Environment constraints

- Bun is invoked through `npx` because global installation under `/usr/local` requires permissions unavailable to the current user.
- Docker is not installed. It is optional for the editor baseline but will be required if local PostgreSQL/Redis-backed features are activated.
- FFmpeg, ffprobe, whisper.cpp, and the base multilingual model are installed locally. Automatic per-asset proxy/transcript job orchestration is the remaining integration step.
- Available disk space is approximately 11 GB after Rust/WASM compilation. This remains tight for large footage or proxy caches; keep free-space usage under observation during media indexing.
- Next.js reports a non-blocking workspace-root warning because a separate `/Users/loblogdeubin/package-lock.json` exists above the project.
- The development server requests `/service-worker.js`, which currently returns 404; this did not block the editor.
- The local WASM artifact under `rust/wasm/pkg` is generated and ignored by Git. Run `setup:ai` again after a clean install or after changing Rust contracts.
- The plan executor is intentionally an OpenCut-specific TypeScript translation layer. Rust remains authoritative for validation and hashing. A fully authoritative Rust post-apply reducer is deferred until the V2 contract models render params, retime, and animation semantics losslessly.

## Not yet implemented

- resumable background indexing, proxies, and transcription;
- local or remote MCP server;
- automatic ChatGPT/API/MCP pairing (the implemented Plus bridge currently has one manual copy/paste step);
- automatic semantic take selection without the manual ChatGPT bridge, captions, and audio ducking;
- Windows Authenticode code-signing and SmartScreen reputation;
- a real Windows restart/persistence smoke test on user hardware.

## Next execution slice

Milestone 2B connects semantic media intelligence and ChatGPT after the safe local planner:

1. Free additional disk space, then install and preflight FFmpeg/ffprobe for the desktop/sidecar path.
2. Add resumable background indexing for thumbnails, proxies, waveform, silence ranges, and transcripts.
3. Add retry/re-index controls for legacy media imported before `browser-media-v1`.
4. Extend the V2 edit contract with typed render params, retime, animation, caption, and audio-ducking semantics.
5. Optionally replace the working manual ChatGPT Plus bridge with an API-backed or MCP-backed planner while retaining the same validation and approval boundary.
6. Expose read tools and approval-gated write tools through MCP only after the same transaction guards are retained end to end.
