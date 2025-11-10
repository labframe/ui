"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface DatabaseChangeNotification {
  type: "parameter_values_changed" | "connected";
  parameters?: string[];
}

const BROADCAST_CHANNEL_NAME = "labframe-database-changes";

export function useDatabaseChanges(projectName: string | null = null) {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const isPrimaryTabRef = useRef<boolean>(false);
  const invalidationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Create BroadcastChannel for cross-tab communication
    const broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    broadcastChannelRef.current = broadcastChannel;

    // Determine if this is the primary tab (first one to connect)
    const checkPrimaryTab = () => {
      // Try to acquire lock by sending a message
      broadcastChannel.postMessage({ type: "acquire_lock" });
      // Wait a bit to see if another tab responds
      setTimeout(() => {
        if (!isPrimaryTabRef.current) {
          // No response, we're primary
          isPrimaryTabRef.current = true;
          connectSSE();
        }
      }, 100);
    };

    // Listen for lock acquisition messages
    broadcastChannel.onmessage = (event) => {
      if (event.data.type === "acquire_lock") {
        // Another tab is trying to acquire lock, respond if we're primary
        if (isPrimaryTabRef.current) {
          broadcastChannel.postMessage({ type: "lock_taken" });
        }
      } else if (event.data.type === "lock_taken") {
        // Lock is taken, we're not primary
        isPrimaryTabRef.current = false;
      } else if (event.data.type === "database_change") {
        // Handle database change notification from primary tab
        handleChangeNotification(event.data.notification);
      }
    };

    const connectSSE = () => {
      // Only primary tab connects to SSE
      if (!isPrimaryTabRef.current) {
        return;
      }

      // EventSource doesn't support custom headers, use query parameter instead
      const url = projectName
        ? `/api/events/database-changes?project=${encodeURIComponent(projectName)}`
        : "/api/events/database-changes";

      const eventSource = new EventSource(url);

      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.info("Database change notifications connected");
      };

      eventSource.onmessage = (event) => {
        try {
          const notification: DatabaseChangeNotification = JSON.parse(event.data);
          handleChangeNotification(notification);

          // Broadcast to other tabs
          broadcastChannel.postMessage({
            type: "database_change",
            notification,
          });
        } catch (error) {
          console.error("Failed to parse database change notification", error);
        }
      };

      eventSource.onerror = (error) => {
        console.error("Database change notifications error", error);
        // Try to reconnect after a delay
        eventSource.close();
        setTimeout(() => {
          if (isPrimaryTabRef.current) {
            connectSSE();
          }
        }, 5000);
      };
    };

    // Debounce invalidation to prevent rapid-fire invalidations from causing hangs
    const handleChangeNotification = (notification: DatabaseChangeNotification) => {
      if (notification.type === "parameter_values_changed" && notification.parameters) {
        // Debounce invalidation to prevent excessive refetches
        if (invalidationTimeoutRef.current) {
          clearTimeout(invalidationTimeoutRef.current);
        }
        invalidationTimeoutRef.current = setTimeout(() => {
          // Invalidate React Query cache for affected parameters
          queryClient.invalidateQueries({ queryKey: ["samples"], exact: false });
          queryClient.invalidateQueries({ queryKey: ["parameter-unique-values"], exact: false });

          console.info("Database changes detected, invalidated cache", {
            parameters: notification.parameters,
          });
          invalidationTimeoutRef.current = null;
        }, 500); // Wait 500ms before invalidating to batch rapid changes
      }
    };

    // Try to become primary tab
    checkPrimaryTab();

    return () => {
      // Cleanup
      if (invalidationTimeoutRef.current) {
        clearTimeout(invalidationTimeoutRef.current);
        invalidationTimeoutRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
        broadcastChannelRef.current = null;
      }
      isPrimaryTabRef.current = false;
    };
  }, [projectName, queryClient]);
}

