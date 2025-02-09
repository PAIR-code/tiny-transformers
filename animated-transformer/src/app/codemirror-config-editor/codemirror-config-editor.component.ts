/* Copyright 2023 Google LLC. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

import {
  Component,
  OnInit,
  AfterContentInit,
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
import * as codemirror from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { json as jsonlang } from '@codemirror/lang-json';

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
  selector: 'app-codemirror-config-editor',
  templateUrl: './codemirror-config-editor.component.html',
  styleUrls: ['./codemirror-config-editor.component.scss'],
  imports: [MatButtonModule, CommonModule, MatIconModule, MatMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodemirrorConfigEditorComponent implements OnInit, AfterContentInit {
  readonly whatIsBeingEditedName = input<string>('{}');
  readonly defaultConfig = input<string>('{}');
  readonly showTitle = input<boolean>(false);
  readonly closable = input<boolean>(true);
  readonly config = input.required<string>();

  lastValidConfig = signal<string>('{}');
  isDefault: Signal<boolean> = signal(true);

  readonly update = output<ConfigUpdate<any>>();

  tmpConfigString?: string;

  readonly codemirrorElementRef = viewChild.required<ElementRef>('codemirror');

  codemirrorOptions: {};

  codeMirror: EditorView | undefined;
  editorState?: EditorState;
  // codemirror.EditorFromTextArea | undefined;

  configError?: string;

  // changed$: BehaviorSubject<boolean>;
  changed: WritableSignal<boolean> = signal(false);

  constructor() {
    this.codemirrorOptions = {
      lineNumbers: true,
      theme: 'material',
      mode: 'javascript',
      // viewportMargin: 100
    };

    this.isDefault = computed(() => {
      if (!this.codeMirror) {
        // Note: we have to return a value consistent with what we have once we
        // setup this.codeMirror.
        return this.defaultConfig() === this.lastValidConfig();
      }
      return this.defaultConfig() === this.getCodeMirrorValue();
    });

    effect(() => this.setCodeMirrorValue(this.config()));
  }

  getCodeMirrorValue(): string {
    if (!this.codeMirror) {
      return '{}';
    }
    // this.editorState.sliceDoc
    return this.codeMirror?.state.doc.toString();
    // return this.editorState.doc.toString();
    // sliceDoc();
  }

  setCodeMirrorValue(s: string): void {
    if (!this.codeMirror) {
      this.lastValidConfig.set(s);
      return;
    }

    const transaction = this.codeMirror.state.update({
      changes: {
        from: 0,
        to: this.codeMirror.state.doc.length,
        insert: s,
      },
    });

    this.codeMirror.dispatch(transaction);
  }

  ngOnInit() {
    const language = new Compartment();
    // console.log('this.editorState.create...');
    this.editorState = EditorState.create({
      doc: this.lastValidConfig(),
      extensions: [
        codemirror.basicSetup,
        language.of(jsonlang()),
        EditorView.updateListener.of((updateEvent) => {
          // Unclear if this ngZone is needed...
          // this.ngZone.run(() => {
          let changedNow = this.lastValidConfig() !== updateEvent.state.doc.toString();
          if (this.changed() !== changedNow) {
            this.changed.set(changedNow);
          }
          // });
        }),
      ],
    });
  }

  ngAfterContentInit() {}

  ngAfterViewInit() {
    const codemirrorElementRef = this.codemirrorElementRef();
    if (!codemirrorElementRef) {
      console.warn('ngAfterContentInit: missing codemirror element.');
      return;
    }
    this.codeMirror = new EditorView({
      state: this.editorState,
      parent: codemirrorElementRef.nativeElement,
    });
    this.setCodeMirrorValue(this.config());
  }

  resetConfig() {
    if (!this.codeMirror) {
      console.warn('Missing codeMirror object.');
      return;
    }
    this.tmpConfigString = this.getCodeMirrorValue();
    this.setCodeMirrorValue(this.defaultConfig().slice());
  }

  undoChanges() {
    if (!this.codeMirror) {
      console.warn('Missing codeMirror object.');
      return;
    }
    this.tmpConfigString = this.getCodeMirrorValue();
    this.setCodeMirrorValue(this.lastValidConfig().slice());
    delete this.configError;
  }

  public get canReDoChanges() {
    if (!this.codeMirror) {
      console.warn('Missing codeMirror object.');
      return false;
    }
    if (!this.tmpConfigString) {
      return false;
    }
    if (this.changed()) {
      return false;
    }
    return this.tmpConfigString != this.getCodeMirrorValue();
  }

  redoChanges() {
    if (!this.codeMirror) {
      console.warn('Missing codeMirror object.');
      return;
    }

    // this.tmpConfigString = this.lastValidConfig.slice();
    if (this.tmpConfigString) {
      this.setCodeMirrorValue(this.tmpConfigString);
    }
    delete this.tmpConfigString;
    // this.changed = false;
  }

  makeConfigUpdate(): ConfigUpdate<{}> {
    if (!this.codeMirror) {
      console.warn('Missing codeMirror object.');
      return {
        kind: ConfigUpdateKind.Error,
        json: '{}',
        error: 'Missing codeMirror object.',
        close: false,
      };
    }

    let parsedConfig: {};
    const configString = this.getCodeMirrorValue();
    try {
      parsedConfig = json5.parse(configString);
      // This line must be after the parse; if there's an error, we don't want
      // update the last valid config.
      this.lastValidConfig.set(configString.slice());

      // Set for next time...
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
