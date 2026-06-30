'use client';

import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export type ToastState = {
  message: string;
  type: ToastType;
  visible: boolean;
};

const emptyToast: ToastState = {
  message: '',
  type: 'info',
  visible: false,
};

export function useToast() {
  const [toast, setToast] = useState<ToastState>(emptyToast);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    setToast({ message, type, visible: true });
    window.setTimeout(() => {
      setToast(current => ({ ...current, visible: false }));
    }, type === 'error' ? 4500 : 3000);
  }, []);

  const hideToast = useCallback(() => {
    setToast(current => ({ ...current, visible: false }));
  }, []);

  return useMemo(() => ({ toast, showToast, hideToast }), [toast, showToast, hideToast]);
}

export function ToastViewport({
  toast,
  onClose,
}: {
  toast: ToastState;
  onClose: () => void;
}) {
  const styles: Record<ToastType, string> = {
    success: 'bg-green-600 text-white',
    error: 'bg-red-600 text-white',
    info: 'bg-gray-900 text-white',
  };

  const Icon = toast.type === 'success'
    ? CheckCircle2
    : toast.type === 'error'
      ? AlertTriangle
      : Info;

  return (
    <div
      className={`fixed top-16 left-1/2 -translate-x-1/2 z-[80] w-full max-w-sm px-4 transition-all duration-300
        ${toast.visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
    >
      <div className={`${styles[toast.type]} rounded-2xl shadow-lg px-4 py-3 flex items-start gap-3`}>
        <Icon className="w-5 h-5 shrink-0 mt-0.5" />
        <p className="text-sm font-semibold leading-snug flex-1">{toast.message}</p>
        <button
          type="button"
          onClick={onClose}
          className="opacity-70 hover:opacity-100 transition-opacity"
          aria-label="Cerrar mensaje"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-gray-950/40 backdrop-blur-[1px] px-4 flex items-end sm:items-center justify-center">
      <div className="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 mb-0 sm:mb-0">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4
          ${danger ? 'bg-red-50 text-red-600' : 'bg-yellow-50 text-yellow-600'}`}
        >
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-black text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">{description}</p>
        <div className="grid grid-cols-2 gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn-secondary py-3"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`py-3 rounded-2xl font-bold transition-colors disabled:opacity-50
              ${danger ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-yellow-400 hover:bg-yellow-500 text-gray-950'}`}
          >
            {busy ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
