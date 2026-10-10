import '@vostok/ui-kit/styles.css';
import '@vostok/plates/plates.css';
import './style.css';
import {
  appShell, linkButton, generatorHeader, panelCredit, section, collapsibleSection,
  dropZone, sliderRow, selectField, toggleSwitch, button, stageStatus,
  sidebarFooter, dialog, toast, readProjectFile, markProject, buildLoop, workerClient,
  syncControls, el, ICONS, type ProjectShape,
} from '@vostok/ui-kit';
import { createViewer } from '@vostok/viewer';
import { plateSize, mountPlatePicker, loadPlateChoice } from '@vostok/plates';
import { downloadThreeMF, downloadFile } from '@vostok/export';
import { loadFileToImage, processImage, type RgbaImage, type Ring } from '@vostok/trace';
import { signedArea } from '@vostok/shapes';
import { DEFAULT_SETTINGS, coerceSettings, type LightboxSettings, type WireExit } from './state';
import type { LightboxBuild } from './geometry';

let settings: LightboxSettings = coerceSettings(DEFAULT_SETTINGS);
let sourceImage: RgbaImage | null = null;
let imageUrl: string | null = null;
let uploadedName = 'starter shape';
const client = workerClient<{settings: LightboxSettings}, LightboxBuild>(
  () => new Worker(new URL('./geometry.worker.ts', import.meta.url), {type: 'module'}),
);
const status = stageStatus('Building lightbox...');
const preview = el('img', { className: 'led-preview', attrs: { alt: 'Loaded silhouette source' }}) as HTMLImageElement;
const previewWrap = el('div', {className:'led-preview-wrap hidden'}, [preview]);
const stage = el('div', {className:'led-stage'});
const viewer = createViewer(stage);
let refitNext = false;
let started = 0;
const loop = buildLoop<LightboxBuild>({
  run: () => {started = performance.now(); return client.call({settings: {...settings, outline: settings.outline.map(p=>[p[0],p[1]])}});},
  onResult: (result) => {
    viewer.setParts(result.parts, refitNext);
    refitNext = false;
    status.set(result.width.toFixed(0) + ' × ' + result.height.toFixed(0) + ' × ' + settings.depth.toFixed(0) +
      ' mm · ' + result.parts[0]!.indices.length/3 + ' triangles · ' + Math.round(performance.now()-started) +
      ' ms' + (result.warnings.length ? ' · ' + result.warnings.join(' ') : ''));
  },
  onError: (error) => status.set(error.message, 'error'),
});
function rebuild(refit = false) {if (refit) refitNext = true; loop.request();}
function keepLargest(set: {outline: Ring[]}): Ring {
  const rings = set.outline.filter(r=>r.length>=3).sort((a,b)=>Math.abs(signedArea(b))-Math.abs(signedArea(a)));
  if (!rings.length) throw new Error('No silhouette detected. Use an image with a clear opaque subject and a transparent or flat background.');
  const ring = rings[0]!;
  // Cap very detailed outlines to keep offsets responsive without losing the basic silhouette.
  const stride = Math.max(1,Math.ceil(ring.length/1800));
  const chosen = ring.filter((_,i)=>i%stride===0);
  if (Math.abs(signedArea(chosen))<0.0001) throw new Error('The traced subject is too small.');
  return chosen;
}
function retrace(): void {
  if (!sourceImage) return;
  const result = processImage({
    width: sourceImage.width, height: sourceImage.height, data: new Uint8ClampedArray(sourceImage.data),
  }, 1, {removeBg: settings.removeBackground, smoothing:0.4, designMm:settings.size});
  settings.outline = keepLargest(result);
  rebuild(true);
}
async function importFile(file: File) {
  try {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name))
      throw new Error('Please choose a PNG, JPG or WebP image.');
    const image = await loadFileToImage(file, 700);
    sourceImage = image;
    retrace();
    uploadedName = file.name;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = URL.createObjectURL(file);
    preview.src = imageUrl;
    previewWrap.classList.remove('hidden');
  } catch(e) {status.set(e instanceof Error ? e.message : String(e), 'error');}
}
const sliders = {
  size: sliderRow({label:'Longest side', min:45,max:250,step:5,unit:'mm',value:settings.size,
    onInput:v=>{settings.size=v;rebuild(true);}}),
  depth: sliderRow({label:'Box depth',min:10,max:60,step:1,unit:'mm',value:settings.depth,
    onInput:v=>{settings.depth=v;rebuild();}}),
  wall: sliderRow({label:'Wall thickness',min:1.2,max:5,step:0.2,unit:'mm',value:settings.wall,
    onInput:v=>{settings.wall=v;rebuild();}}),
  back: sliderRow({label:'Back thickness',min:1.2,max:5,step:0.2,unit:'mm',value:settings.back,
    onInput:v=>{settings.back=v;rebuild();}}),
  ledgeWidth: sliderRow({label:'LED strip shelf width',min:3,max:12,step:0.5,unit:'mm',value:settings.ledgeWidth,
    help:'Flat horizontal ledge inside the box. Set to suit your LED strip width and adhesive area.',
    onInput:v=>{settings.ledgeWidth=v;rebuild();}}),
  ledgeHeight: sliderRow({label:'LED shelf rise',min:0.8,max:4,step:0.2,unit:'mm',value:settings.ledgeHeight,
    help:'Height of the internal ledge above the back panel.',onInput:v=>{settings.ledgeHeight=v;rebuild();}}),
  holeDiameter: sliderRow({label:'Cable hole diameter',min:2,max:10,step:0.5,unit:'mm',value:settings.holeDiameter,
    onInput:v=>{settings.holeDiameter=v;rebuild();}}),
};
const wire = selectField<WireExit>({label:'Wire exit', value:settings.wireExit, options:[
  {value:'none',label:'No holes'},{value:'back',label:'Back'},
  {value:'side',label:'Right side'},{value:'both',label:'Back + right side'},
],onChange:v=>{settings.wireExit=v;rebuild();}});
const removeBg = toggleSwitch({label:'Remove flat background', checked:settings.removeBackground,
  help:'For JPG photos with a flat background. For transparent PNGs this is normally automatic.',
  onChange:v=>{settings.removeBackground=v;try{retrace();}catch(e){status.set(e instanceof Error?e.message:String(e),'error');}}});
