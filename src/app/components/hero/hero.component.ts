import { Component, AfterViewInit, OnDestroy, ElementRef } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-hero',
  imports: [RouterLink],
  templateUrl: './hero.component.html',
  styleUrl: './hero.component.css',
})
export class HeroComponent implements AfterViewInit, OnDestroy {
  private heroBgEl: HTMLElement | null = null;
  private heroEl: HTMLElement | null = null;
  private scrollListener = () => this.onScroll();
  private observer: IntersectionObserver | null = null;

  constructor(private host: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    this.heroEl = this.host.nativeElement.querySelector('.hero') as HTMLElement;
    this.heroBgEl = this.host.nativeElement.querySelector('.hero-bg') as HTMLElement;

    if (!this.heroEl || !this.heroBgEl) return;

    // Use IntersectionObserver to only run the scroll listener when the hero is visible
    this.observer = new IntersectionObserver(
      (entries) => {
        const isIntersecting = entries[0].isIntersecting;
        if (isIntersecting) {
          window.addEventListener('scroll', this.scrollListener, { passive: true });
          this.onScroll(); // Set initial state
        } else {
          window.removeEventListener('scroll', this.scrollListener);
          // When hero is fully off-screen above viewport, hide bg; below = keep visible
          if (window.scrollY > 0 && this.heroBgEl) {
            this.heroBgEl.style.opacity = '0';
          }
        }
      },
      { threshold: 0 }
    );
    this.observer.observe(this.heroEl);
  }

  private onScroll(): void {
    if (!this.heroEl || !this.heroBgEl) return;

    const heroRect = this.heroEl.getBoundingClientRect();
    const heroHeight = this.heroEl.offsetHeight;

    // How many pixels of the hero have scrolled out of view (from the top)
    const scrolledOut = Math.max(0, -heroRect.top);

    // Fade starts at 40% scrolled-out, ends fully transparent at 85%
    const fadeStart = heroHeight * 0.4;
    const fadeEnd   = heroHeight * 0.85;

    let opacity: number;
    if (scrolledOut <= fadeStart) {
      opacity = 1;
    } else if (scrolledOut >= fadeEnd) {
      opacity = 0;
    } else {
      opacity = 1 - (scrolledOut - fadeStart) / (fadeEnd - fadeStart);
    }

    this.heroBgEl.style.opacity = String(opacity);
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.scrollListener);
    this.observer?.disconnect();
  }
}
