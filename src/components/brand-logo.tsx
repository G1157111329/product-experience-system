import Image from 'next/image';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  className?: string;
  priority?: boolean;
}

export function BrandLogo({ className, priority = false }: BrandLogoProps) {
  return (
    <Image
      src="/brand/product-experience-logo.png"
      alt="产品体验管理平台"
      width={160}
      height={160}
      priority={priority}
      className={cn('object-contain', className)}
    />
  );
}
