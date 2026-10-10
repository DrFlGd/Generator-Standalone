import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { answerRequests } from '@vostok/ui-kit/build-loop';
import { buildLightbox, type LightboxBuild } from './geometry';
import type { LightboxSettings } from './state';
let ready: Promise<any> | null = null;
function kernel(): Promise<any> {
  if (!ready) ready = (async () => {
    const wasm = await Module({ locateFile: () => wasmUrl });
    wasm.setup();
    return wasm;
  })();
  return ready;
}
answerRequests<{ settings: LightboxSettings }, LightboxBuild>(async ({ settings }) => buildLightbox(await kernel(), settings), {
  transfer: (result) => result.parts.flatMap((p) => [p.positions.buffer, p.indices.buffer] as Transferable[]),
});
