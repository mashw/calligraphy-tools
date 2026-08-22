'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type AccordionMode = 'compact' | 'medium' | 'wide';
type HorizontalDirection = 'left' | 'right';
type SectionWidth = { medium: number; wide: number };
type WindowPreference = { anchor: number; direction: HorizontalDirection; preferredOpenCount: number; manuallyAdjusted: true };
type ResolvedWindow = { start: number; end: number; widths: Map<string, number> };
type AccordionContextValue = {
  mode: AccordionMode;
  isOpen: (title: string) => boolean;
  panelWidth: (title: string) => number | null;
  disclosureDirection: (title: string) => HorizontalDirection;
  toggle: (title: string) => void;
};

const DEFAULT_WIDTH: SectionWidth = { medium: 235, wide: 280 };
const SECTION_WIDTHS: Record<string, SectionWidth> = {
  'Position & Size': { medium: 240, wide: 285 }, Basics: { medium: 230, wide: 275 },
  'Script Details': { medium: 255, wide: 310 }, Margins: { medium: 225, wide: 265 },
  'Guide appearance': { medium: 250, wide: 300 }, Shape: { medium: 240, wide: 285 },
  Circles: { medium: 255, wide: 310 }, 'Additional Bands': { medium: 255, wide: 310 },
  'Text & Fit': { medium: 245, wide: 295 }, Display: { medium: 220, wide: 260 },
  'Text fit': { medium: 250, wide: 300 },
  'Curve & Guides': { medium: 255, wide: 310 }, Page: { medium: 235, wide: 280 },
  'Page margins': { medium: 235, wide: 280 }, 'Centre lines': { medium: 220, wide: 260 },
  Artwork: { medium: 250, wide: 300 }, Appearance: { medium: 235, wide: 280 }, Occlusion: { medium: 250, wide: 300 },
};
const METRICS = { medium: { rail: 40, gap: 10 }, wide: { rail: 44, gap: 16 } } as const;

const AccordionContext = createContext<AccordionContextValue | null>(null);
export function useSettingsAccordion() { return useContext(AccordionContext); }

function minimumWidth(title: string, mode: 'medium' | 'wide') {
  return (SECTION_WIDTHS[title] ?? DEFAULT_WIDTH)[mode];
}

function resolveHorizontalWindow(titles: string[], mode: 'medium' | 'wide', available: number, preference?: WindowPreference): ResolvedWindow {
  if (!titles.length) return { start: 0, end: -1, widths: new Map() };
  const { rail, gap } = METRICS[mode];
  const maxOpen = Math.min(mode === 'medium' ? 3 : 4, titles.length);
  const preferredOpenCount = Math.max(1, Math.min(preference?.preferredOpenCount ?? maxOpen, maxOpen));
  const anchor = Math.max(0, Math.min(preference?.anchor ?? 0, titles.length - 1));
  const direction = preference?.direction ?? 'right';
  const fixed = (titles.length - 1) * gap;
  let start = anchor, end = anchor, used = 0;

  // The breakpoint count is only a ceiling. A manual preference may ask for
  // fewer panels, and resizing may temporarily display fewer without changing it.
  for (let count = preferredOpenCount; count >= 1; count--) {
    const preferredStart = direction === 'right' ? anchor : anchor - count + 1;
    const candidateStart = Math.max(0, Math.min(preferredStart, titles.length - count));
    const candidateEnd = candidateStart + count - 1;
    const openMinimums = titles.slice(candidateStart, candidateEnd + 1).reduce((sum, title) => sum + minimumWidth(title, mode), 0);
    const required = fixed + openMinimums + (titles.length - count) * rail;
    if (required <= available || count === 1) {
      start = candidateStart; end = candidateEnd; used = required; break;
    }
  }

  const openCount = end - start + 1;
  const spare = Math.max(0, available - used) / openCount;
  const widths = new Map<string, number>();
  titles.forEach((title, index) => widths.set(title, index >= start && index <= end ? minimumWidth(title, mode) + spare : rail));
  return { start, end, widths };
}

