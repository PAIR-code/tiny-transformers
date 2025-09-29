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

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import json5 from 'json5';
import * as codemirror from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { javascript as jslang } from '@codemirror/lang-javascript';

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
  selector: 'app-codemirror-js-editor',
  templateUrl: './codemirror-js-editor.component.html',
  styleUrls: ['./codemirror-js-editor.component.scss'],
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodemirrorJavaScriptEditorComponent implements OnInit, AfterContentInit {
  readonly whatIsBeingEditedName = input<string>('');
  readonly defaultStr = input<string>('');
  readonly codeStr = input<string>('');
  readonly closable = input<boolean>(true);

  lastValidStr = signal<string>('');

  isDefault: Signal<boolean> = signal(true);

  readonly update = output<CodeStrUpdate>();

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
        return this.defaultStr() === this.lastValidStr();
      }
      return this.defaultStr() === this.getCodeMirrorValue();
    });

    effect(() => {
      this.setCodeMirrorValue(this.codeStr());
    });
  }

  getCodeMirrorValue(): string {
    if (!this.codeMirror) {
      return '';
    }
    // this.editorState.sliceDoc
    return this.codeMirror?.state.doc.toString();
    // return this.editorState.doc.toString();
    // sliceDoc();
  }

  setCodeMirrorValue(s: string): void {
    if (!this.codeMirror) {
      this.lastValidStr.set(s);
      return;
    }
    if (s === this.getCodeMirrorValue()) {
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
      doc: this.lastValidStr(),
      extensions: [
        codemirror.basicSetup,
        language.of(jslang()),
        EditorView.updateListener.of((updateEvent) => {
          // Unclear if this ngZone is needed...
          // this.ngZone.run(() => {
          let changedNow = this.lastValidStr() !== updateEvent.state.doc.toString();
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
    this.setCodeMirrorValue(this.codeStr());
  }

  resetConfig() {
    if (!this.codeMirror) {
      console.warn('Missing codeMirror object.');
      return;
    }
    this.tmpConfigString = this.getCodeMirrorValue();
    this.setCodeMirrorValue(this.defaultStr());
  }

  undoChanges() {
    if (!this.codeMirror) {
      console.warn('Missing codeMirror object.');
      return;
    }
    this.tmpConfigString = this.getCodeMirrorValue();
    this.setCodeMirrorValue(this.lastValidStr());
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
    return this.tmpConfigString !== this.getCodeMirrorValue();
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

  makeConfigUpdate(): CodeStrUpdate {
    if (!this.codeMirror) {
      console.warn('Missing codeMirror object.');
      return {
        kind: CodeStrUpdateKind.Error,
        str: '',
        error: 'Missing codeMirror object.',
        close: false,
      };
    }
    const codeString = this.getCodeMirrorValue();
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
