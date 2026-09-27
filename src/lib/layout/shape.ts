export const SHAPE_OPTIONS = [
  { kind: 'rectangle', label: 'Rectangle' }, { kind: 'square', label: 'Square' },
  { kind: 'roundedRectangle', label: 'Rounded rectangle' }, { kind: 'roundedSquare', label: 'Rounded square' },
  { kind: 'ellipse', label: 'Ellipse' }, { kind: 'circle', label: 'Circle' },
  { kind: 'triangle', label: 'Triangle' }, { kind: 'pentagon', label: 'Pentagon' },
  { kind: 'hexagon', label: 'Hexagon' }, { kind: 'octagon', label: 'Octagon' },
  { kind: 'diamond', label: 'Diamond' }, { kind: 'star', label: 'Star' },
  { kind: 'heart', label: 'Heart' }, { kind: 'gothicArch', label: 'Gothic arch' },
  { kind: 'scallopedCircle', label: 'Scalloped circle' },
] as const;
export type ShapeKind = typeof SHAPE_OPTIONS[number]['kind'];
export type ShapeAppearance = 'reserve' | 'fill' | 'border' | 'fillAndBorder';
export type ShapePoint = { x: number; y: number };
export type ShapeFrame = { x:number; y:number; width:number; height:number };

export type ShapeSettings = { kind: ShapeKind; appearance: ShapeAppearance; fillColor: string; borderColor: string; borderWidthMM: number; cornerRadiusMM: number };
export const PAGE_BACKGROUND = '#ffffff';
export function createDefaultShapeSettings(): ShapeSettings { return { kind:'rectangle',appearance:'border',fillColor:'#ffffff',borderColor:'#334155',borderWidthMM:.5,cornerRadiusMM:3 }; }
export function isConstrainedShape(settings: Pick<ShapeSettings,'kind'>) { return settings.kind==='square'||settings.kind==='roundedSquare'||settings.kind==='circle'||settings.kind==='scallopedCircle'; }

export function shapeGeometryFrame(kind:ShapeKind,width:number,height:number):{x:number;y:number;width:number;height:number} {
  if(!isConstrainedShape({kind})) return {x:0,y:0,width,height};
  const size=Math.min(width,height);return{x:(width-size)/2,y:(height-size)/2,width:size,height:size};
}

function radial(count:number,innerRatio?:number):ShapePoint[]{
  const total=innerRatio==null?count:count*2,raw=Array.from({length:total},(_,i)=>{const r=innerRatio!=null&&i%2?innerRatio:1,a=-Math.PI/2+i*Math.PI*2/total;return{x:Math.cos(a)*r,y:Math.sin(a)*r};});
  const xs=raw.map(p=>p.x),ys=raw.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  return raw.map(p=>({x:(p.x-minX)/(maxX-minX),y:(p.y-minY)/(maxY-minY)}));
}

/** Authoritative clockwise boundary samples in local millimetres. */
export function shapeBoundaryPoints(kind:ShapeKind,width:number,height:number,cornerRadiusMM=0):ShapePoint[]{
  const f=shapeGeometryFrame(kind,width,height),map=(points:ShapePoint[])=>points.map(p=>({x:f.x+p.x*f.width,y:f.y+p.y*f.height}));
  if(kind==='rectangle'||kind==='square') return map([{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]);
  if(kind==='diamond') return map([{x:0,y:.5},{x:.5,y:0},{x:1,y:.5},{x:.5,y:1}]);
  if(kind==='triangle'||kind==='pentagon'||kind==='hexagon'||kind==='octagon'||kind==='star') return map(radial(kind==='triangle'?3:kind==='pentagon'?5:kind==='hexagon'?6:kind==='octagon'?8:5,kind==='star'?.4:undefined));
  if(kind==='heart') return map(Array.from({length:161},(_,i)=>{const t=i/160*Math.PI*2,x=16*Math.sin(t)**3,y=13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t);return{x:(x+17)/34,y:(12-y)/30};}));
  if(kind==='gothicArch') {
    const left=Array.from({length:65},(_,i)=>{const t=i/64;return{x:0,y:1-t*.64}}),leftArch=Array.from({length:65},(_,i)=>{const t=i/64;return{x:.5*t,y:.36*(1-t)**1.55}}),rightArch=leftArch.slice(0,-1).reverse().map(p=>({x:1-p.x,y:p.y})),right=left.slice(0,-1).reverse().map(p=>({x:1,y:p.y}));
    return map([...left,...leftArch,...rightArch,...right]);
  }
  if(kind==='scallopedCircle') return map(Array.from({length:193},(_,i)=>{const a=-Math.PI/2+i/192*Math.PI*2,r=.46+.04*Math.cos(12*a);return{x:.5+r*Math.cos(a),y:.5+r*Math.sin(a)};}));
  if(kind==='roundedRectangle'||kind==='roundedSquare'){
    const r=Math.min(Math.max(0,cornerRadiusMM),f.width/2,f.height/2),points:ShapePoint[]=[];for(const [cx,cy,start] of [[f.width-r,r,-Math.PI/2],[f.width-r,f.height-r,0],[r,f.height-r,Math.PI/2],[r,r,Math.PI]] as const)for(let i=0;i<=16;i++){const a=start+i/16*Math.PI/2;points.push({x:f.x+cx+r*Math.cos(a),y:f.y+cy+r*Math.sin(a)});}return points;
  }
  return Array.from({length:129},(_,i)=>{const a=-Math.PI/2+i/128*Math.PI*2;return{x:f.x+f.width/2+f.width/2*Math.cos(a),y:f.y+f.height/2+f.height/2*Math.sin(a)};});
}

export function shapePolygonPoints(kind:ShapeKind,width:number,height:number,cornerRadiusMM=0){return shapeBoundaryPoints(kind,width,height,cornerRadiusMM).map(p=>`${p.x},${p.y}`).join(' ');}
export function shapePathData(kind:ShapeKind,width:number,height:number,cornerRadiusMM=0){const p=shapeBoundaryPoints(kind,width,height,cornerRadiusMM);return p.length?`M ${p.map(q=>`${q.x} ${q.y}`).join(' L ')} Z`:'';}
export function shapeContainsPoint(kind:ShapeKind,width:number,height:number,point:ShapePoint,cornerRadiusMM=0){const polygon=shapeBoundaryPoints(kind,width,height,cornerRadiusMM);let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
export function expandedShapeFrame(frame:ShapeFrame,paddingMM=0):ShapeFrame{const padding=Math.max(0,paddingMM);return{x:frame.x-padding,y:frame.y-padding,width:frame.width+padding*2,height:frame.height+padding*2};}
export function shapeFootprintContains(kind:ShapeKind,frame:ShapeFrame,point:ShapePoint,cornerRadiusMM=0,paddingMM=0){const bounds=expandedShapeFrame(frame,paddingMM);return shapeContainsPoint(kind,bounds.width,bounds.height,{x:point.x-bounds.x,y:point.y-bounds.y},cornerRadiusMM+Math.max(0,paddingMM));}
export function constrainFrameToSquare(frame:{x:number;y:number;width:number;height:number}){const size=Math.min(frame.width,frame.height);return{x:frame.x+(frame.width-size)/2,y:frame.y+(frame.height-size)/2,width:size,height:size};}
