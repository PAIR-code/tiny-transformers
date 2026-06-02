/* Copyright 2026 Google LLC. All Rights Reserved.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
...
==============================================================================*/

import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  signal,
  WritableSignal,
  input,
  output,
  viewChild,
  effect,
  Signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { loadMonaco } from '../monaco-editor-loader';

export enum CodeStrUpdateKind {
  JustClose = 'JustClose',
  Error = 'Error',
  UpdatedValue = 'UpdatedValue',
}

export type CodeStrUpdate =
  | {
      kind: CodeStrUpdateKind.UpdatedValue;
      str: string;
      close: boolean;
    }
  | {
      kind: CodeStrUpdateKind.Error;
      str: string;
      error: string;
      close: false;
    }
  | {
      kind: CodeStrUpdateKind.JustClose;
      close: true;
    };

@Component({
  selector: 'app-monaco-js-editor',
  templateUrl: './monaco-js-editor.component.html',
  styleUrls: ['./monaco-js-editor.component.scss'],
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonacoJavaScriptEditorComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly whatIsBeingEditedName = input<string>('');
  readonly defaultStr = input<string>('');
  readonly codeStr = input<string>('');
  readonly closable = input<boolean>(true);
  readonly showTitle = input<boolean>(false);
  readonly language = input<string>('javascript');
  readonly theme = input<string>('linear-logic-theme');

  lastValidStr = signal<string>('');
  isDefault: Signal<boolean> = signal(true);

  readonly update = output<CodeStrUpdate>();

  tmpConfigString?: string;

  readonly editorContainer = viewChild.required<ElementRef>('editorContainer');

  editor: any;
  configError?: string;
  changed: WritableSignal<boolean> = signal(false);

  constructor() {
    this.isDefault = computed(() => {
      if (!this.editor) {
        return this.defaultStr() === this.lastValidStr();
      }
      return this.defaultStr() === this.editor.getValue();
    });

    // React to codeStr input changes
    effect(() => {
      const val = this.codeStr(); // Read signal at the top to register dependency!
      if (this.editor) {
        if (this.editor.getValue() !== val) {
          this.editor.setValue(val);
          this.lastValidStr.set(val);
          this.changed.set(false);
        }
      }
    });

    // React to theme input changes
    effect(() => {
      const t = this.theme(); // Read signal at the top to register dependency!
      if (this.editor) {
        loadMonaco().then((monaco) => {
          monaco.editor.setTheme(t);
        });
      }
    });
  }

  ngOnInit() {
    this.lastValidStr.set(this.codeStr());
  }

  ngAfterViewInit() {
    loadMonaco().then((monaco) => {
      const container = this.editorContainer().nativeElement;
      this.editor = monaco.editor.create(container, {
        value: this.codeStr(),
        language: this.language(),
        theme: this.theme(),
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 12,
        lineNumbers: 'on',
      });

      // Listen for value changes
      this.editor.onDidChangeModelContent(() => {
        const currentVal = this.editor.getValue();
        const changedNow = this.lastValidStr() !== currentVal;
        if (this.changed() !== changedNow) {
          this.changed.set(changedNow);
        }
      });
    }).catch(err => {
      console.error('Failed to initialize Monaco JS editor:', err);
      this.configError = 'Editor initialization failed.';
    });
  }

  ngOnDestroy() {
    if (this.editor) {
      this.editor.dispose();
    }
  }

  resetConfig() {
    if (!this.editor) return;
    this.tmpConfigString = this.editor.getValue();
    this.editor.setValue(this.defaultStr());
  }

  undoChanges() {
    if (!this.editor) return;
    this.tmpConfigString = this.editor.getValue();
    this.editor.setValue(this.lastValidStr());
    delete this.configError;
  }

  redoChanges() {
    if (!this.editor || !this.tmpConfigString) return;
    this.editor.setValue(this.tmpConfigString);
    delete this.tmpConfigString;
  }

  makeConfigUpdate(): CodeStrUpdate {
    if (!this.editor) {
      return {
        kind: CodeStrUpdateKind.Error,
        str: '',
        error: 'Editor not initialized.',
        close: false,
      };
    }

    const codeString = this.editor.getValue();
    this.lastValidStr.set(codeString);
    this.changed.set(false);

    return {
      kind: CodeStrUpdateKind.UpdatedValue,
      str: codeString,
      close: false,
    };
  }

  emitConfigUpdate(configUpdate: CodeStrUpdate) {
    if (configUpdate.kind === CodeStrUpdateKind.Error) {
      this.configError = configUpdate.error;
    } else {
      delete this.configError;
      delete this.tmpConfigString;
    }
    this.update.emit(configUpdate);
  }

  tryEmitConfig() {
    this.emitConfigUpdate(this.makeConfigUpdate());
  }

  tryEmitConfigAndClose() {
    const configUpdate = this.makeConfigUpdate();
    if (configUpdate.kind !== CodeStrUpdateKind.Error) {
      configUpdate.close = true;
    }
    this.emitConfigUpdate(configUpdate);
  }

  justClose() {
    const configUpdate: CodeStrUpdate = {
      kind: CodeStrUpdateKind.JustClose,
      close: true,
    };
    this.update.emit(configUpdate);
  }
}
