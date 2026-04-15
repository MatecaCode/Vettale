import React, { useState } from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PetDobCalendar } from "./PetDobCalendar";

interface PetDobPickerProps {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function tryParseDate(input: string): Date | null {
  const trimmed = input.trim();
  if (trimmed.length < 8) return null;

  // Brazilian format first (DD/MM/YYYY), then fallbacks
  const formatsToTry = [
    "dd/MM/yyyy",
    "dd-MM-yyyy",
    "ddMMyyyy",
  ];

  for (const fmt of formatsToTry) {
    if (trimmed.length === fmt.replace(/[^a-zA-Z]/g, "").length + (fmt.match(/[^a-zA-Z]/g) || []).length) {
      const parsed = parse(trimmed, fmt, new Date());
      if (isValid(parsed) && parsed.getFullYear() > 1900) {
        return parsed;
      }
    }
  }
  return null;
}

export function PetDobPicker({
  value,
  onChange,
  placeholder = "DD/MM/AAAA",
  disabled = false,
  className,
}: PetDobPickerProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  React.useEffect(() => {
    if (value && !isFocused) {
      setInputValue(format(value, "dd/MM/yyyy"));
    } else if (!value && !isFocused) {
      setInputValue("");
    }
  }, [value, isFocused]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputValue(raw);

    const parsed = tryParseDate(raw);
    if (parsed) {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (parsed <= today) {
        onChange?.(parsed);
      }
    } else if (!raw) {
      onChange?.(undefined);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const parsed = tryParseDate(inputValue);
      if (parsed) {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (parsed <= today) {
          onChange?.(parsed);
        }
      }
    }
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    onChange?.(date);
    if (date) {
      setInputValue(format(date, "dd/MM/yyyy"));
    }
    setOpen(false);
  };

  return (
    <div className={cn("relative flex items-center", className)}>
      <Input
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setTimeout(() => setIsFocused(false), 150);
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="pr-10 h-12 text-base"
        autoComplete="off"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 h-full px-3 text-gray-400 hover:text-gray-600 hover:bg-transparent"
            disabled={disabled}
            tabIndex={-1}
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <PetDobCalendar value={value} onChange={handleCalendarSelect} />
          <div className="flex gap-2 p-3 pt-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onChange?.(value);
                setOpen(false);
              }}
              className="flex-1"
            >
              OK
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
