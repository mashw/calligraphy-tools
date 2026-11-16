import { readInterlaceSource } from '../interlace/layout-source';
import { sanitizeArtworkSvg } from './artwork';
import { defaultArtworkSize, type Frame } from './types';
export function importArtwork(source:string,usable:Frame) {
  // Metadata never bypasses the geometry sanitizer.
  const document=sanitizeArtworkSvg(source),interlace=readInterlaceSource(source);
  const ratio=document.viewBox.width/document.viewBox.height;
  const size=interlace?{width:interlace.width,height:interlace.height}:defaultArtworkSize(ratio,usable,document.viewBox.width);
  if(interlace&&(size.width>usable.width||size.height>usable.height))document.warning=[document.warning,'Interlace artwork exceeds the available page area. Imported at 100%; resize or change the page.'].filter(Boolean).join(' ');
  return {document,intrinsicAspectRatio:ratio,interlaceSource:interlace?.source,size};
}
