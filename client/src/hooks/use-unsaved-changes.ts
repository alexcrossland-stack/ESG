import { useEffect, useRef } from "react";

const MESSAGE = "You have unsaved changes. Leave and discard them? Choose Cancel to keep editing and save.";
const CONTEXT_CHANGE_EVENT = "simplyesg-before-context-change";

/** Lets shared navigation controls ask the active editor before changing context. */
export function allowContextChange() {
  return window.dispatchEvent(new Event(CONTEXT_CHANGE_EVENT, { cancelable: true }));
}

/** Protect link navigation, browser history and reload; callers guard local mode/scope changes. */
export function useUnsavedChanges(dirty: boolean, discard: () => void) {
  const state = useRef({ dirty, discard });
  state.current = { dirty, discard };
  const confirmLeave = () => {
    if (!state.current.dirty) return true;
    if (!window.confirm(MESSAGE)) return false;
    state.current.dirty = false;
    state.current.discard();
    return true;
  };
  useEffect(() => {
    let currentUrl = location.href;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!state.current.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      const link = (event.target as Element)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download") || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      if (link.href !== location.href && !confirmLeave()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const pop = (event: PopStateEvent) => {
      if (!confirmLeave()) {
        event.stopImmediatePropagation();
        history.pushState(null, "", currentUrl);
      } else currentUrl = location.href;
    };
    const updateUrl = () => { currentUrl = location.href; };
    const contextChange = (event: Event) => { if (!confirmLeave()) event.preventDefault(); };
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", pop, true);
    window.addEventListener("pushState", updateUrl);
    window.addEventListener("replaceState", updateUrl);
    window.addEventListener(CONTEXT_CHANGE_EVENT, contextChange);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", pop, true);
      window.removeEventListener("pushState", updateUrl);
      window.removeEventListener("replaceState", updateUrl);
      window.removeEventListener(CONTEXT_CHANGE_EVENT, contextChange);
    };
  }, []);
  return confirmLeave;
}
