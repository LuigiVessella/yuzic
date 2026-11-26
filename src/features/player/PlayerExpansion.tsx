import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { motion } from '@/constants/design';
import { useReducedMotion } from '@/features/theme/useReducedMotion';
import {
  useAnimatedReaction,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
  type SharedValue,
  type WithSpringConfig,
} from 'react-native-reanimated';

/**
 * Where the player is between the playing bar and the full screen.
 *
 * `0` is the bar in the dock, `1` is the full-screen player, and every value
 * between is a real position the user's finger can hold it at — which is the
 * whole point of owning this rather than presenting a modal. One shared value
 * drives a single panel. Both covers stay inside their own surfaces.
 */

/**
 * Snappy enough to feel like it is following the finger that let go, soft
 * enough not to ring. Shared by every path that lets go of the player — tap,
 * flick, and the close button — so they all land the same way.
 */
export const PLAYER_SPRING: WithSpringConfig = {
  damping: 24,
  stiffness: 240,
  mass: 0.85,
  overshootClamping: false,
};

/** Below this the host releases touches to the dock. A tolerance avoids
 *  flickering ownership while the spring settles through zero. */
const CLOSED_EPSILON = 0.001;

type PlayerExpansionValue = {
  /** 0 = collapsed to the bar, 1 = full screen. */
  expansion: SharedValue<number>;
  /** Explicit open/close commands supersede any gesture already in flight. */
  interactionEpoch: SharedValue<number>;
  /** Scroll offset of the player's body, never a cover coordinate. */
  scrollY: SharedValue<number>;
  expand: () => void;
  collapse: () => void;
  /** True from the moment the player starts opening until it is fully closed.
   *  Drives hit-testing and the hardware back handler, both of which are JS. */
  isOpen: boolean;
  /** True once the player has been opened at all. The screen is built on
   *  first use and kept, rather than built for everyone who never opens it. */
  hasOpened: boolean;
  /** Build the player screen now, without opening it — called as a drag on the
   *  bar begins, so the tree is ready by the time the finger has moved. */
  prepare: () => void;
};

const PlayerExpansionContext = createContext<PlayerExpansionValue | undefined>(undefined);

export const usePlayerExpansion = (): PlayerExpansionValue => {
  const ctx = useContext(PlayerExpansionContext);
  if (!ctx) throw new Error('usePlayerExpansion must be used within PlayerExpansionProvider');
  return ctx;
};

/**
 * Whether the full player is open, for surfaces that can render outside the
 * provider as well as inside it (the toast host is mounted within it in the
 * app, alone in its tests). False with no provider, where no player exists.
 */
export const usePlayerIsOpen = (): boolean => useContext(PlayerExpansionContext)?.isOpen ?? false;

export const PlayerExpansionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const reduced = useReducedMotion();
  const expansion = useSharedValue(0);
  const interactionEpoch = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  // One place decides what "open" means, so a tap, a drag that never
  // completed, and a spring settling back to zero all agree about it.
  useAnimatedReaction(
    () => expansion.value > CLOSED_EPSILON,
    (open, wasOpen) => {
      if (open !== wasOpen) runOnJS(setIsOpen)(open);
    },
    [],
  );

  const prepare = useCallback(() => setHasOpened(true), []);

  const expand = useCallback(() => {
    interactionEpoch.value += 1;
    setHasOpened(true);
    setIsOpen(true);
    expansion.value = reduced ? withTiming(1, { duration: motion.quick }) : withSpring(1, PLAYER_SPRING);
  }, [expansion, interactionEpoch, reduced]);

  const collapse = useCallback(() => {
    interactionEpoch.value += 1;
    expansion.value = reduced ? withTiming(0, { duration: motion.quick }) : withSpring(0, PLAYER_SPRING);
  }, [expansion, interactionEpoch, reduced]);

  // Development only, stripped from release by the `__DEV__` guard, and the
  // same affordance as the store and the router. The player is an overlay
  // rather than a route, so nothing else can open it from outside — and the
  // panel can be checked by opening it, scrolling it, and looking at the pixels.
  if (__DEV__) {
    (globalThis as { __yuzicPlayer?: unknown }).__yuzicPlayer = {
      expand, collapse,
      setScroll: (y: number) => { scrollY.value = y; },
      read: () => ({
        expansion: expansion.value,
        scrollY: scrollY.value,
      }),
    };
  }

  const value = useMemo<PlayerExpansionValue>(
    () => ({
      expansion,
      interactionEpoch,
      scrollY,
      expand,
      collapse,
      isOpen,
      hasOpened,
      prepare,
    }),
    [
      expansion, interactionEpoch, scrollY, expand, collapse, isOpen, hasOpened, prepare,
    ],
  );

  return (
    <PlayerExpansionContext.Provider value={value}>
      {children}
    </PlayerExpansionContext.Provider>
  );
};
