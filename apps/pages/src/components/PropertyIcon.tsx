import { Briefcase, Building, Building2, Home, Landmark, Store, Trees } from 'lucide-react';
import type { PropertyType } from '@vastgoed/shared';

export function PropertyIcon({ type, className }: { type: PropertyType; className?: string }) {
  const I = ({ apartment: Building2, villa: Home, riad: Landmark, house: Home, land: Trees, shop: Store, office: Briefcase, building: Building, other: Home } as const)[type];
  return <I className={className} aria-hidden />;
}
