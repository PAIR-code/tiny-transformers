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
  selector: 'app-logic-advanced-docs',
  templateUrl: './logic-advanced-docs.component.html',
  styleUrls: ['./logic-docs.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    RouterModule,
  ],
})
export class LogicAdvancedDocsComponent implements OnInit {
  // Navigation sidebar list
  readonly sections = [
    { id: 'intro', label: '1. Overview' },
    { id: 'escaped-values', label: '2. Escaped Values' },
    { id: 'ts-functions', label: '3. TypeScript Functions' },
    { id: 'custom-parsing', label: '4. Custom Parsers & Type Operators' },
  ];

  // Code Snippets for display
  readonly escapedValueCode = [
    'import { EscapedValue } from \'./logic\';',
    '',
    'class TSVal extends EscapedValue {',
    '  constructor(public val: number | string) {',
    '    super();',
    '  }',
    '',
    '  // How this value displays as a string inside logic expressions',
    '  override toString(): string {',
    '    return String(this.val);',
    '  }',
    '',
    '  // Unification / Type checking equality check',
    '  override equals(other: EscapedValue): boolean {',
    '    return other instanceof TSVal && this.val === other.val;',
    '  }',
    '}'
  ].join('\n');

  readonly logicEscapedCode = [
    '// Inside TS/JS program, wrap raw values using the escaped() helper:',
    'const myVal = escaped(new TSVal(42));',
    'const anotherVal = escaped(new TSVal("hello"));',
    '',
    '// These terms bypass the Algebraic Data Type (ADT) structure',
    '// and represent raw TypeScript/JavaScript objects in the engine.'
  ].join('\n');

  readonly tsFunctionDefCode = [
    'import { Context, TermKind, escaped } from \'./logic\';',
    '',
    'const ctxt = Context.empty();',
    '',
    '// Register a TS function "double" in the logical Context',
    'ctxt.defineTSFunction(\'double\', (unNamedArgs) => {',
    '  const arg = unNamedArgs[0];',
    '  if (arg && arg.kind === TermKind.Escaped && arg.value instanceof TSVal) {',
    '    const num = arg.value.val as number;',
    '    return escaped(new TSVal(num * 2));',
    '  }',
    '  return arg;',
    '});'
  ].join('\n');

  readonly logicTsFunctionUseCode = [
    '// Logical constructors can receive TS functions as arguments:',
    'let originalVal = 21;',
    'let result = double(originalVal); // Evaluates dynamically to 42'
  ].join('\n');

  readonly customParserCode = [
    'import { seq, tokenOf } from \'mini-parse\';',
    '',
    'class MultVal extends EscapedValue {',
    '  // Registers a custom sub-parser for type multiplications like "nat * list(nat)"',
    '  static override readonly parserFactory = (termParser: any, simpleTermParser: any) => {',
    '    return seq(',
    '      simpleTermParser,',
    '      tokenOf(\'symbol\', [\'*\']),',
    '      termParser',
    '    ).map(([left, _, right]) => escaped(new MultVal(left as Term, right as Term)));',
    '  };',
    '',
    '  constructor(public left: Term, public right: Term) {',
    '    super();',
    '  }',
    '',
    '  override toString() {',
    '    return `${printTerm(this.left)}*${printTerm(this.right)}`;',
    '  }',
    '',
    '  override equals(other: EscapedValue): boolean {',
    '    return other instanceof MultVal &&',
    '      matchTypes(ctxt, this.left, other.left) &&',
    '      matchTypes(ctxt, this.right, other.right);',
    '  }',
    '}',
    '',
    '// Register the escape kind to context for custom parsing:',
    'ctxt.registerEscapeKind(MultVal);',
    'const parsedType = parseTerm(\'nat * list(nat)\', ctxt);'
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

  /**
   * Helper to colorize TypeScript code blocks dynamically.
   */
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
      const escapedStr = escapeHtml(line);
      return escapedStr.replace(
        /(\b(import|from|class|extends|constructor|public|private|readonly|static|override|return|const|let|new|if)\b)|(\/\/.*)/g,
        (match, keyword, kwText, comment) => {
          if (comment) return `<span style="color: #64748b; font-style: italic;">${match}</span>`;
          if (keyword) return `<span class="hl-keyword">${match}</span>`;
          return match;
        }
      );
    });

    return this.sanitizer.bypassSecurityTrustHtml(highlightedLines.join('\n'));
  }
}
