"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useDebounce } from "@/lib/use-debounce";
import { searchStocks, type StockSuggestion } from "@/lib/stock-search";
import { Input } from "@/components/ui/input";

interface StockAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: StockSuggestion) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function StockAutocomplete({
  value,
  onChange,
  onSelect,
  disabled = false,
  placeholder = "종목 입력",
  className = "",
}: StockAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<StockSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showNoResults, setShowNoResults] = useState(false); // 검색 결과 없음 표시
  const [highlightedText, setHighlightedText] = useState("");
  const isSelectingRef = useRef(false); // 선택 중인지 추적
  const lastSelectedSymbolRef = useRef<string | null>(null); // 마지막으로 선택된 심볼 추적
  const noResultsTimerRef = useRef<NodeJS.Timeout | null>(null); // 자동 숨김 타이머

  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const noResultsRef = useRef<HTMLDivElement>(null); // 검색 결과 없음 창 ref
  const debouncedValue = useDebounce(value, 400); // 400ms debounce

  // 검색 실행
  useEffect(() => {
    // 분석 중이면 검색 중지
    if (disabled) {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsLoading(false);
      return;
    }

    // 선택 중이거나, 마지막으로 선택된 심볼과 동일한 값이면 검색 건너뛰기
    if (isSelectingRef.current || (lastSelectedSymbolRef.current && debouncedValue === lastSelectedSymbolRef.current)) {
      return;
    }

    if (!debouncedValue || debouncedValue.trim().length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsLoading(false);
      lastSelectedSymbolRef.current = null;
      return;
    }

    if (debouncedValue.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsLoading(false);
      lastSelectedSymbolRef.current = null;
      return;
    }

    setIsLoading(true);
    setShowSuggestions(true);

    searchStocks(debouncedValue)
      .then((results) => {
        console.log(`[Autocomplete] Search query: "${debouncedValue}", Results: ${results.length}`, results);
        setSuggestions(results);
        setHighlightedText(debouncedValue.trim());
        setSelectedIndex(-1);
        setIsLoading(false);

        // 검색 결과 없음 처리
        if (results.length === 0) {
          setShowNoResults(true);
          // 기존 타이머 취소
          if (noResultsTimerRef.current) {
            clearTimeout(noResultsTimerRef.current);
          }
          // 2초 후 자동 숨김
          noResultsTimerRef.current = setTimeout(() => {
            setShowNoResults(false);
          }, 2000);
        } else {
          setShowNoResults(false);
          if (noResultsTimerRef.current) {
            clearTimeout(noResultsTimerRef.current);
          }
        }
      })
      .catch((error) => {
        console.error("Error searching stocks:", error);
        setSuggestions([]);
        setIsLoading(false);
        setShowNoResults(false);
      });
  }, [debouncedValue, disabled]);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (noResultsTimerRef.current) {
        clearTimeout(noResultsTimerRef.current);
      }
    };
  }, []);

  // 입력값 변경 시
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    
    // 사용자가 직접 입력한 경우에만 선택 플래그 초기화
    if (!isSelectingRef.current) {
      lastSelectedSymbolRef.current = null;
    }
    
    onChange(newValue);
    setSelectedIndex(-1);
    if (newValue.trim().length >= 2) {
      setShowSuggestions(true);
    }
  };

  // 제안 선택
  const handleSelect = useCallback(
    (suggestion: StockSuggestion) => {
      // 선택 중 플래그 설정
      isSelectingRef.current = true;
      lastSelectedSymbolRef.current = suggestion.symbol;
      
      onSelect(suggestion);
      setShowSuggestions(false);
      setSuggestions([]);
      setSelectedIndex(-1);
      
      // 선택 완료 후 플래그 해제 (debounce 시간보다 약간 더 길게)
      setTimeout(() => {
        isSelectingRef.current = false;
      }, 500);
    },
    [onSelect]
  );

  // 키보드 네비게이션
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        // 입력값 그대로 사용
        if (value.trim()) {
          onSelect({
            symbol: value.trim(),
            name: value.trim(),
          });
        }
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSelect(suggestions[selectedIndex]);
        } else if (suggestions.length > 0) {
          handleSelect(suggestions[0]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
      case "Tab":
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          e.preventDefault();
          handleSelect(suggestions[selectedIndex]);
        }
        break;
    }
  };

  // 외부 클릭/터치 시 드롭다운 및 검색 결과 없음 창 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;

      // 입력창, 제안 목록, 검색 결과 없음 창 외부 클릭 시 닫기
      const isOutsideInput = inputRef.current && !inputRef.current.contains(target);
      const isOutsideSuggestions = !suggestionsRef.current || !suggestionsRef.current.contains(target);
      const isOutsideNoResults = !noResultsRef.current || !noResultsRef.current.contains(target);

      if (isOutsideInput && isOutsideSuggestions) {
        setShowSuggestions(false);
      }

      if (isOutsideInput && isOutsideNoResults) {
        setShowNoResults(false);
        if (noResultsTimerRef.current) {
          clearTimeout(noResultsTimerRef.current);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  // 텍스트 하이라이트
  const highlightText = (text: string, query: string) => {
    if (!query) return text;

    const parts = text.split(new RegExp(`(${query})`, "gi"));
    return (
      <>
        {parts.map((part, index) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={index} className="bg-yellow-200 font-semibold">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  // 전체 삭제 핸들러
  const handleClear = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onChange("");
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  const hasValue = value.trim().length > 0;

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full pr-20 text-base"
          aria-autocomplete="list"
          aria-controls="stock-suggestions"
          aria-expanded={showSuggestions && suggestions.length > 0}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {isLoading && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 rounded-md border border-blue-200">
              <svg
                className="animate-spin h-5 w-5 text-blue-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <span className="text-xs font-medium text-blue-600 animate-pulse">
                검색 중...
              </span>
            </div>
          )}
          {hasValue && (
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center justify-center w-6 h-6 rounded-full hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              aria-label="전체 삭제"
            >
              <svg
                className="w-4 h-4 text-gray-500 hover:text-gray-700"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          id="stock-suggestions"
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto"
          role="listbox"
        >
          {suggestions.map((suggestion, index) => (
            <div
              key={`${suggestion.symbol}-${index}`}
              onClick={() => handleSelect(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`px-4 py-2 cursor-pointer transition-colors ${
                index === selectedIndex
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-gray-100"
              }`}
              role="option"
              aria-selected={index === selectedIndex}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium">
                    {highlightText(suggestion.name, highlightedText)}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {suggestion.symbol}
                    {suggestion.exchange && ` • ${suggestion.exchange}`}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNoResults && !isLoading && suggestions.length === 0 && debouncedValue.trim().length >= 2 && (
        <div
          ref={noResultsRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-4 text-sm text-gray-500 text-center animate-in fade-in duration-200"
          onClick={() => {
            setShowNoResults(false);
            if (noResultsTimerRef.current) {
              clearTimeout(noResultsTimerRef.current);
            }
          }}
        >
          검색 결과가 없습니다
        </div>
      )}
    </div>
  );
}
