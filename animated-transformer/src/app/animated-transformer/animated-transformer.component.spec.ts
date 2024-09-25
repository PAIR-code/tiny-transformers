import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AnimatedTransformerComponent } from './animated-transformer.component';
import { SeqTaskSelectorComponent } from './seq-task-selector/seq-task-selector.component';

import { CommonModule } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { ModelSelectorComponent } from './model-selector/model-selector.component';
import { TinyModelsService } from '../tiny-models.service';

describe('AnimatedTransformerComponent', () => {
  let component: AnimatedTransformerComponent;
  let fixture: ComponentFixture<AnimatedTransformerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [TinyModelsService],
      imports: [
        CommonModule,
        BrowserAnimationsModule,
        FormsModule,
        ReactiveFormsModule,
        // ---
        MatButtonModule,
        MatIconModule,
        MatInputModule,
        MatMenuModule,
        MatListModule,
        MatAutocompleteModule,
        MatTableModule,
        MatCardModule,
        // ---
      ],
      declarations: [
        AnimatedTransformerComponent,
        SeqTaskSelectorComponent,
        ModelSelectorComponent,
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(AnimatedTransformerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  xit('should create', () => {
    expect(component).toBeTruthy();
  });
});
