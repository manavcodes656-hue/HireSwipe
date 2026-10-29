import { Component, OnInit, AfterViewInit, OnDestroy, ElementRef, ChangeDetectorRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CarouselAutoplayController } from '../../core/services/carousel-autoplay.service';

@Component({
  selector: 'app-hero',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './hero.component.html',
  styleUrl: './hero.component.css',
})
export class HeroComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly activeHeroIndex = signal(0);
  private autoplay: CarouselAutoplayController | null = null;

  private heroBgEl: HTMLElement | null = null;
  private heroEl: HTMLElement | null = null;
  private scrollListener = () => this.onScroll();
  private observer: IntersectionObserver | null = null;

  constructor(
    private host: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.autoplay = new CarouselAutoplayController({
      intervalMs: 5000,
      onAdvance: (steps) => this.advanceHeroCard(steps),
    });
    this.autoplay.start();
  }

  advanceHeroCard(steps: number = 1): void {
    this.activeHeroIndex.update((curr) => (curr + steps) % 3);
    this.cdr.markForCheck();
  }

  getCardClass(cardIndex: number): string {
    // 0 = Google, 1 = Microsoft, 2 = Amazon
    const pos = (cardIndex - this.activeHeroIndex() + 3) % 3;
    if (pos === 0) return 'card-front';
    if (pos === 1) return 'card-left';
    return 'card-right';
  }

  onHover(isHovered: boolean): void {
    this.autoplay?.setHover(isHovered);
  }

  selectCard(cardIndex: number): void {
    this.activeHeroIndex.set(cardIndex);
    this.autoplay?.reset();
    this.cdr.markForCheck();
  }

  onSwipeAction(action: 'pass' | 'like', event?: Event): void {
    event?.stopPropagation();
    this.advanceHeroCard(1);
    this.autoplay?.reset();
  }

  ngAfterViewInit(): void {
    this.heroEl = this.host.nativeElement.querySelector('.hero') as HTMLElement;
    this.heroBgEl = this.host.nativeElement.querySelector('.hero-bg') as HTMLElement;

    if (!this.heroEl || !this.heroBgEl) return;

    // Use IntersectionObserver to only run the scroll listener when the hero is visible
    // Guard against environments (e.g. jsdom in unit tests) that lack this API.
    if (typeof IntersectionObserver === 'undefined') return;
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
    this.autoplay?.destroy();
    window.removeEventListener('scroll', this.scrollListener);
    this.observer?.disconnect();
  }
}
