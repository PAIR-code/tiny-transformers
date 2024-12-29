import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CellSectionComponent } from './cell-section.component';
import { provideExperimentalZonelessChangeDetection } from '@angular/core';
import { ExpDefKind, Experiment } from 'src/lib/weblab/experiment';
import { LabEnv } from 'src/lib/distr-signal-exec/lab-env';
import { SignalSpace } from 'src/lib/signalspace/signalspace';
import {
  CellRefKind,
  CellSectionData,
  ExpSectionDataDef,
  SectionDef,
  SectionKind,
} from 'src/lib/weblab/section';

describe('CellSectionComponent', () => {
  let component: CellSectionComponent;
  let fixture: ComponentFixture<CellSectionComponent>;

  beforeEach(async () => {
    const space = new SignalSpace();
    const lab = new LabEnv(space);
    const exp1Data: ExpSectionDataDef = {
      kind: ExpDefKind.Data,
      id: 'toy experiment name 1',
      timestamp: Date.now(),
      sectionData: {
        sectionKind: SectionKind.SubExperiment,
        content: [],
      },
    };
    // const code = "console.log('Hello from web worker!')";
    const code = '1 + 1;';
    const blob = new Blob([code], { type: 'application/javascript' });
    const section1: SectionDef = {
      kind: ExpDefKind.Data,
      id: 'section 1',
      timestamp: Date.now(),
      sectionData: {
        sectionKind: SectionKind.Cell,
        content: {
          cellRef: {
            kind: CellRefKind.Url,
            url: URL.createObjectURL(blob),
          },
          inputs: {},
          outputIds: [],
          inStreams: {},
          outStreamIds: [],
        },
      },
    };
    const experiment = new Experiment(lab, [], exp1Data);
    experiment.appendLeafSectionFromDataDef(section1);
    const section = [...experiment.sectionMap.values()][0];

    const cellSectionData: CellSectionData = section1.sectionData as CellSectionData;

    await TestBed.configureTestingModule({
      providers: [provideExperimentalZonelessChangeDetection()],
      imports: [CellSectionComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CellSectionComponent);
    fixture.componentRef.setInput('cellData', cellSectionData);
    fixture.componentRef.setInput('experiment', experiment);
    fixture.componentRef.setInput('section', section);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
