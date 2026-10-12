'use client';

import dynamic from 'next/dynamic';
import { LoadingIndicator } from '@smarteam/ui';

const EmsWorkspace = dynamic(() => import('../../modules/ems').then((mod) => mod.EmsWorkspace), {
  ssr: false,
  loading: () => <LoadingIndicator variant="screen" label="Opening your workspace" />,
});

export default function TenantPage() {
  return <EmsWorkspace />;
}
