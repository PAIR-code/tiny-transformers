import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SimpleChartComponent } from './simple-chart.component';
import { provideExperimentalZonelessChangeDetection } from '@angular/core';
import { SecDefKind, SecDefOfSecList, SecDefOfUiView, ViewerKind } from 'src/lib/weblab/section';
import { InMemoryDataResolver } from 'src/lib/data-resolver/data-resolver';
import { Experiment } from 'src/lib/weblab/experiment';
import { SignalSpace } from 'src/lib/signalspace/signalspace';
import { LabEnv } from 'src/lib/distr-signals/lab-env';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('SimpleChartComponent', () => {
  let component: SimpleChartComponent;
  let fixture: ComponentFixture<SimpleChartComponent>;

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
    // const code = "console.log('Hello from web worker!')";
    const sectionOutStream: SecDefOfUiView = {
      kind: SecDefKind.UiCell,
      id: 'streamOutput',
      display: { collapsed: false },
      io: {
        inputs: {},
        outputs: {},
        inStreams: {},
        outStreamIds: ['fooMetrics'],
      },
      timestamp: Date.now(),
      uiView: ViewerKind.SimpleChartView,
    };
    // const code = "console.log('Hello from web worker!')";
    const section1: SecDefOfUiView = {
      kind: SecDefKind.UiCell,
      id: 'section 1',
      display: { collapsed: false },
      io: {
        inputs: {},
        outputs: {},
        inStreams: {
          metrics: [
            {
              sectionId: sectionOutStream.id,
              outStreamId: 'fooMetrics',
            },
          ],
        },
        outStreamIds: [],
      },
      timestamp: Date.now(),
      uiView: ViewerKind.SimpleChartView,
    };
    await experiment.appendLeafSectionFromDataDef(sectionOutStream);
    await experiment.appendLeafSectionFromDataDef(section1);
    const section = [...experiment.sectionMap.values()][1];

    await TestBed.configureTestingModule({
      providers: [
        provideExperimentalZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
      imports: [SimpleChartComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SimpleChartComponent);
    fixture.componentRef.setInput('section', section);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
