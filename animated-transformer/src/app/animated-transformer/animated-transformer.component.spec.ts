import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AnimatedTransformerComponent } from './animated-transformer.component';
import { TinyModelsService } from '../tiny-models.service';
import { provideRouter } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';

describe('AnimatedTransformerComponent', () => {
  let component: AnimatedTransformerComponent;
  let fixture: ComponentFixture<AnimatedTransformerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        TinyModelsService,
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
