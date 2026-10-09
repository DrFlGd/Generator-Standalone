# vostok-labs-tools

Monorepo for [Vostok Labs](https://vostoklabs.github.io/) generators, seller tools, the hub,
and the shared design system.

- `packages/ui-kit` — design tokens + shared components (license nudge, support links,
  export panel, …)
- `config/` — brand constants (URLs, prices) — single source of truth
- `apps/kit-demo` — component showcase: `pnpm install && pnpm dev:demo`
- `generators.json` — tool registry

## Private Windows desktop edition (Tauri 2)

This detached private copy can build **Vostok Labs Standalone** as a Windows desktop application. The desktop bundles the prerendered hub and its ten live web generators with local assets, Web Workers, 3MF models and the same geometry engines. The existing GitHub Pages build is untouched.

On Windows, install [Node.js 20+](https://nodejs.org), [Rust](https://rustup.rs), and the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/) (C++ build tools and WebView2). Then:

```powershell
pnpm install --frozen-lockfile
pnpm desktop:build
```

This creates an NSIS setup executable in `src-tauri/target/release/bundle/nsis/` and the app executable in `src-tauri/target/release/vostoklabs-standalone.exe`. Alternatively, run **GitHub Actions → Windows desktop build**, then download the `vostoklabs-standalone-windows-x64` artifact.

The desktop-specific bridge opens external links in the system browser, routes hub pages to packaged HTML, and intercepts HTML download links to show a Windows Save As dialog. File uploads and the regular browser builds remain unchanged. Windows SmartScreen may warn until executables are signed.

**License:** The upstream Vostok Labs files retain their existing terms, including CC BY-NC-ND 4.0. Keep this modified desktop edition private for personal, noncommercial use unless separate redistribution permission is obtained.

### Windows v0.2.0: simplified Generators launcher

The **Windows desktop package** now launches directly into the Generators catalogue. The static Vostok Labs home, Licences, FAQ, Coming Soon cards, rail MakerWorld/Coffee shortcuts, and site footer (including redundant links) are removed from packaged desktop HTML. The corresponding unneeded page HTML files are excluded from the Windows bundle. Generator cards and their working local apps remain available, while the public website and source assets are preserved. Upstream licence and attribution notices remain in the repository.

The packaged catalogue root is / ` (rather than the old /make/` page). The older desktop builds remain available under their original release tags.

### Windows v0.3.0: single return button

The Tauri-only package now removes the redundant logo/navigation control on the Generators home page. Generator applications retain **See all generators** as the only top-bar control, and that link opens the local desktop catalogue. The packaged hub's individual generator detail and topic pages also show only a **See all generators** return link. These changes are injected at desktop packaging time; the web builds and their shared UI kit remain unchanged.

### Windows v0.4.0: uninterrupted exports

In the Tauri Windows edition, exporting a model no longer opens the centre-screen **Download started** commercial-licence modal or the upper-right commercial-licence reminder. The shared UI now detects the Tauri runtime even when the separate DesktopHost environment flag is unset. Exports, native Windows Save As, error notifications and the upstream licensing data/attribution stay intact. The web edition continues to show the original licence prompts.

### Windows v0.4.0: reliable Save As file writes

The desktop-only download bridge now captures generated Blob contents **before** opening the native Windows Save As dialog. This prevents 3MF, JSON and other downloads from disappearing when generators revoke the temporary Blob URL while the user is choosing a folder. The regression test simulates immediate revocation and confirms binary/text exports are written to the selected path. The download licence modal/reminder are also hidden only in Tauri; export content and upstream licence metadata are unchanged.
