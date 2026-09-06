/// Vite's own ambient types — needed for `import.meta.env` (adsConfig.ts, useRewardedAd.ts)
/// to type-check under `tsc`, since tsconfig.json doesn't set `types` and `vite/client`
/// isn't an @types package that gets picked up automatically.
/// <reference types="vite/client" />
