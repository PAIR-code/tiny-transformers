import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExampleTableComponent } from './example-table.component';
import { provideExperimentalZonelessChangeDetection } from '@angular/core';
import { SignalSpace } from 'src/lib/signalspace/signalspace';
import { LabEnv } from 'src/lib/distr-signals/lab-env';
import { SecDefKind, SecDefOfSecList, SecDefOfUiView, ViewerKind } from 'src/lib/weblab/section';
import { Experiment } from 'src/lib/weblab/experiment';
import { InMemoryDataResolver } from 'src/lib/data-resolver/data-resolver';

describe('ExampleTableComponent', () => {
  let component: ExampleTableComponent;
  let fixture: ComponentFixture<ExampleTableComponent>;

  beforeEach(async () => {
    const space = new SignalSpace();
    const lab = new LabEnv(space);
    const exp1Data: SecDefOfSecList = {
      kind: SecDefKind.SectionList,
      id: 'toy experiment name 1',
      timestamp: Date.now(),
      subsections: [],
      display: { collapsed: false },
    };
    const experiment = new Experiment(
      lab,
      [],
      exp1Data,
      new InMemoryDataResolver(),
      new InMemoryDataResolver(),
    );
    const section1: SecDefOfUiView = {
      kind: SecDefKind.UiCell,
      id: 'section Examples',
      display: { collapsed: false },
      io: {
        inputs: {},
        outputs: {
          someExamples: {
            lastValue: [],
            saved: true,
          },
        },
        inStreams: {},
        outStreamIds: [],
      },
      timestamp: Date.now(),
      uiView: ViewerKind.ExampleTableView,
    };
    // const code = "console.log('Hello from web worker!')";
    const section2: SecDefOfUiView = {
      kind: SecDefKind.UiCell,
      id: 'section TableView',
      display: { collapsed: false },
      io: {
        inputs: {
          examples: [
            {
              sectionId: section1.id,
              outputId: 'someExamples',
            },
          ],
        },
        outputs: {},
        inStreams: {},
        outStreamIds: [],
      },
      timestamp: Date.now(),
      uiView: ViewerKind.ExampleTableView,
    };
    await experiment.appendLeafSectionFromDataDef(section1);
    await experiment.appendLeafSectionFromDataDef(section2);
    const section = [...experiment.sectionMap.values()][1];

    await TestBed.configureTestingModule({
      providers: [provideExperimentalZonelessChangeDetection()],
      imports: [ExampleTableComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ExampleTableComponent);
    fixture.componentRef.setInput('section', section);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
