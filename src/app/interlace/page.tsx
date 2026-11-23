import { redirect } from 'next/navigation';

export default function InterlacePage() {
  redirect('/woven?compose=1');
}
