import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';

interface DateInputBRProps {
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

export const DateInputBR: React.FC<DateInputBRProps> = ({
  value,
  onChange,
  placeholder = 'DD/MM/AAAA',
  className = '',
  id
}) => {
  const [displayValue, setDisplayValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Convert ISO date (YYYY-MM-DD) to display format (DD/MM/AAAA)
  const isoToDisplay = (isoDate: string): string => {
    if (!isoDate) return '';
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
  };

  // Convert display format (DD/MM/AAAA) to ISO date (YYYY-MM-DD)
  const displayToIso = (displayDate: string): string | undefined => {
    if (!displayDate) return undefined;
    
    // Remove all non-digits
    const digits = displayDate.replace(/\D/g, '');
    
    if (digits.length !== 8) return undefined;
    
    const day = digits.substring(0, 2);
    const month = digits.substring(2, 4);
    const year = digits.substring(4, 8);
    
    // Basic validation
    const dayNum = parseInt(day, 10);
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    
    if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12 || yearNum < 1900 || yearNum > 2100) {
      return undefined;
    }
    
    return `${year}-${month}-${day}`;
  };

  // Format display value as user types (DD/MM/AAAA)
  const formatDisplayValue = (input: string): string => {
    const digits = input.replace(/\D/g, '');
    
    if (digits.length === 0) return '';
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.substring(0, 2)}/${digits.substring(2)}`;
    if (digits.length <= 8) return `${digits.substring(0, 2)}/${digits.substring(2, 4)}/${digits.substring(4)}`;
    
    return `${digits.substring(0, 2)}/${digits.substring(2, 4)}/${digits.substring(4, 8)}`;
  };

  // Initialize display value from prop
  useEffect(() => {
    if (value) {
      setDisplayValue(isoToDisplay(value));
    } else {
      setDisplayValue('');
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    const formatted = formatDisplayValue(input);
    setDisplayValue(formatted);
    
    // Try to convert to ISO format
    const isoDate = displayToIso(formatted);
    onChange(isoDate);
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Validate and clean up on blur
    if (displayValue) {
      const isoDate = displayToIso(displayValue);
      if (isoDate) {
        setDisplayValue(isoToDisplay(isoDate)); // Ensure proper formatting
        onChange(isoDate);
      } else {
        setDisplayValue(''); // Clear invalid input
        onChange(undefined);
      }
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow navigation keys, backspace, delete, tab, enter
    if (['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      return;
    }

    // Allow keyboard shortcuts (Ctrl/Cmd + A/C/V/X/Z)
    if (e.ctrlKey || e.metaKey) {
      return;
    }

    // Allow only digits
    if (!/\d/.test(e.key)) {
      e.preventDefault();
    }
  };

  return (
    <Input
      ref={inputRef}
      id={id}
      type="text"
      value={displayValue}
      onChange={handleInputChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={`${className} [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:hover:scale-110 [&::-webkit-calendar-picker-indicator]:transition-transform`}
      style={{ scrollBehavior: 'smooth' }}
    />
  );
};
