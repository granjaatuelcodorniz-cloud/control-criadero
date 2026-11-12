'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';

type Props = Omit<ComponentProps<typeof Link>, 'href' | 'onNavigate'> & { href: string };

export default function AppLink({ href, ...props }: Props) {
  return <Link {...props} href={href} onNavigate={event => {
    if (navigator.onLine) return;
    event.preventDefault();
    window.location.assign(href);
  }} />;
}
