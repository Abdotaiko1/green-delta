import React, { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type BuildingOption = {
  id: string;
  name: string;
  address?: string;
};

type BuildingComboboxProps = {
  buildings: BuildingOption[];
  value: string;
  onChange: (buildingId: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

const BuildingCombobox: React.FC<BuildingComboboxProps> = ({
  buildings,
  value,
  onChange,
  placeholder = 'اختر المبنى',
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const selected = buildings.find((building) => building.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{selected?.name || placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="اكتب اسم المبنى للبحث..." />
          <CommandList>
            <CommandEmpty>لا يوجد مبنى مطابق</CommandEmpty>
            <CommandGroup>
              {buildings.map((building) => (
                <CommandItem
                  key={building.id}
                  value={`${building.name} ${building.address || ''}`}
                  onSelect={() => {
                    onChange(building.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('h-4 w-4', value === building.id ? 'opacity-100' : 'opacity-0')} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{building.name}</div>
                    {building.address && <div className="truncate text-xs text-muted-foreground">{building.address}</div>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default BuildingCombobox;
