/* Copyright 2026 Google LLC. All Rights Reserved.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
...
==============================================================================*/

let loaderPromise: Promise<any> | null = null;

export interface LogicThemeConfig {
  keyword: string;
  constructor: string;
  function: string;
  action: string;
  type: string;
  variable: string;
  number: string;
  comment: string;
  background: string;
  lolli: string;
  pipe: string;
  colon: string;
  equals: string;
}

export const DEFAULT_THEME_CONFIG: LogicThemeConfig = {
  keyword: '#569CD6',      // Soft blue
  constructor: '#EFEFEF',  // High-contrast Orange/Red
  function: '#DCDCAA',     // Light yellow
  action: '#4EC9B0',       // Emerald/Teal
  type: '#9CDCFE',         // Sky blue
  variable: '#C586C0',     // Purple
  number: '#B5CEA8',       // Soft green
  comment: '#6A9955',      // Forest green
  background: '#1E1E1E',   // Standard VS Code dark
  lolli: '#FF79C6',        // Pink/magenta
  pipe: '#8BE9FD',         // Cyan/variant bar
  colon: '#BD93F9',        // Lavender
  equals: '#F1FA8C'        // Pastel yellow
};


/**
 * Dynamically loads Monaco Editor from a stable cdnjs CDN using AMD loader.
 * Returns a Promise resolving to the global `monaco` instance.
 * Reuses the promise across concurrent loads to guarantee single initialization.
 */
export function loadMonaco(): Promise<any> {
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise<any>((resolve, reject) => {
    // If monaco is already loaded globally, resolve immediately
    if (typeof (window as any).monaco !== 'undefined') {
      resolve((window as any).monaco);
      return;
    }

    const cdn = '/assets/monaco';

    // Inject Monaco CSS stylesheet link to head to ensure line heights, selection overlays,
    // and token highlighting are correctly styled and offset alignments are pixel-perfect.
    if (!document.getElementById('monaco-editor-styles')) {
      const link = document.createElement('link');
      link.id = 'monaco-editor-styles';
      link.rel = 'stylesheet';
      link.href = `${cdn}/vs/editor/editor.main.css`;
      document.head.appendChild(link);
    }

    // 1. Create vs loader script element
    const loaderScript = document.createElement('script');
    loaderScript.type = 'text/javascript';
    loaderScript.src = `${cdn}/vs/loader.js`;
    
    loaderScript.onload = () => {
      const amdRequire = (window as any).require;
      if (!amdRequire) {
        reject(new Error('Monaco AMD loader failed to initialize require function.'));
        return;
      }

      // 2. Configure AMD path relative to cdnjs vs folder
      amdRequire.config({
        paths: { vs: `${cdn}/vs` }
      });

      // 3. Load monaco editor main module
      amdRequire(['vs/editor/editor.main'], () => {
        const monaco = (window as any).monaco;

        // Register custom Linear Logic language for logic explorer program files
        if (monaco && !monaco.languages.getLanguages().some((l: any) => l.id === 'linear-logic')) {
          monaco.languages.register({ id: 'linear-logic' });
          monaco.languages.setMonarchTokensProvider(
            'linear-logic',
            getLinearLogicMonarch()
          );

          // Define default custom theme
          monaco.editor.defineTheme('linear-logic-theme', {
            base: 'vs-dark',
            inherit: true,
            rules: [
              { token: 'keyword', foreground: DEFAULT_THEME_CONFIG.keyword },
              { token: 'tag', foreground: DEFAULT_THEME_CONFIG.constructor },
              { token: 'entity.name.function', foreground: DEFAULT_THEME_CONFIG.function },
              { token: 'string', foreground: DEFAULT_THEME_CONFIG.action },
              { token: 'type.identifier', foreground: DEFAULT_THEME_CONFIG.type },
              { token: 'variable', foreground: DEFAULT_THEME_CONFIG.variable },
              { token: 'number', foreground: DEFAULT_THEME_CONFIG.number },
              { token: 'comment', foreground: DEFAULT_THEME_CONFIG.comment },
              { token: 'operator.lolli', foreground: DEFAULT_THEME_CONFIG.lolli },
              { token: 'operator.pipe', foreground: DEFAULT_THEME_CONFIG.pipe },
              { token: 'operator.colon', foreground: DEFAULT_THEME_CONFIG.colon },
              { token: 'operator.equals', foreground: DEFAULT_THEME_CONFIG.equals },
            ],
            colors: {
              'editor.background': DEFAULT_THEME_CONFIG.background
            }
          });

          // 2. Define language configurations (brackets matching and auto-closing)
          monaco.languages.setLanguageConfiguration('linear-logic', {
            brackets: [
              ['{', '}'],
              ['[', ']'],
              ['(', ')'],
            ],
            autoClosingPairs: [
              { open: '{', close: '}' },
              { open: '[', close: ']' },
              { open: '(', close: ')' },
            ],
            surroundingPairs: [
              { open: '{', close: '}' },
              { open: '[', close: ']' },
              { open: '(', close: ')' },
            ]
          });
        }

        resolve(monaco);
      }, (err: any) => {
        reject(err);
      });
    };

    loaderScript.onerror = (err) => {
      reject(new Error('Failed to load Monaco vs/loader.js script.'));
    };

    document.body.appendChild(loaderScript);
  });

  return loaderPromise;
}

export const DEFAULT_CONSTRUCTORS = [
  'left', 'right', 'dog', 'cat', 'mouse', 'human', 'cargo', 'at', 'fight', 'eaten',
  'flower', 'monkey', 'elephant', 'animal', 'rock', 'tree', 'active', 'jumpedOver',
  'squished', 'ranAway', '0', 'suc', 'cons', 'nil', 'leaf', 'node', 'ping', 'pong',
  'close', 'closed', 'chan', 'coffee', 'tea', 'red', 'blue', 'dollar', 'quarter',
  'drink', 'sock', 'pair'
];

