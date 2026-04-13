import * as React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Country {
  code: string;
  dial: string;
  flag: string;
  name: string;
}

const COUNTRIES: Country[] = [
  { code: 'BR', dial: '+55',  flag: '🇧🇷', name: 'Brasil' },
  { code: 'US', dial: '+1',   flag: '🇺🇸', name: 'EUA' },
  { code: 'PT', dial: '+351', flag: '🇵🇹', name: 'Portugal' },
  { code: 'AR', dial: '+54',  flag: '🇦🇷', name: 'Argentina' },
  { code: 'CL', dial: '+56',  flag: '🇨🇱', name: 'Chile' },
  { code: 'CO', dial: '+57',  flag: '🇨🇴', name: 'Colômbia' },
  { code: 'MX', dial: '+52',  flag: '🇲🇽', name: 'México' },
  { code: 'PE', dial: '+51',  flag: '🇵🇪', name: 'Peru' },
  { code: 'UY', dial: '+598', flag: '🇺🇾', name: 'Uruguai' },
  { code: 'PY', dial: '+595', flag: '🇵🇾', name: 'Paraguai' },
  { code: 'BO', dial: '+591', flag: '🇧🇴', name: 'Bolívia' },
  { code: 'VE', dial: '+58',  flag: '🇻🇪', name: 'Venezuela' },
  { code: 'EC', dial: '+593', flag: '🇪🇨', name: 'Equador' },
  { code: 'CA', dial: '+1',   flag: '🇨🇦', name: 'Canadá' },
  { code: 'GB', dial: '+44',  flag: '🇬🇧', name: 'Reino Unido' },
  { code: 'DE', dial: '+49',  flag: '🇩🇪', name: 'Alemanha' },
  { code: 'FR', dial: '+33',  flag: '🇫🇷', name: 'França' },
  { code: 'ES', dial: '+34',  flag: '🇪🇸', name: 'Espanha' },
  { code: 'IT', dial: '+39',  flag: '🇮🇹', name: 'Itália' },
  { code: 'JP', dial: '+81',  flag: '🇯🇵', name: 'Japão' },
  { code: 'CN', dial: '+86',  flag: '🇨🇳', name: 'China' },
  { code: 'IN', dial: '+91',  flag: '🇮🇳', name: 'Índia' },
  { code: 'AU', dial: '+61',  flag: '🇦🇺', name: 'Austrália' },
  { code: 'ZA', dial: '+27',  flag: '🇿🇦', name: 'África do Sul' },
  { code: 'NG', dial: '+234', flag: '🇳🇬', name: 'Nigéria' },
  { code: 'RU', dial: '+7',   flag: '🇷🇺', name: 'Rússia' },
  { code: 'KR', dial: '+82',  flag: '🇰🇷', name: 'Coreia do Sul' },
];

interface PhoneInputProps {
  /** Full E.164 phone number emitted by onChange, e.g. "+5511999999999" */
  value: string;
  onChange: (fullPhone: string) => void;
  disabled?: boolean;
  className?: string;
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, disabled, className }, ref) => {
    const [dialCode, setDialCode] = React.useState('+55');
    const [number, setNumber] = React.useState('');

    // Sync internal state when value is set externally (e.g. reset)
    React.useEffect(() => {
      if (!value) {
        setNumber('');
        return;
      }
      const matched = COUNTRIES.find(c => value.startsWith(c.dial));
      if (matched) {
        setDialCode(matched.dial);
        setNumber(value.slice(matched.dial.length));
      }
    }, []); // only on mount

    const emit = (dc: string, num: string) => {
      // Strip everything except digits from the number part
      const digits = num.replace(/\D/g, '');
      onChange(dc + digits);
    };

    const handleDialChange = (dc: string) => {
      setDialCode(dc);
      emit(dc, number);
    };

    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setNumber(e.target.value);
      emit(dialCode, e.target.value);
    };

    const selectedCountry = COUNTRIES.find(c => c.dial === dialCode && c.code !== 'CA')
      ?? COUNTRIES.find(c => c.dial === dialCode)
      ?? COUNTRIES[0];

    return (
      <div className={cn('flex gap-2', className)}>
        {/* Country code selector */}
        <Select value={`${selectedCountry.code}|${dialCode}`} onValueChange={(v) => handleDialChange(v.split('|')[1])} disabled={disabled}>
          <SelectTrigger className="w-[110px] shrink-0 px-2">
            <SelectValue>
              <span className="flex items-center gap-1.5 text-sm">
                <span>{selectedCountry.flag}</span>
                <span className="text-muted-foreground">{dialCode}</span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={`${c.code}|${c.dial}`}>
                <span className="flex items-center gap-2">
                  <span>{c.flag}</span>
                  <span className="text-muted-foreground w-10 shrink-0">{c.dial}</span>
                  <span>{c.name}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Number input */}
        <Input
          ref={ref}
          type="tel"
          placeholder="11 99999-9999"
          value={number}
          onChange={handleNumberChange}
          disabled={disabled}
          className="flex-1"
        />
      </div>
    );
  }
);
PhoneInput.displayName = 'PhoneInput';

export { PhoneInput, COUNTRIES };
