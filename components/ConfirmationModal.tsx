import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
    isLoading?: boolean;
}

export default function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    type = 'danger',
    isLoading = false
}: ConfirmationModalProps) {
    const [show, setShow] = useState(isOpen);

    useEffect(() => {
        setShow(isOpen);
    }, [isOpen]);

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-surface border border-border-color rounded-[2.5rem] shadow-2xl w-full max-w-[360px] overflow-hidden transform scale-100 animate-in zoom-in-95 duration-200 flex flex-col items-center">

                <div className="p-8 flex flex-col items-center text-center">
                    {/* Icon Container with Shadow Inner */}
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-inner ${type === 'danger' ? 'bg-danger/10 text-danger' :
                            type === 'warning' ? 'bg-amber-500/10 text-amber-500' :
                                'bg-primary/10 text-primary'
                        }`}>
                        <AlertTriangle size={32} />
                    </div>

                    {/* Content */}
                    <h3 className="text-xl font-bold text-text-main tracking-tight mb-2">{title}</h3>
                    <p className="text-[11px] font-bold text-text-muted leading-relaxed opacity-60">
                        {message}
                    </p>
                </div>

                {/* Actions Section with separate background and border */}
                <div className="p-6 border-t border-border-color flex justify-center gap-4 bg-surface/50 w-full">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="flex-1 px-4 py-3 text-xs font-bold text-text-muted hover:text-text-main transition-all active:scale-95 disabled:opacity-50"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={`flex-1 px-4 py-3 rounded-2xl text-xs font-bold shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 text-white ${type === 'danger'
                                ? 'bg-danger hover:bg-red-700 shadow-danger/20'
                                : 'bg-primary hover:bg-primary/95 shadow-primary/20'
                            } disabled:opacity-50`}
                    >
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            confirmText
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
