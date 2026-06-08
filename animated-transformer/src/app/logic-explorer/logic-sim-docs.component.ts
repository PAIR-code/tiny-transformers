/* Copyright 2026 Google LLC. All Rights Reserved.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
you may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

import { Component, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-logic-sim-docs',
  templateUrl: './logic-sim-docs.component.html',
  styleUrls: ['./logic-docs.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    RouterModule,
  ],
})
export class LogicSimDocsComponent implements OnInit {
  // Navigation sidebar list
  readonly sections = [
    { id: 'intro', label: '1. Simulation Overview' },
    { id: 'scores', label: '2. Action Scores & Syntax' },
    { id: 'probability-modes', label: '3. Probability Modes' },
    { id: 'example-fixed', label: '4. Example: Fixed Probabilities' },
    { id: 'example-ts', label: '5. Example: TS-Computed Probabilities' },
    { id: 'distributions', label: '6. Story Distributions & Plotting' },
  ];

  // Code Snippets for display
  readonly fixedProbCode = [
    'type beverage = coffee | tea;',
    'type coin = dollar;',
    'type item = drink(what: beverage);',
    '',
    '// Constant score values in square brackets [score]',
    'action buyCoffee [1.5]: { ?d: dollar } -o { ?c: drink(coffee) };',
    'action buyTea [0.5]:    { ?d: dollar } -o { ?t: drink(tea) };',
    '',
    '_r1: dollar;',
    '_r2: dollar;'
  ].join('\n');

  readonly tsComputedLogicCode = [
    'type cell = cell(row: nat, col: nat);',
    '',
    '// Use the custom registered TS function calculate_distance_score',
    'action moveCell [calculate_distance_score(?r, ?c)]:',
    '  { ?item: cell(?r, ?c) } -o { ?item2: cell(add_num(?r, 1), ?c) };'
  ].join('\n');

  readonly tsComputedRegistrationCode = [
    "// TypeScript component or service side",
    "import { Context, TermKind, Term } from 'src/lib/logic_v2/logic';",
    "",
    "export function registerCustomScoreFunction(ctxt: Context) {",
    "  ctxt.defineTSFunction('calculate_distance_score', (unNamedArgs) => {",
    "    const rowTerm = unNamedArgs[0];",
    "    const colTerm = unNamedArgs[1];",
    "    ",
    "    if (rowTerm?.kind === TermKind.Literal && colTerm?.kind === TermKind.Literal) {",
    "      const r = parseFloat(rowTerm.literalName);",
    "      const c = parseFloat(colTerm.literalName);",
    "      ",
    "      // Dynamic computation: e.g. score decays based on distance from target (5, 5)",
    "      const dist = Math.sqrt(Math.pow(r - 5, 2) + Math.pow(c - 5, 2));",
    "      const score = Math.max(0.1, 10 / (dist + 1));",
    "      ",
    "      return {",
    "        kind: TermKind.Literal,",
    "        literalName: String(score),",
    "        unNamedArgs: [],",
    "        namedArgs: {}",
    "      };",
    "    }",
    "    return { kind: TermKind.Literal, literalName: '1.0', unNamedArgs: [], namedArgs: {} };",
    "  }, () => 'nat');",
    "}"
  ].join('\n');

  readonly activeSection = signal<string>('intro');

  constructor(private sanitizer: DomSanitizer) {}

  ngOnInit() {
    const contentArea = document.querySelector('.docs-content');
    if (contentArea) {
      contentArea.addEventListener('scroll', () => {
        let current = 'intro';
        for (const section of this.sections) {
          const el = document.getElementById(section.id);
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.top < 200) {
              current = section.id;
            }
          }
        }
        this.activeSection.set(current);
      });
    }
  }

  scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      this.activeSection.set(id);
    }
  }

  getHighlightHtml(src: string): SafeHtml {
    if (!src) return '';

    const escapeHtml = (str: string) => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const lines = src.split('\n');
    const highlightedLines = lines.map(line => {
      if (!line) return '';
      const escaped = escapeHtml(line);
      return escaped.replace(
        /(\b(let|type|fun|action)\b)|(\?[a-zA-Z_][a-zA-Z0-9_]*)|(\&#039;[a-zA-Z_][a-zA-Z0-9_]*)|(\b_[a-zA-Z0-9_]+\b)|(\b\d+(\.\d+)?\b)|(-o|\➔|=|\*|\||:|(?<!&(?:lt|gt|amp|quot|#039));)/g,
        (match, keyword, kwText, variable, typeParam, resource, num, decimal, symbol) => {
          if (keyword) return `<span class="hl-keyword">${match}</span>`;
          if (variable) return `<span class="hl-var">${match}</span>`;
          if (typeParam) return `<span class="hl-type-param">${match}</span>`;
          if (resource) return `<span class="hl-resource">${match}</span>`;
          if (num) return `<span class="hl-number">${match}</span>`;
          if (symbol) return `<span class="hl-symbol">${match}</span>`;
          return match;
        }
      );
    });

    return this.sanitizer.bypassSecurityTrustHtml(highlightedLines.join('\n'));
  }

  getHighlightTsHtml(src: string): SafeHtml {
    if (!src) return '';

    const escapeHtml = (str: string) => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const lines = src.split('\n');
    const highlightedLines = lines.map(line => {
      if (!line) return '';
      const escaped = escapeHtml(line);
      return escaped.replace(
        /(\b(const|let|var|class|export|import|from|function|return|new|if|extends)\b)|(\b\d+(\.\d+)?\b)|(\/\/.*)/g,
        (match, keyword, kwText, num, decimal, comment) => {
          if (keyword) return `<span class="hl-keyword">${match}</span>`;
          if (num) return `<span class="hl-number">${match}</span>`;
          if (comment) return `<span class="hl-comment" style="color: #64748b; font-style: italic;">${match}</span>`;
          return match;
        }
      );
    });

    return this.sanitizer.bypassSecurityTrustHtml(highlightedLines.join('\n'));
  }
}
