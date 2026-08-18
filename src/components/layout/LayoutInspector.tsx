import type { LayoutElement } from '@/lib/layout/types';

export default function LayoutInspector({ element }: { element: LayoutElement }) {
  const typeName = element.type === 'curved-title' ? 'Curved title' : element.type[0].toUpperCase() + element.type.slice(1);
  return <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
    <h2 className="font-semibold text-slate-800">Settings</h2>
    <h3 className="mt-3 text-base font-semibold text-slate-900">{element.name}</h3>
    <p className="mt-1 text-sm text-slate-600">{typeName} settings will be added in the next pass.</p>
  </section>;
}
