import { Component, Input, Output, EventEmitter, OnInit, ViewChild, OnDestroy, ComponentRef, signal, Injector, effect, Signal, WritableSignal, computed, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
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
  lastEmittedValue: string | null = null;

  @Input() label?: string;

  @Input()
  set selectedName(n: string | null) {
    if (n && this.itemSelectorControl.value !== n) {
      this.itemSelectorControl.setValue(n);
    }
  }

  @Input()
  set itemNames(ns: string[]) {
    this.itemNamesList.set(ns.map(n => n.toLocaleLowerCase()));
  }

  @Output() itemSelected = new EventEmitter<string | null>();

  constructor() {
    const datasetNameSignal = toSignal(this.itemSelectorControl.valueChanges);

    this.filteredNames = computed(() => {
      const name = datasetNameSignal();
      if (!name) { return this.itemNamesList(); }
      const filterStringLc = name.toLowerCase();
      return this.itemNamesList().filter(
        maybeMatchedName => maybeMatchedName.includes(filterStringLc));
    });

    effect(() => {
      const ds = this.filteredNames();
      if (ds.length !== 1) { return this.maybeEmit(null); }
      this.maybeEmit(ds[0]);
    }, { allowSignalWrites: true });
  }

  // Avoid emitting the same thing twice.
  maybeEmit(value: string | null) {
    if (value !== this.lastEmittedValue) {
      this.lastEmittedValue = value;
      this.itemSelected.emit(value);
    }
  }
}
