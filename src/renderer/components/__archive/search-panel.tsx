import { useEffect, useRef } from "react";
import { XIcon, ChevronUpIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SearchPanelProps {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onClose: () => void;
  onFindNext: () => void;
  onFindPrevious: () => void;
  matchCount: number;
  currentMatch: number;
}

export function SearchPanel({
  searchQuery,
  onSearchQueryChange,
  onClose,
  onFindNext,
  onFindPrevious,
  matchCount,
  currentMatch,
}: SearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        onFindPrevious();
      } else {
        onFindNext();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="flex h-[var(--height-search-panel)] items-center gap-2 border-border border-b bg-muted/50 px-2">
      <Input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search..."
        className="h-6 w-48 bg-background text-[length:var(--font-search-input)]"
      />
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:bg-accent"
          onClick={onFindPrevious}
          disabled={!searchQuery || matchCount === 0}
        >
          <ChevronUpIcon className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:bg-accent"
          onClick={onFindNext}
          disabled={!searchQuery || matchCount === 0}
        >
          <ChevronDownIcon className="size-4" />
        </Button>
      </div>
      {searchQuery && (
        <span className="text-muted-foreground text-[length:var(--font-chat-meta)]">
          {matchCount === 0 ? "No results" : `${currentMatch} of ${matchCount}`}
        </span>
      )}
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="icon"
        className="size-6 text-muted-foreground hover:bg-accent"
        onClick={onClose}
      >
        <XIcon className="size-4" />
      </Button>
    </div>
  );
}
