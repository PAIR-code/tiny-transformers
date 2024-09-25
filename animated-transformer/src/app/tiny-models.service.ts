import { Injectable } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ConfigKind } from 'src/lib/json/config-obj';
import { tinyWorldTaskKind } from 'src/lib/seqtasks/tiny_worlds';
import { BasicRandLmTask, RandLmTaskConfig } from 'src/lib/seqtasks/util';
import {
  TransformerConfig,
  TransformerModel,
  transformerModelKind,
} from 'src/lib/transformer/transformer_gtensor';
import { SignalSpace, SetableSignal, derived, DerivedSignal } from 'src/lib/weblab/signalspace';
import { EnvModel } from './web-colab/tiny-transformer-example/ailab';

const modelMakerMap = {} as { [kind: string]: ConfigKind<TransformerConfig, TransformerModel> };
const initModelConfigsMap = {} as { [name: string]: TransformerConfig };
{
  const initModelKinds = [transformerModelKind];
  initModelKinds.forEach((k) => k.makeFn(k.defaultConfigStr));
  const aConfiguredModel = modelMakerMap[transformerModelKind.kind].makeFn(
    transformerModelKind.defaultConfigStr
  );
  initModelConfigsMap[aConfiguredModel.config.name] = aConfiguredModel.config;
}

const taskMakerMap = {} as { [kind: string]: ConfigKind<RandLmTaskConfig, BasicRandLmTask> };
const initTaskConfigMap = {} as { [name: string]: RandLmTaskConfig };
{
  const initTaskKinds = [tinyWorldTaskKind];
  initTaskKinds.forEach((k) => k.makeFn(k.defaultConfigStr));
  const aConfiguredTask = taskMakerMap[tinyWorldTaskKind.kind].makeFn(
    tinyWorldTaskKind.defaultConfigStr
  );
  initTaskConfigMap[aConfiguredTask.config.name] = aConfiguredTask.config;
}

@Injectable({
  providedIn: 'root',
})
export class TinyModelsService {
  space: SignalSpace;

  // Tasks...
  taskConfigsMap: { [name: string]: RandLmTaskConfig } = initTaskConfigMap;
  taskConfig: SetableSignal<RandLmTaskConfig | null>;
  get taskName(): string {
    const config = this.taskConfig();
    return config ? config.name : '';
  }
  get taskConfigDefaultStr(): string {
    if (this.taskName === '') {
      return '<undefined>';
    }
    return taskMakerMap[this.taskName].defaultConfigStr;
  }

  // Models...
  modelConfigsMap: { [name: string]: TransformerConfig } = initModelConfigsMap;
  modelConfig: SetableSignal<TransformerConfig | null>;
  get modelName(): string {
    const config = this.modelConfig();
    return config ? config.name : '';
  }
  get modelConfigDefaultStr(): string {
    if (this.modelName === '') {
      return '<undefined>';
    }
    return modelMakerMap[this.modelName].defaultConfigStr;
  }
  model: DerivedSignal<EnvModel | null>;

  constructor(private route: ActivatedRoute, private router: Router) {
    this.route.queryParams.subscribe((params) => {
      this.selectModel(params['model'] || '');
      this.selectTask(params['task'] || '');
      // this.trainerName = params['trainer'] || '';
      // this.evalInputStr = params['input'] || '';
    });

    this.space = new SignalSpace();
    const { nullDerived, defined, setable } = this.space;
    const taskName = Object.keys(this.taskConfigsMap)[0];
    this.taskConfig = setable<RandLmTaskConfig | null>(this.taskConfigsMap[taskName]);
    const modelName = Object.keys(this.modelConfigsMap)[0];
    this.modelConfig = setable<TransformerConfig | null>(this.modelConfigsMap[modelName]);
    // TODO: maybe store modelConfigStr as the source artefact.

    this.model = nullDerived<EnvModel>(() => {
      // TODO: init params... load them?
      return { config: defined(this.modelConfig) };
    });
  }

  selectTask(taskName: string | null) {
    if (taskName === this.taskName) {
      return;
    }

    if (!taskName || !(taskName in this.taskConfigsMap)) {
      this.taskConfig.set(null);
      return;
    }
    this.taskConfig.set(this.taskConfigsMap[taskName]);

    const queryParams = { task: taskName };
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      // remove to replace all query params by provided
      queryParamsHandling: 'merge',
    });
  }

  selectModel(modelName: string | null) {
    if (modelName === this.modelName) {
      return;
    }

    if (!modelName || !(modelName in this.modelConfigsMap)) {
      this.modelConfig.set(null);
      return;
    }
    this.modelConfig.set(this.modelConfigsMap[modelName]);

    const queryParams = { model: modelName };
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      // remove to replace all query params by provided
      queryParamsHandling: 'merge',
    });
  }

  updateTaskConfig(config: RandLmTaskConfig) {
    console.log('to implement');
  }

  updateModelConfig(config: TransformerConfig) {
    console.log('to implement');
  }

  initModelParams() {}
}