export function SettingsAccordion({ sessionKey, defaultTitle = 'Position & Size', children }: { sessionKey: string; defaultTitle?: string; children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<AccordionMode>('compact');
  const [width, setWidth] = useState(0);
  const [titles, setTitles] = useState<string[]>([]);
  const [windowBySession, setWindowBySession] = useState<Record<string, WindowPreference>>({});
  const [compactOpenBySession, setCompactOpenBySession] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const medium = window.matchMedia('(min-width: 745px)');
    const wide = window.matchMedia('(min-width: 1280px)');
    const update = () => setMode(wide.matches ? 'wide' : medium.matches ? 'medium' : 'compact');
    update(); medium.addEventListener('change', update); wide.addEventListener('change', update);
    return () => { medium.removeEventListener('change', update); wide.removeEventListener('change', update); };
  }, []);

  useEffect(() => {
    const node = containerRef.current; if (!node) return;
    const update = () => {
      setWidth(node.clientWidth);
      setTitles([...node.querySelectorAll<HTMLElement>('[data-settings-section]')].map(section => section.dataset.settingsSection!).filter(Boolean));
    };
    update(); const observer = new ResizeObserver(update); observer.observe(node);
    return () => observer.disconnect();
  }, [sessionKey]);

  const resolved = useMemo(() => mode === 'compact' ? { start: 0, end: -1, widths: new Map<string, number>() } : resolveHorizontalWindow(titles, mode, width, windowBySession[sessionKey]), [mode, sessionKey, titles, width, windowBySession]);
  const value = useMemo<AccordionContextValue>(() => ({
    mode,
    isOpen: title => mode === 'compact'
      ? (Object.hasOwn(compactOpenBySession, sessionKey) ? compactOpenBySession[sessionKey] : defaultTitle) === title
      : (() => { const index = titles.indexOf(title); return index >= resolved.start && index <= resolved.end; })(),
    panelWidth: title => mode === 'compact' ? null : resolved.widths.get(title) ?? METRICS[mode].rail,
    disclosureDirection: title => {
      const index = titles.indexOf(title);
      if (index < resolved.start) return 'right';
      if (index > resolved.end) return 'left';
      return index - resolved.start <= resolved.end - index ? 'left' : 'right';
    },
    toggle: title => {
      if (mode === 'compact') {
        setCompactOpenBySession(current => {
          const active = Object.hasOwn(current, sessionKey) ? current[sessionKey] : defaultTitle;
          return { ...current, [sessionKey]: active === title ? null : title };
        });
        return;
      }
      const index = titles.indexOf(title); if (index < 0) return;
      if (index < resolved.start || index > resolved.end) {
        const currentPreference = windowBySession[sessionKey];
        const currentCount = resolved.end - resolved.start + 1;
        const maxOpen = mode === 'medium' ? 3 : 4;
        const adjacent = index === resolved.start - 1 || index === resolved.end + 1;
        const existingPreference = currentPreference?.preferredOpenCount ?? currentCount;
        const proposedCount = Math.min(maxOpen, existingPreference + 1);
        const direction = index < resolved.start ? 'right' : 'left';
        const proposed = resolveHorizontalWindow(titles, mode, width, { anchor:index, direction, preferredOpenCount:proposedCount, manuallyAdjusted:true });
        const preferredOpenCount = adjacent && existingPreference < maxOpen && proposed.end - proposed.start + 1 === proposedCount
          ? proposedCount
          : existingPreference;
        setWindowBySession(current => ({ ...current, [sessionKey]: {
          anchor: index,
          direction,
          preferredOpenCount,
          manuallyAdjusted: true,
        } }));
        return;
      }
      if (resolved.start === resolved.end) return;
      // Closing an interior panel trims the nearer edge through that panel, so a hole can never be created.
      const closeLeft = index - resolved.start <= resolved.end - index;
      const preferredOpenCount = closeLeft ? resolved.end - index : index - resolved.start;
      setWindowBySession(current => ({ ...current, [sessionKey]: closeLeft
        ? { anchor: index + 1, direction: 'right', preferredOpenCount, manuallyAdjusted: true }
        : { anchor: index - 1, direction: 'left', preferredOpenCount, manuallyAdjusted: true } }));
    },
  }), [compactOpenBySession, defaultTitle, mode, resolved, sessionKey, titles, width, windowBySession]);

  const horizontal = mode !== 'compact';
  return <AccordionContext.Provider value={value}><div ref={containerRef} className={`mt-4 flex ${horizontal ? 'flex-row flex-nowrap items-stretch' : 'flex-col'}`} style={{ gap: horizontal ? METRICS[mode].gap : 12 }}>{children}</div></AccordionContext.Provider>;
}
