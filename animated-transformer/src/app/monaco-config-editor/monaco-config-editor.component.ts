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
import json5 from 'json5';
import { loadMonaco } from '../monaco-editor-loader';

export enum ConfigUpdateKind {
  JustClose = 'JustClose',
  Error = 'Error',
  UpdatedValue = 'UpdatedValue',
}

export type ConfigUpdate<T> =
  | {
      kind: ConfigUpdateKind.UpdatedValue;
      json: string;
      obj: T;
      close: boolean;
    }
  | {
      kind: ConfigUpdateKind.Error;
      json: string;
      error: string;
      close: false;
    }
  | {
      kind: ConfigUpdateKind.JustClose;
      close: true;
    };

@Component({
  selector: 'app-monaco-config-editor',
  templateUrl: './monaco-config-editor.component.html',
  styleUrls: ['./monaco-config-editor.component.scss'],
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonacoConfigEditorComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly whatIsBeingEditedName = input<string>('{}');
  readonly defaultConfig = input<string>('{}');
  readonly showTitle = input<boolean>(false);
  readonly closable = input<boolean>(true);
  readonly config = input.required<string>();

  lastValidConfig = signal<string>('{}');
  isDefault: Signal<boolean> = signal(true);

  readonly update = output<ConfigUpdate<any>>();

  tmpConfigString?: string;

  readonly editorContainer = viewChild.required<ElementRef>('editorContainer');

  editor: any;
  configError?: string;
  changed: WritableSignal<boolean> = signal(false);

  constructor() {
    this.isDefault = computed(() => {
      if (!this.editor) {
        return this.defaultConfig() === this.lastValidConfig();
      }
      return this.defaultConfig() === this.editor.getValue();
    });

    // React to config input changes
    effect(() => {
      if (this.editor) {
        const val = this.config();
        if (this.editor.getValue() !== val) {
          this.editor.setValue(val);
          this.lastValidConfig.set(val);
          this.changed.set(false);
        }
      }
    });
  }

  ngOnInit() {
    this.lastValidConfig.set(this.config());
  }

  ngAfterViewInit() {
    loadMonaco().then((monaco) => {
      const container = this.editorContainer().nativeElement;
      this.editor = monaco.editor.create(container, {
        value: this.config(),
        language: 'json',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 12,
        lineNumbers: 'on',
      });

      // Listen for value changes
      this.editor.onDidChangeModelContent(() => {
        const currentVal = this.editor.getValue();
        const changedNow = this.lastValidConfig() !== currentVal;
        if (this.changed() !== changedNow) {
          this.changed.set(changedNow);
        }
      });
    }).catch(err => {
      console.error('Failed to initialize Monaco config editor:', err);
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
    this.editor.setValue(this.defaultConfig());
  }

  undoChanges() {
    if (!this.editor) return;
    this.tmpConfigString = this.editor.getValue();
    this.editor.setValue(this.lastValidConfig());
    delete this.configError;
  }

  redoChanges() {
    if (!this.editor || !this.tmpConfigString) return;
    this.editor.setValue(this.tmpConfigString);
    delete this.tmpConfigString;
  }

  makeConfigUpdate(): ConfigUpdate<{}> {
    if (!this.editor) {
      return {
        kind: ConfigUpdateKind.Error,
        json: '{}',
        error: 'Editor not initialized.',
        close: false,
      };
    }

    let parsedConfig: {};
    const configString = this.editor.getValue();
    try {
      parsedConfig = json5.parse(configString);
      this.lastValidConfig.set(configString);
      this.changed.set(false);

      return {
        kind: ConfigUpdateKind.UpdatedValue,
        obj: parsedConfig,
        json: configString,
        close: false,
      };
    } catch (e) {
      return {
        kind: ConfigUpdateKind.Error,
        json: configString,
        error: (e as Error).message,
        close: false,
      };
    }
  }

  emitConfigUpdate(configUpdate: ConfigUpdate<{}>) {
    if (configUpdate.kind === ConfigUpdateKind.Error) {
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
    if (configUpdate.kind !== ConfigUpdateKind.Error) {
      configUpdate.close = true;
    }
    this.emitConfigUpdate(configUpdate);
  }

  justClose() {
    const configUpdate: ConfigUpdate<{}> = {
      kind: ConfigUpdateKind.JustClose,
      close: true,
    };
    this.update.emit(configUpdate);
  }
}
