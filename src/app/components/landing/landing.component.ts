import { Component } from '@angular/core';
import { NavbarComponent } from '../navbar/navbar.component';
import { HeroComponent } from '../hero/hero.component';
import { ProblemComponent } from '../problem/problem.component';
import { FeaturesComponent } from '../features/features.component';
import { SolutionComponent } from '../solution/solution.component';
import { WorkflowComponent } from '../workflow/workflow.component';
import { StatsComponent } from '../stats/stats.component';
import { CtaComponent } from '../cta/cta.component';
import { FooterComponent } from '../footer/footer.component';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    NavbarComponent,
    HeroComponent,
    ProblemComponent,
    FeaturesComponent,
    SolutionComponent,
    WorkflowComponent,
    StatsComponent,
    CtaComponent,
    FooterComponent,
  ],
  template: `
    <app-navbar />
    <app-hero />
    <app-problem />
    <app-features />
    <app-workflow />
    <app-stats />
    <app-solution />
    <app-cta />
    <app-footer />
  `,
})
export class LandingComponent {}
