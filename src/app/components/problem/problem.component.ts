import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-problem',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './problem.component.html',
  styleUrl: './problem.component.css',
})
export class ProblemComponent {}
