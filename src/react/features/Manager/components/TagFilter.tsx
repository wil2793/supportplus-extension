// ============================================================
// SRC/REACT/FEATURES/MANAGER/COMPONENTS/TAGFILTER.TSX
//
// Filtro de tags con input + dropdown.
// Reemplaza createTagFilter() de manager-view.ts.
// Estado en Zustand via el setter que recibe como prop.
// Sin useState — usa useRef para el input y un store slice.
// ============================================================

import { useRef, useEffect, useCallback } from "react";
import { useManagerStore } from "../../../store/managerStore";

// ─── Props ────────────────────────────────────────────────────

interface TagItem {
  id: number;
  name: string;
}

interface TagFilterProps {
  id: string;
  placeholder?: string;
  items: TagItem[];
  selected: string[];
  onChangeSelected: (selected: string[]) => void;
}

// ─── Store para dropdown visibility por instancia ─────────────
// Usamos un store separado liviano para el dropdown de cada filtro

import { create } from "zustand";

interface DropdownStore {
  openId: string | null;
  query: Record<string, string>;
  setOpen: (id: string | null) => void;
  setQuery: (id: string, q: string) => void;
}

const useDropdownStore = create<DropdownStore>()((set) => ({
  openId: null,
  query: {},
  setOpen: (id) => set({ openId: id }),
  setQuery: (id, q) =>
    set((prev) => ({ query: { ...prev.query, [id]: q } })),
}));

// ─── Componente ───────────────────────────────────────────────

export function TagFilter({
  id,
  placeholder = "🔍 Filtrar...",
  items,
  selected,
  onChangeSelected,
}: TagFilterProps) {
  const inputRef    = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isOpen  = useDropdownStore((s) => s.openId === id);
  const query   = useDropdownStore((s) => s.query[id] ?? "");
  const { setOpen, setQuery } = useDropdownStore.getState();

  // Cierra el dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [setOpen]);

  const removeTag = useCallback(
    (tagId: string) => {
      onChangeSelected(selected.filter((s) => s !== tagId));
    },
    [selected, onChangeSelected],
  );

  const addTag = useCallback(
    (tagId: string) => {
      if (!selected.includes(tagId)) {
        onChangeSelected([...selected, tagId]);
      }
      setQuery(id, "");
      setOpen(null);
      inputRef.current?.focus();
    },
    [selected, onChangeSelected, id, setQuery, setOpen],
  );

  // Filtrar items disponibles (no seleccionados + coinciden con query)
  const available = items.filter(
    (item) =>
      !selected.includes(String(item.id)) &&
      item.name.toLowerCase().includes(query.toLowerCase()),
  );

  const shouldShowDropdown = isOpen && query.length > 0 && available.length > 0;

  return (
    <div
      id={id}
      ref={containerRef}
      className="sp-tag-filter"
      style={{ position: "relative", marginBottom: 8 }}
    >
      {/* Tags seleccionados */}
      {selected.map((sid) => {
        const item = items.find((i) => String(i.id) === sid);
        if (!item) return null;
        return (
          <span key={sid} className="sp-tag-filter-tag">
            {item.name}
            <span
              className="sp-tag-remove"
              onClick={() => removeTag(sid)}
              role="button"
              aria-label={`Quitar ${item.name}`}
            >
              ✕
            </span>
          </span>
        );
      })}

      {/* Input de búsqueda */}
      <input
        ref={inputRef}
        type="text"
        className="sp-tag-filter-input"
        placeholder={selected.length ? "+ Agregar..." : placeholder}
        value={query}
        onChange={(e) => {
          setQuery(id, e.target.value);
          setOpen(id);
        }}
        onFocus={() => {
          if (query) setOpen(id);
        }}
        aria-autocomplete="list"
        aria-expanded={shouldShowDropdown}
      />

      {/* Dropdown de opciones */}
      {shouldShowDropdown && (
        <div
          className="sp-tag-filter-dropdown"
          style={{ display: "block" }}
          role="listbox"
        >
          {available.slice(0, 10).map((item) => (
            <div
              key={item.id}
              className="sp-tag-filter-option"
              role="option"
              onMouseDown={(e) => {
                e.preventDefault();
                addTag(String(item.id));
              }}
            >
              {item.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Hook de integración con el store ────────────────────────

export function useSummaryFilter() {
  const filter    = useManagerStore((s) => s.summaryFilter);
  const setFilter = useManagerStore((s) => s.setSummaryFilter);
  return { filter, setFilter };
}

export function useSectionFilter() {
  const filter    = useManagerStore((s) => s.sectionFilter);
  const setFilter = useManagerStore((s) => s.setSectionFilter);
  return { filter, setFilter };
}
