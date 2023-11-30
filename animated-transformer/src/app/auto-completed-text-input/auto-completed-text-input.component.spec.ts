import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AutoCompletedTextInputComponent } from './auto-completed-text-input.component';

describe('AutoCompletedTextInputComponent', () => {
  let component: AutoCompletedTextInputComponent;
  let fixture: ComponentFixture<AutoCompletedTextInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AutoCompletedTextInputComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(AutoCompletedTextInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
