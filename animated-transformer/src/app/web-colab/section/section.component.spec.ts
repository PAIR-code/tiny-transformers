import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SectionComponent } from './section.component';
import { ExpDefKind, Experiment } from 'src/lib/weblab/experiment';
import { LabEnv } from 'src/lib/distr-signal-exec/lab-env';
import { SignalSpace } from 'src/lib/signalspace/signalspace';
import { ExpSectionDataDef, SectionDef, SectionKind } from 'src/lib/weblab/section';
import { MarkdownModule } from 'ngx-markdown';
import { provideExperimentalZonelessChangeDetection } from '@angular/core';

describe('SectionComponent', () => {
  let component: SectionComponent;
  let fixture: ComponentFixture<SectionComponent>;

  beforeEach(async () => {
    const space = new SignalSpace();
    const lab = new LabEnv(space);
    const exp1Data: ExpSectionDataDef = {
      kind: ExpDefKind.Data,
      id: 'toy experiment name 1',
      timestamp: Date.now(),
      data: {
        sectionKind: SectionKind.SubExperiment,
        content: [],
      },
    };
    const section1: SectionDef = {
      kind: ExpDefKind.Data,
      id: 'section 1',
      timestamp: Date.now(),
      data: {
        sectionKind: SectionKind.Markdown,
        content: '# Section 1! \nThis is the start.',
      },
    };
    const experiment = new Experiment(lab, [], exp1Data);
    experiment.appendLeafSectionFromDataDef(section1);
    const section = [...experiment.sectionMap.values()][0];

    await TestBed.configureTestingModule({
      providers: [provideExperimentalZonelessChangeDetection()],
      imports: [MarkdownModule.forRoot(), SectionComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SectionComponent);
    fixture.componentRef.setInput('edited', false);
    fixture.componentRef.setInput('experiment', experiment);
    fixture.componentRef.setInput('section', section);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
