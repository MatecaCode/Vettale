
import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

interface ComboboxProps {
  options: { value: string; label: string }[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select option...",
  emptyText = "No option found.",
  disabled = false,
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")
  const containerRef = React.useRef<HTMLDivElement>(null)

  const selectedLabel = React.useMemo(
    () => options.find((o) => o.value === value)?.label ?? "",
    [options, value]
  )

  // Sync display value when dropdown closes
  React.useEffect(() => {
    if (!open) {
      setInputValue(selectedLabel)
    }
  }, [selectedLabel, open])

  const filtered = React.useMemo(() => {
    if (!inputValue) return options
    const lower = inputValue.toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(lower))
  }, [options, inputValue])

  // Close on outside click
  React.useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setInputValue(selectedLabel)
      }
    }
    document.addEventListener("mousedown", handleOutside)
    return () => document.removeEventListener("mousedown", handleOutside)
  }, [selectedLabel])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    setOpen(true)
    if (!e.target.value) {
      onValueChange("")
    }
  }

  const handleFocus = () => {
    setInputValue("")
    setOpen(true)
  }

  const handleSelect = (option: { value: string; label: string }) => {
    onValueChange(option.value)
    setInputValue(option.label)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        autoComplete="off"
      />
      {open && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400 text-center">{emptyText}</div>
          ) : (
            filtered.map((option) => (
              <div
                key={option.value}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 cursor-pointer text-sm transition-colors",
                  "hover:bg-green-50 hover:text-green-800",
                  value === option.value && "bg-green-50 text-green-700 font-medium"
                )}
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleSelect(option)
                }}
              >
                <Check
                  className={cn(
                    "h-3.5 w-3.5 flex-shrink-0",
                    value === option.value ? "opacity-100 text-green-600" : "opacity-0"
                  )}
                />
                {option.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
