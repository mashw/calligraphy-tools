'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { fitBounds, resizeBounds, validBounds, zoomBounds, type Bounds, type Size } from '@/lib/editor/camera';

type Mode = 'page' | 'content' | 'custom';
type CustomView = { frame: Bounds; size: Size };
export type CameraSnapshot = { mode: Mode; frame: Bounds; size: Size };

export function useEditorCamera(svgRef: RefObject<SVGSVGElement | null>, page: Bounds, content: Bounds = page, backgroundPan = true) {
  const [size, setSize] = useState<Size>({ width: 800, height: 600 });
  const [mode, setMode] = useState<Mode>('page');
  const [custom, setCustom] = useState<CustomView | null>(null);
  const fittedPage = fitBounds(page, size);
  const fittedContent = fitBounds(content, size);
  const frame = mode === 'custom' && custom ? resizeBounds(custom.frame, custom.size, size) : mode === 'content' ? fittedContent : fittedPage;
  const latest = useRef({ frame, size, fittedPage });

  useEffect(() => { latest.current = { frame, size, fittedPage }; });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [svgRef]);

  function zoomBy(factor: number, anchor = { x: .5, y: .5 }) {
    const current = latest.current;
    const ratio = current.fittedPage.w / current.frame.w;
    const next = Math.min(32, Math.max(.1, ratio * factor));
    setCustom({ frame: zoomBounds(current.frame, next / ratio, anchor), size: current.size });
    setMode('custom');
  }

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let drag: { pointer: number; x: number; y: number; frame: Bounds; size: Size } | null = null;
    const down = (event: PointerEvent) => {
      const target = event.target as Element;
      const background = target === svg || target.id === 'stage-bg' || (target.tagName === 'rect' && !target.closest('[data-camera-interactive]'));
      if (!(event.button === 1 || (event.button === 0 && (event.altKey || (backgroundPan && background))))) return;
      event.preventDefault(); event.stopPropagation();
      drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, frame: latest.current.frame, size: latest.current.size };
      svg.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      event.preventDefault(); event.stopPropagation();
      const x = drag.frame.x - (event.clientX - drag.x) * drag.frame.w / drag.size.width;
      const y = drag.frame.y - (event.clientY - drag.y) * drag.frame.h / drag.size.height;
      setCustom({ frame: { ...drag.frame, x, y }, size: drag.size }); setMode('custom');
    };
    const up = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      event.stopPropagation();
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
      drag = null;
    };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      zoomBy(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * .01), { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
    };
    svg.addEventListener('pointerdown', down, true); svg.addEventListener('pointermove', move, true);
    svg.addEventListener('pointerup', up, true); svg.addEventListener('pointercancel', up, true);
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => {
      svg.removeEventListener('pointerdown', down, true); svg.removeEventListener('pointermove', move, true);
      svg.removeEventListener('pointerup', up, true); svg.removeEventListener('pointercancel', up, true); svg.removeEventListener('wheel', wheel);
    };
    // zoomBy reads current camera values from latest, so listeners stay stable.
  }, [svgRef, backgroundPan]);

  return {
    ...frame, minX: frame.x, minY: frame.y, vw: frame.w, vh: frame.h,
    str: `${frame.x} ${frame.y} ${frame.w} ${frame.h}`,
    mode, zoom: fittedPage.w / frame.w, zoomBy,
    freeze: () => { setCustom({ frame, size }); setMode('custom'); },
    setFrame: (next: Bounds) => { if (validBounds(next)) { setCustom({ frame: next, size: latest.current.size }); setMode('custom'); } },
    snapshot: { mode, frame, size } satisfies CameraSnapshot,
    restore: (snapshot?: CameraSnapshot) => {
      if (snapshot?.mode === 'custom' && snapshot.frame && validBounds(snapshot.frame) && snapshot.size && Number.isFinite(snapshot.size.width) && Number.isFinite(snapshot.size.height) && snapshot.size.width > 0 && snapshot.size.height > 0) {
        setCustom({ frame: snapshot.frame, size: snapshot.size }); setMode('custom');
      } else { setMode(snapshot?.mode === 'content' ? 'content' : 'page'); setCustom(null); }
    },
    fit: (next: 'page' | 'content') => { setMode(next); setCustom(null); },
    top: () => { setCustom({ frame: { ...frame, y: page.y - frame.h * .04 }, size }); setMode('custom'); },
  };
}

export type EditorCamera = ReturnType<typeof useEditorCamera>;
