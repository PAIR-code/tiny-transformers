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
  selector: 'app-logic-docs',
  templateUrl: './logic-docs.component.html',
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
export class LogicDocsComponent implements OnInit {
  // Navigation sidebar list
  readonly sections = [
    { id: 'intro', label: '1. What is Linear Logic?' },
    { id: 'types', label: '2. Algebraic Data Types' },
    { id: 'functions', label: '3. Pattern-Matching Functions' },
    { id: 'actions', label: '4. State-Transition Actions' },
    { id: 'interaction', label: '5. Matching & Evaluation' },
    { id: 'examples', label: '6. Worked Examples' },
  ];

  // Code Snippets for display
  readonly basicEnumCode = 'type species = cat | monkey | elephant;';
  
  readonly listTypeCode = "type list<'a> = nil | cons(head: 'a, tail: list<'a>);";
  
  readonly oppositeFunCode = 'fun opposite(left) = right\n  | opposite(right) = left;';
  
  readonly rowAloneActionCode = 'action row_alone: { ?h: at(human, ?from) } -o { ?h2: at(human, opposite(?from)) };';
  
  readonly incrementActionCode = 'action increment: { ?r: counter(?c) } -o { ?s: counter(add(suc(0), ?c)) };';
  
  readonly peanoCode = [
    'type nat = 0 | suc(num: nat);',
    '',
    '',
    'fun add(suc(?x), ?y) = suc(add(?x, ?y))',
    '  | add(0, ?y) = ?y;',
    '',
    'action grow: { ?x: nat } -o { ?y: suc(?x) };',
    '',
    '_r1: 0;',
    '_r2: suc(0);'
  ].join('\n');

  readonly listCode = [
    "type list<'x> = cons(h: 'x, t: list<'x>) | nil;",
    'type nat = 0 | suc(num: nat);',
    '',
    'fun append(cons(?h, ?t), ?l) = cons(?h, append(?t, ?l))',
    '  | append(nil, ?l) = ?l;',
    '',
    'action concat: { ?l1: list(?a), ?l2: list(?a) } -o { ?l1and2: append(?l1, ?l2) };',
    '',
    '_r1: cons(suc(0), nil);',
    '_r2: cons(0, nil);'
  ].join('\n');

  readonly riverCode = [
    'type bank = left | right;',
    'type animal = dog | cat | mouse;',
    'type entity = human | cargo(kind: animal);',
    '',
    'type state = at(who: entity, where: bank)',
    '           | fight(attacker: animal, victim: animal, where: bank);',
    '',
    'fun opposite(left) = right',
    '  | opposite(right) = left;',
    '',
    'action row_alone: { ?h: at(human, ?from) } -o { ?h2: at(human, opposite(?from)) };',
    '',
    'action row_with: { ?h: at(human, ?from), ?c: at(cargo(?a), ?from) }',
    '            -o { ?h2: at(human, opposite(?from)), ?c2: at(cargo(?a), opposite(?from)) };',
    '',
    '_r1: at(human, left);',
    '_r2: at(cargo(dog), left);'
  ].join('\n');

  readonly sessionCode = [
    'type message = ping | pong | close;',
    'type status = active | closed;',
    'type nat = 0 | suc(num: nat);',
    '',
    'type channel = chan(id: nat, msg: message, state: status);',
    '',
    'action sendPing: { ?c: chan(?id, close, active) } -o { ?c2: chan(?id, ping, active) };',
    'action replyPong: { ?c: chan(?id, ping, active) } -o { ?c2: chan(?id, pong, active) };',
    'action terminate: { ?c: chan(?id, pong, active) } -o { ?c2: chan(?id, close, closed) };',
    '',
    '_r1: chan(suc(0), close, active);'
  ].join('\n');

  readonly activeSection = signal<string>('intro');

  // Accordion Expand States
  readonly peanoOpen = signal<boolean>(true);
  readonly listOpen = signal<boolean>(false);
  readonly riverOpen = signal<boolean>(false);
  readonly sessionOpen = signal<boolean>(false);

  constructor(private sanitizer: DomSanitizer) {}

  ngOnInit() {
    // Set up scroll listener to highlight active section in sidebar
    const contentArea = document.querySelector('.docs-content');
    if (contentArea) {
      contentArea.addEventListener('scroll', () => {
        let current = 'intro';
        for (const section of this.sections) {
          const el = document.getElementById(section.id);
          if (el) {
            const rect = el.getBoundingClientRect();
            // If the element is near the top of the viewport
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

  toggleAccordion(example: 'peano' | 'list' | 'river' | 'session') {
    switch (example) {
      case 'peano':
        this.peanoOpen.set(!this.peanoOpen());
        break;
      case 'list':
        this.listOpen.set(!this.listOpen());
        break;
      case 'river':
        this.riverOpen.set(!this.riverOpen());
        break;
      case 'session':
        this.sessionOpen.set(!this.sessionOpen());
        break;
    }
  }

  /**
   * Helper to colorize custom logic syntax code blocks dynamically.
   */
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
        /(\b(let|type|fun|action)\b)|(\?[a-zA-Z_][a-zA-Z0-9_]*)|(\&#039;[a-zA-Z_][a-zA-Z0-9_]*)|(\b_[a-zA-Z0-9_]+\b)|(\b\d+\b)|(-o|\➔|=|\*|\||:|(?<!&(?:lt|gt|amp|quot|#039));)/g,
        (match, keyword, kwText, variable, typeParam, resource, num, symbol) => {
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
}
