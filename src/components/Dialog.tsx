"use client";

import { useCallback, useState } from "react";
import { humanize } from "@/lib/humanError";

export type Tone = "info" | "success" | "warn" | "danger" | "error";

type ConfirmState = {
  kind: "confirm";
  title: string;
  body: string;
  tone: Tone;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => string | void | Promise<string | void>;
  success?: { title: string; body?: string };
  busy: boolean;
};
type InfoState = {
  kind: "info";
  title: string;
  body: string;
  tone: Tone;
};
type DState = ConfirmState | InfoState | null;

export function useDialog() {
  const [state, setState] = useState<DState>(null);

  const confirm = useCallback(
    (opts: {
      title: string;
      body?: string;
      tone?: Tone;
      confirmLabel?: string;
      cancelLabel?: string;
      success?: { title: string; body?: string };
      onConfirm: () => string | void | Promise<string | void>;
    }) => {
      setState({
        kind: "confirm",
        title: opts.title,
        body: opts.body ?? "",
        tone: opts.tone ?? "warn",
        confirmLabel: opts.confirmLabel ?? "はい",
        cancelLabel: opts.cancelLabel ?? "いいえ",
        success: opts.success,
        onConfirm: opts.onConfirm,
        busy: false,
      });
    },
    [],
  );

  const info = useCallback(
    (title: string, body: string = "", tone: Tone = "info") => {
      setState({ kind: "info", title, body, tone });
    },
    [],
  );

  const run = useCallback(
    async (
      successTitle: string,
      action: () => Promise<string | void> | string | void,
    ) => {
      try {
        const r = await action();
        setState({
          kind: "info",
          title: successTitle,
          body: typeof r === "string" ? r : "",
          tone: "success",
        });
      } catch (e) {
        setState({
          kind: "info",
          title: "うまくいきませんでした",
          body: humanize(e),
          tone: "error",
        });
      }
    },
    [],
  );

  const close = useCallback(() => setState(null), []);

  const handleConfirm = useCallback(async () => {
    if (!state || state.kind !== "confirm") return;
    setState({ ...state, busy: true });
    try {
      const r = await state.onConfirm();
      if (state.success) {
        setState({
          kind: "info",
          title: state.success.title,
          body:
            typeof r === "string"
              ? r
              : state.success.body ?? "",
          tone: "success",
        });
      } else {
        setState(null);
      }
    } catch (e) {
      setState({
        kind: "info",
        title: "うまくいきませんでした",
        body: humanize(e),
        tone: "error",
      });
    }
  }, [state]);

  return { state, confirm, info, run, close, handleConfirm };
}

const TONE_STYLE: Record<Tone, string> = {
  info: "bg-sky-50 text-sky-900 border-sky-300",
  success: "bg-emerald-50 text-emerald-900 border-emerald-300",
  warn: "bg-amber-50 text-amber-900 border-amber-300",
  danger: "bg-rose-50 text-rose-900 border-rose-300",
  error: "bg-red-50 text-red-900 border-red-300",
};

const TONE_ICON: Record<Tone, string> = {
  info: "ℹ",
  success: "✓",
  warn: "⚠",
  danger: "⚠",
  error: "⚠",
};

export function Dialog({
  state,
  onConfirm,
  onClose,
}: {
  state: DState;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!state) return null;
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 flex flex-col gap-3">
        <div
          className={`rounded-lg px-3 py-3 border ${TONE_STYLE[state.tone]} flex gap-2 items-start`}
        >
          <span className="text-2xl leading-none">
            {TONE_ICON[state.tone]}
          </span>
          <div className="flex-1">
            <div className="text-lg font-bold">{state.title}</div>
            {state.body && (
              <div className="text-base mt-1 whitespace-pre-wrap break-words">
                {state.body}
              </div>
            )}
          </div>
        </div>
        {state.kind === "confirm" ? (
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={state.busy}
              className="flex-1 py-3 rounded-lg border bg-white text-base"
            >
              {state.cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              disabled={state.busy}
              className="flex-1 py-3 rounded-lg bg-blue-600 text-white text-base font-semibold disabled:bg-gray-300"
            >
              {state.busy ? "処理中..." : state.confirmLabel}
            </button>
          </div>
        ) : (
          <button
            onClick={onClose}
            className="w-full py-3 rounded-lg bg-blue-600 text-white text-base font-semibold"
          >
            閉じる
          </button>
        )}
      </div>
    </div>
  );
}
