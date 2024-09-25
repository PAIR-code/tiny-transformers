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
import { SignalSpace, SetableSignal } from 'src/lib/weblab/signalspace';

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

  get taskName(): string {
    return this.taskConfig.name;
  }
  taskConfig: RandLmTaskConfig;
  taskConfigDefaultStr: string;
  taskConfigsMap: { [name: string]: RandLmTaskConfig };

  get modelName(): string {
    return this.modelConfig.name;
  }
  modelConfig: SetableSignal<TransformerConfig>;
  modelConfigDefaultStr: string;
  modelConfigsMap: { [name: string]: TransformerConfig };

  constructor(private route: ActivatedRoute, private router: Router) {
    this.space = new SignalSpace();
    const { nullComputable, nullme, writable } = this.space;

    this.taskConfigsMap = initTaskConfigMap;
    const taskName = Object.keys(this.taskConfigsMap)[0];
    this.taskConfig = this.taskConfigsMap[this.taskName];
    this.taskConfigDefaultStr = taskMakerMap[this.taskName].defaultConfigStr;

    this.modelConfigsMap = initModelConfigsMap;
    const modelName = Object.keys(this.modelConfigsMap)[0];
    this.modelConfig = writable<TransformerConfig | null>(this.modelConfigsMap[this.modelName]);
    // TODO: maybe store modelConfigStr as the source artefact.
    this.modelConfigDefaultStr = taskMakerMap[this.modelName].defaultConfigStr;
  }

  selectTask(taskName: string | null) {
    this.taskName = taskName || '';
  }

  selectModel(modelName: string | null) {
    this.modelName = modelName || '';
  }

  initModelParams() {}
}
