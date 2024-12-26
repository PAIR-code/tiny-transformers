import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CellSectionComponent } from './cell-section.component';

describe('CellSectionComponent', () => {
  let component: CellSectionComponent;
  let fixture: ComponentFixture<CellSectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CellSectionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CellSectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