function syncUI() {
  syncControls(settings,sliders);
  wire.setValue(settings.wireExit);
  removeBg.setValue(settings.removeBackground);
}
const reset = button({label:'Reset dimensions',emphasis:'secondary',icon:ICONS.rotateLeft,block:true,onClick:()=>{
  const oldOutline = settings.outline;
  settings = coerceSettings({...DEFAULT_SETTINGS,outline:oldOutline});
  syncUI();rebuild(true);
}});
const drop = dropZone({title:'Upload a silhouette image',text:'or click to browse',note:'PNG, JPG, WebP · solid logos work best',
  accept:'image/png,image/jpeg,image/webp', onFiles:([file])=>{if(file) void importFile(file);}});
const note = el('p',{className:'vl-hint',
  text:'Only the largest outside outline is used; interior colors and holes are ignored. Best with a simple transparent PNG or flat-background logo. The front stays open for your own diffuser or cover.'});
const starter = button({label:'Use starter rectangle',emphasis:'secondary',block:true,onClick:()=>{
  settings.outline = coerceSettings(DEFAULT_SETTINGS).outline;
  sourceImage=null;uploadedName='starter shape';previewWrap.classList.add('hidden');rebuild(true);
}});
const uploadSection = section({title:'Image silhouette',body:[drop,previewWrap,note,removeBg,starter]});
const footer = sidebarFooter({
  formats:[{id:'3mf',label:'3MF'}],
  onExport:async(format)=>{
    if(format!=='3mf') throw new Error('Unknown format');
    const result=await loop.settled();
    downloadThreeMF(result.parts,{title:'Image LED Lightbox',generator:'led-lightbox',
      application:'Vostok Labs Standalone · LED Lightbox',buildId:import.meta.env.VITE_BUILD_ID,
      sourceModel:uploadedName,plateSize:plateSize(loadPlateChoice())},'led-lightbox.3mf');
  },
  onSave:()=>downloadFile(JSON.stringify(markProject(PROJECT_FILE,settings),null,2),
    'led-lightbox-project.json','application/json'),
  onLoad:(file?:File)=>file&&readProjectFile(file,data=>{
    settings=coerceSettings(data);sourceImage=null;uploadedName='saved outline';
    previewWrap.classList.add('hidden');syncUI();rebuild(true);toast('Project loaded',{kind:'ok'});
  },PROJECT_FILE),
  onHelp:()=>dialog({title:'Image LED Lightbox help',
    content:'Upload a high-contrast PNG/JPG/WebP. The outer silhouette makes an open-front box with a solid back and flat inner LED shelf. The side and back cable holes are optional. Start with a small test print to verify LED strip adhesion, wire clearance and the intended diffuser fit. No diffuser cover is included in this first version.',
    actions:[{label:'Got it',primary:true}]}),
  themeStorageKey:'led-lightbox-theme',
});
const PROJECT_FILE: ProjectShape = {app:'led-lightbox',keys:['size','depth','outline'] satisfies (keyof LightboxSettings)[]};
const shell=appShell({
  topbar:el('header',{className:'vl-topbar'},[linkButton({label:'See all generators',href:'/',icon:ICONS.grid})]),
  left:{scroll:[
    generatorHeader({title:'Image LED Lightbox',description:'Turn a picture silhouette into a hollow lightbox with an LED mounting ledge and cable exits.',hideCredit:true}),
    collapsibleSection({title:'1 · Box dimensions',body:[sliders.size,sliders.depth,sliders.wall,sliders.back]}),
    collapsibleSection({title:'2 · LED mounting shelf',body:[sliders.ledgeWidth,sliders.ledgeHeight]}),
    collapsibleSection({title:'3 · Wiring',body:[wire,sliders.holeDiameter,reset]}),
  ],credit:panelCredit({title:'Image LED Lightbox'})},
  stage:[stage,el('p',{className:'vl-stage__label',text:'Open front · back on build plate'}),status.root,
    el('p',{className:'vl-stage__hint',text:'Drag to rotate · scroll to zoom'})],
  right:{scroll:[uploadSection],footer:[footer]},
});
document.getElementById('app')!.append(shell.root);
mountPlatePicker(shell.stage,viewer);
rebuild(true);
