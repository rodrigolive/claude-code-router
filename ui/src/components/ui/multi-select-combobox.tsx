import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectComboboxProps {
  options: MultiSelectOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyPlaceholder?: string;
  className?: string;
}

export function MultiSelectCombobox({
  options,
  value,
  onChange,
  placeholder = "Select items...",
  searchPlaceholder = "Search...",
  emptyPlaceholder = "No items found.",
  className,
}: MultiSelectComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Initialize selected values from props
  useEffect(() => {
    if (Array.isArray(value)) {
      setSelectedValues(value);
    } else if (typeof value === 'string' && value) {
      setSelectedValues([value]);
    } else {
      setSelectedValues([]);
    }
  }, [value]);

  const filteredOptions = options.filter(option =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggle = (optionValue: string) => {
    const newSelectedValues = selectedValues.includes(optionValue)
      ? selectedValues.filter(v => v !== optionValue)
      : [...selectedValues, optionValue];
    
    setSelectedValues(newSelectedValues);
    onChange(newSelectedValues);
  };

  const handleRemove = (optionValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelectedValues = selectedValues.filter(v => v !== optionValue);
    setSelectedValues(newSelectedValues);
    onChange(newSelectedValues);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      buttonRef.current?.focus();
    }
  };

  const displayText = selectedValues.length === 0 
    ? placeholder 
    : selectedValues.length === 1 
      ? options.find(opt => opt.value === selectedValues[0])?.label || selectedValues[0]
      : `${selectedValues.length} models selected`;

  return (
    <div className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          open && "ring-2 ring-ring ring-offset-2"
        )}
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{displayText}</span>
        <ChevronsUpDown className="h-4 w-4 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          <div className="p-2">
            <input
              ref={inputRef}
              type="text"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              autoFocus
            />
          </div>
          
          {filteredOptions.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {emptyPlaceholder}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredOptions.map((option) => (
                <div
                  key={option.value}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                    selectedValues.includes(option.value) && "bg-accent text-accent-foreground"
                  )}
                  onClick={() => handleToggle(option.value)}
                >
                  <div className="flex items-center space-x-2 flex-1">
                    <div className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                      selectedValues.includes(option.value) && "bg-primary text-primary-foreground"
                    )}>
                      {selectedValues.includes(option.value) && (
                        <Check className="h-3 w-3" />
                      )}
                    </div>
                    <span className="flex-1">{option.label}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selected items display */}
      {selectedValues.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {selectedValues.map((value) => {
            const option = options.find(opt => opt.value === value);
            return (
              <div
                key={value}
                className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs"
              >
                <span>{option?.label || value}</span>
                <button
                  type="button"
                  onClick={(e) => handleRemove(value, e)}
                  className="hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}