import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-berkovich-addition-gradients-vis',
  template: `
    <header class="explorer-header" style="padding: 24px; background: #1e1e2e; color: white;">
      <div style="display: flex; align-items: center; gap: 16px;">
        <button mat-icon-button routerLink="/berkovich">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <div>
          <h1 style="margin: 0; font-size: 24px;">Berkovich Addition & Gradients Vis</h1>
          <p style="margin: 4px 0 0; opacity: 0.8;">Visualize gradient flow through addition in Berkovich Space</p>
        </div>
      </div>
    </header>
    <div style="padding: 24px; color: white;">
      <p>Addition with Gradients visualization coming soon!</p>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: #0f172a; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MatButtonModule, RouterModule],
})
export class BerkovichAdditionGradientsVisComponent {}
