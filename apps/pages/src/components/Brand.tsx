import { useMemo, useState } from 'react';
import { AMPLIFY, amplifyMarkSvg } from '@vastgoed/shared';

let seq = 0;
/** The Amplify mark (sound bars + growth arrow). tone: 'dark' = on a dark background (white bars). */
export function AmplifyMark({ className = '', tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  const [id] = useState(() => `am${++seq}`);
  const html = useMemo(() => amplifyMarkSvg({ bars: tone === 'dark' ? '#FFFFFF' : AMPLIFY.navy, id }), [tone, id]);
  return <span className={`inline-block ${className}`} aria-hidden dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Logo: the mark plus the wordmark AMPLIFY REAL ESTATE, in the Amplify colors. */
export function AmplifyLogo({ className = '', size = 'md', tone = 'dark' }: { className?: string; size?: 'sm' | 'md' | 'lg'; tone?: 'dark' | 'light' }) {
  const m = size === 'lg' ? 'h-12 w-[3.65rem]' : size === 'sm' ? 'h-7 w-[2.15rem]' : 'h-9 w-[2.75rem]';
  const txt = size === 'lg' ? 'text-[1.2rem]' : size === 'sm' ? 'text-[0.72rem]' : 'text-[0.9rem]';
  return (
    <div className={`flex items-center gap-2.5 ${className}`} dir="ltr">
      <AmplifyMark tone={tone} className={`shrink-0 ${m}`} />
      <span className={`font-logo font-extrabold leading-none tracking-[0.02em] whitespace-nowrap ${txt} ${tone === 'dark' ? 'text-white' : 'text-[#002E5F]'}`}>
        AMPLIFY <span className="text-[#05B962]">REAL ESTATE</span>
      </span>
    </div>
  );
}
