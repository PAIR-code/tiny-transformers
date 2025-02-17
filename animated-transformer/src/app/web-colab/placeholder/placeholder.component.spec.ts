import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlaceholderComponent } from './placeholder.component';
import { provideExperimentalZonelessChangeDetection } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { SignalSpace } from 'src/lib/signalspace/signalspace';
import { LabEnv } from 'src/lib/distr-signals/lab-env';
import { SecDefKind, SecDefOfPlaceholder, SecDefOfSecList } from 'src/lib/weblab/section';
import { Experiment } from 'src/lib/weblab/experiment';
import { InMemoryDataResolver } from 'src/lib/data-resolver/data-resolver';

describe('PlaceholderComponent', () => {
  let component: PlaceholderComponent;
  let fixture: ComponentFixture<PlaceholderComponent>;

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
    const section1: SecDefOfPlaceholder = {
      kind: SecDefKind.Placeholder,
      id: 'section 1',
      display: { collapsed: false },
    };
    await experiment.appendLeafSectionFromDataDef(section1);
    const section = [...experiment.sectionMap.values()][0];

    await TestBed.configureTestingModule({
      providers: [provideExperimentalZonelessChangeDetection(), provideNoopAnimations()],
      imports: [PlaceholderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PlaceholderComponent);
    fixture.componentRef.setInput('section', section);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
