import type { SVGProps } from 'react';

export type IconName =
  | 'arrow-right'
  | 'building'
  | 'check'
  | 'clipboard'
  | 'key'
  | 'lock'
  | 'logout'
  | 'plus'
  | 'refresh'
  | 'shield'
  | 'spark'
  | 'warning';

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8,
  };
  const paths: Record<IconName, React.ReactNode> = {
    'arrow-right': <path d="M5 12h14m-6-6 6 6-6 6" />,
    building: <path d="M4 21h16M6 21V5l6-2 6 2v16M9 8h1m4 0h1M9 12h1m4 0h1M9 16h1m4 0h1" />,
    check: <path d="m5 12 4 4L19 6" />,
    clipboard: (
      <path d="M9 5h6m-5-2h4a1 1 0 0 1 1 1v2H9V4a1 1 0 0 1 1-1ZM6 6h12a1 1 0 0 1 1 1v13H5V7a1 1 0 0 1 1-1Zm3 5h6m-6 4h4" />
    ),
    key: (
      <path d="m15.5 8.5 4-4m-2 0 2 2m-5.5 8.5a5 5 0 1 1-7.07-7.07A5 5 0 0 1 14 13.5L19 18l-2 2-2-2 1-1-2-2-1 1-2-2" />
    ),
    lock: <path d="M7 10V7a5 5 0 0 1 10 0v3m-9 0h8a2 2 0 0 1 2 2v7H6v-7a2 2 0 0 1 2-2Zm4 3v3" />,
    logout: <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4m5-11 4 4-4 4m4-4H9" />,
    plus: <path d="M12 5v14M5 12h14" />,
    refresh: (
      <path d="M20 11a8 8 0 0 0-14.7-4L4 9m0 0V4m0 5h5m-1 4a8 8 0 0 0 14.7 4L20 15m0 0v5m0-5h-5" />
    ),
    shield: <path d="M12 3 5 6v5c0 4.4 2.9 8.4 7 10 4.1-1.6 7-5.6 7-10V6l-7-3Zm-3 9 2 2 4-4" />,
    spark: (
      <path d="m12 3 1.3 5.7L19 10l-5.7 1.3L12 17l-1.3-5.7L5 10l5.7-1.3L12 3Zm6 12 .5 2.5L21 18l-2.5.5L18 21l-.5-2.5L15 18l2.5-.5L18 15Z" />
    ),
    warning: <path d="m12 4 9 16H3L12 4Zm0 5v5m0 3h.01" />,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" {...common} {...props}>
      {paths[name]}
    </svg>
  );
}
