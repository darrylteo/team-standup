import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * In-app confirm and prompt dialogs. The browser's own confirm()/prompt() are not used anywhere: some browsers
 * and in-app webviews (Teams, Outlook, embedded panes) suppress them and return "no" without showing anything,
 * which silently broke Remove and Cancel buttons. These also follow the project's theme.
 */
export interface Ask {
  title: string;
  body?: ReactNode;
  confirm: string; // label of the button that goes ahead
  cancel?: string;
  danger?: boolean; // red confirm button for removals
  input?: { label: string; placeholder?: string; initial?: string };
}

type Resolve = (value: string | null) => void;
const AskContext = createContext<((a: Ask) => Promise<string | null>) | null>(null);

/** Returns a function that shows a dialog and resolves to the typed text ("" without an input) or null if cancelled. */
export function useAsk() {
  const ask = useContext(AskContext);
  if (!ask) throw new Error("useAsk outside AskProvider");
  return ask;
}

export function AskProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<(Ask & { resolve: Resolve }) | null>(null);
  const ask = useCallback((a: Ask) => new Promise<string | null>((resolve) => setCurrent({ ...a, resolve })), []);
  return (
    <AskContext.Provider value={ask}>
      {children}
      {current && (
        <AskDialog
          ask={current}
          done={(v) => {
            current.resolve(v);
            setCurrent(null);
          }}
        />
      )}
    </AskContext.Provider>
  );
}

function AskDialog({ ask, done }: { ask: Ask; done: (v: string | null) => void }) {
  const [text, setText] = useState(ask.input?.initial ?? "");
  const box = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(ask.input ? "input" : "button[type=submit]");
    el?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && done(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ask, done]);
  return (
    <>
      <div className="drawer-bg" onClick={() => done(null)} />
      <form
        ref={box}
        className="dialog panel ask"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ask-title"
        onSubmit={(e) => {
          e.preventDefault();
          done(text);
        }}
      >
        <div className="pmain">
          <h2 id="ask-title" className="ask-title">
            {ask.title}
          </h2>
          {ask.body && <div className="muted ask-body">{ask.body}</div>}
          {ask.input && (
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="ask-input">{ask.input.label}</label>
              <input id="ask-input" type="text" maxLength={120} value={text} placeholder={ask.input.placeholder} onChange={(e) => setText(e.target.value)} />
            </div>
          )}
          <div className="actions">
            <button type="submit" className={`btn primary ${ask.danger ? "danger" : ""}`}>
              {ask.confirm}
            </button>
            <button type="button" className="btn" onClick={() => done(null)}>
              {ask.cancel ?? "Cancel"}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
