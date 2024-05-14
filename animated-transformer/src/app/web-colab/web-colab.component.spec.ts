import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WebColabComponent } from './web-colab.component';

describe('WebColabComponent', () => {
  let component: WebColabComponent;
  let fixture: ComponentFixture<WebColabComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WebColabComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(WebColabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
