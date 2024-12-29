import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AnimatedTransformerComponent } from './animated-transformer.component';
import { TinyModelsService } from '../tiny-models.service';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { provideExperimentalZonelessChangeDetection } from '@angular/core';

describe('AnimatedTransformerComponent', () => {
  let component: AnimatedTransformerComponent;
  let fixture: ComponentFixture<AnimatedTransformerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideExperimentalZonelessChangeDetection(),
        TinyModelsService,
        provideNoopAnimations(),
        provideRouter([]),
      ],
      imports: [AnimatedTransformerComponent],
      declarations: [],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(AnimatedTransformerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
