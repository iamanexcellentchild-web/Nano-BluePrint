# Blueprint

A visual canvas for modelling business logic (tables, events, conditions, actions), checking it,
simulating it, and generating a backend from it.

Plain Vite + React + TypeScript. Tailwind v4, shadcn/ui, [React Flow](https://reactflow.dev),
zustand. Runs on a built-in demo backend until the Blueprint Django API is ready.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173, proxies /api -> http://localhost:8000
```

Nothing else to start: **demo mode is on by default**. Create an account on the sign-in screen (demo
accounts live in this browser only) and pick a template. Projects, validation, simulation, code
download and the AI assistant all run locally (`src/lib/demo/`). Projects are saved in this browser.

### Switching to the real backend

```sh
cp .env.example .env     # then set VITE_DEMO_MODE=false
```

Start the Django API on port 8000, restart `npm run dev`, then open **Settings** and paste your API
token. For a backend elsewhere, also set `VITE_API_URL` (e.g. `https://api.example.com`).
`src/lib/api.ts` picks the demo or real client; no component changes are needed.

## Scripts

`npm run dev` · `npm run build` (typecheck + bundle) · `npm run typecheck` · `npm test` · `npm run preview`

## Layout

```
src/main.tsx, App.tsx       entry, auth gate
src/lib/diagram.ts          pure logic: API <-> canvas mapping, connection rules, auto-layout
src/lib/store.ts            zustand store: diagram, save/open, validate, simulate, generate
src/lib/api.ts              API client (real HTTP, or the demo backend)
src/lib/demo/               in-browser stand-in for the Django API (library, templates, validate, simulate, generate, AI)
src/components/workspace/   canvas, palette, inspector, side-panel tabs, dialogs
```
