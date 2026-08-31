'use client';

import dynamic from 'next/dynamic';

const EmsWorkspace = dynamic(() => import('../../modules/ems').then((mod) => mod.EmsWorkspace), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-full flex items-center justify-center bg-[#0F172A]">
      <div className="flex items-center space-x-3 text-white">
        <div className="h-7 w-7 rounded-[5px] bg-primary flex items-center justify-center text-white shadow-sm animate-pulse">
          <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <span className="text-sm font-bold tracking-tight">Loading Smarteam EMS...</span>
      </div>
    </div>
  ),
});

export default function TenantPage() {
  return <EmsWorkspace />;
}
