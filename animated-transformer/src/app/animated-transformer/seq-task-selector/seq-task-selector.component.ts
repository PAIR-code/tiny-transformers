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


import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import * as json5 from 'json5';
import { AbstractControl, UntypedFormControl, ValidationErrors, ValidatorFn, FormControl } from '@angular/forms';
import { firstValueFrom, Observable, of, EMPTY, OperatorFunction, combineLatest, BehaviorSubject, ReplaySubject, Subscription } from 'rxjs';
import { map, startWith, shareReplay, take, mergeMap, distinctUntilChanged, tap, skip, pairwise, distinct } from 'rxjs/operators';
import { MatTable } from '@angular/material/table';
// import { nanValidator } from '../nan-validator.directive';
import { JsonValue } from 'src/lib/pretty_json/json';
import { mapNonNull } from '../../../lib/rxjs/util';
import * as swap_task from '../../../lib/seqtasks/swap_task';
import { DecisionBoundaryTask, baseVocab as dboundaryVocab } from '../../../lib/seqtasks/decision_boundary_task';
import { stringifyJsonValue } from '../../../lib/pretty_json/pretty_json';
import { BasicLmTask, BasicLmTaskConfig, BasicLmTaskUpdate, Example, takeNextN } from 'src/lib/seqtasks/util';
import { Output, EventEmitter } from '@angular/core';
import { ConfigUpdate } from 'src/app/codemirror-config-editor/codemirror-config-editor.component';
import { SecretTokenTask } from 'src/lib/seqtasks/secret_token_task';

// ----------------------------------------------------------------------------

class TaskMetadata {
  public configStr: string;
  public defaultConfigStr: string;

  get config(): BasicLmTaskConfig {
    return this.task.config;
  }
  set config(config: BasicLmTaskConfig) {
    this.task.config = config;
  }

  constructor(public task: BasicLmTask) {
    this.configStr = stringifyJsonValue(this.task.config);
    this.defaultConfigStr = this.configStr;
  }

  updateFromStr(s: string): void {
    this.configStr = s;
    this.config = json5.parse(this.configStr);
    // this.task.reInitFromConfig();
  }
}

// ----------------------------------------------------------------------------
@Component({
  selector: 'app-seq-task-selector',
  templateUrl: './seq-task-selector.component.html',
  styleUrls: ['./seq-task-selector.component.scss']
})
export class SeqTaskSelectorComponent implements OnInit {
  // When this component changes the task... (even if the name has not changed)
  @Output() taskUpdates = new EventEmitter<BasicLmTaskUpdate>();
  view: 'edit' | 'view' = 'view';

  showExamples = false;
  taskNameControl = new FormControl<string>('');
  shownNumOfExamples = 6;
  repSize = 8;

  // @Input()
  taskSet: TaskMetadata[] = [
    new TaskMetadata(new swap_task.SwapTask({
      name: 'a swap task',
      maxInputLen: 4,
      maxOutputLen: 1,
      valuesLessThan: swap_task.baseVocab.length + 1,
      seed: 47
    })),
    new TaskMetadata(new DecisionBoundaryTask({
      name: 'a boundary task',
      maxInputLen: 5,
      maxOutputLen: 1,
      seed: 0,
    })),
    new TaskMetadata(new SecretTokenTask({
      name: 'mod secret token === 0',
      maxInputLen: 5,
      maxOutputLen: 1,
      seed: 0,
      randomTokensVocab: ['1', '2', '3', '4', '5'],
      tokenToBoolFnStr: 'return (parseInt(t) % parseInt(s) === 0)'
    }))
  ];
  tasksByName: { [name: string]: TaskMetadata } = {}

  filteredTasks$!: Observable<TaskMetadata[]>;
  // @ViewChild('datasetName', {static: false}) datasetNameInput!: Input;
  currentTask$!: BehaviorSubject<TaskMetadata | null>;

  constructor() {
    this.reCreateTaskNameIndex();
    this.currentTask$ = new BehaviorSubject<TaskMetadata | null>(null);
  }

  // Cached value or the current task name. e.g. updated by url changes.
  @Input()
  set taskName(n: string) {
    this.maybeSetTaskByName(n);
  }

