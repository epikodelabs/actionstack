import type { Subscription } from "@actioncrew/streamix";

/**
 * Hooks that allow observing ActionStack execution without coupling
 * ActionStack core to tracing, testing utilities, or diagnostics.
 *
 * These hooks are intentionally minimal and synchronous.
 */
export interface ActionStackTrackingHooks {
  /**
   * Called when a subscription is created and should be tracked.
   */
  track?(subscription: Subscription): void;

  /**
   * Called when user code (subscriber callback, reducer, effect)
   * was actually executed.
   */
  signal?(subscription: Subscription): void;

  /**
   * Called when a subscription has completed and will no longer emit.
   */
  complete?(subscription: Subscription): void;
}
