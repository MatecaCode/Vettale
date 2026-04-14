import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle } from 'lucide-react';

interface PhoneInputBRProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  error?: boolean;
  helperText?: string;
}

/** Detect if a raw stored value looks like E.164 (with country code) */
const isE164 = (v: string) => v.startsWith('+');

/** Format Brazilian digits (up to 11 digits, no country code) */
const formatBR = (digits: string): string => {
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
};

/** Format an E.164 string for display — keeps it readable but unchanged */
const formatE164Display = (e164: string): string => {
  // Just return as-is; user typed it with + so preserve their formatting intent
  return e164;
};

const PhoneInputBR: React.FC<PhoneInputBRProps> = ({
  value,
  onChange,
  label,
  placeholder = "(11) 99999-9999",
  className = "",
  error = false,
  helperText
}) => {
  const [displayValue, setDisplayValue] = useState('');
  const [showHelper, setShowHelper] = useState(false);

  // Derive display value from stored value
  const toDisplay = (stored: string): string => {
    if (!stored) return '';
    if (isE164(stored)) return formatE164Display(stored);
    return formatBR(stored);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;

    // If user starts with +, treat as international / E.164 — store as-is
    if (raw.startsWith('+') || raw.startsWith(' ')) {
      setDisplayValue(raw);
      onChange(raw.replace(/\s+/g, '')); // store without spaces
      setShowHelper(false);
      return;
    }

    // Otherwise treat as Brazilian digits
    const digits = raw.replace(/\D/g, '');
    if (digits.length <= 11) {
      const formatted = formatBR(digits);
      setDisplayValue(formatted);
      onChange(digits);
      setShowHelper(digits.length > 0 && digits.length < 10);
    }
  };

  const handleFocus = () => {
    if (!isE164(value) && value.length > 0 && value.length < 10) {
      setShowHelper(true);
    }
  };

  const handleBlur = () => {
    setShowHelper(false);
  };

  // Sync display value when prop changes externally
  useEffect(() => {
    setDisplayValue(toDisplay(value));
    if (!isE164(value)) {
      setShowHelper(value.length > 0 && value.length < 10);
    }
  }, [value]);

  return (
    <div className={className}>
      {label && (
        <Label className="text-sm font-medium text-gray-700 mb-1 block">
          {label}
        </Label>
      )}

      <Input
        type="tel"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={error ? 'border-red-500 focus:border-red-500' : ''}
        maxLength={20}
      />

      {(showHelper || helperText) && (
        <div className="flex items-center space-x-1 mt-1">
          <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0" />
          <span className="text-xs text-amber-600">
            {helperText || "Digite um telefone válido"}
          </span>
        </div>
      )}
    </div>
  );
};

export default PhoneInputBR;
