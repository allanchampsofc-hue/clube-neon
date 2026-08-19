"use client";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function PinPad({
  onDigit,
  onBackspace,
  className = "",
}: {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-3 gap-3 ${className}`}>
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onDigit(key)}
          className="h-16 rounded-xl border border-current/20 text-3xl font-bold transition active:scale-95 active:bg-current/10"
        >
          {key}
        </button>
      ))}
      <button
        type="button"
        onClick={onBackspace}
        aria-label="Apagar"
        className="h-16 rounded-xl border border-current/20 text-2xl transition active:scale-95 active:bg-current/10"
      >
        ←
      </button>
      <button
        type="button"
        onClick={() => onDigit("0")}
        className="h-16 rounded-xl border border-current/20 text-3xl font-bold transition active:scale-95 active:bg-current/10"
      >
        0
      </button>
      <div className="h-16" />
    </div>
  );
}
