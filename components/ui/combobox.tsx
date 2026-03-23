"use client";
// components/ui/combobox.tsx
import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComboboxProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  allowCustom?: boolean;
  error?: string;
  disabled?: boolean;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Search or type…",
  emptyMessage = "No results found",
  allowCustom = false,
  error,
  disabled = false,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value ?? "");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    setSearch(value ?? "");
  }, [value]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (!allowCustom) setSearch(value ?? "");
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [value, allowCustom]);

  const filtered = search.trim()
    ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase())).slice(0, 100)
    : options.slice(0, 100);

  function select(option: string) {
    onChange(option);
    setSearch(option);
    setOpen(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setSearch(v);
    setHighlighted(0);
    setOpen(true);
    if (allowCustom) onChange(v);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) select(filtered[highlighted]);
      else if (allowCustom && search) { onChange(search); setOpen(false); }
    } else if (e.key === "Escape") {
      setOpen(false);
      if (!allowCustom) setSearch(value ?? "");
    }
  }

  useEffect(() => {
    if (listRef.current && open) {
      const item = listRef.current.children[highlighted] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [highlighted, open]);

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    setSearch("");
    inputRef.current?.focus();
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className={cn(
          "flex h-9 w-full items-center rounded-md border bg-background px-3 text-sm shadow-sm transition-colors",
          open ? "border-ring ring-1 ring-ring" : "border-input",
          error ? "border-destructive ring-1 ring-destructive" : "",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-text"
        )}
      >
        <input
          ref={inputRef}
          value={search}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground min-w-0 text-sm"
          autoComplete="off"
        />
        <div className="flex items-center gap-1 ml-1 flex-shrink-0">
          {value && !disabled && (
            <button
              type="button"
              onClick={clear}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </div>
      </div>

      {open && !disabled && (
        <div className="absolute z-[200] mt-1 w-full rounded-md border bg-popover shadow-md">
          <ul
            ref={listRef}
            className="max-h-52 overflow-y-auto p-1 scrollbar-thin"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted-foreground text-center">
                {allowCustom && search ? `Press Enter to use "${search}"` : emptyMessage}
              </li>
            ) : (
              filtered.map((option, i) => (
                <li
                  key={option}
                  onMouseDown={(e) => { e.preventDefault(); select(option); }}
                  onMouseEnter={() => setHighlighted(i)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 text-sm",
                    i === highlighted
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  )}
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 flex-shrink-0",
                      value === option ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{option}</span>
                </li>
              ))
            )}
            {filtered.length === 100 && (
              <li className="px-3 py-1.5 text-[10px] text-muted-foreground text-center border-t">
                Showing first 100 — type to narrow down
              </li>
            )}
          </ul>
        </div>
      )}

      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}