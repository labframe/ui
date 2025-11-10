"use client";

import { useCallback, useRef, useState } from "react";

export type HistoryAction =
  | { type: "parameter-edit"; sampleId: number; parameterName: string; previousValue: string; newValue: string }
  | { type: "column-visibility"; columnId: string; previousVisible: boolean; newVisible: boolean }
  | { type: "filter-group"; previousValue: string; newValue: string }
  | { type: "filter-name"; previousValue: string; newValue: string }
  | { type: "filter-value"; previousValue: string; newValue: string }
  | { type: "delete-sample"; sampleId: number; sample: unknown }
  | { type: "create-sample"; sampleId: number; sample: unknown };

interface HistoryState {
  past: HistoryAction[];
  present: HistoryAction | null;
  future: HistoryAction[];
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: null,
    future: [],
  });

  const canUndo = history.past.length > 0 || history.present !== null;
  const canRedo = history.future.length > 0;

  const recordAction = useCallback((action: HistoryAction) => {
    setHistory((prev) => {
      // When recording a new action, clear the future (can't redo after a new action)
      const newPast = prev.present ? [...prev.past, prev.present] : prev.past;
      return {
        past: newPast,
        present: action,
        future: [],
      };
    });
  }, []);

  const undo = useCallback((): HistoryAction | null => {
    let actionToUndo: HistoryAction | null = null;

    setHistory((prev) => {
      if (prev.present) {
        // Move present to future, move last past to present
        const newPast = [...prev.past];
        const lastAction = newPast.pop() ?? null;
        return {
          past: newPast,
          present: lastAction,
          future: [prev.present, ...prev.future],
        };
      } else if (prev.past.length > 0) {
        // Move last past to present and future
        const newPast = [...prev.past];
        const lastAction = newPast.pop()!;
        return {
          past: newPast,
          present: null,
          future: [lastAction, ...prev.future],
        };
      }
      return prev;
    });

    // Get the action that was moved to future (the one to undo)
    setHistory((prev) => {
      if (prev.future.length > 0) {
        actionToUndo = prev.future[0];
      }
      return prev;
    });

    return actionToUndo;
  }, []);

  const redo = useCallback((): HistoryAction | null => {
    let actionToRedo: HistoryAction | null = null;

    setHistory((prev) => {
      if (prev.future.length > 0) {
        const [firstFuture, ...restFuture] = prev.future;
        const newPast = prev.present ? [...prev.past, prev.present] : prev.past;
        actionToRedo = firstFuture;
        return {
          past: newPast,
          present: firstFuture,
          future: restFuture,
        };
      }
      return prev;
    });

    return actionToRedo;
  }, []);

  const clearHistory = useCallback(() => {
    setHistory({
      past: [],
      present: null,
      future: [],
    });
  }, []);

  return {
    canUndo,
    canRedo,
    recordAction,
    undo,
    redo,
    clearHistory,
  };
}












