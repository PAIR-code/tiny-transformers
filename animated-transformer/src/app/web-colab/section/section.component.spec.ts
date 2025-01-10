import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SectionComponent } from './section.component';
import { Experiment } from 'src/lib/weblab/experiment';
import { LabEnv } from 'src/lib/distr-signal-exec/lab-env';
import { SignalSpace } from 'src/lib/signalspace/signalspace';
import { MarkdownModule } from 'ngx-markdown';
import { provideExperimentalZonelessChangeDetection } from '@angular/core';
import { makeToyExperiment } from 'src/lib/weblab/toy-experiment';

describe('SectionComponent', () => {
  let component: SectionComponent;
  let fixture: ComponentFixture<SectionComponent>;

  beforeEach(async () => {
    const space = new SignalSpace();
    const env = new LabEnv(space);
    const exp = makeToyExperiment('toy experiment id', env);

    await TestBed.configureTestingModule({
      providers: [provideExperimentalZonelessChangeDetection()],
      imports: [MarkdownModule.forRoot(), SectionComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SectionComponent);
    fixture.componentRef.setInput('edited', false);
    fixture.componentRef.setInput('experiment', exp);
    fixture.componentRef.setInput('section', exp.sections()[0]);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
