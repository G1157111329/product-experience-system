import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

type FilterBarProps = React.ComponentProps<'div'> & {
  sticky?: boolean;
};

export function FilterBar({ className, sticky = true, ...props }: FilterBarProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:items-center',
        sticky &&
          'sticky top-14 z-20 -mx-3 border-y bg-background/95 px-3 py-2 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0',
        className
      )}
      {...props}
    />
  );
}

type SearchFieldProps = Omit<React.ComponentProps<typeof Input>, 'type'> & {
  wrapperClassName?: string;
};

export function SearchField({ className, wrapperClassName, ...props }: SearchFieldProps) {
  return (
    <div className={cn('relative min-w-0 flex-1', wrapperClassName)}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input className={cn('h-11 pl-9 sm:h-10', className)} type="search" {...props} />
    </div>
  );
}

