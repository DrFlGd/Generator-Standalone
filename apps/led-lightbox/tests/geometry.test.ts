import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { buildLightbox } from '../src/geometry';
import { DEFAULT_SETTINGS, coerceSettings } from '../src/state';
const wasm=await Module();
wasm.setup();
for(const wireExit of ['none','back','side','both'] as const) {
  const result=buildLightbox(wasm,{...coerceSettings(DEFAULT_SETTINGS),wireExit});
  assert.equal(result.parts.length,1);
  assert.ok(result.parts[0]!.indices.length>0);
  assert.ok(result.width>90 && result.height>40);
  const mesh=new wasm.Mesh({numProp:3,vertProperties:result.parts[0]!.positions,triVerts:result.parts[0]!.indices});
  mesh.merge();
  const solid=wasm.Manifold.ofMesh(mesh);
  assert.equal(solid.status(),'NoError');
  assert.ok(solid.volume()>0);
  solid.delete();
}
assert.throws(()=>buildLightbox(wasm,{...coerceSettings(DEFAULT_SETTINGS),ledgeWidth:90}),/ledge/i);
const restored=coerceSettings({...DEFAULT_SETTINGS,outline:[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]});
assert.equal(restored.outline.length,4);
console.log('LED lightbox geometry: base shell, back/side holes, watertight exports, invalid ledge and project outlines passed.');
