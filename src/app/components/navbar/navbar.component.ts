import { Component, HostListener, OnInit } from '@angular/core';
import { NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-navbar',
  imports: [NgIf, RouterLink],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css',
})
export class NavbarComponent implements OnInit {
  scrolled = false;
  menuOpen = false;
  activeId = 'home';

  ngOnInit() {
    this.onScroll();
  }

  @HostListener('window:scroll')
  onScroll() {
    this.scrolled = window.scrollY > 30;
    this.updateActiveSection();
  }

  @HostListener('window:resize')
  onResize() {
    if (typeof window !== 'undefined' && window.innerWidth >= 860 && this.menuOpen) {
      this.closeMenu();
    }
  }

  @HostListener('window:keydown.escape')
  onEscape() {
    if (this.menuOpen) {
      this.closeMenu();
    }
  }

  private updateActiveSection() {
    const ids = ['home', 'about', 'how-it-works', 'workflow', 'solution', 'contact'];
    const offset = 120;
    let current = 'home';
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= offset) {
        current = id;
      }
    }
    this.activeId = current;
  }

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
  }

  closeMenu() {
    this.menuOpen = false;
  }
}