  // selectedTask$!: Observable<BasicLmTask | null>;

  selectedTaskExamples$!: Observable<Example[] | null>;
  datasetColumns: string[] = ['input', 'target'];

  reCreateTaskNameIndex() {
    this.taskSet.forEach(
      t => this.tasksByName[t.config.name.toLocaleLowerCase()] = t);
  }

  ngOnInit(): void {
    this.filteredTasks$ = this.taskNameControl.valueChanges.pipe(
      tap(name => this.maybeSetTaskByName(name)),
      map(name => (name ? this._filter(name) : this.taskSet.slice())),
      startWith(this.taskSet.slice()),
      shareReplay(1));

    // When a new task is selected, update the examples.
    this.selectedTaskExamples$ = this.currentTask$.pipe(
      mapNonNull(taskMetadata =>
        [...takeNextN(taskMetadata.task.makeExamplesGenerator(),
          this.shownNumOfExamples)]), shareReplay(1));
  }

  async maybeSetTaskByName(maybeName: string | null): Promise<TaskMetadata | null> {
    const name = (maybeName || '').toLocaleLowerCase();
    const oldTask = await firstValueFrom(this.currentTask$);
    // The new name has no associated task...
    if (!(name in this.tasksByName)) {
      if (oldTask !== null) {
        this.currentTask$.next(null);
        this.taskUpdates.emit({});
      }
      return null;
    }

    // The new name has an associated task...
    const newTaskMetadata = this.tasksByName[name];
    // If new task name = old task name, return old task, no update.
    if (oldTask && newTaskMetadata.config.name === oldTask.config.name) {
      return oldTask;
    }
    // implies: (!oldTask || newTask.config.name !== oldTask.config.name)
    this.currentTask$.next(newTaskMetadata);
    this.taskUpdates.emit({ task: newTaskMetadata.task });
    this.taskNameControl.setValue(maybeName);
    return newTaskMetadata;
  }

  async taskConfigUpdated(event: unknown): Promise<void> {
    // When configUpdate has a new object, we assume it to be correct.
    //
    // TODO: provide some runtime value type checking. Right now all that is
    // needed is valid JSON/JSON5, but if you provide valid JSON missing needed
    // values (e.g. encoderConfig is null), it should complain here, but
    // currently does not.
    const configUpdate = event as ConfigUpdate<BasicLmTaskConfig>;

    if (configUpdate.close) {
      this.view = 'view';
    }

    if (configUpdate.error || !configUpdate.obj || !configUpdate.json) {
      // console.log(`configUpdated with no update: ${configUpdate}`);
      return;
    }

    const task = await firstValueFrom(this.currentTask$);
    if (!task) {
      console.error(`had null task for configUpdated: ${configUpdate}`);
      return;
    }
    task.updateFromStr(configUpdate.json);
    // Model name was changed.
    if (task.config.name !== this.taskNameControl.value) {
      if (!task.config.name) {
        task.config.name = 'model without a name'
      }
      // Because the name of the model may have changed, we need to re-create the
      // index
      this.reCreateTaskNameIndex();
      this.taskNameControl.setValue(task.config.name);
    }
    this.currentTask$.next(task);
  }

  toggleEditor() {
    this.view = this.view === 'edit' ? 'view' : 'edit';
  }

  inputToString(input: string[][]): string {
    return JSON.stringify(input);
  }
  outputToString(output: string[][]): string {
    return JSON.stringify(output);
  }

  taskConfigAsJson(config: BasicLmTaskConfig): string {
    return stringifyJsonValue(config,
      { arrWrapAt: 60, objWrapAt: 60, curIndent: '', sortObjKeys: true });
    // json5.stringify(config, null, 2);
  }

  private _filter(name: string): TaskMetadata[] {
    const filterValue = name.toLowerCase();

    const filteredTasks = this.taskSet.filter(task => {
      return task.config.name.toLowerCase().includes(filterValue)
    });

    if (filteredTasks.length <= 1
      // && filteredTasks[0].config.name.toLowerCase() === filterValue
    ) {
      return this.taskSet;
    }

    return filteredTasks;
  }

  // TODO: think about if we should remove this?
  updateSelectedTask(event: unknown): void {
  }

}
