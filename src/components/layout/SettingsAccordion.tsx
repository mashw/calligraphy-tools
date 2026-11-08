'use client';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
type AccordionContextValue = { isOpen: (title: string) => boolean; toggle: (title: string) => void };
const AccordionContext = createContext<AccordionContextValue | null>(null);
export function useSettingsAccordion() { return useContext(AccordionContext); }
/** Independent vertical sections retain state for each selected element. */
export function SettingsAccordion({ sessionKey, defaultTitle = 'Position & Size', children }: { sessionKey: string; defaultTitle?: string; children: ReactNode }) {
  const [sections, setSections] = useState<Record<string, Record<string, boolean>>>({});
  const value = useMemo<AccordionContextValue>(() => ({
    isOpen: title => sections[sessionKey]?.[title] ?? title === defaultTitle,
    toggle: title => setSections(current => ({ ...current, [sessionKey]: { ...current[sessionKey], [title]: !(current[sessionKey]?.[title] ?? title === defaultTitle) } })),
  }), [sections, sessionKey, defaultTitle]);
  return <AccordionContext.Provider value={value}><div className="settings-sections">{children}</div></AccordionContext.Provider>;
}
