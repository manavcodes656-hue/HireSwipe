import { Injectable } from '@angular/core';

export interface AutoplayConfig {
  /**
   * The duration in milliseconds between automatic card transitions.
   * Default: 5000 ms.
   */
  intervalMs?: number;

  /**
   * Callback invoked when the carousel should advance.
   * Receives `steps`, indicating how many cards to advance (default 1).
   * When recovering from a background/idle tab, `steps` can be > 1 to
   * jump directly to the target card in a single smooth transition without
   * replaying a rapid burst of animations.
   */
  onAdvance: (steps: number) => void;
}

/**
 * Robust autoplay controller for card carousels.
 * 
 * Features:
 * - Consistent 5000 ms cycle interval.
 * - Timestamp-based elapsed-time tracking.
 * - Tab visibility and window focus catch-up: calculates elapsed time while the tab was
 *   throttled or idle and jumps directly to the correct card without rapid burst animations.
 * - Prevents stuck hover state when window loses focus (e.g. Alt+Tab while hovering).
 * - User interaction reset (gives user full 5000 ms after manual navigation).
 * - Safe timer cleanup to prevent memory leaks and duplicate intervals.
 */
export class CarouselAutoplayController {
  private readonly intervalMs: number;
  private readonly onAdvance: (steps: number) => void;

  private timerId: ReturnType<typeof setTimeout> | null = null;
  private lastTickTime: number = 0;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private isHovered: boolean = false;

  private readonly boundOnVisibilityChange = () => this.handleVisibilityChange();
  private readonly boundOnWindowFocus = () => this.handleWindowFocus();
  private readonly boundOnWindowBlur = () => this.handleWindowBlur();

  constructor(config: AutoplayConfig) {
    this.intervalMs = config.intervalMs ?? 5000;
    this.onAdvance = config.onAdvance;
    this.initEventListeners();
  }

  /**
   * Starts or restarts the autoplay timer.
   */
  start(): void {
    this.clearTimer();
    this.isRunning = true;
    this.isPaused = false;
    this.isHovered = false;
    this.lastTickTime = Date.now();
    this.scheduleNext(this.intervalMs);
  }

  /**
   * Stops the autoplay timer.
   */
  stop(): void {
    this.isRunning = false;
    this.clearTimer();
  }

  /**
   * Temporarily pauses autoplay without destroying state.
   */
  pause(): void {
    this.isPaused = true;
    this.clearTimer();
  }

  /**
   * Resumes autoplay after a pause.
   */
  resume(): void {
    if (!this.isRunning) {
      this.start();
      return;
    }
    this.isPaused = false;
    this.lastTickTime = Date.now();
    this.scheduleNext(this.intervalMs);
  }

  /**
   * Updates hover state. When hovered, the timer is suspended.
   * When un-hovered, autoplay resumes with a full 5-second countdown.
   */
  setHover(isHovered: boolean): void {
    this.isHovered = isHovered;
    if (isHovered) {
      this.clearTimer();
    } else if (this.isRunning && !this.isPaused) {
      this.lastTickTime = Date.now();
      this.scheduleNext(this.intervalMs);
    }
  }

  /**
   * Resets the timer for manual user interactions (e.g. clicking dots, next/prev buttons).
   * Restarts a fresh 5000 ms cycle so the user has adequate time to view their selected card.
   */
  reset(): void {
    if (this.isRunning && !this.isPaused && !this.isHovered) {
      this.clearTimer();
      this.lastTickTime = Date.now();
      this.scheduleNext(this.intervalMs);
    }
  }

  /**
   * Cleans up all timers and event listeners. Must be called in ngOnDestroy.
   */
  destroy(): void {
    this.stop();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundOnVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', this.boundOnWindowFocus);
      window.removeEventListener('blur', this.boundOnWindowBlur);
    }
  }

  private initEventListeners(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.boundOnVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', this.boundOnWindowFocus);
      window.addEventListener('blur', this.boundOnWindowBlur);
    }
  }

  private tick(): void {
    this.timerId = null;
    if (!this.isRunning || this.isPaused || this.isHovered) {
      return;
    }

    this.lastTickTime = Date.now();
    this.onAdvance(1);
    this.scheduleNext(this.intervalMs);
  }

  private scheduleNext(delayMs: number): void {
    this.clearTimer();
    this.timerId = setTimeout(() => this.tick(), Math.max(0, delayMs));
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private handleVisibilityChange(): void {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible') {
      this.catchUpIfNeeded();
    }
  }

  private handleWindowFocus(): void {
    this.catchUpIfNeeded();
  }

  private handleWindowBlur(): void {
    // Reset hover flag so carousel doesn't get stuck paused if user switched windows while hovering
    this.isHovered = false;
  }

  private catchUpIfNeeded(): void {
    if (!this.isRunning || this.isPaused) {
      return;
    }

    // Unstick hover if window re-focused
    this.isHovered = false;

    const now = Date.now();
    if (this.lastTickTime <= 0) {
      this.lastTickTime = now;
      this.scheduleNext(this.intervalMs);
      return;
    }

    const elapsed = now - this.lastTickTime;
    if (elapsed >= this.intervalMs) {
      const missedSteps = Math.floor(elapsed / this.intervalMs);
      const remainder = elapsed % this.intervalMs;

      // Advance directly to the target card in a single smooth step:
      this.onAdvance(missedSteps);

      // Align phase and schedule next tick
      this.lastTickTime = now - remainder;
      const nextDelay = Math.max(500, this.intervalMs - remainder);
      this.scheduleNext(nextDelay);
    } else {
      const remaining = Math.max(100, this.intervalMs - elapsed);
      this.scheduleNext(remaining);
    }
  }
}

@Injectable({
  providedIn: 'root',
})
export class CarouselAutoplayService {
  /**
   * Factory method to create an Autoplay Controller with standard 5-second timing.
   */
  createController(config: AutoplayConfig): CarouselAutoplayController {
    return new CarouselAutoplayController(config);
  }
}

