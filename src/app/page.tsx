import Link from 'next/link';
import { TOOLS } from '@/components/editor/AppShell';

export default function ToolDirectory() {
  return <main className="tool-directory"><p className="eyebrow">THE CALLIGRAPHY STUDIO</p><h1>Make room for<br />beautiful letters.</h1><p className="directory-intro">From the first guideline to a complete composition. Choose a tool to plan, explore and prepare your next piece.</p><div className="tool-grid">{TOOLS.map(([path, name, description], index) => <Link href={path} key={path}><span className="tool-number">{String(index + 1).padStart(2, '0')}</span><h2>{name} <span aria-hidden="true">↗</span></h2><p>{description}</p>{path === '/borders/dev' && <small>Experimental laboratory</small>}</Link>)}</div><p className="directory-note">Designed for hand lettering. Physical measurements stay precise; preview navigation never changes your document.</p></main>;
}
