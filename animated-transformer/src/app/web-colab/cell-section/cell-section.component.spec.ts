import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CellSectionComponent } from './cell-section.component';
import { provideExperimentalZonelessChangeDetection } from '@angular/core';
import { Experiment } from 'src/lib/weblab/experiment';
import { LabEnv } from 'src/lib/distr-signals/lab-env';
import { SignalSpace } from 'src/lib/signalspace/signalspace';
import {
  CellCodeRefKind,
  SecDefKind,
  SecDefOfExperiment,
  SecDefOfWorker,
} from 'src/lib/weblab/section';

describe('CellSectionComponent', () => {
  let component: CellSectionComponent;
  let fixture: ComponentFixture<CellSectionComponent>;

  beforeEach(async () => {
    const space = new SignalSpace();
    const lab = new LabEnv(space);
    const exp1Data: SecDefOfExperiment = {
      kind: SecDefKind.Experiment,
      id: 'toy experiment name 1',
      timestamp: Date.now(),
      subsections: [],
    };
    // const code = "console.log('Hello from web worker!')";
    const section1: SecDefOfWorker = {
      kind: SecDefKind.WorkerCell,
      id: 'section 1',
      timestamp: Date.now(),
      cellCodeRef: {
        kind: CellCodeRefKind.InlineWorkerJsCode,
        js: '1 + 1;',
      },
      io: {},
    };
    const experiment = new Experiment(lab, [], exp1Data, new Map());
    experiment.appendLeafSectionFromDataDef(section1);
    const section = [...experiment.sectionMap.values()][0];

    await TestBed.configureTestingModule({
      providers: [provideExperimentalZonelessChangeDetection()],
      imports: [CellSectionComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CellSectionComponent);
    fixture.componentRef.setInput('section', section);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