export const DEFAULT_FUNCTIONS = [
  'opposite', 'append', 'flat', 'add'
];

export const DEFAULT_ACTIONS = [
  'monkeySquish', 'catEscape', 'row_alone', 'row_with', 'dog_chases_cat_left',
  'dog_chases_cat_right', 'cat_eats_mouse_left', 'cat_eats_mouse_right', 'grow',
  'doubleGrow', 'concat', 'flattenTree', 'sendPing', 'replyPong', 'terminate',
  'buyCoffee', 'buyTea', 'matchSocks'
];

export const DEFAULT_TYPES = [
  'species', 'item', 'state', 'bank', 'animal', 'entity', 'nat', 'list', 'tree',
  'message', 'status', 'channel', 'beverage', 'colorType', 'coin'
];

export function getLinearLogicMonarch(
  customConstructors: string[] = [],
  customFunctions: string[] = [],
  customActions: string[] = [],
  customTypes: string[] = []
) {
  const constructors = Array.from(new Set([...DEFAULT_CONSTRUCTORS, ...customConstructors]));
  const functions = Array.from(new Set([...DEFAULT_FUNCTIONS, ...customFunctions]));
  const actions = Array.from(new Set([...DEFAULT_ACTIONS, ...customActions]));
  const types = Array.from(new Set([...DEFAULT_TYPES, ...customTypes]));

  return {
    ignoreCase: false,
    keywords: ['let', 'type', 'fun', 'action'],
    constructors,
    functions,
    actions,
    types,
    brackets: [
      { open: '{', close: '}', token: 'delimiter.curly' },
      { open: '[', close: ']', token: 'delimiter.square' },
      { open: '(', close: ')', token: 'delimiter.parenthesis' },
    ],
    tokenizer: {
      root: [
        // Declarations
        [/\b(fun)(\s+)([a-zA-Z_][a-zA-Z0-9_]*)\b/, ['keyword', '', 'entity.name.function']],
        [/\b(action)(\s+)([a-zA-Z_][a-zA-Z0-9_]*)\b/, ['keyword', '', 'string']],
        [/\b(type)\b/, 'keyword', '@typeDecl'],

        // Brackets matching
        [/[{}()\[\]]/, '@brackets'],

        // Identifier matching with priority case selection
        [/[a-zA-Z_][a-zA-Z0-9_]*/, {
          cases: {
            '@keywords': 'keyword',
            '@constructors': 'tag', // high-contrast orange/red tag class for constructors
            '@functions': 'entity.name.function', // yellow for functions
            '@actions': 'string', // string for actions
            '@types': 'type.identifier', // teal for types
            '@default': 'identifier'
          }
        }],

        // Logical variables (starts with ?)
        [/\?[a-zA-Z_][a-zA-Z0-9_]*/, 'variable'],

        // Type parameters (starts with ')
        [/'[a-zA-Z_][a-zA-Z0-9_]*/, 'type.identifier'],

        // Resources (identifiers starting with _)
        [/\b_[a-zA-Z0-9_]+\b/, 'tag'],

        [/\b\d+\b/, 'number'],
        [/-o|➔/, 'operator.lolli'],
        [/\|/, 'operator.pipe'],
        [/:/, 'operator.colon'],
        [/=/, 'operator.equals'],
        [/(\*|;)/, 'operator'],
      ],

      typeDecl: [
        [/[{}()\[\]]/, '@brackets'],
        [/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/, {
          cases: {
            '@types': 'type.identifier',
            '@default': 'type.identifier'
          }
        }],
        [/=/, 'operator.equals', '@variantsDecl'],
        [/;/, 'operator', '@pop'],
      ],

      variantsDecl: [
        [/[{}()\[\]]/, '@brackets'],
        [/\b([a-zA-Z_][a-zA-Z0-9_]*)(\s*\()/, ['tag', '']],
        [/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/, 'tag'],
        [/(:\s*)([a-zA-Z_][a-zA-Z0-9_]*)\b/, ['', 'type.identifier']],
        [/\|/, 'operator.pipe'],
        [/,/, 'operator'],
        [/:/, 'operator.colon'],
        [/'[a-zA-Z_][a-zA-Z0-9_]*/, 'type.identifier'],
        [/;/, 'operator', '@popall'],
      ]
    }
  };
}

export function updateLinearLogicTokens(
  constructors: string[],
  functions: string[],
  actions: string[],
  types: string[]
) {
  if (typeof (window as any).monaco !== 'undefined') {
    const monaco = (window as any).monaco;
    monaco.languages.setMonarchTokensProvider(
      'linear-logic',
      getLinearLogicMonarch(constructors, functions, actions, types)
    );
  }
}

export function updateLogicTheme(config: LogicThemeConfig) {
  if (typeof (window as any).monaco !== 'undefined') {
    const monaco = (window as any).monaco;
    monaco.editor.defineTheme('linear-logic-theme', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: config.keyword },
        { token: 'tag', foreground: config.constructor },
        { token: 'entity.name.function', foreground: config.function },
        { token: 'string', foreground: config.action },
        { token: 'type.identifier', foreground: config.type },
        { token: 'variable', foreground: config.variable },
        { token: 'number', foreground: config.number },
        { token: 'comment', foreground: config.comment },
        { token: 'operator.lolli', foreground: config.lolli },
        { token: 'operator.pipe', foreground: config.pipe },
        { token: 'operator.colon', foreground: config.colon },
        { token: 'operator.equals', foreground: config.equals },
      ],
      colors: {
        'editor.background': config.background
      }
    });
  }
}


