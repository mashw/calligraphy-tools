export type ArtworkOcclusionSettings={occludeLowerLayers:boolean;opacity:number;occlusionArea?:'visible-artwork'|'bounds'};
export type ArtworkOcclusionFrame={x:number;y:number;width:number;height:number};
export type ArtworkOcclusionPoint={x:number;y:number};

export function usesArtworkBoundsOcclusion(settings:ArtworkOcclusionSettings){
  return settings.occludeLowerLayers&&settings.opacity>0&&(settings.occlusionArea??'visible-artwork')==='bounds';
}
export function artworkBoundsContains(frame:ArtworkOcclusionFrame,point:ArtworkOcclusionPoint){
  return point.x>=frame.x&&point.x<=frame.x+frame.width&&point.y>=frame.y&&point.y<=frame.y+frame.height;
}
