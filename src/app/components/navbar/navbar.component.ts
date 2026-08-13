import { Component, HostListener } from '@angular/core';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-navbar',
  imports: [NgIf],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css',
})
export class NavbarComponent {
  scrolled = false;
  menuOpen = false;
  activeId = '';

  @HostListener('window:scroll')
  onScroll() {
    this.scrolled = window.scrollY > 50;
    this.updateActiveSection();
  }

  private updateActiveSection() {
    const ids = ['home', 'about', 'how-it-works', 'workflow', 'solution', 'contact'];
    const offset = 120;
    let current = '';
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
