// src/components/shared/ui.tsx
// Reusable UI primitives used across all pages

import React, { useEffect, useRef, useCallback, forwardRef } from "react";
import { clsx } from "clsx";
import { X, Loader2 } from "lucide-react";

// ── Button ───────────────────────────────────────────────────────

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, className, children, disabled, ...props }, ref) => {
    const base = "inline-flex items-center justify-center gap-2 font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";
    const variants = {
      primary:   "bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700",
      secondary: "border border-gray-300 text-gray-700 bg-white hover:border-gray-400 hover:bg-gray-50",
      ghost:     "text-gray-600 hover:bg-gray-100",
      danger:    "bg-red-600 text-white hover:bg-red-700",
    };
    const sizes = {
      sm: "px-3 py-1.5 text-xs",
      md: "px-4 py-2 text-sm",
      lg: "px-6 py-3 text-base",
    };
    return (
      <button
        ref={ref}
        className={clsx(base, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

// ── Input ────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            "w-full px-3 py-2.5 text-sm border rounded bg-white text-gray-900 placeholder-gray-400",
            "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition",
            error ? "border-red-400" : "border-gray-300",
            className
          )}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          aria-invalid={!!error}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-red-600">{error}</p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-xs text-gray-400">{hint}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

// ── Select ───────────────────────────────────────────────────────

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className, id, ...props }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={clsx(
            "w-full px-3 py-2.5 text-sm border rounded bg-white text-gray-900",
            "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition appearance-none",
            error ? "border-red-400" : "border-gray-300",
            className
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);
Select.displayName = "Select";

// ── Textarea ─────────────────────────────────────────────────────

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  maxChars?: number;
  currentLength?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, maxChars, currentLength, className, id, ...props }, ref) => {
    const taId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <div className="flex justify-between">
            <label htmlFor={taId} className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {label}
            </label>
            {maxChars && (
              <span className={clsx("text-xs", (currentLength ?? 0) > maxChars ? "text-red-500" : "text-gray-400")}>
                {currentLength ?? 0}/{maxChars}
              </span>
            )}
          </div>
        )}
        <textarea
          ref={ref}
          id={taId}
          className={clsx(
            "w-full px-3 py-2.5 text-sm border rounded bg-white text-gray-900 resize-y min-h-[80px]",
            "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition",
            error ? "border-red-400" : "border-gray-300",
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

// ── Modal ────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export function Modal({ open, onClose, title, children, maxWidth = "max-w-lg" }: ModalProps) {
  const previousFocus = useRef<Element | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      previousFocus.current = document.activeElement;
      document.body.style.overflow = "hidden";
      // Focus the modal container after render
      setTimeout(() => modalRef.current?.focus(), 0);
    } else {
      document.body.style.overflow = "";
      // Restore focus to trigger element
      if (previousFocus.current instanceof HTMLElement) {
        previousFocus.current.focus();
      }
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key !== "Tab" || !modalRef.current) return;

    const focusable = modalRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, [onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-fade-up"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      ref={modalRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className={clsx("bg-white rounded-lg w-full shadow-xl max-h-[90vh] overflow-y-auto", maxWidth)}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 id="modal-title" className="font-display text-xl text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ── Toast ────────────────────────────────────────────────────────

interface ToastProps {
  message: string;
  type?: "success" | "error" | "info";
  onClose: () => void;
}

export function Toast({ message, type = "success", onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = {
    success: "bg-green-700",
    error:   "bg-red-600",
    info:    "bg-navy-DEFAULT",
  };

  return (
    <div className={clsx("fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded shadow-xl text-white text-sm max-w-sm animate-fade-up", colors[type])}>
      <span>{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100"><X className="w-4 h-4" /></button>
    </div>
  );
}

// ── StarRating ────────────────────────────────────────────────────

interface StarRatingProps {
  value: number;
  onChange?: (v: number) => void;
  size?: "sm" | "md" | "lg";
  ariaPrefix?: string;
}

export function StarRating({ value, onChange, size = "md", ariaPrefix }: StarRatingProps) {
  const sizes = { sm: "text-sm", md: "text-lg", lg: "text-2xl" };
  const prefix = ariaPrefix ? `${ariaPrefix}: ` : "";
  return (
    <div className="flex gap-0.5" role="group" aria-label={ariaPrefix ?? "Rating"}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange?.(n)}
          className={clsx(sizes[size], "transition-colors", onChange ? "cursor-pointer" : "cursor-default", n <= value ? "text-amber-400" : "text-gray-200")}
          aria-label={`${prefix}${n} star${n > 1 ? "s" : ""}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

// ── Badge ────────────────────────────────────────────────────────

interface BadgeProps {
  children: React.ReactNode;
  color?: "blue" | "green" | "red" | "amber" | "gray" | "purple" | "indigo";
}

export function Badge({ children, color = "blue" }: BadgeProps) {
  const colors = {
    blue:   "bg-blue-50 text-blue-700 border-blue-100",
    green:  "bg-green-50 text-green-700 border-green-100",
    red:    "bg-red-50 text-red-700 border-red-100",
    amber:  "bg-amber-50 text-amber-700 border-amber-100",
    gray:   "bg-gray-100 text-gray-600 border-gray-200",
    purple: "bg-purple-50 text-purple-700 border-purple-100",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
  };
  return (
    <span className={clsx("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border", colors[color])}>
      {children}
    </span>
  );
}

// ── LoadingSpinner ────────────────────────────────────────────────

export function LoadingSpinner({ fullScreen }: { fullScreen?: boolean }) {
  return (
    <div className={clsx("flex items-center justify-center", fullScreen ? "min-h-screen" : "py-12")}>
      <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
    </div>
  );
}

// ── Divider ──────────────────────────────────────────────────────

export function Divider({ className }: { className?: string }) {
  return <hr className={clsx("border-gray-200", className)} />;
}
