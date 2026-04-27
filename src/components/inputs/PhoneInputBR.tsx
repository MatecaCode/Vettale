import React, { useState, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { AlertCircle, ChevronDown, Check } from 'lucide-react';

interface PhoneInputBRProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  error?: boolean;
  helperText?: string;
}

interface CountryOption {
  code: string;
  dial: string;
  flag: string;
  name: string;
}

const COUNTRY_OPTIONS: CountryOption[] = [
  { code: 'BR', dial: '+55', flag: '🇧🇷', name: 'Brasil' },
  { code: 'US', dial: '+1', flag: '🇺🇸', name: 'Estados Unidos' },
  { code: 'AR', dial: '+54', flag: '🇦🇷', name: 'Argentina' },
  { code: 'PT', dial: '+351', flag: '🇵🇹', name: 'Portugal' },
  { code: 'ES', dial: '+34', flag: '🇪🇸', name: 'Espanha' },
  { code: 'IT', dial: '+39', flag: '🇮🇹', name: 'Itália' },
  { code: 'FR', dial: '+33', flag: '🇫🇷', name: 'França' },
  { code: 'DE', dial: '+49', flag: '🇩🇪', name: 'Alemanha' },
  { code: 'GB', dial: '+44', flag: '🇬🇧', name: 'Reino Unido' },
  { code: 'JP', dial: '+81', flag: '🇯🇵', name: 'Japão' },
  { code: 'MX', dial: '+52', flag: '🇲🇽', name: 'México' },
  { code: 'CL', dial: '+56', flag: '🇨🇱', name: 'Chile' },
  { code: 'UY', dial: '+598', flag: '🇺🇾', name: 'Uruguai' },
  { code: 'PY', dial: '+595', flag: '🇵🇾', name: 'Paraguai' },
  { code: 'CO', dial: '+57', flag: '🇨🇴', name: 'Colômbia' },
];

const BR = COUNTRY_OPTIONS[0];

/** Format Brazilian digits (up to 11 digits) for display */
const formatBR = (digits: string): string => {
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
};

/** Detect country from a stored value. Returns BR for plain digits or unknown prefixes. */
const detectCountry = (stored: string): { country: CountryOption; rest: string } => {
  if (!stored) return { country: BR, rest: '' };
  if (!stored.startsWith('+')) return { country: BR, rest: stored };

  // Match longest dial prefix first
  const sorted = [...COUNTRY_OPTIONS].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (stored.startsWith(c.dial)) {
      return { country: c, rest: stored.slice(c.dial.length) };
    }
  }
  return { country: BR, rest: stored.replace(/^\+/, '') };
};

const PhoneInputBR: React.FC<PhoneInputBRProps> = ({
  value,
  onChange,
  label,
  placeholder = '(11) 99999-9999',
  className = '',
  error = false,
  helperText,
}) => {
  const initial = useMemo(() => detectCountry(value), []);
  const [country, setCountry] = useState<CountryOption>(initial.country);
  const [localDigits, setLocalDigits] = useState<string>(
    initial.country.code === 'BR' ? initial.rest.replace(/\D/g, '') : initial.rest.replace(/\D/g, '')
  );
  const [open, setOpen] = useState(false);
  const [showHelper, setShowHelper] = useState(false);

  // Sync if outer value changes
  useEffect(() => {
    const det = detectCountry(value);
    setCountry(det.country);
    setLocalDigits(det.rest.replace(/\D/g, ''));
  }, [value]);

  const emitChange = (newCountry: CountryOption, digits: string) => {
    if (newCountry.code === 'BR') {
      // Backward compatible: store plain digits for BR
      onChange(digits);
    } else {
      onChange(digits ? `${newCountry.dial}${digits}` : '');
    }
  };

  const handleCountrySelect = (c: CountryOption) => {
    setCountry(c);
    setOpen(false);
    emitChange(c, localDigits);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '');
    const max = country.code === 'BR' ? 11 : 15;
    const trimmed = digits.slice(0, max);
    setLocalDigits(trimmed);
    setShowHelper(country.code === 'BR' && trimmed.length > 0 && trimmed.length < 10);
    emitChange(country, trimmed);
  };

  const display =
    country.code === 'BR' ? formatBR(localDigits) : localDigits;

  return (
    <div className={className}>
      {label && (
        <Label className="text-sm font-medium text-gray-700 mb-1 block">
          {label}
        </Label>
      )}

      <div className="flex items-stretch w-full">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`flex items-center gap-1 px-2 rounded-l-md border border-r-0 bg-white hover:bg-gray-50 transition-colors text-sm shrink-0 ${
                error ? 'border-red-500' : 'border-input'
              }`}
              aria-label="Selecionar país"
            >
              <span className="text-base leading-none">{country.flag}</span>
              <span className="text-xs font-medium text-gray-700">{country.dial}</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-64 max-h-72 overflow-y-auto" align="start">
            <ul className="py-1">
              {COUNTRY_OPTIONS.map((c) => (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => handleCountrySelect(c)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 transition-colors text-left ${
                      c.code === country.code ? 'bg-gray-50' : ''
                    }`}
                  >
                    <span className="text-base leading-none">{c.flag}</span>
                    <span className="flex-1 text-gray-700">{c.name}</span>
                    <span className="text-xs text-gray-500 tabular-nums">{c.dial}</span>
                    {c.code === country.code && (
                      <Check className="w-3.5 h-3.5 text-brand-primary" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>

        <Input
          type="tel"
          value={display}
          onChange={handleInputChange}
          placeholder={country.code === 'BR' ? placeholder : 'Número'}
          className={`rounded-l-none min-w-0 flex-1 ${
            error ? 'border-red-500 focus:border-red-500' : ''
          }`}
          maxLength={country.code === 'BR' ? 16 : 15}
          inputMode="numeric"
        />
      </div>

      {(showHelper || helperText) && (
        <div className="flex items-center space-x-1 mt-1">
          <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0" />
          <span className="text-xs text-amber-600">
            {helperText || 'Digite um telefone válido'}
          </span>
        </div>
      )}
    </div>
  );
};

export default PhoneInputBR;
