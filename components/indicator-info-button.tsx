"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { indicatorDescriptions } from "@/lib/indicator-descriptions";

interface IndicatorInfoButtonProps {
  indicatorKey: string;
}

export function IndicatorInfoButton({ indicatorKey }: IndicatorInfoButtonProps) {
  const [open, setOpen] = useState(false);
  const description = indicatorDescriptions[indicatorKey];

  if (!description) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation();
          setOpen(true);
        }}
        onMouseDown={(e) => {
          // label 내부에서 클릭 시 checkbox 토글 방지
          e.preventDefault();
          e.stopPropagation();
        }}
        className="inline-flex items-center justify-center w-4 h-4 ml-1.5 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 rounded-full"
        aria-label={`${description.name} 설명 보기`}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl flex flex-col p-0">
          <DialogHeader className="sticky top-0 z-10 bg-white border-b px-6 py-4 rounded-t-lg">
            <div className="flex items-center justify-between">
              <DialogTitle>{description.name}</DialogTitle>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors ml-4"
                aria-label="닫기"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4 text-sm text-gray-700">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">일반 설명</h3>
                <div className="whitespace-pre-line leading-relaxed">
                  {description.generalDescription}
                </div>
              </div>
              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-2">데이터 획득 방식</h3>
                <div className="whitespace-pre-line leading-relaxed">
                  {description.dataSource}
                </div>
              </div>
              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-2">계산 방식</h3>
                <div className="whitespace-pre-line leading-relaxed">
                  {description.calculationMethod}
                </div>
              </div>
              {description.investmentSignal && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-gray-900 mb-2">투자 신호 및 정보</h3>
                  <div className="whitespace-pre-line leading-relaxed">
                    {description.investmentSignal}
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
