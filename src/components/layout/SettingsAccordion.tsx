'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type AccordionMode = 'compact' | 'medium' | 'wide';
type SectionWidth = { medium: number; wide: number };
type AccordionContextValue = {
  mode: AccordionMode;
  isOpen: (title: string) => boolean;
  panelWidth: (title: string, open: boolean) => number | null;
  toggle: (title: string) => void;
};

const DEFAULT_WIDTH: SectionWidth = { medium: 250, wide: 290 };
const SECTION_WIDTHS: Record<string, SectionWidth> = {
  'Position & Size': { medium: 250, wide: 290 },
  Basics: { medium: 250, wide: 280 },
  'Script Details': { medium: 270, wide: 320 },
  Margins: { medium: 240, wide: 270 },
  'Guide appearance': { medium: 260, wide: 310 },
  Circles: { medium: 270, wide: 320 },
  'Additional Bands': { medium: 270, wide: 320 },
  'Text & Fit': { medium: 260, wide: 310 },
  Display: { medium: 230, wide: 270 },
  'Curve & Guides': { medium: 270, wide: 320 },
};
const PRIORITY: Record<string, number> = {
  'Position & Size': 100, Basics: 90, 'Script Details': 85, Shape: 80,
  Circles: 70, 'Additional Bands': 70, 'Text & Fit': 65, 'Curve & Guides': 65,
  Margins: 30, 'Guide appearance': 25, Display: 20, Advanced: 10,
};
const METRICS = {
  medium: { rail: 40, gap: 10, maxOpen: 2 },
  wide: { rail: 44, gap: 16, maxOpen: Infinity },
} as const;

const AccordionContext = createContext<AccordionContextValue | null>(null);
export function useSettingsAccordion() { return useContext(AccordionContext); }

function widthFor(title: string, mode: 'medium' | 'wide') {
  return (SECTION_WIDTHS[title] ?? DEFAULT_WIDTH)[mode];
}

function fitHorizontalSections(titles: string[], mode: 'medium' | 'wide', width: number, manualClosed: Set<string>, sessionKey: string, recent: string[]) {
  const { rail, gap, maxOpen } = METRICS[mode];
  const candidates = titles.filter(title => !manualClosed.has(`${sessionKey}:${title}`));
  const recentIndex = new Map(recent.map((title, index) => [title, index]));
  candidates.sort((a, b) => {
    const aIndex = recentIndex.get(a), bIndex = recentIndex.get(b);
    const aRecent = aIndex === 0 ? 10000 : aIndex === undefined ? 0 : 1000 - aIndex;
    const bRecent = bIndex === 0 ? 10000 : bIndex === undefined ? 0 : 1000 - bIndex;
    return bRecent + (PRIORITY[b] ?? 50) - aRecent - (PRIORITY[a] ?? 50) || titles.indexOf(a) - titles.indexOf(b);
  });

  const open = new Set<string>();
  let used = Math.max(0, titles.length - 1) * gap + titles.length * rail;
  for (const title of candidates) {
    if (open.size >= maxOpen) break;
    const extra = widthFor(title, mode) - rail;
    if (used + extra <= width) { open.add(title); used += extra; }
  }
  return open;
}

export function SettingsAccordion({ sessionKey, defaultTitle = 'Position & Size', children }: { sessionKey: string; defaultTitle?: string; children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<AccordionMode>('compact');
  const [width, setWidth] = useState(0);
  const [titles, setTitles] = useState<string[]>([]);
  const [manualClosed, setManualClosed] = useState<Set<string>>(() => new Set());
  const [recentBySession, setRecentBySession] = useState<Record<string, string[]>>({});
  const [compactOpenBySession, setCompactOpenBySession] = useState<Record<string, string | null>>({});
  const stateKey = useCallback((title: string) => `${sessionKey}:${title}`, [sessionKey]);

  useEffect(() => {
    const medium = window.matchMedia('(min-width: 665px)');
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

  const horizontalOpen = useMemo(() => mode === 'compact' ? new Set<string>() : fitHorizontalSections(titles, mode, width, manualClosed, sessionKey, recentBySession[sessionKey] ?? []), [manualClosed, mode, recentBySession, sessionKey, titles, width]);
  const value = useMemo<AccordionContextValue>(() => ({
    mode,
    isOpen: title => mode === 'compact'
      ? (Object.hasOwn(compactOpenBySession, sessionKey) ? compactOpenBySession[sessionKey] : defaultTitle) === title
      : horizontalOpen.has(title),
    panelWidth: (title, open) => mode === 'compact' ? null : open ? widthFor(title, mode) : METRICS[mode].rail,
    toggle: title => {
      if (mode === 'compact') {
        setCompactOpenBySession(current => {
          const active = Object.hasOwn(current, sessionKey) ? current[sessionKey] : defaultTitle;
          return { ...current, [sessionKey]: active === title ? null : title };
        });
        return;
      }
      const key = stateKey(title);
      if (horizontalOpen.has(title)) {
        setManualClosed(current => { const next = new Set(current); next.add(key); return next; });
      } else {
        setManualClosed(current => { const next = new Set(current); next.delete(key); return next; });
        setRecentBySession(current => ({ ...current, [sessionKey]: [title, ...(current[sessionKey] ?? []).filter(item => item !== title)] }));
      }
    },
  }), [compactOpenBySession, defaultTitle, horizontalOpen, mode, sessionKey, stateKey]);

  const horizontal = mode !== 'compact';
  return <AccordionContext.Provider value={value}><div ref={containerRef} className={`mt-4 flex ${horizontal ? 'flex-row flex-nowrap items-stretch' : 'flex-col'}`} style={{ gap: horizontal ? METRICS[mode].gap : 12 }}>{children}</div></AccordionContext.Provider>;
}
