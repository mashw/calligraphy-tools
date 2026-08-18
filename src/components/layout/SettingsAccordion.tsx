'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type AccordionContextValue = { wide: boolean; isOpen: (title: string) => boolean; toggle: (title: string) => void };
const AccordionContext = createContext<AccordionContextValue | null>(null);

export function useSettingsAccordion() { return useContext(AccordionContext); }

export function SettingsAccordion({ sessionKey, defaultTitle = 'Position & Size', children }: { sessionKey: string; defaultTitle?: string; children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  const [width, setWidth] = useState(0);
  const [sectionCount, setSectionCount] = useState(0);
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const [autoCollapsed, setAutoCollapsed] = useState<Set<string>>(() => new Set());
  const [narrowOpenBySession, setNarrowOpenBySession] = useState<Record<string, string | null>>({});
  const stateKey = useCallback((title: string) => `${sessionKey}:${title}`, [sessionKey]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1280px)');
    const update = () => setWide(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const node = containerRef.current; if (!node) return;
    const update = () => { setWidth(node.clientWidth); setSectionCount(node.querySelectorAll<HTMLElement>('[data-settings-section]').length); };
    update(); const observer = new ResizeObserver(update); observer.observe(node);
    return () => observer.disconnect();
  }, [sessionKey]);

  useEffect(() => {
    if (!wide) return;
    const node = containerRef.current; if (!node || !width) return;
    const titles = [...node.querySelectorAll<HTMLElement>('[data-settings-section]')].map(section => section.dataset.settingsSection!).filter(Boolean);
    const gap = 16, expandedWidth = 300, railWidth = 44;
    let total = Math.max(0, titles.length - 1) * gap;
    for (const title of titles) total += manual[stateKey(title)] === false ? railWidth : expandedWidth;
    const next = new Set<string>();
    for (let index = titles.length - 1; index >= 0 && total > width; index--) {
      const title = titles[index];
      if (manual[stateKey(title)] !== undefined) continue;
      next.add(title); total -= expandedWidth - railWidth;
    }
    const frame = requestAnimationFrame(() => setAutoCollapsed(next));
    return () => cancelAnimationFrame(frame);
  }, [manual, sectionCount, sessionKey, stateKey, wide, width]);

  const value = useMemo<AccordionContextValue>(() => ({
    wide,
    isOpen: title => wide
      ? manual[stateKey(title)] !== false && !autoCollapsed.has(title)
      : (Object.hasOwn(narrowOpenBySession, sessionKey) ? narrowOpenBySession[sessionKey] : defaultTitle) === title,
    toggle: title => {
      if (!wide) {
        setNarrowOpenBySession(current => {
          const active = Object.hasOwn(current, sessionKey) ? current[sessionKey] : defaultTitle;
          return { ...current, [sessionKey]: active === title ? null : title };
        });
        return;
      }
      const key = stateKey(title);
      const currentlyOpen = manual[key] !== false && !autoCollapsed.has(title);
      setManual(current => ({ ...current, [key]: !currentlyOpen }));
      setAutoCollapsed(current => { const next = new Set(current); next.delete(title); return next; });
    },
  }), [autoCollapsed, defaultTitle, manual, narrowOpenBySession, sessionKey, stateKey, wide]);

  return <AccordionContext.Provider value={value}><div ref={containerRef} className="mt-4 flex flex-col gap-3 xl:flex-row xl:flex-nowrap xl:items-stretch xl:gap-4">{children}</div></AccordionContext.Provider>;
}
