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
/*
TODO: Once angular supports it, we should activate the current item, and we
should de-activate when it's not longer selected.

TODO: consider just using mat-menu, it's unclear if auto-complete is actually
making things harder to easier.
*/

import { Component, Input, Output, EventEmitter, OnInit, ViewChild, OnDestroy, ComponentRef, signal, Injector, effect, Signal, WritableSignal, computed, untracked, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatAutocomplete, MatAutocompleteModule } from '@angular/material/autocomplete';
// import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { AbstractControl, FormControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-auto-completed-text-input',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule,
    MatAutocompleteModule, MatInputModule],
  templateUrl: './auto-completed-text-input.component.html',
  styleUrl: './auto-completed-text-input.component.scss'
})
export class AutoCompletedTextInputComponent {
  itemSelectorControl = new FormControl<string>('');
  itemNamesList = signal([] as string[]);
  filteredNames: Signal<string[]>;
  suggestedNames: Signal<string[]>;
  exactMatchName: Signal<string | null>;
  lastEmittedValue: string | null = null;

  @Input() label?: string;

  @Input()
  set selectedName(n: string | null) {
    if (this.itemSelectorControl.value !== n) {
      this.itemSelectorControl.setValue(n || '');
    }
  }

  @Input()
  set itemNames(ns: string[]) {
    this.itemNamesList.set(ns);
  }

  @Output() itemSelected = new EventEmitter<string | null>();

  constructor() {
    const datasetNameSignal = toSignal(this.itemSelectorControl.valueChanges);

    this.filteredNames = computed(() => {
      const name = datasetNameSignal();
      if (!name) { return this.itemNamesList(); }
      const filterStringLc = name.toLowerCase();
      return this.itemNamesList().filter(
        n => n.toLocaleLowerCase().includes(filterStringLc));;
    });

    this.exactMatchName = computed(() => {
      const name = datasetNameSignal();
      const names = this.filteredNames();
      return names.filter(n => n === name).length > 0 ? name || null : null;
    });

    // If there is one option only, and that is the current selected item,
    // show all possible items
    this.suggestedNames = computed(() =>
      this.exactMatchName() ? this.itemNamesList() : this.filteredNames());

    effect(() => {
      if (this.exactMatchName()) {
        this.maybeEmit(this.exactMatchName());
      } else {
        this.maybeEmit(null);
      }
    }, { allowSignalWrites: true });
  }

  // Avoid emitting the same thing twice.
  maybeEmit(value: string | null) {
    if (value !== this.lastEmittedValue) {
      this.lastEmittedValue = value;
      this.itemSelected.emit(value);
      // TODO: activate the appropriate option in the auto-complete menu.
    }
  }
}
