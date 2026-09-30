import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const inputClass =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30";

export function Field({ label, hint, ...props }: { label: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-800">{label}</span>
      <input className={inputClass} {...props} />
      {hint ? <span className="mt-1 block text-xs text-stone-500">{hint}</span> : null}
    </label>
  );
}

export function SelectField({ label, children, ...props }: { label: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-800">{label}</span>
      <select className={inputClass} {...props}>
        {children}
      </select>
    </label>
  );
}

export function TextAreaField({ label, ...props }: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-800">{label}</span>
      <textarea className={inputClass} rows={3} {...props} />
    </label>
  );
}

export function CheckField({ label, hint, ...props }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-stone-200 bg-white p-3">
      <input type="checkbox" className="mt-1 h-5 w-5 accent-emerald-700" {...props} />
      <span>
        <span className="block text-sm font-medium text-stone-800">{label}</span>
        {hint ? <span className="block text-xs text-stone-500">{hint}</span> : null}
      </span>
    </label>
  );
}

type Variant = "primary" | "secondary" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-emerald-700 text-white hover:bg-emerald-800",
  secondary: "border border-stone-300 bg-white text-stone-800 hover:bg-stone-100",
  danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
};

export function Button({ variant = "primary", className = "", ...props }: { variant?: Variant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`rounded-lg px-4 py-2.5 text-base font-semibold disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function ErrorBox({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
      {messages.map((m) => (
        <p key={m}>
          <span aria-hidden="true">⚠ </span>
          {m}
        </p>
      ))}
    </div>
  );
}

export function Badge({ tone, children }: { tone: "ok" | "off" | "info"; children: ReactNode }) {
  const tones = { ok: "bg-emerald-100 text-emerald-900", off: "bg-stone-200 text-stone-700", info: "bg-sky-100 text-sky-900" };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

/** Panel deslizable: pantalla completa en celular, lateral en computadora. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex h-full w-full flex-col bg-stone-50 sm:max-w-xl">
        <div className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm">
            Cerrar
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">{children}</div>
      </div>
    </div>
  );
}
