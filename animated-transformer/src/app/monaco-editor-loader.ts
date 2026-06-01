/* Copyright 2026 Google LLC. All Rights Reserved.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
...
==============================================================================*/

let loaderPromise: Promise<any> | null = null;

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
          monaco.languages.setMonarchTokensProvider('linear-logic', {
            tokenizer: {
              root: [
                [/\b(let|type|fun|action)\b/, 'keyword'],
                [/\?[a-zA-Z_][a-zA-Z0-9_]*/, 'variable'],
                [/'[a-zA-Z_][a-zA-Z0-9_]*/, 'type.identifier'],
                [/\b_[a-zA-Z0-9_]+\b/, 'tag'],
                [/\b\d+\b/, 'number'],
                [/(-o|➔|=|\*|\||:|;)/, 'operator'],
              ]
            }
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
