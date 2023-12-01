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


import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges, signal, WritableSignal, Signal, computed } from '@angular/core';
import * as json5 from 'json5';
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

const inittaskSet: TaskMetadata[] = [
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
const initTaskMap = {} as { [name: string]: TaskMetadata };
inittaskSet.forEach(t => initTaskMap[t.config.name] = t);


// ----------------------------------------------------------------------------
@Component({
  selector: 'app-seq-task-selector',
  templateUrl: './seq-task-selector.component.html',
  styleUrls: ['./seq-task-selector.component.scss']
})
export class SeqTaskSelectorComponent {
  // Cached value or the current task name. e.g. updated by url changes.
  @Input()
  set taskName(maybeName: string | null) {
    this.selectTask(maybeName);
  }

  // When this component changes the task... (even if the name has not changed)
  @Output() taskUpdates = new EventEmitter<BasicLmTaskUpdate>();

  view: 'edit' | 'view' = 'view';

  showExamples = false;
  shownNumOfExamples = 6;
  repSize = 8;

  taskMap: WritableSignal<{ [name: string]: TaskMetadata }> =
    signal(initTaskMap);
  taskNames: Signal<string[]>;

  currentTask: WritableSignal<TaskMetadata | null> = signal(null);
  currentTaskName: Signal<string | null>;
  selectedTaskExamples!: Signal<Example[] | null>;
  datasetColumns: string[] = ['input', 'target'];

  constructor() {
    this.taskNames = computed(() => Object.keys(this.taskMap()));
    this.selectedTaskExamples = computed(() => {
      const taskMetadata = this.currentTask();
      if (!taskMetadata) { return null };
      return [...takeNextN(
        taskMetadata.task.makeExamplesGenerator(),
        this.shownNumOfExamples)];
    });
    this.currentTaskName = computed(() => {
      const taskMetadata = this.currentTask();
      if (!taskMetadata) { return null; }
      return taskMetadata.config.name;
    });
  }

  selectTask(maybeName: string | null): void {
    const oldTask = this.currentTask();
    const taskMap = this.taskMap();
    if (!maybeName || !(maybeName in taskMap)) {
      if (oldTask) {
        this.currentTask.set(null);
        this.taskUpdates.emit({});
      }
      return;
    }
    const newTaskMetadata = taskMap[maybeName];
    if (oldTask && newTaskMetadata.config.name === oldTask.config.name) {
      return;
    }
    this.currentTask.set(newTaskMetadata);
    this.taskUpdates.emit({ task: newTaskMetadata.task });
  }

  taskConfigUpdated(configUpdate: ConfigUpdate<BasicLmTaskConfig>): void {
    // When configUpdate has a new object, we assume it to be correct.
    //
    // TODO: provide some runtime value type checking. Right now all that is
    // needed is valid JSON/JSON5, but if you provide valid JSON missing needed
    // values (e.g. encoderConfig is null), it should complain here, but
    // currently does not.
    if (configUpdate.close) {
      this.view = 'view';
    }

    if (configUpdate.error || !configUpdate.obj || !configUpdate.json) {
      // console.log(`configUpdated with no update: ${configUpdate}`);
      return;
    }

    const task = this.currentTask();
    if (!task) {
      console.error(`had null task for configUpdated: ${configUpdate}`);
      return;
    }

    if (task.config.name !== configUpdate.obj.name) {
      const newTaskMap = { ...this.taskMap() };
      delete newTaskMap[task.config.name];
      const updatedTask = new TaskMetadata(task.task);
      updatedTask.updateFromStr(configUpdate.json);
      newTaskMap[updatedTask.config.name] = updatedTask;
      this.taskMap.set(newTaskMap);
      this.currentTask.set(updatedTask);
    }
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
}
