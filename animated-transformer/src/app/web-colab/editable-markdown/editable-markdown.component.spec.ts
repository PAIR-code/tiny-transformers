import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditableMarkdownComponent } from './editable-markdown.component';
import { provideExperimentalZonelessChangeDetection } from '@angular/core';

describe('EditableMarkdownComponent', () => {
  let component: EditableMarkdownComponent;
  let fixture: ComponentFixture<EditableMarkdownComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideExperimentalZonelessChangeDetection()],
      imports: [EditableMarkdownComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(EditableMarkdownComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
