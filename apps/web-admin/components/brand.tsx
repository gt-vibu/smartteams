import { Brand as SharedBrand } from '@smarteam/ui';

export function Brand({ compact = false }: { compact?: boolean }) {
  return <SharedBrand compact={compact} />;
}
