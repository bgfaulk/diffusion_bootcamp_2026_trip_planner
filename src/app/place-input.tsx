"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

export type PlaceSuggestion = { placeId: string; text: string };

// Text input with Google Places suggestions (via /api/places/autocomplete). Typing freely still works;
// picking a suggestion fills in Google's formatted text and calls onPick.
export function PlaceInput({ value, onChange, onPick, name, placeholder, maxLength = 240, autoFocus }: {
  value: string;
  onChange: (value: string) => void;
  onPick?: (place: PlaceSuggestion) => void;
  name?: string;
  placeholder?: string;
  maxLength?: number;
  autoFocus?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  // Only search after the person types here, not for saved values or a picked suggestion.
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current) return;
    const timeout = setTimeout(async () => {
      if (value.trim().length < 3) return setSuggestions([]);
      const result = await api("/api/places/autocomplete", { method: "POST", body: JSON.stringify({ input: value }) }).catch(() => ({ suggestions: [] }));
      setSuggestions(result.suggestions || []);
      setOpen(true);
    }, 250);
    return () => clearTimeout(timeout);
  }, [value]);

  function pick(place: PlaceSuggestion) {
    typed.current = false;
    setSuggestions([]);
    setOpen(false);
    onChange(place.text);
    onPick?.(place);
  }

  return (
    <span className="place-input">
      <input
        name={name}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
        autoComplete="off"
        onChange={event => { typed.current = true; onChange(event.target.value); }}
        onFocus={() => suggestions.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}
      />
      {open && suggestions.length > 0 && (
        <span className="suggestions" role="listbox">
          {suggestions.map(suggestion => (
            <button type="button" role="option" aria-selected="false" key={suggestion.placeId} onMouseDown={event => event.preventDefault()} onClick={() => pick(suggestion)}>{suggestion.text}</button>
          ))}
        </span>
      )}
    </span>
  );
}
